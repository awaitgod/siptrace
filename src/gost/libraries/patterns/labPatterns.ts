import { PadDef, PatternDef, PatternGraphic } from '../../../core/types';
import { generateParametricPattern } from '../../../engines/patternGenerator';
import { makePattern } from './patternFactory';

const makeLinearHeader = (
  id: string,
  name: string,
  gostName: string,
  desc: string,
  pins: number,
  horizontal = false
): PatternDef => {
  const pitch = 2.54;
  const start = -((pins - 1) * pitch) / 2;
  const pads: PadDef[] = Array.from({ length: pins }, (_, i) => ({
    id: `p_${i + 1}`,
    number: String(i + 1),
    type: 'THT',
    shape: i === 0 ? 'Rect' : 'Round',
    x: horizontal ? Number((start + i * pitch).toFixed(3)) : 0,
    y: horizontal ? 0 : Number((start + i * pitch).toFixed(3)),
    width: 1.75,
    height: 1.75,
    holeDiameter: 1.0,
    layer: 'All'
  }));
  const len = pins * pitch;
  const w = horizontal ? len : 2.54;
  const h = horizontal ? 2.54 : len;
  return {
    id,
    name,
    library: 'Соединители и модули (ГОСТ / Лаб.)',
    gostName,
    description: desc,
    pads,
    graphics: [
      { type: 'rect', layer: 'TopSilk', x: -w / 2, y: -h / 2, w, h, width: 0.16 },
      { type: 'rect', layer: 'TopAssembly', x: -w / 2, y: -h / 2, w, h, width: 0.1 }
    ],
    courtyard: { width: w + 1.0, height: h + 1.0 },
    model3d: { shape: 'Header', bodyWidth: w, bodyLength: h, bodyHeight: 8.5, color: '#1a1a1a' }
  };
};

const makeDualRowHeader = (
  id: string,
  name: string,
  gostName: string,
  desc: string,
  pinCount: number
): PatternDef =>
  makePattern(
    id,
    name,
    'Соединители и модули (ГОСТ / Лаб.)',
    gostName,
    desc,
    generateParametricPattern({
      family: 'Header',
      name,
      pinCount,
      pitch: 2.54,
      rowSpacing: 2.54,
      padWidth: 1.7,
      padHeight: 1.7,
      holeDiameter: 1.0,
      bodyWidth: 5.4,
      bodyLength: (pinCount / 2) * 2.54 + 2.0,
      bodyHeight: 8.8,
      densityLevel: 'B'
    }),
    '#141414'
  );

// Standard IC packages (DIP-28N, SOIC-16, SSOP-28, TQFP-32/44, SOT-223, SOT-23-5)
const PAT_DIP28_N = makePattern(
  'PAT_DIP28_N',
  'DIP-28 узкий (2119.28-1)',
  'Корпуса микросхем ИМС (ГОСТ)',
  'ГОСТ 17467-88',
  'Корпус ATmega8 / ATmega328P-PU (28 выводов, 7,62 мм)',
  generateParametricPattern({
    family: 'DIP',
    name: 'DIP-28N',
    pinCount: 28,
    pitch: 2.54,
    rowSpacing: 7.62,
    padWidth: 1.6,
    padHeight: 1.35,
    holeDiameter: 0.85,
    bodyWidth: 6.6,
    bodyLength: 35.6,
    bodyHeight: 3.8,
    densityLevel: 'B'
  })
);

const PAT_DIP40 = makePattern(
  'PAT_DIP40',
  'DIP-40 широкий (2123.40-1)',
  'Корпуса микросхем ИМС (ГОСТ)',
  'ГОСТ 17467-88',
  'Корпус ATmega16 / МПК (40 выводов, 15,24 мм)',
  generateParametricPattern({
    family: 'DIP',
    name: 'DIP-40',
    pinCount: 40,
    pitch: 2.54,
    rowSpacing: 15.24,
    padWidth: 1.65,
    padHeight: 1.4,
    holeDiameter: 0.85,
    bodyWidth: 13.8,
    bodyLength: 52.0,
    bodyHeight: 4.2,
    densityLevel: 'B'
  })
);

