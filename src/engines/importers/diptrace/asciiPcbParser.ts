import {
  PadDef,
  PadShape,
  PcbBoardCutout,
  PcbCopperPour,
  PcbKeepoutZone,
  PcbLayerId,
  PcbPlacedComponent,
  PcbProject,
  PcbShape,
  PcbTrace,
  PcbVia,
  Point2D,
  ThermalReliefType
} from '../../../core/types';
import { uid } from '../../../core/geometry';
import { createGostDesignRules } from '../../../gost/gostRules';
import { convertImportedPcbToGost, GostConversionReport } from '../gostConverter';
import { createImportedPcbProject, createPlaceholderChipComponent } from '../projectShells';
import { SExprList, parseSExpressions, sxFind, sxFindAll, sxNum, sxStr, sxWalk } from '../sexprParser';

function dipTraceCoordToMm(val: number, scaleFactor: number): number {
  return Math.round(val * scaleFactor * 1000) / 1000;
}

function detectDipTraceScaleFactor(coords: number[]): number {
  const maxAbs = coords.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  if (maxAbs > 1500) return 0.1;
  if (maxAbs > 450) return 1 / 3;
  return 1.0;
}

/** Parses DipTrace ASCII PCB (.dip / .asc) including components, pads, traces, vias, pours, cutouts, shapes, and outline. */
export function parseDipTraceAsciiPcbFull(ascii: string): PcbProject {
  return parseDipTraceAsciiPcbWithReport(ascii).pcb;
}

