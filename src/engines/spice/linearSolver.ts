/** Solves a dense real linear system A * x = b via Gaussian elimination with partial pivoting.
 * Uses numerical regularization to prevent division-by-zero or NaN when encountering singular rows.
 */
export function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  if (n === 0) return [];
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    // Swap rows first
    if (pivot !== col) {
      const tmp = M[col];
      M[col] = M[pivot];
      M[pivot] = tmp;
    }

    // If diagonal element is singular or near-zero, regularize it on the pivot row
    if (Math.abs(M[col][col]) < 1e-12) {
      M[col][col] = M[col][col] < 0 ? -1e-9 : 1e-9;
    }

    const diag = M[col][col];
    for (let j = col; j <= n; j++) {
      M[col][j] /= diag;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (Math.abs(factor) < 1e-15) continue;
      for (let j = col; j <= n; j++) {
        M[r][j] -= factor * M[col][j];
      }
    }
  }

  const result = M.map((r) => r[n]);
  if (result.some((v) => !Number.isFinite(v))) {
    return null;
  }
  return result;
}
