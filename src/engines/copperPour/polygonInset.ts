import { Point2D } from '../../core/types';

/** Insets a closed polygon inward along each edge normal without radial skew. */
export function insetPolygonByEdgeNormals(poly: Point2D[], insetMm: number): Point2D[] {
  const n = poly.length;
  if (n < 3 || insetMm <= 0) return poly;
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    area2 += a.x * b.y - b.x * a.y;
  }
  const sign = area2 > 0 ? 1 : -1;

  const shiftedLines = poly.map((p1, i) => {
    const p2 = poly[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    // Left normal for CCW (area2 > 0) points inward
    const nx = (-dy / len) * sign;
    const ny = (dx / len) * sign;
    return {
      p1: { x: p1.x + nx * insetMm, y: p1.y + ny * insetMm },
      p2: { x: p2.x + nx * insetMm, y: p2.y + ny * insetMm }
    };
  });

  const out: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const L1 = shiftedLines[(i - 1 + n) % n];
    const L2 = shiftedLines[i];
    const a1 = L1.p2.y - L1.p1.y;
    const b1 = L1.p1.x - L1.p2.x;
    const c1 = a1 * L1.p1.x + b1 * L1.p1.y;
    const a2 = L2.p2.y - L2.p1.y;
    const b2 = L2.p1.x - L2.p2.x;
    const c2 = a2 * L2.p1.x + b2 * L2.p1.y;
    const det = a1 * b2 - a2 * b1;
    if (Math.abs(det) < 1e-9) {
      out.push({ x: Number(L2.p1.x.toFixed(3)), y: Number(L2.p1.y.toFixed(3)) });
    } else {
      out.push({
        x: Number(((b2 * c1 - b1 * c2) / det).toFixed(3)),
        y: Number(((a1 * c2 - a2 * c1) / det).toFixed(3))
      });
    }
  }
  return out;
}
