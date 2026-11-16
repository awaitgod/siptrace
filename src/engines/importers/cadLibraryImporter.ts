import {
  ComponentDef,
  PadDef,
  PadShape,
  PatternDef,
  PatternGraphic,
  PatternLayer,
  PinElectricalType,
  PinOrientation,
  Point2D,
  SymbolPin,
  SymbolPrimitive
} from '../../core/types';
import { uid } from '../../core/geometry';
import { extractZipEntries, isZipBuffer, utf8Decode } from '../../core/utils/zipArchive';
import { parseSExpressions, SExprList, sxFind, sxFindAll, sxNum, sxStr } from './sexprParser';
import { parseMiniXml, xmlFindAll, xmlFindFirst } from './xmlMiniParser';
import {
  detectDipTraceBinaryFormat,
  parseDipTraceBinaryEli,
  parseDipTraceBinaryLib
} from './dipTraceBinaryParser';
import { parseDipTraceAsciiLibrary } from './dipTraceImporter';
import {
  convertValueToGost,
  GostConversionItem,
  GostConversionReport,
  mapForeignPatternToGost,
  mapForeignPrefixToGost,
  resolveOrBuildGostComponent
} from './gostConverter';

export interface CadLibraryImportOptions {
  /** When true (default), adapts RefDes, values and standard components to GOST 2.710-81; when false, preserves original symbols/footprints. */
  adaptToGost?: boolean;
  /** Optional explicit library name override. */
  libraryName?: string;
}

