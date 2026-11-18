import { describe, expect, it } from 'vitest';
import { ComponentDef, PatternDef, SymbolPin } from '../../src/core/types';
import {
  findDuplicatePinNumbers,
  generateRangePins,
  parsePinRange,
  renumberPins,
  sortPins
} from '../../src/ui/modules/componentEditor/pinManagerHelpers';
import { validateComponent } from '../../src/ui/modules/componentEditor/componentValidation';
import { validatePattern } from '../../src/ui/modules/patternEditor/patternValidation';
import { generateParametricPattern } from '../../src/engines/patternGenerator';

describe('Library Editors Deep Ergonomics, Standards & Edge Cases Audit', () => {
  describe('1. Pin Manager Helpers & Quick Range Parsing', () => {
    it('parses various pin range syntax formats accurately', () => {
      expect(parsePinRange('D0..D7')).toEqual(['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']);
      expect(parsePinRange('A[0..3]')).toEqual(['A0', 'A1', 'A2', 'A3']);
      expect(parsePinRange('DATA0-DATA3')).toEqual(['DATA0', 'DATA1', 'DATA2', 'DATA3']);
      expect(parsePinRange('P3..P0')).toEqual(['P3', 'P2', 'P1', 'P0']); // Descending
      expect(parsePinRange('CLK, MOSI, MISO, CS')).toEqual(['CLK', 'MOSI', 'MISO', 'CS']);
      expect(parsePinRange('RESET')).toEqual(['RESET']);
      expect(parsePinRange('   ')).toEqual([]);
    });

    it('sorts pins naturally by number, by name, and by Y coordinate', () => {
      const pins: SymbolPin[] = [
        { id: '1', number: '10', name: 'OUT2', x: 10, y: 15, length: 5, orientation: 180, electricalType: 'Output', style: 'Line', showName: true, showNumber: true },
        { id: '2', number: '2', name: 'IN2', x: -10, y: 5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true },
        { id: '3', number: '1', name: 'IN1', x: -10, y: -5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true },
        { id: '4', number: '9', name: 'OUT1', x: 10, y: -15, length: 5, orientation: 180, electricalType: 'Output', style: 'Line', showName: true, showNumber: true }
      ];

      // Sort by natural number: 1, 2, 9, 10
      const sortedByNum = sortPins(pins, 'number');
      expect(sortedByNum.map((p) => p.number)).toEqual(['1', '2', '9', '10']);

      // Sort by name: IN1, IN2, OUT1, OUT2
      const sortedByName = sortPins(pins, 'name');
      expect(sortedByName.map((p) => p.name)).toEqual(['IN1', 'IN2', 'OUT1', 'OUT2']);

      // Sort by Y coordinate: -15, -5, 5, 15
      const sortedByY = sortPins(pins, 'y');
      expect(sortedByY.map((p) => p.y)).toEqual([-15, -5, 5, 15]);
    });

    it('renumbers pins sequentially starting from specified number', () => {
      const pins: SymbolPin[] = [
        { id: 'a', number: '99', name: 'A', x: 0, y: 0, length: 5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true },
        { id: 'b', number: '55', name: 'B', x: 0, y: 5, length: 5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true }
      ];
      const renumbered = renumberPins(pins, 1);
      expect(renumbered[0].number).toBe('1');
      expect(renumbered[0].padMapping).toBe('1');
      expect(renumbered[1].number).toBe('2');
      expect(renumbered[1].padMapping).toBe('2');
    });

    it('detects duplicate pin numbers across single and multiple parts', () => {
      const compSinglePart: ComponentDef = {
        id: 'c1',
        name: 'TEST_DUP',
        library: 'lib_user',
        refDesPrefix: 'DD',
        defaultValue: '7400',
        gostStandard: 'ГОСТ 2.743-91',
        description: 'Тест дубликатов',
        patternId: 'PAT_DIP14',
        parts: [
          {
            partIndex: 1,
            name: 'Секция 1',
            primitives: [],
            pins: [
              { id: 'p1', number: '1', name: 'A', x: -10, y: 0, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true },
              { id: 'p2', number: '2', name: 'B', x: -10, y: 5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true },
              { id: 'p3', number: '1', name: 'A_DUP', x: 10, y: 0, length: 5, orientation: 180, electricalType: 'Output', style: 'Line', showName: true, showNumber: true }
            ]
          }
        ]
      };
      const dupes = findDuplicatePinNumbers(compSinglePart);
      expect(dupes.has('1')).toBe(true);
      expect(dupes.has('2')).toBe(false);

      const compMultiPart: ComponentDef = {
        ...compSinglePart,
        parts: [
          {
            partIndex: 1,
            name: 'Секция 1',
            primitives: [],
            pins: [{ id: 'p1', number: '7', name: 'GND', x: 0, y: 0, length: 5, orientation: 0, electricalType: 'PowerIn', style: 'Line', showName: true, showNumber: true }]
          },
          {
            partIndex: 2,
            name: 'Секция 2',
            primitives: [],
            pins: [{ id: 'p2', number: '7', name: 'GND', x: 0, y: 0, length: 5, orientation: 0, electricalType: 'PowerIn', style: 'Line', showName: true, showNumber: true }]
          }
        ]
      };
      const multiDupes = findDuplicatePinNumbers(compMultiPart);
      expect(multiDupes.has('7')).toBe(true);
    });

    it('generates range pins with GOST 2.5 mm grid alignment and 5 mm spacing', () => {
      const pins = generateRangePins({
        rangeExpr: 'D0..D7',
        electricalType: 'Bidirectional',
        style: 'Line',
        orientation: 0,
        startNumber: 1,
        startX: -15,
        startY: -17.5,
        stepY: 5.0
      });

      expect(pins.length).toBe(8);
      expect(pins[0].name).toBe('D0');
      expect(pins[0].number).toBe('1');
      expect(pins[7].name).toBe('D7');
      expect(pins[7].number).toBe('8');

      // Check GOST 2.5 mm grid snap
      for (const pin of pins) {
        expect(Math.abs(Math.round(pin.x / 2.5) * 2.5 - pin.x)).toBeLessThan(0.001);
        expect(Math.abs(Math.round(pin.y / 2.5) * 2.5 - pin.y)).toBeLessThan(0.001);
        expect(pin.electricalType).toBe('Bidirectional');
      }
    });
  });

  describe('2. Pattern Validation Engine (IPC-7351B & GOST 23751)', () => {
    it('validates a compliant pattern with zero issues', () => {
      const validPat: PatternDef = {
        id: 'pat_soic8',
        name: 'SOIC-8_TEST',
        library: 'lib_user',
        description: 'Корпус SOIC-8',
        courtyard: { width: 8.0, height: 6.0 },
        model3d: { shape: 'SOIC', bodyWidth: 3.9, bodyLength: 4.9, bodyHeight: 1.5, color: '#333' },
        pads: [
          { id: 'p1', number: '1', type: 'SMD', shape: 'RoundedRect', x: -2.7, y: -1.905, width: 1.55, height: 0.6, solderMaskExpansion: 0.05, layer: 'Top' },
          { id: 'p2', number: '2', type: 'SMD', shape: 'RoundedRect', x: -2.7, y: -0.635, width: 1.55, height: 0.6, solderMaskExpansion: 0.05, layer: 'Top' },
          { id: 'p3', number: '3', type: 'SMD', shape: 'RoundedRect', x: -2.7, y: 0.635, width: 1.55, height: 0.6, solderMaskExpansion: 0.05, layer: 'Top' },
          { id: 'p4', number: '4', type: 'SMD', shape: 'RoundedRect', x: -2.7, y: 1.905, width: 1.55, height: 0.6, solderMaskExpansion: 0.05, layer: 'Top' },
          { id: 'p5', number: '5', type: 'SMD', shape: 'RoundedRect', x: 2.7, y: 1.905, width: 1.55, height: 0.6, solderMaskExpansion: 0.05, layer: 'Top' },
          { id: 'p6', number: '6', type: 'SMD', shape: 'RoundedRect', x: 2.7, y: 0.635, width: 1.55, height: 0.6, solderMaskExpansion: 0.05, layer: 'Top' },
          { id: 'p7', number: '7', type: 'SMD', shape: 'RoundedRect', x: 2.7, y: -0.635, width: 1.55, height: 0.6, solderMaskExpansion: 0.05, layer: 'Top' },
          { id: 'p8', number: '8', type: 'SMD', shape: 'RoundedRect', x: 2.7, y: -1.905, width: 1.55, height: 0.6, solderMaskExpansion: 0.05, layer: 'Top' }
        ],
        graphics: []
      };

      const issues = validatePattern(validPat);
      expect(issues).toEqual([]);
    });

    it('detects invalid pattern name characters and empty name', () => {
      const badNamePat: PatternDef = {
        id: 'pat_bad',
        name: 'SOIC-8/Bad:Name*?',
        library: 'lib_user',
        description: 'Некорректное имя',
        courtyard: { width: 10, height: 10 },
        model3d: { shape: 'Box', bodyWidth: 4, bodyLength: 5, bodyHeight: 2, color: '#222' },
        pads: [{ id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: 0, y: 0, width: 1, height: 1, layer: 'Top' }],
        graphics: []
      };
      const issues = validatePattern(badNamePat);
      expect(issues.some((i) => i.includes('недопустимые файловые символы'))).toBe(true);

      const emptyNamePat: PatternDef = { ...badNamePat, name: '   ' };
      const emptyIssues = validatePattern(emptyNamePat);
      expect(emptyIssues.some((i) => i.includes('Не задано наименование'))).toBe(true);
    });

    it('detects zero or negative pad sizes', () => {
      const zeroPadPat: PatternDef = {
        id: 'pat_zero',
        name: 'TEST_ZERO',
        library: 'lib_user',
        description: 'Нулевая площадка',
        courtyard: { width: 10, height: 10 },
        model3d: { shape: 'Box', bodyWidth: 4, bodyLength: 5, bodyHeight: 2, color: '#222' },
        pads: [
          { id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: 0, y: 0, width: 0, height: 1.5, layer: 'Top' },
          { id: 'p2', number: '2', type: 'SMD', shape: 'Rect', x: 2, y: 0, width: 1.5, height: -0.5, layer: 'Top' }
        ],
        graphics: []
      };
      const issues = validatePattern(zeroPadPat);
      expect(issues.some((i) => i.includes('нулевые или некорректные размеры'))).toBe(true);
    });

    it('detects THT annular ring violations per IPC-2221 and GOST 23751', () => {
      const badAnnularPat: PatternDef = {
        id: 'pat_tht_bad',
        name: 'DIP_BAD_RING',
        library: 'lib_user',
        description: 'Тонкий поясок меди',
        courtyard: { width: 10, height: 10 },
        model3d: { shape: 'DIP', bodyWidth: 6, bodyLength: 10, bodyHeight: 3, color: '#222' },
        pads: [
          // Hole diameter 0.95 mm in a 1.0 mm pad -> annular ring = (1.0 - 0.95) / 2 = 0.025 mm (< 0.12 mm)
          { id: 'p1', number: '1', type: 'THT', shape: 'Round', x: 0, y: 0, width: 1.0, height: 1.0, holeDiameter: 0.95, layer: 'All' },
          // Hole diameter 1.5 mm in a 1.2 mm pad -> hole exceeds pad!
          { id: 'p2', number: '2', type: 'THT', shape: 'Round', x: 2.54, y: 0, width: 1.2, height: 1.2, holeDiameter: 1.5, layer: 'All' }
        ],
        graphics: []
      };
      const issues = validatePattern(badAnnularPat);
      expect(issues.some((i) => i.includes('поясок меди отверстия') && i.includes('меньше допустимого 0.12 мм'))).toBe(true);
      expect(issues.some((i) => i.includes('превышает или равен размеру площадки'))).toBe(true);
    });

    it('detects solder mask and paste mask expansion violations', () => {
      const badMaskPat: PatternDef = {
        id: 'pat_mask_bad',
        name: 'TEST_MASK_LIMITS',
        library: 'lib_user',
        description: 'Нарушения маски и пасты',
        courtyard: { width: 10, height: 10 },
        model3d: { shape: 'Box', bodyWidth: 4, bodyLength: 5, bodyHeight: 2, color: '#222' },
        pads: [
          // Negative solder mask
          { id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: -2, y: 0, width: 1.5, height: 0.6, solderMaskExpansion: -0.05, layer: 'Top' },
          // Excessive solder mask (> 0.25mm)
          { id: 'p2', number: '2', type: 'SMD', shape: 'Rect', x: 0, y: 0, width: 1.5, height: 0.6, solderMaskExpansion: 0.35, layer: 'Top' },
          // Excessive positive paste expansion
          { id: 'p3', number: '3', type: 'SMD', shape: 'Rect', x: 2, y: 0, width: 1.5, height: 0.6, pasteMaskExpansion: 0.15, layer: 'Top' },
          // Mounting hole with paste mask
          { id: 'p4', number: '', type: 'MountingHole', shape: 'Round', x: 5, y: 0, width: 3.2, height: 3.2, holeDiameter: 3.2, pasteMaskExpansion: 0.1, layer: 'All' }
        ],
        graphics: []
      };
      const issues = validatePattern(badMaskPat);
      expect(issues.some((i) => i.includes('отрицательный зазор паяльной маски'))).toBe(true);
      expect(issues.some((i) => i.includes('чрезмерный зазор паяльной маски'))).toBe(true);
      expect(issues.some((i) => i.includes('расширение паяльной пасты'))).toBe(true);
      expect(issues.some((i) => i.includes('паяльная паста не должна наноситься'))).toBe(true);
    });

    it('detects duplicate pad numbers and courtyard violations', () => {
      const dupPadsPat: PatternDef = {
        id: 'pat_dups',
        name: 'TEST_DUPS',
        library: 'lib_user',
        description: 'Дубликаты площадок',
        courtyard: { width: 4.0, height: 4.0 }, // Small courtyard: pads will stick outside
        model3d: { shape: 'Box', bodyWidth: 3, bodyLength: 3, bodyHeight: 2, color: '#222' },
        pads: [
          { id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: -5, y: 0, width: 1.5, height: 0.6, layer: 'Top' }, // outside courtyard
          { id: 'p2', number: '1', type: 'SMD', shape: 'Rect', x: 5, y: 0, width: 1.5, height: 0.6, layer: 'Top' }   // duplicate number 1
        ],
        graphics: []
      };
      const issues = validatePattern(dupPadsPat);
      expect(issues.some((i) => i.includes('Дубликат номера площадки «1»'))).toBe(true);
      expect(issues.some((i) => i.includes('выходит за пределы зоны отчуждения'))).toBe(true);
    });
  });

  describe('3. Parametric Generator IPC-7351 Verification', () => {
    it('generates BGA with pin A1 silkscreen marker dot', () => {
      const bga = generateParametricPattern({
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

      expect(bga.pads.length).toBe(16);
      expect(bga.pads[0].number).toBe('A1');
      // Look for the pin 1 indicator circle on TopSilk
      const silkPin1Marker = bga.graphics.find(
        (g) => g.layer === 'TopSilk' && g.type === 'circle' && 'fill' in g && g.fill === true
      );
      expect(silkPin1Marker).toBeDefined();
    });

    it('generates polygonal pad geometry cleanly and validates', () => {
      const polyPadPat: PatternDef = {
        id: 'pat_poly',
        name: 'TEST_POLYGON_PAD',
        library: 'lib_user',
        description: 'Полигональная площадка',
        courtyard: { width: 10, height: 10 },
        model3d: { shape: 'Box', bodyWidth: 5, bodyLength: 5, bodyHeight: 2, color: '#222' },
        pads: [
          {
            id: 'pad_poly1',
            number: '1',
            type: 'SMD',
            shape: 'Polygon',
            x: 0,
            y: 0,
            width: 2.5,
            height: 2.0,
            layer: 'Top',
            solderMaskExpansion: 0.05,
            polygonPoints: [
              { x: -1.0, y: -1.0 },
              { x: 1.0, y: -1.0 },
              { x: 1.25, y: -0.75 },
              { x: 1.25, y: 0.75 },
              { x: 1.0, y: 1.0 },
              { x: -1.0, y: 1.0 },
              { x: -1.25, y: 0.75 },
              { x: -1.25, y: -0.75 }
            ]
          }
        ],
        graphics: []
      };

      const issues = validatePattern(polyPadPat);
      expect(issues).toEqual([]);
    });
  });
});
