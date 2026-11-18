import { beforeEach, describe, expect, it } from 'vitest';
import {
  ComponentDef,
  PatternDef,
  SymbolPin,
  SymbolPrimitive
} from '../../src/core/types';
import {
  calculateIpc7351LandPattern,
  calculateIpcThroughHolePad,
  IPC_7351_FILLET_TABLE,
  IPC_BGA_PRESETS,
  IPC_CHIP_PRESETS,
  IPC_GULLWING_PRESETS,
  IPC_QFN_DFN_PRESETS,
  IPC_QFP_PRESETS,
  IPC_THD_PRESETS
} from '../../src/engines/parametricPattern';
import { generateParametricPattern } from '../../src/engines/patternGenerator';
import { validateComponent } from '../../src/ui/modules/componentEditor/componentValidation';
import {
  changePadType,
  renumberPads,
  validatePatternGenerator
} from '../../src/ui/modules/patternEditor/patternEditing';
import {
  createUserLibrary,
  deleteUserComponent,
  deleteUserPattern,
  duplicateUserComponent,
  duplicateUserPattern,
  loadImportedLibraryBundles,
  loadUserComponents,
  loadUserPatterns,
  saveUserComponents,
  saveUserPatterns
} from '../../src/core/persistence/libraryStore';

function installMemoryStorage() {
  const store = new Map<string, string>();
  const mockStorage = {
    get length() { return store.size; },
    clear() { store.clear(); },
    getItem(key: string) { return store.get(key) ?? null; },
    setItem(key: string, value: string) { store.set(key, String(value)); },
    removeItem(key: string) { store.delete(key); },
    key(index: number) { return Array.from(store.keys())[index] ?? null; }
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true
  });
}

