import {
  ComponentDef,
  PadDef,
  PatternDef,
  PatternGraphic,
  PcbPlacedComponent,
  PcbProject,
  PcbShape,
  PcbTrace,
  PcbVia,
  PlacedComponent,
  Point2D,
  SchJunction,
  SchNetPort,
  SchWire,
  SchematicProject
} from '../../../core/types';
import { uid } from '../../../core/geometry';
import { convertImportedPcbToGost, convertImportedSchematicToGost, GostConversionReport, mapForeignPatternToGost, mapForeignPrefixToGost } from '../gostConverter';
import { chainSegmentsToOutline, Segment2D } from '../outlineChain';
import {
  makeChipComponentDef,
  makeEcadPcbProject,
  makeEcadSchematicProject,
  makePadDef,
  makePatternDef,
  makePatternGraphicLine,
  makePcbPlacedComp,
  makePcbShapeLine,
  placeDefOnSheet,
  snapAngle90
} from './ecadFactories';

const EE_UNIT_TO_MM = 0.254; // 10 mil -> mm

interface EasyEdaJson {
  head?: { x?: string | number; y?: string | number; docType?: string | number; c_para?: Record<string, string> };
  shape?: string[];
  dataStr?: { shape?: string[]; head?: { x?: string | number; y?: string | number; docType?: string | number } };
  schematics?: Array<{ dataStr?: { shape?: string[]; head?: { x?: string | number; y?: string | number; docType?: string | number } } }>;
  packageDetail?: { dataStr?: { shape?: string[]; head?: { x?: string | number; y?: string | number } } };
  title?: string;
  name?: string;
}

function collectEasyEdaShapes(parsed: EasyEdaJson): { shapes: string[]; originX: number; originY: number; docType: string } {
  const head = parsed.head ?? parsed.dataStr?.head ?? parsed.schematics?.[0]?.dataStr?.head;
  const originX = Number(head?.x ?? 0) || 0;
  const originY = Number(head?.y ?? 0) || 0;
  const docType = String(head?.docType ?? '');
  const shapes: string[] = [];
  if (Array.isArray(parsed.shape)) shapes.push(...parsed.shape.map(String));
  if (Array.isArray(parsed.dataStr?.shape)) shapes.push(...parsed.dataStr!.shape!.map(String));
  if (Array.isArray(parsed.schematics)) {
    for (const sch of parsed.schematics) {
      if (Array.isArray(sch.dataStr?.shape)) shapes.push(...sch.dataStr!.shape!.map(String));
    }
  }
  return { shapes, originX, originY, docType };
}

function mapEasyEdaPadShape(raw: string): PadDef['shape'] {
  const up = (raw || '').toUpperCase();
  if (up === 'ELLIPSE' || up === 'CIRCLE' || up === 'ROUND') return 'Round';
  if (up === 'OVAL') return 'Oval';
  if (up === 'POLYGON') return 'Polygon';
  return 'Rect';
}

function parseEasyEdaAttributes(f: string[]): { pkg: string; refDes: string; value: string; name: string } {
  const attrStr = f[3] || '';
  if (!attrStr.includes('`') && f.length >= 5) {
    // Simplified EasyEDA form: LIB~x~y~CompName~PkgName~RefDes
    return {
      pkg: f[4] || 'CUSTOM',
      refDes: (f[5] || '').replace(/\d+.*$/, '') || 'U',
      value: attrStr,
      name: attrStr || f[4] || 'Component'
    };
  }
  const kv = new Map<string, string>();
  const parts = attrStr.split('`');
  for (let i = 0; i + 1 < parts.length; i += 2) kv.set(parts[i].trim(), parts[i + 1]?.trim() ?? '');
  return {
    pkg: kv.get('package') || kv.get('Footprint') || 'CUSTOM',
    refDes: kv.get('pre') || kv.get('Designator') || '',
    value: kv.get('name') || kv.get('Manufacturer Part') || kv.get('Value') || '',
    name: kv.get('Manufacturer Part') || kv.get('package') || 'Component'
  };
}

