import { PatternDef } from '../../../core/types';
import { generateParametricPattern } from '../../../engines/patternGenerator';
import { makePattern } from './patternFactory';

export const icPatterns: PatternDef[] = [
  makePattern(
    'PAT_DIP6',
    'DIP-6 (2101.6-1)',
    'Корпуса микросхем ИМС (ГОСТ)',
    '2101.6-1 (ГОСТ 17467-88)',
    'Корпус DIP-6 шаг 2.54 мм, ширина 7.62 мм (оптопары АОТ128, 4N)',
    generateParametricPattern({
      family: 'DIP',
      name: 'DIP-6 (2101.6-1)',
      pinCount: 6,
      pitch: 2.54,
      rowSpacing: 7.62,
      padWidth: 1.7,
      padHeight: 1.5,
      holeDiameter: 0.85,
      bodyWidth: 6.4,
      bodyLength: 8.6,
      bodyHeight: 3.4,
      densityLevel: 'B'
    })
  ),
  makePattern(
    'PAT_DIP8',
    'DIP-8 (2101.8-1)',
    'Корпуса микросхем ИМС (ГОСТ)',
    '2101.8-1 (ГОСТ 17467-88)',
    'Корпус DIP-8 шаг 2.54 мм, ширина 7.62 мм (КР140УД708, КР1006ВИ1, К5559ИН10А)',
    generateParametricPattern({
      family: 'DIP',
      name: 'DIP-8 (2101.8-1)',
      pinCount: 8,
      pitch: 2.54,
      rowSpacing: 7.62,
      padWidth: 1.7,
      padHeight: 1.5,
      holeDiameter: 0.85,
      bodyWidth: 6.4,
      bodyLength: 10.2,
      bodyHeight: 3.4,
      densityLevel: 'B'
    })
  ),
  makePattern(
    'PAT_DIP14',
    'DIP-14 (2102.14-1)',
    'Корпуса микросхем ИМС (ГОСТ)',
    '2102.14-1 (ГОСТ 17467-88)',
    'Корпус DIP-14 шаг 2.54 мм, ширина 7.62 мм (К155ЛА3, К555ТМ2, К561ЛА7)',
    generateParametricPattern({
      family: 'DIP',
      name: 'DIP-14 (2102.14-1)',
      pinCount: 14,
      pitch: 2.54,
      rowSpacing: 7.62,
      padWidth: 1.7,
      padHeight: 1.5,
      holeDiameter: 0.85,
      bodyWidth: 6.4,
      bodyLength: 19.3,
      bodyHeight: 3.4,
      densityLevel: 'B'
    })
  ),
  makePattern(
    'PAT_DIP16',
    'DIP-16 (2103.16-1)',
    'Корпуса микросхем ИМС (ГОСТ)',
    '2103.16-1 (ГОСТ 17467-88)',
    'Корпус DIP-16 шаг 2.54 мм, ширина 7.62 мм (К555ИЕ7, К555ИД7, К561КТ3)',
    generateParametricPattern({
      family: 'DIP',
      name: 'DIP-16 (2103.16-1)',
      pinCount: 16,
      pitch: 2.54,
      rowSpacing: 7.62,
      padWidth: 1.7,
      padHeight: 1.5,
      holeDiameter: 0.85,
      bodyWidth: 6.4,
      bodyLength: 21.8,
      bodyHeight: 3.4,
      densityLevel: 'B'
    })
  ),
  makePattern(
    'PAT_SOIC8',
    'SOIC-8 (401.8-1)',
    'Корпуса микросхем ИМС (ГОСТ)',
    '401.8-1 (ГОСТ 17467-88)',
    'Планарный корпус SOIC-8 шаг 1.27 мм (К5559ИН10А SMD, К1401)',
    generateParametricPattern({
      family: 'SOIC',
      name: 'SOIC-8 (401.8-1)',
      pinCount: 8,
      pitch: 1.27,
      rowSpacing: 5.4,
      padWidth: 1.55,
      padHeight: 0.65,
      holeDiameter: 0,
      bodyWidth: 3.9,
      bodyLength: 4.9,
      bodyHeight: 1.5,
      densityLevel: 'B'
    })
  ),
  makePattern(
    'PAT_SOIC16',
    'SOIC-16 (401.16-1)',
    'Корпуса микросхем ИМС (ГОСТ)',
    '401.16-1 (ГОСТ 17467-88)',
    'Планарный корпус SOIC-16 шаг 1.27 мм',
    generateParametricPattern({
      family: 'SOIC',
      name: 'SOIC-16 (401.16-1)',
      pinCount: 16,
      pitch: 1.27,
      rowSpacing: 5.4,
      padWidth: 1.55,
      padHeight: 0.65,
      holeDiameter: 0,
      bodyWidth: 3.9,
      bodyLength: 9.9,
      bodyHeight: 1.5,
      densityLevel: 'B'
    })
  ),
  makePattern(
    'PAT_LQFP48',
    'LQFP-48 (7×7, шаг 0,5)',
    'Корпуса микросхем ИМС (ГОСТ)',
    '4214.48-1 (Миландр / НИИЭТ)',
    'Четырёхсторонний планарный корпус LQFP-48, шаг 0.5 мм',
    generateParametricPattern({
      family: 'QFP',
      name: 'LQFP-48 (7×7, шаг 0,5)',
      pinCount: 48,
      pitch: 0.5,
      rowSpacing: 8.6,
      padWidth: 1.25,
      padHeight: 0.3,
      holeDiameter: 0,
      bodyWidth: 7.0,
      bodyLength: 7.0,
      bodyHeight: 1.4,
      densityLevel: 'B'
    })
  ),
  makePattern(
    'PAT_LQFP64',
    'LQFP-64 (10×10, шаг 0,5)',
    'Корпуса микросхем ИМС (ГОСТ)',
    '4214.64-1 (К1986ВЕ92QI)',
    'Планарный корпус микроконтроллера К1986ВЕ92QI (Миландр) 10×10 мм',
    generateParametricPattern({
      family: 'QFP',
      name: 'LQFP-64 (10×10, шаг 0,5)',
      pinCount: 64,
      pitch: 0.5,
      rowSpacing: 11.6,
      padWidth: 1.25,
      padHeight: 0.3,
      holeDiameter: 0,
      bodyWidth: 10.0,
      bodyLength: 10.0,
      bodyHeight: 1.4,
      densityLevel: 'B'
    })
  ),
  {
    id: 'PAT_QFN32',
    name: 'QFN-32 (5×5, шаг 0,5 мм)',
    library: 'Корпуса микросхем ИМС (ГОСТ)',
    gostName: 'QFN-32 / 5×5 мм + Thermal Pad',
    description: 'Безвыводной планарный корпус 32 вывода с центральным теплоотводом (ГОСТ/JEDEC MO-220)',
    pads: [
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `p_${i + 1}`, number: `${i + 1}`, type: 'SMD' as const, shape: 'RoundedRect' as const,
        x: -2.4, y: -1.75 + i * 0.5, width: 0.75, height: 0.28, layer: 'Top' as const
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `p_${i + 9}`, number: `${i + 9}`, type: 'SMD' as const, shape: 'RoundedRect' as const,
        x: -1.75 + i * 0.5, y: 2.4, width: 0.28, height: 0.75, layer: 'Top' as const
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `p_${i + 17}`, number: `${i + 17}`, type: 'SMD' as const, shape: 'RoundedRect' as const,
        x: 2.4, y: 1.75 - i * 0.5, width: 0.75, height: 0.28, layer: 'Top' as const
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `p_${i + 25}`, number: `${i + 25}`, type: 'SMD' as const, shape: 'RoundedRect' as const,
        x: 1.75 - i * 0.5, y: -2.4, width: 0.28, height: 0.75, layer: 'Top' as const
      })),
      { id: 'p_ep', number: '33', type: 'SMD', shape: 'Rect', x: 0, y: 0, width: 3.1, height: 3.1, layer: 'Top' }
    ],
    graphics: [
      { type: 'rect', layer: 'TopAssembly', x: -2.5, y: -2.5, w: 5.0, h: 5.0, width: 0.1 },
      { type: 'line', layer: 'TopSilk', x1: -2.9, y1: -2.9, x2: -2.2, y2: -2.9, width: 0.15 },
      { type: 'line', layer: 'TopSilk', x1: -2.9, y1: -2.9, x2: -2.9, y2: -2.2, width: 0.15 },
      { type: 'line', layer: 'TopSilk', x1: 2.9, y1: -2.9, x2: 2.2, y2: -2.9, width: 0.15 },
      { type: 'line', layer: 'TopSilk', x1: 2.9, y1: -2.9, x2: 2.9, y2: -2.2, width: 0.15 },
      { type: 'line', layer: 'TopSilk', x1: 2.9, y1: 2.9, x2: 2.2, y2: 2.9, width: 0.15 },
      { type: 'line', layer: 'TopSilk', x1: 2.9, y1: 2.9, x2: 2.9, y2: 2.2, width: 0.15 },
      { type: 'line', layer: 'TopSilk', x1: -2.9, y1: 2.9, x2: -2.2, y2: 2.9, width: 0.15 },
      { type: 'line', layer: 'TopSilk', x1: -2.9, y1: 2.9, x2: -2.9, y2: 2.2, width: 0.15 },
      { type: 'circle', layer: 'TopSilk', cx: -3.2, cy: -1.75, r: 0.22, width: 0.2, fill: true },
      { type: 'rect', layer: 'Courtyard', x: -3.6, y: -3.6, w: 7.2, h: 7.2, width: 0.1 }
    ],
    courtyard: { width: 7.2, height: 7.2 },
    model3d: { shape: 'QFN', bodyWidth: 5.0, bodyLength: 5.0, bodyHeight: 0.9, color: '#22262b' }
  },
  {
    id: 'PAT_BRIDGE_KC407',
    name: 'КЦ407А (мост диодный 4 конт.)',
    library: 'Корпуса полупроводников (ГОСТ)',
    gostName: 'КД / КЦ407А (DIP-4 кругл.)',
    description: 'Диодный мост КЦ407А / КЦ405 с четырьмя штыревыми выводами',
    pads: [
      { id: 'p1', number: '1', type: 'THT', shape: 'Rect', x: -2.54, y: 2.54, width: 1.8, height: 1.8, holeDiameter: 0.9, layer: 'All' },
      { id: 'p2', number: '2', type: 'THT', shape: 'Round', x: 2.54, y: 2.54, width: 1.8, height: 1.8, holeDiameter: 0.9, layer: 'All' },
      { id: 'p3', number: '3', type: 'THT', shape: 'Round', x: -2.54, y: -2.54, width: 1.8, height: 1.8, holeDiameter: 0.9, layer: 'All' },
      { id: 'p4', number: '4', type: 'THT', shape: 'Round', x: 2.54, y: -2.54, width: 1.8, height: 1.8, holeDiameter: 0.9, layer: 'All' }
    ],
    graphics: [
      { type: 'circle', layer: 'TopSilk', cx: 0, cy: 0, r: 5.1, width: 0.18 },
      { type: 'rect', layer: 'Courtyard', x: -5.6, y: -5.6, w: 11.2, h: 11.2, width: 0.1 }
    ],
    courtyard: { width: 11.2, height: 11.2 },
    model3d: { shape: 'Box', bodyWidth: 8.2, bodyLength: 8.2, bodyHeight: 4.5, color: '#24272d' }
  }
];
