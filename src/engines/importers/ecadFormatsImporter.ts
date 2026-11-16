import {
  ComponentDef,
  PadDef,
  PatternDef,
  PcbPlacedComponent,
  PcbProject,
  PcbTrace,
  PcbVia,
  PlacedComponent,
  Point2D,
  SchWire,
  SchematicProject
} from '../../core/types';
import { segmentsIntersect, uid } from '../../core/geometry';
import { findComponentById } from '../../gost/libraries/gostComponents';
import { extractZipEntries, isZipBuffer, utf8Decode } from '../../core/utils/zipArchive';
import { parseGerberPreview } from '../camExport';
import { parseSExpressions, sxFind, sxFindAll, sxNum, sxStr } from './sexprParser';
import { parseMiniXml, xmlFindAll } from './xmlMiniParser';
import { createImportedPcbProject, createImportedSchematicProject, createPlaceholderChipComponent } from './projectShells';
import { convertImportedPcbToGost, convertImportedSchematicToGost, GostConversionReport } from './gostConverter';

function makeSchComp(ref: string, name: string, value: string, pattern: string, x: number, y: number, angle = 0): PlacedComponent {
  return {
    id: uid('ecad'),
    componentDefId: name,
    libraryId: 'lib_gost_import',
    refDes: ref,
    value,
    typeName: name,
    partIndex: 1,
    x,
    y,
    angle: ((Math.round(angle / 90) * 90) % 360 + 360) % 360 as 0 | 90 | 180 | 270,
    flipX: false,
    flipY: false,
    patternId: pattern,
    refDesOffset: { x: 0, y: -7 },
    valueOffset: { x: 0, y: 7 },
    showRefDes: true,
    showValue: true
  };
}

/** Imports KiCad Schematic (.kicad_sch modern S-expr OR legacy KiCad v4/5 EESchema .sch). */
export function parseKicadSchematic(text: string, name = 'KiCad_Схема'): { project: SchematicProject; report: GostConversionReport } {
  const components: PlacedComponent[] = [];
  const wires: SchWire[] = [];

  if (text.includes('(kicad_sch') || text.includes('(symbol (')) {
    const roots = parseSExpressions(text);
    const root = roots[0] ?? [];
    for (const sym of sxFindAll(root, 'symbol')) {
      if (!sxFind(sym, 'lib_id')) continue;
      const libId = sxStr(sxFind(sym, 'lib_id'), 1) || 'Device:R';
      const at = sxFind(sym, 'at');
      const x = sxNum(at, 1, 100);
      const y = sxNum(at, 2, 100);
      const angle = sxNum(at, 3, 0);
      const mirrorNode = sxFind(sym, 'mirror');
      const mirrorAxis = mirrorNode ? sxStr(mirrorNode, 1).toLowerCase() : '';
      let ref = 'U1';
      let val = libId.split(':').pop() || 'IC';
      let fp = '';
      for (const prop of sxFindAll(sym, 'property')) {
        const key = sxStr(prop, 1).toLowerCase();
        const pv = sxStr(prop, 2);
        if (key === 'reference') ref = pv;
        else if (key === 'value') val = pv;
        else if (key === 'footprint') fp = pv;
      }
      const placed = makeSchComp(ref, libId.split(':').pop() || val, val, fp, x, y, angle);
      if (mirrorAxis === 'x') placed.flipY = true;
      else if (mirrorAxis === 'y') placed.flipX = true;
      components.push(placed);
    }
    const labelPoints: { name: string; x: number; y: number }[] = [];
    for (const lblTag of ['label', 'global_label', 'hierarchical_label'] as const) {
      for (const lbl of sxFindAll(root, lblTag)) {
        const nameTxt = sxStr(lbl, 1);
        const at = sxFind(lbl, 'at');
        if (nameTxt && at) labelPoints.push({ name: nameTxt, x: sxNum(at, 1), y: sxNum(at, 2) });
      }
    }
    for (const w of sxFindAll(root, 'wire')) {
      const ptsNode = sxFind(w, 'pts');
      if (!ptsNode) continue;
      const pts = sxFindAll(ptsNode, 'xy').map((xy) => ({ x: sxNum(xy, 1), y: sxNum(xy, 2) }));
      if (pts.length >= 2) {
        const matchedLbl = labelPoints.find((lp) =>
          pts.some((pt) => Math.hypot(pt.x - lp.x, pt.y - lp.y) < 1.5)
        );
        wires.push({ id: uid('kw'), points: pts, netName: matchedLbl?.name || `NET_${wires.length + 1}` });
      }
    }
  } else {
    // Legacy EESchema .sch ($Comp ... $EndComp, Wire Wire Line)
    const compBlocks = text.split('$Comp');
    for (let i = 1; i < compBlocks.length; i++) {
      const blk = compBlocks[i].split('$EndComp')[0] || '';
      const lMatch = /^L\s+(\S+)\s+(\S+)/m.exec(blk);
      const pMatch = /^P\s+([-\d.]+)\s+([-\d.]+)/m.exec(blk);
      const valMatch = /^F\s+1\s+"([^"]*)"/m.exec(blk);
      const fpMatch = /^F\s+2\s+"([^"]*)"/m.exec(blk);
      const libSym = (lMatch?.[1] || 'U').split(':').pop() || 'U';
      const ref = lMatch?.[2] || `U${i}`;
      const x = pMatch ? Math.round((parseFloat(pMatch[1]) * 0.0254) * 10) / 10 : 50 + i * 25;
      const y = pMatch ? Math.round((parseFloat(pMatch[2]) * 0.0254) * 10) / 10 : 60;
      components.push(makeSchComp(ref, libSym, valMatch?.[1] || libSym, fpMatch?.[1] || '', x, y));
    }
    const wireRe = /Wire\s+Wire\s+Line\s*\r?\n\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/g;
    let wm: RegExpExecArray | null;
    while ((wm = wireRe.exec(text)) !== null) {
      wires.push({
        id: uid('kw'),
        points: [
          { x: parseFloat(wm[1]) * 0.0254, y: parseFloat(wm[2]) * 0.0254 },
          { x: parseFloat(wm[3]) * 0.0254, y: parseFloat(wm[4]) * 0.0254 }
        ],
        netName: `NET_${wires.length + 1}`
      });
    }
  }

  const raw = createImportedSchematicProject({ filePath: `${name}.gostsch`, projectName: name, titleName: name, components, wires });
  const converted = convertImportedSchematicToGost(raw, 'KiCad Schematic');
  converted.report.warnings = [
    'Импорт схемы KiCad частичный: исходные УГО и выводы заменяются библиотечными или приблизительными, иерархические листы не загружаются. Проверьте компоненты, выводы и все соединения до дальнейшей работы.'
  ];
  return converted;
}

