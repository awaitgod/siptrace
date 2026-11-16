import { PatternDef } from '../../../core/types';
import { generateParametricPattern } from '../../../engines/patternGenerator';
import { makePattern } from './patternFactory';

export const connPatterns: PatternDef[] = [
  makePattern(
    'PAT_PLS_2',
    'ПЛС-2 (вилка 2,54 мм)',
    'Корпуса соединителей и реле (ГОСТ)',
    'ПЛС-2 / ОНП-КГ',
    'Штыревой соединитель 2 контакта, шаг 2.54 мм',
    generateParametricPattern({
      family: 'Header',
      name: 'ПЛС-2 (вилка 2,54 мм)',
      pinCount: 2,
      pitch: 2.54,
      rowSpacing: 0,
      padWidth: 1.7,
      padHeight: 1.7,
      holeDiameter: 1.0,
      bodyWidth: 2.54,
      bodyLength: 5.08,
      bodyHeight: 8.5,
      densityLevel: 'B'
    }),
    '#181b1f'
  ),
  makePattern(
    'PAT_PLS_4',
    'ПЛС-4 (вилка 2,54 мм)',
    'Корпуса соединителей и реле (ГОСТ)',
    'ПЛС-4 / ОНЦ',
    'Штыревой соединитель 4 контакта, шаг 2.54 мм',
    generateParametricPattern({
      family: 'Header',
      name: 'ПЛС-4 (вилка 2,54 мм)',
      pinCount: 4,
      pitch: 2.54,
      rowSpacing: 0,
      padWidth: 1.7,
      padHeight: 1.7,
      holeDiameter: 1.0,
      bodyWidth: 2.54,
      bodyLength: 10.16,
      bodyHeight: 8.5,
      densityLevel: 'B'
    }),
    '#181b1f'
  ),
  makePattern(
    'PAT_PLS_5',
    'ПЛС-5 (вилка 2,54 мм)',
    'Корпуса соединителей и реле (ГОСТ)',
    'ПЛС-5 / ОНЦ-5',
    'Штыревой соединитель 5 контактов, шаг 2.54 мм',
    generateParametricPattern({
      family: 'Header',
      name: 'ПЛС-5 (вилка 2,54 мм)',
      pinCount: 5,
      pitch: 2.54,
      rowSpacing: 0,
      padWidth: 1.7,
      padHeight: 1.7,
      holeDiameter: 1.0,
      bodyWidth: 2.54,
      bodyLength: 12.7,
      bodyHeight: 8.5,
      densityLevel: 'B'
    }),
    '#181b1f'
  ),
  makePattern(
    'PAT_KZ_2_5MM',
    'КЗ-2 (клеммник шаг 5,0 мм)',
    'Корпуса соединителей и реле (ГОСТ)',
    'КЗ-2-5,0',
    'Клеммник винтовой 2-контактный шаг 5.0 мм',
    generateParametricPattern({
      family: 'Header',
      name: 'КЗ-2 (клеммник шаг 5,0 мм)',
      pinCount: 2,
      pitch: 5.0,
      rowSpacing: 0,
      padWidth: 2.6,
      padHeight: 2.6,
      holeDiameter: 1.3,
      bodyWidth: 7.5,
      bodyLength: 10.4,
      bodyHeight: 10.0,
      densityLevel: 'B'
    }),
    '#196f3d'
  ),
  makePattern(
    'PAT_KZ_4_5MM',
    'КЗ-4 (клеммник шаг 5,0 мм)',
    'Корпуса соединителей и реле (ГОСТ)',
    'КЗ-4-5,0',
    'Клеммник винтовой 4-контактный шаг 5.0 мм (линия RS-485)',
    generateParametricPattern({
      family: 'Header',
      name: 'КЗ-4 (клеммник шаг 5,0 мм)',
      pinCount: 4,
      pitch: 5.0,
      rowSpacing: 0,
      padWidth: 2.6,
      padHeight: 2.6,
      holeDiameter: 1.3,
      bodyWidth: 7.5,
      bodyLength: 20.4,
      bodyHeight: 10.0,
      densityLevel: 'B'
    }),
    '#196f3d'
  ),
  makePattern(
    'PAT_KZ_5_5MM',
    'КЗ-5 (клеммник шаг 5,0 мм)',
    'Корпуса соединителей и реле (ГОСТ)',
    'КЗ-5-5,0',
    'Клеммник винтовой 5-контактный шаг 5.0 мм',
    generateParametricPattern({
      family: 'Header',
      name: 'КЗ-5 (клеммник шаг 5,0 мм)',
      pinCount: 5,
      pitch: 5.0,
      rowSpacing: 0,
      padWidth: 2.6,
      padHeight: 2.6,
      holeDiameter: 1.3,
      bodyWidth: 7.5,
      bodyLength: 25.4,
      bodyHeight: 10.0,
      densityLevel: 'B'
    }),
    '#196f3d'
  ),
  makePattern(
    'PAT_PLD_10',
    'ПЛД-10 (2×5, шаг 2,54 мм)',
    'Корпуса соединителей и реле (ГОСТ)',
    'ПЛД-10 (JTAG/SWD)',
    'Двухрядный разъём 2×5 (10 контактов), шаг 2.54 мм',
    generateParametricPattern({
      family: 'Header',
      name: 'ПЛД-10 (2×5, шаг 2,54 мм)',
      pinCount: 10,
      pitch: 2.54,
      rowSpacing: 2.54,
      padWidth: 1.65,
      padHeight: 1.65,
      holeDiameter: 1.0,
      bodyWidth: 6.4,
      bodyLength: 14.0,
      bodyHeight: 8.5,
      densityLevel: 'B'
    }),
    '#1f2329'
  ),
  {
    id: 'PAT_RES49',
    name: 'РЭС49 (реле 5-выв.)',
    library: 'Корпуса соединителей и реле (ГОСТ)',
    gostName: 'РС4.569.421 / РЭС49',
    description: 'Реле электромагнитное герметичное малогабаритное РЭС49 (2 обмотка + 3 контактных вывода)',
    pads: [
      { id: 'p1', number: '1', type: 'THT', shape: 'Rect', x: -5.0, y: -2.5, width: 1.6, height: 1.6, holeDiameter: 0.8, layer: 'All' },
      { id: 'p2', number: '2', type: 'THT', shape: 'Round', x: -5.0, y: 2.5, width: 1.6, height: 1.6, holeDiameter: 0.8, layer: 'All' },
      { id: 'p3', number: '3', type: 'THT', shape: 'Round', x: 5.0, y: 0, width: 1.6, height: 1.6, holeDiameter: 0.8, layer: 'All' },
      { id: 'p4', number: '4', type: 'THT', shape: 'Round', x: 0, y: -2.5, width: 1.6, height: 1.6, holeDiameter: 0.8, layer: 'All' },
      { id: 'p5', number: '5', type: 'THT', shape: 'Round', x: 0, y: 2.5, width: 1.6, height: 1.6, holeDiameter: 0.8, layer: 'All' }
    ],
    graphics: [{ type: 'rect', layer: 'TopSilk', x: -7.5, y: -3.8, w: 15.0, h: 7.6, width: 0.18 }],
    courtyard: { width: 16.0, height: 8.8 },
    model3d: { shape: 'Relay', bodyWidth: 15.0, bodyLength: 7.5, bodyHeight: 11.0, color: '#7f8c8d' }
  },
  {
    id: 'PAT_KN_TACT',
    name: 'КН-1 (кнопка тактовая 6×6)',
    library: 'Корпуса соединителей и реле (ГОСТ)',
    gostName: 'Кнопка тактовая 6×6 мм',
    description: 'Тактовая кнопка ПКн / ТК-6 6×6 мм, шаг 6.5×4.5 мм',
    pads: [
      { id: 'p1', number: '1', type: 'THT', shape: 'Rect', x: -3.25, y: -2.25, width: 1.8, height: 1.8, holeDiameter: 1.0, layer: 'All' },
      { id: 'p2', number: '2', type: 'THT', shape: 'Round', x: 3.25, y: -2.25, width: 1.8, height: 1.8, holeDiameter: 1.0, layer: 'All' },
      { id: 'p3', number: '3', type: 'THT', shape: 'Round', x: -3.25, y: 2.25, width: 1.8, height: 1.8, holeDiameter: 1.0, layer: 'All' },
      { id: 'p4', number: '4', type: 'THT', shape: 'Round', x: 3.25, y: 2.25, width: 1.8, height: 1.8, holeDiameter: 1.0, layer: 'All' }
    ],
    graphics: [
      { type: 'rect', layer: 'TopAssembly', x: -3.1, y: -3.1, w: 6.2, h: 6.2, width: 0.12 },
      { type: 'line', layer: 'TopSilk', x1: -2.0, y1: -3.1, x2: 2.0, y2: -3.1, width: 0.18 },
      { type: 'line', layer: 'TopSilk', x1: -2.0, y1: 3.1, x2: 2.0, y2: 3.1, width: 0.18 },
      { type: 'line', layer: 'TopSilk', x1: -3.1, y1: -1.0, x2: -3.1, y2: 1.0, width: 0.18 },
      { type: 'line', layer: 'TopSilk', x1: 3.1, y1: -1.0, x2: 3.1, y2: 1.0, width: 0.18 },
      { type: 'circle', layer: 'TopSilk', cx: 0, cy: 0, r: 1.6, width: 0.15 }
    ],
    courtyard: { width: 8.6, height: 6.8 },
    model3d: { shape: 'SwitchTact', bodyWidth: 6.0, bodyLength: 6.0, bodyHeight: 4.5, color: '#22262b' }
  },
  makePattern(
    'PAT_RK169',
    'РК-169 (кварц HC-49S, шаг 4,88)',
    'Корпуса соединителей и реле (ГОСТ)',
    'РК-169 / РГ-07',
    'Кварцевый резонатор в низкопрофильном металлическом корпусе',
    generateParametricPattern({
      family: 'RadialTHT',
      name: 'РК-169 (кварц HC-49S)',
      pinCount: 2,
      pitch: 4.88,
      rowSpacing: 4.88,
      padWidth: 1.8,
      padHeight: 1.8,
      holeDiameter: 0.9,
      bodyWidth: 4.6,
      bodyLength: 11.2,
      bodyHeight: 3.5,
      densityLevel: 'B',
      polarized: false,
      bodyShape: 'rect'
    }),
    '#bdc3c7'
  ),
  {
    id: 'PAT_NETTIE_0805',
    name: 'Перемычка AGND-DGND (Net-Tie 0805)',
    library: 'Корпуса соединителей и реле (ГОСТ)',
    gostName: 'Перемычка печатная П2012',
    description: 'Печатная перемычка разделения полигонов цепей без разрыва на плате',
    pads: [
      { id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: -0.75, y: 0, width: 0.95, height: 1.3, layer: 'Top' },
      { id: 'p2', number: '2', type: 'SMD', shape: 'Rect', x: 0.75, y: 0, width: 0.95, height: 1.3, layer: 'Top' }
    ],
    graphics: [
      { type: 'rect', layer: 'TopSilk', x: -1.45, y: -0.9, w: 2.9, h: 1.8, width: 0.12 },
      { type: 'line', layer: 'TopCopper', x1: -0.5, y1: 0, x2: 0.5, y2: 0, width: 0.45 },
      { type: 'rect', layer: 'Courtyard', x: -1.7, y: -1.1, w: 3.4, h: 2.2, width: 0.1 }
    ],
    courtyard: { width: 3.4, height: 2.2 },
    model3d: { shape: 'ChipSMD', bodyWidth: 1.25, bodyLength: 2.0, bodyHeight: 0.2, color: '#d49a35' }
  },
  {
    id: 'PAT_MTG_M3',
    name: 'Отверстие крепёжное М3 (Ø3,2 мм)',
    library: 'Корпуса соединителей и реле (ГОСТ)',
    gostName: 'Отв. крепёжное М3 (ГОСТ 11284-75)',
    description: 'Металлизированная крепёжная площадка под винт М3 с зоной изоляции головки Ø6,2 мм',
    pads: [
      { id: 'p1', number: '1', type: 'MountingHole', shape: 'Round', x: 0, y: 0, width: 5.8, height: 5.8, holeDiameter: 3.2, layer: 'All' }
    ],
    graphics: [
      { type: 'circle', layer: 'TopSilk', cx: 0, cy: 0, r: 3.2, width: 0.15 },
      { type: 'circle', layer: 'Courtyard', cx: 0, cy: 0, r: 3.6, width: 0.1 }
    ],
    courtyard: { width: 7.2, height: 7.2 },
    model3d: { shape: 'Cylinder', bodyWidth: 5.8, bodyLength: 5.8, bodyHeight: 0.4, color: '#d4af37' }
  },
  {
    id: 'PAT_USBC_16P',
    name: 'Разъём USB Type-C SMD 16 конт.',
    library: 'Корпуса соединителей и реле (ГОСТ)',
    gostName: 'ОНЦ-USB-C 16-SMD (IEC 62680)',
    description: 'Розетка USB Type-C 16 контактов поверхностный монтаж + 4 крепёжных вывода экрана',
    pads: [
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `p_${i + 1}`, number: `${i + 1}`, type: 'SMD' as const, shape: 'RoundedRect' as const,
        x: -2.75 + i * 0.5, y: -3.2, width: 0.3, height: 1.15, layer: 'Top' as const
      })),
      { id: 's1', number: 'S1', type: 'THT', shape: 'Oval', x: -4.32, y: -2.0, width: 1.15, height: 1.8, holeDiameter: 0.6, layer: 'All' },
      { id: 's2', number: 'S2', type: 'THT', shape: 'Oval', x: 4.32, y: -2.0, width: 1.15, height: 1.8, holeDiameter: 0.6, layer: 'All' },
      { id: 's3', number: 'S3', type: 'THT', shape: 'Oval', x: -4.32, y: 1.4, width: 1.15, height: 2.0, holeDiameter: 0.6, layer: 'All' },
      { id: 's4', number: 'S4', type: 'THT', shape: 'Oval', x: 4.32, y: 1.4, width: 1.15, height: 2.0, holeDiameter: 0.6, layer: 'All' }
    ],
    graphics: [
      { type: 'rect', layer: 'TopAssembly', x: -4.5, y: -3.6, w: 9.0, h: 7.3, width: 0.12 },
      { type: 'line', layer: 'TopSilk', x1: -3.5, y1: 3.7, x2: 3.5, y2: 3.7, width: 0.18 },
      { type: 'line', layer: 'TopSilk', x1: -4.5, y1: -0.9, x2: -4.5, y2: 0.2, width: 0.18 },
      { type: 'line', layer: 'TopSilk', x1: 4.5, y1: -0.9, x2: 4.5, y2: 0.2, width: 0.18 },
      { type: 'circle', layer: 'TopSilk', cx: -3.2, cy: -3.3, r: 0.2, width: 0.15, fill: true },
      { type: 'rect', layer: 'Courtyard', x: -5.1, y: -4.2, w: 10.2, h: 8.4, width: 0.1 }
    ],
    courtyard: { width: 10.2, height: 8.4 },
    model3d: { shape: 'Header', bodyWidth: 8.9, bodyLength: 7.3, bodyHeight: 3.2, color: '#aeb6bf' }
  },
  {
    id: 'PAT_DB9_F',
    name: 'ОНЦ / DRB-9F (розетка D-SUB 9 конт.)',
    library: 'Корпуса соединителей и реле (ГОСТ)',
    gostName: 'ОНЦ / СНП-9 угл. THT',
    description: 'Угловой соединитель 9 контактов для интерфейса RS-232 / RS-485 с фиксаторами',
    pads: [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `p_${i + 1}`, number: `${i + 1}`, type: 'THT' as const, shape: (i === 0 ? 'Rect' : 'Round') as 'Rect' | 'Round',
        x: -5.54 + i * 2.77, y: -1.42, width: 1.7, height: 1.7, holeDiameter: 1.0, layer: 'All' as const
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `p_${i + 6}`, number: `${i + 6}`, type: 'THT' as const, shape: 'Round' as const,
        x: -4.155 + i * 2.77, y: 1.42, width: 1.7, height: 1.7, holeDiameter: 1.0, layer: 'All' as const
      })),
      { id: 'm1', number: '', type: 'MountingHole', shape: 'Round', x: -12.5, y: 0, width: 4.5, height: 4.5, holeDiameter: 3.2, layer: 'All' },
      { id: 'm2', number: '', type: 'MountingHole', shape: 'Round', x: 12.5, y: 0, width: 4.5, height: 4.5, holeDiameter: 3.2, layer: 'All' }
    ],
    graphics: [
      { type: 'rect', layer: 'TopSilk', x: -15.4, y: -6.5, w: 30.8, h: 12.6, width: 0.2 },
      { type: 'rect', layer: 'Courtyard', x: -16.0, y: -7.2, w: 32.0, h: 14.0, width: 0.1 }
    ],
    courtyard: { width: 32.0, height: 14.0 },
    model3d: { shape: 'Box', bodyWidth: 30.8, bodyLength: 12.5, bodyHeight: 12.5, color: '#2b5797' }
  }
];
