import { describe, it, expect, beforeEach } from 'vitest';
import {
  calcTraceWidthByCurrent,
  calcMaxCurrentByTraceWidth
} from '../../src/engines/rfCalc/traceCurrentCalc';
import {
  calcMicrostripImpedance,
  calcMicrostripWidthForZ0
} from '../../src/engines/rfCalc/microstripCalc';
import { calcViaMetrics } from '../../src/engines/rfCalc/viaCalc';
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
  decodeSmdResistor,
  encodeSmdResistor
} from '../../src/engines/rfCalc/smdResistorCalc';
import {
  decodeCapacitor,
  calcCapacitiveReactance
} from '../../src/engines/rfCalc/capacitorCalc';
import {
  convertLength,
  convertCopper,
  convertTemperature
} from '../../src/engines/rfCalc/unitConverterCalc';
import {
  DEFAULT_HOTKEYS,
  matchesHotkey,
  validateHotkeys
} from '../../src/core/persistence/hotkeysStore';
import {
  loadSettings,
  saveSettings,
  recordRecentProject,
  togglePinRecentProject
} from '../../src/core/persistence/settingsStore';
import {
  buildDefaultNewProjectOptions,
  createProjectFromOptions
} from '../../src/core/persistence/projectFactory';

describe('Combine Agent 1 — Engineering Calculators Verification', () => {
  describe('traceCurrentCalc (IPC-2221 / GOST 23751)', () => {
    it('matches IPC-2221 external and internal layer equations exactly', () => {
      // External: I = 0.048 * dT^0.44 * A_mil2^0.725
      // For I = 2 A, dT = 10 C, T = 35 um (~1.378 mil):
      const resExt = calcTraceWidthByCurrent({
        currentAmps: 2,
        tempRiseC: 10,
        copperThicknessUm: 35,
        isExternalLayer: true,
        traceLengthMm: 100
      });
      const expectedAreaMil2 = Math.pow(2 / (0.048 * Math.pow(10, 0.44)), 1 / 0.725);
      const expectedMm2 = expectedAreaMil2 * 0.00064516;
      const expectedWidthMm = expectedMm2 / 0.035;
      expect(resExt.crossSectionMm2).toBeCloseTo(expectedMm2, 4);
      expect(resExt.requiredWidthMm).toBeCloseTo(expectedWidthMm, 2);

      // Internal layer uses k = 0.024 -> 2^(1/0.725) ~= 2.60x wider trace
      const resInt = calcTraceWidthByCurrent({
        currentAmps: 2,
        tempRiseC: 10,
        copperThicknessUm: 35,
        isExternalLayer: false,
        traceLengthMm: 100
      });
      expect(resInt.requiredWidthMm).toBeGreaterThan(resExt.requiredWidthMm * 2.5);

      // Round-trip: calcMaxCurrentByTraceWidth(requiredWidthMm) should be close to 2 A
      const iMax = calcMaxCurrentByTraceWidth({
        traceWidthMm: resExt.requiredWidthMm,
        tempRiseC: 10,
        copperThicknessUm: 35,
        isExternalLayer: true
      });
      expect(iMax).toBeCloseTo(2.0, 1);
    });

    it('handles NaN and negative inputs safely via fallbacks', () => {
      const res = calcTraceWidthByCurrent({
        currentAmps: Number.NaN,
        tempRiseC: -5,
        copperThicknessUm: Number.NaN,
        isExternalLayer: true,
        traceLengthMm: Number.NaN
      });
      expect(Number.isFinite(res.requiredWidthMm)).toBe(true);
      expect(res.requiredWidthMm).toBeGreaterThan(0);
    });
  });

  describe('microstripCalc (Hammerstad/Schneider & IPC-2141)', () => {
    it('computes ~50 Ohm single-ended impedance for standard FR4 stackup and round-trips width synthesis', () => {
      // H = 0.2 mm, er = 4.4, T = 0.035 mm, target Z0 = 50 Ohm
      const w50 = calcMicrostripWidthForZ0(50, 0.2, 4.4, 0.035);
      expect(w50).toBeGreaterThan(0.3);
      expect(w50).toBeLessThan(0.45);

      const res = calcMicrostripImpedance({
        traceWidthMm: w50,
        copperThicknessMm: 0.035,
        dielectricHeightMm: 0.2,
        er: 4.4,
        diffGapMm: 0.2
      });
      expect(res.z0SingleOhm).toBeCloseTo(50, 0);
      // Differential impedance with S=H=0.2mm: Zdiff = 2*50*(1 - 0.48*exp(-0.96)) ~= 81.6 Ohm
      expect(res.zDiffOhm).toBeCloseTo(2 * res.z0SingleOhm * (1 - 0.48 * Math.exp(-0.96)), 0);
    });
  });

  describe('viaCalc (Howard Johnson Via Parasitics)', () => {
    it('matches Howard Johnson L and C formulas for standard 1.6mm board', () => {
      const res = calcViaMetrics({
        holeDiameterMm: 0.3,
        padDiameterMm: 0.6,
        antipadDiameterMm: 1.0,
        boardThicknessMm: 1.6,
        er: 4.4,
        platingThicknessUm: 25
      });
      // L = 0.2 * 1.6 * (ln(4*1.6/0.3) + 1) = 0.32 * (ln(21.333) + 1) = 0.32 * 4.060 = 1.299 nH
      expect(res.inductanceNh).toBeCloseTo(1.299, 2);
      // C = (0.0555 * 4.4 * 1.6 * 0.6) / (1.0 - 0.6) = 0.234432 / 0.4 = 0.586 pF
      expect(res.capacitancePf).toBeCloseTo(0.586, 2);
      expect(res.impedanceZ0Ohm).toBeCloseTo(Math.sqrt((1.299e-9) / (0.586e-12)), 0);
    });

    it('AUDIT FINDING: NaN inputs propagate NaN and platingThicknessUm=0 produces Infinity Rdc', () => {
      const nanRes = calcViaMetrics({
        holeDiameterMm: Number.NaN,
        padDiameterMm: 0.6,
        antipadDiameterMm: 1.0,
        boardThicknessMm: 1.6,
        er: 4.4
      });
      expect(Number.isNaN(nanRes.inductanceNh)).toBe(true);

      const zeroPlating = calcViaMetrics({
        holeDiameterMm: 0.3,
        padDiameterMm: 0.6,
        antipadDiameterMm: 1.0,
        boardThicknessMm: 1.6,
        er: 4.4,
        platingThicknessUm: 0
      });
      expect(zeroPlating.dcResistanceMilliOhm).toBe(Infinity);
    });
  });

  describe('timer555Calc', () => {
    it('matches NE555 astable and monostable datasheet formulas', () => {
      const ast = calc555Astable(10e3, 47e3, 100e-9);
      // T_high = ln(2)*(10k+47k)*100n = 3.9509 ms; T_low = ln(2)*47k*100n = 3.2578 ms
      expect(ast.tHighSec).toBeCloseTo(Math.LN2 * 57e3 * 100e-9, 6);
      expect(ast.tLowSec).toBeCloseTo(Math.LN2 * 47e3 * 100e-9, 6);
      expect(ast.dutyCyclePercent).toBeCloseTo((57 / (10 + 94)) * 100, 1);

      const mono = calc555Monostable(100e3, 10e-6);
      expect(mono.pulseWidthSec).toBeCloseTo(Math.log(3) * 1.0, 5);

      const synth = synthesize555Astable(1000, 60);
      expect(synth.actualFreqHz).toBeGreaterThan(990);
      expect(synth.actualFreqHz).toBeLessThan(1010);
      expect(synth.actualDutyPercent).toBeCloseTo(60, 0);
    });

    it('AUDIT FINDING: NaN inputs propagate NaN in calc555Astable', () => {
      const res = calc555Astable(Number.NaN, 1000, 1e-6);
      expect(Number.isNaN(res.frequencyHz)).toBe(true);
    });
  });

  describe('voltageDividerCalc', () => {
    it('calculates loaded divider voltage, power, and Thevenin resistance', () => {
      const res = calcVoltageDivider(12, 10000, 10000, 10000);
      // R2 || Rload = 5k; Vout = 12 * 5k / (10k + 5k) = 4.0 V
      expect(res.vout).toBeCloseTo(4.0, 4);
      expect(res.theveninResistanceOhm).toBeCloseTo(5000, 2);
      expect(res.loadCurrentMa).toBeCloseTo(0.4, 3);

      const pairs = synthesizeDividerPairs(5.0, 3.3, 1.0, 4);
      expect(pairs.length).toBeGreaterThan(0);
      expect(pairs[0].errorPercent).toBeLessThan(2);
    });
  });

  describe('smdResistorCalc', () => {
    it('decodes 3-digit, 4-digit, sub-ohm, jumper, and EIA-96 codes', () => {
      expect(decodeSmdResistor('103').resistanceOhm).toBe(10000);
      expect(decodeSmdResistor('4R7').resistanceOhm).toBe(4.7);
      expect(decodeSmdResistor('R22').resistanceOhm).toBe(0.22);
      expect(decodeSmdResistor('1002').resistanceOhm).toBe(10000);
      expect(decodeSmdResistor('000').resistanceOhm).toBe(0);
      expect(decodeSmdResistor('01Y').resistanceOhm).toBe(1.0);
      expect(decodeSmdResistor('01A').resistanceOhm).toBe(100);
      expect(decodeSmdResistor('01R').resistanceOhm).toBe(1.0);
      expect(decodeSmdResistor('68X').resistanceOhm).toBe(49.9);
      expect(encodeSmdResistor(100).eia96).toBe('01A');
      expect(encodeSmdResistor(4700).code3Digit).toBe('472');
      expect(encodeSmdResistor(4700).code4Digit).toBe('4701');
    });

    it('AUDIT FINDING: malformed R/K/M codes like 4R7X, -4R7, and K are falsely accepted as valid', () => {
      expect(decodeSmdResistor('4R7X').valid).toBe(true);
      expect(decodeSmdResistor('-4R7').valid).toBe(true);
      expect(decodeSmdResistor('K').valid).toBe(true);
    });
  });

  describe('capacitorCalc', () => {
    it('decodes EIA 3-digit, direct pF, and alphanumeric codes and calculates Xc', () => {
      const c104 = decodeCapacitor('104', 'K', '1H', 'X7R');
      expect(c104.valid).toBe(true);
      expect(c104.capacitancePf).toBe(100000);
      expect(c104.capacitanceNf).toBe(100);
      expect(c104.capacitanceUf).toBe(0.1);
      expect(c104.reactanceAt1kHz).toBeCloseTo(calcCapacitiveReactance(100e-9, 1e3), 4);

      const c2a = decodeCapacitor('2A104J');
      expect(c2a.valid).toBe(true);
      expect(c2a.tolerancePercent).toBe(5);
      expect(c2a.voltageText).toBe('100 В');
    });

    it('AUDIT FINDING: malformed codes containing R (like "R" or "4R7K") bypass validation', () => {
      const bareR = decodeCapacitor('R');
      expect(bareR.valid).toBe(true);
      expect(Number.isNaN(bareR.capacitancePf)).toBe(true);

      const rWithSuffix = decodeCapacitor('4R7K');
      expect(rWithSuffix.valid).toBe(true);
      expect(rWithSuffix.capacitancePf).toBe(4.7);
    });
  });

  describe('unitConverterCalc', () => {
    it('converts length, copper weight/thickness, and temperature accurately', () => {
      const l = convertLength(2.54, 'mm');
      expect(l.mils).toBeCloseTo(100, 2);
      expect(l.inches).toBeCloseTo(0.1, 4);
      expect(l.um).toBeCloseTo(2540, 1);

      const cu = convertCopper(1, 'oz');
      expect(cu.um).toBeCloseTo(34.79, 2);

      const t = convertTemperature(0, 'C');
      expect(t.fahrenheit).toBe(32);
      expect(t.kelvin).toBe(273.15);
    });
  });
});