/** Imports KiCad PCB (.kicad_pcb). */
export function parseKicadPcb(text: string, name = 'KiCad_Плата'): { pcb: PcbProject; report: GostConversionReport } {
  const roots = parseSExpressions(text);
  const root = roots[0] ?? [];
  const mods = sxFindAll(root, 'footprint').concat(sxFindAll(root, 'module'));
  const netMap = new Map<number, string>();
  for (const n of sxFindAll(root, 'net')) {
    netMap.set(sxNum(n, 1), sxStr(n, 2));
  }

  const components: PcbPlacedComponent[] = mods.map((m, idx) => {
    const fpName = sxStr(m, 1);
    const at = sxFind(m, 'at');
    const x = sxNum(at, 1, 20 + idx * 14);
    const y = sxNum(at, 2, 20);
    const angle = sxNum(at, 3, 0);
    const layerStr = sxStr(sxFind(m, 'layer'), 1).toLowerCase();
    let ref = `U${idx + 1}`;
    let val = '';
    for (const fpTxt of sxFindAll(m, 'fp_text')) {
      if (sxStr(fpTxt, 1) === 'reference') ref = sxStr(fpTxt, 2);
      if (sxStr(fpTxt, 1) === 'value') val = sxStr(fpTxt, 2);
    }
    for (const prop of sxFindAll(m, 'property')) {
      if (sxStr(prop, 1) === 'Reference') ref = sxStr(prop, 2);
      if (sxStr(prop, 1) === 'Value') val = sxStr(prop, 2);
    }
    const comp = createPlaceholderChipComponent({ idPrefix: 'kpcb', refDes: ref, value: val, typeName: val || fpName, x, y, emptyPads: true });
    comp.patternId = fpName;
    // KiCad angles are CCW; negate into clockwise canvas degrees
    comp.angle = ((Math.round(-angle) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
    comp.side = layerStr.includes('b.cu') ? 'Bottom' : 'Top';

    const pads: PadDef[] = sxFindAll(m, 'pad').map((pd, pIdx) => {
      const pNum = sxStr(pd, 1) || String(pIdx + 1);
      const pType = sxStr(pd, 2);
      const pShape = sxStr(pd, 3);
      const pAt = sxFind(pd, 'at');
      const pSize = sxFind(pd, 'size');
      const pDrill = sxFind(pd, 'drill');
      const netNode = sxFind(pd, 'net');
      if (netNode) comp.padNets[pNum] = sxStr(netNode, 2) || netMap.get(sxNum(netNode, 1)) || '';
      const hole = pDrill ? sxNum(pDrill, 1, 0) : 0;
      const rawPadAng = sxNum(pAt, 3, 0);
      const relPadAng = rawPadAng ? ((-rawPadAng - comp.angle) % 360 + 360) % 360 : 0;
      return {
        id: uid('kpd'),
        number: pNum,
        type: pType === 'np_thru_hole' ? 'MountingHole' : pType === 'thru_hole' ? 'THT' : 'SMD',
        shape: pShape === 'circle' ? 'Round' : pShape === 'oval' ? 'Oval' : pShape === 'roundrect' ? 'RoundedRect' : 'Rect',
        x: sxNum(pAt, 1),
        y: sxNum(pAt, 2),
        angle: relPadAng || undefined,
        width: Math.max(0.4, sxNum(pSize, 1, 1.4)),
        height: Math.max(0.4, sxNum(pSize, 2, 1.4)),
        holeDiameter: hole,
        layer: hole > 0 ? 'All' : comp.side
      };
    });
    if (pads.length > 0) comp.pads = pads;
    return comp;
  });

  // Edge.Cuts primitives need not be stored in traversal order. Assemble a
  // single closed loop by matching endpoints; never invent a board boundary.
  const edgeSegments: [Point2D, Point2D][] = [];
  for (const grLine of sxFindAll(root, 'gr_line')) {
    if (sxStr(sxFind(grLine, 'layer'), 1).toLowerCase() !== 'edge.cuts') continue;
    const start = sxFind(grLine, 'start'), end = sxFind(grLine, 'end');
    if (start && end) edgeSegments.push([{ x: sxNum(start, 1), y: sxNum(start, 2) }, { x: sxNum(end, 1), y: sxNum(end, 2) }]);
  }
  for (const grRect of sxFindAll(root, 'gr_rect')) {
    if (sxStr(sxFind(grRect, 'layer'), 1).toLowerCase() !== 'edge.cuts') continue;
    const start = sxFind(grRect, 'start'), end = sxFind(grRect, 'end');
    if (start && end) {
      const x1 = sxNum(start, 1), y1 = sxNum(start, 2), x2 = sxNum(end, 1), y2 = sxNum(end, 2);
      const points = [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
      for (let i = 0; i < points.length; i++) edgeSegments.push([points[i], points[(i + 1) % points.length]]);
    }
  }
  const unsupportedEdges = ['gr_arc', 'gr_circle', 'gr_poly', 'gr_curve'].some((tag) =>
    sxFindAll(root, tag).some((shape) => sxStr(sxFind(shape, 'layer'), 1).toLowerCase() === 'edge.cuts')
  );
  const warnings: string[] = [];
  let outline: Point2D[] = [];
  if (!unsupportedEdges && edgeSegments.length >= 3) {
    const remaining = edgeSegments.slice();
    const first = remaining.shift()!;
    const points = [first[0], first[1]];
    const equal = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y) < 0.001;
    let valid = true;
    while (remaining.length > 0 && !equal(points[points.length - 1], points[0])) {
      const tail = points[points.length - 1];
      const matches = remaining.map((segment, i) => ({ segment, i })).filter(({ segment }) => equal(segment[0], tail) || equal(segment[1], tail));
      if (matches.length !== 1) { valid = false; break; }
      const { segment, i } = matches[0];
      points.push(equal(segment[0], tail) ? segment[1] : segment[0]);
      remaining.splice(i, 1);
    }
    if (valid && remaining.length === 0 && points.length >= 4 && equal(points[points.length - 1], points[0])) {
      const polygon = points.slice(0, -1);
      let intersects = false;
      for (let i = 0; i < polygon.length; i++) {
        for (let j = i + 1; j < polygon.length; j++) {
          if (j === i + 1 || (i === 0 && j === polygon.length - 1)) continue;
          if (segmentsIntersect(polygon[i], polygon[(i + 1) % polygon.length], polygon[j], polygon[(j + 1) % polygon.length])) intersects = true;
        }
      }
      const area = polygon.reduce((sum, p, i) => sum + p.x * polygon[(i + 1) % polygon.length].y - polygon[(i + 1) % polygon.length].x * p.y, 0);
      if (!intersects && Math.abs(area) > 1e-9) outline = polygon;
    }
  }
  if (outline.length === 0) warnings.push('Контур Edge.Cuts не удалось восстановить как один замкнутый контур из отрезков. Проверьте и создайте контур вручную до производства.');
  if (sxFindAll(root, 'zone').length > 0) warnings.push('Зоны меди и зоны запрета KiCad не импортированы. Восстановите их вручную и проверьте плату до производства.');

  const traces: PcbTrace[] = sxFindAll(root, 'segment').map((seg) => {
    const s = sxFind(seg, 'start');
    const e = sxFind(seg, 'end');
    const lay = sxStr(sxFind(seg, 'layer'), 1).toLowerCase();
    const netIdx = sxNum(sxFind(seg, 'net'), 1, 0);
    return {
      id: uid('ktr'),
      layer: lay.includes('b.cu') ? 'BottomCopper' : 'TopCopper',
      netName: netMap.get(netIdx) || '',
      width: Math.max(0.15, sxNum(sxFind(seg, 'width'), 1, 0.25)),
      points: [{ x: sxNum(s, 1), y: sxNum(s, 2) }, { x: sxNum(e, 1), y: sxNum(e, 2) }]
    };
  });

  const vias: PcbVia[] = sxFindAll(root, 'via').map((v) => {
    const at = sxFind(v, 'at');
    return {
      id: uid('kvia'),
      x: sxNum(at, 1),
      y: sxNum(at, 2),
      netName: netMap.get(sxNum(sxFind(v, 'net'), 1, 0)) || '',
      outerDiameter: Math.max(0.5, sxNum(sxFind(v, 'size'), 1, 0.7)),
      holeDiameter: Math.max(0.3, sxNum(sxFind(v, 'drill'), 1, 0.35)),
      startLayer: 'TopCopper',
      endLayer: 'BottomCopper',
      viaStyle: 'Through'
    };
  });

  const pcb = createImportedPcbProject({ filePath: `${name}.gostpcb`, projectName: name, components });
  pcb.boardOutline = outline;
  pcb.traces = traces;
  pcb.vias = vias;
  const converted = convertImportedPcbToGost(pcb, 'KiCad PCB (.kicad_pcb)');
  converted.report.warnings = warnings;
  return converted;
}

/** Imports Autodesk Eagle / Fusion XML Schematic (.sch) or Board (.brd). */
export function parseEagleXml(xml: string, isPcb: boolean, name = 'Eagle_Проект'): {
  schematic?: { project: SchematicProject; report: GostConversionReport };
  pcb?: { pcb: PcbProject; report: GostConversionReport };
} {
  const root = parseMiniXml(xml);
  const partsByName = new Map<string, { value: string; device: string; package: string }>();
  for (const part of xmlFindAll(root, 'part')) {
    const n = part.attrs.name || '';
    if (n) partsByName.set(n, { value: part.attrs.value || '', device: part.attrs.deviceset || '', package: part.attrs.package || '' });
  }

  if (isPcb || xmlFindAll(root, 'board').length > 0) {
    const pkgPads = new Map<string, PadDef[]>();
    for (const library of xmlFindAll(root, 'library')) {
      for (const pkg of xmlFindAll(library, 'package')) {
      const pn = pkg.attrs.name || '';
      if (!pn) continue;
      const pds: PadDef[] = [];
      for (const smd of xmlFindAll(pkg, 'smd')) {
        pds.push({
          id: uid('esmd'), number: smd.attrs.name || String(pds.length + 1), type: 'SMD', shape: 'Rect',
          x: parseFloat(smd.attrs.x || '0') || 0, y: -(parseFloat(smd.attrs.y || '0') || 0),
          width: Math.max(0.3, parseFloat(smd.attrs.dx || '1.0') || 1.0),
          height: Math.max(0.3, parseFloat(smd.attrs.dy || '1.0') || 1.0), layer: 'Top'
        });
      }
      for (const pad of xmlFindAll(pkg, 'pad')) {
        const hole = parseFloat(pad.attrs.drill || '0.8') || 0.8;
        pds.push({
          id: uid('etht'), number: pad.attrs.name || String(pds.length + 1), type: 'THT', shape: 'Round',
          x: parseFloat(pad.attrs.x || '0') || 0, y: -(parseFloat(pad.attrs.y || '0') || 0),
          width: hole + 0.7, height: hole + 0.7, holeDiameter: hole, layer: 'All'
        });
      }
      pkgPads.set(`${library.attrs.name || ''}\u0000${pn}`, pds);
      }
    }

    const elems = xmlFindAll(root, 'element');
    const comps: PcbPlacedComponent[] = elems.map((el, i) => {
      const ref = el.attrs.name || `U${i + 1}`;
      const pkg = el.attrs.package || '';
      const val = el.attrs.value || '';
      const rot = (el.attrs.rot || '').toUpperCase();
      const isMir = rot.includes('M');
      const deg = parseFloat(rot.replace(/[^-\d.]/g, '') || '0') || 0;
      const realPads = pkgPads.get(`${el.attrs.library || ''}\u0000${pkg}`);
      const c = createPlaceholderChipComponent({
        idPrefix: 'egl',
        refDes: ref,
        value: val,
        typeName: val || pkg || ref,
        x: parseFloat(el.attrs.x || String(20 + i * 12)) || 20,
        y: parseFloat(el.attrs.y || '20') || 20,
        emptyPads: true
      });
      if (realPads) c.pads = structuredClone(realPads);
      c.graphics = [];
      c.side = isMir ? 'Bottom' : 'Top';
      c.angle = ((Math.round(deg) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
      c.patternId = pkg || c.patternId;
      return c;
    });
    const elementsByName = new Map<string, PcbPlacedComponent[]>();
    for (let i = 0; i < elems.length; i++) {
      const name = elems[i].attrs.name;
      if (!name) continue;
      const matches = elementsByName.get(name) ?? [];
      matches.push(comps[i]);
      elementsByName.set(name, matches);
    }
    let unresolvedContacts = 0;
    const conflictedContacts = new Set<string>();
    let polygonCount = 0;
    const traces: PcbTrace[] = [];
    const vias: PcbVia[] = [];
    for (const sig of xmlFindAll(root, 'signal')) {
      const net = sig.attrs.name || '';
      polygonCount += xmlFindAll(sig, 'polygon').length;
      for (const contact of xmlFindAll(sig, 'contactref')) {
        const targets = elementsByName.get(contact.attrs.element || '') ?? [];
        const pad = contact.attrs.pad || '';
        if (!net || targets.length !== 1 || !pad || !targets[0].pads.some((p) => p.number === pad)) {
          unresolvedContacts++;
          continue;
        }
        const contactKey = `${contact.attrs.element}\u0000${pad}`;
        if (conflictedContacts.has(contactKey)) { unresolvedContacts++; continue; }
        const prior = targets[0].padNets[pad];
        if (prior && prior !== net) {
          // Conflicting signal assignments are invalid; retain neither guess.
          delete targets[0].padNets[pad];
          conflictedContacts.add(contactKey);
          unresolvedContacts++;
          continue;
        }
        targets[0].padNets[pad] = net;
      }

      for (const w of xmlFindAll(sig, 'wire')) {
        const layerNum = w.attrs.layer || '1';
        if (layerNum !== '1' && layerNum !== '16') continue;
        traces.push({
          id: uid('etr'),
          layer: layerNum === '16' ? 'BottomCopper' : 'TopCopper',
          netName: net,
          width: Math.max(0.15, parseFloat(w.attrs.width || '0.25') || 0.25),
          points: [
            { x: parseFloat(w.attrs.x1 || '0'), y: parseFloat(w.attrs.y1 || '0') },
            { x: parseFloat(w.attrs.x2 || '0'), y: parseFloat(w.attrs.y2 || '0') }
          ]
        });
      }
      for (const v of xmlFindAll(sig, 'via')) {
        const hole = parseFloat(v.attrs.drill || '0.35') || 0.35;
        vias.push({
          id: uid('evia'),
          x: parseFloat(v.attrs.x || '0') || 0,
          y: parseFloat(v.attrs.y || '0') || 0,
          netName: net,
          outerDiameter: Math.max(hole + 0.35, parseFloat(v.attrs.diameter || '0') || hole + 0.35),
          holeDiameter: hole,
          startLayer: 'TopCopper',
          endLayer: 'BottomCopper',
          viaStyle: 'Through'
        });
      }
    }
    const outlinePts: Point2D[] = [];
    for (const pl of xmlFindAll(root, 'plain')) {
      for (const w of xmlFindAll(pl, 'wire')) {
        if (w.attrs.layer !== '20') continue;
        outlinePts.push(
          { x: parseFloat(w.attrs.x1 || '0') || 0, y: parseFloat(w.attrs.y1 || '0') || 0 },
          { x: parseFloat(w.attrs.x2 || '0') || 0, y: parseFloat(w.attrs.y2 || '0') || 0 }
        );
      }
      for (const h of xmlFindAll(pl, 'hole')) {
        const d = parseFloat(h.attrs.drill || '3.2') || 3.2;
        vias.push({
          id: uid('ehl'), x: parseFloat(h.attrs.x || '0') || 0, y: parseFloat(h.attrs.y || '0') || 0,
          netName: '', outerDiameter: d + 0.4, holeDiameter: d, startLayer: 'TopCopper', endLayer: 'BottomCopper', viaStyle: 'Through'
        });
      }
    }
    const pcb = createImportedPcbProject({ filePath: `${name}.gostpcb`, projectName: name, components: comps });
    if (outlinePts.length >= 3) {
      const xs = outlinePts.map((p) => p.x);
      const ys = outlinePts.map((p) => p.y);
      pcb.boardOutline = [
        { x: Math.min(...xs), y: Math.min(...ys) },
        { x: Math.max(...xs), y: Math.min(...ys) },
        { x: Math.max(...xs), y: Math.max(...ys) },
        { x: Math.min(...xs), y: Math.max(...ys) }
      ];
    }
    pcb.traces = traces;
    pcb.vias = vias;
    const converted = convertImportedPcbToGost(pcb, 'Autodesk Eagle (.brd)', { preserveEmptyPads: true });
    converted.pcb.components.forEach((component, i) => { component.patternId = comps[i].patternId; });
    converted.report.warnings = [
      'Импорт платы Eagle частичный: геометрия корпусов, отверстий, контура и проводников может отличаться от оригинала. Проверьте плату до производства.'
    ];
    if (polygonCount > 0) converted.report.warnings.push(`Полигоны цепей Eagle (${polygonCount}) не импортированы. Восстановите их вручную и проверьте плату до производства.`);
    if (unresolvedContacts > 0) converted.report.warnings.push(`Не удалось однозначно восстановить соединения контактных площадок Eagle: ${unresolvedContacts}. Проверьте список цепей.`);
    return { pcb: converted };
  }

  const insts = xmlFindAll(root, 'instance');
  const comps: PlacedComponent[] =
    insts.length > 0
      ? insts.map((ins, i) => {
          const ref = ins.attrs.part || `U${i + 1}`;
          const info = partsByName.get(ref);
          return makeSchComp(
            ref,
            info?.device || info?.value || ref,
            info?.value || info?.device || '',
            info?.package || '',
            parseFloat(ins.attrs.x || String(50 + i * 25)) || 50,
            parseFloat(ins.attrs.y || '80') || 80
          );
        })
      : Array.from(partsByName.entries()).map(([ref, info], i) =>
          makeSchComp(
            ref,
            info.device || info.value || ref,
            info.value || info.device || '',
            info.package || '',
            50 + (i % 6) * 25,
            80 + Math.floor(i / 6) * 20
          )
        );
  const wires: SchWire[] = [];
  for (const net of xmlFindAll(root, 'net')) {
    const netName = net.attrs.name || `NET_${wires.length + 1}`;
    for (const w of xmlFindAll(net, 'wire')) {
      wires.push({
        id: uid('ew'),
        netName,
        points: [
          { x: parseFloat(w.attrs.x1 || '0') || 0, y: parseFloat(w.attrs.y1 || '0') || 0 },
          { x: parseFloat(w.attrs.x2 || '0') || 0, y: parseFloat(w.attrs.y2 || '0') || 0 }
        ]
      });
    }
  }
  const allXs = [...comps.map((c) => c.x), ...wires.flatMap((w) => w.points.map((p) => p.x))];
  const allYs = [...comps.map((c) => c.y), ...wires.flatMap((w) => w.points.map((p) => p.y))];
  const shiftX = allXs.length && Math.min(...allXs) < 25 ? 25 - Math.min(...allXs) : 0;
  const shiftY = allYs.length && Math.min(...allYs) < 25 ? 25 - Math.min(...allYs) : 0;
  if (shiftX || shiftY) {
    for (const c of comps) { c.x += shiftX; c.y += shiftY; }
    for (const w of wires) for (const pt of w.points) { pt.x += shiftX; pt.y += shiftY; }
  }
  const raw = createImportedSchematicProject({ filePath: `${name}.gostsch`, projectName: name, titleName: name, components: comps, wires });
  return { schematic: convertImportedSchematicToGost(raw, 'Autodesk Eagle (.sch)') };
}

/** Imports Proteus Design Suite (.pdsprj ZIP archive, XML schematic, or ISIS .sec/.sdf text). */
export async function parseProteusInput(input: string | Uint8Array, name = 'Proteus_Проект'): Promise<{
  project: SchematicProject;
  report: GostConversionReport;
}> {
  let xmlOrText = typeof input === 'string' ? input : '';
  if (input instanceof Uint8Array && isZipBuffer(input)) {
    const entries = await extractZipEntries(input);
    const decodedTexts: string[] = [];
    for (const [fn, bytes] of Object.entries(entries)) {
      if (/\.(xml|workspace|dsn|sec|sdf|txt|net)$/i.test(fn)) {
        decodedTexts.push(utf8Decode(bytes));
      } else {
        // Scan binary/DSN chunks for readable ASCII component/net descriptors
        const ascii = utf8Decode(bytes).replace(/[^\x20-\x7E\r\n\tА-Яа-яЁё]/g, ' ');
        if (ascii.length > 20) decodedTexts.push(ascii);
      }
    }
    xmlOrText = decodedTexts.join('\n');
  }

  const components: PlacedComponent[] = [];
  const wires: SchWire[] = [];

  if (xmlOrText.includes('<')) {
    const root = parseMiniXml(xmlOrText);
    const nodes = xmlFindAll(root, 'COMPONENT').concat(xmlFindAll(root, 'PART')).concat(xmlFindAll(root, 'DEVICE'));
    nodes.forEach((nd, idx) => {
      const ref = nd.attrs.REFERENCE || nd.attrs.NAME || nd.attrs.ID || `U${idx + 1}`;
      const val = nd.attrs.VALUE || nd.attrs.DEVICE || nd.attrs.MODEL || '';
      const pkg = nd.attrs.PACKAGE || nd.attrs.PCB_PACKAGE || '';
      components.push(
        makeSchComp(
          ref,
          val || nd.attrs.DEVICE || ref,
          val,
          pkg,
          parseFloat(nd.attrs.X || String(60 + (idx % 5) * 45)) || 60,
          parseFloat(nd.attrs.Y || String(60 + Math.floor(idx / 5) * 35)) || 60
        )
      );
    });
  }

  // Fallback pattern extraction for Proteus ISIS ASCII / .sec / binary DSN strings
  if (components.length === 0) {
    const propRe = /\*COMPONENT|\bREF=([A-Za-z]+\d+)|\{PACKAGE=([^}]+)\}|([A-Z]{1,4}\d{1,3})\s*[,:=]\s*(ATMEGA\w+|LM016L|7SEG\w*|MAX232|BUTTON|LED[-A-Z]*|POT-HG|RES|CAP|CRYSTAL|VIRTUAL TERMINAL)/gi;
    let m: RegExpExecArray | null;
    let idx = 0;
    const knownPartsRe = /\b(ATMEGA8|ATMEGA16|ATMEGA328P?|LM016L|HD44780|7SEG-[A-Z0-9-]+|MAX232|FT232RL|CH340G|VIRTUAL TERMINAL|SERVO|SG90|EC11|BUTTON|LED-[A-Z]+|POT-HG|CRYSTAL|1N4007|1N4148|LM358|NE555)\b/gi;
    const seen = new Set<string>();
    while ((m = knownPartsRe.exec(xmlOrText)) !== null) {
      const tok = m[1];
      const key = `${tok}_${idx}`;
      if (seen.has(tok) && idx > 15) continue;
      seen.add(tok);
      const refPrefix = /ATMEGA|MAX|FT|CH|LM|NE/i.test(tok) ? 'U' : /LED/i.test(tok) ? 'D' : /BUTTON/i.test(tok) ? 'SW' : /POT/i.test(tok) ? 'RV' : /CRYS/i.test(tok) ? 'Y' : 'U';
      components.push(makeSchComp(`${refPrefix}${idx + 1}`, tok, tok, '', 65 + (idx % 4) * 55, 70 + Math.floor(idx / 4) * 45));
      idx++;
    }
    void propRe;
  }

  if (components.length === 0 && input instanceof Uint8Array) {
    throw new Error(`Файл Proteus (${name}) повреждён или не содержит распознаваемых компонентов.`);
  }

  const raw = createImportedSchematicProject({ filePath: `${name}.gostsch`, projectName: name, titleName: name, components, wires });
  return convertImportedSchematicToGost(raw, 'Proteus (.pdsprj/.sec)');
}

/** Imports EasyEDA / LCEDA JSON (.json / .esch / .epcb), Altium/Protel/P-CAD ASCII, PADS, OrCAD EDIF, SPICE (.cir). */
export function parseMultiEcadSchematic(text: string, name = 'ECAD_Импорт'): { project: SchematicProject; report: GostConversionReport } {
  const trimmed = text.trim();
  const components: PlacedComponent[] = [];
  const wires: SchWire[] = [];

  // 1. EasyEDA JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const obj = JSON.parse(trimmed) as { shape?: string[]; schematics?: { dataStr?: { shape?: string[] } }[] };
      const shapes: string[] = obj.shape ?? obj.schematics?.[0]?.dataStr?.shape ?? [];
      shapes.forEach((sh, idx) => {
        const parts = sh.split('~');
        if (parts[0] === 'LIB' || parts[0] === 'PART') {
          const x = (parseFloat(parts[1]) || 200) * 0.25;
          const y = (parseFloat(parts[2]) || 200) * 0.25;
          const designatorTok =
            [...parts.slice(5)].reverse().find((tok) => /^[A-ZА-Я]{1,4}\d+$/i.test(tok.trim()))?.trim() ||
            parts.find((tok, ti) => ti >= 3 && /^[A-ZА-Я]{1,3}\d{1,3}$/i.test(tok.trim()))?.trim();
          const ref = designatorTok || `U${idx + 1}`;
          const val = parts[3] || ref;
          components.push(makeSchComp(ref, val, val, parts[4] || '', Math.max(25, x), Math.max(25, y)));
        } else if (parts[0] === 'W') {
          const coords = (parts[1] || '').split(' ').map(Number).filter(Number.isFinite);
          const pts: Point2D[] = [];
          for (let i = 0; i + 1 < coords.length; i += 2) {
            pts.push({ x: Math.max(15, coords[i] * 0.25), y: Math.max(15, coords[i + 1] * 0.25) });
          }
          if (pts.length >= 2) wires.push({ id: uid('ezw'), points: pts, netName: parts[2] || `NET_${wires.length + 1}` });
        }
      });
    } catch {
      // fall through
    }
  }

  // 2. Altium Designer / Protel ASCII SchDoc records (|RECORD=1|LIBREFERENCE=...|DESIGNATOR=...)
  if (components.length === 0 && trimmed.includes('|RECORD=')) {
    const recLines = trimmed.split(/\r?\n/).filter((l) => l.includes('|RECORD='));
    const recByIdx = new Map<number, PlacedComponent>();
    recLines.forEach((line, recIdx) => {
      const rec = /\|RECORD=(\d+)/.exec(line)?.[1];
      if (rec === '1') {
        const lib = /\|LIBREFERENCE=([^|]+)/.exec(line)?.[1] || 'IC';
        const desig = /\|DESIGNATOR=([^|]+)/.exec(line)?.[1];
        const x = (parseFloat(/\|LOCATION\.X=([-\d.]+)/.exec(line)?.[1] || '100') || 100) * 0.5;
        const y = (parseFloat(/\|LOCATION\.Y=([-\d.]+)/.exec(line)?.[1] || '100') || 100) * 0.5;
        const comp = makeSchComp(desig || `U${components.length + 1}`, lib, lib, /\|CURRENTPARTID=([^|]+)/.exec(line)?.[1] || '', x, y);
        components.push(comp);
        recByIdx.set(recIdx, comp);
      } else if (rec === '34') {
        const textVal = /\|TEXT=([^|]+)/.exec(line)?.[1];
        const owner = parseInt(/\|OWNERINDEX=(\d+)/.exec(line)?.[1] || '-1', 10);
        const target = recByIdx.get(owner) ?? components[owner];
        if (textVal && target) target.refDes = textVal;
      }
    });
    const minX = components.length ? Math.min(...components.map((c) => c.x)) : 0;
    const minY = components.length ? Math.min(...components.map((c) => c.y)) : 0;
    if (minX < 25 || minY < 25) {
      const dx = minX < 25 ? 25 - minX : 0;
      const dy = minY < 25 ? 25 - minY : 0;
      for (const c of components) { c.x += dx; c.y += dy; }
    }
  }

  // 3. P-CAD ASCII / OrCAD EDIF S-expr netlist
  if (components.length === 0 && (trimmed.includes('(compInst') || trimmed.includes('(instance '))) {
    const compInstRe = /\((?:compInst|instance)\s+"?([A-Za-zА-Яа-я0-9_]+)"?[\s\S]*?(?:compValue\s+"?([^"\s)]+)"?|cellRef\s+"?([^"\s)]+)"?)?/g;
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = compInstRe.exec(trimmed)) !== null && idx < 300) {
      const ref = m[1];
      const val = m[2] || m[3] || ref;
      components.push(makeSchComp(ref, val, val, '', 45 + (idx % 6) * 45, 45 + Math.floor(idx / 6) * 35));
      idx++;
    }
  }

  // 4. LTspice ASCII Schematic (.asc: Version 4 / SYMBOL / SYMATTR / WIRE)
  if (components.length === 0 && (/\bSYMBOL\s+\S+\s+[-\d.]+\s+[-\d.]+/.test(trimmed) || /^Version\s+4/m.test(trimmed))) {
    let curComp: PlacedComponent | null = null;
    for (const rawLine of trimmed.split(/\r?\n/)) {
      const line = rawLine.trim();
      const symM = /^SYMBOL\s+(\S+)\s+([-\d.]+)\s+([-\d.]+)/.exec(line);
      if (symM) {
        const x = Math.max(25, Math.min(380, Math.abs(parseFloat(symM[2])) * 0.25 + 40));
        const y = Math.max(25, Math.min(260, Math.abs(parseFloat(symM[3])) * 0.25 + 40));
        curComp = makeSchComp(`U${components.length + 1}`, symM[1], symM[1], '', x, y);
        components.push(curComp);
      } else if (curComp && /^SYMATTR\s+InstName\s+(.+)/.test(line)) {
        curComp.refDes = /^SYMATTR\s+InstName\s+(.+)/.exec(line)![1].trim();
      } else if (curComp && /^SYMATTR\s+Value\s+(.+)/.test(line)) {
        curComp.value = /^SYMATTR\s+Value\s+(.+)/.exec(line)![1].trim();
      } else if (/^WIRE\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+/.test(line)) {
        const wm = /^WIRE\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/.exec(line)!;
        wires.push({
          id: uid('ltw'),
          netName: `NET_${wires.length + 1}`,
          points: [
            { x: Math.abs(parseFloat(wm[1])) * 0.25 + 40, y: Math.abs(parseFloat(wm[2])) * 0.25 + 40 },
            { x: Math.abs(parseFloat(wm[3])) * 0.25 + 40, y: Math.abs(parseFloat(wm[4])) * 0.25 + 40 }
          ]
        });
      }
    }
  }

  // 5. PADS ASCII (*PART* / *NET*) or SPICE (.cir / .net)
  if (components.length === 0) {
    let inPadsPart = false;
    for (const rawLine of trimmed.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('*PART*')) {
        inPadsPart = true;
        continue;
      }
      if (line.startsWith('*') || line.startsWith('.')) {
        if (line.startsWith('*NET*') || line.startsWith('*END*')) inPadsPart = false;
        continue;
      }
      if (inPadsPart) {
        const pm = /^([A-Za-zА-Яа-я0-9_]+)\s+([^\s]+)(?:\s+([^\s]+))?/.exec(line);
        if (pm) {
          const idx = components.length;
          const [pkgVal, valExtra] = pm[2].split('@');
          components.push(
            makeSchComp(pm[1], valExtra || pkgVal, valExtra || pkgVal, pkgVal, 50 + (idx % 5) * 45, 50 + Math.floor(idx / 5) * 35)
          );
        }
        continue;
      }
      const spiceMatch = /^([RCLDQMXU][A-Za-z0-9_]*)\s+\S+\s+\S+(?:\s+\S+)?\s+([^\s]+)/.exec(line);
      if (spiceMatch) {
        const idx = components.length;
        components.push(makeSchComp(spiceMatch[1], spiceMatch[2], spiceMatch[2], '', 50 + (idx % 5) * 45, 50 + Math.floor(idx / 5) * 35));
      }
    }
  }

  const raw = createImportedSchematicProject({ filePath: `${name}.gostsch`, projectName: name, titleName: name, components, wires });
  return convertImportedSchematicToGost(raw, 'EasyEDA / Altium / P-CAD / LTspice / PADS / SPICE');
}

