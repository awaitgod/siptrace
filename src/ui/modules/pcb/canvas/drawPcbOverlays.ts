import { DrcError, PcbProject, Point2D } from '../../../../core/types';
import { dist } from '../../../../core/geometry';
import { snapPoint } from '../../../../core/units';
import { RatlineSegment } from '../../../../engines/drc';
import { CopperLayerId, MeasureRulerState, PcbExtraSelection, PcbToolId, PcbViewport } from '../types';
import { LayerLookup } from './drawBoardAndKeepouts';

export interface PcbOverlayState {
  pcb: PcbProject;
  viewport: PcbViewport;
  layers: LayerLookup;
  showRatlines: boolean;
  ratlines: RatlineSegment[];
  highlightedNet: string | null;
  selectedViaId?: string | null;
  selectedExtraObj?: PcbExtraSelection | null;
  tool: PcbToolId;
  activeLayer: CopperLayerId;
  routeDraftPts: Point2D[];
  polyDraftPts: Point2D[];
  cursorMm: Point2D;
  routeElbowFlip: boolean;
  measurePts: MeasureRulerState | null;
  drcErrors: DrcError[];
}

/** Draws vias, shapes, selection highlights, ratlines, interactive routing/polygon drafts, ruler, and DRC markers. */
export function drawPcbOverlays(ctx: CanvasRenderingContext2D, st: PcbOverlayState): void {
  const { pcb, viewport, layers } = st;

  // Vias (hide when all copper layers are hidden)
  const anyCopperVisible =
    layers.isVisible('TopCopper') ||
    layers.isVisible('BottomCopper') ||
    layers.isVisible('Inner1') ||
    layers.isVisible('Inner2');
  if (anyCopperVisible) {
    for (const v of pcb.vias) {
      const isSelVia = st.selectedViaId === v.id;
      const isHi = st.highlightedNet && v.netName === st.highlightedNet;
      ctx.fillStyle = isSelVia ? '#00FFFF' : isHi ? '#FFFF00' : '#CCCCCC';
      ctx.beginPath(); ctx.arc(v.x, v.y, v.outerDiameter / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.arc(v.x, v.y, v.holeDiameter / 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Shapes (line, rect, circle, text, dimension)
  for (const sh of pcb.shapes) {
    if (!layers.isVisible(sh.layer)) continue;
    const isSel = st.selectedExtraObj?.kind === 'shape' && st.selectedExtraObj.id === sh.id;
    const col = isSel ? '#00FFFF' : layers.getColor(sh.layer, '#FFFFFF');
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = Math.max(0.12, sh.width);
    if ((sh.type === 'line' || sh.type === 'dimension') && sh.x2 !== undefined && sh.y2 !== undefined) {
      ctx.beginPath(); ctx.moveTo(sh.x1, sh.y1); ctx.lineTo(sh.x2, sh.y2); ctx.stroke();
    } else if (sh.type === 'rect' && sh.w !== undefined && sh.h !== undefined) {
      ctx.strokeRect(sh.x1, sh.y1, sh.w, sh.h);
    } else if (sh.type === 'circle' && sh.r !== undefined) {
      ctx.beginPath(); ctx.arc(sh.x1, sh.y1, sh.r, 0, Math.PI * 2); ctx.stroke();
    } else if (sh.type === 'text' && sh.text) {
      ctx.font = `${sh.size ?? 1.8}px "Segoe UI", Arial`;
      ctx.fillText(sh.text, sh.x1, sh.y1);
    }
  }

  // Selection highlight for cutouts, keepouts, and copper pours
  if (st.selectedExtraObj && st.selectedExtraObj.kind !== 'shape') {
    let poly: Point2D[] | undefined;
    if (st.selectedExtraObj.kind === 'cutout') {
      poly = pcb.cutouts.find((c) => c.id === st.selectedExtraObj!.id)?.points;
    } else if (st.selectedExtraObj.kind === 'keepout') {
      poly = pcb.keepouts.find((k) => k.id === st.selectedExtraObj!.id)?.points;
    } else if (st.selectedExtraObj.kind === 'pour') {
      poly = pcb.copperPours.find((p) => p.id === st.selectedExtraObj!.id)?.outline;
    }
    if (poly && poly.length >= 3) {
      ctx.save();
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = Math.max(2 / viewport.pxPerMm, 0.3);
      ctx.setLineDash([1.2, 0.8]);
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }

  // Unrouted Ratlines
  if (st.showRatlines) {
    ctx.lineWidth = Math.max(0.8 / viewport.pxPerMm, 0.08);
    for (const rl of st.ratlines) {
      ctx.strokeStyle = st.highlightedNet && rl.netName === st.highlightedNet ? '#FFFF00' : '#44CCFF';
      ctx.beginPath();
      ctx.moveTo(rl.from.x, rl.from.y);
      ctx.lineTo(rl.to.x, rl.to.y);
      ctx.stroke();
    }
  }

  // Active 45-degree manual route preview
  if (st.tool === 'routeManual' && st.routeDraftPts.length > 0) {
    const last = st.routeDraftPts[st.routeDraftPts.length - 1];
    const cur = snapPoint(st.cursorMm, pcb.gridSize);
    const dx = cur.x - last.x;
    const dy = cur.y - last.y;
    const minD = Math.min(Math.abs(dx), Math.abs(dy));
    const midPt: Point2D = st.routeElbowFlip
      ? { x: last.x + Math.sign(dx) * minD, y: last.y + Math.sign(dy) * minD }
      : { x: cur.x - Math.sign(dx) * minD, y: cur.y - Math.sign(dy) * minD };

    ctx.strokeStyle = layers.getColor(st.activeLayer, '#FF3030');
    ctx.lineWidth = pcb.designRules.defaultTraceWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(st.routeDraftPts[0].x, st.routeDraftPts[0].y);
    for (let i = 1; i < st.routeDraftPts.length; i++) ctx.lineTo(st.routeDraftPts[i].x, st.routeDraftPts[i].y);
    ctx.lineTo(midPt.x, midPt.y);
    ctx.lineTo(cur.x, cur.y);
    ctx.stroke();
  }

  // Polygon draft preview
  if (st.polyDraftPts.length > 0) {
    ctx.strokeStyle = '#FFFF44';
    ctx.lineWidth = 0.25;
    ctx.beginPath();
    ctx.moveTo(st.polyDraftPts[0].x, st.polyDraftPts[0].y);
    for (let i = 1; i < st.polyDraftPts.length; i++) ctx.lineTo(st.polyDraftPts[i].x, st.polyDraftPts[i].y);
    ctx.lineTo(st.cursorMm.x, st.cursorMm.y);
    ctx.stroke();
  }

  // Measure ruler (length, ΔX, ΔY, angle in project units)
  if (st.measurePts) {
    ctx.strokeStyle = '#00FF99';
    ctx.lineWidth = 1.4 / viewport.pxPerMm;
    ctx.beginPath();
    ctx.moveTo(st.measurePts.start.x, st.measurePts.start.y);
    ctx.lineTo(st.measurePts.end.x, st.measurePts.end.y);
    ctx.stroke();
    const dMm = dist(st.measurePts.start, st.measurePts.end);
    const dxMm = Math.abs(st.measurePts.end.x - st.measurePts.start.x);
    const dyMm = Math.abs(st.measurePts.end.y - st.measurePts.start.y);
    const angDeg = ((Math.atan2(st.measurePts.end.y - st.measurePts.start.y, st.measurePts.end.x - st.measurePts.start.x) * 180) / Math.PI);
    const isIn = pcb.units === 'in';
    const scale = isIn ? 1 / 25.4 : 1;
    const uLabel = isIn ? 'in' : 'мм';
    const dec = isIn ? 3 : 2;
    const txt = `L=${(dMm * scale).toFixed(dec)} ${uLabel} (ΔX=${(dxMm * scale).toFixed(dec)}, ΔY=${(dyMm * scale).toFixed(dec)}, ${angDeg.toFixed(1)}°)`;
    ctx.fillStyle = '#00FF99';
    ctx.font = `${12 / viewport.pxPerMm}px "Segoe UI", Arial`;
    ctx.fillText(
      txt,
      (st.measurePts.start.x + st.measurePts.end.x) / 2,
      (st.measurePts.start.y + st.measurePts.end.y) / 2 - 1
    );
  }

  // DRC error markers
  for (const err of st.drcErrors) {
    ctx.strokeStyle = err.severity === 'Error' ? '#FF2222' : '#FFAA00';
    ctx.fillStyle = err.severity === 'Error' ? 'rgba(255,30,30,0.35)' : 'rgba(255,170,0,0.35)';
    ctx.lineWidth = Math.max(1.5 / viewport.pxPerMm, 0.22);
    ctx.beginPath();
    ctx.arc(err.x, err.y, 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
