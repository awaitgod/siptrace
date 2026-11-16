import { Point2D, SchematicSheet } from '../../../../core/types';
import { buildGostFrameAndStampGeometry, SHEET_FORMATS } from '../../../../gost/gostTitleBlock';
import { SchThemePalette, SchViewport } from '../types';

/** Renders dotted sheet grid, GOST 2.104-2006 / 2.301-68 frame + title block, and origin crosshair. */
export function drawSchGridAndFrame(
  ctx: CanvasRenderingContext2D,
  sheet: SchematicSheet,
  origin: Point2D,
  gridSize: number,
  viewport: SchViewport,
  canvasWidth: number,
  canvasHeight: number,
  showGrid: boolean,
  palette: SchThemePalette
): void {
  const sheetDim = SHEET_FORMATS[sheet.format];

  // Dotted Grid inside sheet area
  if (showGrid && gridSize * viewport.pxPerMm >= 3.5) {
    ctx.fillStyle = palette.gridColor;
    const step = gridSize;
    const startX = Math.max(0, Math.floor(-viewport.ox / viewport.pxPerMm / step) * step);
    const endX = Math.min(sheetDim.widthMm, (canvasWidth - viewport.ox) / viewport.pxPerMm);
    const startY = Math.max(0, Math.floor(-viewport.oy / viewport.pxPerMm / step) * step);
    const endY = Math.min(sheetDim.heightMm, (canvasHeight - viewport.oy) / viewport.pxPerMm);
    const dotSize = 0.9 / viewport.pxPerMm;
    for (let gx = startX; gx <= endX; gx += step) {
      for (let gy = startY; gy <= endY; gy += step) {
        ctx.fillRect(gx - dotSize * 0.5, gy - dotSize * 0.5, dotSize, dotSize);
      }
    }
  }

  // Sheet GOST Frame & Title Block
  const tbGeom = buildGostFrameAndStampGeometry(sheet.format, sheet.titleBlock);
  for (const l of tbGeom.lines) {
    ctx.strokeStyle = palette.frameColor;
    ctx.lineWidth = Math.max(0.6 / viewport.pxPerMm, l.thick ? 0.45 : 0.2);
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();
  }
  for (const t of tbGeom.texts) {
    ctx.save();
    ctx.fillStyle = palette.frameColor;
    ctx.font = `${t.italic ? 'italic ' : ''}${t.bold ? 'bold ' : ''}${t.sizeMm}px "Segoe UI", Arial`;
    ctx.textAlign = t.align;
    ctx.textBaseline = 'middle';
    if (t.rotateDeg) {
      ctx.translate(t.x, t.y);
      ctx.rotate((t.rotateDeg * Math.PI) / 180);
      ctx.fillText(t.text, 0, 0);
    } else {
      ctx.fillText(t.text, t.x, t.y, t.maxWidthMm);
    }
    ctx.restore();
  }

  // Origin axes crosshair
  ctx.strokeStyle = '#336699';
  ctx.lineWidth = 1 / viewport.pxPerMm;
  ctx.beginPath();
  ctx.moveTo(origin.x - 4, origin.y);
  ctx.lineTo(origin.x + 4, origin.y);
  ctx.moveTo(origin.x, origin.y - 4);
  ctx.lineTo(origin.x, origin.y + 4);
  ctx.stroke();
}
