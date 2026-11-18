import {
  ComponentDef,
  PadDef,
  PatternDef,
  PatternGraphic,
  PcbLayerId,
  PcbPlacedComponent,
  PcbProject,
  PcbShape,
  PcbTrace,
  PcbVia,
  PlacedComponent,
  PinOrientation,
  SchJunction,
  SchNetPort,
  SchWire,
  SchematicProject,
  SymbolPin,
  SymbolPrimitive
} from '../../../core/types';
import { uid } from '../../../core/geometry';
import { convertImportedPcbToGost, convertImportedSchematicToGost, GostConversionReport, mapForeignPatternToGost, mapForeignPrefixToGost } from '../gostConverter';
import {
  makeChipComponentDef,
  makeComponentDef,
  makeEcadPcbProject,
  makeEcadSchematicProject,
  makePadDef,
  makePatternDef,
  makePatternGraphicCircle,
  makePatternGraphicLine,
  makePcbPlacedComp,
  makePcbShapeCircle,
  makePcbShapeLine,
  makeSymbolPin,
  placeDefOnSheet,
  snapAngle90
} from '../ecad/ecadFactories';
import { chainSegmentsToOutline, Segment2D } from '../outlineChain';
import { MiniXmlNode, parseMiniXml, xmlFindAll, xmlFindFirst } from '../xmlMiniParser';

