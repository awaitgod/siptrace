import { describe, it, expect } from 'vitest';
import {
  calcMicrostripImpedance,
  calcMicrostripWidthForZ0
} from '../../src/engines/rfCalc/microstripCalc';
import {
  calcTraceWidthByCurrent,
  calcMaxCurrentByTraceWidth
} from '../../src/engines/rfCalc/traceCurrentCalc';
import {
  decodeSmdResistor,
  encodeSmdResistor
} from '../../src/engines/rfCalc/smdResistorCalc';
import {
  decodeCapacitor
} from '../../src/engines/rfCalc/capacitorCalc';
import {
  calcViaMetrics
} from '../../src/engines/rfCalc/viaCalc';
import {
  calc555Astable,
  calc555Monostable,
  synthesize555Astable
} from '../../src/engines/rfCalc/timer555Calc';
import {
  calcVoltageDivider,
  synthesizeDividerPairs
} from '../../src/engines/rfCalc/voltageDividerCalc';
import {
  convertLength,
  convertCopper,
  convertTemperature
} from '../../src/engines/rfCalc/unitConverterCalc';
import {
  generateParametricPattern
} from '../../src/engines/patternGenerator';

describe('Engineering Utilities & Calculators Enterprise Test Suite', () => {
  describe('1. RF Microstrip Calculator (Hammerstad-Jensen & IPC-2141)', () => {
    it('accurately calculates standard 50 Ohm microstrip on FR-4', () => {
      const res = calcMicrostripImpedance({
        traceWidthMm: 0.35,
        copperThicknessMm: 0.035,
        dielectricHeightMm: 0.2,
        er: 4.4,
        diffGapMm: 0.25
      });

      // Standard FR-4 (0.35 mm trace on 0.2 mm prepreg) is ~50 Ohm (+/- 2 Ohm)
      expect(res.z0SingleOhm).toBeGreaterThanOrEqual(48);
      expect(res.z0SingleOhm).toBeLessThanOrEqual(52);
      expect(res.erEff).toBeGreaterThan(3.0);
      expect(res.erEff).toBeLessThan(4.0);
      expect(res.propDelayPsPerMm).toBeGreaterThan(5.5);
      expect(res.propDelayPsPerMm).toBeLessThan(6.8);
      expect(res.phaseVelocityPercentC).toBeGreaterThan(50);
      expect(res.phaseVelocityPercentC).toBeLessThan(60);
      expect(res.inductanceNhPerMm).toBeGreaterThan(0.2);
      expect(res.capacitancePfPerMm).toBeGreaterThan(0.08);
    });

    it('handles wide traces (w/h >> 1) smoothly without negative log or clamp collapse', () => {
      // 2 mm and 4 mm power/RF tracks on 0.2 mm dielectric
      const res2mm = calcMicrostripImpedance({
        traceWidthMm: 2.0,
        copperThicknessMm: 0.035,
        dielectricHeightMm: 0.2,
        er: 4.4
      });
      const res4mm = calcMicrostripImpedance({
        traceWidthMm: 4.0,
        copperThicknessMm: 0.035,
        dielectricHeightMm: 0.2,
        er: 4.4
      });

      expect(res2mm.z0SingleOhm).toBeGreaterThan(10);
      expect(res2mm.z0SingleOhm).toBeLessThan(20);
      expect(res4mm.z0SingleOhm).toBeGreaterThan(5);
      expect(res4mm.z0SingleOhm).toBeLessThan(res2mm.z0SingleOhm);
    });

    it('calculates differential impedance with correct asymptotic behavior as gap varies', () => {
      const closeGap = calcMicrostripImpedance({
        traceWidthMm: 0.35,
        copperThicknessMm: 0.035,
        dielectricHeightMm: 0.2,
        er: 4.4,
        diffGapMm: 0.1
      });
      const wideGap = calcMicrostripImpedance({
        traceWidthMm: 0.35,
        copperThicknessMm: 0.035,
        dielectricHeightMm: 0.2,
        er: 4.4,
        diffGapMm: 2.0
      });

      // Close gap has strong coupling -> lower differential impedance
      // Wide gap has negligible coupling -> Z_diff -> 2 * Z0
      expect(closeGap.zDiffOhm).toBeLessThan(wideGap.zDiffOhm);
      expect(wideGap.zDiffOhm).toBeCloseTo(2 * wideGap.z0SingleOhm, 0);
    });

    it('synthesizes trace width W for target impedance Z0 within 0.5% precision', () => {
      const target50 = 50;
      const w50 = calcMicrostripWidthForZ0(target50, 0.2, 4.4, 0.035);
      const verify50 = calcMicrostripImpedance({
        traceWidthMm: w50,
        copperThicknessMm: 0.035,
        dielectricHeightMm: 0.2,
        er: 4.4
      });
      expect(verify50.z0SingleOhm).toBeCloseTo(target50, 0);

      const target75 = 75;
      const w75 = calcMicrostripWidthForZ0(target75, 0.2, 4.4, 0.035);
      const verify75 = calcMicrostripImpedance({
        traceWidthMm: w75,
        copperThicknessMm: 0.035,
        dielectricHeightMm: 0.2,
        er: 4.4
      });
      expect(verify75.z0SingleOhm).toBeCloseTo(target75, 0);
      expect(w75).toBeLessThan(w50); // Higher impedance requires narrower trace
    });

    it('handles edge cases (zero, negative, NaN) gracefully with safe defaults', () => {
      const resNaN = calcMicrostripImpedance({
        traceWidthMm: NaN,
        copperThicknessMm: -0.5,
        dielectricHeightMm: 0,
        er: -4
      });
      expect(Number.isFinite(resNaN.z0SingleOhm)).toBe(true);
      expect(resNaN.z0SingleOhm).toBeGreaterThan(0);
    });
  });

  describe('2. Trace Current & Thermal Heating (IPC-2152 / IPC-2221 / GOST 23751)', () => {
    it('conforms to IPC-2152: internal layers require wider conductor than external', () => {
      const ext = calcTraceWidthByCurrent({
        currentAmps: 2.0,
        tempRiseC: 10,
        copperThicknessUm: 35,
        isExternalLayer: true
      });
      const inLayer = calcTraceWidthByCurrent({
        currentAmps: 2.0,
        tempRiseC: 10,
        copperThicknessUm: 35,
        isExternalLayer: false
      });

      // Internal conductor has restricted heat dissipation -> requires substantially wider trace
      expect(inLayer.requiredWidthMm).toBeGreaterThan(ext.requiredWidthMm * 1.5);
      expect(ext.requiredWidthMm).toBeGreaterThan(0.5);
      expect(ext.requiredWidthMil).toBeCloseTo(ext.requiredWidthMm * 39.37, 0);
    });

    it('accounts for copper foil thickness derating (18 um, 35 um, 70 um)', () => {
      const t18 = calcTraceWidthByCurrent({
        currentAmps: 3.0,
        tempRiseC: 20,
        copperThicknessUm: 18,
        isExternalLayer: true
      });
      const t35 = calcTraceWidthByCurrent({
        currentAmps: 3.0,
        tempRiseC: 20,
        copperThicknessUm: 35,
        isExternalLayer: true
      });
      const t70 = calcTraceWidthByCurrent({
        currentAmps: 3.0,
        tempRiseC: 20,
        copperThicknessUm: 70,
        isExternalLayer: true
      });

      // Twice the copper thickness roughly halves the required width
      expect(t18.requiredWidthMm).toBeGreaterThan(t35.requiredWidthMm);
      expect(t35.requiredWidthMm).toBeGreaterThan(t70.requiredWidthMm);
      expect(t18.crossSectionMm2).toBeCloseTo(t70.crossSectionMm2, 2);
    });

    it('calculates voltage drop, power dissipation, and current density with copper temp coefficient', () => {
      const res = calcTraceWidthByCurrent({
        currentAmps: 5.0,
        tempRiseC: 30,
        copperThicknessUm: 70,
        isExternalLayer: true,
        traceLengthMm: 150
      });

      expect(res.voltageDropMvPer100mm).toBeGreaterThan(0);
      expect(res.powerDissipationWPer100mm).toBeGreaterThan(0);
      expect(res.currentDensityAPerMm2).toBeGreaterThan(0);
      expect(res.resistanceOhmPer100mm).toBeGreaterThan(0);
    });

    it('calculates maximum safe continuous current for a given trace width', () => {
      const maxExt = calcMaxCurrentByTraceWidth({
        traceWidthMm: 1.0,
        tempRiseC: 10,
        copperThicknessUm: 35,
        isExternalLayer: true
      });
      const maxInt = calcMaxCurrentByTraceWidth({
        traceWidthMm: 1.0,
        tempRiseC: 10,
        copperThicknessUm: 35,
        isExternalLayer: false
      });

      expect(maxExt).toBeGreaterThan(2.0);
      expect(maxExt).toBeGreaterThan(maxInt);
    });
  });

  describe('3. Parametric Pattern Generator (IPC-7351 Standards)', () => {
    it('generates compliant SOIC patterns with density levels A, B, C', () => {
      const soicB = generateParametricPattern({
        family: 'SOIC',
        name: 'SOIC-8_TEST',
        pinCount: 8,
        pitch: 1.27,
        rowSpacing: 5.8,
        padWidth: 0.6,
        padHeight: 1.5,
        holeDiameter: 0,
        bodyWidth: 3.9,
        bodyLength: 4.9,
        bodyHeight: 1.75,
        densityLevel: 'B'
      });

      expect(soicB.pads.length).toBe(8);
      expect(soicB.pads[0].type).toBe('SMD');
      expect(soicB.pads[0].number).toBe('1');
      expect(soicB.pads[7].number).toBe('8');

      // Density A (Maximum material) has larger pads than Density C (Minimum material)
      const soicA = generateParametricPattern({
        family: 'SOIC',
        name: 'SOIC-8_A',
        pinCount: 8,
        pitch: 1.27,
        rowSpacing: 5.8,
        padWidth: 0.6,
        padHeight: 1.5,
        holeDiameter: 0,
        bodyWidth: 3.9,
        bodyLength: 4.9,
        bodyHeight: 1.75,
        densityLevel: 'A'
      });
      const soicC = generateParametricPattern({
        family: 'SOIC',
        name: 'SOIC-8_C',
        pinCount: 8,
        pitch: 1.27,
        rowSpacing: 5.8,
        padWidth: 0.6,
        padHeight: 1.5,
        holeDiameter: 0,
        bodyWidth: 3.9,
        bodyLength: 4.9,
        bodyHeight: 1.75,
        densityLevel: 'C'
      });

      expect(soicA.pads[0].width).toBeGreaterThan(soicB.pads[0].width);
      expect(soicB.pads[0].width).toBeGreaterThan(soicC.pads[0].width);
    });

    it('generates 4-sided QFP footprints with counter-clockwise pin numbering per ECAD standard', () => {
      const qfp32 = generateParametricPattern({
        family: 'QFP',
        name: 'TQFP-32_TEST',
        pinCount: 32,
        pitch: 0.8,
        rowSpacing: 9.0,
        padWidth: 0.5,
        padHeight: 1.4,
        holeDiameter: 0,
        bodyWidth: 7.0,
        bodyLength: 7.0,
        bodyHeight: 1.0,
        densityLevel: 'B'
      });

      expect(qfp32.pads.length).toBe(32);
      // Pin 1 is on the left side
      expect(qfp32.pads[0].x).toBeLessThan(0);
      // Pin 9 is on the bottom side
      expect(qfp32.pads[8].y).toBeGreaterThan(0);
      // Pin 17 is on the right side
      expect(qfp32.pads[16].x).toBeGreaterThan(0);
      // Pin 25 is on the top side
      expect(qfp32.pads[24].y).toBeLessThan(0);
    });

    it('generates QFN with exposed thermal pad (EP)', () => {
      const qfn = generateParametricPattern({
        family: 'QFN',
        name: 'QFN-32_EP',
        pinCount: 32,
        pitch: 0.5,
        rowSpacing: 5.0,
        padWidth: 0.28,
        padHeight: 0.8,
        holeDiameter: 0,
        bodyWidth: 5.0,
        bodyLength: 5.0,
        bodyHeight: 0.8,
        densityLevel: 'B',
        thermalPadSize: 3.4
      });

      expect(qfn.pads.length).toBe(33); // 32 perimeter leads + 1 thermal pad
      const ep = qfn.pads.find(p => p.id === 'pad_EP');
      expect(ep).toBeDefined();
      expect(ep?.width).toBe(3.4);
      expect(ep?.height).toBe(3.4);
      expect(ep?.x).toBe(0);
      expect(ep?.y).toBe(0);
    });

    it('generates Through-Hole DIP with non-zero hole drilling diameter and rectangular pin 1', () => {
      const dip14 = generateParametricPattern({
        family: 'DIP',
        name: 'DIP-14_TEST',
        pinCount: 14,
        pitch: 2.54,
        rowSpacing: 7.62,
        padWidth: 1.6,
        padHeight: 1.6,
        holeDiameter: 0.85,
        bodyWidth: 6.35,
        bodyLength: 19.0,
        bodyHeight: 3.3,
        densityLevel: 'B'
      });

      expect(dip14.pads.length).toBe(14);
      expect(dip14.pads[0].type).toBe('THT');
      expect(dip14.pads[0].shape).toBe('Rect'); // Pin 1 is Rectangular for polarity
      expect(dip14.pads[1].shape).toBe('Oval');
      expect(dip14.pads[0].holeDiameter).toBe(0.85);
      expect(dip14.pads[0].layer).toBe('All');
    });
  });

  describe('4. SMD Resistor Marking Code Decoder & Encoder (EIA-96 / 3-digit / 4-digit)', () => {
    it('decodes standard 3-digit and 4-digit SMD resistors correctly', () => {
      expect(decodeSmdResistor('103').resistanceOhm).toBe(10000);
      expect(decodeSmdResistor('472').resistanceOhm).toBe(4700);
      expect(decodeSmdResistor('1002').resistanceOhm).toBe(10000);
      expect(decodeSmdResistor('4701').resistanceOhm).toBe(4700);
      expect(decodeSmdResistor('4R7').resistanceOhm).toBe(4.7);
      expect(decodeSmdResistor('R22').resistanceOhm).toBe(0.22);
      expect(decodeSmdResistor('000').resistanceOhm).toBe(0);
    });

    it('decodes high-precision EIA-96 1% marking codes', () => {
      expect(decodeSmdResistor('01A').resistanceOhm).toBe(100);
      expect(decodeSmdResistor('01Y').resistanceOhm).toBe(1.0);
      expect(decodeSmdResistor('01X').resistanceOhm).toBe(10.0);
      expect(decodeSmdResistor('68A').resistanceOhm).toBe(499);
      expect(decodeSmdResistor('68X').resistanceOhm).toBe(49.9);
      expect(decodeSmdResistor('01C').resistanceOhm).toBe(10000);
    });

    it('encodes resistance values into SMD marking codes', () => {
      const enc10k = encodeSmdResistor(10000);
      expect(enc10k.code3Digit).toBe('103');
      expect(enc10k.code4Digit).toBe('1002');
      expect(enc10k.eia96).toBe('01C');

      const enc4r7 = encodeSmdResistor(4.7);
      expect(enc4r7.code3Digit).toBe('4R7');
    });
  });

  describe('5. Capacitor Marking Decoder & Reactance Calculator', () => {
    it('decodes 3-digit picofarad codes to pF, nF, uF', () => {
      const c104 = decodeCapacitor('104', 'K', '1H', 'X7R');
      expect(c104.capacitancePf).toBe(100000);
      expect(c104.capacitanceNf).toBe(100);
      expect(c104.capacitanceUf).toBe(0.1);
      expect(c104.tolerancePercent).toBe(10);
      expect(c104.voltageText).toContain('50 В');

      const c473 = decodeCapacitor('473');
      expect(c473.capacitanceNf).toBe(47);

      const c22 = decodeCapacitor('22');
      expect(c22.capacitancePf).toBe(22);

      const c4r7 = decodeCapacitor('4R7');
      expect(c4r7.capacitancePf).toBe(4.7);
    });

    it('computes capacitive reactance Xc at various test frequencies', () => {
      const c100nf = decodeCapacitor('104');
      // Xc = 1 / (2 * pi * 1000 * 100e-9) ≈ 1591.5 Ohm
      expect(c100nf.reactanceAt1kHz).toBeCloseTo(1591.55, 0);
      // At 1 MHz, Xc is 1000x smaller ≈ 1.59 Ohm
      expect(c100nf.reactanceAt1MHz).toBeCloseTo(1.59, 1);
    });
  });

  describe('6. High-Speed PCB Via Parasitics Calculator (IPC-2141)', () => {
    it('calculates realistic parasitic inductance and capacitance for standard 1.6mm board via', () => {
      const via = calcViaMetrics({
        holeDiameterMm: 0.3,
        padDiameterMm: 0.6,
        antipadDiameterMm: 1.0,
        boardThicknessMm: 1.6,
        er: 4.4,
        platingThicknessUm: 25
      });

      // Standard 0.3mm drill via through 1.6mm FR-4:
      // L ~ 1.0 to 1.5 nH, C ~ 0.2 to 0.6 pF, Z0 ~ 40 to 80 Ohm
      expect(via.inductanceNh).toBeGreaterThan(0.8);
      expect(via.inductanceNh).toBeLessThan(1.8);
      expect(via.capacitancePf).toBeGreaterThan(0.2);
      expect(via.capacitancePf).toBeLessThan(0.8);
      expect(via.impedanceZ0Ohm).toBeGreaterThan(30);
      expect(via.impedanceZ0Ohm).toBeLessThan(90);
      expect(via.dcResistanceMilliOhm).toBeGreaterThan(0.5);
      expect(via.dcResistanceMilliOhm).toBeLessThan(5.0);
    });
  });

  describe('7. Precision 555 Timer Calculator (Astable & Monostable)', () => {
    it('accurately calculates astable multivibrator frequency and duty cycle', () => {
      // R1 = 10k, R2 = 47k, C = 100nF
      const res = calc555Astable(10000, 47000, 100e-9);
      // f = 1.44 / ((10k + 2*47k) * 100nF) = 1.44 / (104000 * 1e-7) ≈ 138.46 Hz
      expect(res.frequencyHz).toBeCloseTo(138.46, 0);
      // Duty cycle = (10 + 47) / (10 + 94) = 57 / 104 ≈ 54.8%
      expect(res.dutyCyclePercent).toBeCloseTo(54.8, 0);
    });

    it('calculates monostable one-shot pulse width', () => {
      // R = 100k, C = 10uF => pulse ≈ 1.1 * 100k * 10uF = 1.1 s
      const mono = calc555Monostable(100000, 10e-6);
      expect(mono.pulseWidthSec).toBeCloseTo(1.1, 1);
    });

    it('synthesizes astable component values for a target frequency', () => {
      const syn = synthesize555Astable(1000, 60);
      expect(syn.actualFreqHz).toBeGreaterThan(800);
      expect(syn.actualFreqHz).toBeLessThan(1200);
      expect(syn.actualDutyPercent).toBeGreaterThan(55);
      expect(syn.actualDutyPercent).toBeLessThan(65);
    });
  });

  describe('8. Voltage Divider Calculator & E24 Resistor Synthesis', () => {
    it('calculates exact unloaded and loaded divider metrics', () => {
      // Vin = 12V, R1 = 10k, R2 = 10k => Vout = 6V
      const unloaded = calcVoltageDivider(12, 10000, 10000);
      expect(unloaded.vout).toBe(6.0);
      expect(unloaded.ratio).toBe(0.5);
      expect(unloaded.dividerCurrentMa).toBeCloseTo(0.6, 2);
      expect(unloaded.totalPowerMw).toBeCloseTo(7.2, 1);

      // Loaded with 10k in parallel with R2 => R2_eff = 5k => Vout = 12 * 5 / 15 = 4V
      const loaded = calcVoltageDivider(12, 10000, 10000, 10000);
      expect(loaded.vout).toBe(4.0);
      expect(loaded.loadCurrentMa).toBeCloseTo(0.4, 2);
    });

    it('synthesizes optimal E24 standard resistor pairs for target output', () => {
      const pairs = synthesizeDividerPairs(12, 3.3, 1.0);
      expect(pairs.length).toBeGreaterThan(0);
      expect(pairs[0].vout).toBeCloseTo(3.3, 1);
      expect(pairs[0].errorPercent).toBeLessThan(3.0);
    });
  });

  describe('9. ECAD Unit Converter (Length, Copper, Temperature)', () => {
    it('converts mm, mils, inches, um with micro-precision', () => {
      const conv = convertLength(2.54, 'mm');
      expect(conv.mils).toBeCloseTo(100, 1);
      expect(conv.inches).toBeCloseTo(0.1, 3);
      expect(conv.um).toBe(2540);
    });

    it('converts copper foil weight 1 oz to thickness in um and mils', () => {
      const cu1oz = convertCopper(1.0, 'oz');
      expect(cu1oz.um).toBeCloseTo(35, 0);
      expect(cu1oz.mils).toBeCloseTo(1.37, 1);

      const cu2oz = convertCopper(2.0, 'oz');
      expect(cu2oz.um).toBeCloseTo(70, 0);
    });

    it('converts temperature between Celsius, Fahrenheit and Kelvin', () => {
      const t = convertTemperature(25, 'C');
      expect(t.fahrenheit).toBe(77);
      expect(t.kelvin).toBeCloseTo(298.15, 2);
    });
  });
});
