/**
 * High-precision microstrip characteristic and differential impedance calculations
 * conforming to Hammerstad & Jensen (1980), Wheeler (1977), and IPC-2141 / Wadell standards.
 */

const SPEED_OF_LIGHT_MM_NS = 299.792458; // mm/ns

/** Inputs for microstrip characteristic and differential impedance calculation. */
export interface MicrostripInput {
  traceWidthMm: number;
  copperThicknessMm: number;
  dielectricHeightMm: number;
  er: number; // FR-4 ~ 4.4, Rogers ~ 3.66, Ceramic ~ 9.8
  diffGapMm?: number;
}

/** Single-ended impedance, differential impedance, delay, and transmission line parameters. */
export interface MicrostripResult {
  z0SingleOhm: number;
  zDiffOhm: number;
  propDelayPsPerMm: number;
  erEff: number;
  phaseVelocityKmPerS: number;
  phaseVelocityPercentC: number;
  inductanceNhPerMm: number;
  capacitancePfPerMm: number;
}

/** Computes single-ended and differential microstrip impedance per Hammerstad-Jensen / IPC-2141. */
export function calcMicrostripImpedance(inp: MicrostripInput): MicrostripResult {
  const w = Math.max(0.01, Number.isFinite(inp.traceWidthMm) ? inp.traceWidthMm : 0.35);
  const t = Math.max(0.001, Number.isFinite(inp.copperThicknessMm) ? inp.copperThicknessMm : 0.035);
  const h = Math.max(0.01, Number.isFinite(inp.dielectricHeightMm) ? inp.dielectricHeightMm : 0.2);
  const er = Math.max(1.0, Number.isFinite(inp.er) ? inp.er : 4.4);

  // Hammerstad & Jensen (1980) copper strip thickness correction:
  const uRaw = w / h;
  const deltaW = (t / Math.PI) * (1 + Math.log(uRaw >= 0.5 / Math.PI ? (2 * h) / t : Math.max(1.01, (4 * Math.PI * w) / t)));
  const weff = w + deltaW;
  const u = weff / h;

  // Characteristic impedance of air-filled line Z_01 (Hammerstad-Jensen)
  const z01 = u <= 1
    ? 60 * Math.log(8 / u + 0.25 * u)
    : 376.991118 / (u + 1.393 + 0.667 * Math.log(u + 1.444));

  // Effective relative dielectric constant erEff (Hammerstad-Jensen)
  const f_u = u <= 1
    ? Math.pow(1 + 12 / u, -0.5) + 0.04 * Math.pow(1 - u, 2)
    : Math.pow(1 + 12 / u, -0.5);
  const erEff = (er + 1) / 2 + ((er - 1) / 2) * f_u;

  // Single-ended characteristic impedance Z_0
  const z0 = z01 / Math.sqrt(erEff);

  // Differential impedance per IPC-2141 / Wadell:
  // Z_diff = 2 * Z0 * (1 - 0.48 * exp(-0.96 * s / h))
  const s = Math.max(0.01, Number.isFinite(inp.diffGapMm ?? NaN) ? inp.diffGapMm! : w);
  const zDiff = 2 * z0 * (1 - 0.48 * Math.exp(-0.96 * (s / h)));

  // Propagation delay t_pd (ps/mm)
  const propDelayPsPerMm = (Math.sqrt(erEff) / SPEED_OF_LIGHT_MM_NS) * 1000;

  // Phase velocity: km/s and % of speed of light
  const phaseVelocityKmPerS = (SPEED_OF_LIGHT_MM_NS * 1000) / Math.sqrt(erEff);
  const phaseVelocityPercentC = 100 / Math.sqrt(erEff);

  // Per-unit-length inductance (nH/mm) and capacitance (pF/mm):
  const inductanceNhPerMm = (z0 * propDelayPsPerMm) / 1000;
  const capacitancePfPerMm = propDelayPsPerMm / z0;

  return {
    z0SingleOhm: Number(z0.toFixed(2)),
    zDiffOhm: Number(zDiff.toFixed(2)),
    propDelayPsPerMm: Number(propDelayPsPerMm.toFixed(2)),
    erEff: Number(erEff.toFixed(3)),
    phaseVelocityKmPerS: Number(phaseVelocityKmPerS.toFixed(1)),
    phaseVelocityPercentC: Number(phaseVelocityPercentC.toFixed(1)),
    inductanceNhPerMm: Number(inductanceNhPerMm.toFixed(3)),
    capacitancePfPerMm: Number(capacitancePfPerMm.toFixed(3))
  };
}

/**
 * Synthesizes required trace width W (mm) to achieve target single-ended characteristic impedance Z0.
 * Uses high-precision binary search with Hammerstad-Jensen equations.
 */
export function calcMicrostripWidthForZ0(
  targetZ0Ohm: number,
  dielectricHeightMm: number,
  er: number = 4.4,
  copperThicknessMm: number = 0.035
): number {
  const target = Math.max(5, Math.min(250, Number.isFinite(targetZ0Ohm) ? targetZ0Ohm : 50));
  const h = Math.max(0.01, Number.isFinite(dielectricHeightMm) ? dielectricHeightMm : 0.2);
  const eps = Math.max(1.0, Number.isFinite(er) ? er : 4.4);
  const t = Math.max(0.001, Number.isFinite(copperThicknessMm) ? copperThicknessMm : 0.035);

  let low = 0.01;
  let high = h * 50; // up to u = 50
  for (let iter = 0; iter < 40; iter++) {
    const mid = (low + high) / 2;
    const res = calcMicrostripImpedance({
      traceWidthMm: mid,
      copperThicknessMm: t,
      dielectricHeightMm: h,
      er: eps
    });
    if (res.z0SingleOhm > target) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return Number(((low + high) / 2).toFixed(3));
}
