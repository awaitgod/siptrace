import {
  PadDef,
  PatternGraphic,
  PcbCopperPour,
  PcbPlacedComponent,
  PcbProject,
  PcbShape,
  PcbTrace,
  PcbVia,
  Point2D
} from '../../../core/types';
import { uid } from '../../../core/geometry';
import { convertImportedPcbToGost, GostConversionReport } from '../gostConverter';
import {
  makeEcadPcbProject,
  makePadDef,
  makePatternGraphicLine,
  makePcbPlacedComp,
  makePcbShapeCircle,
  makePcbShapeLine,
  makePcbShapeRect
} from '../ecad/ecadFactories';
import { chainSegmentsToOutline, Segment2D, tessellateArc3Pt } from '../outlineChain';
import { parseSExpressions, sxFind, sxFindAll, sxNum, sxStr } from '../sexprParser';
import { mapKicadLayer } from './kicadCommon';

function parseLegacyKicadBrd(text: string, name: string): {
  pcb: PcbProject;
  report: GostConversionReport;
} {
  const scale = 0.000254;
  const components: PcbPlacedComponent[] = [];
  const traces: PcbTrace[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('$MODULE ')) {
      const pkg = line.slice('$MODULE '.length).trim();
      let ref = `U${components.length + 1}`, x = 50, y = 50, angle = 0;
      const pads: PadDef[] = [];
      while (++i < lines.length && lines[i].trim() !== '$EndMODULE') {
        const ml = lines[i].trim();
        if (ml.startsWith('Po ')) {
          const p = ml.split(/\s+/);
          x = (parseFloat(p[1] || '0') || 0) * scale;
          y = (parseFloat(p[2] || '0') || 0) * scale;
          angle = (parseFloat(p[3] || '0') || 0) / 10;
        } else if (ml.startsWith('T0 ')) {
          const m = /"([^"]+)"/.exec(ml);
          if (m?.[1]) ref = m[1];
        } else if (ml === '$PAD') {
          let pnum = `${pads.length + 1}`, px = 0, py = 0, pw = 1.2, ph = 1.2, hole = 0;
          while (++i < lines.length && lines[i].trim() !== '$EndPAD') {
            const pl = lines[i].trim(), p = pl.split(/\s+/);
            if (pl.startsWith('Sh ')) { pnum = p[1]?.replace(/"/g, '') || pnum; pw = (parseFloat(p[3] || '400') || 400) * scale; ph = (parseFloat(p[4] || '400') || 400) * scale; }
            else if (pl.startsWith('Po ')) { px = (parseFloat(p[1] || '0') || 0) * scale; py = (parseFloat(p[2] || '0') || 0) * scale; }
            else if (pl.startsWith('Dr ')) { hole = (parseFloat(p[1] || '0') || 0) * scale; }
          }
          pads.push(makePadDef({ number: pnum, isTht: hole > 0.05, shape: 'Rect', x: px, y: py, width: pw, height: ph, holeDiameter: hole }));
        }
      }
      components.push(makePcbPlacedComp({
        refDes: ref, value: pkg, typeName: pkg, x, y, angle,
        pads: pads.length > 0 ? pads : [makePadDef({ number: '1', x: 0, y: 0, width: 1.2, height: 1.2 })]
      }));
    } else if (line.startsWith('Po 0 ') && i > 0 && lines[i - 1].trim() === '$TRACK') {
      while (i < lines.length && lines[i].trim() !== '$EndTRACK') {
        const tl = lines[i].trim();
        if (tl.startsWith('Po ')) {
          const p = tl.split(/\s+/);
          traces.push({ id: uid('kbt'), layer: 'TopCopper', netName: '', points: [{ x: parseFloat(p[2]) * scale, y: parseFloat(p[3]) * scale }, { x: parseFloat(p[4]) * scale, y: parseFloat(p[5]) * scale }], width: Math.max(0.15, (parseFloat(p[6] || '100') || 100) * scale) });
        }
        i++;
      }
    }
  }

  return convertImportedPcbToGost(makeEcadPcbProject({ name, components, traces, boardOutline: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }, { x: 0, y: 0 }] }), 'KiCad Legacy (.brd)');
}

