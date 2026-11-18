/**
 * Trace current capacity, thermal heating, voltage drop, and resistance calculations
 * conforming to IPC-2152, IPC-2221, and GOST 23751-86.
 */

/** Inputs for IPC-2152 / IPC-2221 / GOST 23751 trace current capacity calculation. */
export interface TraceCurrentInput {
  currentAmps: number;
  tempRiseC: number;
  copperThicknessUm: number; // 18, 35, 70, 105 мкм
  isExternalLayer: boolean;
  traceLengthMm?: number; // default 100 mm
}

/** Calculated trace cross-section, width, resistance, and voltage drop. */
export interface TraceCurrentResult {
  crossSectionMm2: number;
  requiredWidthMm: number;
  requiredWidthMil: number;
  resistanceOhmPer100mm: number;
  voltageDropMvPer100mm: number;
  powerDissipationWPer100mm: number;
  currentDensityAPerMm2: number;
  gostMaxRecommendedCurrentAPerMm2: number;
  gostCompliant: boolean;
}

/** Inputs for reverse calculation: maximum current by known trace width. */
export interface MaxCurrentInput {
  traceWidthMm: number;
  tempRiseC: number;
  copperThicknessUm: number;
  isExternalLayer: boolean;
}

/** Computes minimum copper trace width and thermal metrics per IPC-2152 / IPC-2221 / GOST 23751-86. */
export function calcTraceWidthByCurrent(inp: TraceCurrentInput): TraceCurrentResult {
  const currentAmps = Math.max(0.001, Number.isFinite(inp.currentAmps) ? inp.currentAmps : 1.0);
  const tempRiseC = Math.max(0.5, Number.isFinite(inp.tempRiseC) ? inp.tempRiseC : 10);
  const copperThicknessUm = Math.max(5, Number.isFinite(inp.copperThicknessUm) ? inp.copperThicknessUm : 35);
  const lengthMm = Math.max(1, Number.isFinite(inp.traceLengthMm ?? NaN) ? inp.traceLengthMm! : 100);

  // IPC-2221 / IPC-2152 formula: I = k * (deltaT^b) * (A^c)
  // A_mil2 = (I / (k * deltaT^b))^(1/c)
  const k = inp.isExternalLayer ? 0.048 : 0.024;
  const b = 0.44;
  const c = 0.725;
  const areaMil2 = Math.pow(currentAmps / (k * Math.pow(tempRiseC, b)), 1 / c);
  const crossSectionMm2 = areaMil2 * 0.00064516;
  const thicknessMm = copperThicknessUm / 1000;
  const widthMm = crossSectionMm2 / Math.max(0.005, thicknessMm);
  const widthMil = widthMm * 39.3700787;

  // Temperature-corrected copper resistivity:
  // rho(T) = rho20 * (1 + alpha * (T - 20)), where ambient is 25 C
  const tempC = 25 + tempRiseC;
  const rhoMm = 1.72e-5 * (1 + 0.00393 * (tempC - 20));

  const resistance = (rhoMm * lengthMm) / Math.max(1e-6, crossSectionMm2);
  const voltageDropMv = resistance * currentAmps * 1000;
  const powerDissipationW = Math.pow(currentAmps, 2) * resistance;
  const currentDensityAPerMm2 = currentAmps / Math.max(1e-6, crossSectionMm2);

  // GOST 23751-86 recommended current density limits (A/mm2)
  const gostMaxRecommendedCurrentAPerMm2 = inp.isExternalLayer ? 30 : 15;
  const gostCompliant = currentDensityAPerMm2 <= (inp.isExternalLayer ? 35 : 20);

  return {
    crossSectionMm2: Number(crossSectionMm2.toFixed(5)),
    requiredWidthMm: Number(widthMm.toFixed(3)),
    requiredWidthMil: Number(widthMil.toFixed(1)),
    resistanceOhmPer100mm: Number(resistance.toFixed(4)),
    voltageDropMvPer100mm: Number(voltageDropMv.toFixed(2)),
    powerDissipationWPer100mm: Number(powerDissipationW.toFixed(3)),
    currentDensityAPerMm2: Number(currentDensityAPerMm2.toFixed(1)),
    gostMaxRecommendedCurrentAPerMm2,
    gostCompliant
  };
}

/** Computes maximum safe continuous current for a given trace width per IPC-2152 / IPC-2221. */
export function calcMaxCurrentByTraceWidth(inp: MaxCurrentInput): number {
  const widthMm = Math.max(0.01, Number.isFinite(inp.traceWidthMm) ? inp.traceWidthMm : 0.25);
  const tempRiseC = Math.max(0.5, Number.isFinite(inp.tempRiseC) ? inp.tempRiseC : 10);
  const copperThicknessUm = Math.max(5, Number.isFinite(inp.copperThicknessUm) ? inp.copperThicknessUm : 35);

  const k = inp.isExternalLayer ? 0.048 : 0.024;
  const b = 0.44;
  const c = 0.725;

  const crossSectionMm2 = widthMm * (copperThicknessUm / 1000);
  const areaMil2 = crossSectionMm2 / 0.00064516;
  const maxCurrent = k * Math.pow(tempRiseC, b) * Math.pow(areaMil2, c);
  return Number(maxCurrent.toFixed(2));
}
