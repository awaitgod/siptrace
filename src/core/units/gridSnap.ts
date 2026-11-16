/**
 * Snaps a scalar value to the nearest grid step.
 */
export function snapToGrid(val: number, gridMm: number): number {
  if (gridMm <= 0) return val;
  return Math.round(val / gridMm) * gridMm;
}

/**
 * Snaps 2D coordinates or a point object to the nearest grid step.
 */
export function snapPoint(x: number, y: number, gridMm: number): { x: number; y: number };
export function snapPoint(pt: { x: number; y: number }, gridMm: number): { x: number; y: number };
export function snapPoint(
  xOrPt: number | { x: number; y: number },
  yOrGrid: number,
  gridMm?: number
): { x: number; y: number } {
  if (typeof xOrPt === 'number') {
    const g = gridMm ?? yOrGrid;
    return { x: snapToGrid(xOrPt, g), y: snapToGrid(yOrGrid, g) };
  }
  return { x: snapToGrid(xOrPt.x, yOrGrid), y: snapToGrid(xOrPt.y, yOrGrid) };
}