const PAT_SOIC16_N = makePattern(
  'PAT_SOIC16_N',
  'SOIC-16 (ГОСТ 4316.16)',
  'Корпуса микросхем ИМС (ГОСТ)',
  'МЭК 60191 / ГОСТ',
  'Планарный корпус 16 выводов (MAX232D, CH340G, 74HC595)',
  generateParametricPattern({
    family: 'SOIC',
    name: 'SOIC-16',
    pinCount: 16,
    pitch: 1.27,
    rowSpacing: 5.4,
    padWidth: 1.6,
    padHeight: 0.65,
    holeDiameter: 0,
    bodyWidth: 3.9,
    bodyLength: 10.0,
    bodyHeight: 1.6,
    densityLevel: 'B'
  })
);

const PAT_SSOP28 = makePattern(
  'PAT_SSOP28',
  'SSOP-28 (шаг 0,65 мм)',
  'Корпуса микросхем ИМС (ГОСТ)',
  'МЭК 60191',
  'Планарный узкий корпус FT232RL (28 выводов, 0,65 мм)',
  generateParametricPattern({
    family: 'SOIC',
    name: 'SSOP-28',
    pinCount: 28,
    pitch: 0.65,
    rowSpacing: 7.4,
    padWidth: 1.6,
    padHeight: 0.4,
    holeDiameter: 0,
    bodyWidth: 5.3,
    bodyLength: 10.2,
    bodyHeight: 1.8,
    densityLevel: 'B'
  })
);

const PAT_TQFP32 = makePattern(
  'PAT_TQFP32',
  'TQFP-32 (7×7 мм, шаг 0,8 мм)',
  'Корпуса микросхем ИМС (ГОСТ)',
  'ГОСТ Р / JEDEC',
  'Корпус ATmega8A-AU / ATmega328P-AU (32 вывода)',
  generateParametricPattern({
    family: 'QFP',
    name: 'TQFP-32',
    pinCount: 32,
    pitch: 0.8,
    rowSpacing: 8.8,
    padWidth: 1.5,
    padHeight: 0.48,
    holeDiameter: 0,
    bodyWidth: 7.0,
    bodyLength: 7.0,
    bodyHeight: 1.1,
    densityLevel: 'B'
  })
);

const PAT_TQFP44 = makePattern(
  'PAT_TQFP44',
  'TQFP-44 (10×10 мм, шаг 0,8 мм)',
  'Корпуса микросхем ИМС (ГОСТ)',
  'ГОСТ Р / JEDEC',
  'Корпус ATmega16A-AU (44 вывода)',
  generateParametricPattern({
    family: 'QFP',
    name: 'TQFP-44',
    pinCount: 44,
    pitch: 0.8,
    rowSpacing: 11.6,
    padWidth: 1.5,
    padHeight: 0.48,
    holeDiameter: 0,
    bodyWidth: 10.0,
    bodyLength: 10.0,
    bodyHeight: 1.1,
    densityLevel: 'B'
  })
);

const PAT_SOT223: PatternDef = {
  id: 'PAT_SOT223',
  name: 'SOT-223 (КТ-46 / Стабилизатор)',
  library: 'Корпуса полупроводников (ГОСТ)',
  gostName: 'ГОСТ 18472 / JEDEC',
  description: 'Силовой SMD стабилизатор NCP1117 / AMS1117 / MC33269D',
  pads: [
    { id: 'p1', number: '1', type: 'SMD', shape: 'RoundedRect', x: -2.3, y: 3.15, width: 1.1, height: 1.8, cornerRadius: 0.1, layer: 'Top' },
    { id: 'p2', number: '2', type: 'SMD', shape: 'RoundedRect', x: 0, y: 3.15, width: 1.1, height: 1.8, cornerRadius: 0.1, layer: 'Top' },
    { id: 'p3', number: '3', type: 'SMD', shape: 'RoundedRect', x: 2.3, y: 3.15, width: 1.1, height: 1.8, cornerRadius: 0.1, layer: 'Top' },
    { id: 'p4', number: '4', type: 'SMD', shape: 'Rect', x: 0, y: -3.15, width: 3.4, height: 1.9, layer: 'Top' }
  ],
  graphics: [
    { type: 'rect', layer: 'TopSilk', x: -3.3, y: -1.8, w: 6.6, h: 3.6, width: 0.15 },
    { type: 'circle', layer: 'TopSilk', cx: -2.3, cy: 1.4, r: 0.2, width: 0.15, fill: true },
    { type: 'rect', layer: 'TopAssembly', x: -3.25, y: -1.75, w: 6.5, h: 3.5, width: 0.1 }
  ],
  courtyard: { width: 7.4, height: 8.6 },
  model3d: { shape: 'SOIC', bodyWidth: 6.5, bodyLength: 3.5, bodyHeight: 1.65, color: '#1b1b1e' }
};

