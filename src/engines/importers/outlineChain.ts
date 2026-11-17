import { Point2D } from '../../core/types';

export interface Segment2D {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function ptsEqual(a: Point2D, b: Point2D, eps = 0.08): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= eps;
}

/**
 * Tessellates a 2D circular arc (center cx/cy, start s, end e, clockwise or CCW)
 * into connected polyline points including exact start and end points.
 */
export function tessellateArcCenter(
  cx: number,
  cy: number,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  ccw = true,
  segments = 16
): Point2D[] {
  const r = Math.hypot(sx - cx, sy - cy);
  if (r < 1e-4) return [{ x: sx, y: sy }, { x: ex, y: ey }];
  const a0 = Math.atan2(sy - cy, sx - cx);
  const a1 = Math.atan2(ey - cy, ex - cx);
  let delta = a1 - a0;
  if (ccw) {
    if (delta <= 0) delta += Math.PI * 2;
  } else {
    if (delta >= 0) delta -= Math.PI * 2;
  }
  const steps = Math.max(4, Math.min(48, Math.ceil((Math.abs(delta) / (Math.PI * 2)) * segments * 2)));
  const pts: Point2D[] = [{ x: sx, y: sy }];
  for (let i = 1; i < steps; i++) {
    const a = a0 + (delta * i) / steps;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  pts.push({ x: ex, y: ey });
  return pts;
}

/**
 * Tessellates a 3-point KiCad/Eagle circular arc from start -> mid -> end into polyline points.
 */
export function tessellateArc3Pt(start: Point2D, mid: Point2D, end: Point2D, maxStepAngle = Math.PI / 16): Point2D[] {
  const d = 2 * (start.x * (mid.y - end.y) + mid.x * (end.y - start.y) + end.x * (start.y - mid.y));
  if (Math.abs(d) < 1e-6) return [start, mid, end];
  const s2 = start.x * start.x + start.y * start.y;
  const m2 = mid.x * mid.x + mid.y * mid.y;
  const e2 = end.x * end.x + end.y * end.y;
  const cx = (s2 * (mid.y - end.y) + m2 * (end.y - start.y) + e2 * (start.y - mid.y)) / d;
  const cy = (s2 * (end.x - mid.x) + m2 * (start.x - end.x) + e2 * (mid.x - start.x)) / d;
  const r = Math.hypot(start.x - cx, start.y - cy);
  if (!Number.isFinite(r) || r > 50000) return [start, mid, end];

  let a0 = Math.atan2(start.y - cy, start.x - cx);
  let am = Math.atan2(mid.y - cy, mid.x - cx);
  let a1 = Math.atan2(end.y - cy, end.x - cx);
  const norm = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  a0 = norm(a0);
  am = norm(am);
  a1 = norm(a1);

  const ccwDelta = (from: number, to: number) => norm(to - from);
  const spanCCW = ccwDelta(a0, a1);
  const midCCW = ccwDelta(a0, am);
  const delta = midCCW <= spanCCW ? spanCCW : -(Math.PI * 2 - spanCCW);

  const steps = Math.max(4, Math.min(48, Math.ceil(Math.abs(delta) / maxStepAngle)));
  const pts: Point2D[] = [start];
  for (let i = 1; i < steps; i++) {
    const a = a0 + (delta * i) / steps;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  pts.push(end);
  return pts;
}

/**
 * Chains unordered segments into the longest closed (or contiguous) polygon loop.
 */
export function chainSegmentsToOutline(segments: Segment2D[], tolerance = 0.25): Point2D[] {
  if (segments.length === 0) return [];
  const remaining = segments.filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 1e-4);
  if (remaining.length === 0) return [];

  const loops: Point2D[][] = [];
  while (remaining.length > 0) {
    const first = remaining.shift()!;
    const loop: Point2D[] = [{ x: first.x1, y: first.y1 }, { x: first.x2, y: first.y2 }];

    let extended = true;
    while (extended && remaining.length > 0) {
      extended = false;
      const head = loop[0];
      const tail = loop[loop.length - 1];
      if (loop.length >= 3 && ptsEqual(head, tail, tolerance)) break;

      let bestIdx = -1;
      let bestDist = tolerance;
      let appendReversed = false;
      let prepend = false;

      for (let i = 0; i < remaining.length; i++) {
        const s = remaining[i];
        const dTailStart = Math.hypot(tail.x - s.x1, tail.y - s.y1);
        const dTailEnd = Math.hypot(tail.x - s.x2, tail.y - s.y2);
        const dHeadEnd = Math.hypot(head.x - s.x2, head.y - s.y2);
        const dHeadStart = Math.hypot(head.x - s.x1, head.y - s.y1);

        if (dTailStart < bestDist) { bestDist = dTailStart; bestIdx = i; appendReversed = false; prepend = false; }
        if (dTailEnd < bestDist) { bestDist = dTailEnd; bestIdx = i; appendReversed = true; prepend = false; }
        if (dHeadEnd < bestDist) { bestDist = dHeadEnd; bestIdx = i; appendReversed = false; prepend = true; }
        if (dHeadStart < bestDist) { bestDist = dHeadStart; bestIdx = i; appendReversed = true; prepend = true; }
      }

      if (bestIdx >= 0) {
        const seg = remaining.splice(bestIdx, 1)[0];
        if (!prepend) {
          loop.push(appendReversed ? { x: seg.x1, y: seg.y1 } : { x: seg.x2, y: seg.y2 });
        } else {
          loop.unshift(appendReversed ? { x: seg.x2, y: seg.y2 } : { x: seg.x1, y: seg.y1 });
        }
        extended = true;
      }
    }

    if (loop.length >= 3 && ptsEqual(loop[0], loop[loop.length - 1], Math.max(tolerance, 0.5))) {
      loop[loop.length - 1] = { ...loop[0] };
    }
    loops.push(loop);
  }

  // Pick loop with largest bounding box area (outermost perimeter vs small cutouts)
  let best = loops[0];
  let bestArea = -1;
  for (const loop of loops) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of loop) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const area = (maxX - minX) * (maxY - minY) + loop.length * 0.001;
    if (area > bestArea) {
      bestArea = area;
      best = loop;
    }
  }
  return best;
}

/** Ensures a 2D outline polygon has at least 3 distinct points and explicit closure if requested. */
export function closeLoopIfValid(pts: Point2D[], tolerance = 0.5): Point2D[] {
  if (pts.length < 3) return pts;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (Math.hypot(first.x - last.x, first.y - last.y) > tolerance) {
    return [...pts, { ...first }];
  }
  return [...pts.slice(0, -1), { ...first }];
}
