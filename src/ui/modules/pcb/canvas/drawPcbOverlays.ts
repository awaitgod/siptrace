import { DrcError, PcbProject, Point2D } from '../../../../core/types';
import { dist } from '../../../../core/geometry';
import { snapPoint } from '../../../../core/units';
import { RatlineSegment } from '../../../../engines/drc';
import { CopperLayerId, MeasureRulerState, PcbToolId, PcbViewport } from '../types';
import { LayerLookup } from './drawBoardAndKeepouts';

export interface PcbOverlayState {
  pcb: PcbProject;
  viewport: PcbViewport;
  layers: LayerLookup;
  showRatlines: boolean;
  ratlines: RatlineSegment[];
  highlightedNet: string | null;
  tool: PcbToolId;
  activeLayer: CopperLayerId;
  routeDraftPts: Point2D[];
  polyDraftPts: Point2D[];
  cursorMm: Point2D;
  routeElbowFlip: boolean;
  measurePts: MeasureRulerState | null;
  drcErrors: DrcError[];
}

/** Draws vias, shapes, ratlines, interactive routing/polygon drafts, ruler, and DRC markers. */
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
      const isHi = st.highlightedNet && v.netName === st.highlightedNet;
      ctx.fillStyle = isHi ? '#FFFF00' : '#CCCCCC';
      ctx.beginPath(); ctx.arc(v.x, v.y, v.outerDiameter / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.arc(v.x, v.y, v.holeDiameter / 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Shapes
  for (const sh of pcb.shapes) {
    if (!layers.isVisible(sh.layer)) continue;
    ctx.strokeStyle = layers.getColor(sh.layer, '#FFFFFF');
    ctx.fillStyle = layers.getColor(sh.layer, '#FFFFFF');
    ctx.lineWidth = sh.width;
    if (sh.type === 'line' && sh.x2 !== undefined && sh.y2 !== undefined) {
      ctx.beginPath(); ctx.moveTo(sh.x1, sh.y1); ctx.lineTo(sh.x2, sh.y2); ctx.stroke();
    } else if (sh.type === 'text' && sh.text) {
      ctx.font = `${sh.size ?? 1.8}px "Segoe UI", Arial`;
      ctx.fillText(sh.text, sh.x1, sh.y1);
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

  // Measure ruler
  if (st.measurePts) {
    ctx.strokeStyle = '#00FF99';
    ctx.lineWidth = 1.4 / viewport.pxPerMm;
    ctx.beginPath();
    ctx.moveTo(st.measurePts.start.x, st.measurePts.start.y);
    ctx.lineTo(st.measurePts.end.x, st.measurePts.end.y);
    ctx.stroke();
    const d = dist(st.measurePts.start, st.measurePts.end);
    ctx.fillStyle = '#00FF99';
    ctx.font = `${12 / viewport.pxPerMm}px "Segoe UI", Arial`;
    ctx.fillText(
      `Д=${d.toFixed(2)} мм`,
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