/** Parses DipTrace ASCII PCB (.dip / .asc) and returns both PCB project and GOST conversion report. */
export function parseDipTraceAsciiPcbWithReport(ascii: string): {
  pcb: PcbProject;
  report: GostConversionReport;
} {
  const roots = parseSExpressions(ascii);
  const allLists: SExprList[] = [];
  for (const r of roots) sxWalk(r, (node) => allLists.push(node));

  const isNativeExport = ascii.includes('GOSTTrace-Export');
  const topLevelNodes = roots.flatMap((r) => (Array.isArray(r) ? [r, ...r.filter((x): x is SExprList => Array.isArray(x))] : []));
  const projectName =
    sxStr(topLevelNodes.find((l) => l[0] === 'Name' || l[0] === 'Title' || l[0] === 'Board'), 1) || 'Импорт_DipTrace_Плата';

  const sampleCoords: number[] = [];
  if (!isNativeExport) {
    for (const l of allLists) {
      if (l[0] === 'Origin' || l[0] === 'Pt' || l[0] === 'Via') {
        const a = parseFloat(sxStr(l, 1));
        const b = parseFloat(sxStr(l, 2));
        if (Number.isFinite(a)) sampleCoords.push(a);
        if (Number.isFinite(b)) sampleCoords.push(b);
      } else if (l[0] === 'Component' || l[0] === 'Pad') {
        const a = parseFloat(sxStr(l, 2, sxStr(l, 1)));
        const b = parseFloat(sxStr(l, 3, sxStr(l, 2)));
        if (Number.isFinite(a)) sampleCoords.push(a);
        if (Number.isFinite(b)) sampleCoords.push(b);
      }
    }
  }
  const scale = isNativeExport ? 1.0 : detectDipTraceScaleFactor(sampleCoords);

  const components: PcbPlacedComponent[] = [];
  const compNodes = allLists.filter((l) => l[0] === 'Component' && (sxFind(l, 'RefDes') || sxFind(l, 'Pattern') || typeof l[1] === 'string'));
  compNodes.forEach((cn, idx) => {
    const refDes = sxStr(sxFind(cn, 'RefDes'), 1) || (typeof cn[1] === 'string' ? cn[1] : `U${idx + 1}`);
    const value = sxStr(sxFind(cn, 'Value'), 1) || sxStr(sxFind(cn, 'Name'), 1) || '';
    const patternName = sxStr(sxFind(cn, 'Pattern'), 1) || '';
    const orig = sxFind(cn, 'Origin') ?? sxFind(cn, 'Pt');
    const x = orig ? dipTraceCoordToMm(sxNum(orig, 1, 15 + idx * 12), scale) : dipTraceCoordToMm(sxNum(cn, 2, 15 + (idx % 6) * 14), scale);
    const y = orig ? dipTraceCoordToMm(sxNum(orig, 2, 15), scale) : dipTraceCoordToMm(sxNum(cn, 3, 15 + Math.floor(idx / 6) * 14), scale);
    const angle = ((Math.round(sxNum(sxFind(cn, 'Angle'), 1, 0)) % 360) + 360) % 360;
    const sideStr = sxStr(sxFind(cn, 'Side'), 1).toLowerCase();
    const side: 'Top' | 'Bottom' = sideStr.includes('bot') ? 'Bottom' : 'Top';

    const padNodes = sxFindAll(cn, 'Pad');
    const padNets: Record<string, string> = {};
    const pads: PadDef[] = padNodes.map((pn, pIdx) => {
      const num = sxStr(pn, 1) || String(pIdx + 1);
      const px = dipTraceCoordToMm(sxNum(sxFind(pn, 'Origin') ?? pn, 1, (pIdx - 0.5) * 2), scale);
      const py = dipTraceCoordToMm(sxNum(sxFind(pn, 'Origin') ?? pn, 2, 0), scale);
      const hole = dipTraceCoordToMm(sxNum(sxFind(pn, 'Hole'), 1, 0), scale);
      const w = Math.max(0.25, dipTraceCoordToMm(sxNum(sxFind(pn, 'Width'), 1, hole > 0 ? 1.7 : 1.0), scale));
      const h = Math.max(0.25, dipTraceCoordToMm(sxNum(sxFind(pn, 'Height'), 1, hole > 0 ? 1.7 : 1.2), scale));
      const typeRaw = sxStr(sxFind(pn, 'Type'), 1);
      const shapeRaw = sxStr(sxFind(pn, 'Shape'), 1) as PadShape;
      const layerRaw = sxStr(sxFind(pn, 'Layer'), 1) as PadDef['layer'];
      const pAngle = sxNum(sxFind(pn, 'Angle'), 1, 0);
      const netName = sxStr(sxFind(pn, 'Net'), 1);
      if (netName) padNets[num] = netName;

      const padType = typeRaw === 'MountingHole' ? 'MountingHole' : (typeRaw === 'THT' || hole > 0) ? 'THT' : 'SMD';
      const padShape: PadShape = (['Rect', 'Round', 'Oval', 'RoundedRect', 'Polygon'].includes(shapeRaw))
        ? shapeRaw
        : (pIdx === 0 ? 'Rect' : 'Round');
      return {
        id: uid('dpad'),
        number: num,
        type: padType,
        shape: padShape,
        x: Number.isFinite(px) ? px : (pIdx - 0.5) * 2.54,
        y: Number.isFinite(py) ? py : 0,
        width: w,
        height: h,
        holeDiameter: hole > 0 ? hole : undefined,
        angle: pAngle || undefined,
        layer: layerRaw || (padType !== 'SMD' ? 'All' : side)
      };
    });

    const baseComp = createPlaceholderChipComponent({
      idPrefix: 'dtpcb',
      refDes,
      value,
      typeName: value || patternName || refDes,
      x: Number.isFinite(x) ? x : 20,
      y: Number.isFinite(y) ? y : 20,
      emptyPads: true
    });
    baseComp.patternId = patternName || 'PAT_CHIP_2012M';
    baseComp.side = side;
    baseComp.angle = angle;
    baseComp.padNets = padNets;
    if (pads.length > 0) baseComp.pads = pads;
    components.push(baseComp);
  });

  const traces: PcbTrace[] = [];
  for (const tr of allLists.filter((l) => l[0] === 'Trace')) {
    const pts: Point2D[] = sxFindAll(tr, 'Pt').concat(sxFindAll(tr, 'Point')).map((pt) => ({
      x: dipTraceCoordToMm(sxNum(pt, 1), scale),
      y: dipTraceCoordToMm(sxNum(pt, 2), scale)
    }));
    if (pts.length >= 2) {
      const layerRaw = sxStr(sxFind(tr, 'Layer'), 1);
      const layer: PcbTrace['layer'] =
        layerRaw === 'BottomCopper' || layerRaw.toLowerCase().includes('bot')
          ? 'BottomCopper'
          : layerRaw === 'Inner1'
            ? 'Inner1'
            : layerRaw === 'Inner2'
              ? 'Inner2'
              : 'TopCopper';
      traces.push({
        id: uid('dtr'),
        layer,
        netName: sxStr(sxFind(tr, 'Net'), 1) || '',
        points: pts,
        width: Math.max(0.15, dipTraceCoordToMm(sxNum(sxFind(tr, 'Width'), 1, 0.25), scale))
      });
    }
  }

  const vias: PcbVia[] = allLists.filter((l) => l[0] === 'Via').map((vn) => ({
    id: uid('dvia'),
    x: dipTraceCoordToMm(sxNum(vn, 1, 20), scale),
    y: dipTraceCoordToMm(sxNum(vn, 2, 20), scale),
    netName: sxStr(sxFind(vn, 'Net'), 1) || '',
    outerDiameter: Math.max(0.5, dipTraceCoordToMm(sxNum(sxFind(vn, 'Outer'), 1, 0.7), scale)),
    holeDiameter: Math.max(0.3, dipTraceCoordToMm(sxNum(sxFind(vn, 'Hole'), 1, 0.35), scale)),
    startLayer: 'TopCopper',
    endLayer: 'BottomCopper',
    viaStyle: 'Through'
  }));

  const outlineNode = allLists.find((l) => l[0] === 'BoardOutline' || l[0] === 'Outline');
  const boardOutline: Point2D[] = outlineNode
    ? sxFindAll(outlineNode, 'Pt').concat(sxFindAll(outlineNode, 'Point')).map((pt) => ({
        x: dipTraceCoordToMm(sxNum(pt, 1), scale),
        y: dipTraceCoordToMm(sxNum(pt, 2), scale)
      }))
    : [];

  const cutouts: PcbBoardCutout[] = allLists.filter((l) => l[0] === 'Cutout').map((cn) => ({
    id: uid('dcut'),
    points: sxFindAll(cn, 'Pt').map((pt) => ({ x: dipTraceCoordToMm(sxNum(pt, 1), scale), y: dipTraceCoordToMm(sxNum(pt, 2), scale) }))
  })).filter((c) => c.points.length >= 3);

  const keepouts: PcbKeepoutZone[] = allLists.filter((l) => l[0] === 'Keepout').map((kn) => ({
    id: uid('dko'),
    layer: (sxStr(sxFind(kn, 'Layer'), 1) || 'AllCopper') as PcbKeepoutZone['layer'],
    kind: (sxStr(sxFind(kn, 'Kind'), 1) || 'RouteKeepout') as PcbKeepoutZone['kind'],
    points: sxFindAll(kn, 'Pt').map((pt) => ({ x: dipTraceCoordToMm(sxNum(pt, 1), scale), y: dipTraceCoordToMm(sxNum(pt, 2), scale) }))
  })).filter((k) => k.points.length >= 3);

  const copperPours = allLists.filter((l) => l[0] === 'CopperPour').map<PcbCopperPour>((pn, idx) => ({
    id: uid('dpour'),
    layer: (sxStr(sxFind(pn, 'Layer'), 1) || 'TopCopper') as PcbCopperPour['layer'],
    netName: sxStr(sxFind(pn, 'Net'), 1) || 'GND',
    outline: sxFindAll(pn, 'Pt').map((pt) => ({ x: dipTraceCoordToMm(sxNum(pt, 1), scale), y: dipTraceCoordToMm(sxNum(pt, 2), scale) })),
    dependOnBoardOutline: sxNum(sxFind(pn, 'FollowOutline'), 1, 0) === 1,
    boardClearance: sxNum(sxFind(pn, 'BoardClearance'), 1, 0.4),
    clearance: sxNum(sxFind(pn, 'Clearance'), 1, 0.25),
    fillType: (sxStr(sxFind(pn, 'FillType'), 1) || 'Solid') as 'Solid' | 'Hatch',
    lineWidth: 0.25,
    lineSpacing: 0.5,
    thermalType: '4Spoke' as ThermalReliefType,
    thermalSpokeWidth: 0.3,
    thermalGap: 0.25,
    removeIslands: true,
    priority: idx,
    poured: true
  })).filter((p) => p.outline.length >= 3);

  const shapes: PcbShape[] = [];
  for (const sh of allLists.filter((l) => l[0] === 'PcbShape')) {
    const layer = (sxStr(sxFind(sh, 'Layer'), 1) || 'TopSilk') as PcbLayerId;
    const type = sxStr(sxFind(sh, 'Type'), 1) as PcbShape['type'];
    const pts = sxFindAll(sh, 'Pt').map((pt) => ({ x: dipTraceCoordToMm(sxNum(pt, 1), scale), y: dipTraceCoordToMm(sxNum(pt, 2), scale) }));
    if (type === 'line' && pts.length >= 2) {
      shapes.push({ id: uid('dsh'), layer, type: 'line', x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y, width: sxNum(sxFind(sh, 'Width'), 1, 0.15) });
    } else if (type === 'text' && pts.length >= 1) {
      shapes.push({ id: uid('dsh'), layer, type: 'text', x1: pts[0].x, y1: pts[0].y, width: 0.15, text: sxStr(sxFind(sh, 'Text'), 1), size: sxNum(sxFind(sh, 'Size'), 1, 1.5) });
    }
  }

  const pcb = createImportedPcbProject({
    filePath: `${projectName}.gostpcb`,
    projectName,
    components
  });
  const layerCnt = sxNum(allLists.find((l) => l[0] === 'LayerCount'), 1, 2);
  pcb.layerCount = layerCnt === 4 ? 4 : 2;
  pcb.traces = traces;
  pcb.vias = vias;
  pcb.cutouts = cutouts;
  pcb.keepouts = keepouts;
  pcb.copperPours = copperPours;
  pcb.shapes = shapes;
  if (boardOutline.length >= 3) pcb.boardOutline = boardOutline;
  pcb.designRules = createGostDesignRules(4);

  const converted = convertImportedPcbToGost(pcb, 'DipTrace ASCII PCB (.dip/.asc)', { preserveEmptyPads: true });
  converted.pcb.components.forEach((c, idx) => {
    if (components[idx] && components[idx].pads.length > 0) {
      c.patternId = components[idx].patternId;
    }
  });
  return converted;
}