/** Imports Multi-ECAD PCB formats: EasyEDA PCB JSON, Altium/Protel .PcbDoc ASCII, PADS PCB ASCII, Legacy KiCad .brd, P-CAD PCB ASCII. */
export function parseMultiEcadPcb(text: string, name = 'ECAD_Плата'): { pcb: PcbProject; report: GostConversionReport } {
  const trimmed = text.trim();
  const components: PcbPlacedComponent[] = [];
  const traces: PcbTrace[] = [];
  const vias: PcbVia[] = [];
  let sourceFormat = 'Multi-ECAD PCB';

  // 1. EasyEDA PCB JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const obj = JSON.parse(trimmed) as { shape?: string[] };
      const shapes = obj.shape ?? [];
      sourceFormat = 'EasyEDA PCB (.json/.epcb)';
      for (const sh of shapes) {
        const parts = sh.split('~');
        if (parts[0] === 'TRACK') {
          const coords = (parts[4] || '').split(' ').map(Number).filter(Number.isFinite);
          const pts: Point2D[] = [];
          for (let i = 0; i + 1 < coords.length; i += 2) {
            pts.push({ x: coords[i] * 0.254, y: coords[i + 1] * 0.254 });
          }
          if (pts.length >= 2) {
            traces.push({
              id: uid('eztr'),
              layer: parts[2] === '2' ? 'BottomCopper' : 'TopCopper',
              netName: parts[3] || '',
              width: Math.max(0.15, (parseFloat(parts[1]) || 1) * 0.254),
              points: pts
            });
          }
        } else if (parts[0] === 'VIA') {
          vias.push({
            id: uid('ezv'),
            x: (parseFloat(parts[1]) || 0) * 0.254,
            y: (parseFloat(parts[2]) || 0) * 0.254,
            netName: parts[4] || '',
            outerDiameter: Math.max(0.6, (parseFloat(parts[3]) || 2.5) * 0.254),
            holeDiameter: Math.max(0.3, (parseFloat(parts[5]) || 1.2) * 0.254),
            startLayer: 'TopCopper',
            endLayer: 'BottomCopper',
            viaStyle: 'Through'
          });
        } else if (parts[0] === 'LIB') {
          const idx = components.length;
          const x = Math.max(10, (parseFloat(parts[1]) || 80 + idx * 12) * 0.254);
          const y = Math.max(10, (parseFloat(parts[2]) || 80) * 0.254);
          components.push(createPlaceholderChipComponent({ idPrefix: 'ezpcb', refDes: `U${idx + 1}`, value: parts[6] || '', typeName: parts[6] || 'ЭРЭ', x, y }));
        }
      }
    } catch {
      // fall through
    }
  }

  // 2. Altium / Protel ASCII PCB (|RECORD=Component / Track / Via)
  if (components.length === 0 && traces.length === 0 && trimmed.includes('|RECORD=')) {
    sourceFormat = 'Altium / Protel PCB ASCII';
    for (const line of trimmed.split(/\r?\n/)) {
      if (line.includes('|RECORD=Component')) {
        const ref = /\|SOURCE\s*DESIGNATOR=([^|]+)/i.exec(line)?.[1] || `U${components.length + 1}`;
        const pat = /\|PATTERN=([^|]+)/i.exec(line)?.[1] || '';
        const x = (parseFloat(/\|X=([-\d.]+)/.exec(line)?.[1] || '20') || 20) * 0.0254;
        const y = (parseFloat(/\|Y=([-\d.]+)/.exec(line)?.[1] || '20') || 20) * 0.0254;
        const comp = createPlaceholderChipComponent({ idPrefix: 'altpcb', refDes: ref, value: pat, typeName: pat || ref, x: Math.abs(x) || 20, y: Math.abs(y) || 20 });
        comp.patternId = pat;
        components.push(comp);
      } else if (line.includes('|RECORD=Track')) {
        const x1 = parseFloat(/\|X1=([-\d.]+)/.exec(line)?.[1] || '0') * 0.0254;
        const y1 = parseFloat(/\|Y1=([-\d.]+)/.exec(line)?.[1] || '0') * 0.0254;
        const x2 = parseFloat(/\|X2=([-\d.]+)/.exec(line)?.[1] || '0') * 0.0254;
        const y2 = parseFloat(/\|Y2=([-\d.]+)/.exec(line)?.[1] || '0') * 0.0254;
        traces.push({
          id: uid('alttr'),
          layer: /\|LAYER=BOTTOM/i.test(line) ? 'BottomCopper' : 'TopCopper',
          netName: /\|NET=([^|]+)/i.exec(line)?.[1] || '',
          width: Math.max(0.15, (parseFloat(/\|WIDTH=([-\d.]+)/.exec(line)?.[1] || '10') || 10) * 0.0254),
          points: [{ x: Math.abs(x1), y: Math.abs(y1) }, { x: Math.abs(x2), y: Math.abs(y2) }]
        });
      }
    }
  }

  // 3. Legacy KiCad PCB ($PCBNEW-BOARD / $MODULE)
  if (components.length === 0 && trimmed.includes('$PCBNEW-BOARD')) {
    sourceFormat = 'Legacy KiCad (.brd)';
    const mods = trimmed.split('$MODULE ');
    for (let i = 1; i < mods.length; i++) {
      const blk = mods[i].split('$EndMODULE')[0] || '';
      const pkg = blk.split(/\r?\n/)[0]?.trim() || 'PKG';
      const po = /^Po\s+([-\d.]+)\s+([-\d.]+)/m.exec(blk);
      const refM = /^T0\s+.*?"([^"]+)"/m.exec(blk);
      const comp = createPlaceholderChipComponent({
        idPrefix: 'lkpcb',
        refDes: refM?.[1] || `U${i}`,
        value: pkg,
        typeName: pkg,
        x: po ? Math.abs(parseFloat(po[1]) * 0.00254) : 20 + i * 12,
        y: po ? Math.abs(parseFloat(po[2]) * 0.00254) : 25
      });
      comp.patternId = pkg;
      components.push(comp);
    }
  }

  // 4. PADS ASCII PCB (*PART* / *ROUTE*)
  if (components.length === 0 && (trimmed.includes('*PADS') || trimmed.includes('*PART*'))) {
    sourceFormat = 'Mentor PADS ASCII (.asc)';
    let inPart = false;
    for (const rawLine of trimmed.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.startsWith('*PART*')) { inPart = true; continue; }
      if (line.startsWith('*')) { inPart = false; continue; }
      if (inPart && line) {
        const pm = /^([A-Za-zА-Яа-я0-9_]+)\s+([^\s]+)(?:\s+([-\d.]+)\s+([-\d.]+))?/.exec(line);
        if (pm) {
          const idx = components.length;
          const comp = createPlaceholderChipComponent({
            idPrefix: 'padspcb',
            refDes: pm[1],
            value: pm[2],
            typeName: pm[2],
            x: pm[3] ? Math.abs(parseFloat(pm[3])) : 18 + (idx % 6) * 14,
            y: pm[4] ? Math.abs(parseFloat(pm[4])) : 18 + Math.floor(idx / 6) * 14
          });
          comp.patternId = pm[2];
          components.push(comp);
        }
      }
    }
  }

  const pcb = createImportedPcbProject({ filePath: `${name}.gostpcb`, projectName: name, components });
  pcb.traces = traces;
  pcb.vias = vias;
  return convertImportedPcbToGost(pcb, sourceFormat);
}