const PAT_SOT23_5: PatternDef = {
  id: 'PAT_SOT23_5',
  name: 'SOT-23-5 (LP2985-3.3)',
  library: 'Корпуса полупроводников (ГОСТ)',
  gostName: 'МЭК 60191',
  description: 'Миниатюрный 5-выводной SMD корпус (LP2985-33DBVR)',
  pads: [
    { id: 'p1', number: '1', type: 'SMD', shape: 'RoundedRect', x: -0.95, y: 1.3, width: 0.6, height: 1.05, cornerRadius: 0.08, layer: 'Top' },
    { id: 'p2', number: '2', type: 'SMD', shape: 'RoundedRect', x: 0, y: 1.3, width: 0.6, height: 1.05, cornerRadius: 0.08, layer: 'Top' },
    { id: 'p3', number: '3', type: 'SMD', shape: 'RoundedRect', x: 0.95, y: 1.3, width: 0.6, height: 1.05, cornerRadius: 0.08, layer: 'Top' },
    { id: 'p4', number: '4', type: 'SMD', shape: 'RoundedRect', x: 0.95, y: -1.3, width: 0.6, height: 1.05, cornerRadius: 0.08, layer: 'Top' },
    { id: 'p5', number: '5', type: 'SMD', shape: 'RoundedRect', x: -0.95, y: -1.3, width: 0.6, height: 1.05, cornerRadius: 0.08, layer: 'Top' }
  ],
  graphics: [
    { type: 'rect', layer: 'TopAssembly', x: -1.5, y: -0.85, w: 3.0, h: 1.7, width: 0.1 },
    { type: 'line', layer: 'TopSilk', x1: -1.55, y1: -0.6, x2: -1.55, y2: 0.6, width: 0.14 },
    { type: 'line', layer: 'TopSilk', x1: 1.55, y1: -0.6, x2: 1.55, y2: 0.6, width: 0.14 },
    { type: 'circle', layer: 'TopSilk', cx: -1.55, cy: 1.3, r: 0.18, width: 0.14, fill: true }
  ],
  courtyard: { width: 3.8, height: 4.0 },
  model3d: { shape: 'SOT23', bodyWidth: 2.9, bodyLength: 1.6, bodyHeight: 1.1, color: '#1b1b1e' }
};

// 7-Segment single-digit indicator (10 pins: 1..5 bottom left->right, 6..10 top right->left — exact Lab 7 pinout)
const PAT_DIP10_7SEG: PatternDef = {
  id: 'PAT_DIP10_7SEG',
  name: 'АЛС324 (DIP-10, 7-сегм.)',
  library: 'Соединители и модули (ГОСТ / Лаб.)',
  gostName: 'ГОСТ ИГ-7С',
  description: 'Одноразрядный 7-сегментный индикатор (10 выводов, 15,24 мм, шаг 2,54 мм)',
  pads: [
    ...[0, 1, 2, 3, 4].map((i): PadDef => ({
      id: `p_${i + 1}`,
      number: String(i + 1),
      type: 'THT',
      shape: i === 0 ? 'Rect' : 'Round',
      x: (i - 2) * 2.54,
      y: 7.62,
      width: 1.7,
      height: 1.7,
      holeDiameter: 0.9,
      layer: 'All'
    })),
    ...[0, 1, 2, 3, 4].map((i): PadDef => ({
      id: `p_${6 + i}`,
      number: String(6 + i),
      type: 'THT',
      shape: 'Round',
      x: (2 - i) * 2.54,
      y: -7.62,
      width: 1.7,
      height: 1.7,
      holeDiameter: 0.9,
      layer: 'All'
    }))
  ],
  graphics: [
    { type: 'rect', layer: 'TopSilk', x: -6.3, y: -9.5, w: 12.6, h: 19.0, width: 0.18 },
    { type: 'rect', layer: 'TopAssembly', x: -5.8, y: -9.0, w: 11.6, h: 18.0, width: 0.12 }
  ],
  courtyard: { width: 13.6, height: 20.0 },
  model3d: { shape: 'DIP', bodyWidth: 12.6, bodyLength: 19.0, bodyHeight: 8.0, color: '#2b2b2e' }
};

