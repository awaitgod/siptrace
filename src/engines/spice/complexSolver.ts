export interface Complex {
  re: number;
  im: number;
}

/** Solves a dense complex linear system A * x = b via Gaussian elimination with partial pivoting.
 * Includes diagonal regularization to prevent singularity or NaN.
 */
export function solveComplexSystem(A: Complex[][], b: Complex[]): Complex[] {
  const n = b.length;
  if (n === 0) return [];
  const M = A.map((row, i) => [...row.map((z) => ({ ...z })), { ...b[i] }]);
  const abs2 = (z: Complex) => z.re * z.re + z.im * z.im;
  const divC = (a: Complex, d: Complex): Complex => {
    const den = Math.max(1e-24, abs2(d));
    return { re: (a.re * d.re + a.im * d.im) / den, im: (a.im * d.re - a.re * d.im) / den };
  };
  const mulC = (a: Complex, b2: Complex): Complex => ({
    re: a.re * b2.re - a.im * b2.im,
    im: a.re * b2.im + a.im * b2.re
  });

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (abs2(M[r][col]) > abs2(M[pivot][col])) pivot = r;
    }
    // Swap rows first
    if (pivot !== col) {
      const tmp = M[col];
      M[col] = M[pivot];
      M[pivot] = tmp;
    }

    // Regularize singular diagonal
    if (abs2(M[col][col]) < 1e-18) {
      M[col][col].re = M[col][col].re < 0 ? -1e-8 : 1e-8;
    }

    const diag = M[col][col];
    for (let j = col; j <= n; j++) {
      M[col][j] = divC(M[col][j], diag);
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (abs2(f) < 1e-24) continue;
      for (let j = col; j <= n; j++) {
        const prod = mulC(f, M[col][j]);
        M[r][j] = { re: M[r][j].re - prod.re, im: M[r][j].im - prod.im };
      }
    }
  }
  return M.map((r) => r[n]);
}