/** Imports DXF (LINE, LWPOLYLINE, CIRCLE, ARC) into PCB board outline, cutouts, traces & drills, or schematic shapes. */
export function parseDxfToPcb(dxfText: string, name = 'DXF_Плата'): { pcb: PcbProject; report: GostConversionReport } {
  const lines = dxfText.split(/\r?\n/).map((s) => s.trim());
  const outlineEdges: { x1: number; y1: number; x2: number; y2: number; layer: string }[] = [];
  const polylines: { pts: Point2D[]; layer: string }[] = [];
  const holes: { x: number; y: number; r: number; layer: string }[] = [];

  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] === '0' && lines[i + 1] === 'LINE') {
      let layer = '0', x1 = 0, y1 = 0, x2 = 0, y2 = 0;
      let j = i + 2;
      while (j < lines.length - 1 && lines[j] !== '0') {
        const code = lines[j];
        const val = lines[j + 1];
        if (code === '8') layer = val;
        else if (code === '10') x1 = parseFloat(val) || 0;
        else if (code === '20') y1 = parseFloat(val) || 0;
        else if (code === '11') x2 = parseFloat(val) || 0;
        else if (code === '21') y2 = parseFloat(val) || 0;
        j += 2;
      }
      outlineEdges.push({ x1, y1: -y1, x2, y2: -y2, layer });
      i = j - 1;
    } else if (lines[i] === '0' && lines[i + 1] === 'CIRCLE') {
      let layer = 'DRILL', cx = 0, cy = 0, r = 1;
      let j = i + 2;
      while (j < lines.length - 1 && lines[j] !== '0') {
        const code = lines[j];
        const val = lines[j + 1];
        if (code === '8') layer = val;
        else if (code === '10') cx = parseFloat(val) || 0;
        else if (code === '20') cy = parseFloat(val) || 0;
        else if (code === '40') r = parseFloat(val) || 1;
        j += 2;
      }
      holes.push({ x: cx, y: -cy, r, layer });
      i = j - 1;
    } else if (lines[i] === '0' && lines[i + 1] === 'LWPOLYLINE') {
      let layer = 'BOARD_OUTLINE';
      const pts: Point2D[] = [];
      let curX: number | null = null;
      let j = i + 2;
      while (j < lines.length - 1 && lines[j] !== '0') {
        const code = lines[j];
        const val = lines[j + 1];
        if (code === '8') layer = val;
        else if (code === '10') curX = parseFloat(val) || 0;
        else if (code === '20' && curX !== null) {
          pts.push({ x: curX, y: -(parseFloat(val) || 0) });
          curX = null;
        }
        j += 2;
      }
      if (pts.length >= 2) polylines.push({ pts, layer });
      i = j - 1;
    }
  }

  const pcb = createImportedPcbProject({ filePath: `${name}.gostpcb`, projectName: name, components: [] });

  // Rebuild board outline from polyline or outline edges
  const outPoly = polylines.find((p) => /OUTLINE|CONTOUR|BORDER|EDGE/i.test(p.layer)) ?? polylines[0];
  if (outPoly && outPoly.pts.length >= 3) {
    pcb.boardOutline = outPoly.pts;
  } else if (outlineEdges.length >= 3) {
    const outEdges = outlineEdges.filter((e) => /OUTLINE|CONTOUR|BORDER|EDGE|0/i.test(e.layer));
    const useEdges = outEdges.length >= 3 ? outEdges : outlineEdges;
    const pts: Point2D[] = [{ x: useEdges[0].x1, y: useEdges[0].y1 }, { x: useEdges[0].x2, y: useEdges[0].y2 }];
    for (let k = 1; k < useEdges.length; k++) {
      pts.push({ x: useEdges[k].x2, y: useEdges[k].y2 });
    }
    if (pts.length >= 3) pcb.boardOutline = pts;
  }

  for (const e of outlineEdges) {
    if (/TOP|BOTTOM|COPPER|TRACE/i.test(e.layer)) {
      pcb.traces.push({
        id: uid('dxftr'),
        layer: e.layer.toUpperCase().includes('BOT') ? 'BottomCopper' : 'TopCopper',
        netName: 'DXF_NET',
        width: 0.3,
        points: [{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }]
      });
    } else if (/SILK|TEXT/i.test(e.layer)) {
      pcb.shapes.push({ id: uid('dxfs'), layer: 'TopSilk', type: 'line', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, width: 0.18 });
    }
  }

  for (const h of holes) {
    pcb.vias.push({
      id: uid('dxfh'),
      x: h.x,
      y: h.y,
      netName: '',
      outerDiameter: Math.max(0.8, h.r * 2 + 0.5),
      holeDiameter: Math.max(0.3, h.r * 2),
      startLayer: 'TopCopper',
      endLayer: 'BottomCopper',
      viaStyle: 'Through'
    });
  }

  return {
    pcb,
    report: {
      sourceFormat: 'Autodesk DXF',
      convertedComponents: pcb.vias.length,
      convertedSymbolsToUgo: 0,
      convertedPatterns: 0,
      items: []
    }
  };
}

