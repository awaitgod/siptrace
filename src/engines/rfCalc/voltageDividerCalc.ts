/**
 * Precision Resistive Voltage Divider Calculator & Standard E-Series Synthesizer
 */

export interface VoltageDividerResult {
  vout: number;
  ratio: number;
  dividerCurrentMa: number;
  powerR1Mw: number;
  powerR2Mw: number;
  totalPowerMw: number;
  theveninResistanceOhm: number;
  loadCurrentMa?: number;
}

export interface DividerPairRecommendation {
  r1Ohm: number;
  r2Ohm: number;
  vout: number;
  errorPercent: number;
  dividerCurrentMa: number;
}

// Standard decade values for E24 series (5% tolerance)
const E24_BASE = [
  1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0,
  3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1
];

// Generate decade values across 10 Ohm to 1 MOhm
function generateE24List(): number[] {
  const list: number[] = [];
  for (let exp = 1; exp <= 6; exp++) {
    const mult = Math.pow(10, exp);
    for (const base of E24_BASE) {
      list.push(Math.round(base * mult));
    }
  }
  return list;
}

const E24_VALUES = generateE24List();

export function calcVoltageDivider(
  vin: number,
  r1Ohm: number,
  r2Ohm: number,
  rLoadOhm?: number
): VoltageDividerResult {
  const vInSafe = Number.isFinite(vin) ? vin : 0;
  const r1 = Math.max(0.001, r1Ohm);
  const r2 = Math.max(0.001, r2Ohm);

  let r2Eff = r2;
  let loadCurrentMa = 0;

  if (rLoadOhm !== undefined && rLoadOhm > 0) {
    r2Eff = (r2 * rLoadOhm) / (r2 + rLoadOhm);
  }

  const vout = vInSafe * (r2Eff / (r1 + r2Eff));
  const ratio = vInSafe !== 0 ? vout / vInSafe : 0;

  const totalCurrentA = vInSafe / (r1 + r2Eff);
  const dividerCurrentMa = totalCurrentA * 1000;

  const powerR1Watts = Math.pow(vInSafe - vout, 2) / r1;
  const powerR2Watts = Math.pow(vout, 2) / r2;
  const totalPowerMw = (powerR1Watts + powerR2Watts) * 1000;

  if (rLoadOhm !== undefined && rLoadOhm > 0) {
    loadCurrentMa = (vout / rLoadOhm) * 1000;
  }

  // Thevenin equivalent resistance Rth = R1 || R2
  const theveninResistanceOhm = (r1 * r2) / (r1 + r2);

  return {
    vout: Number(vout.toFixed(4)),
    ratio: Number(ratio.toFixed(4)),
    dividerCurrentMa: Number(dividerCurrentMa.toFixed(3)),
    powerR1Mw: Number((powerR1Watts * 1000).toFixed(3)),
    powerR2Mw: Number((powerR2Watts * 1000).toFixed(3)),
    totalPowerMw: Number(totalPowerMw.toFixed(3)),
    theveninResistanceOhm: Number(theveninResistanceOhm.toFixed(2)),
    loadCurrentMa: rLoadOhm ? Number(loadCurrentMa.toFixed(3)) : undefined
  };
}

export function synthesizeDividerPairs(
  vin: number,
  targetVout: number,
  targetCurrentMa: number = 1.0,
  maxResults: number = 4
): DividerPairRecommendation[] {
  if (vin <= 0 || targetVout <= 0 || targetVout >= vin) return [];

  const targetRatio = targetVout / vin;
  const targetRtotal = (vin / (targetCurrentMa * 1e-3));

  const candidates: { r1: number; r2: number; vout: number; err: number; curMa: number }[] = [];

  for (const r1 of E24_VALUES) {
    // Ideal R2 = R1 * targetRatio / (1 - targetRatio)
    const idealR2 = (r1 * targetRatio) / (1 - targetRatio);
    // Find closest standard E24
    let bestR2 = E24_VALUES[0];
    let bestDiff = Math.abs(bestR2 - idealR2);
    for (const val of E24_VALUES) {
      const diff = Math.abs(val - idealR2);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestR2 = val;
      }
    }

    const calc = calcVoltageDivider(vin, r1, bestR2);
    const err = Math.abs((calc.vout - targetVout) / targetVout) * 100;

    // Weight difference from target current
    const currentWeight = Math.abs(Math.log10(calc.dividerCurrentMa / targetCurrentMa));
    const score = err + currentWeight * 2;

    candidates.push({
      r1,
      r2: bestR2,
      vout: calc.vout,
      err,
      curMa: calc.dividerCurrentMa,
      score
    } as any);
  }

  // Sort candidates by lowest error and closest current
  candidates.sort((a: any, b: any) => a.score - b.score);

  const seen = new Set<string>();
  const results: DividerPairRecommendation[] = [];

  for (const c of candidates) {
    const key = `${c.r1}-${c.r2}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({
        r1Ohm: c.r1,
        r2Ohm: c.r2,
        vout: c.vout,
        errorPercent: Number(c.err.toFixed(2)),
        dividerCurrentMa: c.curMa
      });
      if (results.length >= maxResults) break;
    }
  }

  return results;
}
