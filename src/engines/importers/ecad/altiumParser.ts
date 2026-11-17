import {
  ComponentDef,
  PcbPlacedComponent,
  PcbProject,
  PcbTrace,
  PcbVia,
  PlacedComponent,
  Point2D,
  SchJunction,
  SchNetPort,
  SchShape,
  SchWire,
  SchematicProject
} from '../../../core/types';
import { uid } from '../../../core/geometry';
import { convertImportedPcbToGost, convertImportedSchematicToGost, GostConversionReport } from '../gostConverter';
import {
  makeChipComponentDef,
  makeComponentDef,
  makeEcadPcbProject,
  makeEcadSchematicProject,
  makePadDef,
  makePcbPlacedComp,
  makeSymbolPin,
  placeDefOnSheet,
  snapAngle90
} from './ecadFactories';
import { isOle2Binary, readOle2Streams } from './ole2Reader';

type AltiumRec = Record<string, string>;
const ALTIUM_UNIT_TO_MM = 0.254; // 1 DXP schematic unit = 10 mil = 0.254 mm

function parsePipeRecord(line: string): AltiumRec {
  const rec: AltiumRec = {};
  for (const part of line.split('|')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    rec[part.slice(0, eq).trim()] = part.slice(eq + 1);
  }
  return rec;
}

function altiumNum(rec: AltiumRec, key: string, fallback = 0): number {
  const base = Number(rec[key]);
  const frac = Number(rec[`${key}_FRAC`] ?? '0');
  const val = (Number.isFinite(base) ? base : fallback) + (Number.isFinite(frac) ? frac / 100000 : 0);
  return Number.isFinite(val) ? val : fallback;
}

function parseOle2FileHeaderRecords(payload: Uint8Array): AltiumRec[] {
  const recs: AltiumRec[] = [];
  const decoder = new TextDecoder('latin1');
  let offset = 0;

  while (offset + 4 <= payload.length) {
    const len = payload[offset] | (payload[offset + 1] << 8) | (payload[offset + 2] << 16);
    const kind = payload[offset + 3];
    offset += 4;
    if (len === 0 || offset + len > payload.length) break;

    if (kind === 0) {
      const str = decoder.decode(payload.subarray(offset, offset + len)).replace(/\0+$/, '');
      recs.push(str.includes('=') ? parsePipeRecord(str) : {});
    } else {
      recs.push({});
    }
    offset += len;
  }

  if (recs.length === 0) {
    const raw = decoder.decode(payload);
    for (const seg of raw.split(/\r?\n|(?=\|RECORD=)/)) {
      if (seg.includes('RECORD=')) recs.push(parsePipeRecord(seg));
    }
  }
  return recs;
}

interface ParsedCompAgg {
  libRef: string;
  designator: string;
  value: string;
  footprint: string;
  x: number;
  y: number;
  pins: Array<{ name: string; num: string; x: number; y: number; dx: number; dy: number }>;
}

