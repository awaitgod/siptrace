import { ComponentDef, PadDef, PatternDef, PatternGraphic, PinOrientation, SymbolPin, SymbolPrimitive } from '../../../core/types';
import { GostConversionReport, mapForeignPatternToGost, mapForeignPrefixToGost } from '../gostConverter';
import {
  makeComponentDef,
  makePadDef,
  makePatternDef,
  makePatternGraphicCircle,
  makePatternGraphicLine,
  makeSymbolPin
} from '../ecad/ecadFactories';
import { parseSExpressions, SExprList, sxFind, sxFindAll, sxNum, sxStr } from '../sexprParser';
import { extractKicadSymbolGeometry, mapKicadLayer } from './kicadCommon';

/** Parses an array of KiCad (symbol ...) AST nodes into GOST ComponentDef entries. */
export function parseKicadSymbolList(
  symNodes: SExprList[],
  libName: string,
  adaptToGost: boolean
): { components: ComponentDef[]; patterns: PatternDef[]; report: GostConversionReport } {
  const components: ComponentDef[] = [];
  const patterns: PatternDef[] = [];
  const items: GostConversionReport['items'] = [];
  const seenPatterns = new Set<string>();

  for (const sym of symNodes) {
    const rawName = sxStr(sym, 1) || 'Sym';
    const props = new Map<string, string>();
    for (const p of sxFindAll(sym, 'property')) props.set(sxStr(p, 1).toLowerCase(), sxStr(p, 2));
    const rawRef = props.get('reference') || 'U';
    const rawFp = props.get('footprint') || '';
    const value = props.get('value') || rawName;
    const { pins, primitives } = extractKicadSymbolGeometry([sym], 1.5);

    const refDesPrefix = adaptToGost ? mapForeignPrefixToGost(rawRef, `${rawName} ${value} ${rawFp}`) : rawRef;
    const fpBase = rawFp.includes(':') ? rawFp.split(':').pop() || rawFp : rawFp;
    const gostPattern = adaptToGost ? mapForeignPatternToGost(fpBase || rawName) : (fpBase || 'DIP-8');

    const safePins: SymbolPin[] = pins.length > 0 ? pins : [
      makeSymbolPin({ number: '1', name: '1', x: -6, y: 0, length: 2.5, orientation: 0 }),
      makeSymbolPin({ number: '2', name: '2', x: 6, y: 0, length: 2.5, orientation: 180 })
    ];
    const safePrims: SymbolPrimitive[] = primitives.length > 0 ? primitives : [{ type: 'rect', x: -4, y: -4, w: 8, h: 8, width: 0.3 }];

    components.push(makeComponentDef({
      name: rawName,
      library: libName,
      refDesPrefix,
      defaultValue: value,
      patternId: gostPattern,
      description: props.get('description') || `KiCad symbol: ${rawName}`,
      pins: safePins,
      primitives: safePrims
    }));

    if (!seenPatterns.has(gostPattern)) {
      seenPatterns.add(gostPattern);
      const count = Math.max(2, safePins.length);
      const pads: PadDef[] = Array.from({ length: count }, (_, i) => makePadDef({
        number: safePins[i]?.number ?? `${i + 1}`,
        x: i % 2 === 0 ? -2.0 : 2.0,
        y: (Math.floor(i / 2) - (Math.ceil(count / 2) - 1) / 2) * 1.27,
        width: 1.4,
        height: 0.8
      }));
      patterns.push(makePatternDef({ name: gostPattern, library: libName, description: `Auto-generated pattern for ${rawName}`, pads }));
    }

    items.push({ originalRef: rawRef, gostRef: refDesPrefix, originalValue: value, gostValue: value, originalPattern: fpBase || 'none', gostPattern, action: `${rawRef} -> ${refDesPrefix}` });
  }

  return {
    components,
    patterns,
    report: { sourceFormat: 'KiCad Symbol Library (.kicad_sym)', convertedComponents: components.length, convertedSymbolsToUgo: components.length, convertedPatterns: patterns.length, items }
  };
}

