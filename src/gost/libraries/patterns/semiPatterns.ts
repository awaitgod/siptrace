import { PatternDef } from '../../../core/types';
import { generateParametricPattern } from '../../../engines/patternGenerator';
import { makePattern } from './patternFactory';

export const semiPatterns: PatternDef[] = [
  makePattern(
    'PAT_KD522',
    'КД522 (осевой диод, 10 мм)',
    'Корпуса полупроводников (ГОСТ)',
    'КД-14 / КД522Б',
    'Диод импульсный в стеклянном корпусе, шаг 10 мм',
    generateParametricPattern({
      family: 'AxialTHT',
      name: 'КД522 (осевой диод, 10 мм)',
      pinCount: 2,
      pitch: 10.0,
      rowSpacing: 10.0,
      padWidth: 1.7,
      padHeight: 1.7,
      holeDiameter: 0.85,
      bodyWidth: 2.0,
      bodyLength: 4.2,
      bodyHeight: 2.0,
      densityLevel: 'B'
    }),
    '#d35400'
  ),
  makePattern(
    'PAT_LED_5MM',
    'АЛ307 (светодиод Ø5 мм)',
    'Корпуса полупроводников (ГОСТ)',
    'АЛ307БМ / Ø5 мм',
    'Индикаторный светодиод Ø5 мм, шаг выводов 2.5 мм',
    generateParametricPattern({
      family: 'RadialTHT',
      name: 'АЛ307 (светодиод Ø5 мм)',
      pinCount: 2,
      pitch: 2.5,
      rowSpacing: 2.5,
      padWidth: 1.7,
      padHeight: 1.7,
      holeDiameter: 0.85,
      bodyWidth: 5.0,
      bodyLength: 5.0,
      bodyHeight: 8.5,
      densityLevel: 'B'
    }),
    '#e74c3c'
  ),
  makePattern(
    'PAT_KT27_SOT23',
    'КТ-27 (SOT-23)',
    'Корпуса полупроводников (ГОСТ)',
    'КТ-27-2 / ГОСТ 18472',
    'Планарный транзисторный/диодный корпус КТ-27 (3 вывода)',
    generateParametricPattern({
      family: 'SOT23',
      name: 'КТ-27 (SOT-23)',
      pinCount: 3,
      pitch: 0.95,
      rowSpacing: 2.2,
      padWidth: 1.0,
      padHeight: 0.7,
      holeDiameter: 0,
      bodyWidth: 1.4,
      bodyLength: 2.9,
      bodyHeight: 1.0,
      densityLevel: 'B'
    }),
    '#1c1f24'
  ),
  {
    id: 'PAT_KT26_TO92',
    name: 'КТ-26 (TO-92)',
    library: 'Корпуса полупроводников (ГОСТ)',
    gostName: 'КТ-26 (ГОСТ 18472-88)',
    description: 'Транзистор малой мощности в корпусе КТ-26 (КП501А, КТ3102, КТ3107)',
    pads: [
      { id: 'p1', number: '1', type: 'THT', shape: 'Rect', x: -1.27, y: 0, width: 1.35, height: 1.6, holeDiameter: 0.75, layer: 'All' },
      { id: 'p2', number: '2', type: 'THT', shape: 'Round', x: 0, y: -1.27, width: 1.35, height: 1.6, holeDiameter: 0.75, layer: 'All' },
      { id: 'p3', number: '3', type: 'THT', shape: 'Round', x: 1.27, y: 0, width: 1.35, height: 1.6, holeDiameter: 0.75, layer: 'All' }
    ],
    graphics: [
      { type: 'arc', layer: 'TopSilk', cx: 0, cy: 0, r: 2.4, startAngle: Math.PI, endAngle: 2 * Math.PI, width: 0.18 },
      { type: 'line', layer: 'TopSilk', x1: -2.4, y1: 0, x2: 2.4, y2: 0, width: 0.18 }
    ],
    courtyard: { width: 5.5, height: 5.0 },
    model3d: { shape: 'TO92', bodyWidth: 4.5, bodyLength: 3.5, bodyHeight: 4.8, color: '#1b1e23', pinCount: 3 }
  },
  {
    id: 'PAT_KT315_FLAT',
    name: 'КТ-13 (корпус КТ315 / КТ361)',
    library: 'Корпуса полупроводников (ГОСТ)',
    gostName: 'КТ-13 (ОСТ 11 336.919)',
    description: 'Классический плоский корпус КТ315 / КТ361, 3 вывода в ряд шаг 2.5 мм',
    pads: [
      { id: 'p1', number: '1', type: 'THT', shape: 'Rect', x: -2.5, y: 0, width: 1.5, height: 1.7, holeDiameter: 0.8, layer: 'All' },
      { id: 'p2', number: '2', type: 'THT', shape: 'Round', x: 0, y: 0, width: 1.5, height: 1.7, holeDiameter: 0.8, layer: 'All' },
      { id: 'p3', number: '3', type: 'THT', shape: 'Round', x: 2.5, y: 0, width: 1.5, height: 1.7, holeDiameter: 0.8, layer: 'All' }
    ],
    graphics: [
      { type: 'rect', layer: 'TopSilk', x: -3.2, y: -1.3, w: 6.4, h: 2.6, width: 0.18 }
    ],
    courtyard: { width: 7.4, height: 3.6 },
    model3d: { shape: 'Box', bodyWidth: 6.4, bodyLength: 2.5, bodyHeight: 5.5, color: '#d35400' }
  },
  {
    id: 'PAT_KT28_TO220',
    name: 'КТ-28 (TO-220)',
    library: 'Корпуса полупроводников (ГОСТ)',
    gostName: 'КТ-28-2 (ГОСТ 18472-88)',
    description: 'Силовой корпус КТ-28 (КТ815, КР142ЕН5А, КП707В2) с фланцем',
    pads: [
      { id: 'p1', number: '1', type: 'THT', shape: 'Rect', x: -2.54, y: 0, width: 1.8, height: 2.2, holeDiameter: 1.0, layer: 'All' },
      { id: 'p2', number: '2', type: 'THT', shape: 'Round', x: 0, y: 0, width: 1.8, height: 2.2, holeDiameter: 1.0, layer: 'All' },
      { id: 'p3', number: '3', type: 'THT', shape: 'Round', x: 2.54, y: 0, width: 1.8, height: 2.2, holeDiameter: 1.0, layer: 'All' }
    ],
    graphics: [
      { type: 'rect', layer: 'TopSilk', x: -5.2, y: -2.2, w: 10.4, h: 4.6, width: 0.2 },
      { type: 'line', layer: 'TopSilk', x1: -5.2, y1: -1.2, x2: 5.2, y2: -1.2, width: 0.2 }
    ],
    courtyard: { width: 11.5, height: 6.0 },
    model3d: { shape: 'TO220', bodyWidth: 10.2, bodyLength: 4.5, bodyHeight: 14.5, color: '#1a1d21', pinCount: 3 }
  }
];
