import { Point2D } from '../models';
import { pointToSegmentDist } from './segment';

/**
 * Ray-casting point-in-polygon test.
 */
export function pointInPolygon(pt: Point2D, poly: Point2D[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-18) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Unsigned area of a 2D polygon via the shoelace formula.
 */
export function polygonArea(poly: Point2D[]): number {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(area) * 0.5;
}

/**
 * Axis-aligned bounding box of polygon vertices.
 */
export function polygonBounds(poly: Point2D[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Ramer-Douglas-Peucker polyline/polygon simplification.
 */
export function simplifyPolygonRdp(poly: Point2D[], epsilon = 0.05): Point2D[] {
  if (poly.length <= 4) return poly;
  let maxD = 0;
  let maxIdx = 0;
  const first = poly[0];
  const last = poly[poly.length - 1];
  for (let i = 1; i < poly.length - 1; i++) {
    const d = pointToSegmentDist(poly[i], first, last);
    if (d > maxD) {
      maxD = d;
      maxIdx = i;
    }
  }
  if (maxD > epsilon) {
    const left = simplifyPolygonRdp(poly.slice(0, maxIdx + 1), epsilon);
    const right = simplifyPolygonRdp(poly.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}