function xmlNum(attrs: Record<string, string>, key: string, fallback: number): number {
  const raw = attrs[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function mapEagleLayerToPcb(layer: string): PcbLayerId | 'outline' | null {
  if (layer === '20') return 'outline';
  if (layer === '1') return 'TopCopper';
  if (layer === '16') return 'BottomCopper';
  if (layer === '2') return 'Inner1';
  if (layer === '15' || (parseInt(layer, 10) >= 3 && parseInt(layer, 10) <= 14)) return 'Inner2';
  if (layer === '21' || layer === '25' || layer === '27') return 'TopSilk';
  if (layer === '22' || layer === '26' || layer === '28') return 'BottomSilk';
  if (layer === '29') return 'TopMask';
  if (layer === '30') return 'BottomMask';
  if (layer === '31') return 'TopPaste';
  if (layer === '32') return 'BottomPaste';
  if (layer === '39' || layer === '40' || layer === '41' || layer === '42') return 'Keepout';
  if (layer === '51') return 'TopAssembly';
  if (layer === '52') return 'BottomAssembly';
  return null;
}

function parseEagleRot(rotAttr?: string): { angle: number; mirror: boolean } {
  const raw = (rotAttr || 'R0').toUpperCase();
  const mirror = raw.includes('M');
  const num = parseFloat(raw.replace(/[^0-9.-]/g, ''));
  return { angle: Number.isFinite(num) ? ((num % 360) + 360) % 360 : 0, mirror };
}

interface ParsedPackage { name: string; pads: PadDef[]; graphics: PatternGraphic[]; }

function extractPackages(root: MiniXmlNode | null): Map<string, ParsedPackage> {
  const pkgs = new Map<string, ParsedPackage>();
  for (const pkg of xmlFindAll(root, 'package')) {
    const pkgName = pkg.attrs.name || 'PKG';
    const pads: PadDef[] = [];
    const graphics: PatternGraphic[] = [];

    for (const smd of xmlFindAll(pkg, 'smd')) {
      pads.push(makePadDef({
        number: smd.attrs.name || `${pads.length + 1}`,
        x: xmlNum(smd.attrs, 'x', 0),
        y: xmlNum(smd.attrs, 'y', 0),
        width: Math.max(0.2, xmlNum(smd.attrs, 'dx', 1.2)),
        height: Math.max(0.2, xmlNum(smd.attrs, 'dy', 1.2)),
        angle: parseEagleRot(smd.attrs.rot).angle
      }));
    }

    for (const pad of xmlFindAll(pkg, 'pad')) {
      const drill = Math.max(0.3, xmlNum(pad.attrs, 'drill', 0.8));
      const dia = Math.max(drill + 0.4, xmlNum(pad.attrs, 'diameter', drill * 1.8));
      const rawShape = (pad.attrs.shape || '').toLowerCase();
      pads.push(makePadDef({
        number: pad.attrs.name || `${pads.length + 1}`,
        isTht: true,
        shape: rawShape === 'square' ? 'Rect' : rawShape === 'long' ? 'Oval' : 'Round',
        x: xmlNum(pad.attrs, 'x', 0),
        y: xmlNum(pad.attrs, 'y', 0),
        width: dia,
        height: rawShape === 'long' ? dia * 1.5 : dia,
        holeDiameter: drill,
        angle: parseEagleRot(pad.attrs.rot).angle
      }));
    }

    for (const w of xmlFindAll(pkg, 'wire')) {
      const layer = w.attrs.layer || '21';
      if (layer === '21' || layer === '22' || layer === '51' || layer === '52') {
        graphics.push(makePatternGraphicLine(
          layer === '22' || layer === '52' ? 'BottomSilk' : 'TopSilk',
          xmlNum(w.attrs, 'x1', 0), xmlNum(w.attrs, 'y1', 0), xmlNum(w.attrs, 'x2', 0), xmlNum(w.attrs, 'y2', 0),
          Math.max(0.08, xmlNum(w.attrs, 'width', 0.15))
        ));
      }
    }
    for (const c of xmlFindAll(pkg, 'circle')) {
      const layer = c.attrs.layer || '21';
      if (layer === '21' || layer === '22' || layer === '51') {
        graphics.push(makePatternGraphicCircle(layer === '22' ? 'BottomSilk' : 'TopSilk', xmlNum(c.attrs, 'x', 0), xmlNum(c.attrs, 'y', 0), Math.max(0.1, xmlNum(c.attrs, 'radius', 0.5))));
      }
    }
    pkgs.set(pkgName, { name: pkgName, pads, graphics });
  }
  return pkgs;
}

interface ParsedSymbol { name: string; pins: SymbolPin[]; primitives: SymbolPrimitive[]; }

function extractSymbols(root: MiniXmlNode | null): Map<string, ParsedSymbol> {
  const map = new Map<string, ParsedSymbol>();
  for (const sym of xmlFindAll(root, 'symbol')) {
    const symName = sym.attrs.name || 'SYM';
    const pins: SymbolPin[] = [];
    const primitives: SymbolPrimitive[] = [];

    for (const p of xmlFindAll(sym, 'pin')) {
      const rot = parseEagleRot(p.attrs.rot);
      const lenStr = (p.attrs.length || 'middle').toLowerCase();
      const len = lenStr === 'point' ? 0 : lenStr === 'short' ? 2.54 : lenStr === 'long' ? 7.62 : 5.08;
      const deg = snapAngle90(rot.angle);
      const orientation: PinOrientation = deg === 90 ? 270 : deg === 270 ? 90 : deg;
      pins.push(makeSymbolPin({
        number: `${pins.length + 1}`,
        name: p.attrs.name || `${pins.length + 1}`,
        x: xmlNum(p.attrs, 'x', 0),
        y: -xmlNum(p.attrs, 'y', 0),
        length: Math.max(1.5, len),
        orientation,
        showName: (p.attrs.visible || 'both') !== 'off'
      }));
    }
    for (const w of xmlFindAll(sym, 'wire')) {
      primitives.push({ type: 'line', x1: xmlNum(w.attrs, 'x1', 0), y1: -xmlNum(w.attrs, 'y1', 0), x2: xmlNum(w.attrs, 'x2', 0), y2: -xmlNum(w.attrs, 'y2', 0), width: Math.max(0.15, xmlNum(w.attrs, 'width', 0.25)) });
    }
    for (const c of xmlFindAll(sym, 'circle')) {
      primitives.push({ type: 'circle', cx: xmlNum(c.attrs, 'x', 0), cy: -xmlNum(c.attrs, 'y', 0), r: Math.max(0.5, xmlNum(c.attrs, 'radius', 2)), width: 0.3 });
    }
    map.set(symName, { name: symName, pins, primitives });
  }
  return map;
}

/** Parses Eagle XML (.sch / .brd) with consistent coordinates, zero-preserving numbers, and honest warnings. */
export function parseEagleXml(xml: string, isPcb: boolean, name = 'Eagle_Import'): {
  schematic?: { project: SchematicProject; report: GostConversionReport };
  pcb?: { pcb: PcbProject; report: GostConversionReport };
} {
  const doc = parseMiniXml(xml);
  const pkgMap = extractPackages(doc);
  const symMap = extractSymbols(doc);

  if (isPcb || xmlFindFirst(doc, 'board')) {
    const warnings: string[] = [];
    const components: PcbPlacedComponent[] = [];
    let emptyPadComps = 0;

    for (const el of xmlFindAll(doc, 'element')) {
      const refDes = el.attrs.name || `U${components.length + 1}`;
      const pkgName = el.attrs.package || 'CUSTOM';
      const pkg = pkgMap.get(pkgName);
      const rot = parseEagleRot(el.attrs.rot);
      const pads: PadDef[] = pkg
        ? pkg.pads.map((p) => ({ ...p, id: uid('epd') }))
        : [];
      if (pads.length === 0) emptyPadComps++;
      components.push(makePcbPlacedComp({
        refDes, value: el.attrs.value || '', typeName: pkgName, side: rot.mirror ? 'Bottom' : 'Top',
        x: xmlNum(el.attrs, 'x', 20), y: xmlNum(el.attrs, 'y', 20), angle: rot.angle,
        pads, graphics: pkg ? pkg.graphics : []
      }));
    }
    if (emptyPadComps > 0) {
      warnings.push(`Логотипы/элементы без контактных площадок (${emptyPadComps}): геометрия не содержит выводов для трассировки.`);
    }

    const traces: PcbTrace[] = [];
    const vias: PcbVia[] = [];
    let polygonCount = 0;
    let unresolvedContacts = 0;
    const assignedPads = new Map<string, string>(); // "ref::pad" -> netName
    const conflictedPads = new Set<string>();

    for (const sig of xmlFindAll(doc, 'signal')) {
      const netName = sig.attrs.name || '';
      polygonCount += xmlFindAll(sig, 'polygon').length;

      for (const cr of xmlFindAll(sig, 'contactref')) {
        const comp = components.find((c) => c.refDes === cr.attrs.element);
        const padNum = cr.attrs.pad;
        if (!comp || !padNum || !comp.pads.some((p) => p.number === padNum)) {
          unresolvedContacts++;
          continue;
        }
        const key = `${comp.refDes}::${padNum}`;
        const prev = assignedPads.get(key);
        if (prev && prev !== netName) {
          conflictedPads.add(key);
          delete comp.padNets[padNum];
          unresolvedContacts++;
        } else if (!conflictedPads.has(key)) {
          assignedPads.set(key, netName);
          comp.padNets[padNum] = netName;
        }
      }
      for (const w of xmlFindAll(sig, 'wire')) {
        const layerNum = w.attrs.layer || '1';
        const cuLayer: PcbTrace['layer'] = layerNum === '16' ? 'BottomCopper' : layerNum === '2' ? 'Inner1' : layerNum === '15' ? 'Inner2' : 'TopCopper';
        traces.push({ id: uid('etr'), layer: cuLayer, netName, points: [{ x: xmlNum(w.attrs, 'x1', 0), y: xmlNum(w.attrs, 'y1', 0) }, { x: xmlNum(w.attrs, 'x2', 0), y: xmlNum(w.attrs, 'y2', 0) }], width: Math.max(0.1, xmlNum(w.attrs, 'width', 0.25)) });
      }
      for (const v of xmlFindAll(sig, 'via')) {
        const drill = Math.max(0.2, xmlNum(v.attrs, 'drill', 0.4));
        vias.push({ id: uid('evia'), x: xmlNum(v.attrs, 'x', 0), y: xmlNum(v.attrs, 'y', 0), netName, outerDiameter: Math.max(drill + 0.35, xmlNum(v.attrs, 'diameter', drill * 1.8)), holeDiameter: drill, startLayer: 'TopCopper', endLayer: 'BottomCopper', viaStyle: 'Through' });
      }
    }

    if (polygonCount > 0) warnings.push(`Полигоны цепей Eagle (${polygonCount}) не импортированы — создайте полигоны вручную после импорта.`);
    if (unresolvedContacts > 0) warnings.push(`Не удалось однозначно восстановить ${unresolvedContacts} назначений цепей (неизвестные или конфликтующие площадки).`);

    const outlineSegs: Segment2D[] = [];
    const shapes: PcbShape[] = [];
    for (const plain of xmlFindAll(doc, 'plain')) {
      for (const w of xmlFindAll(plain, 'wire')) {
        const x1 = xmlNum(w.attrs, 'x1', 0), y1 = xmlNum(w.attrs, 'y1', 0), x2 = xmlNum(w.attrs, 'x2', 0), y2 = xmlNum(w.attrs, 'y2', 0);
        const mapped = mapEagleLayerToPcb(w.attrs.layer || '20');
        if (mapped === 'outline') outlineSegs.push({ x1, y1, x2, y2 });
        else if (mapped && mapped !== 'TopCopper' && mapped !== 'BottomCopper' && mapped !== 'Inner1' && mapped !== 'Inner2') {
          shapes.push(makePcbShapeLine(mapped, x1, y1, x2, y2, Math.max(0.08, xmlNum(w.attrs, 'width', 0.15))));
        }
      }
      for (const c of xmlFindAll(plain, 'circle')) {
        const mapped = mapEagleLayerToPcb(c.attrs.layer || '21');
        if (mapped && mapped !== 'outline' && mapped !== 'TopCopper' && mapped !== 'BottomCopper' && mapped !== 'Inner1' && mapped !== 'Inner2') {
          shapes.push(makePcbShapeCircle(mapped, xmlNum(c.attrs, 'x', 0), xmlNum(c.attrs, 'y', 0), Math.max(0.1, xmlNum(c.attrs, 'radius', 0.5))));
        }
      }
    }

    const boardOutline = outlineSegs.length > 0 ? chainSegmentsToOutline(outlineSegs, 0.3) : [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }, { x: 0, y: 0 }];
    let minX = Infinity, minY = Infinity;
    for (const pt of boardOutline) { minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y); }
    for (const c of components) { minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); }
    const shiftX = minX < 0 ? -minX + 5 : 0;
    const shiftY = minY < 0 ? -minY + 5 : 0;
    if (shiftX !== 0 || shiftY !== 0) {
      for (const pt of boardOutline) { pt.x += shiftX; pt.y += shiftY; }
      for (const c of components) { c.x += shiftX; c.y += shiftY; }
      for (const t of traces) for (const pt of t.points) { pt.x += shiftX; pt.y += shiftY; }
      for (const v of vias) { v.x += shiftX; v.y += shiftY; }
      for (const s of shapes) { s.x1 += shiftX; s.y1 += shiftY; if (s.x2 !== undefined) s.x2 += shiftX; if (s.y2 !== undefined) s.y2 += shiftY; }
    }

    const res = convertImportedPcbToGost(makeEcadPcbProject({ name, components, traces, vias, shapes, boardOutline }), 'Autodesk Eagle (.brd)', { preserveEmptyPads: true });
    // Preserve original Eagle package names on placed components for CAD fidelity & logo checks
    res.pcb.components = res.pcb.components.map((c, idx) => ({
      ...c,
      patternId: components[idx]?.patternId || c.patternId
    }));
    if (warnings.length > 0) res.report.warnings = [...(res.report.warnings ?? []), ...warnings];
    return { pcb: res };
  }

  // Eagle Schematic (.sch)
  const partMap = new Map<string, { deviceset: string; value: string }>();
  const devSymbolMap = new Map<string, string>();
  for (const ds of xmlFindAll(doc, 'deviceset')) {
    const gate = xmlFindFirst(ds, 'gate');
    if (ds.attrs.name && gate?.attrs.symbol) devSymbolMap.set(ds.attrs.name, gate.attrs.symbol);
  }
  for (const part of xmlFindAll(doc, 'part')) {
    if (part.attrs.name) partMap.set(part.attrs.name, { deviceset: part.attrs.deviceset || 'IC', value: part.attrs.value || '' });
  }

  const customDefs: Record<string, ComponentDef> = {};
  const comps: PlacedComponent[] = [];
  const wires: SchWire[] = [];
  const junctions: SchJunction[] = [];
  const netPorts: SchNetPort[] = [];

  for (const inst of xmlFindAll(doc, 'instance')) {
    const partRef = inst.attrs.part || `U${comps.length + 1}`;
    const info = partMap.get(partRef);
    const symName = devSymbolMap.get(info?.deviceset || '') || info?.deviceset || 'IC';
    const sym = symMap.get(symName);
    const rot = parseEagleRot(inst.attrs.rot);
    const def = sym
      ? makeComponentDef({
          name: symName, library: 'Eagle Import', refDesPrefix: (partRef.replace(/\d+.*$/, '') || 'U').toUpperCase(),
          defaultValue: info?.value || symName,
          pins: sym.pins.map((p) => ({ ...p, id: uid('epin') })),
          primitives: sym.primitives.length > 0 ? sym.primitives : [{ type: 'rect', x: -3.5, y: -3.5, w: 7, h: 7, width: 0.3 }]
        })
      : makeChipComponentDef(symName, 4, (partRef.replace(/\d+.*$/, '') || 'U').toUpperCase(), 'Eagle Import');

    comps.push(placeDefOnSheet({
      def, customDefs, refDes: partRef, value: info?.value || symName,
      x: xmlNum(inst.attrs, 'x', 25), y: -xmlNum(inst.attrs, 'y', -25),
      angle: snapAngle90(rot.angle), flipX: rot.mirror
    }));
  }

  for (const net of xmlFindAll(doc, 'net')) {
    const netName = net.attrs.name || '';
    for (const w of xmlFindAll(net, 'wire')) wires.push({ id: uid('esw'), points: [{ x: xmlNum(w.attrs, 'x1', 0), y: -xmlNum(w.attrs, 'y1', 0) }, { x: xmlNum(w.attrs, 'x2', 0), y: -xmlNum(w.attrs, 'y2', 0) }], netName });
    for (const j of xmlFindAll(net, 'junction')) junctions.push({ id: uid('esj'), x: xmlNum(j.attrs, 'x', 0), y: -xmlNum(j.attrs, 'y', 0), netName });
    for (const lb of xmlFindAll(net, 'label')) netPorts.push({ id: uid('esnp'), netName: netName || 'NET', style: /GND|VSS/i.test(netName) ? 'Ground' : /VCC|VDD|\+/i.test(netName) ? 'Power' : 'OffPageOut', x: xmlNum(lb.attrs, 'x', 0), y: -xmlNum(lb.attrs, 'y', 0), angle: 0 });
  }

  let sMinX = Infinity, sMinY = Infinity;
  for (const c of comps) { sMinX = Math.min(sMinX, c.x); sMinY = Math.min(sMinY, c.y); }
  for (const w of wires) for (const pt of w.points) { sMinX = Math.min(sMinX, pt.x); sMinY = Math.min(sMinY, pt.y); }
  const sx = sMinX < 0 ? -sMinX + 20 : 0;
  const sy = sMinY < 0 ? -sMinY + 20 : 0;
  if (sx !== 0 || sy !== 0) {
    for (const c of comps) { c.x += sx; c.y += sy; }
    for (const w of wires) for (const pt of w.points) { pt.x += sx; pt.y += sy; }
    for (const j of junctions) { j.x += sx; j.y += sy; }
    for (const np of netPorts) { np.x += sx; np.y += sy; }
  }

  return { schematic: convertImportedSchematicToGost(makeEcadSchematicProject({ name, components: comps, wires, customDefs, junctions, netPorts }), 'Autodesk Eagle (.sch)') };
}