/** Parses EasyEDA Standard/Pro PCB JSON (origin subtraction + #@$ subrecords + BoardOutLine). */
export function parseEasyEdaPcbJson(text: string, name = 'EasyEDA_PCB'): {
  pcb: PcbProject;
  report: GostConversionReport;
} {
  const parsed = JSON.parse(text) as EasyEdaJson;
  const { shapes, originX, originY } = collectEasyEdaShapes(parsed);

  const outlineSegs: Segment2D[] = [];
  const rawTraces: Array<{ layer: PcbTrace['layer']; net: string; pts: Point2D[]; width: number }> = [];
  const rawVias: Array<{ x: number; y: number; outer: number; hole: number; net: string }> = [];
  const rawShapes: Array<{ layer: PcbShape['layer']; x1: number; y1: number; x2: number; y2: number; width: number }> = [];
  const rawComps: Array<{ refDes: string; value: string; pkg: string; side: 'Top' | 'Bottom'; x: number; y: number; angle: number; pads: PadDef[]; padNets: Record<string, string>; graphics: PatternGraphic[] }> = [];

  let minX = Infinity, minY = Infinity;
  const trackPt = (ux: number, uy: number) => {
    const mx = (ux - originX) * EE_UNIT_TO_MM;
    const my = (uy - originY) * EE_UNIT_TO_MM;
    if (mx < minX) minX = mx; if (my < minY) minY = my;
    return { x: mx, y: my };
  };

  for (const entry of shapes) {
    if (entry.startsWith('TRACK~')) {
      const f = entry.split('~');
      const wMm = Math.max(0.1, (parseFloat(f[1] || '1') || 1) * EE_UNIT_TO_MM);
      const layerId = f[2] || '1';
      const net = f[3] || '';
      const nums = (f[4] || '').trim().split(/\s+/).map(Number).filter(Number.isFinite);
      const pts: Point2D[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push(trackPt(nums[i], nums[i + 1]));
      if (pts.length >= 2) {
        if (layerId === '10') {
          for (let i = 0; i + 1 < pts.length; i++) outlineSegs.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y });
        } else if (layerId === '1' || layerId === '2' || layerId === '99' || layerId === '100') {
          const cuLayer = layerId === '2' ? 'BottomCopper' : layerId === '99' ? 'Inner1' : layerId === '100' ? 'Inner2' : 'TopCopper';
          rawTraces.push({ layer: cuLayer, net, pts, width: wMm });
        } else if (layerId === '3' || layerId === '4' || layerId === '5' || layerId === '6' || layerId === '7' || layerId === '8' || layerId === '19' || layerId === '20') {
          const shapeLayer: PcbShape['layer'] =
            layerId === '4' ? 'BottomSilk' :
            layerId === '5' ? 'TopPaste' :
            layerId === '6' ? 'BottomPaste' :
            layerId === '7' ? 'TopMask' :
            layerId === '8' ? 'BottomMask' :
            layerId === '19' ? 'TopAssembly' :
            layerId === '20' ? 'BottomAssembly' : 'TopSilk';
          for (let i = 0; i + 1 < pts.length; i++) rawShapes.push({ layer: shapeLayer, x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y, width: wMm });
        }
      }
    } else if (entry.startsWith('VIA~')) {
      const f = entry.split('~');
      const pt = trackPt(parseFloat(f[1] || '0') || 0, parseFloat(f[2] || '0') || 0);
      rawVias.push({ x: pt.x, y: pt.y, outer: Math.max(0.45, (parseFloat(f[3] || '2.4') || 2.4) * EE_UNIT_TO_MM), hole: Math.max(0.2, (parseFloat(f[5] || '1.2') || 1.2) * EE_UNIT_TO_MM), net: f[4] || '' });
    } else if (entry.startsWith('HOLE~')) {
      const f = entry.split('~');
      const pt = trackPt(parseFloat(f[1] || '0') || 0, parseFloat(f[2] || '0') || 0);
      const dia = Math.max(0.8, (parseFloat(f[3] || '4') || 4) * EE_UNIT_TO_MM);
      rawVias.push({ x: pt.x, y: pt.y, outer: dia + 0.4, hole: dia, net: '' });
    } else if (entry.startsWith('LIB~')) {
      const subParts = entry.split('#@$');
      const header = subParts[0].split('~');
      const compPt = trackPt(parseFloat(header[1] || '0') || 0, parseFloat(header[2] || '0') || 0);
      const attrs = parseEasyEdaAttributes(header);
      const angle = parseFloat(header[4] || '0') || 0;
      const side: 'Top' | 'Bottom' = header[7] === '2' ? 'Bottom' : 'Top';

      let refDes = '';
      const pads: PadDef[] = [];
      const padNets: Record<string, string> = {};
      const graphics: PatternGraphic[] = [];

      for (let i = 1; i < subParts.length; i++) {
        const sub = subParts[i];
        if (sub.startsWith('PAD~')) {
          const pf = sub.split('~');
          const px = ((parseFloat(pf[2] || '0') || 0) - originX) * EE_UNIT_TO_MM - compPt.x;
          const py = ((parseFloat(pf[3] || '0') || 0) - originY) * EE_UNIT_TO_MM - compPt.y;
          const holeR = (parseFloat(pf[9] || '0') || 0) * EE_UNIT_TO_MM;
          const isTht = pf[6] === '11' || holeR > 0.05;
          const num = pf[8] || `${pads.length + 1}`;
          pads.push(makePadDef({
            number: num,
            isTht,
            shape: mapEasyEdaPadShape(pf[1] || 'RECT'),
            x: px,
            y: py,
            width: Math.max(0.2, (parseFloat(pf[4] || '4') || 4) * EE_UNIT_TO_MM),
            height: Math.max(0.2, (parseFloat(pf[5] || '4') || 4) * EE_UNIT_TO_MM),
            holeDiameter: isTht ? holeR * 2 : 0,
            angle: parseFloat(pf[11] || '0') || 0
          }));
          if (pf[7]) padNets[num] = pf[7];
        } else if (sub.startsWith('TEXT~P~')) {
          const tf = sub.split('~');
          if (tf[10]) refDes = tf[10].trim();
        } else if (sub.startsWith('TRACK~')) {
          const tf = sub.split('~');
          const nums = (tf[4] || '').trim().split(/\s+/).map(Number).filter(Number.isFinite);
          for (let k = 0; k + 3 < nums.length; k += 2) {
            graphics.push(makePatternGraphicLine(
              tf[2] === '4' ? 'BottomSilk' : 'TopSilk',
              ((nums[k] - originX) * EE_UNIT_TO_MM) - compPt.x,
              ((nums[k + 1] - originY) * EE_UNIT_TO_MM) - compPt.y,
              ((nums[k + 2] - originX) * EE_UNIT_TO_MM) - compPt.x,
              ((nums[k + 3] - originY) * EE_UNIT_TO_MM) - compPt.y,
              Math.max(0.1, (parseFloat(tf[1] || '0.6') || 0.6) * EE_UNIT_TO_MM)
            ));
          }
        }
      }

      rawComps.push({
        refDes: refDes || `${attrs.refDes || 'U'}${rawComps.length + 1}`,
        value: attrs.value || attrs.pkg,
        pkg: attrs.pkg,
        side,
        x: compPt.x,
        y: compPt.y,
        angle,
        pads: pads.length > 0 ? pads : [makePadDef({ number: '1', x: -0.9, y: 0, width: 1.0, height: 1.2 }), makePadDef({ number: '2', x: 0.9, y: 0, width: 1.0, height: 1.2 })],
        padNets,
        graphics
      });
    }
  }

  const rawOutline = chainSegmentsToOutline(outlineSegs, 0.35);
  let baseMinX = rawOutline.length >= 3 ? Math.min(...rawOutline.map((p) => p.x)) : minX;
  let baseMinY = rawOutline.length >= 3 ? Math.min(...rawOutline.map((p) => p.y)) : minY;
  if (!Number.isFinite(baseMinX)) { baseMinX = 0; baseMinY = 0; }
  const shiftX = -baseMinX + 10;
  const shiftY = -baseMinY + 10;

  const boardOutline: Point2D[] = rawOutline.length >= 3
    ? rawOutline.map((p) => ({ x: Math.round((p.x + shiftX) * 1000) / 1000, y: Math.round((p.y + shiftY) * 1000) / 1000 }))
    : [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }, { x: 0, y: 0 }];

  const components: PcbPlacedComponent[] = rawComps.map((c) => makePcbPlacedComp({
    refDes: c.refDes,
    value: c.value,
    typeName: c.pkg,
    side: c.side,
    x: c.x + shiftX,
    y: c.y + shiftY,
    angle: c.angle,
    pads: c.pads,
    padNets: c.padNets,
    graphics: c.graphics
  }));
  const traces: PcbTrace[] = rawTraces.map((t) => ({ id: uid('etr'), layer: t.layer, netName: t.net, points: t.pts.map((p) => ({ x: Math.round((p.x + shiftX) * 1000) / 1000, y: Math.round((p.y + shiftY) * 1000) / 1000 })), width: t.width }));
  const vias: PcbVia[] = rawVias.map((v) => ({ id: uid('evi'), x: Math.round((v.x + shiftX) * 1000) / 1000, y: Math.round((v.y + shiftY) * 1000) / 1000, netName: v.net, outerDiameter: v.outer, holeDiameter: v.hole, startLayer: 'TopCopper', endLayer: 'BottomCopper', viaStyle: 'Through' }));
  const pcbShapes: PcbShape[] = rawShapes.map((s) => makePcbShapeLine(s.layer, s.x1 + shiftX, s.y1 + shiftY, s.x2 + shiftX, s.y2 + shiftY, s.width));

  return convertImportedPcbToGost(makeEcadPcbProject({ name: parsed.title || parsed.name || name, components, traces, vias, shapes: pcbShapes, boardOutline }), 'EasyEDA PCB JSON');
}