/** Imports Gerber RS-274X traces/flashes into a PcbProject for inspection or re-routing. */
export function parseGerberToPcb(gerberText: string, name = 'Gerber_Импорт'): { pcb: PcbProject; report: GostConversionReport } {
  const ents = parseGerberPreview(gerberText);
  const pcb = createImportedPcbProject({ filePath: `${name}.gostpcb`, projectName: name, components: [] });
  for (const e of ents) {
    if (e.kind === 'line' && e.pts.length >= 2) {
      pcb.traces.push({
        id: uid('gtr'),
        layer: 'TopCopper',
        netName: 'GERBER',
        width: Math.max(0.15, e.width || 0.25),
        points: e.pts
      });
    } else if (e.kind === 'flash' && e.pts[0]) {
      pcb.vias.push({
        id: uid('gfl'),
        x: e.pts[0].x,
        y: e.pts[0].y,
        netName: '',
        outerDiameter: Math.max(0.6, e.w ?? e.width ?? 1.0),
        holeDiameter: 0.4,
        startLayer: 'TopCopper',
        endLayer: 'BottomCopper',
        viaStyle: 'Through'
      });
    }
  }
  return {
    pcb,
    report: {
      sourceFormat: 'Gerber RS-274X',
      convertedComponents: 0,
      convertedSymbolsToUgo: 0,
      convertedPatterns: 0,
      items: []
    }
  };
}

