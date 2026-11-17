import { pointInPolygon, segmentToSegmentDist } from '../core/geometry';
import type { PcbProject, Point2D } from '../core/types';

export const COPPER_EPSILON = 1e-4;

export function segmentToPolygonEdge(a: Point2D, b: Point2D, points: Point2D[]): number {
  let distance = Infinity;
  for (let i = 0; i < points.length; i++) {
    distance = Math.min(distance, segmentToSegmentDist(a, b, points[i], points[(i + 1) % points.length]));
  }
  return distance;
}

export function segmentToPolygon(a: Point2D, b: Point2D, points: Point2D[]): number {
  if (pointInPolygon(a, points) || pointInPolygon(b, points)) return 0;
  return segmentToPolygonEdge(a, b, points);
}

export function fitsBoardMaterial(
  pcb: Pick<PcbProject, 'boardOutline' | 'cutouts'>, a: Point2D, b: Point2D, margin: number
): boolean {
  const { boardOutline, cutouts } = pcb;
  if (boardOutline.length >= 3 &&
    (!pointInPolygon(a, boardOutline) || !pointInPolygon(b, boardOutline) ||
      segmentToPolygonEdge(a, b, boardOutline) + COPPER_EPSILON < margin)) return false;
  return !(cutouts ?? []).some(cutout => cutout.points.length >= 3 &&
    segmentToPolygon(a, b, cutout.points) < Math.max(COPPER_EPSILON, margin - COPPER_EPSILON));
}
