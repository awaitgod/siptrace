import { ComponentLibrary } from '../../../core/types';
import { makeResPrimitives, makeTwoPinHorizontal } from './helpers';

export const libResistors: ComponentLibrary = {
  id: 'lib_gost_res',
  name: 'Резисторы (ГОСТ 2.728)',
  category: 'Пассивные',
  description: 'Резисторы постоянные, подстроечные и нелинейные отечественные (МЛТ, С2-23, Р1-12, СП3)',
  components: [
    {
      id: 'COMP_R_MLT025',
      name: 'МЛТ-0,25 (выводной)',
      library: 'Резисторы (ГОСТ 2.728)',
      refDesPrefix: 'R',
      defaultValue: '1к',
      gostStandard: 'ОСТ 11 073.013',
      description: 'Резистор постоянный непроволочный МЛТ-0,25 Вт (ГОСТ 2.728-74)',
      manufacturer: 'ОАО «Ресурс»',
      patternId: 'PAT_MLT_025',
      spiceModel: { prefix: 'R', params: { R: 1000 } },
      parts: [{ partIndex: 1, name: 'Part 1', primitives: makeResPrimitives('0.25'), pins: makeTwoPinHorizontal() }]
    },
    {
      id: 'COMP_R_R1_12_0805',
      name: 'Р1-12-0,125 (ЧИП 2012М/0805)',
      library: 'Резисторы (ГОСТ 2.728)',
      refDesPrefix: 'R',
      defaultValue: '10к',
      gostStandard: 'АЛЯР.434110.005 ТУ',
      description: 'Резистор чип для поверхностного монтажа Р1-12 (2012М / 0805)',
      manufacturer: 'АО «НПО Эркон»',
      patternId: 'PAT_CHIP_2012M',
      spiceModel: { prefix: 'R', params: { R: 10000 } },
      parts: [{ partIndex: 1, name: 'Part 1', primitives: makeResPrimitives(), pins: makeTwoPinHorizontal() }]
    },
    {
      id: 'COMP_R_R1_12_0603',
      name: 'Р1-12-0,1 (ЧИП 1608М/0603)',
      library: 'Резисторы (ГОСТ 2.728)',
      refDesPrefix: 'R',
      defaultValue: '4,7к',
      gostStandard: 'АЛЯР.434110.005 ТУ',
      description: 'Резистор чип миниатюрный Р1-12 (1608М / 0603)',
      manufacturer: 'АО «НПО Эркон»',
      patternId: 'PAT_CHIP_1608M',
      spiceModel: { prefix: 'R', params: { R: 4700 } },
      parts: [{ partIndex: 1, name: 'Part 1', primitives: makeResPrimitives(), pins: makeTwoPinHorizontal() }]
    },
    {
      id: 'COMP_R_R1_12_1206',
      name: 'Р1-12-0,25 (ЧИП 3216М/1206)',
      library: 'Резисторы (ГОСТ 2.728)',
      refDesPrefix: 'R',
      defaultValue: '120',
      gostStandard: 'АЛЯР.434110.005 ТУ',
      description: 'Резистор чип повышенной мощности Р1-12 (3216М / 1206)',
      manufacturer: 'АО «НПО Эркон»',
      patternId: 'PAT_CHIP_3216M',
      spiceModel: { prefix: 'R', params: { R: 120 } },
      parts: [{ partIndex: 1, name: 'Part 1', primitives: makeResPrimitives('0.25'), pins: makeTwoPinHorizontal() }]
    },
    {
      id: 'COMP_R_C2_23_05',
      name: 'С2-23-0,5 (0,5 Вт)',
      library: 'Резисторы (ГОСТ 2.728)',
      refDesPrefix: 'R',
      defaultValue: '390',
      gostStandard: 'ОЖ0.467.093 ТУ',
      description: 'Резистор металлодиэлектрический прецизионный С2-23-0,5 Вт',
      manufacturer: 'ОАО «Резистор»',
      patternId: 'PAT_MLT_050',
      spiceModel: { prefix: 'R', params: { R: 390 } },
      parts: [{ partIndex: 1, name: 'Part 1', primitives: makeResPrimitives('0.5'), pins: makeTwoPinHorizontal() }]
    },
    {
      id: 'COMP_R_TRIM_SP3',
      name: 'СП3-38б (подстроечный)',
      library: 'Резисторы (ГОСТ 2.728)',
      refDesPrefix: 'R',
      defaultValue: '10к',
      gostStandard: 'ОЖ0.468.545 ТУ',
      description: 'Резистор подстроечный по ГОСТ 2.728-74 (с Т-образным движком)',
      patternId: 'PAT_SP3_38',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'rect', x: -5, y: -2, w: 10, h: 4, width: 0.35 },
            { type: 'line', x1: 0, y1: -5, x2: 0, y2: -2.8, width: 0.3 },
            { type: 'line', x1: -1.5, y1: -2.8, x2: 1.5, y2: -2.8, width: 0.35 },
            { type: 'line', x1: -3.5, y1: 3.5, x2: 3.5, y2: -3.5, width: 0.25 },
            { type: 'line', x1: 2.5, y1: -3.5, x2: 4.5, y2: -3.5, width: 0.25 }
          ],
          pins: [
            { id: 'pin_1', number: '1', name: '1', x: -10, y: 0, length: 5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '1' },
            { id: 'pin_2', number: '2', name: 'Дв', x: 0, y: -7.5, length: 2.5, orientation: 90, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '2' },
            { id: 'pin_3', number: '3', name: '3', x: 10, y: 0, length: 5, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '3' }
          ]
        }
      ]
    },
    {
      id: 'COMP_R_THERM',
      name: 'СТ1-17 (терморезистор NTC)',
      library: 'Резисторы (ГОСТ 2.728)',
      refDesPrefix: 'RK',
      defaultValue: '10к',
      gostStandard: 'ГОСТ 2.728-74',
      description: 'Терморезистор с отрицательным ТКС',
      patternId: 'PAT_K10_17B',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'rect', x: -5, y: -2, w: 10, h: 4, width: 0.35 },
            { type: 'line', x1: -4, y1: 3.5, x2: 3.5, y2: -3.5, width: 0.28 },
            { type: 'line', x1: -5.5, y1: 3.5, x2: -4, y2: 3.5, width: 0.28 },
            { type: 'text', x: 5.2, y: -4.2, text: '-t°', size: 2.2 }
          ],
          pins: makeTwoPinHorizontal()
        }
      ]
    }
  ]
};