/** Parses modern KiCad .kicad_pcb (and legacy .brd) boards with full Edge.Cuts arc/circle/poly chaining. */
export function parseKicadPcb(text: string, name = 'KiCad_PCB'): {
  pcb: PcbProject;
  report: GostConversionReport;
} {
  if (text.trimStart().startsWith('PCBNEW-BOARD')) return parseLegacyKicadBrd(text, name);

  const ast = parseSExpressions(text);
  const root = ast.find((n) => n[0] === 'kicad_pcb');
  if (!root) throw new Error('Некорректный формат печатной платы KiCad (.kicad_pcb)');

  const netNames = new Map<number, string>();
  for (const n of sxFindAll(root, 'net')) {
    const num = parseInt(sxStr(n, 1), 10);
    if (Number.isFinite(num)) netNames.set(num, sxStr(n, 2));
  }

  const components: PcbPlacedComponent[] = [];
  for (const fp of [...sxFindAll(root, 'footprint'), ...sxFindAll(root, 'module')]) {
    const fpName = (sxStr(fp, 1) || 'FOOTPRINT').split(':').pop() || 'FOOTPRINT';
    const at = sxFind(fp, 'at');
    const layer = mapKicadLayer(sxStr(sxFind(fp, 'layer'), 1) || 'F.Cu');
    let refDes = `U${components.length + 1}`, value = '';
    for (const pr of sxFindAll(fp, 'property')) {
      const key = sxStr(pr, 1).toLowerCase();
      if (key === 'reference') refDes = sxStr(pr, 2) || refDes;
      else if (key === 'value') value = sxStr(pr, 2) || value;
    }
    for (const ft of sxFindAll(fp, 'fp_text')) {
      const kind = sxStr(ft, 1);
      if (kind === 'reference') refDes = sxStr(ft, 2) || refDes;
      else if (kind === 'value') value = sxStr(ft, 2) || value;
    }

    const pads: PadDef[] = [];
    const padNets: Record<string, string> = {};
    for (const pd of sxFindAll(fp, 'pad')) {
      const num = sxStr(pd, 1) || `${pads.length + 1}`;
      const kind = sxStr(pd, 2), rawShape = sxStr(pd, 3);
      const pat = sxFind(pd, 'at'), sz = sxFind(pd, 'size'), dr = sxFind(pd, 'drill'), netNode = sxFind(pd, 'net');
      const pw = Math.max(0.15, sxNum(sz, 1, 1.0));
      const hole = dr ? sxNum(dr, 1, 0) : (kind === 'thru_hole' || kind === 'np_thru_hole' ? 0.8 : 0);
      const isTht = kind === 'thru_hole' || kind === 'np_thru_hole' || hole > 0;
      pads.push(makePadDef({
        number: num, isTht,
        shape: rawShape === 'circle' ? 'Round' : rawShape === 'oval' ? 'Oval' : rawShape === 'roundrect' ? 'RoundedRect' : 'Rect',
        x: sxNum(pat, 1, 0), y: sxNum(pat, 2, 0), width: pw, height: Math.max(0.15, sxNum(sz, 2, pw)), holeDiameter: hole, angle: sxNum(pat, 3, 0)
      }));
      if (netNode) {
        const netStr = sxStr(netNode, 2) || netNames.get(parseInt(sxStr(netNode, 1), 10)) || '';
        if (netStr) padNets[num] = netStr;
      }
    }

    const graphics: PatternGraphic[] = [];
    for (const fl of sxFindAll(fp, 'fp_line')) {
      const s = sxFind(fl, 'start'), e = sxFind(fl, 'end');
      const gl = mapKicadLayer(sxStr(sxFind(fl, 'layer'), 1) || 'F.SilkS');
      if (s && e && (gl === 'TopSilk' || gl === 'BottomSilk' || gl === 'TopAssembly')) {
        graphics.push(makePatternGraphicLine(gl === 'BottomSilk' ? 'BottomSilk' : 'TopSilk', sxNum(s, 1), sxNum(s, 2), sxNum(e, 1), sxNum(e, 2)));
      }
    }

    components.push(makePcbPlacedComp({
      refDes, value, typeName: fpName, side: layer === 'BottomCopper' ? 'Bottom' : 'Top',
      x: sxNum(at, 1, 20), y: sxNum(at, 2, 20), angle: sxNum(at, 3, 0), pads, padNets, graphics
    }));
  }

  const traces: PcbTrace[] = [];
  for (const seg of sxFindAll(root, 'segment')) {
    const s = sxFind(seg, 'start'), e = sxFind(seg, 'end');
    if (!s || !e) continue;
    const layer = mapKicadLayer(sxStr(sxFind(seg, 'layer'), 1) || 'F.Cu');
    const cuLayer: PcbTrace['layer'] = layer === 'BottomCopper' || layer === 'Inner1' || layer === 'Inner2' ? layer : 'TopCopper';
    traces.push({ id: uid('ktr'), layer: cuLayer, netName: netNames.get(parseInt(sxStr(sxFind(seg, 'net'), 1), 10)) || '', points: [{ x: sxNum(s, 1), y: sxNum(s, 2) }, { x: sxNum(e, 1), y: sxNum(e, 2) }], width: Math.max(0.1, sxNum(sxFind(seg, 'width'), 1, 0.25)) });
  }
  for (const arc of sxFindAll(root, 'arc')) {
    const s = sxFind(arc, 'start'), m = sxFind(arc, 'mid'), e = sxFind(arc, 'end');
    if (!s || !m || !e) continue;
    const layer = mapKicadLayer(sxStr(sxFind(arc, 'layer'), 1) || 'F.Cu');
    const cuLayer: PcbTrace['layer'] = layer === 'BottomCopper' || layer === 'Inner1' || layer === 'Inner2' ? layer : 'TopCopper';
    traces.push({ id: uid('katr'), layer: cuLayer, netName: netNames.get(parseInt(sxStr(sxFind(arc, 'net'), 1), 10)) || '', points: tessellateArc3Pt({ x: sxNum(s, 1), y: sxNum(s, 2) }, { x: sxNum(m, 1), y: sxNum(m, 2) }, { x: sxNum(e, 1), y: sxNum(e, 2) }), width: Math.max(0.1, sxNum(sxFind(arc, 'width'), 1, 0.25)) });
  }

  const vias: PcbVia[] = [];
  for (const v of sxFindAll(root, 'via')) {
    const at = sxFind(v, 'at');
    if (!at) continue;
    vias.push({ id: uid('kvia'), x: sxNum(at, 1), y: sxNum(at, 2), netName: netNames.get(parseInt(sxStr(sxFind(v, 'net'), 1), 10)) || '', outerDiameter: sxNum(sxFind(v, 'size'), 1, 0.8), holeDiameter: sxNum(sxFind(v, 'drill'), 1, 0.4), startLayer: 'TopCopper', endLayer: 'BottomCopper', viaStyle: 'Through' });
  }

  const edgeSegments: Segment2D[] = [];
  let explicitRectOutline: Point2D[] | null = null;
  const shapes: PcbShape[] = [];
  const edgeArcPolyLines: Point2D[][] = [];

  for (const gl of sxFindAll(root, 'gr_line')) {
    const layer = sxStr(sxFind(gl, 'layer'), 1);
    const s = sxFind(gl, 'start'), e = sxFind(gl, 'end');
    if (!s || !e) continue;
    const x1 = sxNum(s, 1), y1 = sxNum(s, 2), x2 = sxNum(e, 1), y2 = sxNum(e, 2);
    if (layer === 'Edge.Cuts') edgeSegments.push({ x1, y1, x2, y2 });
    else shapes.push(makePcbShapeLine(mapKicadLayer(layer), x1, y1, x2, y2, sxNum(sxFind(gl, 'width'), 1, 0.15)));
  }

  for (const gr of sxFindAll(root, 'gr_rect')) {
    const layer = sxStr(sxFind(gr, 'layer'), 1);
    const s = sxFind(gr, 'start'), e = sxFind(gr, 'end');
    if (!s || !e) continue;
    const x1 = sxNum(s, 1), y1 = sxNum(s, 2), x2 = sxNum(e, 1), y2 = sxNum(e, 2);
    if (layer === 'Edge.Cuts') explicitRectOutline = [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }, { x: x1, y: y1 }];
    else shapes.push(makePcbShapeRect(mapKicadLayer(layer), x1, y1, x2, y2, 0.15));
  }

  for (const ga of sxFindAll(root, 'gr_arc')) {
    const layer = sxStr(sxFind(ga, 'layer'), 1);
    const s = sxFind(ga, 'start'), m = sxFind(ga, 'mid'), e = sxFind(ga, 'end');
    if (!s || !e) continue;
    const arcPts = m ? tessellateArc3Pt({ x: sxNum(s, 1), y: sxNum(s, 2) }, { x: sxNum(m, 1), y: sxNum(m, 2) }, { x: sxNum(e, 1), y: sxNum(e, 2) }) : [{ x: sxNum(s, 1), y: sxNum(s, 2) }, { x: sxNum(e, 1), y: sxNum(e, 2) }];
    if (layer === 'Edge.Cuts') {
      edgeArcPolyLines.push(arcPts);
      for (let i = 0; i + 1 < arcPts.length; i++) edgeSegments.push({ x1: arcPts[i].x, y1: arcPts[i].y, x2: arcPts[i + 1].x, y2: arcPts[i + 1].y });
    } else {
      const mapped = mapKicadLayer(layer);
      for (let i = 0; i + 1 < arcPts.length; i++) shapes.push(makePcbShapeLine(mapped, arcPts[i].x, arcPts[i].y, arcPts[i + 1].x, arcPts[i + 1].y));
    }
  }

  for (const gc of sxFindAll(root, 'gr_circle')) {
    const layer = sxStr(sxFind(gc, 'layer'), 1);
    const c = sxFind(gc, 'center'), e = sxFind(gc, 'end');
    if (!c || !e) continue;
    const cx = sxNum(c, 1), cy = sxNum(c, 2), r = Math.hypot(sxNum(e, 1) - cx, sxNum(e, 2) - cy);
    if (layer === 'Edge.Cuts' && r > 0.5 && !explicitRectOutline) {
      explicitRectOutline = Array.from({ length: 33 }, (_, i) => ({ x: cx + r * Math.cos((i / 32) * Math.PI * 2), y: cy + r * Math.sin((i / 32) * Math.PI * 2) }));
    } else {
      shapes.push(makePcbShapeCircle(mapKicadLayer(layer), cx, cy, r));
    }
  }

  for (const gp of sxFindAll(root, 'gr_poly')) {
    const layer = sxStr(sxFind(gp, 'layer'), 1);
    const ptsNode = sxFind(gp, 'pts');
    if (!ptsNode) continue;
    const pts = sxFindAll(ptsNode, 'xy').map((xy) => ({ x: sxNum(xy, 1), y: sxNum(xy, 2) }));
    if (layer === 'Edge.Cuts' && pts.length >= 3 && !explicitRectOutline) explicitRectOutline = [...pts, { ...pts[0] }];
  }

  const warnings: string[] = [];
  let boardOutline: Point2D[] = [];
  if (explicitRectOutline) {
    boardOutline = explicitRectOutline;
  } else if (edgeSegments.length > 0) {
    const chained = chainSegmentsToOutline(edgeSegments, 0.35);
    const closed = chained.length >= 4 && Math.hypot(chained[0].x - chained[chained.length - 1].x, chained[0].y - chained[chained.length - 1].y) <= 0.5;
    if (!closed) {
      boardOutline = [];
      warnings.push('Контур Edge.Cuts не замкнут или содержит неподдерживаемые кривые и не был импортирован.');
    } else {
      let poly = chained.slice(0, -1);
      // Ensure consistent clockwise winding (signed area > 0 in screen Y-down coordinates)
      let area2 = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        area2 += a.x * b.y - b.x * a.y;
      }
      if (area2 < 0) poly = [...poly].reverse();
      // Rotate to start from top-leftmost vertex (min y, then min x)
      let startIdx = 0;
      for (let i = 1; i < poly.length; i++) {
        if (poly[i].y < poly[startIdx].y - 1e-4 || (Math.abs(poly[i].y - poly[startIdx].y) <= 1e-4 && poly[i].x < poly[startIdx].x)) {
          startIdx = i;
        }
      }
      boardOutline = [...poly.slice(startIdx), ...poly.slice(0, startIdx)];
    }
  } else if (edgeArcPolyLines.length > 0) {
    boardOutline = [];
    warnings.push('Контур Edge.Cuts содержит неподдерживаемые дуги и не может быть восстановлен.');
  } else {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of components) { minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y); }
    boardOutline = Number.isFinite(minX)
      ? [{ x: Math.max(0, minX - 10), y: Math.max(0, minY - 10) }, { x: maxX + 10, y: Math.max(0, minY - 10) }, { x: maxX + 10, y: maxY + 10 }, { x: Math.max(0, minX - 10), y: maxY + 10 }]
      : [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }];
  }

  const copperPours: PcbCopperPour[] = [];
  const rawZones = sxFindAll(root, 'zone');
  for (const zn of rawZones) {
    const layer = mapKicadLayer(sxStr(sxFind(zn, 'layer'), 1) || 'F.Cu');
    const ptsNode = sxFind(sxFind(zn, 'polygon') ?? [], 'pts');
    const pts = ptsNode ? sxFindAll(ptsNode, 'xy').map((xy) => ({ x: sxNum(xy, 1), y: sxNum(xy, 2) })) : [];
    if (pts.length >= 3 && (layer === 'TopCopper' || layer === 'BottomCopper' || layer === 'Inner1' || layer === 'Inner2')) {
      copperPours.push({ id: uid('kpour'), layer, netName: sxStr(sxFind(zn, 'net_name'), 1) || 'GND', outline: pts, dependOnBoardOutline: false, boardClearance: 0.3, clearance: sxNum(sxFind(zn, 'clearance'), 1, 0.25), fillType: 'Solid', lineWidth: 0.25, lineSpacing: 0.5, thermalType: '4Spoke', thermalSpokeWidth: 0.3, thermalGap: 0.25, removeIslands: true, priority: copperPours.length, poured: false });
    }
  }
  if (rawZones.length > 0) {
    warnings.push(`Зоны меди KiCad (${rawZones.length}) требуют перезаливки полигонов после импорта.`);
  }

  const res = convertImportedPcbToGost(makeEcadPcbProject({ name, components, traces, vias, shapes, copperPours, boardOutline }), 'KiCad (.kicad_pcb)');
  if (warnings.length > 0) res.report.warnings = [...(res.report.warnings ?? []), ...warnings];
  return res;
}
