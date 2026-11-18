import { PcbProject, PcbShape, PcbVia, Point2D } from '../../../core/types';
import { uid } from '../../../core/geometry';
import { convertImportedPcbToGost, GostConversionReport } from '../gostConverter';
import { makeEcadPcbProject, makePcbShapeCircle } from '../ecad/ecadFactories';
import { chainSegmentsToOutline, Segment2D, tessellateArcCenter } from '../outlineChain';

function tessellateBulge(p1: Point2D, p2: Point2D, bulge: number): Point2D[] {
  if (Math.abs(bulge) < 1e-4) return [p1, p2];
  const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (d < 1e-4) return [p1, p2];
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const nx = -(p2.y - p1.y) / d;
  const ny = (p2.x - p1.x) / d;
  const h = (d / 2) * ((1 - bulge * bulge) / (2 * bulge));
  const cx = mx + h * nx;
  const cy = my + h * ny;
  return tessellateArcCenter(cx, cy, p1.x, p1.y, p2.x, p2.y, bulge > 0);
}

/** Parses AutoCAD DXF ASCII into PcbProject with $INSUNITS scaling, outline chaining, drill circles, and unified negative-coord shifting. */
export function parseDxfToPcb(dxfText: string, name = 'DXF_Board'): {
  pcb: PcbProject;
  report: GostConversionReport;
} {
  const lines = dxfText.split(/\r?\n/).map((l) => l.trim());
  let unitMul = 1.0;
  const segments: Segment2D[] = [];
  const polylines: Point2D[][] = [];
  const circles: Array<{ cx: number; cy: number; r: number; layer: string }> = [];
  const arcs: Array<{ cx: number; cy: number; r: number; a0: number; a1: number }> = [];

  for (let i = 0; i + 1 < lines.length; i++) {
    const code = lines[i], val = lines[i + 1];
    if (code === '9' && val === '$INSUNITS') {
      for (let j = i + 2; j + 1 < lines.length && lines[j] !== '9'; j += 2) {
        if (lines[j] === '70') {
          const u = parseInt(lines[j + 1], 10);
          unitMul = u === 1 ? 25.4 : u === 2 ? 304.8 : u === 5 ? 10.0 : 1.0;
          break;
        }
      }
    }

    if (code === '0' && val === 'LINE') {
      let x1 = 0, y1 = 0, x2 = 0, y2 = 0, j = i + 2;
      for (; j + 1 < lines.length && lines[j] !== '0'; j += 2) {
        const c = lines[j], v = parseFloat(lines[j + 1]);
        if (!Number.isFinite(v)) continue;
        if (c === '10') x1 = v * unitMul; else if (c === '20') y1 = v * unitMul;
        else if (c === '11') x2 = v * unitMul; else if (c === '21') y2 = v * unitMul;
      }
      if (Math.hypot(x2 - x1, y2 - y1) > 1e-4) segments.push({ x1, y1, x2, y2 });
      i = j - 1;
    } else if (code === '0' && val === 'LWPOLYLINE') {
      const vertices: Array<{ pt: Point2D; bulge: number }> = [];
      let curX: number | null = null, closed = false, j = i + 2;
      for (; j + 1 < lines.length && lines[j] !== '0'; j += 2) {
        const c = lines[j], v = parseFloat(lines[j + 1]);
        if (c === '70' && Number.isFinite(v)) closed = (Math.trunc(v) & 1) === 1;
        else if (c === '10' && Number.isFinite(v)) curX = v * unitMul;
        else if (c === '20' && Number.isFinite(v) && curX !== null) { vertices.push({ pt: { x: curX, y: v * unitMul }, bulge: 0 }); curX = null; }
        else if (c === '42' && Number.isFinite(v) && vertices.length > 0) { vertices[vertices.length - 1].bulge = v; }
      }
      const count = vertices.length;
      if (count >= 2) {
        const segLimit = closed ? count : count - 1;
        for (let k = 0; k < segLimit; k++) {
          const p1 = vertices[k].pt;
          const p2 = vertices[(k + 1) % count].pt;
          const b = vertices[k].bulge;
          if (Math.abs(b) > 1e-4) {
            const arcPts = tessellateBulge(p1, p2, b);
            for (let aIdx = 0; aIdx + 1 < arcPts.length; aIdx++) {
              segments.push({ x1: arcPts[aIdx].x, y1: arcPts[aIdx].y, x2: arcPts[aIdx + 1].x, y2: arcPts[aIdx + 1].y });
            }
          } else {
            segments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
          }
        }
      }
      i = j - 1;
    } else if (code === '0' && val === 'CIRCLE') {
      let cx = 0, cy = 0, r = 1, layer = '', j = i + 2;
      for (; j + 1 < lines.length && lines[j] !== '0'; j += 2) {
        const c = lines[j];
        if (c === '8') { layer = lines[j + 1]; continue; }
        const v = parseFloat(lines[j + 1]);
        if (!Number.isFinite(v)) continue;
        if (c === '10') cx = v * unitMul; else if (c === '20') cy = v * unitMul; else if (c === '40') r = v * unitMul;
      }
      if (r > 0.05) circles.push({ cx, cy, r, layer });
      i = j - 1;
    } else if (code === '0' && val === 'ARC') {
      let cx = 0, cy = 0, r = 1, a0 = 0, a1 = 90, j = i + 2;
      for (; j + 1 < lines.length && lines[j] !== '0'; j += 2) {
        const c = lines[j], v = parseFloat(lines[j + 1]);
        if (!Number.isFinite(v)) continue;
        if (c === '10') cx = v * unitMul; else if (c === '20') cy = v * unitMul;
        else if (c === '40') r = v * unitMul; else if (c === '50') a0 = v; else if (c === '51') a1 = v;
      }
      if (r > 0.1) arcs.push({ cx, cy, r, a0, a1 });
      i = j - 1;
    }
  }

  for (const a of arcs) {
    let sweep = a.a1 - a.a0; if (sweep <= 0) sweep += 360;
    const steps = Math.max(4, Math.ceil((sweep / 360) * 24));
    for (let k = 0; k < steps; k++) {
      const t0 = ((a.a0 + (sweep * k) / steps) * Math.PI) / 180;
      const t1 = ((a.a0 + (sweep * (k + 1)) / steps) * Math.PI) / 180;
      segments.push({ x1: a.cx + a.r * Math.cos(t0), y1: a.cy + a.r * Math.sin(t0), x2: a.cx + a.r * Math.cos(t1), y2: a.cy + a.r * Math.sin(t1) });
    }
  }

  let boardOutline = chainSegmentsToOutline(segments, 0.25);
  if (boardOutline.length < 3 && circles.length > 0) {
    const largest = circles.reduce((a, b) => (b.r > a.r ? b : a));
    boardOutline = Array.from({ length: 33 }, (_, idx) => ({ x: largest.cx + largest.r * Math.cos((idx / 32) * Math.PI * 2), y: largest.cy + largest.r * Math.sin((idx / 32) * Math.PI * 2) }));
  }
  if (boardOutline.length < 3) boardOutline = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }, { x: 0, y: 0 }];

  const vias: PcbVia[] = [];
  const shapes: PcbShape[] = [];
  for (const c of circles) {
    if (/DRILL|HOLE|VIA|MOUNT/i.test(c.layer) || c.r <= 2.5) {
      const dia = Math.round(c.r * 2 * 1000) / 1000;
      vias.push({ id: uid('dxfv'), x: c.cx, y: c.cy, netName: '', outerDiameter: dia + 0.5, holeDiameter: dia, startLayer: 'TopCopper', endLayer: 'BottomCopper', viaStyle: 'Through' });
    } else {
      shapes.push(makePcbShapeCircle('TopSilk', c.cx, c.cy, c.r));
    }
  }

  let minX = Infinity, minY = Infinity;
  for (const pt of boardOutline) { minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y); }
  for (const v of vias) { minX = Math.min(minX, v.x); minY = Math.min(minY, v.y); }
  for (const s of shapes) { minX = Math.min(minX, s.x1); minY = Math.min(minY, s.y1); }
  const shiftX = minX < 0 ? -minX : 0;
  const shiftY = minY < 0 ? -minY : 0;
  if (shiftX !== 0 || shiftY !== 0) {
    for (const pt of boardOutline) { pt.x = Math.round((pt.x + shiftX) * 1000) / 1000; pt.y = Math.round((pt.y + shiftY) * 1000) / 1000; }
    for (const v of vias) { v.x = Math.round((v.x + shiftX) * 1000) / 1000; v.y = Math.round((v.y + shiftY) * 1000) / 1000; }
    for (const s of shapes) { s.x1 = Math.round((s.x1 + shiftX) * 1000) / 1000; s.y1 = Math.round((s.y1 + shiftY) * 1000) / 1000; }
  }

  return convertImportedPcbToGost(makeEcadPcbProject({ name, vias, shapes, boardOutline }), 'AutoCAD DXF');
}
