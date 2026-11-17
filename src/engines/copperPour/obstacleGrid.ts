import { PcbCopperPour, PcbProject, Point2D } from '../../core/types';
import { dist, pointInPolygon, pointToSegmentDist, polygonBounds } from '../../core/geometry';
import { WorldPad, getWorldPads, pointToPadDistance } from '../drc';
import { isBlockedByThermalRelief } from './thermalRelief';

import { fitsBoardMaterial, segmentToPolygon } from '../pcbMaterial';
import { segmentToCopper } from './region';

export interface PourOccupancyResult {
  grid: Uint8Array;
  cols: number;
  rows: number;
  dx: number;
  dy: number;
  thermalPads: WorldPad[];
}

/** Rasterizes copper pour outline minus cutouts, keepouts, traces, vias, holes, anti-pads, thermal reliefs, and higher-priority pours. */
export function buildPourOccupancyGrid(
  pour: PcbCopperPour,
  pcb: PcbProject,
  effectiveOutline: Point2D[],
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  higherPriorityPours: PcbCopperPour[] = []
): PourOccupancyResult {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const targetStep = Math.max(0.15, Math.min(0.45, Math.max(w, h) / 300));
  const cols = Math.max(12, Math.min(360, Math.ceil(w / targetStep)));
  const rows = Math.max(12, Math.min(360, Math.ceil(h / targetStep)));
  const dx = w / cols;
  const dy = h / rows;
  const gridStep = Math.max(dx, dy);
  // Every rounded output rectangle must clear obstacles, including its corners.
  const cellRadius = Math.hypot(dx, dy) / 2 + 0.001;
  const rules = pcb.designRules;
  const classClearances = new Map((pcb.netClasses ?? []).map(item => [item.id, item.clearance]));
  const clearanceFor = (net: string, base: number) => Math.max(pour.clearance, base,
    classClearances.get(pcb.netClassAssignments?.[net]) ?? 0,
    classClearances.get(pcb.netClassAssignments?.[pour.netName]) ?? 0) + cellRadius;
  const layerOrder = ['TopCopper', 'Inner1', 'Inner2', 'BottomCopper'];
  const layerIndex = layerOrder.indexOf(pour.layer);

  const grid = new Uint8Array(cols * rows);
  const pads = getWorldPads(pcb).filter(
    (wp) => wp.effectiveLayer === 'All' || wp.effectiveLayer === pour.layer
  );
  const traces = pcb.traces.filter((t) => t.layer === pour.layer && t.netName !== pour.netName);
  const vias = pcb.vias.filter((via) => {
    const [start, end] = [layerOrder.indexOf(via.startLayer), layerOrder.indexOf(via.endLayer)].sort((a, b) => a - b);
    return via.netName !== pour.netName && layerIndex >= start && layerIndex <= end;
  });

  const isolateHoles = pour.isolateMountingHoles ?? true;
  const holeClearance = pour.mountingHoleClearance ?? Math.max(pour.clearance, 0.5);
  const mountingHoles = pads.filter((wp) => wp.pad.type === 'MountingHole');
  const copperPads = pads.filter((wp) => wp.pad.type !== 'MountingHole');
  const thermalPads = copperPads.filter((wp) => wp.netName && wp.netName === pour.netName);
  const antiPads = copperPads.filter((wp) => wp.netName !== pour.netName);
  const traceClearances = traces.map(tr => tr.width / 2 + clearanceFor(tr.netName, rules.clearanceTraceToTrace));
  const viaClearances = vias.map(via => via.outerDiameter / 2 + clearanceFor(via.netName, rules.clearanceViaToAny));
  const padClearances = antiPads.map(pad => clearanceFor(pad.netName, rules.clearanceTraceToPad));
  const keepouts = pcb.keepouts.filter(
    (k) =>
      (k.kind === 'PourKeepout' || k.kind === 'RouteKeepout') &&
      (k.layer === 'AllCopper' || k.layer === pour.layer)
  );

  // Higher-priority pours on the same layer belonging to a different net block lower-priority pours
  const priorBlocks = higherPriorityPours
    .filter(
      (hp) =>
        hp.id !== pour.id &&
        hp.poured &&
        hp.layer === pour.layer &&
        hp.netName !== pour.netName &&
        hp.computedIslands &&
        hp.computedIslands.length > 0
    )
    .flatMap((hp) => {
      const reqDist = Math.max(clearanceFor(hp.netName, rules.clearanceTraceToTrace), hp.clearance + cellRadius);
      return (hp.computedIslands ?? []).map((isl) => {
        const bb = polygonBounds(isl.outer);
        return {
          isl,
          reqDist,
          minX: bb.minX - reqDist,
          maxX: bb.maxX + reqDist,
          minY: bb.minY - reqDist,
          maxY: bb.maxY + reqDist
        };
      });
    });

  for (let r = 0; r < rows; r++) {
    const py = bounds.minY + (r + 0.5) * dy;
    for (let c = 0; c < cols; c++) {
      const px = bounds.minX + (c + 0.5) * dx;
      const pt = { x: px, y: py };

      if (!pointInPolygon(pt, effectiveOutline)) continue;
      if (!fitsBoardMaterial(pcb, pt, pt, Math.max(pour.boardClearance, rules.clearanceCopperToBoard) + cellRadius)) continue;
      if (keepouts.some(ko => segmentToPolygon(pt, pt, ko.points) <= cellRadius)) continue;

      let blocked = false;
      for (const pb of priorBlocks) {
        if (px < pb.minX || px > pb.maxX || py < pb.minY || py > pb.maxY) continue;
        if (segmentToCopper(pt, pt, pb.isl) < pb.reqDist) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      for (const [index, tr] of traces.entries()) {
        const reqDist = traceClearances[index];
        for (let k = 1; k < tr.points.length; k++) {
          if (pointToSegmentDist(pt, tr.points[k - 1], tr.points[k]) < reqDist) {
            blocked = true;
            break;
          }
        }
        if (blocked) break;
      }
      if (blocked) continue;

      for (const [index, v] of vias.entries()) {
        if (dist(pt, v) < viaClearances[index]) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      if (isolateHoles) {
        for (const mh of mountingHoles) {
          const holeR = Math.max(mh.pad.holeDiameter ?? mh.pad.width, mh.pad.width) * 0.5 + holeClearance + cellRadius;
          if (dist(pt, mh) < holeR) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) continue;

      for (const [index, ap] of antiPads.entries()) {
        if (pointToPadDistance(pt, ap) < padClearances[index]) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      if (isBlockedByThermalRelief(px, py, pour, thermalPads, gridStep)) continue;

      grid[r * cols + c] = 1;
    }
  }

  return { grid, cols, rows, dx, dy, thermalPads };
}
