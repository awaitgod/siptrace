import { Point2D } from '../../core/types';

/** Merges adjacent horizontal and vertical occupied cells into minimal rectangular copper islands. */
export function mergePourGridToIslands(
  grid: Uint8Array,
  cols: number,
  rows: number,
  dx: number,
  dy: number,
  bounds: { minX: number; minY: number }
): { outer: Point2D[]; holes: Point2D[][] }[] {
  interface Span {
    startC: number;
    endC: number;
    r0: number;
    r1: number;
  }

  let activeSpans = new Map<string, Span>();
  const finishedSpans: Span[] = [];

  for (let r = 0; r < rows; r++) {
    const nextActive = new Map<string, Span>();
    let c = 0;
    while (c < cols) {
      if (grid[r * cols + c] === 0) {
        c++;
        continue;
      }
      const startC = c;
      while (c < cols && grid[r * cols + c] === 1) c++;
      const key = `${startC}:${c}`;
      const prev = activeSpans.get(key);
      if (prev) {
        prev.r1 = r + 1;
        nextActive.set(key, prev);
        activeSpans.delete(key);
      } else {
        nextActive.set(key, { startC, endC: c, r0: r, r1: r + 1 });
      }
    }
    for (const s of activeSpans.values()) finishedSpans.push(s);
    activeSpans = nextActive;
  }
  for (const s of activeSpans.values()) finishedSpans.push(s);

  return finishedSpans.map((sp) => {
    const x1 = Number((bounds.minX + sp.startC * dx).toFixed(3));
    const x2 = Number((bounds.minX + sp.endC * dx).toFixed(3));
    const y1 = Number((bounds.minY + sp.r0 * dy).toFixed(3));
    const y2 = Number((bounds.minY + sp.r1 * dy).toFixed(3));
    return {
      outer: [
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
        { x: x1, y: y2 }
      ],
      holes: []
    };
  });
}
