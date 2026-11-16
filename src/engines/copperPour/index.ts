import { PcbCopperPour, PcbProject } from '../../core/types';
import { polygonArea, polygonBounds } from '../../core/geometry';
import { removeIsolatedPourIslands } from './islandRemover';
import { buildPourOccupancyGrid } from './obstacleGrid';
import { insetPolygonByEdgeNormals } from './polygonInset';
import { mergePourGridToIslands } from './spanMerger';

/** Computes obstacle-subtracted copper pour islands with thermal relief spoke cutouts and island pruning. */
export function updateCopperPour(
  pour: PcbCopperPour,
  pcb: PcbProject,
  higherPriorityPours?: PcbCopperPour[]
): PcbCopperPour {
  let effectiveOutline = pour.outline;
  if (pour.dependOnBoardOutline && pcb.boardOutline.length >= 3) {
    effectiveOutline = insetPolygonByEdgeNormals(pcb.boardOutline, pour.boardClearance);
  }
  if (effectiveOutline.length < 3) {
    return {
      ...pour,
      poured: false,
      unpouredReason: 'Контур полигона содержит менее 3 вершин или вырожден отступом от края платы.',
      computedIslands: []
    };
  }

  const bounds = polygonBounds(effectiveOutline);
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  if (w <= 0.2 || h <= 0.2) {
    return {
      ...pour,
      poured: false,
      unpouredReason: 'Ширина или высота полигона меньше 0.2 мм после вычета отступа от контура.',
      computedIslands: []
    };
  }

  const priorPours =
    higherPriorityPours ??
    pcb.copperPours.filter(
      (other) =>
        other.id !== pour.id &&
        other.poured &&
        other.layer === pour.layer &&
        other.netName !== pour.netName &&
        other.priority <= pour.priority
    );

  const { grid, cols, rows, dx, dy, thermalPads } = buildPourOccupancyGrid(
    pour,
    pcb,
    effectiveOutline,
    bounds,
    priorPours
  );

  if (pour.removeIslands) {
    removeIsolatedPourIslands(grid, cols, rows, dx, dy, bounds, pour, pcb, thermalPads);
  }

  const islands = mergePourGridToIslands(grid, cols, rows, dx, dy, bounds);

  return {
    ...pour,
    outline: effectiveOutline,
    poured: islands.length > 0,
    unpouredReason:
      islands.length === 0
        ? 'Медь не залита: область перекрыта зазорами трасс/КП, зонами запрета Keepout или удалены все изолированные островки.'
        : undefined,
    computedIslands: islands
  };
}

/** Rebuilds all PCB copper pours sorted by priority, subtracting higher-priority pours first. */
export function updateAllCopperPours(pcb: PcbProject): PcbProject {
  const sorted = [...pcb.copperPours].sort((a, b) => a.priority - b.priority);
  const updated: PcbCopperPour[] = [];
  for (const p of sorted) {
    updated.push(updateCopperPour(p, pcb, updated));
  }
  return { ...pcb, copperPours: updated };
}

/** Computes total poured copper area across all computed islands in mm². */
export function copperPourTotalAreaMm2(pour: PcbCopperPour): number {
  if (!pour.computedIslands) return 0;
  return pour.computedIslands.reduce((sum, isl) => sum + polygonArea(isl.outer), 0);
}
