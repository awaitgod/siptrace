/** Inputs for microstrip characteristic and differential impedance calculation. */
export interface MicrostripInput {
  traceWidthMm: number;
  copperThicknessMm: number;
  dielectricHeightMm: number;
  er: number; // FR-4 ~ 4.4
  diffGapMm?: number;
}

/** Single-ended impedance, differential impedance, and propagation delay results. */
export interface MicrostripResult {
  z0SingleOhm: number;
  zDiffOhm: number;
  propDelayPsPerMm: number;
}

/** Computes single-ended and differential microstrip impedance per Hammerstad / IPC-2141. */
export function calcMicrostripImpedance(inp: MicrostripInput): MicrostripResult {
  const w = Math.max(0.05, Number.isFinite(inp.traceWidthMm) ? inp.traceWidthMm : 0.25);
  const t = Math.max(0.005, Number.isFinite(inp.copperThicknessMm) ? inp.copperThicknessMm : 0.035);
  const h = Math.max(0.05, Number.isFinite(inp.dielectricHeightMm) ? inp.dielectricHeightMm : 0.2);
  const er = Math.max(1.0, Number.isFinite(inp.er) ? inp.er : 4.4);

  const weff = w + (t / Math.PI) * (1 + Math.log(Math.max(1.01, (2 * h) / t)));
  const logArg = Math.max(1.05, (5.98 * h) / (0.8 * w + t));
  const z0 = (87 / Math.sqrt(er + 1.41)) * Math.log(logArg);
  const s = Math.max(0.05, Number.isFinite(inp.diffGapMm ?? NaN) ? inp.diffGapMm! : w);
  const zDiff = 2 * z0 * (1 - 0.48 * Math.exp(-0.96 * (s / h)));
  const erEff = (er + 1) / 2 + ((er - 1) / 2) / Math.sqrt(1 + (12 * h) / weff);
  const propDelayPsPerMm = (Math.sqrt(erEff) / 299.792458) * 1000;

  return {
    z0SingleOhm: Number(z0.toFixed(2)),
    zDiffOhm: Number(zDiff.toFixed(2)),
    propDelayPsPerMm: Number(propDelayPsPerMm.toFixed(2))
  };
}