export interface CadLibraryImportResult {
  libraryName: string;
  categories: string[];
  components: ComponentDef[];
  patterns: PatternDef[];
  report: GostConversionReport;
  detectedFormat: string;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function stripExt(filename: string): string {
  return filename.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || 'Импорт_CAD';
}

function buildCourtyardFromPads(pads: PadDef[], fallbackW = 8, fallbackH = 6): { width: number; height: number } {
  if (!pads.length) return { width: fallbackW, height: fallbackH };
  const xs = pads.flatMap((p) => [p.x - p.width / 2, p.x + p.width / 2]);
  const ys = pads.flatMap((p) => [p.y - p.height / 2, p.y + p.height / 2]);
  return {
    width: round3(Math.max(2, Math.max(...xs) - Math.min(...xs) + 1.4)),
    height: round3(Math.max(2, Math.max(...ys) - Math.min(...ys) + 1.4))
  };
}

function inferModel3dFromPads(pads: PadDef[], courtyard: { width: number; height: number }): PatternDef['model3d'] {
  const hasTht = pads.some((p) => p.type === 'THT');
  const pinCount = pads.filter((p) => p.type !== 'MountingHole').length;
  return {
    shape: pinCount <= 2 ? (hasTht ? 'AxialResistor' : 'ChipSMD') : (hasTht ? 'DIP' : (pinCount >= 24 ? 'QFP' : 'SOIC')),
    bodyWidth: round3(Math.max(1.2, courtyard.width * 0.72)),
    bodyLength: round3(Math.max(1.2, courtyard.height * 0.72)),
    bodyHeight: hasTht ? 3.2 : 1.5,
    color: '#23252b',
    pinCount
  };
}

// =========================================================================
// 1. KiCad .kicad_sym & .kicad_mod parser (full geometry + pins + pads)
// =========================================================================

function mapKicadPinType(raw: string): PinElectricalType {
  switch (raw) {
    case 'input': return 'Input';
    case 'output': return 'Output';
    case 'bidirectional': return 'Bidirectional';
    case 'tri_state': return 'TriState';
    case 'open_collector':
    case 'open_emitter': return 'OpenCollector';
    case 'power_in':
    case 'power_out': return 'Power';
    case 'no_connect': return 'NotConnected';
    default: return 'Passive';
  }
}

function mapKicadPinAngle(deg: number): PinOrientation {
  // KiCad pin angle points from connection tip INTO body: 0=right, 90=up, 180=left, 270=down
  // In SIPTrace Y-down canvas: 0=right, 90=down, 180=left, 270=up
  const norm = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  if (norm === 90) return 270;
  if (norm === 270) return 90;
  return norm as PinOrientation;
}

function parseKicadSymbolLib(text: string, libName: string, adaptToGost: boolean): CadLibraryImportResult {
  const roots = parseSExpressions(text);
  const root = roots[0] ?? [];
  const components: ComponentDef[] = [];
  const items: GostConversionItem[] = [];
  const customDefs: Record<string, ComponentDef> = {};

  for (const sym of sxFindAll(root, 'symbol')) {
    const symName = sxStr(sym, 1);
    if (!symName) continue;

    let refPrefix = 'U';
    let value = symName;
    let footprint = '';
    let datasheet = '';
    for (const prop of sxFindAll(sym, 'property')) {
      const k = sxStr(prop, 1).toLowerCase();
      const v = sxStr(prop, 2);
      if (k === 'reference' && v) refPrefix = v.replace(/[^A-Za-zА-Яа-я]/g, '') || 'U';
      else if (k === 'value' && v) value = v;
      else if (k === 'footprint' && v) footprint = v.split(':').pop() || v;
      else if (k === 'datasheet' && v && v !== '~') datasheet = v;
    }

    const subSyms = [sym, ...sxFindAll(sym, 'symbol')];
    const primitives: SymbolPrimitive[] = [];
    const pins: SymbolPin[] = [];

    for (const unit of subSyms) {
      for (const rect of sxFindAll(unit, 'rectangle')) {
        const s = sxFind(rect, 'start');
        const e = sxFind(rect, 'end');
        if (s && e) {
          const x1 = sxNum(s, 1), y1 = -sxNum(s, 2);
          const x2 = sxNum(e, 1), y2 = -sxNum(e, 2);
          primitives.push({
            type: 'rect',
            x: round3(Math.min(x1, x2)),
            y: round3(Math.min(y1, y2)),
            w: round3(Math.abs(x2 - x1)),
            h: round3(Math.abs(y2 - y1)),
            width: 0.35
          });
        }
      }
      for (const poly of sxFindAll(unit, 'polyline')) {
        const ptsNode = sxFind(poly, 'pts');
        if (!ptsNode) continue;
        const pts = sxFindAll(ptsNode, 'xy').map((xy) => ({ x: round3(sxNum(xy, 1)), y: round3(-sxNum(xy, 2)) }));
        if (pts.length >= 2) primitives.push({ type: 'polyline', points: pts, width: 0.32 });
      }
      for (const cir of sxFindAll(unit, 'circle')) {
        const c = sxFind(cir, 'center');
        const r = sxFind(cir, 'radius');
        if (c && r) {
          primitives.push({ type: 'circle', cx: round3(sxNum(c, 1)), cy: round3(-sxNum(c, 2)), r: round3(sxNum(r, 1, 2)), width: 0.32 });
        }
      }
      for (const pn of sxFindAll(unit, 'pin')) {
        const elec = mapKicadPinType(sxStr(pn, 1));
        const styleStr = sxStr(pn, 2);
        const at = sxFind(pn, 'at');
        const len = sxNum(sxFind(pn, 'length'), 1, 2.54);
        const pName = sxStr(sxFind(pn, 'name'), 1) || '';
        const pNum = sxStr(sxFind(pn, 'number'), 1) || String(pins.length + 1);
        pins.push({
          id: `kp_${pins.length + 1}`,
          number: pNum,
          name: pName === '~' ? '' : pName,
          x: round3(sxNum(at, 1)),
          y: round3(-sxNum(at, 2)),
          length: round3(Math.max(1.0, len)),
          orientation: mapKicadPinAngle(sxNum(at, 3, 0)),
          electricalType: elec,
          style: styleStr.includes('inverted') ? 'Inverted' : styleStr.includes('clock') ? 'Clock' : 'Line',
          showName: Boolean(pName && pName !== '~'),
          showNumber: true,
          padMapping: pNum
        });
      }
    }

    const gostPrefix = adaptToGost ? mapForeignPrefixToGost(refPrefix, `${symName} ${value} ${footprint}`) : refPrefix;
    const gostValue = adaptToGost ? convertValueToGost(value, gostPrefix) : value;
    const gostPat = adaptToGost ? mapForeignPatternToGost(footprint, pins.length || 2, gostPrefix) : footprint;
    let finalPrimitives = primitives;
    let finalPins = pins;
    let gostStd = 'KiCad Symbol';

    if (adaptToGost && primitives.length === 0 && pins.length <= 2) {
      const resolved = resolveOrBuildGostComponent({
        rawRef: `${refPrefix}1`,
        rawName: symName,
        rawValue: value,
        rawPattern: footprint,
        pins: pins.map((p) => ({ number: p.number, name: p.name, x: p.x, y: p.y })),
        customDefs
      });
      gostStd = 'ГОСТ 2.710-81 (KiCad → ГОСТ)';
      void resolved;
    } else if (adaptToGost) {
      gostStd = 'KiCad → ГОСТ 2.710-81';
    }

    if (finalPrimitives.length === 0 && finalPins.length > 0) {
      const xs = finalPins.map((p) => p.x);
      const ys = finalPins.map((p) => p.y);
      const w = Math.max(10, Math.max(...xs) - Math.min(...xs) - 5);
      const h = Math.max(10, Math.max(...ys) - Math.min(...ys) + 5);
      finalPrimitives = [{ type: 'rect', x: round3(-w / 2), y: round3(-h / 2), w: round3(w), h: round3(h), width: 0.4 }];
    }

    const compId = `COMP_KC_${libName.replace(/[^A-Za-z0-9]/g, '_').slice(0, 14)}_${symName.replace(/[^A-Za-z0-9]/g, '_').slice(0, 28)}_${components.length + 1}`;
    components.push({
      id: compId,
      name: symName,
      library: libName,
      refDesPrefix: gostPrefix,
      defaultValue: gostValue || symName,
      gostStandard: gostStd,
      description: `Импортировано из KiCad (${libName})${datasheet ? ` · ${datasheet}` : ''}`,
      manufacturer: 'KiCad Library',
      patternId: gostPat || 'PAT_DIP8',
      attributes: footprint ? { originalFootprint: footprint } : undefined,
      parts: [{ partIndex: 1, name: 'Секция 1', primitives: finalPrimitives, pins: finalPins }]
    });

    items.push({
      originalRef: refPrefix,
      gostRef: gostPrefix,
      originalValue: value,
      gostValue: gostValue || value,
      originalPattern: footprint || '-',
      gostPattern: gostPat || '-',
      action: `KiCad символ: ${symName} (${finalPins.length} выв.)`
    });
  }

  return {
    libraryName: libName,
    categories: ['KiCad Символы'],
    components,
    patterns: [],
    detectedFormat: 'KiCad Symbol Library (.kicad_sym)',
    report: {
      sourceFormat: 'KiCad Symbol Library (.kicad_sym)',
      convertedComponents: components.length,
      convertedSymbolsToUgo: components.length,
      convertedPatterns: 0,
      items
    }
  };
}

function mapKicadModLayer(raw: string): PatternLayer {
  const s = raw.toLowerCase();
  if (s.includes('b.silk')) return 'BottomSilk';
  if (s.includes('f.fab')) return 'TopAssembly';
  if (s.includes('b.fab')) return 'BottomAssembly';
  if (s.includes('crtyd')) return 'Courtyard';
  if (s.includes('f.cu')) return 'TopCopper';
  if (s.includes('b.cu')) return 'BottomCopper';
  return 'TopSilk';
}

function parseKicadFootprintMod(text: string, libName: string): CadLibraryImportResult {
  const roots = parseSExpressions(text);
  const root = roots[0] ?? [];
  const pName = sxStr(root, 1) || libName;

  const pads: PadDef[] = sxFindAll(root, 'pad').map((pd, i) => {
    const pAt = sxFind(pd, 'at');
    const pSz = sxFind(pd, 'size');
    const drill = sxFind(pd, 'drill');
    const hole = drill ? sxNum(drill, 1, 0) : 0;
    const pTypeRaw = sxStr(pd, 2);
    const pShapeRaw = sxStr(pd, 3);
    const shape: PadShape =
      pShapeRaw === 'circle' ? 'Round' : pShapeRaw === 'oval' ? 'Oval' : pShapeRaw === 'roundrect' ? 'RoundedRect' : 'Rect';
    const ang = sxNum(pAt, 3, 0);
    return {
      id: uid('kmpd'),
      number: sxStr(pd, 1) || String(i + 1),
      type: pTypeRaw === 'np_thru_hole' ? 'MountingHole' : pTypeRaw === 'thru_hole' ? 'THT' : 'SMD',
      shape,
      x: round3(sxNum(pAt, 1)),
      y: round3(sxNum(pAt, 2)),
      angle: ang ? ((-ang % 360) + 360) % 360 : undefined,
      width: round3(Math.max(0.25, sxNum(pSz, 1, 1.4))),
      height: round3(Math.max(0.25, sxNum(pSz, 2, 1.4))),
      holeDiameter: hole > 0 ? round3(hole) : undefined,
      layer: hole > 0 ? 'All' : 'Top'
    };
  });

  const graphics: PatternGraphic[] = [];
  for (const ln of sxFindAll(root, 'fp_line')) {
    const s = sxFind(ln, 'start'), e = sxFind(ln, 'end');
    const lay = mapKicadModLayer(sxStr(sxFind(ln, 'layer'), 1));
    if (s && e) {
      graphics.push({
        type: 'line', layer: lay,
        x1: round3(sxNum(s, 1)), y1: round3(sxNum(s, 2)),
        x2: round3(sxNum(e, 1)), y2: round3(sxNum(e, 2)),
        width: Math.max(0.1, sxNum(sxFind(ln, 'width'), 1, 0.15))
      });
    }
  }
  for (const rc of sxFindAll(root, 'fp_rect')) {
    const s = sxFind(rc, 'start'), e = sxFind(rc, 'end');
    const lay = mapKicadModLayer(sxStr(sxFind(rc, 'layer'), 1));
    if (s && e) {
      const x1 = sxNum(s, 1), y1 = sxNum(s, 2), x2 = sxNum(e, 1), y2 = sxNum(e, 2);
      graphics.push({
        type: 'rect', layer: lay,
        x: round3(Math.min(x1, x2)), y: round3(Math.min(y1, y2)),
        w: round3(Math.abs(x2 - x1)), h: round3(Math.abs(y2 - y1)),
        width: Math.max(0.1, sxNum(sxFind(rc, 'width'), 1, 0.15))
      });
    }
  }
  for (const cir of sxFindAll(root, 'fp_circle')) {
    const c = sxFind(cir, 'center'), e = sxFind(cir, 'end');
    const lay = mapKicadModLayer(sxStr(sxFind(cir, 'layer'), 1));
    if (c && e) {
      const r = Math.hypot(sxNum(e, 1) - sxNum(c, 1), sxNum(e, 2) - sxNum(c, 2));
      graphics.push({
        type: 'circle', layer: lay,
        cx: round3(sxNum(c, 1)), cy: round3(sxNum(c, 2)), r: round3(r),
        width: Math.max(0.1, sxNum(sxFind(cir, 'width'), 1, 0.15))
      });
    }
  }

  const courtyard = buildCourtyardFromPads(pads);
  if (graphics.length === 0) {
    graphics.push({ type: 'rect', layer: 'TopSilk', x: round3(-courtyard.width / 2), y: round3(-courtyard.height / 2), w: courtyard.width, h: courtyard.height, width: 0.15 });
  }

  const pat: PatternDef = {
    id: `PAT_KC_${pName.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 36)}`,
    name: pName,
    library: libName,
    gostName: 'ГОСТ / KiCad',
    description: `Импортировано из KiCad (.kicad_mod): ${pName}`,
    pads,
    graphics,
    courtyard,
    model3d: inferModel3dFromPads(pads, courtyard)
  };

  return {
    libraryName: libName,
    categories: ['KiCad Корпуса'],
    components: [],
    patterns: [pat],
    detectedFormat: 'KiCad Footprint (.kicad_mod)',
    report: {
      sourceFormat: 'KiCad Footprint (.kicad_mod)',
      convertedComponents: 0,
      convertedSymbolsToUgo: 0,
      convertedPatterns: 1,
      items: [{ originalRef: '-', gostRef: pat.name, originalValue: '-', gostValue: `${pads.length} падов`, originalPattern: pName, gostPattern: pat.id, action: `Корпус KiCad: ${pat.name}` }]
    }
  };
}

// =========================================================================
// 2. Eagle XML Library (.lbr) — packages + symbols + devicesets
// =========================================================================

function parseEagleLbr(xml: string, libName: string, adaptToGost: boolean): CadLibraryImportResult {
  const root = parseMiniXml(xml);
  const patterns: PatternDef[] = [];
  const patByName = new Map<string, PatternDef>();
  const symByName = new Map<string, { primitives: SymbolPrimitive[]; pins: SymbolPin[] }>();
  const components: ComponentDef[] = [];
  const items: GostConversionItem[] = [];

  for (const pkg of xmlFindAll(root, 'package')) {
    const pName = pkg.attrs.name || `EaglePkg_${patterns.length + 1}`;
    const pads: PadDef[] = [];
    for (const smd of xmlFindAll(pkg, 'smd')) {
      const rot = parseFloat((smd.attrs.rot || '0').replace(/[^-\d.]/g, '')) || 0;
      pads.push({
        id: uid('egsmd'),
        number: smd.attrs.name || String(pads.length + 1),
        type: 'SMD',
        shape: 'Rect',
        x: round3(parseFloat(smd.attrs.x || '0') || 0),
        y: round3(-(parseFloat(smd.attrs.y || '0') || 0)),
        width: round3(Math.max(0.25, parseFloat(smd.attrs.dx || '1.0') || 1.0)),
        height: round3(Math.max(0.25, parseFloat(smd.attrs.dy || '1.0') || 1.0)),
        angle: rot ? ((-rot % 360) + 360) % 360 : undefined,
        layer: 'Top'
      });
    }
    for (const pad of xmlFindAll(pkg, 'pad')) {
      const hole = parseFloat(pad.attrs.drill || '0.8') || 0.8;
      const dia = parseFloat(pad.attrs.diameter || '0') || hole + 0.7;
      pads.push({
        id: uid('egtht'),
        number: pad.attrs.name || String(pads.length + 1),
        type: 'THT',
        shape: pad.attrs.shape === 'square' ? 'Rect' : pad.attrs.shape === 'long' ? 'Oval' : 'Round',
        x: round3(parseFloat(pad.attrs.x || '0') || 0),
        y: round3(-(parseFloat(pad.attrs.y || '0') || 0)),
        width: round3(Math.max(hole + 0.4, dia)),
        height: round3(Math.max(hole + 0.4, dia)),
        holeDiameter: round3(hole),
        layer: 'All'
      });
    }
    const graphics: PatternGraphic[] = [];
    for (const w of xmlFindAll(pkg, 'wire')) {
      const lay = w.attrs.layer === '21' || w.attrs.layer === '25' ? 'TopSilk' : w.attrs.layer === '51' ? 'TopAssembly' : null;
      if (!lay) continue;
      graphics.push({
        type: 'line', layer: lay,
        x1: round3(parseFloat(w.attrs.x1 || '0') || 0),
        y1: round3(-(parseFloat(w.attrs.y1 || '0') || 0)),
        x2: round3(parseFloat(w.attrs.x2 || '0') || 0),
        y2: round3(-(parseFloat(w.attrs.y2 || '0') || 0)),
        width: Math.max(0.1, parseFloat(w.attrs.width || '0.15') || 0.15)
      });
    }
    for (const r of xmlFindAll(pkg, 'rectangle')) {
      const lay = r.attrs.layer === '21' ? 'TopSilk' : r.attrs.layer === '51' ? 'TopAssembly' : null;
      if (!lay) continue;
      const x1 = parseFloat(r.attrs.x1 || '0') || 0;
      const y1 = -(parseFloat(r.attrs.y1 || '0') || 0);
      const x2 = parseFloat(r.attrs.x2 || '0') || 0;
      const y2 = -(parseFloat(r.attrs.y2 || '0') || 0);
      graphics.push({
        type: 'rect', layer: lay,
        x: round3(Math.min(x1, x2)), y: round3(Math.min(y1, y2)),
        w: round3(Math.abs(x2 - x1)), h: round3(Math.abs(y2 - y1)),
        width: 0.15
      });
    }
    for (const c of xmlFindAll(pkg, 'circle')) {
      const lay = c.attrs.layer === '21' ? 'TopSilk' : c.attrs.layer === '51' ? 'TopAssembly' : null;
      if (!lay) continue;
      graphics.push({
        type: 'circle', layer: lay,
        cx: round3(parseFloat(c.attrs.x || '0') || 0),
        cy: round3(-(parseFloat(c.attrs.y || '0') || 0)),
        r: round3(Math.max(0.1, parseFloat(c.attrs.radius || '1') || 1)),
        width: Math.max(0.1, parseFloat(c.attrs.width || '0.15') || 0.15)
      });
    }
    const courtyard = buildCourtyardFromPads(pads);
    if (graphics.length === 0) {
      graphics.push({ type: 'rect', layer: 'TopSilk', x: round3(-courtyard.width / 2), y: round3(-courtyard.height / 2), w: courtyard.width, h: courtyard.height, width: 0.15 });
    }
    const pat: PatternDef = {
      id: `PAT_EG_${libName.replace(/[^A-Za-z0-9]/g, '_').slice(0, 12)}_${pName.replace(/[^A-Za-z0-9]/g, '_').slice(0, 28)}`,
      name: pName,
      library: libName,
      gostName: 'ГОСТ / Eagle',
      description: `Корпус Eagle LBR: ${pName}`,
      pads,
      graphics,
      courtyard,
      model3d: inferModel3dFromPads(pads, courtyard)
    };
    patterns.push(pat);
    patByName.set(pName, pat);
  }

  for (const sym of xmlFindAll(root, 'symbol')) {
    const sName = sym.attrs.name || '';
    if (!sName) continue;
    const primitives: SymbolPrimitive[] = [];
    const pins: SymbolPin[] = [];
    for (const w of xmlFindAll(sym, 'wire')) {
      primitives.push({
        type: 'line',
        x1: round3(parseFloat(w.attrs.x1 || '0') || 0),
        y1: round3(-(parseFloat(w.attrs.y1 || '0') || 0)),
        x2: round3(parseFloat(w.attrs.x2 || '0') || 0),
        y2: round3(-(parseFloat(w.attrs.y2 || '0') || 0)),
        width: Math.max(0.15, parseFloat(w.attrs.width || '0.25') || 0.25)
      });
    }
    for (const r of xmlFindAll(sym, 'rectangle')) {
      const x1 = parseFloat(r.attrs.x1 || '0') || 0;
      const y1 = -(parseFloat(r.attrs.y1 || '0') || 0);
      const x2 = parseFloat(r.attrs.x2 || '0') || 0;
      const y2 = -(parseFloat(r.attrs.y2 || '0') || 0);
      primitives.push({
        type: 'rect',
        x: round3(Math.min(x1, x2)), y: round3(Math.min(y1, y2)),
        w: round3(Math.abs(x2 - x1)), h: round3(Math.abs(y2 - y1)),
        width: 0.3
      });
    }
    for (const pn of xmlFindAll(sym, 'pin')) {
      const lenStr = pn.attrs.length || 'middle';
      const len = lenStr === 'point' ? 1 : lenStr === 'short' ? 2.54 : lenStr === 'long' ? 7.62 : 5.08;
      const rot = pn.attrs.rot || 'R0';
      const deg = parseFloat(rot.replace(/[^-\d.]/g, '')) || 0;
      const num = String(pins.length + 1);
      pins.push({
        id: `egp_${pins.length + 1}`,
        number: num,
        name: pn.attrs.name || num,
        x: round3(parseFloat(pn.attrs.x || '0') || 0),
        y: round3(-(parseFloat(pn.attrs.y || '0') || 0)),
        length: len,
        orientation: mapKicadPinAngle(deg),
        electricalType: pn.attrs.direction === 'in' ? 'Input' : pn.attrs.direction === 'out' ? 'Output' : pn.attrs.direction === 'pwr' ? 'Power' : 'Passive',
        style: pn.attrs.function === 'dot' ? 'Inverted' : pn.attrs.function === 'clk' ? 'Clock' : 'Line',
        showName: Boolean(pn.attrs.name),
        showNumber: true,
        padMapping: num
      });
    }
    symByName.set(sName, { primitives, pins });
  }

  for (const ds of xmlFindAll(root, 'deviceset')) {
    const dsName = ds.attrs.name || `Device_${components.length + 1}`;
    const rawPrefix = ds.attrs.prefix || 'U';
    const gate = xmlFindFirst(ds, 'gate');
    const symData = gate ? symByName.get(gate.attrs.symbol || '') : undefined;
    const dev = xmlFindFirst(ds, 'device');
    const pkgName = dev?.attrs.package || '';
    const matchedPat = patByName.get(pkgName);

    const pins = symData ? symData.pins.map((p) => ({ ...p })) : [];
    if (dev) {
      for (const conn of xmlFindAll(dev, 'connect')) {
        const pinName = conn.attrs.pin || '';
        const padName = conn.attrs.pad || '';
        const target = pins.find((p) => p.name === pinName);
        if (target && padName) {
          target.number = padName;
          target.padMapping = padName;
        }
      }
    }

    const gostPrefix = adaptToGost ? mapForeignPrefixToGost(rawPrefix, dsName) : rawPrefix;
    const patId = matchedPat?.id || mapForeignPatternToGost(pkgName, pins.length || 2, gostPrefix);
    components.push({
      id: `COMP_EG_${libName.replace(/[^A-Za-z0-9]/g, '_').slice(0, 12)}_${dsName.replace(/[^A-Za-z0-9]/g, '_').slice(0, 28)}_${components.length + 1}`,
      name: dsName,
      library: libName,
      refDesPrefix: gostPrefix,
      defaultValue: dsName,
      gostStandard: adaptToGost ? 'Eagle LBR → ГОСТ 2.710-81' : 'Autodesk Eagle LBR',
      description: `Импорт из Eagle LBR (${libName})`,
      manufacturer: 'Eagle Library',
      patternId: patId,
      parts: [{ partIndex: 1, name: 'Секция 1', primitives: symData?.primitives ?? [], pins }]
    });
    items.push({
      originalRef: rawPrefix,
      gostRef: gostPrefix,
      originalValue: dsName,
      gostValue: dsName,
      originalPattern: pkgName || '-',
      gostPattern: patId,
      action: `Eagle компонент: ${dsName} → ${pkgName || patId}`
    });
  }

  // Fallback if LBR had symbols without devicesets
  if (components.length === 0 && symByName.size > 0) {
    for (const [sName, sym] of symByName.entries()) {
      components.push({
        id: `COMP_EG_${sName.replace(/[^A-Za-z0-9]/g, '_')}_${components.length + 1}`,
        name: sName,
        library: libName,
        refDesPrefix: 'DD',
        defaultValue: sName,
        gostStandard: 'Eagle LBR → ГОСТ 2.710-81',
        description: `Символ Eagle LBR: ${sName}`,
        patternId: patterns[0]?.id || 'PAT_DIP8',
        parts: [{ partIndex: 1, name: 'Секция 1', primitives: sym.primitives, pins: sym.pins }]
      });
    }
  }

  return {
    libraryName: libName,
    categories: ['Eagle LBR'],
    components,
    patterns,
    detectedFormat: 'Autodesk Eagle Library (.lbr)',
    report: {
      sourceFormat: 'Autodesk Eagle Library (.lbr)',
      convertedComponents: components.length,
      convertedSymbolsToUgo: components.length,
      convertedPatterns: patterns.length,
      items
    }
  };
}

// =========================================================================
// 3. EasyEDA / LCEDA JSON Library (Symbol & Footprint shapes)
// =========================================================================

function parseEasyEdaLibraryJson(text: string, libName: string, adaptToGost: boolean): CadLibraryImportResult {
  const obj = JSON.parse(text) as {
    title?: string;
    docType?: string | number;
    head?: { c_para?: Record<string, string> };
    shape?: string[];
    packageDetail?: { dataStr?: { shape?: string[]; head?: { c_para?: Record<string, string> } } };
    dataStr?: { shape?: string[]; head?: { c_para?: Record<string, string> } };
  };

  const cPara = obj.head?.c_para ?? obj.dataStr?.head?.c_para ?? {};
  const title = obj.title || cPara.name || cPara['Manufacturer Part'] || libName;
  const shapes = obj.shape ?? obj.dataStr?.shape ?? [];
  const pkgShapes = obj.packageDetail?.dataStr?.shape ?? [];

  const components: ComponentDef[] = [];
  const patterns: PatternDef[] = [];
  const items: GostConversionItem[] = [];

  const extractFootprint = (shList: string[], pkgTitle: string): PatternDef | null => {
    const pads: PadDef[] = [];
    const graphics: PatternGraphic[] = [];
    for (const sh of shList) {
      const f = sh.split('~');
      if (f[0] === 'PAD') {
        const shapeRaw = (f[1] || '').toUpperCase();
        const x = (parseFloat(f[2]) || 0) * 0.254;
        const y = (parseFloat(f[3]) || 0) * 0.254;
        const w = Math.max(0.25, (parseFloat(f[4]) || 4) * 0.254);
        const h = Math.max(0.25, (parseFloat(f[5]) || 4) * 0.254);
        const layerId = f[6] || '1';
        const num = f[8] || String(pads.length + 1);
        const hole = (parseFloat(f[9]) || 0) * 0.254;
        pads.push({
          id: uid('ezpd'),
          number: num,
          type: hole > 0 || layerId === '11' ? 'THT' : 'SMD',
          shape: shapeRaw === 'ELLIPSE' ? 'Round' : shapeRaw === 'OVAL' ? 'Oval' : 'Rect',
          x: round3(x),
          y: round3(y),
          width: round3(w),
          height: round3(h),
          holeDiameter: hole > 0 ? round3(hole) : undefined,
          layer: hole > 0 || layerId === '11' ? 'All' : (layerId === '2' ? 'Bottom' : 'Top')
        });
      } else if (f[0] === 'TRACK' && (f[2] === '3' || f[2] === '4' || f[2] === '12')) {
        const coords = (f[4] || '').split(' ').map(Number).filter(Number.isFinite);
        const pts: Point2D[] = [];
        for (let i = 0; i + 1 < coords.length; i += 2) {
          pts.push({ x: round3(coords[i] * 0.254), y: round3(coords[i + 1] * 0.254) });
        }
        if (pts.length >= 2) {
          graphics.push({
            type: 'polyline',
            layer: f[2] === '4' ? 'BottomSilk' : 'TopSilk',
            points: pts,
            width: Math.max(0.1, (parseFloat(f[1]) || 0.6) * 0.254)
          });
        }
      } else if (f[0] === 'HOLE') {
        const x = (parseFloat(f[1]) || 0) * 0.254;
        const y = (parseFloat(f[2]) || 0) * 0.254;
        const d = Math.max(0.4, (parseFloat(f[3]) || 4) * 0.254);
        pads.push({
          id: uid('ezmh'),
          number: `MH${pads.length + 1}`,
          type: 'MountingHole',
          shape: 'Round',
          x: round3(x),
          y: round3(y),
          width: round3(d + 0.4),
          height: round3(d + 0.4),
          holeDiameter: round3(d),
          layer: 'All'
        });
      }
    }
    if (pads.length === 0) return null;
    const cx = pads.reduce((s, p) => s + p.x, 0) / pads.length;
    const cy = pads.reduce((s, p) => s + p.y, 0) / pads.length;
    for (const p of pads) { p.x = round3(p.x - cx); p.y = round3(p.y - cy); }
    for (const g of graphics) {
      if (g.type === 'polyline') {
        g.points = g.points.map((pt) => ({ x: round3(pt.x - cx), y: round3(pt.y - cy) }));
      }
    }
    const courtyard = buildCourtyardFromPads(pads);
    if (graphics.length === 0) {
      graphics.push({ type: 'rect', layer: 'TopSilk', x: round3(-courtyard.width / 2), y: round3(-courtyard.height / 2), w: courtyard.width, h: courtyard.height, width: 0.15 });
    }
    return {
      id: `PAT_EZ_${pkgTitle.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32)}`,
      name: pkgTitle,
      library: libName,
      gostName: 'ГОСТ / EasyEDA',
      description: `Импорт корпуса из EasyEDA JSON: ${pkgTitle}`,
      pads,
      graphics,
      courtyard,
      model3d: inferModel3dFromPads(pads, courtyard)
    };
  };

  // Detect if EasyEDA Footprint (PAD present) or Symbol (P pins present)
  const isFootprintDoc = shapes.some((s) => s.startsWith('PAD~'));
  let linkedPat: PatternDef | null = null;
  if (pkgShapes.length > 0) {
    linkedPat = extractFootprint(pkgShapes, cPara.package || `${title}_PKG`);
    if (linkedPat) patterns.push(linkedPat);
  }
  if (isFootprintDoc) {
    const fp = extractFootprint(shapes, title);
    if (fp) {
      patterns.push(fp);
      items.push({ originalRef: '-', gostRef: fp.name, originalValue: '-', gostValue: `${fp.pads.length} падов`, originalPattern: fp.name, gostPattern: fp.id, action: `EasyEDA корпус: ${fp.name}` });
    }
  } else {
    // Symbol primitives & pins
    const primitives: SymbolPrimitive[] = [];
    const pins: SymbolPin[] = [];
    for (const sh of shapes) {
      const f = sh.split('~');
      if (f[0] === 'P') {
        // P~show~elec~num~x~y~rot~id...
        const num = f[3] || String(pins.length + 1);
        const x = (parseFloat(f[4]) || 0) * 0.254;
        const y = (parseFloat(f[5]) || 0) * 0.254;
        const rot = parseFloat(f[6] || '0') || 0;
        const norm = ((Math.round(rot / 90) * 90) % 360 + 360) % 360 as PinOrientation;
        pins.push({
          id: `ezp_${pins.length + 1}`,
          number: num,
          name: num,
          x: round3(x),
          y: round3(y),
          length: 2.54,
          orientation: norm,
          electricalType: f[2] === '1' ? 'Input' : f[2] === '2' ? 'Output' : f[2] === '5' ? 'Power' : 'Passive',
          style: 'Line',
          showName: true,
          showNumber: true,
          padMapping: num
        });
      } else if (f[0] === 'R') {
        const x = (parseFloat(f[1]) || 0) * 0.254;
        const y = (parseFloat(f[2]) || 0) * 0.254;
        const w = (parseFloat(f[5]) || 10) * 0.254;
        const h = (parseFloat(f[6]) || 10) * 0.254;
        primitives.push({ type: 'rect', x: round3(x), y: round3(y), w: round3(w), h: round3(h), width: 0.35 });
      } else if (f[0] === 'E') {
        const cx = (parseFloat(f[1]) || 0) * 0.254;
        const cy = (parseFloat(f[2]) || 0) * 0.254;
        const r = Math.max(0.5, (parseFloat(f[3]) || 4) * 0.254);
        primitives.push({ type: 'circle', cx: round3(cx), cy: round3(cy), r: round3(r), width: 0.35 });
      } else if (f[0] === 'PL' || f[0] === 'PG') {
        const coords = (f[1] || '').split(' ').map(Number).filter(Number.isFinite);
        const pts: Point2D[] = [];
        for (let i = 0; i + 1 < coords.length; i += 2) {
          pts.push({ x: round3(coords[i] * 0.254), y: round3(coords[i + 1] * 0.254) });
        }
        if (pts.length >= 2) primitives.push({ type: 'polyline', points: pts, closed: f[0] === 'PG', width: 0.32 });
      }
    }
    if (pins.length > 0 || primitives.length > 0) {
      const allPts = [...pins.map((p) => ({ x: p.x, y: p.y }))];
      const cx = allPts.length ? allPts.reduce((s, p) => s + p.x, 0) / allPts.length : 0;
      const cy = allPts.length ? allPts.reduce((s, p) => s + p.y, 0) / allPts.length : 0;
      for (const p of pins) { p.x = round3(p.x - cx); p.y = round3(p.y - cy); }
      for (const pr of primitives) {
        if (pr.type === 'rect') { pr.x = round3(pr.x - cx); pr.y = round3(pr.y - cy); }
        else if (pr.type === 'circle') { pr.cx = round3(pr.cx - cx); pr.cy = round3(pr.cy - cy); }
        else if (pr.type === 'polyline') { pr.points = pr.points.map((pt) => ({ x: round3(pt.x - cx), y: round3(pt.y - cy) })); }
      }
      const rawPre = (cPara.pre || 'U?').replace(/[?\d]+/g, '') || 'U';
      const gostPrefix = adaptToGost ? mapForeignPrefixToGost(rawPre, title) : rawPre;
      const patId = linkedPat?.id || mapForeignPatternToGost(cPara.package || '', pins.length || 2, gostPrefix);
      components.push({
        id: `COMP_EZ_${title.replace(/[^A-Za-z0-9]/g, '_').slice(0, 28)}`,
        name: title,
        library: libName,
        refDesPrefix: gostPrefix,
        defaultValue: title,
        gostStandard: adaptToGost ? 'EasyEDA → ГОСТ 2.710-81' : 'EasyEDA JSON',
        description: `Импорт из EasyEDA: ${title}`,
        manufacturer: cPara.Manufacturer || 'EasyEDA',
        patternId: patId,
        parts: [{ partIndex: 1, name: 'Секция 1', primitives, pins }]
      });
      items.push({ originalRef: rawPre, gostRef: gostPrefix, originalValue: title, gostValue: title, originalPattern: cPara.package || '-', gostPattern: patId, action: `EasyEDA компонент: ${title}` });
    }
  }

  return {
    libraryName: libName,
    categories: ['EasyEDA JSON'],
    components,
    patterns,
    detectedFormat: 'EasyEDA / LCEDA JSON Library',
    report: {
      sourceFormat: 'EasyEDA / LCEDA JSON Library',
      convertedComponents: components.length,
      convertedSymbolsToUgo: components.length,
      convertedPatterns: patterns.length,
      items
    }
  };
}

// =========================================================================
// 4. Unified Enterprise CAD Library Importer
// =========================================================================

/**
 * Imports any supported external CAD library (.eli, .lib, .kicad_sym, .kicad_mod, .lbr, EasyEDA JSON, .gostlib, .zip)
 * and links components <-> patterns for direct Schematic, PCB, ERC/DRC, BOM, and 3D usage.
 */
export async function importExternalCadLibrary(
  input: string | Uint8Array,
  filename = 'library',
  options: CadLibraryImportOptions = {}
): Promise<CadLibraryImportResult> {
  const adaptToGost = options.adaptToGost ?? true;
  const fallbackLibName = options.libraryName || stripExt(filename);
  const ext = filename.toLowerCase();

  // 1. Binary / ZIP buffer paths
  if (input instanceof Uint8Array) {
    if (isZipBuffer(input)) {
      const entries = await extractZipEntries(input);
      const components: ComponentDef[] = [];
      const patterns: PatternDef[] = [];
      const items: GostConversionItem[] = [];
      const warnings: string[] = [];
      const categories = new Set<string>();

      for (const [entryName, entryBytes] of Object.entries(entries)) {
        if (!/\.(gostlib|eli|lib|kicad_sym|kicad_mod|lbr|json)$/i.test(entryName)) continue;
        try {
          const sub = await importExternalCadLibrary(entryBytes, entryName, {
            adaptToGost,
            libraryName: fallbackLibName
          });
          components.push(...sub.components);
          patterns.push(...sub.patterns);
          items.push(...sub.report.items);
          for (const cat of sub.categories) categories.add(cat);
          if (sub.report.warnings) warnings.push(...sub.report.warnings);
        } catch (err) {
          warnings.push(`${entryName}: ${(err as Error).message}`);
        }
      }

      // Cross-link components -> imported patterns by pattern name (including originalFootprint) when possible
      const patByName = new Map(patterns.map((p) => [p.name.toUpperCase(), p.id]));
      for (const c of components) {
        const origRaw = c.attributes?.originalFootprint ?? '';
        const origShort = origRaw.includes(':') ? origRaw.split(':').pop() ?? origRaw : origRaw;
        const match =
          patByName.get(c.patternId.toUpperCase()) ??
          (origRaw ? patByName.get(origRaw.toUpperCase()) : undefined) ??
          (origShort ? patByName.get(origShort.toUpperCase()) : undefined);
        if (match) c.patternId = match;
      }

      return {
        libraryName: fallbackLibName,
        categories: Array.from(categories),
        components,
        patterns,
        detectedFormat: `ZIP архив библиотек (${filename})`,
        report: {
          sourceFormat: `ZIP архив библиотек (${filename})`,
          convertedComponents: components.length,
          convertedSymbolsToUgo: components.length,
          convertedPatterns: patterns.length,
          items,
          warnings: warnings.length > 0 ? warnings : undefined
        }
      };
    }

    const binId = detectDipTraceBinaryFormat(input);
    if (binId?.family === 'component') {
      const res = parseDipTraceBinaryEli(input, filename);
      const libName = options.libraryName || res.libraryName || fallbackLibName;
      return {
        libraryName: libName,
        categories: res.categories,
        components: res.components.map((c) => ({ ...c, library: libName })),
        patterns: res.patterns.map((p) => ({ ...p, library: libName })),
        report: res.report,
        detectedFormat: res.report.sourceFormat
      };
    }
    if (binId?.family === 'pattern') {
      const res = parseDipTraceBinaryLib(input, filename);
      const libName = options.libraryName || res.libraryName || fallbackLibName;
      return {
        libraryName: libName,
        categories: res.categories,
        components: [],
        patterns: res.patterns.map((p) => ({ ...p, library: libName })),
        report: res.report,
        detectedFormat: res.report.sourceFormat
      };
    }
  }

  const text = input instanceof Uint8Array ? utf8Decode(input) : input;
  const trimmed = text.trim();

  // 2. JSON (.gostlib or EasyEDA JSON)
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { components?: ComponentDef[]; patterns?: PatternDef[]; name?: string; shape?: string[]; dataStr?: unknown };
      if (Array.isArray(parsed.components) || Array.isArray(parsed.patterns)) {
        const libName = options.libraryName || parsed.name || fallbackLibName;
        return {
          libraryName: libName,
          categories: ['ГОСТ-Трейс (.gostlib)'],
          components: (parsed.components ?? []).map((c) => ({ ...c, library: libName })),
          patterns: (parsed.patterns ?? []).map((p) => ({ ...p, library: libName })),
          detectedFormat: 'Библиотека ГОСТ-Трейс (.gostlib)',
          report: {
            sourceFormat: 'Библиотека ГОСТ-Трейс (.gostlib)',
            convertedComponents: parsed.components?.length ?? 0,
            convertedSymbolsToUgo: parsed.components?.length ?? 0,
            convertedPatterns: parsed.patterns?.length ?? 0,
            items: []
          }
        };
      }
      return parseEasyEdaLibraryJson(trimmed, fallbackLibName, adaptToGost);
    } catch {
      // fall through
    }
  }

  // 3. DipTrace ASCII (.eli / .lib)
  if ((ext.endsWith('.eli') || ext.endsWith('.lib') || trimmed.includes('(Library') || trimmed.includes('(Pattern ')) && !trimmed.includes('(kicad_')) {
    const res = parseDipTraceAsciiLibrary(trimmed);
    return {
      libraryName: fallbackLibName,
      categories: ['DipTrace ASCII'],
      components: res.components.map((c) => ({ ...c, library: fallbackLibName })),
      patterns: res.patterns.map((p) => ({ ...p, library: fallbackLibName })),
      report: res.report,
      detectedFormat: 'DipTrace ASCII Library (.eli/.lib)'
    };
  }

  // 4. KiCad (.kicad_sym / .kicad_mod)
  if (trimmed.includes('(kicad_symbol_lib') || ext.endsWith('.kicad_sym')) {
    return parseKicadSymbolLib(trimmed, fallbackLibName, adaptToGost);
  }
  if (trimmed.includes('(footprint') || trimmed.includes('(module') || ext.endsWith('.kicad_mod')) {
    return parseKicadFootprintMod(trimmed, fallbackLibName);
  }

  // 5. Eagle (.lbr)
  if (ext.endsWith('.lbr') || trimmed.includes('<eagle') || trimmed.includes('<library')) {
    return parseEagleLbr(trimmed, fallbackLibName, adaptToGost);
  }

  throw new Error(`Не удалось распознать формат библиотеки CAD: ${filename}`);
}
