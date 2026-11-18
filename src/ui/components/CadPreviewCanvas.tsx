import React, { useEffect, useRef } from 'react';
import { ColorSchemeId, ComponentDef, PatternDef, SymbolPin, SymbolPrimitive } from '../../core/types';
import { transformPoint } from '../../core/geometry';

export function drawSymbolPrimitives(
  ctx: CanvasRenderingContext2D,
  primitives: SymbolPrimitive[],
  pins: SymbolPin[],
  ox: number,
  oy: number,
  angleDeg: number,
  flipX: boolean,
  flipY: boolean,
  pxPerMm: number,
  strokeColor: string,
  pinColor: string,
  textColor: string,
  pinFontScale = 1.0,
  bgColor = '#000000'
) {
  const tr = (px: number, py: number) => transformPoint(px, py, ox, oy, angleDeg, flipX, flipY);

  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = strokeColor;

  for (const p of primitives) {
    const primWidth = p.type === 'text' ? 0.35 : (p.width ?? 0.35);
    const lw = Math.max(1.0 / Math.max(0.5, pxPerMm), primWidth);
    ctx.lineWidth = lw;
    if (p.type === 'line') {
      ctx.save();
      if (p.dashed) ctx.setLineDash([1.2, 1.0]);
      const a = tr(p.x1, p.y1);
      const b = tr(p.x2, p.y2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    } else if (p.type === 'rect') {
      const pts = [
        tr(p.x, p.y),
        tr(p.x + p.w, p.y),
        tr(p.x + p.w, p.y + p.h),
        tr(p.x, p.y + p.h)
      ];
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      if (p.fill) ctx.fill();
      ctx.stroke();
    } else if (p.type === 'polyline') {
      if (p.points.length < 2) continue;
      ctx.beginPath();
      const first = tr(p.points[0].x, p.points[0].y);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < p.points.length; i++) {
        const pt = tr(p.points[i].x, p.points[i].y);
        ctx.lineTo(pt.x, pt.y);
      }
      if (p.closed) ctx.closePath();
      if (p.fill) ctx.fill();
      ctx.stroke();
    } else if (p.type === 'circle') {
      const c = tr(p.cx, p.cy);
      ctx.beginPath();
      ctx.arc(c.x, c.y, p.r, 0, Math.PI * 2);
      if (p.fill) ctx.fill();
      else ctx.stroke();
    } else if (p.type === 'arc') {
      const c = tr(p.cx, p.cy);
      const rotRad = (angleDeg * Math.PI) / 180;
      const sx = Math.cos(p.startAngle) * (flipX ? -1 : 1);
      const sy = Math.sin(p.startAngle) * (flipY ? -1 : 1);
      const ex = Math.cos(p.endAngle) * (flipX ? -1 : 1);
      const ey = Math.sin(p.endAngle) * (flipY ? -1 : 1);
      const sAng = Math.atan2(sy, sx) + rotRad;
      const eAng = Math.atan2(ey, ex) + rotRad;
      ctx.beginPath();
      ctx.arc(c.x, c.y, p.r, sAng, eAng, flipX !== flipY);
      ctx.stroke();
    } else if (p.type === 'text') {
      const c = tr(p.x, p.y);
      ctx.save();
      ctx.fillStyle = textColor;
      const fontSize = Math.max(1.8, (p.size ?? 2.6) * pinFontScale);
      ctx.font = `${p.italic ? 'italic ' : ''}${p.bold ? 'bold ' : ''}${fontSize}px "OpenGost", Arial`;
      let align = p.align ?? 'center';
      if (flipX && align === 'left') align = 'right';
      else if (flipX && align === 'right') align = 'left';
      ctx.translate(c.x, c.y);
      if (angleDeg === 90 || angleDeg === 270) {
        ctx.rotate(-Math.PI / 2);
      }
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }

  // Draw pins
  ctx.lineWidth = Math.max(1.0 / Math.max(0.5, pxPerMm), 0.32);
  for (const pin of pins) {
    const rad = (pin.orientation * Math.PI) / 180;
    const endX = pin.x + Math.cos(rad) * pin.length;
    const endY = pin.y + Math.sin(rad) * pin.length;
    const pStart = tr(pin.x, pin.y);
    const pEnd = tr(endX, endY);

    ctx.strokeStyle = pinColor;
    ctx.lineWidth = Math.max(1.0 / Math.max(0.5, pxPerMm), 0.32);
    ctx.beginPath();
    ctx.moveTo(pStart.x, pStart.y);
    ctx.lineTo(pEnd.x, pEnd.y);
    ctx.stroke();

    const dx = pEnd.x - pStart.x;
    const dy = pEnd.y - pStart.y;
    const pinLen = Math.hypot(dx, dy) || 1;
    const ux = dx / pinLen;
    const uy = dy / pinLen;
    const isHoriz = Math.abs(ux) >= Math.abs(uy);
    const hasClock = pin.style === 'Clock' || pin.style === 'InvertedClock';

    // Inverted bubble at body boundary (Ø ~1.9-2.0mm per ГОСТ 2.743-91)
    if (pin.style === 'Inverted' || pin.style === 'InvertedClock') {
      const rBub = 0.92;
      const bx = pEnd.x - ux * rBub;
      const by = pEnd.y - uy * rBub;
      ctx.fillStyle = bgColor;
      ctx.strokeStyle = pinColor;
      ctx.lineWidth = Math.max(0.22, 1.1 / pxPerMm);
      ctx.beginPath();
      ctx.arc(bx, by, rBub, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Dynamic clock edge notch (ГОСТ 2.743-91) inside body
    if (hasClock) {
      const px = -uy;
      const py = ux;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = Math.max(0.22, 1.1 / pxPerMm);
      ctx.beginPath();
      ctx.moveTo(pEnd.x + px * 0.8, pEnd.y + py * 0.8);
      ctx.lineTo(pEnd.x + ux * 1.45, pEnd.y + uy * 1.45);
      ctx.lineTo(pEnd.x - px * 0.8, pEnd.y - py * 0.8);
      ctx.stroke();
    }

    // Pin number & name (direction-aware GOST/DipTrace inset so names never collide with center markings)
    ctx.save();
    ctx.fillStyle = textColor;
    if (pin.showNumber && pin.number) {
      ctx.font = `${1.8 * pinFontScale}px "OpenGost", Arial`;
      if (isHoriz) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(pin.number, (pStart.x + pEnd.x) / 2, (pStart.y + pEnd.y) / 2 - 0.3);
      } else {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(pin.number, (pStart.x + pEnd.x) / 2 - 0.45, (pStart.y + pEnd.y) / 2);
      }
    }
    if (pin.showName && pin.name) {
      ctx.font = `${1.85 * pinFontScale}px "OpenGost", Arial`;
      const nameOffset = hasClock ? 1.9 : 0.85;
      const inwardX = pEnd.x + ux * nameOffset;
      const inwardY = pEnd.y + uy * nameOffset;
      if (isHoriz) {
        ctx.textAlign = ux >= 0 ? 'left' : 'right';
        ctx.textBaseline = 'middle';
      } else {
        ctx.textAlign = 'center';
        ctx.textBaseline = uy >= 0 ? 'top' : 'bottom';
      }
      ctx.fillText(pin.name, inwardX, inwardY);
    }
    ctx.restore();
  }
}

export const SymbolPreviewCanvas: React.FC<{ component: ComponentDef | null; partIndex?: number; colorScheme?: ColorSchemeId }> = ({
  component,
  partIndex = 1,
  colorScheme = 'dark'
}) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 180;
    const h = canvas.clientHeight || 86;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const light = colorScheme !== 'dark';
    const bgColor = colorScheme === 'gost-bw' ? '#FFFFFF' : light ? '#F0F1F2' : '#000000';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    if (!component) return;
    const part = component.parts.find((p) => p.partIndex === partIndex) ?? component.parts[0];
    if (!part) return;

    // Auto-fit bounds across all primitive & pin types
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const expandB = (bx: number, by: number) => {
      if (bx < minX) minX = bx;
      if (bx > maxX) maxX = bx;
      if (by < minY) minY = by;
      if (by > maxY) maxY = by;
    };
    for (const pin of part.pins) {
      expandB(pin.x - 2, pin.y - 2);
      expandB(pin.x + 2, pin.y + 2);
    }
    for (const p of part.primitives) {
      if (p.type === 'rect') {
        expandB(p.x, p.y); expandB(p.x + p.w, p.y + p.h);
      } else if (p.type === 'circle' || p.type === 'arc') {
        expandB(p.cx - p.r, p.cy - p.r); expandB(p.cx + p.r, p.cy + p.r);
      } else if (p.type === 'line') {
        expandB(p.x1, p.y1); expandB(p.x2, p.y2);
      } else if (p.type === 'polyline') {
        for (const pt of p.points) expandB(pt.x, pt.y);
      } else if (p.type === 'text') {
        expandB(p.x - 3, p.y - 2); expandB(p.x + 3, p.y + 2);
      }
    }
    if (!Number.isFinite(minX)) {
      minX = -10; maxX = 10; minY = -8; maxY = 8;
    }

    const bw = Math.max(8, maxX - minX);
    const bh = Math.max(8, maxY - minY);
    const scale = Math.min((w - 22) / bw, (h - 18) / bh);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    ctx.save();
    ctx.translate(w / 2 - cx * scale, h / 2 - cy * scale);
    ctx.scale(scale, scale);
    drawSymbolPrimitives(ctx, part.primitives, part.pins, 0, 0, 0, false, false, scale, light ? '#111111' : '#E8E8E8', light ? '#333333' : '#C8C888', light ? '#111111' : '#D0D0D0', 1, bgColor);
    ctx.restore();
  }, [component, partIndex, colorScheme]);

  return <canvas ref={ref} className="dt-preview-box" />;
};

