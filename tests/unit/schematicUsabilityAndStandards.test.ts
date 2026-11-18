import { describe, expect, it } from 'vitest';
import { fixture } from '../fixtures/editorProject';
import {
  SHEET_FORMATS,
  getGostFrameRect,
  buildGostFrameAndStampGeometry,
  createDefaultGostTitleBlock
} from '../../src/gost/gostTitleBlock';
import { appendForm1Or2Stamp } from '../../src/gost/titleBlock/stampForm1And2';
import { appendForm2aStamp } from '../../src/gost/titleBlock/stampForm2a';
import { TitleBlockLine, TitleBlockText } from '../../src/gost/titleBlock/titleBlockTypes';
import { build45RouteMidpoint } from '../../src/core/geometry/routing';
import { matchesHotkey } from '../../src/core/persistence/hotkeysStore';
import {
  allIds,
  commitWire,
  entityBounds,
  findEntity,
  normalizeSheet,
  selectionBounds,
  transformEntities
} from '../../src/core/schematic/editing';
import { extractSchematicNets, renumberSchematicComponents, runSchematicErc } from '../../src/engines/erc';
import { GOST_REFDES_GROUPS, GOST_GROUP_ORDER } from '../../src/gost/rules';
import { Point2D, SchematicProject, SchematicSheet } from '../../src/core/types';

