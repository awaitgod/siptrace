/**
 * NE555 / ICM7555 / КР1006ВИ1 Precision Timer Calculator
 * Astable (Free-running Multivibrator) & Monostable (One-Shot Pulse) Modes
 */

export interface Timer555AstableResult {
  tHighSec: number;
  tLowSec: number;
  periodSec: number;
  frequencyHz: number;
  dutyCyclePercent: number;
  formattedPeriod: string;
  formattedFreq: string;
}

export interface Timer555MonostableResult {
  pulseWidthSec: number;
  formattedPulse: string;
}

export function formatTimeSec(seconds: number): string {
  if (seconds <= 0 || !Number.isFinite(seconds)) return '—';
  if (seconds < 1e-6) return `${Number((seconds * 1e9).toFixed(2))} нс`;
  if (seconds < 1e-3) return `${Number((seconds * 1e6).toFixed(2))} мкс`;
  if (seconds < 1) return `${Number((seconds * 1e3).toFixed(2))} мс`;
  if (seconds < 60) return `${Number(seconds.toFixed(3))} с`;
  const mins = Math.floor(seconds / 60);
  const remSec = (seconds % 60).toFixed(1);
  return `${mins} мин ${remSec} с`;
}

export function formatFrequencyHz(hz: number): string {
  if (hz <= 0 || !Number.isFinite(hz)) return '—';
  if (hz < 1) return `${Number(hz.toFixed(3))} Гц`;
  if (hz < 1000) return `${Number(hz.toFixed(2))} Гц`;
  if (hz < 1e6) return `${Number((hz / 1e3).toFixed(3))} кГц`;
  return `${Number((hz / 1e6).toFixed(3))} МГц`;
}

export function calc555Astable(r1Ohm: number, r2Ohm: number, cFarads: number): Timer555AstableResult {
  const r1 = Math.max(1, r1Ohm);
  const r2 = Math.max(1, r2Ohm);
  const c = Math.max(1e-12, cFarads);

  const ln2 = Math.LN2; // ~0.693147
  const tHighSec = ln2 * (r1 + r2) * c;
  const tLowSec = ln2 * r2 * c;
  const periodSec = tHighSec + tLowSec;
  const frequencyHz = 1 / periodSec;
  const dutyCyclePercent = (tHighSec / periodSec) * 100;

  return {
    tHighSec,
    tLowSec,
    periodSec,
    frequencyHz,
    dutyCyclePercent: Number(dutyCyclePercent.toFixed(2)),
    formattedPeriod: formatTimeSec(periodSec),
    formattedFreq: formatFrequencyHz(frequencyHz)
  };
}

export function calc555Monostable(rOhm: number, cFarads: number): Timer555MonostableResult {
  const r = Math.max(1, rOhm);
  const c = Math.max(1e-12, cFarads);

  // t = ln(3) * R * C ≈ 1.09861 * R * C
  const pulseWidthSec = Math.log(3) * r * c;

  return {
    pulseWidthSec,
    formattedPulse: formatTimeSec(pulseWidthSec)
  };
}

export function synthesize555Astable(targetFreqHz: number, targetDutyPercent: number = 55): {
  r1Ohm: number;
  r2Ohm: number;
  cFarads: number;
  actualFreqHz: number;
  actualDutyPercent: number;
} {
  const f = Math.max(0.1, targetFreqHz);
  const duty = Math.min(99, Math.max(50.1, targetDutyPercent)) / 100;

  // Let's choose a reasonable C standard value based on frequency
  let cFarads = 100e-9; // 100 nF default
  if (f > 100e3) cFarads = 100e-12; // 100 pF
  else if (f > 10e3) cFarads = 1e-9; // 1 nF
  else if (f > 1e3) cFarads = 10e-9; // 10 nF
  else if (f < 1) cFarads = 10e-6; // 10 uF

  // From equations:
  // Duty D = (R1 + R2) / (R1 + 2*R2) => R1 = R2 * (2*D - 1) / (1 - D)
  // f = 1.44 / ((R1 + 2*R2) * C) => (R1 + 2*R2) = 1.44 / (f * C)
  // Let TotalSum = R1 + 2*R2 = 1.44 / (f * C)
  const totalSum = 1.44 / (f * cFarads);
  // (R1 + R2) / TotalSum = D => R1 + R2 = D * TotalSum
  // R2 = TotalSum - (R1 + R2) = TotalSum * (1 - D)
  const r2 = totalSum * (1 - duty);
  const r1 = totalSum * (2 * duty - 1);

  const actual = calc555Astable(r1, r2, cFarads);
  return {
    r1Ohm: Math.round(r1),
    r2Ohm: Math.round(r2),
    cFarads,
    actualFreqHz: Number(actual.frequencyHz.toFixed(2)),
    actualDutyPercent: actual.dutyCyclePercent
  };
}