/** Parses EasyEDA Standard/Pro Schematic JSON. */
export function parseEasyEdaSchematicJson(text: string, name = 'EasyEDA_Import'): {
  project: SchematicProject;
  report: GostConversionReport;
} {
  const parsed = JSON.parse(text) as EasyEdaJson;
  const { shapes, originX, originY, docType } = collectEasyEdaShapes(parsed);
  const customDefs: Record<string, ComponentDef> = {};

  if (docType === '3' && !shapes.some((s) => s.startsWith('W~'))) {
    const { pcb } = parseEasyEdaPcbJson(text, name);
    const comps: PlacedComponent[] = pcb.components.map((pc) => {
      const def = makeChipComponentDef(pc.typeName || pc.value || 'IC', Math.max(2, pc.pads.length), 'U', 'EasyEDA Import');
      return placeDefOnSheet({ def, customDefs, refDes: pc.refDes, value: pc.value, x: Math.min(390, pc.x * 2 + 40), y: Math.min(265, pc.y * 2 + 40) });
    });
    return convertImportedSchematicToGost(makeEcadSchematicProject({ name, components: comps, wires: [], customDefs }), 'EasyEDA JSON');
  }

  const comps: PlacedComponent[] = [];
  const wires: SchWire[] = [];
  const junctions: SchJunction[] = [];
  const netPorts: SchNetPort[] = [];

  for (const s of shapes) {
    if (s.startsWith('W~')) {
      const pts = (s.split('~')[1] || '').trim().split(/[ ,]+/).map(Number).filter(Number.isFinite);
      for (let i = 0; i + 3 < pts.length; i += 2) {
        wires.push({ id: uid('eew'), points: [{ x: ((pts[i] - originX) * EE_UNIT_TO_MM) + 60, y: ((pts[i + 1] - originY) * EE_UNIT_TO_MM) + 50 }, { x: ((pts[i + 2] - originX) * EE_UNIT_TO_MM) + 60, y: ((pts[i + 3] - originY) * EE_UNIT_TO_MM) + 50 }], netName: '' });
      }
    } else if (s.startsWith('J~')) {
      const f = s.split('~');
      junctions.push({ id: uid('eej'), x: (((parseFloat(f[1] || '0') || 0) - originX) * EE_UNIT_TO_MM) + 60, y: (((parseFloat(f[2] || '0') || 0) - originY) * EE_UNIT_TO_MM) + 50, netName: '' });
    } else if (s.startsWith('F~') || s.startsWith('N~')) {
      const f = s.split('~');
      const netName = (s.startsWith('N~') ? f[5] : f[4]) || f[3] || 'NET';
      netPorts.push({ id: uid('eenp'), netName, style: /GND|VSS/i.test(netName) ? 'Ground' : /VCC|VDD|\+/i.test(netName) ? 'Power' : 'OffPageOut', x: (((parseFloat(f[1] || '0') || 0) - originX) * EE_UNIT_TO_MM) + 60, y: (((parseFloat(f[2] || '0') || 0) - originY) * EE_UNIT_TO_MM) + 50, angle: 0 });
    } else if (s.startsWith('LIB~')) {
      const f = s.split('#@$')[0].split('~');
      const attrs = parseEasyEdaAttributes(f);
      const rawRefFull = !f[3]?.includes('`') && f[5] ? f[5] : `${attrs.refDes || 'U'}${comps.length + 1}`;
      const def = makeChipComponentDef(attrs.name || attrs.pkg || 'IC', 4, attrs.refDes || 'U', 'EasyEDA Import');
      comps.push(placeDefOnSheet({
        def,
        customDefs,
        refDes: rawRefFull,
        value: attrs.value || attrs.pkg,
        x: Math.max(20, Math.min(390, (((parseFloat(f[1] || '0') || 0) - originX) * EE_UNIT_TO_MM) + 60)),
        y: Math.max(20, Math.min(265, (((parseFloat(f[2] || '0') || 0) - originY) * EE_UNIT_TO_MM) + 50)),
        angle: snapAngle90(parseFloat(f[4] || '0') || 0)
      }));
    }
  }

  return convertImportedSchematicToGost(makeEcadSchematicProject({ name, components: comps, wires, customDefs, junctions, netPorts }), 'EasyEDA JSON');
}

