import { Point2D } from '../models';

/**
 * Euclidean distance between two 2D points.
 */
export function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Squared Euclidean distance between two 2D points.
 */
export function distSq(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

/**
 * Applies flip and rotation around an origin to a local 2D point.
 */
export function transformPoint(
  px: number,
  py: number,
  ox: number,
  oy: number,
  angleDeg: number,
  flipX = false,
  flipY = false
): Point2D {
  const x = flipX ? -px : px;
  const y = flipY ? -py : py;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: ox + x * cos - y * sin,
    y: oy + x * sin + y * cos
  };
}
