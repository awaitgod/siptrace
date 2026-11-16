import { PcbKeepoutZone, PcbPlacedComponent } from '../../core/types';
import { pointInPolygon, polygonBounds } from '../../core/geometry';

function rotatedExtent(comp: PcbPlacedComponent): { w: number; h: number } {
  const rad = ((comp.angle || 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const cw = comp.courtyard?.width || 4;
  const ch = comp.courtyard?.height || 4;
  return { w: cw * c + ch * s, h: cw * s + ch * c };
}

function clampToBounds(
  comp: PcbPlacedComponent,
  ext: { w: number; h: number },
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number }
): void {
  const halfW = ext.w * 0.5;
  const halfH = ext.h * 0.5;
  const minX = Math.min((bounds.xMin + bounds.xMax) * 0.5, bounds.xMin + halfW);
  const maxX = Math.max(minX, bounds.xMax - halfW);
  const minY = Math.min((bounds.yMin + bounds.yMax) * 0.5, bounds.yMin + halfH);
  const maxY = Math.max(minY, bounds.yMax - halfH);
  comp.x = Math.max(minX, Math.min(maxX, comp.x));
  comp.y = Math.max(minY, Math.min(maxY, comp.y));
}

function isPlaceKeepoutConflict(comp: PcbPlacedComponent, ko: PcbKeepoutZone): boolean {
  if (ko.kind !== 'PlaceKeepout' || ko.points.length < 3) return false;
  if (ko.layer === 'AllCopper') return true;
  if (comp.side === 'Top' && ko.layer === 'TopCopper') return true;
  if (comp.side === 'Bottom' && ko.layer === 'BottomCopper') return true;
  return false;
}

/** Resolves hard courtyard overlaps and PlaceKeepout violations deterministically. */
export function resolvePlacementOverlaps(
  components: PcbPlacedComponent[],
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  keepouts: PcbKeepoutZone[] = [],
  marginMm = 1.5,
  passes = 24
): void {
  const n = components.length;
  const placeKeepouts = keepouts
    .filter((k) => k.kind === 'PlaceKeepout' && k.points.length >= 3)
    .map((k) => ({ ko: k, kb: polygonBounds(k.points) }));

  for (let pass = 0; pass < passes; pass++) {
    let moved = false;

    for (let i = 0; i < n; i++) {
      const a = components[i];
      const ea = rotatedExtent(a);

      // Repel out of PlaceKeepout zones
      if (!a.locked) {
        for (const { ko, kb } of placeKeepouts) {
          if (!isPlaceKeepoutConflict(a, ko)) continue;
          const reqX = ea.w * 0.5 + 0.5;
          const reqY = ea.h * 0.5 + 0.5;
          const inBbox =
            a.x + reqX > kb.minX &&
            a.x - reqX < kb.maxX &&
            a.y + reqY > kb.minY &&
            a.y - reqY < kb.maxY;
          if (!inBbox) continue;
          if (pointInPolygon({ x: a.x, y: a.y }, ko.points) || inBbox) {
            const leftDist = Math.abs(a.x - (kb.minX - reqX));
            const rightDist = Math.abs(kb.maxX + reqX - a.x);
            const topDist = Math.abs(a.y - (kb.minY - reqY));
            const botDist = Math.abs(kb.maxY + reqY - a.y);
            const minD = Math.min(leftDist, rightDist, topDist, botDist);
            if (minD === leftDist) a.x = kb.minX - reqX;
            else if (minD === rightDist) a.x = kb.maxX + reqX;
            else if (minD === topDist) a.y = kb.minY - reqY;
            else a.y = kb.maxY + reqY;
            clampToBounds(a, ea, bounds);
            moved = true;
          }
        }
      }

      for (let j = i + 1; j < n; j++) {
        const b = components[j];
        if (a.side !== b.side) continue;
        const eb = rotatedExtent(b);
        const minDx = ea.w * 0.5 + eb.w * 0.5 + marginMm;
        const minDy = ea.h * 0.5 + eb.h * 0.5 + marginMm;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const ox = minDx - Math.abs(dx);
        const oy = minDy - Math.abs(dy);
        if (ox > 1e-4 && oy > 1e-4) {
          if (a.locked && b.locked) continue;
          const shareA = b.locked ? 1 : a.locked ? 0 : 0.5;
          const shareB = 1 - shareA;
          if (ox <= oy) {
            const dir = dx >= 0 ? 1 : -1;
            a.x -= dir * ox * shareA;
            b.x += dir * ox * shareB;
          } else {
            const dir = dy >= 0 ? 1 : -1;
            a.y -= dir * oy * shareA;
            b.y += dir * oy * shareB;
          }
          if (!a.locked) clampToBounds(a, ea, bounds);
          if (!b.locked) clampToBounds(b, eb, bounds);
          moved = true;
        }
      }
    }

    if (!moved) break;
  }
}

/** Runs iterative spring attraction and courtyard repulsion forces over unlocked components. */
export function relaxPlacementForces(
  components: PcbPlacedComponent[],
  netToComps: Map<string, number[]>,
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  iterations = 60,
  keepouts: PcbKeepoutZone[] = []
): void {
  const n = components.length;
  for (let it = 0; it < iterations; it++) {
    const fx = new Float64Array(n);
    const fy = new Float64Array(n);

    // Attraction along shared signal nets
    for (const compIdxs of netToComps.values()) {
      for (let i = 0; i < compIdxs.length; i++) {
        for (let j = i + 1; j < compIdxs.length; j++) {
          const a = components[compIdxs[i]];
          const b = components[compIdxs[j]];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          fx[compIdxs[i]] += dx * 0.08;
          fy[compIdxs[i]] += dy * 0.08;
          fx[compIdxs[j]] -= dx * 0.08;
          fy[compIdxs[j]] -= dy * 0.08;
        }
      }
    }

    // Repulsion between component courtyards on the same side (accounting for angle)
    for (let i = 0; i < n; i++) {
      const ea = rotatedExtent(components[i]);
      for (let j = i + 1; j < n; j++) {
        const a = components[i];
        const b = components[j];
        if (a.side !== b.side) continue;
        const eb = rotatedExtent(b);
        const minDx = (ea.w + eb.w) * 0.5 + 1.5;
        const minDy = (ea.h + eb.h) * 0.5 + 1.5;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const ox = minDx - Math.abs(dx);
        const oy = minDy - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          if (ox < oy) {
            const push = (dx >= 0 ? -1 : 1) * ox * 0.45;
            fx[i] += push;
            fx[j] -= push;
          } else {
            const push = (dy >= 0 ? -1 : 1) * oy * 0.45;
            fy[i] += push;
            fy[j] -= push;
          }
        }
      }
    }

    const stepLimit = 4.0 * (1 - it / iterations) + 0.5;
    for (let i = 0; i < n; i++) {
      const comp = components[i];
      if (comp.locked) continue;
      const ext = rotatedExtent(comp);
      const dx = Math.max(-stepLimit, Math.min(stepLimit, fx[i]));
      const dy = Math.max(-stepLimit, Math.min(stepLimit, fy[i]));
      comp.x += dx;
      comp.y += dy;
      clampToBounds(comp, ext, bounds);
    }
  }

  resolvePlacementOverlaps(components, bounds, keepouts, 1.5, 24);
}
