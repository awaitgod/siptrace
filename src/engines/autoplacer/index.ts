import { PcbProject } from '../../core/types';
import { polygonBounds } from '../../core/geometry';
import { snapToGrid } from '../../core/units';
import { buildNetAdjacency } from './netAdjacency';
import { relaxPlacementForces, resolvePlacementOverlaps } from './forceLayout';

/** Force-directed + overlap-resolving Autoplacer constrained inside the board outline. */
export function runAutoplacer(pcb: PcbProject): PcbProject {
  const next = structuredClone(pcb);
  if (next.components.length === 0) return next;

  const poly =
    next.boardOutline.length >= 3
      ? polygonBounds(next.boardOutline)
      : { minX: 0, minY: 0, maxX: 100, maxY: 70 };

  const padMargin = 8;
  const bounds = {
    xMin: poly.minX + padMargin,
    xMax: poly.maxX - padMargin,
    yMin: poly.minY + padMargin,
    yMax: poly.maxY - padMargin
  };

  const netToComps = buildNetAdjacency(next.components);

  // Initial spread to unstack coincident components
  const n = next.components.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * ((bounds.xMax - bounds.xMin) / Math.max(10, bounds.yMax - bounds.yMin)))));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cellW = (bounds.xMax - bounds.xMin) / cols;
  const cellH = (bounds.yMax - bounds.yMin) / rows;

  next.components.forEach((comp, i) => {
    if (comp.locked) return;
    const c = i % cols;
    const r = Math.floor(i / cols);
    comp.x = bounds.xMin + (c + 0.5) * cellW;
    comp.y = bounds.yMin + (r + 0.5) * cellH;
  });

  relaxPlacementForces(next.components, netToComps, bounds, 60, next.keepouts);

  // Final grid snap, then re-enforce overlap separation in case snapping merged nearby components
  const grid = Math.max(0.5, next.gridSize || 1.25);
  for (const comp of next.components) {
    if (comp.locked) continue;
    comp.x = snapToGrid(comp.x, grid);
    comp.y = snapToGrid(comp.y, grid);
  }
  resolvePlacementOverlaps(next.components, bounds, next.keepouts, 1.5, 24);

  return next;
}