/** Parses Eagle .lbr XML component & footprint library with pin-to-pad mapping. */
export function parseEagleLbr(xml: string, libName: string, adaptToGost: boolean): {
  libraryName: string; categories: string[]; components: ComponentDef[]; patterns: PatternDef[]; detectedFormat: string; report: GostConversionReport;
} {
  const doc = parseMiniXml(xml);
  const pkgMap = extractPackages(doc);
  const symMap = extractSymbols(doc);

  const patterns: PatternDef[] = [];
  const patByPkgName = new Map<string, PatternDef>();
  for (const pkg of pkgMap.values()) {
    const finalName = adaptToGost ? mapForeignPatternToGost(pkg.name) : pkg.name;
    const pat = makePatternDef({ name: finalName, library: libName, description: `Eagle package: ${pkg.name}`, pads: pkg.pads, graphics: pkg.graphics });
    patterns.push(pat);
    patByPkgName.set(pkg.name, pat);
  }

  const components: ComponentDef[] = [];
  const items: GostConversionReport['items'] = [];
  for (const ds of xmlFindAll(doc, 'deviceset')) {
    const dsName = ds.attrs.name || 'Device';
    const rawPrefix = ds.attrs.prefix || 'U';
    const prefix = adaptToGost ? mapForeignPrefixToGost(rawPrefix, dsName) : rawPrefix;
    const gate = xmlFindFirst(ds, 'gate'), dev = xmlFindFirst(ds, 'device');
    const sym = gate?.attrs.symbol ? symMap.get(gate.attrs.symbol) : undefined;
    const rawPkg = dev?.attrs.package || 'DIP-8';
    const matchedPat = patByPkgName.get(rawPkg);
    const gostPkg = adaptToGost ? mapForeignPatternToGost(rawPkg) : rawPkg;

    const basePins = (sym?.pins.length ? sym.pins : makeChipComponentDef(dsName, 4, prefix, libName).parts[0].pins)
      .map((p) => ({ ...p, id: uid('elpin') }));
    if (dev) {
      for (const conn of xmlFindAll(dev, 'connect')) {
        const pinMatch = basePins.find((p) => p.name === conn.attrs.pin || p.number === conn.attrs.pin);
        if (pinMatch && conn.attrs.pad) pinMatch.padMapping = conn.attrs.pad;
      }
    }

    components.push(makeComponentDef({
      name: dsName, library: libName, refDesPrefix: prefix, defaultValue: dsName,
      patternId: matchedPat?.id ?? gostPkg,
      description: `Eagle deviceset: ${dsName}`,
      pins: basePins,
      primitives: sym?.primitives.length ? sym.primitives : [{ type: 'rect', x: -4, y: -4, w: 8, h: 8, width: 0.3 }]
    }));
    items.push({
      originalRef: rawPrefix, gostRef: prefix, originalValue: dsName, gostValue: dsName,
      originalPattern: rawPkg, gostPattern: matchedPat?.name ?? gostPkg,
      action: `${rawPrefix} -> ${prefix}`
    });
  }

  return {
    libraryName: libName, categories: ['Autodesk Eagle (.lbr)'], components, patterns, detectedFormat: 'Autodesk Eagle Library (.lbr)',
    report: { sourceFormat: 'Autodesk Eagle Library (.lbr)', convertedComponents: components.length, convertedSymbolsToUgo: components.length, convertedPatterns: patterns.length, items }
  };
}
