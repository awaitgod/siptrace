import {
  ComponentDef,
  PlacedComponent,
  SchBus,
  SchJunction,
  SchNetPort,
  SchShape,
  SchWire,
  SchematicProject
} from '../../../core/types';
import { uid } from '../../../core/geometry';
import { convertImportedSchematicToGost, GostConversionReport } from '../gostConverter';
import { makeChipComponentDef, makeComponentDef, makeEcadSchematicProject, placeDefOnSheet, snapAngle90 } from '../ecad/ecadFactories';
import { parseSExpressions, SExprList, sxFind, sxFindAll, sxNum, sxStr } from '../sexprParser';
import { extractKicadSymbolGeometry } from './kicadCommon';

function buildLibSymbolMap(root: SExprList): Map<string, ComponentDef> {
  const map = new Map<string, ComponentDef>();
  const libNode = sxFind(root, 'lib_symbols');
  if (!libNode) return map;

  for (const sym of sxFindAll(libNode, 'symbol')) {
    const libId = sxStr(sym, 1);
    if (!libId) continue;

    const { pins, primitives } = extractKicadSymbolGeometry([sym], 1.0);
    const props = new Map<string, string>();
    for (const pr of sxFindAll(sym, 'property')) props.set(sxStr(pr, 1).toLowerCase(), sxStr(pr, 2));
    const refPrefix = props.get('reference') || 'U';
    const fp = props.get('footprint') || '';

    const def = makeComponentDef({
      name: libId.split(':').pop() || libId,
      library: 'KiCad Sheet',
      refDesPrefix: refPrefix,
      defaultValue: props.get('value') || libId,
      patternId: fp.includes(':') ? fp.split(':').pop() || fp : (fp || 'DIP-8'),
      description: `KiCad symbol: ${libId}`,
      pins: pins.length > 0 ? pins : makeChipComponentDef(libId, 2, refPrefix).parts[0].pins,
      primitives: primitives.length > 0 ? primitives : [{ type: 'rect', x: -3.5, y: -3.5, w: 7, h: 7, width: 0.3 }]
    });
    map.set(libId, def);
  }
  return map;
}

function parseLegacyKicadSchematic(text: string, name: string): {
  project: SchematicProject;
  report: GostConversionReport;
} {
  const scale = 0.0254;
  const customDefs: Record<string, ComponentDef> = {};
  const comps: PlacedComponent[] = [];
  const wires: SchWire[] = [];
  const buses: SchBus[] = [];
  const junctions: SchJunction[] = [];
  const netPorts: SchNetPort[] = [];

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '$Comp') {
      let libName = 'Part', ref = `U${comps.length + 1}`, val = '', x = 50, y = 50;
      let angle: 0 | 90 | 180 | 270 = 0;
      while (++i < lines.length && lines[i].trim() !== '$EndComp') {
        const cl = lines[i].trim();
        if (cl.startsWith('L ')) { const p = cl.split(/\s+/); libName = p[1] || libName; ref = p[2] || ref; }
        else if (cl.startsWith('P ')) { const p = cl.split(/\s+/); x = (parseFloat(p[1] || '0') || 0) * scale; y = (parseFloat(p[2] || '0') || 0) * scale; }
        else if (cl.startsWith('F 1 ')) { const m = /"([^"]*)"/.exec(cl); if (m?.[1]) val = m[1]; }
        else if (/^\s*-?\d+\s+-?\d+\s+-?\d+\s+-?\d+\s*$/.test(cl)) {
          const m = cl.split(/\s+/).map(Number);
          if (m[0] === 0 && m[1] === 1) angle = 90;
          else if (m[0] === -1 && m[3] === -1) angle = 180;
          else if (m[0] === 0 && m[1] === -1) angle = 270;
        }
      }
      if (ref.startsWith('#PWR')) {
        netPorts.push({ id: uid('klnp'), netName: val || 'VCC', style: /GND|VSS/i.test(val) ? 'Ground' : 'Power', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, angle: 0 });
      } else {
        const def = makeChipComponentDef(libName.split(':').pop() || libName, 4, ref.replace(/\d+.*$/, '') || 'U', 'KiCad Legacy');
        comps.push(placeDefOnSheet({ def, customDefs, refDes: ref, value: val || libName, x, y, angle }));
      }
    } else if (line.startsWith('Wire Wire Line') || line.startsWith('Wire Bus Line')) {
      const isBus = line.startsWith('Wire Bus');
      const next = (lines[i + 1] || '').trim().split(/\s+/).map(Number);
      if (next.length >= 4 && next.every(Number.isFinite)) {
        const pts = [{ x: Math.round(next[0] * scale * 100) / 100, y: Math.round(next[1] * scale * 100) / 100 }, { x: Math.round(next[2] * scale * 100) / 100, y: Math.round(next[3] * scale * 100) / 100 }];
        if (isBus) buses.push({ id: uid('klb'), busName: 'BUS', points: pts });
        else wires.push({ id: uid('klw'), points: pts, netName: '' });
        i++;
      }
    } else if (line.startsWith('Connection ')) {
      const p = line.split(/\s+/);
      if (p.length >= 4) junctions.push({ id: uid('klj'), x: Math.round(parseFloat(p[2]) * scale * 100) / 100, y: Math.round(parseFloat(p[3]) * scale * 100) / 100, netName: '' });
    } else if (line.startsWith('Text Label ') || line.startsWith('Text GLabel ') || line.startsWith('Text HLabel ')) {
      const p = line.split(/\s+/);
      const net = (lines[i + 1] || '').trim();
      if (net && p.length >= 5) {
        netPorts.push({ id: uid('kll'), netName: net, style: /GND|VSS/i.test(net) ? 'Ground' : /VCC|VDD|\+/i.test(net) ? 'Power' : 'OffPageOut', x: Math.round(parseFloat(p[2]) * scale * 100) / 100, y: Math.round(parseFloat(p[3]) * scale * 100) / 100, angle: 0 });
        i++;
      }
    }
  }

  return convertImportedSchematicToGost(makeEcadSchematicProject({ name, components: comps, wires, customDefs, buses, junctions, netPorts }), 'KiCad Legacy (.sch)');
}

