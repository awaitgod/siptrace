import { PatternDef, PcbCopperPour, PcbPlacedComponent, PcbProject, PcbTrace, PcbVia, Point2D } from '../../../../core/types';
import { dist, polygonBounds, uid } from '../../../../core/geometry';
import { WorldPad } from '../../../../engines/drc';

/** Creates a grid of GND stitching vias avoiding component pads inside board bounds. */
export function buildViaStitchingVias(pcb: PcbProject, worldPads: WorldPad[]): PcbVia[] {
  const b = polygonBounds(
    pcb.boardOutline.length >= 3 ? pcb.boardOutline : [{ x: 0, y: 0 }, { x: 80, y: 60 }]
  );
  const vias: PcbVia[] = [];
  for (let x = b.minX + 6; x <= b.maxX - 6; x += 12) {
    for (let y = b.minY + 6; y <= b.maxY - 6; y += 12) {
      const nearPad = worldPads.some((wp) => dist({ x, y }, wp) < 2.6);
      if (!nearPad) {
        vias.push({
          id: uid('vstitch'),
          x: Number(x.toFixed(2)),
          y: Number(y.toFixed(2)),
          netName: 'GND',
          outerDiameter: pcb.designRules.minViaOuter + 0.1,
          holeDiameter: pcb.designRules.minViaHole,
          startLayer: 'TopCopper',
          endLayer: 'BottomCopper',
          viaStyle: 'Through'
        });
      }
    }
  }
  return vias;
}

/** Builds a configurable panelization grid (cols x rows) duplicating components, traces, vias, pours, cutouts, keepouts, and shapes. */
export function applyConfigurablePanelization(
  pcb: PcbProject,
  cols: number,
  rows: number,
  spacingMm = 4
): PcbProject {
  const b = polygonBounds(pcb.boardOutline);
  const w = Math.max(10, b.maxX - b.minX);
  const h = Math.max(10, b.maxY - b.minY);
  const stepX = w + spacingMm;
  const stepY = h + spacingMm;
  const extraComps: PcbPlacedComponent[] = [];
  const extraTraces: PcbTrace[] = [];
  const extraVias: PcbVia[] = [];
  const extraPours: PcbCopperPour[] = [];
  const extraCutouts: typeof pcb.cutouts = [];
  const extraKeepouts: typeof pcb.keepouts = [];
  const extraShapes: typeof pcb.shapes = [];

  for (let ix = 0; ix < Math.max(1, cols); ix++) {
    for (let iy = 0; iy < Math.max(1, rows); iy++) {
      if (ix === 0 && iy === 0) continue;
      const dx = ix * stepX;
      const dy = iy * stepY;
      const netPrefix = `P${ix + 1}_${iy + 1}_`;
      const refSuffix = `_P${ix + 1}_${iy + 1}`;
      const scopeNet = (net: string) => (net ? `${netPrefix}${net}` : '');

      for (const c of pcb.components) {
        const cloned = structuredClone(c);
        const scopedPadNets: Record<string, string> = {};
        for (const [k, v] of Object.entries(cloned.padNets)) {
          scopedPadNets[k] = scopeNet(v);
        }
        extraComps.push({
          ...cloned,
          id: uid('panC'),
          refDes: `${c.refDes}${refSuffix}`,
          x: c.x + dx,
          y: c.y + dy,
          padNets: scopedPadNets
        });
      }
      for (const t of pcb.traces) {
        extraTraces.push({
          ...structuredClone(t),
          id: uid('panT'),
          netName: scopeNet(t.netName),
          points: t.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
        });
      }
      for (const v of pcb.vias) {
        extraVias.push({
          ...structuredClone(v),
          id: uid('panV'),
          netName: scopeNet(v.netName),
          x: v.x + dx,
          y: v.y + dy
        });
      }
      for (const pour of pcb.copperPours) {
        const shiftedOutline = (pour.dependOnBoardOutline ? pcb.boardOutline : pour.outline).map((pt) => ({
          x: pt.x + dx,
          y: pt.y + dy
        }));
        extraPours.push({
          ...structuredClone(pour),
          id: uid('panP'),
          dependOnBoardOutline: false,
          netName: scopeNet(pour.netName),
          outline: shiftedOutline,
          computedIslands: pour.computedIslands?.map((isl) => ({
            outer: isl.outer.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })),
            holes: isl.holes.map((hole) => hole.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })))
          }))
        });
      }
      for (const cut of pcb.cutouts) {
        extraCutouts.push({
          ...structuredClone(cut),
          id: uid('panCut'),
          points: cut.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
        });
      }
      for (const ko of pcb.keepouts) {
        extraKeepouts.push({
          ...structuredClone(ko),
          id: uid('panKo'),
          points: ko.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
        });
      }
      for (const sh of pcb.shapes) {
        extraShapes.push({
          ...structuredClone(sh),
          id: uid('panS'),
          x1: sh.x1 + dx,
          y1: sh.y1 + dy,
          ...(sh.x2 !== undefined ? { x2: sh.x2 + dx } : {}),
          ...(sh.y2 !== undefined ? { y2: sh.y2 + dy } : {})
        });
      }
    }
  }

  const totalW = w * cols + spacingMm * Math.max(0, cols - 1);
  const totalH = h * rows + spacingMm * Math.max(0, rows - 1);
  // Add V-score / routing break-lines on BoardOutline layer between tiles
  for (let ix = 1; ix < Math.max(1, cols); ix++) {
    const xLine = b.minX + ix * stepX - spacingMm * 0.5;
    extraShapes.push({
      id: uid('vscoreX'),
      layer: 'BoardOutline',
      type: 'line',
      x1: xLine,
      y1: b.minY,
      x2: xLine,
      y2: b.minY + totalH,
      width: 0.2
    });
  }
  for (let iy = 1; iy < Math.max(1, rows); iy++) {
    const yLine = b.minY + iy * stepY - spacingMm * 0.5;
    extraShapes.push({
      id: uid('vscoreY'),
      layer: 'BoardOutline',
      type: 'line',
      x1: b.minX,
      y1: yLine,
      x2: b.minX + totalW,
      y2: yLine,
      width: 0.2
    });
  }

  return {
    ...pcb,
    boardOutline: [
      { x: b.minX, y: b.minY },
      { x: b.minX + totalW, y: b.minY },
      { x: b.minX + totalW, y: b.minY + totalH },
      { x: b.minX, y: b.minY + totalH }
    ],
    components: [...pcb.components, ...extraComps],
    traces: [...pcb.traces, ...extraTraces],
    vias: [...pcb.vias, ...extraVias],
    copperPours: [...pcb.copperPours, ...extraPours],
    cutouts: [...pcb.cutouts, ...extraCutouts],
    keepouts: [...pcb.keepouts, ...extraKeepouts],
    shapes: [...pcb.shapes, ...extraShapes]
  };
}