/** Parses modern KiCad .kicad_sym files. */
export function parseKicadSymbolLib(text: string, libName: string, adaptToGost: boolean) {
  const ast = parseSExpressions(text);
  const root = ast.find((n) => n[0] === 'kicad_symbol_lib');
  const syms = root ? sxFindAll(root, 'symbol') : sxFindAll(ast, 'symbol');
  const res = parseKicadSymbolList(syms, libName, adaptToGost);
  return { libraryName: libName, categories: ['KiCad Symbols (.kicad_sym)'], ...res, detectedFormat: 'KiCad Symbol Library (.kicad_sym)' };
}

/** Parses KiCad legacy EESchema-LIBRARY (.lib) files (v2.0 - v2.4). */
export function parseKicadLegacyLib(text: string, libName: string, adaptToGost: boolean) {
  const components: ComponentDef[] = [];
  const patterns: PatternDef[] = [];
  const items: GostConversionReport['items'] = [];
  const scale = 0.04;

  let inDef = false, inDraw = false;
  let curName = 'Part', curRef = 'U', curFp = '';
  let pins: SymbolPin[] = [], prims: SymbolPrimitive[] = [];

  const flushComp = () => {
    if (!inDef) return;
    const prefix = adaptToGost ? mapForeignPrefixToGost(curRef, `${curName} ${curFp}`) : curRef;
    const pattern = adaptToGost ? mapForeignPatternToGost(curFp || curName) : (curFp || 'DIP-8');
    components.push(makeComponentDef({
      name: curName,
      library: libName,
      refDesPrefix: prefix,
      defaultValue: curName,
      patternId: pattern,
      description: `EESchema-LIBRARY: ${curName}`,
      pins: pins.length > 0 ? pins : [makeSymbolPin({ number: '1', name: '1', x: -5, y: 0, length: 2.5, orientation: 0 })],
      primitives: prims.length > 0 ? prims : [{ type: 'rect', x: -4, y: -4, w: 8, h: 8, width: 0.3 }]
    }));
    items.push({ originalRef: curRef, gostRef: prefix, originalValue: curName, gostValue: curName, originalPattern: curFp || 'none', gostPattern: pattern, action: `${curRef} -> ${prefix}` });
    inDef = false; inDraw = false;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('DEF ')) {
      flushComp();
      const parts = line.split(/\s+/);
      curName = parts[1] || 'Part'; curRef = parts[2] || 'U'; curFp = ''; pins = []; prims = []; inDef = true;
    } else if (line === 'ENDDEF') flushComp();
    else if (!inDef) continue;
    else if (line.startsWith('F2 ')) { const m = /^F2\s+"([^"]*)"/.exec(line); if (m?.[1]) curFp = m[1]; }
    else if (line === 'DRAW') inDraw = true;
    else if (line === 'ENDDRAW') inDraw = false;
    else if (inDraw) {
      const p = line.split(/\s+/);
      if (p[0] === 'X' && p.length >= 9) {
        const dir = p[6];
        const orientation: PinOrientation = dir === 'R' ? 0 : dir === 'L' ? 180 : dir === 'U' ? 270 : 90;
        const etype = p[11] === 'I' ? 'Input' : p[11] === 'O' ? 'Output' : p[11] === 'B' ? 'Bidirectional' : (p[11] === 'W' || p[11] === 'w') ? 'Power' : 'Passive';
        pins.push(makeSymbolPin({
          number: p[2] || `${pins.length + 1}`,
          name: p[1] === '~' ? (p[2] || '') : p[1],
          x: parseFloat(p[3]) * scale,
          y: -parseFloat(p[4]) * scale,
          length: Math.max(1.5, parseFloat(p[5]) * scale),
          orientation,
          electricalType: etype,
          showName: p[1] !== '~'
        }));
      } else if (p[0] === 'S' && p.length >= 5) {
        const x1 = parseFloat(p[1]) * scale, y1 = -parseFloat(p[2]) * scale, x2 = parseFloat(p[3]) * scale, y2 = -parseFloat(p[4]) * scale;
        prims.push({ type: 'rect', x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), width: 0.3 });
      } else if (p[0] === 'C' && p.length >= 4) {
        prims.push({ type: 'circle', cx: parseFloat(p[1]) * scale, cy: -parseFloat(p[2]) * scale, r: Math.max(0.5, parseFloat(p[3]) * scale), width: 0.3 });
      } else if (p[0] === 'P' && p.length >= 6) {
        const count = parseInt(p[1], 10) || 0;
        const pts: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < count && 5 + i * 2 + 1 < p.length; i++) pts.push({ x: parseFloat(p[5 + i * 2]) * scale, y: -parseFloat(p[5 + i * 2 + 1]) * scale });
        if (pts.length >= 2) prims.push({ type: 'polyline', points: pts, width: 0.25 });
      }
    }
  }
  flushComp();

  return {
    libraryName: libName,
    categories: ['KiCad Legacy (.lib)'],
    components,
    patterns,
    detectedFormat: 'KiCad Legacy Library (.lib)',
    report: { sourceFormat: 'KiCad Legacy Library (.lib)', convertedComponents: components.length, convertedSymbolsToUgo: components.length, convertedPatterns: patterns.length, items }
  };
}