describe('Library, Component & Pattern Wizard Total Audit Tests', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  describe('1. Component Editor: Symbol Creation, Pin Properties & GOST 2.743-91', () => {
    it('creates a multi-pin symbol with graphic primitives (lines, rects, circles, arcs, text)', () => {
      const primitives: SymbolPrimitive[] = [
        { type: 'rect', x: -10, y: -15, w: 20, h: 30, width: 0.4 },
        { type: 'line', x1: -10, y1: 0, x2: 10, y2: 0, width: 0.25 },
        { type: 'circle', cx: 0, cy: -5, r: 2.5, width: 0.3 },
        { type: 'arc', cx: 0, cy: 5, r: 3, startAngle: 0, endAngle: Math.PI, width: 0.3 },
        { type: 'text', x: 0, y: -10, text: '&', size: 3.5 }
      ];

      const pins: SymbolPin[] = [
        { id: 'p1', number: '1', name: 'IN1', x: -15, y: -7.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true, padMapping: '1' },
        { id: 'p2', number: '2', name: 'IN2', x: -15, y: -2.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Inverted', showName: true, showNumber: true, padMapping: '2' },
        { id: 'p3', number: '3', name: 'CLK', x: -15, y: 2.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Clock', showName: true, showNumber: true, padMapping: '3' },
        { id: 'p4', number: '4', name: 'OUT', x: 15, y: 0, length: 5, orientation: 180, electricalType: 'Output', style: 'Line', showName: true, showNumber: true, padMapping: '4' },
        { id: 'p5', number: '5', name: 'VCC', x: 0, y: -20, length: 5, orientation: 90, electricalType: 'PowerIn', style: 'Line', showName: true, showNumber: true, padMapping: '5' },
        { id: 'p6', number: '6', name: 'VOUT', x: 15, y: 7.5, length: 5, orientation: 180, electricalType: 'PowerOut', style: 'Line', showName: true, showNumber: true, padMapping: '6' }
      ];

      const comp: ComponentDef = {
        id: 'ucomp_test1',
        name: 'К1533ТМ2_ТЕСТ',
        library: 'lib_user',
        refDesPrefix: 'DD',
        defaultValue: 'К1533ТМ2',
        gostStandard: 'ГОСТ 2.743-91',
        description: 'D-триггер двойной',
        patternId: 'PAT_DIP14',
        parts: [{ partIndex: 1, name: 'Секция 1', primitives, pins }]
      };

      expect(comp.parts[0].primitives.length).toBe(5);
      expect(comp.parts[0].pins.length).toBe(6);
      expect(comp.parts[0].pins.some((p) => p.electricalType === 'PowerIn')).toBe(true);
      expect(comp.parts[0].pins.some((p) => p.electricalType === 'PowerOut')).toBe(true);
      expect(comp.parts[0].pins.some((p) => p.style === 'Clock')).toBe(true);
      expect(comp.parts[0].pins.some((p) => p.style === 'Inverted')).toBe(true);
    });

    it('enforces 2.5 mm GOST grid and checks pin-to-pad mapping validity', () => {
      const pattern: PatternDef = {
        id: 'PAT_TEST',
        name: 'SOIC-8',
        library: 'lib_pats',
        description: 'Тестовый корпус',
        pads: [
          { id: 'pad1', number: '1', type: 'SMD', shape: 'RoundedRect', x: -2.7, y: -1.9, width: 1.5, height: 0.6, layer: 'Top' },
          { id: 'pad2', number: '2', type: 'SMD', shape: 'RoundedRect', x: -2.7, y: -0.63, width: 1.5, height: 0.6, layer: 'Top' }
        ],
        graphics: [],
        courtyard: { width: 7, height: 5 },
        model3d: { shape: 'SOIC', bodyWidth: 3.9, bodyLength: 4.9, bodyHeight: 1.5, color: '#222' }
      };

      const validComp: ComponentDef = {
        id: 'c1',
        name: 'ТЕСТ_ВАЛИД',
        library: 'lib_user',
        refDesPrefix: 'DA',
        defaultValue: 'ТЕСТ',
        gostStandard: 'ГОСТ 2.743-91',
        description: 'Валидный компонент',
        patternId: pattern.id,
        parts: [
          {
            partIndex: 1,
            name: 'Секция 1',
            primitives: [],
            pins: [
              { id: 'p1', number: '1', name: 'IN', x: -12.5, y: -2.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true, padMapping: '1' },
              { id: 'p2', number: '2', name: 'OUT', x: 12.5, y: -2.5, length: 5, orientation: 180, electricalType: 'Output', style: 'Line', showName: true, showNumber: true, padMapping: '2' }
            ]
          }
        ]
      };

      const validIssues = validateComponent(validComp, pattern);
      expect(validIssues).toEqual([]);

      // Invalid component: off 2.5mm grid and bad pad mapping
      const invalidComp: ComponentDef = {
        ...validComp,
        parts: [
          {
            partIndex: 1,
            name: 'Секция 1',
            primitives: [],
            pins: [
              { id: 'p1', number: '1', name: 'IN', x: -11.3, y: -2.1, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true, padMapping: '99' }
            ]
          }
        ]
      };

      const issues = validateComponent(invalidComp, pattern);
      expect(issues.some((i) => i.includes('вне сетки 2,5 мм'))).toBe(true);
      expect(issues.some((i) => i.includes('площадка «99» отсутствует в корпусе'))).toBe(true);
    });
  });

  describe('2. IPC-7351A/B Parametric Footprint Generator Engine', () => {
    it('calculates IPC-7351 mathematical formulas for Gullwing leads (SOIC/QFP)', () => {
      // SOIC-16 Narrow: L_nom = 6.0mm (overall tip-to-tip), W_nom = 0.40mm (lead width), T_nom = 0.65mm (lead contact)
      const resA = calculateIpc7351LandPattern(
        {
          leadType: 'Gullwing',
          overallSpanNom: 6.00,
          overallSpanTol: 0.20,
          bodyLengthNom: 9.90,
          bodyLengthTol: 0.20,
          bodyWidthNom: 3.90,
          bodyWidthTol: 0.20,
          bodyHeightNom: 1.50,
          leadContactNom: 0.65,
          leadContactTol: 0.25,
          leadWidthNom: 0.40,
          leadWidthTol: 0.10,
          pitch: 1.27
        },
        'A'
      );

      const resB = calculateIpc7351LandPattern(
        {
          leadType: 'Gullwing',
          overallSpanNom: 6.00,
          overallSpanTol: 0.20,
          bodyLengthNom: 9.90,
          bodyLengthTol: 0.20,
          bodyWidthNom: 3.90,
          bodyWidthTol: 0.20,
          bodyHeightNom: 1.50,
          leadContactNom: 0.65,
          leadContactTol: 0.25,
          leadWidthNom: 0.40,
          leadWidthTol: 0.10,
          pitch: 1.27
        },
        'B'
      );

      const resC = calculateIpc7351LandPattern(
        {
          leadType: 'Gullwing',
          overallSpanNom: 6.00,
          overallSpanTol: 0.20,
          bodyLengthNom: 9.90,
          bodyLengthTol: 0.20,
          bodyWidthNom: 3.90,
          bodyWidthTol: 0.20,
          bodyHeightNom: 1.50,
          leadContactNom: 0.65,
          leadContactTol: 0.25,
          leadWidthNom: 0.40,
          leadWidthTol: 0.10,
          pitch: 1.27
        },
        'C'
      );

      // Level A (Most) must have larger pad dimensions and courtyard than Level B and Level C
      expect(resA.zMax).toBeGreaterThan(resB.zMax);
      expect(resB.zMax).toBeGreaterThan(resC.zMax);
      expect(resA.padLength).toBeGreaterThan(resB.padLength);
      expect(resB.padLength).toBeGreaterThan(resC.padLength);
      expect(resA.courtyardWidth).toBeGreaterThan(resB.courtyardWidth);
      expect(resB.courtyardWidth).toBeGreaterThan(resC.courtyardWidth);
      expect(resA.solderMaskExpansion).toBe(0.075);
      expect(resB.solderMaskExpansion).toBe(0.05);
    });

    it('generates two-pin chip footprints for standard passives (0201, 0402, 0603, 0805, 1206, 1210, 2512)', () => {
      for (const [code, p] of Object.entries(IPC_CHIP_PRESETS)) {
        const pat = generateParametricPattern({
          family: 'ChipSMD',
          name: `ЧИП_${p.imperialName}`,
          pinCount: 2,
          pitch: 0,
          rowSpacing: p.rowSpacing,
          padWidth: p.padLength,
          padHeight: p.padWidth,
          holeDiameter: 0,
          bodyWidth: p.bodyWidth,
          bodyLength: p.bodyLength,
          bodyHeight: p.bodyHeight,
          densityLevel: 'B'
        });

        expect(pat.pads.length).toBe(2);
        expect(pat.pads[0].type).toBe('SMD');
        expect(pat.pads[0].number).toBe('1');
        expect(pat.pads[1].number).toBe('2');
        expect(pat.pads[0].width).toBeCloseTo(p.padLength, 2);
        expect(pat.pads[0].height).toBeCloseTo(p.padWidth, 2);
        expect(Math.abs(pat.pads[1].x - pat.pads[0].x)).toBeCloseTo(p.rowSpacing, 2);
        expect(pat.courtyard.width).toBeGreaterThan(p.bodyLength);
        expect(pat.courtyard.height).toBeGreaterThan(p.bodyWidth);
      }
    });

    it('generates QFN and DFN footprints with central thermal exposed pad', () => {
      // QFN-32
      const qfn = generateParametricPattern({
        family: 'QFN',
        name: 'QFN-32_5x5',
        pinCount: 32,
        pitch: 0.5,
        rowSpacing: 4.85,
        padWidth: 0.85,
        padHeight: 0.28,
        holeDiameter: 0,
        bodyWidth: 5.0,
        bodyLength: 5.0,
        bodyHeight: 0.85,
        densityLevel: 'B',
        thermalPadSize: 3.20
      });

      expect(qfn.pads.length).toBe(33); // 32 perimeter leads + 1 thermal pad
      const epPadQfn = qfn.pads.find((p) => p.id === 'pad_EP');
      expect(epPadQfn).toBeDefined();
      expect(epPadQfn?.width).toBe(3.20);
      expect(epPadQfn?.x).toBe(0);
      expect(epPadQfn?.y).toBe(0);

      // DFN-8 (dual-row flat no-lead with thermal pad)
      const dfn = generateParametricPattern({
        family: 'DFN',
        name: 'DFN-8_3x3',
        pinCount: 8,
        pitch: 0.5,
        rowSpacing: 2.80,
        padWidth: 0.70,
        padHeight: 0.28,
        holeDiameter: 0,
        bodyWidth: 3.0,
        bodyLength: 3.0,
        bodyHeight: 0.75,
        densityLevel: 'B',
        thermalPadSize: 1.70
      });

      expect(dfn.pads.length).toBe(9); // 8 side leads + 1 thermal pad
      const epPadDfn = dfn.pads.find((p) => p.id === 'pad_EP');
      expect(epPadDfn).toBeDefined();
      expect(epPadDfn?.width).toBe(1.70);
      expect(epPadDfn?.shape).toBe('Rect');
    });

    it('generates BGA matrices with correct JEDEC ball designations and corner depopulation', () => {
      // Full BGA-16 (4x4)
      const bgaFull = generateParametricPattern({
        family: 'BGA',
        name: 'BGA-16_1.0',
        pinCount: 16,
        pitch: 1.0,
        rowSpacing: 3.0,
        padWidth: 0.5,
        padHeight: 0.5,
        holeDiameter: 0,
        bodyWidth: 5.0,
        bodyLength: 5.0,
        bodyHeight: 1.2,
        densityLevel: 'B',
        bgaCols: 4,
        bgaRows: 4
      });

      expect(bgaFull.pads.length).toBe(16);
      expect(bgaFull.pads[0].number).toBe('A1');
      expect(bgaFull.pads[15].number).toBe('D4');

      // BGA-16 with depopulated corners (4 corners omitted -> 12 balls remaining)
      const bgaDepop = generateParametricPattern({
        family: 'BGA',
        name: 'BGA-16_DEPOP',
        pinCount: 16,
        pitch: 1.0,
        rowSpacing: 3.0,
        padWidth: 0.5,
        padHeight: 0.5,
        holeDiameter: 0,
        bodyWidth: 5.0,
        bodyLength: 5.0,
        bodyHeight: 1.2,
        densityLevel: 'B',
        bgaCols: 4,
        bgaRows: 4,
        bgaDepopulateCorners: true
      });

      expect(bgaDepop.pads.length).toBe(12);
      expect(bgaDepop.pads.some((p) => p.number === 'A1')).toBe(false);
      expect(bgaDepop.pads.some((p) => p.number === 'A4')).toBe(false);
      expect(bgaDepop.pads.some((p) => p.number === 'D1')).toBe(false);
      expect(bgaDepop.pads.some((p) => p.number === 'D4')).toBe(false);
    });

    it('generates Through-Hole DIP and SIP packages with annular rings per IPC-2221', () => {
      // DIP-14
      const dip = generateParametricPattern({
        family: 'DIP',
        name: 'DIP-14',
        pinCount: 14,
        pitch: 2.54,
        rowSpacing: 7.62,
        padWidth: 1.6,
        padHeight: 1.6,
        holeDiameter: 0.85,
        bodyWidth: 6.4,
        bodyLength: 19.0,
        bodyHeight: 3.5,
        densityLevel: 'B'
      });

      expect(dip.pads.length).toBe(14);
      expect(dip.pads[0].shape).toBe('Rect'); // Pin 1 is square/rect in DIP
      expect(dip.pads[1].shape).toBe('Oval');
      expect(dip.pads[0].holeDiameter).toBe(0.85);

      // SIP-8
      const sip = generateParametricPattern({
        family: 'SIP',
        name: 'SIP-8',
        pinCount: 8,
        pitch: 2.54,
        rowSpacing: 0,
        padWidth: 1.7,
        padHeight: 1.7,
        holeDiameter: 0.85,
        bodyWidth: 2.8,
        bodyLength: 20.4,
        bodyHeight: 5.0,
        densityLevel: 'B'
      });

      expect(sip.pads.length).toBe(8);
      expect(sip.pads[0].shape).toBe('Rect'); // Pin 1 indicator
      expect(sip.pads[1].shape).toBe('Round');
      expect(sip.pads[0].x).toBe(0);
      expect(sip.pads[7].x).toBe(0);

      // IPC THT pad calculation
      const thtCalc = calculateIpcThroughHolePad(0.60, 'B'); // 0.6mm pin lead
      expect(thtCalc.holeDiameter).toBe(0.80);
      expect(thtCalc.padDiameter).toBe(1.20);
      expect(thtCalc.annularRing).toBe(0.20);
    });
  });

  describe('3. Pattern Editor Pad Manipulation & Validation', () => {
    it('renumbers pads preserving mechanical mounting holes without numbers', () => {
      const pads = [
        { id: '1', number: '10', type: 'SMD' as const, shape: 'Rect' as const, x: 0, y: 0, width: 1, height: 1, layer: 'Top' as const },
        { id: '2', number: '', type: 'MountingHole' as const, shape: 'Round' as const, x: 5, y: 5, width: 3.2, height: 3.2, holeDiameter: 3.2, layer: 'All' as const },
        { id: '3', number: '20', type: 'SMD' as const, shape: 'Rect' as const, x: 10, y: 0, width: 1, height: 1, layer: 'Top' as const }
      ];

      const renumbered = renumberPads(pads);
      expect(renumbered[0].number).toBe('1');
      expect(renumbered[1].number).toBe('');
      expect(renumbered[2].number).toBe('2');
    });

    it('changes pad type between SMD, THT and MountingHole cleanly', () => {
      const pad = { id: 'p1', number: '1', type: 'SMD' as const, shape: 'RoundedRect' as const, x: 0, y: 0, width: 1.5, height: 0.6, layer: 'Top' as const };
      const toTht = changePadType(pad, 'THT', [pad]);
      expect(toTht.type).toBe('THT');
      expect(toTht.layer).toBe('All');
      expect(toTht.holeDiameter).toBeGreaterThan(0);

      const toSmd = changePadType(toTht, 'SMD', [toTht]);
      expect(toSmd.type).toBe('SMD');
      expect(toSmd.layer).toBe('Top');
      expect(toSmd.holeDiameter).toBe(0);
    });

    it('validates generator input parameters for various package families', () => {
      expect(validatePatternGenerator({
        family: 'QFP',
        name: 'LQFP',
        pinCount: 47, // Must be multiple of 4
        pitch: 0.5,
        rowSpacing: 8,
        padWidth: 1.2,
        padHeight: 0.3,
        holeDiameter: 0,
        bodyWidth: 7,
        bodyLength: 7,
        bodyHeight: 1.4,
        densityLevel: 'B'
      })).toContain('кратное 4');

      expect(validatePatternGenerator({
        family: 'DFN',
        name: 'DFN',
        pinCount: 7, // Must be even
        pitch: 0.5,
        rowSpacing: 3,
        padWidth: 0.7,
        padHeight: 0.28,
        holeDiameter: 0,
        bodyWidth: 3,
        bodyLength: 3,
        bodyHeight: 0.75,
        densityLevel: 'B'
      })).toContain('чётное число');

      expect(validatePatternGenerator({
        family: 'SIP',
        name: 'SIP',
        pinCount: 1, // Must be >= 2
        pitch: 2.54,
        rowSpacing: 0,
        padWidth: 1.7,
        padHeight: 1.7,
        holeDiameter: 0.85,
        bodyWidth: 2.8,
        bodyLength: 5,
        bodyHeight: 5,
        densityLevel: 'B'
      })).toContain('от 2 до 4096');
    });
  });

  describe('4. Library Manager Operations (Store & Bundles)', () => {
    it('creates new user library, duplicates components and patterns, and removes them', () => {
      const bundle = createUserLibrary('RF_Modules_ГОСТ', 'СВЧ');
      expect(bundle.name).toBe('RF_Modules_ГОСТ');
      expect(loadImportedLibraryBundles().some((b) => b.id === bundle.id)).toBe(true);

      const origComp: ComponentDef = {
        id: 'ucomp_rf1',
        name: 'LNA_INA101',
        library: bundle.name,
        refDesPrefix: 'DA',
        defaultValue: 'INA101',
        gostStandard: '',
        description: 'СВЧ усилитель',
        patternId: 'pat_rf1',
        parts: [{ partIndex: 1, name: 'Секция 1', primitives: [], pins: [] }]
      };
      saveUserComponents([origComp]);

      const origPat: PatternDef = {
        id: 'pat_rf1',
        name: 'DFN-8_LNA',
        library: bundle.name,
        description: 'Корпус СВЧ',
        courtyard: { width: 5, height: 5 },
        model3d: { shape: 'QFN', bodyWidth: 3, bodyLength: 3, bodyHeight: 0.8, color: '#333' },
        pads: [{ id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: 0, y: 0, width: 1, height: 1, layer: 'Top' }],
        graphics: []
      };
      saveUserPatterns([origPat]);

      // Test duplication
      const clonedComp = duplicateUserComponent(origComp.id);
      expect(clonedComp).not.toBeNull();
      expect(clonedComp!.name).toBe('LNA_INA101_копия');
      expect(clonedComp!.id).not.toBe(origComp.id);
      expect(loadUserComponents().length).toBe(2);

      const clonedPat = duplicateUserPattern(origPat.id);
      expect(clonedPat).not.toBeNull();
      expect(clonedPat!.name).toBe('DFN-8_LNA_копия');
      expect(clonedPat!.id).not.toBe(origPat.id);
      expect(loadUserPatterns().length).toBe(2);

      // Test deletion
      deleteUserComponent(clonedComp!.id);
      expect(loadUserComponents().length).toBe(1);
      expect(loadUserComponents()[0].id).toBe(origComp.id);

      deleteUserPattern(clonedPat!.id);
      expect(loadUserPatterns().length).toBe(1);
      expect(loadUserPatterns()[0].id).toBe(origPat.id);
    });
  });
});
