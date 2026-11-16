import { PcbCopperPour, PcbProject } from '../../core/types';
import { pointToSegmentDist } from '../../core/geometry';
import { WorldPad } from '../drc';

/** Clears small disconnected copper islands via BFS unless anchored to a matching pad, via, or trace. */
export function removeIsolatedPourIslands(
  grid: Uint8Array,
  cols: number,
  rows: number,
  dx: number,
  dy: number,
  bounds: { minX: number; minY: number },
  pour: PcbCopperPour,
  pcb: PcbProject,
  thermalPads: WorldPad[]
): void {
  const visited = new Uint8Array(cols * rows);
  const matchingVias = pcb.vias.filter((v) => v.netName === pour.netName);
  const matchingTraces = pcb.traces.filter((t) => t.layer === pour.layer && t.netName === pour.netName);

  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== 1 || visited[i]) continue;
    const comp: number[] = [];
    const queue = [i];
    visited[i] = 1;
    let connectedToNet = false;

    while (queue.length > 0) {
      const cur = queue.pop()!;
      comp.push(cur);
      const r = Math.floor(cur / cols);
      const c = cur % cols;
      const px = bounds.minX + (c + 0.5) * dx;
      const py = bounds.minY + (r + 0.5) * dy;
      if (
        thermalPads.some((tp) => Math.hypot(px - tp.x, py - tp.y) <= tp.radius + pour.thermalGap + dx) ||
        matchingVias.some((v) => Math.hypot(px - v.x, py - v.y) <= v.outerDiameter * 0.5 + dx) ||
        matchingTraces.some((tr) =>
          tr.points.some((pt, k) => k > 0 && pointToSegmentDist({ x: px, y: py }, tr.points[k - 1], pt) <= tr.width * 0.5 + dx)
        )
      ) {
        connectedToNet = true;
      }
      const neighbors = [
        r > 0 ? (r - 1) * cols + c : -1,
        r + 1 < rows ? (r + 1) * cols + c : -1,
        c > 0 ? r * cols + (c - 1) : -1,
        c + 1 < cols ? r * cols + (c + 1) : -1
      ];
      for (const nb of neighbors) {
        if (nb >= 0 && grid[nb] === 1 && !visited[nb]) {
          visited[nb] = 1;
          queue.push(nb);
        }
      }
    }

    if (!connectedToNet) {
      for (const cell of comp) grid[cell] = 0;
    }
  }
}
