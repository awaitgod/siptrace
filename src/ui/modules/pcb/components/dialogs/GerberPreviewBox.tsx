import React, { useEffect, useRef, useState } from 'react';
import { Point2D } from '../../../../../core/types';
import { GerberInspectionSummary } from '../../../../../engines/camBundle';
import { parseGerberPreview } from '../../../../../engines/camExport';

export interface GerberPreviewBoxProps {
  gerberContent: string;
  outline: Point2D[];
  multiLayerSummary?: GerberInspectionSummary | null;
  visibleLayers?: Record<string, boolean>;
  showComposite?: boolean;
}

/** Built-in multi-layer interactive Gerber RS-274X + Excellon viewer with zoom and pan. */
export const GerberPreviewBox: React.FC<GerberPreviewBoxProps> = ({
  gerberContent,
  outline,
  multiLayerSummary,
  visibleLayers,
  showComposite = false
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [zoomMul, setZoomMul] = useState(1);
  const [pan, setPan] = useState<Point2D>({ x: 0, y: 0 });
  const baseScaleRef = useRef(1);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    setZoomMul(1);
    setPan({ x: 0, y: 0 });
  }, [gerberContent, showComposite, multiLayerSummary]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const w = canvas.clientWidth || 440;
    const h = canvas.clientHeight || 270;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, w, h);

    // Subtle dark CAM grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 24) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 24) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const xs: number[] = [];
    const ys: number[] = [];
    const collectPts = (pts: Point2D[]) => {
      for (const p of pts) {
        if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
          xs.push(p.x);
          ys.push(p.y);
        }
      }
    };

    collectPts(outline);

    const activeLayers =
      showComposite && multiLayerSummary
        ? multiLayerSummary.layers.filter((l) => (visibleLayers ? visibleLayers[l.key] !== false : true))
        : [
            {
              key: 'single',
              label: 'Layer',
              filename: 'layer.gbr',
              color: '#34d399',
              entities: parseGerberPreview(gerberContent),
              drills: []
            }
          ];

    for (const lay of activeLayers) {
      for (const ent of lay.entities) collectPts(ent.pts);
      for (const dr of lay.drills) collectPts([dr]);
    }

    const minX = xs.length ? Math.min(...xs) - 4 : 0;
    const maxX = xs.length ? Math.max(...xs) + 4 : 100;
    const minY = ys.length ? Math.min(...ys) - 4 : 0;
    const maxY = ys.length ? Math.max(...ys) + 4 : 70;
    const baseScale = Math.min((w - 28) / Math.max(10, maxX - minX), (h - 28) / Math.max(10, maxY - minY));
    baseScaleRef.current = baseScale;
    const sc = baseScale * zoomMul;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const toPx = (pt: Point2D) => ({
      x: w / 2 + (pt.x - cx) * sc + pan.x,
      y: h / 2 + (pt.y - cy) * sc + pan.y
    });

    if (outline.length >= 3) {
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      outline.forEach((p, idx) => {
        const px = toPx(p);
        if (idx === 0) ctx.moveTo(px.x, px.y);
        else ctx.lineTo(px.x, px.y);
      });
      ctx.closePath();
      ctx.stroke();
    }

    for (const lay of activeLayers) {
      ctx.strokeStyle = lay.color;
      ctx.fillStyle = lay.color;
      ctx.globalAlpha = showComposite && (lay.key === 'topMask' || lay.key === 'bottomMask') ? 0.35 : 0.9;

      for (const e of lay.entities) {
        if (e.kind === 'line' && e.pts.length >= 2) {
          ctx.lineWidth = Math.max(1, e.width * sc);
          ctx.lineCap = 'round';
          ctx.beginPath();
          e.pts.forEach((pt, idx) => {
            const p = toPx(pt);
            if (idx === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.stroke();
        } else if (e.kind === 'region' && e.pts.length >= 3) {
          ctx.beginPath();
          e.pts.forEach((pt, idx) => {
            const p = toPx(pt);
            if (idx === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.closePath();
          ctx.fill();
        } else if (e.kind === 'flash' && e.pts[0]) {
          const p = toPx(e.pts[0]);
          ctx.save();
          ctx.translate(p.x, p.y);
          if (e.angleDeg) ctx.rotate((e.angleDeg * Math.PI) / 180);
          if (e.shape === 'O' && e.w && e.h) {
            ctx.beginPath();
            ctx.ellipse(0, 0, Math.max(1.5, (e.w * sc) / 2), Math.max(1.5, (e.h * sc) / 2), 0, 0, Math.PI * 2);
            ctx.fill();
          } else if (e.shape === 'R' && e.w && e.h) {
            const rw = Math.max(2, e.w * sc);
            const rh = Math.max(2, e.h * sc);
            ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(1.5, (e.width * sc) / 2), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      // Excellon drills overlay
      for (const dr of lay.drills) {
        const p = toPx(dr);
        const r = Math.max(1.8, (dr.diameter * sc) / 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#090d16';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }, [gerberContent, outline, multiLayerSummary, visibleLayers, showComposite, zoomMul, pan]);

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={ref}
        style={{ width: '100%', height: 270, border: '1px solid #475569', display: 'block', cursor: 'grab' }}
        onWheel={(e) => {
          e.preventDefault();
          setZoomMul((z) => Math.max(0.3, Math.min(12, z * (e.deltaY < 0 ? 1.15 : 0.87))));
        }}
        onMouseDown={(e) => {
          dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
        }}
        onMouseMove={(e) => {
          if (!dragRef.current) return;
          setPan({ x: dragRef.current.px + (e.clientX - dragRef.current.x), y: dragRef.current.py + (e.clientY - dragRef.current.y) });
        }}
        onMouseUp={() => { dragRef.current = null; }}
        onMouseLeave={() => { dragRef.current = null; }}
      />
      <div style={{ position: 'absolute', right: 6, top: 6, display: 'flex', gap: 4 }}>
        <button type="button" className="dt-btn" style={{ minWidth: 24, height: 20, padding: '0 6px' }} onClick={() => setZoomMul((z) => Math.min(12, z * 1.25))}>+</button>
        <button type="button" className="dt-btn" style={{ minWidth: 24, height: 20, padding: '0 6px' }} onClick={() => setZoomMul((z) => Math.max(0.3, z * 0.8))}>-</button>
        <button
          type="button"
          className="dt-btn"
          title="Реальный физический масштаб 1:1 (96 DPI ≈ 3.78 px/мм)"
          style={{ minWidth: 28, height: 20, padding: '0 6px' }}
          onClick={() => {
            const truePxPerMm = 96 / 25.4;
            setZoomMul(Math.max(0.3, Math.min(12, truePxPerMm / Math.max(0.1, baseScaleRef.current))));
            setPan({ x: 0, y: 0 });
          }}
        >
          1:1
        </button>
        <button type="button" className="dt-btn" title="Вписать всю плату" style={{ minWidth: 44, height: 20, padding: '0 6px' }} onClick={() => { setZoomMul(1); setPan({ x: 0, y: 0 }); }}>Вписать</button>
      </div>
    </div>
  );
};