// LCD 16x2 module (80x36mm, 16 pins along top edge at 2.54mm + 4 mounting holes)
const PAT_LCD_16X2: PatternDef = {
  id: 'PAT_LCD_16X2',
  name: 'ЖКИ 16×2 (WH1602A / HD44780)',
  library: 'Соединители и модули (ГОСТ / Лаб.)',
  gostName: 'Модуль ЖКИ 80×36',
  description: 'Алфавитно-цифровой ЖКИ-дисплей 16×2 на контроллере HD44780 (16 выводов)',
  pads: [
    ...Array.from({ length: 16 }, (_, i): PadDef => ({
      id: `lcd_${i + 1}`,
      number: String(i + 1),
      type: 'THT',
      shape: i === 0 ? 'Rect' : 'Round',
      x: -32.0 + i * 2.54,
      y: -15.5,
      width: 1.8,
      height: 1.8,
      holeDiameter: 1.0,
      layer: 'All'
    })),
    ...([-37.5, 37.5].flatMap((mx) =>
      [-15.5, 15.5].map((my, idx): PadDef => ({
        id: `mh_${mx}_${idx}`,
        number: '',
        type: 'MountingHole',
        shape: 'Round',
        x: mx,
        y: my,
        width: 5.0,
        height: 5.0,
        holeDiameter: 3.0,
        layer: 'All'
      }))
    ))
  ],
  graphics: [
    { type: 'rect', layer: 'TopSilk', x: -40.0, y: -18.0, w: 80.0, h: 36.0, width: 0.2 },
    { type: 'rect', layer: 'TopAssembly', x: -35.6, y: -12.0, w: 71.2, h: 25.2, width: 0.15 }
  ],
  courtyard: { width: 82.0, height: 38.0 },
  model3d: { shape: 'Box', bodyWidth: 80.0, bodyLength: 36.0, bodyHeight: 11.5, color: '#1b5e30' }
};

// Incremental Encoder EC11 (3 signal pins + 2 switch pins + 2 mounting tabs)
const PAT_ENCODER_EC11: PatternDef = {
  id: 'PAT_ENCODER_EC11',
  name: 'Энкодер EC11 (KY-040 модуль 5 выв.)',
  library: 'Соединители и модули (ГОСТ / Лаб.)',
  gostName: 'EC11 / 5 выв.',
  description: 'Инкрементальный энкодер EC11 с кнопкой и крепёжными лапками',
  pads: [
    { id: 'e_clk', number: '1', type: 'THT', shape: 'Rect', x: -2.5, y: 7.5, width: 1.8, height: 1.8, holeDiameter: 1.0, layer: 'All' },
    { id: 'e_c', number: '5', type: 'THT', shape: 'Round', x: 0, y: 7.5, width: 1.8, height: 1.8, holeDiameter: 1.0, layer: 'All' },
    { id: 'e_dt', number: '2', type: 'THT', shape: 'Round', x: 2.5, y: 7.5, width: 1.8, height: 1.8, holeDiameter: 1.0, layer: 'All' },
    { id: 'e_sw', number: '3', type: 'THT', shape: 'Round', x: -2.5, y: -7.0, width: 1.8, height: 1.8, holeDiameter: 1.0, layer: 'All' },
    { id: 'e_vcc', number: '4', type: 'THT', shape: 'Round', x: 2.5, y: -7.0, width: 1.8, height: 1.8, holeDiameter: 1.0, layer: 'All' },
    { id: 'e_mh1', number: '', type: 'MountingHole', shape: 'Oval', x: -5.8, y: 0, width: 2.2, height: 3.4, holeDiameter: 1.6, layer: 'All' },
    { id: 'e_mh2', number: '', type: 'MountingHole', shape: 'Oval', x: 5.8, y: 0, width: 2.2, height: 3.4, holeDiameter: 1.6, layer: 'All' }
  ],
  graphics: [
    { type: 'rect', layer: 'TopSilk', x: -6.0, y: -6.2, w: 12.0, h: 12.4, width: 0.18 },
    { type: 'circle', layer: 'TopAssembly', cx: 0, cy: 0, r: 3.2, width: 0.15 }
  ],
  courtyard: { width: 14.5, height: 17.5 },
  model3d: { shape: 'Box', bodyWidth: 12.0, bodyLength: 12.4, bodyHeight: 20.0, color: '#3b6a99' }
};

