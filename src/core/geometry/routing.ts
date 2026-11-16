import { Point2D } from '../models';
import { dist } from './vector2d';

/**
 * Total Euclidean length of a polyline.
 */
export function polylineLength(pts: Point2D[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += dist(pts[i - 1], pts[i]);
  }
  return len;
}

/**
 * Computes the midpoint elbow for 45-degree / orthogonal PCB or wire routing.
 */
export function build45RouteMidpoint(start: Point2D, end: Point2D, elbowFlip = false): Point2D {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const minD = Math.min(Math.abs(dx), Math.abs(dy));
  return elbowFlip
    ? { x: start.x + Math.sign(dx) * minD, y: start.y + Math.sign(dy) * minD }
    : { x: end.x - Math.sign(dx) * minD, y: end.y - Math.sign(dy) * minD };
}