/** Parses KiCad .kicad_mod footprint files (s-expression footprint or legacy module). */
export function parseKicadFootprintMod(text: string, libName: string) {
  const ast = parseSExpressions(text);
  const root = ast.find((n) => n[0] === 'footprint' || n[0] === 'module');
  if (!root) throw new Error('Некорректный формат файла посадочного места KiCad (.kicad_mod)');
  const fpName = sxStr(root, 1) || libName;
  const pads: PadDef[] = [];
  const graphics: PatternGraphic[] = [];

  for (const pd of sxFindAll(root, 'pad')) {
    const kind = sxStr(pd, 2);
    const rawShape = sxStr(pd, 3);
    const at = sxFind(pd, 'at');
    const size = sxFind(pd, 'size');
    const drill = sxFind(pd, 'drill');
    const pw = Math.max(0.2, sxNum(size, 1, 1.0));
    const hole = drill ? sxNum(drill, 1, 0) : (kind === 'thru_hole' || kind === 'np_thru_hole' ? 0.8 : 0);
    const isTht = kind === 'thru_hole' || kind === 'np_thru_hole' || hole > 0;
    const shape: PadDef['shape'] = rawShape === 'circle' ? 'Round' : rawShape === 'oval' ? 'Oval' : rawShape === 'roundrect' ? 'RoundedRect' : 'Rect';

    pads.push(makePadDef({
      number: sxStr(pd, 1) || `${pads.length + 1}`,
      isTht,
      shape,
      x: sxNum(at, 1, 0),
      y: sxNum(at, 2, 0),
      width: pw,
      height: Math.max(0.2, sxNum(size, 2, pw)),
      holeDiameter: isTht ? hole : 0,
      angle: sxNum(at, 3, 0)
    }));
  }

  for (const ln of sxFindAll(root, 'fp_line')) {
    const s = sxFind(ln, 'start'), e = sxFind(ln, 'end');
    const layer = mapKicadLayer(sxStr(sxFind(ln, 'layer'), 1) || 'F.SilkS');
    if (s && e) graphics.push(makePatternGraphicLine(layer === 'BottomSilk' ? 'BottomSilk' : 'TopSilk', sxNum(s, 1), sxNum(s, 2), sxNum(e, 1), sxNum(e, 2)));
  }

  for (const cr of sxFindAll(root, 'fp_circle')) {
    const c = sxFind(cr, 'center'), e = sxFind(cr, 'end');
    if (c && e) {
      const cx = sxNum(c, 1), cy = sxNum(c, 2), r = Math.hypot(sxNum(e, 1) - cx, sxNum(e, 2) - cy);
      graphics.push(makePatternGraphicCircle('TopSilk', cx, cy, r));
    }
  }

  const pattern = makePatternDef({ name: fpName, library: libName, description: `Imported KiCad footprint: ${fpName}`, pads, graphics });
  return {
    libraryName: libName,
    categories: ['KiCad Footprints (.kicad_mod)'],
    components: [],
    patterns: [pattern],
    detectedFormat: 'KiCad Footprint (.kicad_mod)',
    report: { sourceFormat: 'KiCad Footprint (.kicad_mod)', convertedComponents: 0, convertedSymbolsToUgo: 0, convertedPatterns: 1, items: [] }
  };
}