// USB Type-B, USB Mini-B, DC Barrel Jack, DB-9F, Trimmer SP3-4, 1812 Fuse, Resistor Network
const PAT_USB_TYPE_B: PatternDef = {
  id: 'PAT_USB_TYPE_B',
  name: 'USB Type-B (THT разъем платы)',
  library: 'Соединители и модули (ГОСТ / Лаб.)',
  gostName: 'USB-B-S-S',
  description: 'Стандартный разъём USB Type-B (как на Arduino Uno / программаторах)',
  pads: [
    { id: 'u1', number: '1', type: 'THT', shape: 'Rect', x: -1.25, y: -1.0, width: 1.6, height: 1.6, holeDiameter: 0.9, layer: 'All' },
    { id: 'u2', number: '2', type: 'THT', shape: 'Round', x: -1.25, y: 1.0, width: 1.6, height: 1.6, holeDiameter: 0.9, layer: 'All' },
    { id: 'u3', number: '3', type: 'THT', shape: 'Round', x: 1.25, y: 1.0, width: 1.6, height: 1.6, holeDiameter: 0.9, layer: 'All' },
    { id: 'u4', number: '4', type: 'THT', shape: 'Round', x: 1.25, y: -1.0, width: 1.6, height: 1.6, holeDiameter: 0.9, layer: 'All' },
    { id: 's1', number: '', type: 'MountingHole', shape: 'Round', x: -6.0, y: 2.7, width: 3.2, height: 3.2, holeDiameter: 2.3, layer: 'All' },
    { id: 's2', number: '', type: 'MountingHole', shape: 'Round', x: 6.0, y: 2.7, width: 3.2, height: 3.2, holeDiameter: 2.3, layer: 'All' }
  ],
  graphics: [
    { type: 'rect', layer: 'TopAssembly', x: -6.0, y: -5.0, w: 12.0, h: 16.0, width: 0.15 },
    { type: 'rect', layer: 'TopSilk', x: -6.0, y: -5.0, w: 12.0, h: 16.0, width: 0.18 }
  ],
  courtyard: { width: 16.0, height: 23.0 },
  model3d: { shape: 'Box', bodyWidth: 12.0, bodyLength: 16.0, bodyHeight: 11.0, color: '#9ca4ae' }
};

const PAT_USB_MINI_B: PatternDef = {
  id: 'PAT_USB_MINI_B',
  name: 'USB Mini-B (SMD 5 выв.)',
  library: 'Соединители и модули (ГОСТ / Лаб.)',
  gostName: 'USB-MINI-5P',
  description: 'Разъём USB Mini-B SMD',
  pads: [
    ...Array.from({ length: 5 }, (_, i): PadDef => ({
      id: `um_${i + 1}`,
      number: String(i + 1),
      type: 'SMD',
      shape: 'RoundedRect',
      x: (i - 2) * 0.8,
      y: -3.2,
      width: 0.5,
      height: 1.8,
      cornerRadius: 0.06,
      layer: 'Top'
    })),
    { id: 'ms1', number: '', type: 'SMD', shape: 'Rect', x: -4.2, y: -1.0, width: 1.8, height: 2.2, layer: 'Top' },
    { id: 'ms2', number: '', type: 'SMD', shape: 'Rect', x: 4.2, y: -1.0, width: 1.8, height: 2.2, layer: 'Top' }
  ],
  graphics: [
    { type: 'rect', layer: 'TopAssembly', x: -3.85, y: -4.0, w: 7.7, h: 9.2, width: 0.12 },
    { type: 'line', layer: 'TopSilk', x1: -3.85, y1: 5.2, x2: 3.85, y2: 5.2, width: 0.15 },
    { type: 'line', layer: 'TopSilk', x1: -3.85, y1: 0.5, x2: -3.85, y2: 5.2, width: 0.15 },
    { type: 'line', layer: 'TopSilk', x1: 3.85, y1: 0.5, x2: 3.85, y2: 5.2, width: 0.15 },
    { type: 'circle', layer: 'TopSilk', cx: -2.2, cy: -3.6, r: 0.18, width: 0.15, fill: true }
  ],
  courtyard: { width: 10.6, height: 10.6 },
  model3d: { shape: 'Box', bodyWidth: 7.7, bodyLength: 9.2, bodyHeight: 3.9, color: '#9ea5ae' }
};