/** Parses an EasyEDA Symbol or Footprint Library JSON into GOST ComponentDef & PatternDef. */
export function parseEasyEdaLibraryJson(text: string, libName: string, adaptToGost: boolean): {
  components: ComponentDef[];
  patterns: PatternDef[];
  report: GostConversionReport;
} {
  const parsed = JSON.parse(text) as EasyEdaJson;
  const shapes: string[] = [...(parsed.dataStr?.shape ?? []), ...(parsed.packageDetail?.dataStr?.shape ?? []), ...(parsed.shape ?? [])];
  const compTitle = parsed.title || parsed.head?.c_para?.['Manufacturer Part'] || parsed.name || 'EasyEDA_Part';
  const pkgName = parsed.head?.c_para?.package || 'CUSTOM';
  const origX = Number(parsed.head?.x ?? parsed.dataStr?.head?.x ?? 0) || 0;
  const origY = Number(parsed.head?.y ?? parsed.dataStr?.head?.y ?? 0) || 0;

  const pads: PadDef[] = [];
  for (const s of shapes) {
    if (!s.startsWith('PAD~')) continue;
    const pf = s.split('~');
    const hole = (parseFloat(pf[9] || '0') || 0) * EE_UNIT_TO_MM * 2;
    pads.push(makePadDef({
      number: pf[8] || `${pads.length + 1}`,
      isTht: hole > 0.05,
      shape: mapEasyEdaPadShape(pf[1] || 'RECT'),
      x: ((parseFloat(pf[2] || '0') || 0) - origX) * EE_UNIT_TO_MM,
      y: ((parseFloat(pf[3] || '0') || 0) - origY) * EE_UNIT_TO_MM,
      width: Math.max(0.3, (parseFloat(pf[4] || '4') || 4) * EE_UNIT_TO_MM),
      height: Math.max(0.3, (parseFloat(pf[5] || '4') || 4) * EE_UNIT_TO_MM),
      holeDiameter: hole > 0.05 ? hole : 0,
      angle: parseFloat(pf[11] || '0') || 0
    }));
  }

  const finalPkg = adaptToGost ? mapForeignPatternToGost(pkgName) : pkgName;
  const prefix = adaptToGost ? mapForeignPrefixToGost(parsed.head?.c_para?.pre || 'DD', `${compTitle} ${pkgName}`) : 'U';
  const pat = makePatternDef({
    name: finalPkg,
    library: libName,
    description: `Imported EasyEDA footprint: ${pkgName}`,
    pads: pads.length > 0 ? pads : [makePadDef({ number: '1', x: -0.95, y: 0, width: 1.0, height: 1.25 }), makePadDef({ number: '2', x: 0.95, y: 0, width: 1.0, height: 1.25 })]
  });
  const comp = makeChipComponentDef(compTitle, Math.max(2, pads.length), prefix, libName);
  comp.patternId = pat.id;

  return {
    components: [comp],
    patterns: [pat],
    report: { sourceFormat: 'EasyEDA Library JSON', convertedComponents: 1, convertedSymbolsToUgo: 1, convertedPatterns: 1, items: [] }
  };
}
