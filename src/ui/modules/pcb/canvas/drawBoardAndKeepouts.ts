import { PcbLayerId, PcbProject } from '../../../../core/types';
import { COPPER_LAYER_DRAW_ORDER } from '../constants';
import { PcbViewport } from '../types';

export interface LayerLookup {
  isVisible: (id: PcbLayerId) => boolean;
  getColor: (id: PcbLayerId, fallback: string) => string;
}

/** Draws dotted coordinate grid when zoom threshold permits. */
export function drawPcbGrid(
  ctx: CanvasRenderingContext2D,
  pcb: PcbProject,
  viewport: PcbViewport,
  width: number,
  height: number,
  showGrid: boolean
): void {
  if (!showGrid || pcb.gridSize * viewport.pxPerMm < 3.5) return;
  ctx.fillStyle = '#333333';
  const step = pcb.gridSize;
  const sx = Math.floor(-viewport.ox / viewport.pxPerMm / step) * step;
  const ex = (width - viewport.ox) / viewport.pxPerMm;
  const sy = Math.floor(-viewport.oy / viewport.pxPerMm / step) * step;
  const ey = (height - viewport.oy) / viewport.pxPerMm;
  const ds = 1.0 / viewport.pxPerMm;
  for (let gx = sx; gx <= ex; gx += step) {
    for (let gy = sy; gy <= ey; gy += step) {
      ctx.fillRect(gx - ds * 0.5, gy - ds * 0.5, ds, ds);
    }
  }
}

/** Draws board outline, internal cutouts, and keepout zones. */
export function drawBoardAndKeepouts(
  ctx: CanvasRenderingContext2D,
  pcb: PcbProject,
  viewport: PcbViewport,
  layers: LayerLookup
): void {
  if (layers.isVisible('BoardOutline') && pcb.boardOutline.length >= 2) {
    ctx.strokeStyle = layers.getColor('BoardOutline', '#CC44FF');
    ctx.lineWidth = Math.max(1.6 / viewport.pxPerMm, 0.25);
    ctx.beginPath();
    ctx.moveTo(pcb.boardOutline[0].x, pcb.boardOutline[0].y);
    for (let i = 1; i < pcb.boardOutline.length; i++) ctx.lineTo(pcb.boardOutline[i].x, pcb.boardOutline[i].y);
    ctx.closePath();
    ctx.stroke();

    for (const cut of pcb.cutouts) {
      if (cut.points.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(cut.points[0].x, cut.points[0].y);
      for (let i = 1; i < cut.points.length; i++) ctx.lineTo(cut.points[i].x, cut.points[i].y);
      ctx.closePath();
      ctx.fillStyle = '#000000';
      ctx.fill();
      ctx.stroke();
    }
  }

  if (layers.isVisible('Keepout')) {
    ctx.strokeStyle = '#FF0088';
    ctx.fillStyle = 'rgba(255, 0, 136, 0.16)';
    ctx.lineWidth = 0.2;
    for (const ko of pcb.keepouts) {
      if (ko.points.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(ko.points[0].x, ko.points[0].y);
      for (let i = 1; i < ko.points.length; i++) ctx.lineTo(ko.points[i].x, ko.points[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}

/** Draws computed obstacle-subtracted copper pour islands and polygon boundaries. */
export function drawCopperPours(
  ctx: CanvasRenderingContext2D,
  pcb: PcbProject,
  layers: LayerLookup
): void {
  for (const pour of pcb.copperPours) {
    if (!layers.isVisible(pour.layer)) continue;
    const baseCol = layers.getColor(pour.layer, '#FF3030');
    ctx.save();
    if (pour.poured && pour.computedIslands && pour.computedIslands.length > 0) {
      if (pour.fillType === 'Hatch') {
        ctx.save();
        ctx.beginPath();
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const isl of pour.computedIslands) {
          if (isl.outer.length < 3) continue;
          ctx.moveTo(isl.outer[0].x, isl.outer[0].y);
          for (const pt of isl.outer) {
            minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
            minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
          }
          for (let i = 1; i < isl.outer.length; i++) ctx.lineTo(isl.outer[i].x, isl.outer[i].y);
          ctx.closePath();
          for (const hole of isl.holes ?? []) {
            if (hole.length < 3) continue;
            ctx.moveTo(hole[0].x, hole[0].y);
            for (let i = 1; i < hole.length; i++) ctx.lineTo(hole[i].x, hole[i].y);
            ctx.closePath();
          }
        }
        ctx.clip('evenodd');
        ctx.strokeStyle = baseCol;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 0.16;
        const pitch = 0.85;
        const span = maxX - minX + (maxY - minY);
        ctx.beginPath();
        for (let d = -span; d <= span; d += pitch) {
          ctx.moveTo(minX + d, minY);
          ctx.lineTo(minX + d + (maxY - minY), maxY);
          ctx.moveTo(minX + d + (maxY - minY), minY);
          ctx.lineTo(minX + d, maxY);
        }
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.fillStyle = baseCol;
        ctx.globalAlpha = 0.28;
        for (const isl of pour.computedIslands) {
          if (isl.outer.length < 3) continue;
          ctx.beginPath();
          ctx.moveTo(isl.outer[0].x, isl.outer[0].y);
          for (let i = 1; i < isl.outer.length; i++) ctx.lineTo(isl.outer[i].x, isl.outer[i].y);
          ctx.closePath();
          for (const hole of isl.holes ?? []) {
            if (hole.length < 3) continue;
            ctx.moveTo(hole[0].x, hole[0].y);
            for (let i = 1; i < hole.length; i++) ctx.lineTo(hole[i].x, hole[i].y);
            ctx.closePath();
          }
          ctx.fill('evenodd');
        }
      }
    }
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = baseCol;
    ctx.lineWidth = 0.2;
    ctx.setLineDash([1.2, 0.8]);
    if (pour.outline.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(pour.outline[0].x, pour.outline[0].y);
      for (let i = 1; i < pour.outline.length; i++) ctx.lineTo(pour.outline[i].x, pour.outline[i].y);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Draws copper traces ordered Bottom -> Inner -> Top. */
export function drawCopperTraces(
  ctx: CanvasRenderingContext2D,
  pcb: PcbProject,
  layers: LayerLookup,
  selectedTraceId: string | null,
  highlightedNet: string | null
): void {
  for (const lay of COPPER_LAYER_DRAW_ORDER) {
    if (!layers.isVisible(lay)) continue;
    const col = layers.getColor(lay, lay === 'TopCopper' ? '#FF3030' : '#3078FF');
    for (const tr of pcb.traces) {
      if (tr.layer !== lay || tr.points.length < 2) continue;
      const isSel = tr.id === selectedTraceId || (highlightedNet && tr.netName === highlightedNet);
      ctx.strokeStyle = isSel ? '#FFFF44' : col;
      ctx.lineWidth = tr.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(tr.points[0].x, tr.points[0].y);
      for (let i = 1; i < tr.points.length; i++) ctx.lineTo(tr.points[i].x, tr.points[i].y);
      ctx.stroke();
    }
  }
}
