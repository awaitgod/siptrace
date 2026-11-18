import { PcbProject, Point2D } from '../../../../core/types';
import { dist, pointToSegmentDist } from '../../../../core/geometry';
import { WorldPad } from '../../../../engines/drc';
import { RoutingAngleMode } from '../types';

/**
 * Computes intermediate and end points for manual routing based on angle mode (45°, 90°, Free, or Arc smoothing) and elbow flip.
 */
export function computeRouteDraftPoints(
  last: Point2D,
  cur: Point2D,
  mode: RoutingAngleMode,
  elbowFlip: boolean
): Point2D[] {
  if (mode === 'free') {
    return [cur];
  }

  const dx = cur.x - last.x;
  const dy = cur.y - last.y;

  if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) {
    return [cur];
  }

  if (mode === '90') {
    const midPt: Point2D = elbowFlip
      ? { x: last.x, y: cur.y }
      : { x: cur.x, y: last.y };

    if (dist(midPt, last) > 0.05 && dist(midPt, cur) > 0.05) {
      return [midPt, cur];
    }
    return [cur];
  }

  if (mode === 'arc') {
    const r = Math.min(Math.abs(dx), Math.abs(dy));
    if (r < 0.2) {
      return [cur];
    }
    const signX = Math.sign(dx);
    const signY = Math.sign(dy);
    const steps = 5;
    const arcPts: Point2D[] = [];

    if (!elbowFlip) {
      // First leg horizontal, arc into vertical
      const centerX = cur.x - signX * r;
      const centerY = last.y + signY * r;
      const startX = cur.x - signX * r;
      const startY = last.y;
      if (dist(last, { x: startX, y: startY }) > 0.05) {
        arcPts.push({ x: Math.round(startX * 1000) / 1000, y: Math.round(startY * 1000) / 1000 });
      }
      for (let k = 1; k <= steps; k++) {
        const theta = (k / steps) * (Math.PI / 2);
        arcPts.push({
          x: Math.round((centerX + signX * r * Math.sin(theta)) * 1000) / 1000,
          y: Math.round((centerY - signY * r * Math.cos(theta)) * 1000) / 1000
        });
      }
    } else {
      // First leg vertical, arc into horizontal
      const centerX = last.x + signX * r;
      const centerY = cur.y - signY * r;
      const startX = last.x;
      const startY = cur.y - signY * r;
      if (dist(last, { x: startX, y: startY }) > 0.05) {
        arcPts.push({ x: Math.round(startX * 1000) / 1000, y: Math.round(startY * 1000) / 1000 });
      }
      for (let k = 1; k <= steps; k++) {
        const theta = (k / steps) * (Math.PI / 2);
        arcPts.push({
          x: Math.round((centerX - signX * r * Math.cos(theta)) * 1000) / 1000,
          y: Math.round((centerY + signY * r * Math.sin(theta)) * 1000) / 1000
        });
      }
    }

    const lastArcPt = arcPts[arcPts.length - 1];
    if (dist(lastArcPt, cur) > 0.05) {
      arcPts.push(cur);
    }
    return arcPts;
  }

  // 45-degree routing
  const minD = Math.min(Math.abs(dx), Math.abs(dy));
  const midPt: Point2D = elbowFlip
    ? { x: last.x + Math.sign(dx) * minD, y: last.y + Math.sign(dy) * minD }
    : { x: cur.x - Math.sign(dx) * minD, y: cur.y - Math.sign(dy) * minD };

  if (dist(midPt, last) > 0.05 && dist(midPt, cur) > 0.05) {
    return [midPt, cur];
  }
  return [cur];
}

/**
 * Smooths sharp corners of a trace polyline with circular arc fillets.
 */
export function smoothTraceWithArcs(points: Point2D[], maxRadius = 1.0): Point2D[] {
  if (points.length < 3) return points.map((p) => ({ ...p }));
  const result: Point2D[] = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const pPrev = points[i - 1];
    const pCur = points[i];
    const pNext = points[i + 1];

    const d1 = dist(pPrev, pCur);
    const d2 = dist(pCur, pNext);
    const tLen = Math.min(d1 * 0.45, d2 * 0.45, maxRadius);

    if (tLen < 0.1) {
      result.push(pCur);
      continue;
    }

    // Direction vectors pointing away from pCur
    const v1 = { x: (pPrev.x - pCur.x) / d1, y: (pPrev.y - pCur.y) / d1 };
    const v2 = { x: (pNext.x - pCur.x) / d2, y: (pNext.y - pCur.y) / d2 };

    const t1 = { x: pCur.x + v1.x * tLen, y: pCur.y + v1.y * tLen };
    const t2 = { x: pCur.x + v2.x * tLen, y: pCur.y + v2.y * tLen };

    // Intermediate fillet arc points (quadratic Bezier through control point pCur)
    result.push(t1);
    const steps = 4;
    for (let k = 1; k < steps; k++) {
      const u = k / steps;
      const inv = 1 - u;
      result.push({
        x: Math.round((inv * inv * t1.x + 2 * inv * u * pCur.x + u * u * t2.x) * 1000) / 1000,
        y: Math.round((inv * inv * t1.y + 2 * inv * u * pCur.y + u * u * t2.y) * 1000) / 1000
      });
    }
    result.push(t2);
  }

  result.push(points[points.length - 1]);
  return result;
}

/**
 * Checks for obstacle collisions (pads/vias/keepouts of different nets) along the candidate segment
 * and provides a walkaround detour point if needed.
 */
export function computeWalkaroundDetour(
  p1: Point2D,
  p2: Point2D,
  routeNetName: string,
  layer: string,
  pcb: PcbProject,
  worldPads: WorldPad[]
): Point2D | null {
  const clearance = Math.max(0.3, pcb.designRules.clearanceTraceToPad);

  for (const wp of worldPads) {
    if (wp.netName && wp.netName === routeNetName) continue;
    if (wp.effectiveLayer !== 'All' && wp.effectiveLayer !== layer) continue;
    const padR = wp.radius + clearance;
    const d = pointToSegmentDist(wp, p1, p2);
    if (d < padR) {
      // Collision detected with foreign pad: deflect around pad
      const segDx = p2.x - p1.x;
      const segDy = p2.y - p1.y;
      const segLen = Math.hypot(segDx, segDy) || 1;
      const nx = -segDy / segLen;
      const ny = segDx / segLen;
      // Choose side of normal away from pad
      const toPadX = wp.x - p1.x;
      const toPadY = wp.y - p1.y;
      const side = toPadX * nx + toPadY * ny > 0 ? -1 : 1;
      return {
        x: wp.x + nx * padR * 1.15 * side,
        y: wp.y + ny * padR * 1.15 * side
      };
    }
  }

  return null;
}
