import {
  ComponentDef,
  PcbPlacedComponent,
  PcbProject,
  PlacedComponent,
  SchNetPort,
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

const LTSPICE_SCALE = 0.22;

function createLtspiceComponentDef(symName: string, instName: string, value: string): ComponentDef {
  const s = symName.toLowerCase();
  const prefix = (instName.replace(/\d+.*$/, '') || 'U').toUpperCase();

  if (s.includes('res') || prefix === 'R') {
    return makeComponentDef({
      name: symName,
      library: 'LTspice',
      refDesPrefix: prefix,
      defaultValue: value || symName,
      pins: [
        makeSymbolPin({ number: '1', name: '1', x: 0, y: -6, length: 2.5, orientation: 90, showName: false, showNumber: false }),
        makeSymbolPin({ number: '2', name: '2', x: 0, y: 6, length: 2.5, orientation: 270, showName: false, showNumber: false })
      ],
      primitives: [{ type: 'rect', x: -2, y: -4, w: 4, h: 8, width: 0.35 }]
    });
  }
  if (s.includes('cap') || s.includes('polcap') || prefix === 'C') {
    return makeComponentDef({
      name: symName,
      library: 'LTspice',
      refDesPrefix: prefix,
      defaultValue: value || symName,
      pins: [
        makeSymbolPin({ number: '1', name: '1', x: 0, y: -6, length: 3.5, orientation: 90, showName: false, showNumber: false }),
        makeSymbolPin({ number: '2', name: '2', x: 0, y: 6, length: 3.5, orientation: 270, showName: false, showNumber: false })
      ],
      primitives: [
        { type: 'line', x1: -4, y1: -1.2, x2: 4, y2: -1.2, width: 0.45 },
        { type: 'line', x1: -4, y1: 1.2, x2: 4, y2: 1.2, width: 0.45 }
      ]
    });
  }
  if (s.includes('diode') || s.includes('led') || s.includes('schottky') || s.includes('zener')) {
    return makeComponentDef({
      name: symName,
      library: 'LTspice',
      refDesPrefix: 'VD',
      defaultValue: value || symName,
      pins: [
        makeSymbolPin({ number: 'A', name: 'A', x: 0, y: -6, length: 2.5, orientation: 90, showName: false, showNumber: false }),
        makeSymbolPin({ number: 'K', name: 'K', x: 0, y: 6, length: 2.5, orientation: 270, showName: false, showNumber: false })
      ],
      primitives: [
        { type: 'polyline', points: [{ x: -3, y: -2.5 }, { x: 3, y: -2.5 }, { x: 0, y: 2.5 }], closed: true, width: 0.35 },
        { type: 'line', x1: -3, y1: 2.5, x2: 3, y2: 2.5, width: 0.4 }
      ]
    });
  }
  if (s.includes('voltage') || s.includes('current') || s.includes('battery')) {
    return makeComponentDef({
      name: symName,
      library: 'LTspice',
      refDesPrefix: prefix === 'V' ? 'G' : prefix,
      defaultValue: value || symName,
      pins: [
        makeSymbolPin({ number: '+', name: '+', x: 0, y: -6, length: 2.5, orientation: 90, electricalType: 'Power', showNumber: false }),
        makeSymbolPin({ number: '-', name: '-', x: 0, y: 6, length: 2.5, orientation: 270, electricalType: 'Power', showNumber: false })
      ],
      primitives: [{ type: 'circle', cx: 0, cy: 0, r: 4, width: 0.35 }]
    });
  }
  if (s.includes('npn') || s.includes('pnp') || s.includes('nmos') || s.includes('pmos') || s.includes('mos')) {
    return makeComponentDef({
      name: symName,
      library: 'LTspice',
      refDesPrefix: 'VT',
      defaultValue: value || symName,
      pins: [
        makeSymbolPin({ number: 'G', name: 'G', x: -7, y: 0, length: 3, orientation: 0, electricalType: 'Input', showName: false, showNumber: false }),
        makeSymbolPin({ number: 'D', name: 'D', x: 0, y: -7, length: 3, orientation: 90, showName: false, showNumber: false }),
        makeSymbolPin({ number: 'S', name: 'S', x: 0, y: 7, length: 3, orientation: 270, showName: false, showNumber: false })
      ],
      primitives: [{ type: 'circle', cx: 0, cy: 0, r: 4.5, width: 0.35 }]
    });
  }
  return makeChipComponentDef(symName, 4, prefix, 'LTspice');
}

/** Parses LTspice .asc schematics using signed coordinate shifting instead of Math.abs. */
export function parseLtspiceAsc(text: string, name = 'LTspice_Schematic'): {
  project: SchematicProject;
  report: GostConversionReport;
} {
  const rawWires: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const rawFlags: Array<{ x: number; y: number; net: string }> = [];
  const rawSyms: Array<{ symType: string; x: number; y: number; orient: string; inst: string; val: string }> = [];

  let minX = Infinity, minY = Infinity;
  const track = (x: number, y: number) => { if (x < minX) minX = x; if (y < minY) minY = y; };
  let curSym: { symType: string; x: number; y: number; orient: string; inst: string; val: string } | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('WIRE ')) {
      const p = line.split(/\s+/);
      if (p.length >= 5) {
        const x1 = parseFloat(p[1]), y1 = parseFloat(p[2]), x2 = parseFloat(p[3]), y2 = parseFloat(p[4]);
        if ([x1, y1, x2, y2].every(Number.isFinite)) { rawWires.push({ x1, y1, x2, y2 }); track(x1, y1); track(x2, y2); }
      }
    } else if (line.startsWith('FLAG ')) {
      const p = line.split(/\s+/);
      if (p.length >= 4) {
        const x = parseFloat(p[1]), y = parseFloat(p[2]);
        if (Number.isFinite(x) && Number.isFinite(y)) { rawFlags.push({ x, y, net: p.slice(3).join(' ') }); track(x, y); }
      }
    } else if (line.startsWith('SYMBOL ')) {
      const p = line.split(/\s+/);
      const x = parseFloat(p[2] || '0') || 0, y = parseFloat(p[3] || '0') || 0;
      track(x, y);
      curSym = { symType: p[1] || 'Comp', x, y, orient: p[4] || 'R0', inst: '', val: '' };
      rawSyms.push(curSym);
    } else if (line.startsWith('SYMATTR InstName ') && curSym) {
      curSym.inst = line.slice('SYMATTR InstName '.length).trim();
    } else if (line.startsWith('SYMATTR Value ') && curSym) {
      curSym.val = line.slice('SYMATTR Value '.length).trim();
    }
  }

  if (!Number.isFinite(minX)) { minX = 0; minY = 0; }
  const toMmX = (v: number) => Math.round(((v - minX) * LTSPICE_SCALE + 25) * 100) / 100;
  const toMmY = (v: number) => Math.round(((v - minY) * LTSPICE_SCALE + 25) * 100) / 100;

  const customDefs: Record<string, ComponentDef> = {};
  const comps: PlacedComponent[] = rawSyms.map((s, idx) => {
    const inst = s.inst || `U${idx + 1}`;
    const val = s.val || s.symType;
    const def = createLtspiceComponentDef(s.symType, inst, val);
    return placeDefOnSheet({
      def,
      customDefs,
      refDes: inst,
      value: val,
      x: toMmX(s.x),
      y: toMmY(s.y),
      angle: snapAngle90(parseInt(s.orient.replace(/^[RM]/i, ''), 10) || 0),
      flipX: s.orient.toUpperCase().startsWith('M')
    });
  });

  const wires: SchWire[] = rawWires.map((w) => ({ id: uid('ltw'), points: [{ x: toMmX(w.x1), y: toMmY(w.y1) }, { x: toMmX(w.x2), y: toMmY(w.y2) }], netName: '' }));
  const netPorts: SchNetPort[] = rawFlags.map((f) => ({
    id: uid('ltp'),
    netName: f.net === '0' ? 'GND' : f.net,
    style: f.net === '0' || /GND|VSS/i.test(f.net) ? 'Ground' : /VCC|VDD|\+/i.test(f.net) ? 'Power' : 'OffPageOut',
    x: toMmX(f.x),
    y: toMmY(f.y),
    angle: 0
  }));

  return convertImportedSchematicToGost(makeEcadSchematicProject({ name, components: comps, wires, customDefs, netPorts }), 'LTspice (.asc)');
}

