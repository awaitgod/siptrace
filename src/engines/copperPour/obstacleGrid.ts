import { PcbCopperPour, PcbProject, Point2D } from '../../core/types';
import { dist, pointInPolygon, pointToSegmentDist } from '../../core/geometry';
import { WorldPad, getWorldPads } from '../drc';
import { isBlockedByThermalRelief, isPointNearAntiPad } from './thermalRelief';

export interface PourOccupancyResult {
  grid: Uint8Array;
  cols: number;
  rows: number;
  dx: number;
  dy: number;
  thermalPads: WorldPad[];
}

/** Rasterizes copper pour outline minus cutouts, keepouts, traces, vias, holes, anti-pads, and thermal reliefs. */
export function buildPourOccupancyGrid(
  pour: PcbCopperPour,
  pcb: PcbProject,
  effectiveOutline: Point2D[],
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
): PourOccupancyResult {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const targetStep = Math.max(0.15, Math.min(0.45, Math.max(w, h) / 300));
  const cols = Math.max(12, Math.min(360, Math.ceil(w / targetStep)));
  const rows = Math.max(12, Math.min(360, Math.ceil(h / targetStep)));
  const dx = w / cols;
  const dy = h / rows;

  const grid = new Uint8Array(cols * rows);
  const pads = getWorldPads(pcb).filter(
    (wp) => wp.effectiveLayer === 'All' || wp.effectiveLayer === pour.layer
  );
  const traces = pcb.traces.filter((t) => t.layer === pour.layer && t.netName !== pour.netName);
  const vias = pcb.vias.filter((v) => v.netName !== pour.netName);

  const isolateHoles = pour.isolateMountingHoles ?? true;
  const holeClearance = pour.mountingHoleClearance ?? Math.max(pour.clearance, 0.5);
  const mountingHoles = pads.filter((wp) => wp.pad.type === 'MountingHole');
  const copperPads = pads.filter((wp) => wp.pad.type !== 'MountingHole');
  const thermalPads = copperPads.filter((wp) => wp.netName && wp.netName === pour.netName);
  const antiPads = copperPads.filter((wp) => wp.netName !== pour.netName);
  const keepouts = pcb.keepouts.filter(
    (k) =>
      (k.kind === 'PourKeepout' || k.kind === 'RouteKeepout') &&
      (k.layer === 'AllCopper' || k.layer === pour.layer)
  );

  for (let r = 0; r < rows; r++) {
    const py = bounds.minY + (r + 0.5) * dy;
    for (let c = 0; c < cols; c++) {
      const px = bounds.minX + (c + 0.5) * dx;
      const pt = { x: px, y: py };

      if (!pointInPolygon(pt, effectiveOutline)) continue;
      if (pcb.cutouts.some((cut) => pointInPolygon(pt, cut.points))) continue;
      if (keepouts.some((ko) => pointInPolygon(pt, ko.points))) continue;

      let blocked = false;
      for (const tr of traces) {
        const reqDist = tr.width * 0.5 + pour.clearance;
        for (let k = 1; k < tr.points.length; k++) {
          if (pointToSegmentDist(pt, tr.points[k - 1], tr.points[k]) < reqDist) {
            blocked = true;
            break;
          }
        }
        if (blocked) break;
      }
      if (blocked) continue;

      for (const v of vias) {
        if (dist(pt, v) < v.outerDiameter * 0.5 + pour.clearance) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      if (isolateHoles) {
        for (const mh of mountingHoles) {
          const holeR = Math.max(mh.pad.holeDiameter ?? mh.pad.width, mh.pad.width) * 0.5 + holeClearance;
          if (dist(pt, mh) < holeR) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) continue;

      for (const ap of antiPads) {
        if (isPointNearAntiPad(px, py, ap, pour.clearance)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      if (isBlockedByThermalRelief(px, py, pour, thermalPads)) continue;

      grid[r * cols + c] = 1;
    }
  }

  return { grid, cols, rows, dx, dy, thermalPads };
}
