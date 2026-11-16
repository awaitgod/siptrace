/** Inputs for IPC-2221 / GOST trace current capacity calculation. */
export interface TraceCurrentInput {
  currentAmps: number;
  tempRiseC: number;
  copperThicknessUm: number; // 18, 35, 70, 105 мкм
  isExternalLayer: boolean;
}

/** Calculated trace cross-section, width, resistance, and voltage drop. */
export interface TraceCurrentResult {
  crossSectionMm2: number;
  requiredWidthMm: number;
  resistanceOhmPer100mm: number;
  voltageDropMvPer100mm: number;
}

/** Computes minimum copper trace width and voltage drop per IPC-2221 / GOST 23751-86. */
export function calcTraceWidthByCurrent(inp: TraceCurrentInput): TraceCurrentResult {
  const currentAmps = Math.max(0.01, Number.isFinite(inp.currentAmps) ? inp.currentAmps : 0.01);
  const tempRiseC = Math.max(0.5, Number.isFinite(inp.tempRiseC) ? inp.tempRiseC : 10);
  const copperThicknessUm = Math.max(5, Number.isFinite(inp.copperThicknessUm) ? inp.copperThicknessUm : 35);
  const k = inp.isExternalLayer ? 0.048 : 0.024;
  const b = 0.44;
  const c = 0.725;
  const areaMil2 = Math.pow(currentAmps / (k * Math.pow(tempRiseC, b)), 1 / c);
  const crossSectionMm2 = areaMil2 * 0.00064516;
  const thicknessMm = copperThicknessUm / 1000;
  const widthMm = crossSectionMm2 / Math.max(0.005, thicknessMm);
  // Copper resistivity ~ 1.72e-5 Ohm*mm
  const resistancePer100mm = (1.72e-5 * 100) / Math.max(1e-5, crossSectionMm2);
  const voltageDropMvPer100mm = resistancePer100mm * currentAmps * 1000;

  return {
    crossSectionMm2: Number(crossSectionMm2.toFixed(5)),
    requiredWidthMm: Number(widthMm.toFixed(3)),
    resistanceOhmPer100mm: Number(resistancePer100mm.toFixed(4)),
    voltageDropMvPer100mm: Number(voltageDropMvPer100mm.toFixed(2))
  };
}
