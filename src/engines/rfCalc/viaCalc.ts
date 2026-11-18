/**
 * High-Speed PCB Via Parasitics Calculator (IPC-2141 / Howard Johnson High-Speed Digital Design)
 */

export interface ViaInput {
  holeDiameterMm: number;     // Drill diameter d (typically 0.3 - 0.5 mm)
  padDiameterMm: number;      // Via annular pad diameter D (typically 0.6 - 0.8 mm)
  antipadDiameterMm: number;  // Clearance antipad diameter Da (typically 1.0 - 1.2 mm)
  boardThicknessMm: number;   // Board thickness / via barrel height h (typically 1.6 mm)
  er: number;                 // Substrate relative permittivity (e.g. 4.4 for FR-4)
  platingThicknessUm?: number;// Copper plating thickness inside barrel (typically 20 - 25 um)
}

export interface ViaMetrics {
  inductanceNh: number;
  capacitancePf: number;
  impedanceZ0Ohm: number;
  delayPs: number;
  dcResistanceMilliOhm: number;
  stepDegradationPs: number;  // 10-90% rise time degradation ~ 2.2 * C * Z0 / 2
}

export function calcViaMetrics(input: ViaInput): ViaMetrics {
  const d = Math.max(0.05, input.holeDiameterMm);
  const D = Math.max(d + 0.05, input.padDiameterMm);
  const Da = Math.max(D + 0.05, input.antipadDiameterMm);
  const h = Math.max(0.1, input.boardThicknessMm);
  const er = Math.max(1, input.er);
  const platingUm = input.platingThicknessUm ?? 25;
  const tMm = platingUm * 1e-3;

  // 1. Parasitic Inductance: L ≈ 0.2 * h * (ln(4*h / d) + 1) [nH]
  // Formula from Howard Johnson "High Speed Digital Design: A Handbook of Black Magic"
  const ratio = (4 * h) / d;
  const inductanceNh = Math.max(0.01, 0.2 * h * (Math.log(ratio) + 1));

  // 2. Parasitic Capacitance: C ≈ (0.0555 * er * h * D) / (Da - D) [pF]
  const clearance = Math.max(0.01, Da - D);
  const capacitancePf = Math.max(0.005, (0.0555 * er * h * D) / clearance);

  // 3. Characteristic Impedance: Z0 = sqrt(L / C)
  // L in nH, C in pF -> sqrt(L*1e-9 / (C*1e-12)) = sqrt(L/C * 1000)
  const impedanceZ0Ohm = Math.sqrt((inductanceNh * 1e-9) / (capacitancePf * 1e-12));

  // 4. Propagation Delay: td = sqrt(L * C) in picoseconds
  const delayPs = Math.sqrt(inductanceNh * capacitancePf) * Math.sqrt(1000);

  // 5. Rise Time Degradation: tr_deg ≈ 2.2 * C * (Z0 / 2) -> with Z0=50 Ohm
  const stepDegradationPs = 2.2 * capacitancePf * 25; // 25 Ohm parallel impedance

  // 6. DC Resistance: R = rho * h / Area_barrel
  // Barrel cross-section: ring area = pi * (d*t + t^2)
  // rho copper at 20°C = 1.724e-8 Ohm*m = 1.724e-5 Ohm*mm
  const ringAreaMm2 = Math.PI * (d * tMm + tMm * tMm);
  const rhoMm = 1.724e-5; // Ohm * mm
  const rOhm = (rhoMm * h) / ringAreaMm2;
  const dcResistanceMilliOhm = rOhm * 1000;

  return {
    inductanceNh: Number(inductanceNh.toFixed(3)),
    capacitancePf: Number(capacitancePf.toFixed(3)),
    impedanceZ0Ohm: Number(impedanceZ0Ohm.toFixed(1)),
    delayPs: Number(delayPs.toFixed(2)),
    dcResistanceMilliOhm: Number(dcResistanceMilliOhm.toFixed(2)),
    stepDegradationPs: Number(stepDegradationPs.toFixed(1))
  };
}