/** Parses SPICE netlists (.cir / .sp / .net) into placed GOST schematic components & routed net wires. */
export function parseSpiceNetlist(text: string, name = 'SPICE_Netlist'): {
  project: SchematicProject;
  report: GostConversionReport;
} {
  const customDefs: Record<string, ComponentDef> = {};
  const comps: PlacedComponent[] = [];
  const wires: SchWire[] = [];
  const netPorts: SchNetPort[] = [];
  let row = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('*') || line.startsWith(';') || line.startsWith('.')) continue;
    const tokens = line.split(/\s+/);
    if (tokens.length < 3) continue;
    const refDes = tokens[0];
    const value = tokens[tokens.length - 1];
    const nets = tokens.slice(1, tokens.length - 1);
    const pinCount = Math.max(2, Math.min(8, nets.length));

    const def = pinCount > 2
      ? makeChipComponentDef(refDes[0] || 'U', pinCount, refDes.replace(/\d+.*$/, '') || 'U', 'SPICE')
      : createLtspiceComponentDef(refDes[0] || 'U', refDes, value);

    const cx = 45 + (row % 5) * 65;
    const cy = 40 + Math.floor(row / 5) * 45;
    comps.push(placeDefOnSheet({ def, customDefs, refDes, value, x: cx, y: cy }));

    const pins = def.parts[0]?.pins ?? [];
    nets.slice(0, pinCount).forEach((net, pi) => {
      if (!net) return;
      const pin = pins[pi];
      const px = cx + (pin?.x ?? 0);
      const py = cy + (pin?.y ?? 0);
      const stubX = px + ((pin?.x ?? 0) >= 0 ? 8 : -8);
      wires.push({ id: uid('spw'), points: [{ x: px, y: py }, { x: stubX, y: py }], netName: net === '0' ? 'GND' : net });
      if (net === '0' || /GND|VCC|VDD/i.test(net)) {
        netPorts.push({ id: uid('spnp'), netName: net === '0' ? 'GND' : net, style: net === '0' || /GND/i.test(net) ? 'Ground' : 'Power', x: stubX, y: py, angle: 0 });
      }
    });
    row++;
  }

  return convertImportedSchematicToGost(makeEcadSchematicProject({ name, components: comps, wires, customDefs, netPorts }), 'SPICE Netlist (.cir/.net)');
}