/** Parses KiCad schematics (.kicad_sch modern S-expr or legacy EESchema .sch). */
export function parseKicadSchematic(text: string, name = 'KiCad_Import'): {
  project: SchematicProject;
  report: GostConversionReport;
} {
  if (text.trimStart().startsWith('EESchema Schematic File')) return parseLegacyKicadSchematic(text, name);

  const ast = parseSExpressions(text);
  const root = ast.find((n) => n[0] === 'kicad_sch');
  if (!root) throw new Error('Некорректный формат схемы KiCad (.kicad_sch)');

  const libMap = buildLibSymbolMap(root);
  const customDefs: Record<string, ComponentDef> = {};
  const components: PlacedComponent[] = [];
  const wires: SchWire[] = [];
  const buses: SchBus[] = [];
  const junctions: SchJunction[] = [];
  const netPorts: SchNetPort[] = [];
  const shapes: SchShape[] = [];

  for (const sym of sxFindAll(root, 'symbol')) {
    const libId = sxStr(sxFind(sym, 'lib_id'), 1) || 'Device:R';
    const atNode = sxFind(sym, 'at');
    const x = sxNum(atNode, 1, 50), y = sxNum(atNode, 2, 50);
    const angle = snapAngle90(sxNum(atNode, 3, 0));
    const mirror = sxStr(sxFind(sym, 'mirror'), 1);
    const unitNode = sxFind(sym, 'unit');
    const unit = unitNode ? sxNum(unitNode, 1, 1) : 1;

    const props = new Map<string, string>();
    for (const pr of sxFindAll(sym, 'property')) props.set(sxStr(pr, 1).toLowerCase(), sxStr(pr, 2));
    const refDes = props.get('reference') || `U${components.length + 1}`;
    const value = props.get('value') || libId.split(':').pop() || '';

    if (refDes.startsWith('#PWR') || libId.startsWith('power:')) {
      const pwrNet = value || libId.split(':').pop() || 'VCC';
      netPorts.push({ id: uid('kpwr'), netName: pwrNet, style: /GND|VSS/i.test(pwrNet) ? 'Ground' : 'Power', x, y, angle });
      // Also keep power net-port component entry so GOST connectivity & net-port inspection preserve distinct power rails (VCC/GND/VSS)
      const pwrDef = makeComponentDef({
        name: pwrNet,
        library: 'KiCad Power',
        refDesPrefix: '#PWR',
        defaultValue: pwrNet,
        patternId: '',
        description: `Power net ${pwrNet}`,
        pins: [{ id: uid('kppin'), number: '1', name: pwrNet, x: 0, y: 0, length: 0, orientation: 0, electricalType: 'Power', style: 'Line', showName: true, showNumber: false }],
        primitives: [{ type: 'line', x1: -2, y1: 0, x2: 2, y2: 0, width: 0.35 }]
      });
      pwrDef.isNetPort = true;
      pwrDef.portNetName = pwrNet;
      components.push(placeDefOnSheet({ def: pwrDef, customDefs, refDes, value: pwrNet, x, y, angle, showValue: true, partIndex: unit }));
      continue;
    }

    const template = libMap.get(libId);
    let def: ComponentDef;
    if (template) {
      def = template;
      customDefs[template.name] = template;
    } else {
      def = makeChipComponentDef(libId.split(':').pop() || 'IC', Math.max(2, sxFindAll(sym, 'pin').length), refDes.replace(/\d+.*$/, '') || 'U', 'KiCad');
    }

    components.push(placeDefOnSheet({ def, customDefs, refDes, value, x, y, angle, flipX: mirror === 'y', flipY: mirror === 'x', partIndex: unit }));
  }

  for (const sheetNode of sxFindAll(root, 'sheet')) {
    const at = sxFind(sheetNode, 'at');
    const sx = sxNum(at, 1, 50), sy = sxNum(at, 2, 50);
    const size = sxFind(sheetNode, 'size');
    const sw = sxNum(size, 1, 30), sh = sxNum(size, 2, 20);
    const props = new Map<string, string>();
    for (const pr of sxFindAll(sheetNode, 'property')) props.set(sxStr(pr, 1).toLowerCase(), sxStr(pr, 2));
    const sheetName = props.get('sheetname') || 'Sheet';
    const sheetFile = props.get('sheetfile') || '';
    const sheetPins = sxFindAll(sheetNode, 'pin').map((p, idx) => {
      const pinAt = sxFind(p, 'at');
      const px = pinAt ? sxNum(pinAt, 1, 0) - sx : 0;
      const py = pinAt ? sxNum(pinAt, 2, 0) - sy : (idx + 1) * 5;
      return {
        id: uid('s_pin'),
        number: String(idx + 1),
        name: sxStr(p, 1),
        x: px,
        y: py,
        length: 2.54,
        orientation: 0 as const,
        electricalType: 'Passive' as const,
        style: 'Line' as const,
        showName: true,
        showNumber: false
      };
    });
    const sheetDef = makeComponentDef({
      name: sheetName,
      library: 'KiCad Hierarchical Sheet',
      refDesPrefix: 'SHEET',
      defaultValue: sheetFile,
      patternId: '',
      description: `Hierarchical Sheet: ${sheetFile}`,
      pins: sheetPins,
      primitives: [{ type: 'rect', x: 0, y: 0, w: sw, h: sh, width: 0.5 }]
    });
    components.push(placeDefOnSheet({
      def: sheetDef,
      customDefs,
      refDes: sheetName,
      value: sheetFile,
      x: sx,
      y: sy,
      showValue: true
    }));
  }

  for (const w of sxFindAll(root, 'wire')) {
    const ptsNode = sxFind(w, 'pts');
    if (!ptsNode) continue;
    const pts = sxFindAll(ptsNode, 'xy').map((xy) => ({ x: sxNum(xy, 1), y: sxNum(xy, 2) }));
    for (let i = 0; i + 1 < pts.length; i++) wires.push({ id: uid('kw'), points: [pts[i], pts[i + 1]], netName: '' });
  }
  for (const b of sxFindAll(root, 'bus')) {
    const ptsNode = sxFind(b, 'pts');
    if (!ptsNode) continue;
    const pts = sxFindAll(ptsNode, 'xy').map((xy) => ({ x: sxNum(xy, 1), y: sxNum(xy, 2) }));
    if (pts.length >= 2) buses.push({ id: uid('kb'), busName: 'BUS', points: pts });
  }
  for (const jn of sxFindAll(root, 'junction')) {
    const at = sxFind(jn, 'at');
    if (at) junctions.push({ id: uid('kj'), x: sxNum(at, 1), y: sxNum(at, 2), netName: '' });
  }
  for (const tag of ['label', 'global_label', 'hierarchical_label'] as const) {
    for (const lb of sxFindAll(root, tag)) {
      const netName = sxStr(lb, 1);
      const at = sxFind(lb, 'at');
      if (netName && at) {
        netPorts.push({ id: uid('knp'), netName, style: /GND|VSS/i.test(netName) ? 'Ground' : /VCC|VDD|\+/i.test(netName) ? 'Power' : 'OffPageOut', x: sxNum(at, 1), y: sxNum(at, 2), angle: snapAngle90(sxNum(at, 3, 0)) });
      }
    }
  }
  for (const pl of sxFindAll(root, 'polyline')) {
    const ptsNode = sxFind(pl, 'pts');
    if (!ptsNode) continue;
    const pts = sxFindAll(ptsNode, 'xy').map((xy) => ({ x: sxNum(xy, 1), y: sxNum(xy, 2) }));
    for (let i = 0; i + 1 < pts.length; i++) shapes.push({ id: uid('kpl'), type: 'line', x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y, width: 0.25 });
  }

  return convertImportedSchematicToGost(makeEcadSchematicProject({ name, components, wires, customDefs, buses, junctions, netPorts, shapes }), 'KiCad (.kicad_sch)');
}