function buildAltiumSchematicFromRecords(records: AltiumRec[], name: string, isBinary: boolean): {
  project: SchematicProject;
  report: GostConversionReport;
} {
  const comps = new Map<number, ParsedCompAgg>();
  const rawWires: Point2D[][] = [];
  const rawJunctions: Point2D[] = [];
  const rawPorts: Array<{ name: string; x: number; y: number; style: SchNetPort['style']; orientation: number }> = [];
  const rawLabels: Array<{ text: string; x: number; y: number }> = [];
  const polylines: Point2D[][] = [];

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const type = rec.RECORD;
    if (!type) continue;

    if (type === '1') {
      comps.set(i, {
        libRef: rec['%UTF8%LibReference'] || rec.LibReference || rec.DesignItemId || 'PART',
        designator: rec.Designator || '',
        value: rec.Comment || '',
        footprint: rec.CurrentPartId || '',
        x: altiumNum(rec, 'Location.X', 100),
        y: altiumNum(rec, 'Location.Y', 100),
        pins: []
      });
    } else if (type === '2') {
      const comp = comps.get(Number(rec.OwnerIndex));
      if (comp) {
        const px = altiumNum(rec, 'Location.X', comp.x);
        const py = altiumNum(rec, 'Location.Y', comp.y);
        const len = altiumNum(rec, 'PinLength', 20);
        const dir = (Number(rec.PinConglomerate || '0') || 0) & 0x03;
        const vx = dir === 0 ? 1 : dir === 2 ? -1 : 0;
        const vy = dir === 1 ? 1 : dir === 3 ? -1 : 0;
        comp.pins.push({
          name: rec['%UTF8%Name'] || rec.Name || rec.Designator || `${comp.pins.length + 1}`,
          num: rec.Designator || `${comp.pins.length + 1}`,
          x: px + vx * len,
          y: py + vy * len,
          dx: vx,
          dy: vy
        });
      }
    } else if (type === '34') {
      const comp = comps.get(Number(rec.OwnerIndex));
      if (comp && rec.Text) comp.designator = rec['%UTF8%Text'] || rec.Text;
    } else if (type === '41') {
      const comp = comps.get(Number(rec.OwnerIndex));
      if (comp && rec.Text && rec.Text !== '*') {
        const pname = (rec.Name || '').toLowerCase();
        const text = rec['%UTF8%Text'] || rec.Text;
        if (pname === 'value' || pname === 'comment') comp.value = text;
        else if (pname === 'footprint') comp.footprint = text;
        else if (!comp.value && !pname.includes('time') && !pname.includes('date')) comp.value = text;
      }
    } else if (type === '27') {
      const count = Number(rec.LocationCount || '2') || 2;
      const pts: Point2D[] = [];
      for (let k = 1; k <= count; k++) {
        if (rec[`X${k}`] !== undefined || rec[`Y${k}`] !== undefined) {
          pts.push({ x: altiumNum(rec, `X${k}`), y: altiumNum(rec, `Y${k}`) });
        }
      }
      if (pts.length >= 2) rawWires.push(pts);
    } else if (type === '29') {
      rawJunctions.push({ x: altiumNum(rec, 'Location.X'), y: altiumNum(rec, 'Location.Y') });
    } else if (type === '17') {
      const net = rec['%UTF8%Text'] || rec.Text || 'VCC';
      const style: SchNetPort['style'] = /GND|VSS/i.test(net) || Number(rec.Style) === 4 ? 'Ground' : 'Power';
      rawPorts.push({ name: net, x: altiumNum(rec, 'Location.X'), y: altiumNum(rec, 'Location.Y'), style, orientation: Number(rec.Orientation || '0') || 0 });
    } else if (type === '25') {
      const net = rec['%UTF8%Text'] || rec.Text || 'NET';
      rawLabels.push({ text: net, x: altiumNum(rec, 'Location.X'), y: altiumNum(rec, 'Location.Y') });
    } else if (type === '6' && (rec.OwnerIndex === undefined || rec.OwnerIndex === '-1')) {
      const count = Number(rec.LocationCount || '0') || 0;
      const pts: Point2D[] = [];
      for (let k = 1; k <= count; k++) {
        if (rec[`X${k}`] !== undefined) pts.push({ x: altiumNum(rec, `X${k}`), y: altiumNum(rec, `Y${k}`) });
      }
      if (pts.length >= 2) polylines.push(pts);
    }
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const track = (x: number, y: number) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  };
  for (const c of comps.values()) { track(c.x, c.y); for (const p of c.pins) track(p.x, p.y); }
  for (const w of rawWires) for (const pt of w) track(pt.x, pt.y);
  for (const p of rawPorts) track(p.x, p.y);
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 400; maxY = 300; }

  const toMmX = (ax: number) => Math.round(((ax - minX) * ALTIUM_UNIT_TO_MM + 25) * 100) / 100;
  const toMmY = (ay: number) => Math.round(((maxY - ay) * ALTIUM_UNIT_TO_MM + 25) * 100) / 100;

  const customDefs: Record<string, ComponentDef> = {};
  const components: PlacedComponent[] = [];
  let idx = 1;

  for (const c of comps.values()) {
    const cx = toMmX(c.x);
    const cy = toMmY(c.y);
    const defPins = c.pins.map((p, pi) => {
      const px = toMmX(p.x) - cx;
      const py = toMmY(p.y) - cy;
      // Orientation points FROM tip INTO symbol body
      const ori = Math.abs(p.dx) >= Math.abs(p.dy)
        ? (p.dx > 0 ? 180 : 0)
        : (p.dy > 0 ? 90 : 270);
      return makeSymbolPin({
        number: p.num || `${pi + 1}`,
        name: p.name || `${pi + 1}`,
        x: px,
        y: py,
        length: 2.54,
        orientation: ori
      });
    });

    const maxAbsX = defPins.reduce((m, p) => Math.max(m, Math.abs(p.x) - 2.54), 4);
    const maxAbsY = defPins.reduce((m, p) => Math.max(m, Math.abs(p.y)), 4);
    const hw = Math.max(3.5, Math.min(22, maxAbsX));
    const hh = Math.max(3.5, Math.min(22, maxAbsY + 1.5));

    const def = makeComponentDef({
      name: c.libRef,
      library: 'Altium Import',
      refDesPrefix: (c.designator.replace(/\d+.*$/, '') || 'U').toUpperCase(),
      defaultValue: c.value || c.libRef,
      patternId: c.footprint || 'DIP-8',
      description: `Altium: ${c.libRef}`,
      pins: defPins,
      primitives: [{ type: 'rect', x: -hw, y: -hh, w: hw * 2, h: hh * 2, width: 0.35 }]
    });

    components.push(placeDefOnSheet({
      def,
      customDefs,
      refDes: c.designator || `U${idx++}`,
      value: c.value || c.libRef,
      x: cx,
      y: cy,
      showValue: Boolean(c.value)
    }));
  }

  const wires: SchWire[] = [];
  for (const seg of rawWires) {
    for (let i = 0; i + 1 < seg.length; i++) {
      wires.push({ id: uid('aw'), points: [{ x: toMmX(seg[i].x), y: toMmY(seg[i].y) }, { x: toMmX(seg[i + 1].x), y: toMmY(seg[i + 1].y) }], netName: '' });
    }
  }
  const junctions: SchJunction[] = rawJunctions.map((j) => ({ id: uid('aj'), x: toMmX(j.x), y: toMmY(j.y), netName: '' }));
  const netPorts: SchNetPort[] = [
    ...rawPorts.map((p) => ({ id: uid('anp'), netName: p.name, style: p.style, x: toMmX(p.x), y: toMmY(p.y), angle: snapAngle90(p.orientation * 90) })),
    ...rawLabels.map((l) => ({
      id: uid('anl'),
      netName: l.text,
      style: (/GND|VSS/i.test(l.text) ? 'Ground' : /VCC|VDD|\+/i.test(l.text) ? 'Power' : 'OffPageOut') as SchNetPort['style'],
      x: toMmX(l.x),
      y: toMmY(l.y),
      angle: 0 as const
    }))
  ];
  const shapes: SchShape[] = polylines.flatMap((poly) =>
    poly.slice(0, -1).map((pt, k) => ({ id: uid('apsh'), type: 'line' as const, x1: toMmX(pt.x), y1: toMmY(pt.y), x2: toMmX(poly[k + 1].x), y2: toMmY(poly[k + 1].y), width: 0.25 }))
  );

  const rawProj = makeEcadSchematicProject({ name, components, wires, customDefs, junctions, netPorts, shapes });
  return convertImportedSchematicToGost(rawProj, isBinary ? 'Altium Designer OLE2 (.SchDoc)' : 'Altium ASCII (.SchDoc)');
}