/** Parses PADS ASCII schematic/netlist (*PADS-PCB* / *PART* / *NET*) into SchematicProject. */
export function parsePadsAsciiSchematic(text: string, name = 'PADS_Schematic'): {
  project: SchematicProject;
  report: GostConversionReport;
} {
  const customDefs: Record<string, ComponentDef> = {};
  const comps: PlacedComponent[] = [];
  const wires: SchWire[] = [];
  const netPorts: SchNetPort[] = [];
  let section = '';
  let curSignal = '';

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('*SIGNAL*')) {
      curSignal = line.slice('*SIGNAL*'.length).trim();
      continue;
    }
    if (line.startsWith('*')) {
      section = line.toUpperCase();
      continue;
    }
    if (section.includes('PART')) {
      const m = /^(\S+)\s+(\S+)/.exec(line);
      if (m) {
        const refDes = m[1], val = m[2];
        const idx = comps.length;
        const def = makeChipComponentDef(val, 4, refDes.replace(/\d+.*$/, '') || 'U', 'PADS');
        comps.push(placeDefOnSheet({ def, customDefs, refDes, value: val, x: 45 + (idx % 5) * 65, y: 45 + Math.floor(idx / 5) * 45 }));
      }
    } else if (section.includes('NET') && curSignal) {
      const tokens = line.split(/\s+/);
      const pts: Array<{ x: number; y: number }> = [];
      for (const tk of tokens) {
        const [ref] = tk.split('.');
        const c = comps.find((comp) => comp.refDes === ref);
        if (c) pts.push({ x: c.x, y: c.y });
      }
      for (let i = 0; i + 1 < pts.length; i++) {
        wires.push({ id: uid('padw'), points: [pts[i], pts[i + 1]], netName: curSignal });
      }
      if (/GND|VCC|VDD|\+5V|\+3/i.test(curSignal) && pts[0]) {
        netPorts.push({ id: uid('padp'), netName: curSignal, style: /GND/i.test(curSignal) ? 'Ground' : 'Power', x: pts[0].x, y: pts[0].y - 10, angle: 0 });
      }
    }
  }

  return convertImportedSchematicToGost(makeEcadSchematicProject({ name, components: comps, wires, customDefs, netPorts }), 'PADS ASCII');
}

/** Parses PADS ASCII PCB files (*PART*, *NET*, *ROUTE*). */
export function parsePadsAsciiPcb(text: string, name = 'PADS_PCB'): {
  pcb: PcbProject;
  report: GostConversionReport;
} {
  const comps: PcbPlacedComponent[] = [];
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('*')) { section = line.toUpperCase(); continue; }
    if (section.includes('PART')) {
      const m = /^(\S+)\s+(\S+)(?:\s+([\d.-]+)\s+([\d.-]+))?/.exec(line);
      if (m) {
        comps.push(makePcbPlacedComp({
          refDes: m[1],
          value: m[2],
          typeName: m[2],
          x: m[3] ? Math.max(5, parseFloat(m[3]) * 0.0254) : 20 + comps.length * 15,
          y: m[4] ? Math.max(5, parseFloat(m[4]) * 0.0254) : 25,
          pads: [makePadDef({ number: '1', isTht: true, shape: 'Round', x: 0, y: 0, width: 1.5, height: 1.5, holeDiameter: 0.8 })]
        }));
      }
    }
  }
  return convertImportedPcbToGost(makeEcadPcbProject({
    name,
    components: comps,
    boardOutline: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }, { x: 0, y: 0 }]
  }), 'PADS ASCII');
}
