import { PatternDef } from '../../../core/types';
import { generateParametricPattern } from '../../../engines/patternGenerator';
import { makePattern } from './patternFactory';

export const passivePatterns: PatternDef[] = [
  makePattern(
    'PAT_CHIP_1608M',
    'ЧИП_1608М (0603)',
    'Корпуса пассивных ЭРЭ (ГОСТ)',
    'Р1-12-1608М / К10-17в-1608',
    'Метрический ЧИП-корпус 1.6 × 0.8 мм (Р1-12, К10-17)',
    generateParametricPattern({
      family: 'ChipSMD',
      name: 'ЧИП_1608М (0603)',
      pinCount: 2,
      pitch: 1.5,
      rowSpacing: 1.55,
      padWidth: 0.9,
      padHeight: 0.95,
      holeDiameter: 0,
      bodyWidth: 0.85,
      bodyLength: 1.6,
      bodyHeight: 0.45,
      densityLevel: 'B'
    }),
    '#20242a'
  ),
  makePattern(
    'PAT_CHIP_2012M',
    'ЧИП_2012М (0805)',
    'Корпуса пассивных ЭРЭ (ГОСТ)',
    'Р1-12-2012М / К10-17в-2012',
    'Метрический ЧИП-корпус 2.0 × 1.25 мм (Р1-12, К10-17)',
    generateParametricPattern({
      family: 'ChipSMD',
      name: 'ЧИП_2012М (0805)',
      pinCount: 2,
      pitch: 1.9,
      rowSpacing: 1.9,
      padWidth: 1.05,
      padHeight: 1.35,
      holeDiameter: 0,
      bodyWidth: 1.25,
      bodyLength: 2.0,
      bodyHeight: 0.6,
      densityLevel: 'B'
    }),
    '#b88958'
  ),
  makePattern(
    'PAT_CHIP_3216M',
    'ЧИП_3216М (1206)',
    'Корпуса пассивных ЭРЭ (ГОСТ)',
    'Р1-12-3216М / К10-47-3216',
    'Метрический ЧИП-корпус 3.2 × 1.6 мм (мощные Р1-12, К10-47)',
    generateParametricPattern({
      family: 'ChipSMD',
      name: 'ЧИП_3216М (1206)',
      pinCount: 2,
      pitch: 3.0,
      rowSpacing: 3.0,
      padWidth: 1.2,
      padHeight: 1.75,
      holeDiameter: 0,
      bodyWidth: 1.6,
      bodyLength: 3.2,
      bodyHeight: 0.7,
      densityLevel: 'B'
    }),
    '#a37542'
  ),
  makePattern(
    'PAT_MLT_025',
    'МЛТ-0,25 (шаг 12,5 мм)',
    'Корпуса пассивных ЭРЭ (ГОСТ)',
    'ОСТ 11 073.013 / МЛТ-0,25',
    'Выводной осевой резистор МЛТ-0,25 / С2-23, шаг 12.5 мм',
    generateParametricPattern({
      family: 'AxialTHT',
      name: 'МЛТ-0,25 (шаг 12,5 мм)',
      pinCount: 2,
      pitch: 12.5,
      rowSpacing: 12.5,
      padWidth: 1.8,
      padHeight: 1.8,
      holeDiameter: 0.9,
      bodyWidth: 2.4,
      bodyLength: 6.5,
      bodyHeight: 2.4,
      densityLevel: 'B'
    }),
    '#a93226'
  ),
  makePattern(
    'PAT_MLT_050',
    'МЛТ-0,5 (шаг 15 мм)',
    'Корпуса пассивных ЭРЭ (ГОСТ)',
    'МЛТ-0,5 / С2-33Н-0,5',
    'Выводной осевой резистор МЛТ-0,5, шаг 15 мм',
    generateParametricPattern({
      family: 'AxialTHT',
      name: 'МЛТ-0,5 (шаг 15 мм)',
      pinCount: 2,
      pitch: 15.0,
      rowSpacing: 15.0,
      padWidth: 2.0,
      padHeight: 2.0,
      holeDiameter: 1.0,
      bodyWidth: 3.6,
      bodyLength: 10.5,
      bodyHeight: 3.6,
      densityLevel: 'B'
    }),
    '#b03a2e'
  ),
  makePattern(
    'PAT_K10_17B',
    'К10-17б (шаг 5,0 мм)',
    'Корпуса пассивных ЭРЭ (ГОСТ)',
    'ОЖ0.460.172 ТУ / К10-17б',
    'Керамический выводной конденсатор К10-17б, шаг 5.0 мм',
    generateParametricPattern({
      family: 'RadialTHT',
      name: 'К10-17б (шаг 5,0 мм)',
      pinCount: 2,
      pitch: 5.0,
      rowSpacing: 5.0,
      padWidth: 1.7,
      padHeight: 1.7,
      holeDiameter: 0.8,
      bodyWidth: 5.0,
      bodyLength: 2.5,
      bodyHeight: 5.0,
      densityLevel: 'B',
      polarized: false
    }),
    '#d4ac0d'
  ),
  makePattern(
    'PAT_K50_35_6X11',
    'К50-35 (Ø6,3×11, шаг 2,5 мм)',
    'Корпуса пассивных ЭРЭ (ГОСТ)',
    'АДПК.673541.001 ТУ / К50-35',
    'Оксидно-электролитический полярный конденсатор Ø6.3×11 мм',
    generateParametricPattern({
      family: 'RadialTHT',
      name: 'К50-35 (Ø6,3×11, шаг 2,5 мм)',
      pinCount: 2,
      pitch: 2.5,
      rowSpacing: 2.5,
      padWidth: 1.8,
      padHeight: 1.8,
      holeDiameter: 0.85,
      bodyWidth: 6.3,
      bodyLength: 6.3,
      bodyHeight: 11.0,
      densityLevel: 'B',
      polarized: true
    }),
    '#1b4f72'
  ),
  makePattern(
    'PAT_SP3_38',
    'СП3-38б (подстроечный)',
    'Корпуса пассивных ЭРЭ (ГОСТ)',
    'ОЖ0.468.545 ТУ / СП3-38',
    'Резистор подстроечный керметный/композиционный, 3 вывода',
    {
      id: 'PAT_SP3_38',
      name: 'СП3-38б (подстроечный)',
      library: 'Корпуса пассивных ЭРЭ (ГОСТ)',
      gostName: 'СП3-38б',
      description: 'Подстроечный резистор 3 вывода треугольником 5×5 мм',
      pads: [
        { id: 'p1', number: '1', type: 'THT', shape: 'Rect', x: -2.5, y: 2.5, width: 1.8, height: 1.8, holeDiameter: 0.9, layer: 'All' },
        { id: 'p2', number: '2', type: 'THT', shape: 'Round', x: 0, y: -2.5, width: 1.8, height: 1.8, holeDiameter: 0.9, layer: 'All' },
        { id: 'p3', number: '3', type: 'THT', shape: 'Round', x: 2.5, y: 2.5, width: 1.8, height: 1.8, holeDiameter: 0.9, layer: 'All' }
      ],
      graphics: [
        { type: 'rect', layer: 'TopSilk', x: -4.8, y: -4.8, w: 9.6, h: 9.6, width: 0.18 },
        { type: 'circle', layer: 'TopSilk', cx: 0, cy: 0, r: 1.3, width: 0.15 }
      ],
      courtyard: { width: 10.6, height: 10.6 },
      model3d: { shape: 'Box', bodyWidth: 9.5, bodyLength: 9.5, bodyHeight: 5.0, color: '#2e86c1' }
    }
  ),
  makePattern(
    'PAT_DM_01',
    'ДМ-0,1 (индуктивность 10 мм)',
    'Корпуса пассивных ЭРЭ (ГОСТ)',
    'ОЯ0.475.002 ТУ / ДМ-0,1',
    'Дроссель высокочастотный миниатюрный ДМ-0,1, шаг 10 мм',
    generateParametricPattern({
      family: 'AxialTHT',
      name: 'ДМ-0,1 (индуктивность 10 мм)',
      pinCount: 2,
      pitch: 10.0,
      rowSpacing: 10.0,
      padWidth: 1.8,
      padHeight: 1.8,
      holeDiameter: 0.9,
      bodyWidth: 4.0,
      bodyLength: 8.5,
      bodyHeight: 4.0,
      densityLevel: 'B'
    }),
    '#1e8449'
  )
];