/** Imports Excellon N/C Drill (.drl / .xln) holes into a PcbProject. */
export function parseExcellonToPcb(drlText: string, name = 'Excellon_Сверловка'): { pcb: PcbProject; report: GostConversionReport } {
  const pcb = createImportedPcbProject({ filePath: `${name}.gostpcb`, projectName: name, components: [] });
  const tools = new Map<string, number>();
  let curDia = 0.8;
  let isMetric = true;
  let inHeader = false;
  for (const raw of drlText.split(/\r?\n/)) {
    const line = raw.trim().toUpperCase();
    if (!line || line.startsWith(';')) continue;
    if (line === 'M48') { inHeader = true; continue; }
    if (line === '%' || line === 'M95') { inHeader = false; continue; }
    if (line.includes('METRIC')) { isMetric = true; continue; }
    if (line.includes('INCH')) { isMetric = false; continue; }
    const tm = /^(T\d+)C([\d.]+)/.exec(line);
    if (tm) {
      const dia = (parseFloat(tm[2]) || 0.8) * (isMetric ? 1 : 25.4);
      tools.set(tm[1], dia);
      continue;
    }
    const sel = /^(T\d+)$/.exec(line);
    if (sel && tools.has(sel[1])) { curDia = tools.get(sel[1])!; continue; }
    if (!inHeader) {
      const xm = /X(-?[\d.]+)/.exec(line);
      const ym = /Y(-?[\d.]+)/.exec(line);
      if (xm && ym) {
        const div = (s: string) => (s.includes('.') ? parseFloat(s) : parseFloat(s) / (isMetric ? 1000 : 10000));
        const x = div(xm[1]) * (isMetric ? 1 : 25.4);
        const y = div(ym[1]) * (isMetric ? 1 : 25.4);
        pcb.vias.push({
          id: uid('exh'),
          x,
          y,
          netName: '',
          outerDiameter: Math.max(curDia + 0.35, curDia * 1.4),
          holeDiameter: curDia,
          startLayer: 'TopCopper',
          endLayer: 'BottomCopper',
          viaStyle: 'Through'
        });
      }
    }
  }
  return {
    pcb,
    report: { sourceFormat: 'Excellon N/C Drill', convertedComponents: 0, convertedSymbolsToUgo: 0, convertedPatterns: 0, items: [] }
  };
}