describe('Combine Agent 1 — Hotkeys, Settings & Project Factory Verification', () => {
  const storageMap = new Map<string, string>();
  beforeEach(() => {
    storageMap.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => storageMap.get(k) ?? null,
        setItem: (k: string, v: string) => { storageMap.set(k, String(v)); },
        removeItem: (k: string) => { storageMap.delete(k); },
        clear: () => { storageMap.clear(); },
        key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
        get length() { return storageMap.size; }
      }
    });
  });

  it('matches hotkeys including Cyrillic key code fallback and standalone +/-', () => {
    const mkEvt = (opts: Partial<KeyboardEvent>) => ({
      key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...opts
    } as KeyboardEvent);
    expect(matchesHotkey(mkEvt({ key: 'ц', code: 'KeyW' }), DEFAULT_HOTKEYS.placeWire)).toBe(true);
    expect(matchesHotkey(mkEvt({ key: '=', code: 'Equal' }), DEFAULT_HOTKEYS.zoomIn)).toBe(true);
    expect(matchesHotkey(mkEvt({ key: 'U', code: 'KeyU', ctrlKey: true, shiftKey: true }), DEFAULT_HOTKEYS.updatePours)).toBe(true);
  });

  it('AUDIT FINDING: validateHotkeys misses modifier-order duplicates (Shift+Ctrl+U vs Ctrl+Shift+U)', () => {
    const map = {
      ...DEFAULT_HOTKEYS,
      placeWire: 'Shift+Ctrl+U' // duplicates updatePours: 'Ctrl+Shift+U'
    };
    const errors = validateHotkeys(map);
    expect(errors.length).toBe(0);
  });

  it('AUDIT FINDING: recordRecentProject evicts pinned projects when >8 projects are recorded', () => {
    const settings = loadSettings();
    const firstId = settings.recentProjects![0].id;
    togglePinRecentProject(firstId);
    for (let i = 0; i < 9; i++) {
      recordRecentProject({
        id: `test_proj_${i}`,
        name: `Project ${i}`,
        designation: `DES.${i}`,
        module: 'schematic'
      });
    }
    const updated = loadSettings().recentProjects!;
    expect(updated.length).toBe(8);
    expect(updated.some((p) => p.id === firstId)).toBe(false);
  });

  it('AUDIT FINDING: createProjectFromOptions ignores boardWidthMm/boardHeightMm in schematic_and_pcb mode (template bug)', () => {
    const opts = {
      ...buildDefaultNewProjectOptions('schematic_and_pcb'),
      projectName: 'Плата_Импеданс_4L',
      boardLayers: 4 as const,
      boardWidthMm: 120,
      boardHeightMm: 80
    };
    const res = createProjectFromOptions(opts, 'pcb');
    const xs = res.pcb.boardOutline.map((p) => p.x);
    const ys = res.pcb.boardOutline.map((p) => p.y);
    const actualW = Math.max(...xs) - Math.min(...xs);
    const actualH = Math.max(...ys) - Math.min(...ys);
    // Expected 120x80 per template, actually gets 100x70 default!
    expect(actualW).toBe(100);
    expect(actualH).toBe(70);
    // And ignores preferredModule ('pcb'), returning 'schematic'
    expect(res.targetModule).toBe('schematic');
  });

  it('AUDIT FINDING: A4_P GOST blank template creates Form1 instead of advertised Form2', () => {
    const opts = {
      ...buildDefaultNewProjectOptions('schematic_only'),
      projectName: 'Схема_А4_ГОСТ',
      sheetFormat: 'A4_P' as const
    };
    const res = createProjectFromOptions(opts, 'schematic');
    expect(res.schematic?.sheets[0].titleBlock.form).toBe('Form1');
  });
});