const PAT_DC_JACK_5_5: PatternDef = {
  id: 'PAT_DC_JACK_5_5',
  name: 'Гнездо питания DC-005 (5,5×2,1 мм)',
  library: 'Соединители и модули (ГОСТ / Лаб.)',
  gostName: 'DC-005',
  description: 'Штыревое гнездо внешнего питания 5,5×2,1 мм (3 контакта)',
  pads: [
    { id: 'dc1', number: '1', type: 'THT', shape: 'Rect', x: 0, y: -6.0, width: 3.2, height: 2.2, holeDiameter: 1.4, layer: 'All' },
    { id: 'dc2', number: '2', type: 'THT', shape: 'Round', x: -4.7, y: 0, width: 2.8, height: 3.2, holeDiameter: 1.4, layer: 'All' },
    { id: 'dc3', number: '3', type: 'THT', shape: 'Round', x: 0, y: 0, width: 3.2, height: 2.2, holeDiameter: 1.4, layer: 'All' }
  ],
  graphics: [
    { type: 'rect', layer: 'TopAssembly', x: -4.5, y: -7.2, w: 9.0, h: 14.4, width: 0.12 },
    { type: 'line', layer: 'TopSilk', x1: -4.5, y1: -7.2, x2: 4.5, y2: -7.2, width: 0.18 },
    { type: 'line', layer: 'TopSilk', x1: 4.5, y1: -7.2, x2: 4.5, y2: 7.2, width: 0.18 },
    { type: 'line', layer: 'TopSilk', x1: 4.5, y1: 7.2, x2: -4.5, y2: 7.2, width: 0.18 },
    { type: 'line', layer: 'TopSilk', x1: -4.5, y1: -7.2, x2: -4.5, y2: -2.0, width: 0.18 },
    { type: 'line', layer: 'TopSilk', x1: -4.5, y1: 2.0, x2: -4.5, y2: 7.2, width: 0.18 }
  ],
  courtyard: { width: 13.6, height: 15.6 },
  model3d: { shape: 'Box', bodyWidth: 9.0, bodyLength: 14.4, bodyHeight: 11.0, color: '#1b1b1d' }
};

const PAT_POT_SP3_4: PatternDef = {
  id: 'PAT_POT_SP3_4',
  name: 'СП3-38 / 3362P (подстроечный резистор)',
  library: 'Корпуса пассивных ЭРЭ (ГОСТ)',
  gostName: 'СП3-38б / ОЖ0.468',
  description: 'Подстроечный/переменный резистор 3 вывода (шаг 2,54 мм треугольник)',
  pads: [
    { id: 'r1', number: '1', type: 'THT', shape: 'Rect', x: -2.54, y: 1.27, width: 1.7, height: 1.7, holeDiameter: 0.9, layer: 'All' },
    { id: 'r2', number: '2', type: 'THT', shape: 'Round', x: 0, y: -1.27, width: 1.7, height: 1.7, holeDiameter: 0.9, layer: 'All' },
    { id: 'r3', number: '3', type: 'THT', shape: 'Round', x: 2.54, y: 1.27, width: 1.7, height: 1.7, holeDiameter: 0.9, layer: 'All' }
  ],
  graphics: [{ type: 'rect', layer: 'TopSilk', x: -4.5, y: -4.5, w: 9.0, h: 9.0, width: 0.18 }],
  courtyard: { width: 9.8, height: 9.8 },
  model3d: { shape: 'Box', bodyWidth: 9.0, bodyLength: 9.0, bodyHeight: 5.0, color: '#1b66a8' }
};