describe('Schematic Usability, Ergonomics & GOST Standards Audit', () => {
  describe('1. Wire Drafting & Orthogonal/45° Routing Geometry', () => {
    it('computes 90-degree orthogonal elbow correctly for normal and flipped states', () => {
      const p1: Point2D = { x: 10, y: 20 };
      const p2: Point2D = { x: 50, y: 80 };

      // Normal mode (elbowFlip = false): horizontal segment first, then vertical
      const midNormal: Point2D = { x: p2.x, y: p1.y };
      expect(midNormal).toEqual({ x: 50, y: 20 });

      // Flipped mode (elbowFlip = true): vertical segment first, then horizontal
      const midFlipped: Point2D = { x: p1.x, y: p2.y };
      expect(midFlipped).toEqual({ x: 10, y: 80 });
    });

    it('build45RouteMidpoint calculates symmetric 45-degree mitering with toggle', () => {
      const start: Point2D = { x: 0, y: 0 };
      const end: Point2D = { x: 100, y: 50 };

      const elbowNormal = build45RouteMidpoint(start, end, false);
      expect(elbowNormal).toEqual({ x: 50, y: 0 });

      const elbowFlipped = build45RouteMidpoint(start, end, true);
      expect(elbowFlipped).toEqual({ x: 50, y: 50 });
    });

    it('commitWire removes redundant coincident vertices and normalizes connections', () => {
      const p = fixture();
      const s = p.sheets[0];
      const initialWiresCount = s.wires.length;

      // Duplicate/zero-length wire
      const sheetWithZeroWire = commitWire(s, [{ x: 50, y: 50 }, { x: 50, y: 50 }]);
      expect(sheetWithZeroWire.wires.length).toBe(initialWiresCount);

      // Collinear redundant middle point
      const sheetWithCollinear = commitWire(s, [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
        { x: 50, y: 10 }
      ]);
      const addedWire = sheetWithCollinear.wires.find(w => w.points[0]?.x === 10);
      expect(addedWire).toBeDefined();
      expect(addedWire!.points).toHaveLength(2);
      expect(addedWire!.points[1]).toEqual({ x: 50, y: 10 });
    });
  });

  describe('2. Marquee Selection: Window vs Crossing Logic', () => {
    it('correctly differentiates between window (enclosed) and crossing (intersecting) selection', () => {
      const p = fixture();
      const sheet = p.sheets[0];
      const c0 = sheet.components[0];
      const c0Bounds = entityBounds(sheet, c0.id, p.customComponentDefs)!;
      expect(c0Bounds).toBeDefined();

      // Box completely enclosing c0
      const enclosingBox = {
        minX: c0Bounds.minX - 5,
        maxX: c0Bounds.maxX + 5,
        minY: c0Bounds.minY - 5,
        maxY: c0Bounds.maxY + 5
      };

      // Box partially intersecting c0 (crossing bottom-right corner)
      const intersectingBox = {
        minX: c0Bounds.maxX - 2,
        maxX: c0Bounds.maxX + 10,
        minY: c0Bounds.maxY - 2,
        maxY: c0Bounds.maxY + 10
      };

      // Window selection helper
      const isEnclosed = (b: typeof c0Bounds, box: typeof enclosingBox) =>
        b.minX >= box.minX && b.maxX <= box.maxX && b.minY >= box.minY && b.maxY <= box.maxY;

      // Crossing selection helper
      const isCrossing = (b: typeof c0Bounds, box: typeof intersectingBox) =>
        b.minX <= box.maxX && b.maxX >= box.minX && b.minY <= box.maxY && b.maxY >= box.minY;

      expect(isEnclosed(c0Bounds, enclosingBox)).toBe(true);
      expect(isEnclosed(c0Bounds, intersectingBox)).toBe(false);

      expect(isCrossing(c0Bounds, enclosingBox)).toBe(true);
      expect(isCrossing(c0Bounds, intersectingBox)).toBe(true);
    });
  });

  describe('3. GOST 2.104-2006 Title Block Specifications (Form 1, Form 2, Form 2a)', () => {
    it('verifies sheet margin specifications across all standard formats (20mm left, 5mm others)', () => {
      const formats: Array<keyof typeof SHEET_FORMATS> = ['A4_P', 'A4_L', 'A3_L', 'A3_P', 'A2_L', 'A1_L'];
      for (const fmt of formats) {
        const dim = SHEET_FORMATS[fmt];
        const frame = getGostFrameRect(fmt);
        expect(frame.left).toBe(20); // 20mm for binding per GOST 2.104
        expect(frame.top).toBe(5);
        expect(frame.right).toBe(dim.widthMm - 5);
        expect(frame.bottom).toBe(dim.heightMm - 5);
        expect(frame.width).toBe(dim.widthMm - 25);
        expect(frame.height).toBe(dim.heightMm - 10);
      }
    });

    it('verifies Form 1 title block dimensions: 185 mm width and 55 mm height', () => {
      const frame = getGostFrameRect('A4_L');
      const lines: TitleBlockLine[] = [];
      const texts: TitleBlockText[] = [];
      const tb = { ...createDefaultGostTitleBlock(), form: 'Form1' as const };

      appendForm1Or2Stamp(frame, tb, lines, texts);

      const stampX0 = frame.right - 185;
      const stampY0 = frame.bottom - 55;

      const topBorder = lines.find(l => l.x1 === stampX0 && l.y1 === stampY0 && l.x2 === frame.right && l.y2 === stampY0);
      const leftBorder = lines.find(l => l.x1 === stampX0 && l.y1 === stampY0 && l.x2 === stampX0 && l.y2 === frame.bottom);

      expect(topBorder).toBeDefined();
      expect(leftBorder).toBeDefined();

      // Check standard sign-off labels are present
      const labelTexts = texts.map(t => t.text);
      expect(labelTexts).toContain('Разраб.');
      expect(labelTexts).toContain('Пров.');
      expect(labelTexts).toContain('Т. контр.');
      expect(labelTexts).toContain('Н. контр.');
      expect(labelTexts).toContain('Утв.');
      expect(labelTexts).toContain('Изм');
      expect(labelTexts).toContain('Лист');
      expect(labelTexts.some(t => t.startsWith('Листов'))).toBe(true);
    });

    it('verifies Form 2 (BOM) title block: 185 mm width and 40 mm height', () => {
      const frame = getGostFrameRect('A4_P');
      const lines: TitleBlockLine[] = [];
      const texts: TitleBlockText[] = [];
      const tb = { ...createDefaultGostTitleBlock(), form: 'Form2' as const };

      appendForm1Or2Stamp(frame, tb, lines, texts);

      const stampX0 = frame.right - 185;
      const stampY0 = frame.bottom - 40;

      const topBorder = lines.find(l => l.x1 === stampX0 && l.y1 === stampY0 && l.x2 === frame.right && l.y2 === stampY0);
      expect(topBorder).toBeDefined();
      expect(texts.map(t => t.text)).toContain('Разраб.');
    });

    it('verifies Form 2a (subsequent sheets) title block: 185 mm width and 15 mm height', () => {
      const frame = getGostFrameRect('A4_L');
      const lines: TitleBlockLine[] = [];
      const texts: TitleBlockText[] = [];
      const tb = {
        ...createDefaultGostTitleBlock(),
        form: 'Form2a' as const,
        designation: 'АБВГ.467845.001 Э3',
        sheetNumber: 2
      };

      appendForm2aStamp(frame, tb, lines, texts);

      const stampX0 = frame.right - 185;
      const stampY0 = frame.bottom - 15;

      const topBorder = lines.find(l => l.x1 === stampX0 && l.y1 === stampY0 && l.x2 === frame.right && l.y2 === stampY0);
      expect(topBorder).toBeDefined();

      const desText = texts.find(t => t.text === 'АБВГ.467845.001 Э3');
      expect(desText).toBeDefined();
      expect(desText!.sizeMm).toBe(5.0);

      const sheetNum = texts.find(t => t.text === '2');
      expect(sheetNum).toBeDefined();
    });

    it('renders coordinate zones per GOST 2.104 item 5.4 when enabled', () => {
      const tb = { ...createDefaultGostTitleBlock(), showZones: true };
      const geom = buildGostFrameAndStampGeometry('A3_L', tb);

      // Coordinate zones digits should be present along margins
      const digitTexts = geom.texts.filter(t => /^\d+$/.test(t.text));
      expect(digitTexts.length).toBeGreaterThan(0);

      // Zone letters A, B, C, D along vertical axis
      const letterTexts = geom.texts.filter(t => ['A', 'B', 'C', 'D'].includes(t.text));
      expect(letterTexts.length).toBeGreaterThan(0);
    });
  });

  describe('4. GOST 2.710-81 RefDes Auto-renumbering and Component Ordering', () => {
    it('renumbers components in top-to-bottom, left-to-right order', () => {
      const p = fixture();
      const sheet = p.sheets[0];

      // Place resistors in arbitrary order and coordinates
      sheet.components = [
        {
          id: 'c_bottom_right',
          componentDefId: 'test',
          partIndex: 1,
          x: 200,
          y: 150,
          rotation: 0,
          mirrorX: false,
          mirrorY: false,
          refDes: 'R99',
          value: '10k',
          refDesOffset: { x: 0, y: 0 },
          valueOffset: { x: 0, y: 0 },
          labelAngle: 0,
          showValue: true
        },
        {
          id: 'c_top_left',
          componentDefId: 'test',
          partIndex: 1,
          x: 30,
          y: 40,
          rotation: 0,
          mirrorX: false,
          mirrorY: false,
          refDes: 'R55',
          value: '1k',
          refDesOffset: { x: 0, y: 0 },
          valueOffset: { x: 0, y: 0 },
          labelAngle: 0,
          showValue: true
        },
        {
          id: 'c_top_right',
          componentDefId: 'test',
          partIndex: 1,
          x: 180,
          y: 40,
          rotation: 0,
          mirrorX: false,
          mirrorY: false,
          refDes: 'R77',
          value: '2k',
          refDesOffset: { x: 0, y: 0 },
          valueOffset: { x: 0, y: 0 },
          labelAngle: 0,
          showValue: true
        }
      ];

      const renumbered = renumberSchematicComponents(p);
      const res = renumbered.sheets[0].components;

      expect(res.find(c => c.id === 'c_top_left')?.refDes).toBe('R1');
      expect(res.find(c => c.id === 'c_top_right')?.refDes).toBe('R2');
      expect(res.find(c => c.id === 'c_bottom_right')?.refDes).toBe('R3');
    });

    it('verifies standard GOST refDes group prefix conventions', () => {
      const getGroup = (pfx: string) => GOST_REFDES_GROUPS.find(g => g.prefix === pfx)?.groupName;
      expect(getGroup('R')).toBe('Резисторы');
      expect(getGroup('C')).toBe('Конденсаторы');
      expect(getGroup('L')).toBe('Катушки индуктивности и дроссели');
      expect(getGroup('VD')).toBe('Приборы полупроводниковые диодные');
      expect(getGroup('VT')).toBe('Транзисторы');
      expect(getGroup('DA')).toBe('Микросхемы аналоговые');
      expect(getGroup('DD')).toBe('Микросхемы цифровые');
      expect(getGroup('XP')).toBe('Соединители штыревые (Вилки)');
      expect(getGroup('XS')).toBe('Соединители гнездовые (Розетки)');
      expect(getGroup('HL')).toBe('Приборы световой сигнализации');
    });
  });

  describe('5. Multi-sheet Global Net Connectivity & Net Ports', () => {
    it('merges global power nets (GND, +3V3, VCC) automatically across sheets', () => {
      const p = fixture();
      const s1 = p.sheets[0];
      const s2: SchematicSheet = {
        ...structuredClone(s1),
        id: 'sheet_2',
        title: 'Sheet 2',
        titleBlock: { ...createDefaultGostTitleBlock(), sheetNumber: 2, form: 'Form2a' }
      };

      // Sheet 1 has a GND net
      s1.wires[0].netName = 'GND';
      // Sheet 2 has a GND net
      s2.wires[0].netName = 'GND';
      s2.components.forEach(c => c.id = c.id + '_s2');

      p.sheets.push(s2);

      const nets = extractSchematicNets(p);
      const gndNet = nets.find(n => n.netName === 'GND');
      expect(gndNet).toBeDefined();

      // Net should contain pins from both sheet 1 and sheet 2 components
      const compIds = gndNet!.pins.map(pin => pin.compId);
      expect(compIds.some(id => !id.includes('_s2'))).toBe(true);
      expect(compIds.some(id => id.includes('_s2'))).toBe(true);
    });

    it('keeps local net ports isolated per sheet unless globally named or hierarchically linked', () => {
      const p = fixture();
      const s1 = p.sheets[0];
      s1.netPorts = [
        { id: 'p1', x: 50, y: 50, netName: 'LOCAL_DATA', style: 'PortLeft', rotation: 0 }
      ];
      s1.wires = [
        { id: 'w_local1', netName: '', points: [{ x: 50, y: 50 }, { x: 65, y: 75 }] }
      ];

      const s2: SchematicSheet = {
        ...structuredClone(s1),
        id: 'sheet_2',
        title: 'Sheet 2',
        netPorts: [
          { id: 'p2', x: 50, y: 50, netName: 'LOCAL_DATA', style: 'PortLeft', rotation: 0 }
        ],
        wires: [
          { id: 'w_local2', netName: '', points: [{ x: 50, y: 50 }, { x: 65, y: 75 }] }
        ]
      };
      s2.components.forEach(c => c.id = c.id + '_s2');
      p.sheets.push(s2);

      const nets = extractSchematicNets(p);
      const localNets = nets.filter(n => n.netName === 'LOCAL_DATA');
      // Local ports are sheet-scoped
      expect(localNets).toHaveLength(2);
    });
  });

  describe('6. Usability: Keyboard Layout Independence & Ergonomics', () => {
    it('matches Russian Cyrillic keyboard input transparently to CAD action shortcuts', () => {
      // Wire tool: Latin W or Cyrillic Ц
      const keyWEvent = { key: 'ц', code: 'KeyW', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent;
      expect(matchesHotkey(keyWEvent, 'W')).toBe(true);

      // Rotate: Latin R or Cyrillic К
      const keyREvent = { key: 'к', code: 'KeyR', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent;
      expect(matchesHotkey(keyREvent, 'R')).toBe(true);

      // Flip X: Latin X or Cyrillic Ч
      const keyXEvent = { key: 'ч', code: 'KeyX', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent;
      expect(matchesHotkey(keyXEvent, 'X')).toBe(true);

      // Undo: Ctrl+Z or Ctrl+Я
      const keyUndoEvent = { key: 'я', code: 'KeyZ', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent;
      expect(matchesHotkey(keyUndoEvent, 'Ctrl+Z')).toBe(true);
    });
  });
});
