import { pointInPolygon, polygonBounds, segmentToSegmentDist } from '../../core/geometry';
import type { Point2D } from '../../core/types';

export interface CopperRegion { outer: Point2D[]; holes: Point2D[][] }

export function inCopperRegion(point: Point2D, region: CopperRegion): boolean {
  return pointInPolygon(point, region.outer) && !(region.holes ?? []).some(hole => pointInPolygon(point, hole));
}

export function copperEdges(region: CopperRegion): [Point2D, Point2D][] {
  return [region.outer, ...(region.holes ?? [])].flatMap(ring =>
    ring.map((point, i): [Point2D, Point2D] => [point, ring[(i + 1) % ring.length]]));
}

export function segmentToCopper(a: Point2D, b: Point2D, region: CopperRegion): number {
  if (inCopperRegion(a, region) || inCopperRegion(b, region)) return 0;
  let distance = Infinity;
  for (const [start, end] of copperEdges(region)) {
    distance = Math.min(distance, segmentToSegmentDist(a, b, start, end));
  }
  return distance;
}

export function copperRegionDistance(a: CopperRegion, b: CopperRegion, limit: number): number {
  const x = polygonBounds(a.outer), y = polygonBounds(b.outer);
  if (x.maxX + limit < y.minX || y.maxX + limit < x.minX ||
      x.maxY + limit < y.minY || y.maxY + limit < x.minY) return Infinity;
  if (b.outer.some(point => inCopperRegion(point, a))) return 0;
  let distance = Infinity;
  for (const [start, end] of copperEdges(a)) distance = Math.min(distance, segmentToCopper(start, end, b));
  return distance;
}