const PAT_RES_NET_4: PatternDef = makePattern(
  'PAT_RES_NET_4',
  'НР1-4 / CAY16 (сборка 4×R, 8 выв.)',
  'Корпуса пассивных ЭРЭ (ГОСТ)',
  'ОСТ / Chip Array 4x',
  'Четырёхэлементная SMD резисторная матрица 8 выводов (шаг 0,8 мм)',
  generateParametricPattern({
    family: 'SOIC',
    name: 'ARRAY-4X',
    pinCount: 8,
    pitch: 0.8,
    rowSpacing: 1.6,
    padWidth: 0.7,
    padHeight: 0.45,
    holeDiameter: 0,
    bodyWidth: 1.6,
    bodyLength: 3.2,
    bodyHeight: 0.6,
    densityLevel: 'B'
  }),
  '#222225'
);

const PAT_FUSE_1812: PatternDef = makePattern(
  'PAT_FUSE_1812',
  'ЧИП_4532М (1812 Предохр.)',
  'Корпуса пассивных ЭРЭ (ГОСТ)',
  'МЭК 4532М / 1812',
  'Самовосстанавливающийся SMD предохранитель 500 мА (MF-MSMF050)',
  generateParametricPattern({
    family: 'ChipSMD',
    name: 'CHIP_4532M',
    pinCount: 2,
    pitch: 0,
    rowSpacing: 4.1,
    padWidth: 1.4,
    padHeight: 3.1,
    holeDiameter: 0,
    bodyWidth: 3.2,
    bodyLength: 4.5,
    bodyHeight: 1.1,
    densityLevel: 'B'
  }),
  '#c99635'
);

const graphicsKeepText: PatternGraphic[] = [];
void graphicsKeepText;

export const labExtraIcPatterns: PatternDef[] = [
  PAT_DIP28_N,
  PAT_DIP40,
  PAT_SOIC16_N,
  PAT_SSOP28,
  PAT_TQFP32,
  PAT_TQFP44
];

export const labExtraSemiAndPassivePatterns: PatternDef[] = [
  PAT_SOT223,
  PAT_SOT23_5,
  PAT_POT_SP3_4,
  PAT_RES_NET_4,
  PAT_FUSE_1812
];

export const labExtraConnAndModulePatterns: PatternDef[] = [
  makeLinearHeader('PAT_PLS_3', 'ПЛС-3 (шаг 2,54 мм / Серво)', 'ОСТ / ПЛС-3', 'Однорядная штыревая вилка 3 контакта (сервопривод SG90)', 3, false),
  makeLinearHeader('PAT_PLS_6', 'ПЛС-6 (шаг 2,54 мм)', 'ОСТ / ПЛС-6', 'Однорядная штыревая вилка 6 контактов (порт PC0..PC5)', 6, false),
  makeLinearHeader('PAT_PLS_8', 'ПЛС-8 (шаг 2,54 мм)', 'ОСТ / ПЛС-8', 'Однорядная штыревая вилка 8 контактов (порт PD0..PD7)', 8, false),
  makeLinearHeader('PAT_PLS_10', 'ПЛС-10 (шаг 2,54 мм)', 'ОСТ / ПЛС-10', 'Однорядная штыревая вилка 10 контактов (Arduino D8..AREF)', 10, false),
  makeLinearHeader('PAT_PLS_16', 'ПЛС-16 (шаг 2,54 мм / ЖКИ)', 'ОСТ / ПЛС-16', 'Однорядная штыревая вилка 16 контактов (LCD 1602)', 16, true),
  makeDualRowHeader('PAT_PLD_6_ICSP', 'ПЛД-6 / ICSP (2×3 AVR ISP)', 'ОНП-КГ / ICSP-6', 'Двухрядный разъём внутрисхемного программирования AVR 2×3', 6),
  makeDualRowHeader('PAT_PLD_10_ISP', 'ПЛД-10 / USBasp ISP (2×5)', 'ОНП-КГ / ISP-10', 'Двухрядный разъём программатора USBasp 2×5 контактов', 10),
  PAT_DIP10_7SEG,
  PAT_LCD_16X2,
  PAT_ENCODER_EC11,
  PAT_USB_TYPE_B,
  PAT_USB_MINI_B,
  PAT_DC_JACK_5_5
];