/** Imports KiCad (.kicad_sym / .kicad_mod) or Eagle (.lbr) component/pattern libraries and converts to GOST. */
export function parseForeignLibrary(text: string, filename = ''): {
  components: ComponentDef[];
  patterns: PatternDef[];
  report: GostConversionReport;
} {
  const ext = filename.toLowerCase();
  const components: ComponentDef[] = [];
  const patterns: PatternDef[] = [];

  if (text.includes('(kicad_symbol_lib') || ext.endsWith('.kicad_sym')) {
    const roots = parseSExpressions(text);
    const root = roots[0] ?? [];
    for (const sym of sxFindAll(root, 'symbol')) {
      const sName = sxStr(sym, 1);
      if (!sName) continue;
      // KiCad v6+ puts pins inside nested unit symbols e.g. (symbol "Name_0_1" (pin ...))
      const pinNodes = [...sxFindAll(sym, 'pin')];
      for (const sub of sxFindAll(sym, 'symbol')) {
        pinNodes.push(...sxFindAll(sub, 'pin'));
      }
      const pinCount = pinNodes.length;
      const sch = createImportedSchematicProject({
        filePath: 'klib.gostsch',
        projectName: 'klib',
        titleName: 'klib',
        components: [makeSchComp('U1', sName, sName, `DIP-${Math.max(8, pinCount)}`, 100, 100)]
      });
      const conv = convertImportedSchematicToGost(sch, 'KiCad .kicad_sym');
      const defId = conv.project.sheets[0].components[0].componentDefId;
      const resolvedDef = findComponentById(defId, conv.project.customComponentDefs);
      if (resolvedDef) components.push({ ...resolvedDef });
    }
  } else if (text.includes('(footprint') || text.includes('(module') || ext.endsWith('.kicad_mod')) {
    const roots = parseSExpressions(text);
    const root = roots[0] ?? [];
    const pName = sxStr(root, 1) || 'KicadPattern';
    const pads: PadDef[] = sxFindAll(root, 'pad').map((pd, i) => {
      const pAt = sxFind(pd, 'at');
      const pSz = sxFind(pd, 'size');
      const drill = sxFind(pd, 'drill');
      const hole = drill ? sxNum(drill, 1, 0) : 0;
      const pShape = sxStr(pd, 3);
      return {
        id: uid('kmpd'),
        number: sxStr(pd, 1) || String(i + 1),
        type: sxStr(pd, 2) === 'thru_hole' ? 'THT' : 'SMD',
        shape: pShape === 'circle' ? 'Round' : pShape === 'oval' ? 'Oval' : pShape === 'roundrect' ? 'RoundedRect' : 'Rect',
        x: sxNum(pAt, 1),
        y: sxNum(pAt, 2),
        angle: sxNum(pAt, 3, 0) ? ((-sxNum(pAt, 3, 0) % 360) + 360) % 360 : undefined,
        width: Math.max(0.4, sxNum(pSz, 1, 1.4)),
        height: Math.max(0.4, sxNum(pSz, 2, 1.4)),
        holeDiameter: hole,
        layer: hole > 0 ? 'All' : 'Top'
      };
    });
    patterns.push({
      id: `PAT_KC_${pName.replace(/[^A-Za-z0-9]/g, '_')}`,
      name: `${pName} (ГОСТ KiCad)`,
      library: 'Импортированные корпуса',
      gostName: 'ГОСТ / KiCad',
      description: `Конвертировано из KiCad .kicad_mod: ${pName}`,
      pads,
      graphics: [{ type: 'rect', layer: 'TopSilk', x: -5, y: -4, w: 10, h: 8, width: 0.15 }],
      courtyard: { width: 12, height: 10 },
      model3d: { shape: 'Box', bodyWidth: 10, bodyLength: 8, bodyHeight: 2.0, color: '#222225' }
    });
  } else if (ext.endsWith('.lbr') || text.includes('<library')) {
    const root = parseMiniXml(text);
    for (const pkg of xmlFindAll(root, 'package')) {
      const pName = pkg.attrs.name || 'EaglePkg';
      const pads: PadDef[] = [];
      for (const smd of xmlFindAll(pkg, 'smd')) {
        pads.push({
          id: uid('egsmd'),
          number: smd.attrs.name || String(pads.length + 1),
          type: 'SMD',
          shape: 'Rect',
          x: parseFloat(smd.attrs.x || '0'),
          y: parseFloat(smd.attrs.y || '0'),
          width: Math.max(0.3, parseFloat(smd.attrs.dx || '1.0')),
          height: Math.max(0.3, parseFloat(smd.attrs.dy || '1.0')),
          layer: 'Top'
        });
      }
      for (const pad of xmlFindAll(pkg, 'pad')) {
        const hole = parseFloat(pad.attrs.drill || '0.8');
        pads.push({
          id: uid('egtht'),
          number: pad.attrs.name || String(pads.length + 1),
          type: 'THT',
          shape: 'Round',
          x: parseFloat(pad.attrs.x || '0'),
          y: parseFloat(pad.attrs.y || '0'),
          width: hole + 0.7,
          height: hole + 0.7,
          holeDiameter: hole,
          layer: 'All'
        });
      }
      patterns.push({
        id: `PAT_EG_${pName.replace(/[^A-Za-z0-9]/g, '_')}`,
        name: `${pName} (ГОСТ Eagle)`,
        library: 'Импортированные корпуса',
        gostName: 'ГОСТ / Eagle',
        description: `Конвертировано из Eagle LBR: ${pName}`,
        pads,
        graphics: [{ type: 'rect', layer: 'TopSilk', x: -5, y: -4, w: 10, h: 8, width: 0.15 }],
        courtyard: { width: 12, height: 10 },
        model3d: { shape: 'Box', bodyWidth: 10, bodyLength: 8, bodyHeight: 2.0, color: '#222225' }
      });
    }
  }

  return {
    components,
    patterns,
    report: {
      sourceFormat: filename || 'Foreign Library',
      convertedComponents: components.length,
      convertedSymbolsToUgo: components.length,
      convertedPatterns: patterns.length,
      items: []
    }
  };
}