/** Parses Altium Designer .SchDoc (binary OLE2 or ASCII), P-CAD ASCII, or EDIF schematic. */
export function parseAltiumOrPcadSchematic(input: string | Uint8Array, name = 'Altium_Import'): {
  project: SchematicProject;
  report: GostConversionReport;
} {
  if (input instanceof Uint8Array && isOle2Binary(input)) {
    const streams = readOle2Streams(input);
    const header = streams.get('FileHeader') ?? streams.get('Data') ?? streams.get('Storage');
    if (header) {
      const recs = parseOle2FileHeaderRecords(header);
      if (recs.some((r) => r.RECORD !== undefined)) return buildAltiumSchematicFromRecords(recs, name, true);
    }
  }

  const text = input instanceof Uint8Array ? new TextDecoder('utf-8', { fatal: false }).decode(input) : input;
  if (text.includes('RECORD=')) {
    return buildAltiumSchematicFromRecords(text.split(/\r?\n/).filter((l) => l.includes('RECORD=')).map(parsePipeRecord), name, false);
  }

  const customDefs: Record<string, ComponentDef> = {};
  const comps: PlacedComponent[] = [];
  const wires: SchWire[] = [];
  const edifCellRefs = [...text.matchAll(/\(instance\s+([^\s)]+)\s+[\s\S]*?\(cellRef\s+([^\s)]+)/g)];

  if (edifCellRefs.length > 0) {
    edifCellRefs.forEach((m, idx) => {
      const def = makeChipComponentDef(m[2], 4, 'U', 'EDIF Import');
      comps.push(placeDefOnSheet({ def, customDefs, refDes: m[1].replace(/[^A-Za-z0-9_]/g, '') || `U${idx + 1}`, value: m[2], x: 60 + (idx % 6) * 55, y: 60 + Math.floor(idx / 6) * 45 }));
    });
  } else {
    for (const m of text.matchAll(/\(compInst\s+"?([^"\s)]+)"?[\s\S]*?\(compRef\s+"?([^"\s)]+)"?[\s\S]*?\(pt\s+([\d.-]+)\s+([\d.-]+)\)/g)) {
      const def = makeChipComponentDef(m[2], 4, 'U', 'P-CAD Import');
      comps.push(placeDefOnSheet({ def, customDefs, refDes: m[1], value: m[2], x: Math.abs(parseFloat(m[3])) * 0.25 + 30, y: Math.abs(parseFloat(m[4])) * 0.25 + 30 }));
    }
    for (const w of text.matchAll(/\(wire\s+\(pt\s+([\d.-]+)\s+([\d.-]+)\)\s+\(pt\s+([\d.-]+)\s+([\d.-]+)\)/g)) {
      wires.push({ id: uid('pw'), points: [{ x: Math.abs(parseFloat(w[1])) * 0.25 + 30, y: Math.abs(parseFloat(w[2])) * 0.25 + 30 }, { x: Math.abs(parseFloat(w[3])) * 0.25 + 30, y: Math.abs(parseFloat(w[4])) * 0.25 + 30 }], netName: '' });
    }
  }

  return convertImportedSchematicToGost(makeEcadSchematicProject({ name, components: comps, wires, customDefs }), text.includes('(edif') ? 'EDIF (.edf)' : 'P-CAD ASCII');
}

/** Parses Altium Designer ASCII .PcbDoc or P-CAD ASCII PCB into PcbProject. */
export function parseAltiumOrPcadPcb(text: string, name = 'Altium_PCB'): {
  pcb: PcbProject;
  report: GostConversionReport;
} {
  const components: PcbPlacedComponent[] = [];
  const traces: PcbTrace[] = [];
  const vias: PcbVia[] = [];
  const boardOutline: Point2D[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (!line.includes('RECORD=')) continue;
    const rec = parsePipeRecord(line);
    if (rec.RECORD === 'Component') {
      components.push(makePcbPlacedComp({
        refDes: rec.SOURCEDESIGNATOR || rec.NAME || `U${components.length + 1}`,
        value: rec.COMMENT || rec.PATTERN || '',
        typeName: rec.PATTERN || 'DIP',
        side: rec.LAYER === 'BOTTOM' ? 'Bottom' : 'Top',
        x: Math.round(parseFloat(rec.X || '20') * 0.0254 * 100) / 100 || 20,
        y: Math.round(parseFloat(rec.Y || '20') * 0.0254 * 100) / 100 || 20,
        angle: parseFloat(rec.ROTATION || '0') || 0,
        pads: [makePadDef({ number: '1', x: -1, y: 0, width: 1.2, height: 1.2 })]
      }));
    } else if (rec.RECORD === 'Track') {
      traces.push({
        id: uid('apcb_t'),
        layer: rec.LAYER === 'BOTTOM' ? 'BottomCopper' : 'TopCopper',
        netName: rec.NET || '',
        points: [{ x: (parseFloat(rec.X1 || '0') || 0) * 0.0254, y: (parseFloat(rec.Y1 || '0') || 0) * 0.0254 }, { x: (parseFloat(rec.X2 || '0') || 0) * 0.0254, y: (parseFloat(rec.Y2 || '0') || 0) * 0.0254 }],
        width: Math.max(0.15, (parseFloat(rec.WIDTH || '10') || 10) * 0.0254)
      });
    } else if (rec.RECORD === 'Via') {
      vias.push({
        id: uid('apcb_v'),
        x: (parseFloat(rec.X || '0') || 0) * 0.0254,
        y: (parseFloat(rec.Y || '0') || 0) * 0.0254,
        netName: rec.NET || '',
        outerDiameter: Math.max(0.5, (parseFloat(rec.DIAMETER || '24') || 24) * 0.0254),
        holeDiameter: Math.max(0.25, (parseFloat(rec.HOLESIZE || '12') || 12) * 0.0254),
        startLayer: 'TopCopper',
        endLayer: 'BottomCopper',
        viaStyle: 'Through'
      });
    }
  }

  for (const m of text.matchAll(/\(boardOutline[\s\S]*?\(pt\s+([\d.-]+)\s+([\d.-]+)\)/g)) {
    boardOutline.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
  }

  const pcb = makeEcadPcbProject({
    name,
    components,
    traces,
    vias,
    boardOutline: boardOutline.length >= 3 ? boardOutline : [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }, { x: 0, y: 0 }]
  });
  return convertImportedPcbToGost(pcb, text.includes('RECORD=') ? 'Altium Designer (.PcbDoc)' : 'P-CAD ASCII PCB');
}