export function applyPanelization2x2(pcb: PcbProject): PcbProject {
  return applyConfigurablePanelization(pcb, 2, 2, 4);
}

/** Generates rectangular, rounded-corner, or circular PCB outline polygon in mm. */
export function buildBoardOutlinePolygon(
  widthMm: number,
  heightMm: number,
  cornerRadiusMm = 0,
  isCircle = false,
  origin: Point2D = { x: 10, y: 10 }
): Point2D[] {
  const ox = origin.x;
  const oy = origin.y;
  if (isCircle) {
    const rx = widthMm / 2;
    const ry = heightMm / 2;
    const pts: Point2D[] = [];
    const segs = 64;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push({
        x: Math.round((ox + rx + Math.cos(a) * rx) * 100) / 100,
        y: Math.round((oy + ry + Math.sin(a) * ry) * 100) / 100
      });
    }
    return pts;
  }
  const r = Math.max(0, Math.min(cornerRadiusMm, widthMm / 2, heightMm / 2));
  if (r <= 0.1) {
    return [
      { x: ox, y: oy },
      { x: ox + widthMm, y: oy },
      { x: ox + widthMm, y: oy + heightMm },
      { x: ox, y: oy + heightMm }
    ];
  }
  const pts: Point2D[] = [];
  const corners = [
    { cx: ox + widthMm - r, cy: oy + r, start: -Math.PI / 2, end: 0 },
    { cx: ox + widthMm - r, cy: oy + heightMm - r, start: 0, end: Math.PI / 2 },
    { cx: ox + r, cy: oy + heightMm - r, start: Math.PI / 2, end: Math.PI },
    { cx: ox + r, cy: oy + r, start: Math.PI, end: 1.5 * Math.PI }
  ];
  for (const c of corners) {
    for (let s = 0; s <= 4; s++) {
      const a = c.start + ((c.end - c.start) * s) / 4;
      pts.push({ x: Math.round((c.cx + Math.cos(a) * r) * 100) / 100, y: Math.round((c.cy + Math.sin(a) * r) * 100) / 100 });
    }
  }
  return pts;
}

