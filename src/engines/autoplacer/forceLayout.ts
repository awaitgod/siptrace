import { PcbPlacedComponent } from '../../core/types';

function rotatedExtent(comp: PcbPlacedComponent): { w: number; h: number } {
  const rad = ((comp.angle || 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const cw = comp.courtyard?.width || 4;
  const ch = comp.courtyard?.height || 4;
  return { w: cw * c + ch * s, h: cw * s + ch * c };
}

/** Runs iterative spring attraction and courtyard repulsion forces over unlocked components. */
export function relaxPlacementForces(
  components: PcbPlacedComponent[],
  netToComps: Map<string, number[]>,
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  iterations = 60
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
        const minDx = (ea.w + eb.w) * 0.55 + 2.5;
        const minDy = (ea.h + eb.h) * 0.55 + 2.5;
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
      const minX = bounds.xMin + ext.w * 0.25;
      const maxX = Math.max(minX, bounds.xMax - ext.w * 0.25);
      const minY = bounds.yMin + ext.h * 0.25;
      const maxY = Math.max(minY, bounds.yMax - ext.h * 0.25);
      comp.x = Math.max(minX, Math.min(maxX, comp.x + dx));
      comp.y = Math.max(minY, Math.min(maxY, comp.y + dy));
    }
  }
}
