import { Point2D } from '../models';
import { dist, distSq } from './vector2d';

function cross(a: Point2D, b: Point2D, c: Point2D): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point2D, b: Point2D, c: Point2D): boolean {
  return (
    c.x <= Math.max(a.x, b.x) + 1e-9 &&
    c.x >= Math.min(a.x, b.x) - 1e-9 &&
    c.y <= Math.max(a.y, b.y) + 1e-9 &&
    c.y >= Math.min(a.y, b.y) - 1e-9
  );
}

/**
 * Shortest distance from point p to segment [a, b].
 */
export function pointToSegmentDist(p: Point2D, a: Point2D, b: Point2D): number {
  const l2 = distSq(a, b);
  if (l2 < 1e-12) return dist(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  return dist(p, proj);
}

/**
 * Returns the nearest point on segment [a, b], distance, and normalized parameter t.
 */
export function pointToSegmentNearest(
  p: Point2D,
  a: Point2D,
  b: Point2D
): { point: Point2D; dist: number; t: number } {
  const l2 = distSq(a, b);
  if (l2 < 1e-12) return { point: { ...a }, dist: dist(p, a), t: 0 };
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  return { point, dist: dist(p, point), t };
}

/**
 * Returns true when closed segments [a1, a2] and [b1, b2] intersect.
 */
export function segmentsIntersect(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): boolean {
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (Math.abs(d1) < 1e-9 && onSegment(b1, b2, a1)) return true;
  if (Math.abs(d2) < 1e-9 && onSegment(b1, b2, a2)) return true;
  if (Math.abs(d3) < 1e-9 && onSegment(a1, a2, b1)) return true;
  if (Math.abs(d4) < 1e-9 && onSegment(a1, a2, b2)) return true;
  return false;
}

/**
 * Shortest distance between closed segments [a1, a2] and [b1, b2].
 */
export function segmentToSegmentDist(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): number {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    pointToSegmentDist(a1, b1, b2),
    pointToSegmentDist(a2, b1, b2),
    pointToSegmentDist(b1, a1, a2),
    pointToSegmentDist(b2, a1, a2)
  );
}