function inferRefDesPrefixFromPattern(pattern: PatternDef): string {
  const s = `${pattern.id} ${pattern.name}`.toUpperCase();
  if (/RES|МЛТ|ЧИП|CHIP|R0|R1/.test(s) && !/CAP|КОНД|К50|К10|LED|DIOD/.test(s)) return 'R';
  if (/CAP|К50|К10|К53|КОНД|ELCAP/.test(s)) return 'C';
  if (/IND|ДРОСС|КАТУШ/.test(s)) return 'L';
  if (/LED|АЛ307|DIOD|КД|SOT23_D/.test(s)) return 'VD';
  if (/TO92|TO220|TO126|SOT23|КТ-26|КТ-27|КТ-28/.test(s)) return 'VT';
  if (/DB9|USB|PLS|PLD|HDR|CON|JACK|КЛЕММ|ТБ/.test(s)) return 'XP';
  if (/TACT|КН|BTN|ENC|ПЕРЕКЛ/.test(s)) return 'SB';
  if (/RES49|РЭС|RELAY/.test(s)) return 'K';
  if (/DIP|SOIC|LQFP|QFP|QFN|TSSOP|BGA|401/.test(s)) return 'DD';
  return 'U';
}

/** Instantiates a placed PCB component from a library pattern definition. */
export function buildPlacedPcbComponent(
  pattern: PatternDef,
  pos: Point2D,
  nextIndex: number,
  existingComponents: PcbPlacedComponent[] = []
): PcbPlacedComponent {
  const prefix = inferRefDesPrefixFromPattern(pattern);
  const usedNums = new Set<number>();
  for (const c of existingComponents) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(c.refDes);
    if (m) usedNums.add(parseInt(m[1], 10));
  }
  let num = existingComponents.length === 0 ? nextIndex : 1;
  while (usedNums.has(num)) num++;
  return {
    id: uid('pcbcomp'),
    refDes: `${prefix}${num}`,
    value: pattern.name,
    typeName: pattern.name,
    patternId: pattern.id,
    side: 'Top',
    x: pos.x,
    y: pos.y,
    angle: 0,
    showRefDes: true,
    showValue: false,
    refDesOffset: { x: 0, y: -(pattern.courtyard.height / 2 + 1.5) },
    pads: structuredClone(pattern.pads),
    padNets: {},
    graphics: structuredClone(pattern.graphics),
    courtyard: { ...pattern.courtyard },
    model3d: { ...pattern.model3d }
  };
}

/** Creates a PcbCopperPour definition either tied to board outline or from a custom polygon. */
export type PcbCopperPourSettings = Pick<PcbCopperPour,
  'layer' | 'netName' | 'fillType' | 'clearance' | 'thermalType' | 'thermalGap' | 'thermalSpokeWidth' | 'removeIslands'
>;

export function buildPcbCopperPour(opts: {
  pcb: PcbProject;
  outline: Point2D[];
  dependOnBoardOutline: boolean;
  settings: PcbCopperPourSettings;
}): PcbCopperPour {
  return {
    id: uid('pour'),
    ...opts.settings,
    outline: opts.outline,
    dependOnBoardOutline: opts.dependOnBoardOutline,
    boardClearance: opts.pcb.designRules.clearanceCopperToBoard,
    lineWidth: 0.25,
    lineSpacing: 0.5,
    priority: 1,
    poured: true
  };
}

/** Creates a through via centered at the given coordinate. */
export function buildDefaultPcbVia(pcb: PcbProject, pos: Point2D, netName: string): PcbVia {
  return {
    id: uid('via'),
    x: pos.x,
    y: pos.y,
    netName,
    outerDiameter: pcb.designRules.minViaOuter + 0.1,
    holeDiameter: pcb.designRules.minViaHole,
    startLayer: 'TopCopper',
    endLayer: 'BottomCopper',
    viaStyle: 'Through'
  };
}