export const PatternPreviewCanvas: React.FC<{ pattern: PatternDef | null; colorScheme?: ColorSchemeId }> = ({ pattern, colorScheme = 'dark' }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 180;
    const h = canvas.clientHeight || 80;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const light = colorScheme !== 'dark';
    const bgColor = colorScheme === 'gost-bw' ? '#FFFFFF' : light ? '#F0F1F2' : '#000000';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    if (!pattern) return;

    let minX = -3, maxX = 3, minY = -2, maxY = 2;
    for (const pad of pattern.pads) {
      const r = Math.max(pad.width, pad.height) / 2;
      minX = Math.min(minX, pad.x - r);
      maxX = Math.max(maxX, pad.x + r);
      minY = Math.min(minY, pad.y - r);
      maxY = Math.max(maxY, pad.y + r);
    }
    for (const g of pattern.graphics) {
      if (g.type === 'line') {
        minX = Math.min(minX, g.x1, g.x2); maxX = Math.max(maxX, g.x1, g.x2);
        minY = Math.min(minY, g.y1, g.y2); maxY = Math.max(maxY, g.y1, g.y2);
      } else if (g.type === 'rect') {
        minX = Math.min(minX, g.x); maxX = Math.max(maxX, g.x + g.w);
        minY = Math.min(minY, g.y); maxY = Math.max(maxY, g.y + g.h);
      } else if (g.type === 'circle' || g.type === 'arc') {
        minX = Math.min(minX, g.cx - g.r); maxX = Math.max(maxX, g.cx + g.r);
        minY = Math.min(minY, g.cy - g.r); maxY = Math.max(maxY, g.cy + g.r);
      }
    }
    const bw = Math.max(3, maxX - minX);
    const bh = Math.max(3, maxY - minY);
    const scale = Math.min((w - 22) / bw, (h - 18) / bh);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    ctx.save();
    ctx.translate(w / 2 - cx * scale, h / 2 - cy * scale);
    ctx.scale(scale, scale);

    // Draw pads (green for THT, red/gold for SMD just like DipTrace preview)
    for (const pad of pattern.pads) {
      ctx.save();
      ctx.translate(pad.x, pad.y);
      if (pad.angle) ctx.rotate((pad.angle * Math.PI) / 180);
      ctx.fillStyle = colorScheme === 'gost-bw' ? '#111111' : light ? (pad.type === 'THT' ? '#006600' : pad.type === 'MountingHole' ? '#555555' : '#A12424') : pad.type === 'THT' ? '#00CC44' : pad.type === 'MountingHole' ? '#C0C0C0' : '#E54040';
      if (pad.shape === 'Round') {
        ctx.beginPath();
        ctx.arc(0, 0, pad.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (pad.shape === 'Oval') {
        const rx = pad.width / 2;
        const ry = pad.height / 2;
        const cr = Math.min(rx, ry);
        ctx.beginPath();
        ctx.roundRect(-rx, -ry, pad.width, pad.height, cr);
        ctx.fill();
      } else if (pad.shape === 'RoundedRect') {
        const cr = Math.min(pad.width, pad.height) * 0.22;
        ctx.beginPath();
        ctx.roundRect(-pad.width / 2, -pad.height / 2, pad.width, pad.height, cr);
        ctx.fill();
      } else if (pad.shape === 'Polygon') {
        const hw = pad.width / 2;
        const hh = pad.height / 2;
        const c = Math.min(hw, hh) * 0.3;
        const pts = (pad.polygonPoints && pad.polygonPoints.length >= 3)
          ? pad.polygonPoints
          : [
              { x: -hw + c, y: -hh },
              { x: hw - c, y: -hh },
              { x: hw, y: -hh + c },
              { x: hw, y: hh - c },
              { x: hw - c, y: hh },
              { x: -hw + c, y: hh },
              { x: -hw, y: hh - c },
              { x: -hw, y: -hh + c }
            ];
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(-pad.width / 2, -pad.height / 2, pad.width, pad.height);
      }
      if ((pad.holeDiameter ?? 0) > 0) {
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.arc(0, 0, pad.holeDiameter! / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Graphics: Courtyard, Assembly, Silkscreen
    ctx.lineWidth = Math.max(0.12, 1 / scale);
    for (const g of pattern.graphics) {
      if (g.layer !== 'TopSilk' && g.layer !== 'Courtyard' && g.layer !== 'TopAssembly') continue;
      ctx.save();
      if (g.layer === 'Courtyard') {
        ctx.strokeStyle = colorScheme === 'gost-bw' ? '#111111' : light ? '#007579' : '#00CED1';
        ctx.setLineDash([0.6, 0.4]);
      } else if (g.layer === 'TopAssembly') {
        ctx.strokeStyle = light ? '#555555' : '#999999';
      } else {
        ctx.strokeStyle = light ? '#111111' : '#FFFFFF';
      }
      if (g.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(g.x1, g.y1);
        ctx.lineTo(g.x2, g.y2);
        ctx.stroke();
      } else if (g.type === 'rect') {
        ctx.strokeRect(g.x, g.y, g.w, g.h);
      } else if (g.type === 'circle') {
        ctx.beginPath();
        ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (g.type === 'arc') {
        ctx.beginPath();
        ctx.arc(g.cx, g.cy, g.r, (g.startAngle * Math.PI) / 180, (g.endAngle * Math.PI) / 180);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  }, [pattern, colorScheme]);

  return <canvas ref={ref} className="dt-preview-box" style={{ height: 76 }} />;
};
