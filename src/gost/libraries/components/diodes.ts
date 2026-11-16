import { ComponentLibrary } from '../../../core/types';
import { makeTwoPinHorizontal } from './helpers';

export const libDiodes: ComponentLibrary = {
  id: 'lib_gost_diode',
  name: 'Диоды и Тиристоры (ГОСТ 2.730)',
  category: 'Полупроводники',
  description: 'КД522, КД2997, КС147, АЛ307, КЦ405, КУ202 по ГОСТ 2.730-73',
  components: [
    {
      id: 'COMP_VD_KD522',
      name: 'КД522Б (диод импульсный)',
      library: 'Диоды и Тиристоры (ГОСТ 2.730)',
      refDesPrefix: 'VD',
      defaultValue: 'КД522Б',
      gostStandard: 'аА0.339.152 ТУ',
      description: 'Кремниевый импульсный диод 50 В, 100 мА (ГОСТ 2.730-73)',
      patternId: 'PAT_KD522',
      spiceModel: { prefix: 'D', modelName: 'KD522', params: { IS: 2.5e-9, N: 1.75 } },
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'polyline', points: [{ x: -2.5, y: -2.5 }, { x: 2.5, y: 0 }, { x: -2.5, y: 2.5 }], closed: true, width: 0.35 },
            { type: 'line', x1: -2.5, y1: 0, x2: 2.5, y2: 0, width: 0.25 },
            { type: 'line', x1: 2.5, y1: -3, x2: 2.5, y2: 3, width: 0.4 }
          ],
          pins: [
            { id: 'pin_1', number: '1', name: 'А', x: -7.5, y: 0, length: 5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '1' },
            { id: 'pin_2', number: '2', name: 'К', x: 7.5, y: 0, length: 5, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '2' }
          ]
        }
      ]
    },
    {
      id: 'COMP_VD_KS147',
      name: 'КС147А (стабилитрон 4,7 В)',
      library: 'Диоды и Тиристоры (ГОСТ 2.730)',
      refDesPrefix: 'VD',
      defaultValue: 'КС147А',
      gostStandard: 'ГОСТ 2.730-73',
      description: 'Стабилитрон кремниевый 4.7 В (ГОСТ 2.730-73)',
      patternId: 'PAT_KD522',
      spiceModel: { prefix: 'D', modelName: 'KS147', params: { BV: 4.7 } },
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'polyline', points: [{ x: -2.5, y: -2.5 }, { x: 2.5, y: 0 }, { x: -2.5, y: 2.5 }], closed: true, width: 0.35 },
            { type: 'line', x1: -2.5, y1: 0, x2: 2.5, y2: 0, width: 0.25 },
            { type: 'line', x1: 2.5, y1: -3, x2: 2.5, y2: 3, width: 0.4 },
            { type: 'line', x1: 2.5, y1: -3, x2: 0.8, y2: -3.8, width: 0.35 }
          ],
          pins: [
            { id: 'pin_1', number: '1', name: 'А', x: -7.5, y: 0, length: 5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '1' },
            { id: 'pin_2', number: '2', name: 'К', x: 7.5, y: 0, length: 5, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '2' }
          ]
        }
      ]
    },
    {
      id: 'COMP_VD_AL307',
      name: 'АЛ307БМ (светодиод)',
      library: 'Диоды и Тиристоры (ГОСТ 2.730)',
      refDesPrefix: 'HL',
      defaultValue: 'АЛ307БМ',
      gostStandard: 'аА0.336.076 ТУ',
      description: 'Светодиод индикаторный красный (ГОСТ 2.730-73)',
      patternId: 'PAT_LED_5MM',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'polyline', points: [{ x: -2.5, y: -2.5 }, { x: 2.5, y: 0 }, { x: -2.5, y: 2.5 }], closed: true, width: 0.35 },
            { type: 'line', x1: -2.5, y1: 0, x2: 2.5, y2: 0, width: 0.25 },
            { type: 'line', x1: 2.5, y1: -3, x2: 2.5, y2: 3, width: 0.4 },
            // Two optical arrows outward
            { type: 'line', x1: -0.5, y1: -3.5, x2: 2.0, y2: -6.0, width: 0.25 },
            { type: 'polyline', points: [{ x: 1.0, y: -5.8 }, { x: 2.0, y: -6.0 }, { x: 1.8, y: -5.0 }], width: 0.25 },
            { type: 'line', x1: 1.5, y1: -2.5, x2: 4.0, y2: -5.0, width: 0.25 },
            { type: 'polyline', points: [{ x: 3.0, y: -4.8 }, { x: 4.0, y: -5.0 }, { x: 3.8, y: -4.0 }], width: 0.25 }
          ],
          pins: [
            { id: 'pin_1', number: '1', name: 'А', x: -7.5, y: 0, length: 5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '1' },
            { id: 'pin_2', number: '2', name: 'К', x: 7.5, y: 0, length: 5, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '2' }
          ]
        }
      ]
    },
    {
      id: 'COMP_VD_SHOTTKY',
      name: 'КД2997А (диод Шоттки)',
      library: 'Диоды и Тиристоры (ГОСТ 2.730)',
      refDesPrefix: 'VD',
      defaultValue: 'КД2997А',
      gostStandard: 'ГОСТ 2.730-73',
      description: 'Диод с барьером Шоттки 30 А, 35 В',
      patternId: 'PAT_KT28_TO220',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'polyline', points: [{ x: -2.5, y: -2.5 }, { x: 2.5, y: 0 }, { x: -2.5, y: 2.5 }], closed: true, width: 0.35 },
            { type: 'line', x1: -2.5, y1: 0, x2: 2.5, y2: 0, width: 0.25 },
            { type: 'polyline', points: [{ x: 1.5, y: -2.5 }, { x: 1.5, y: -3.2 }, { x: 2.5, y: -3.2 }, { x: 2.5, y: 3.2 }, { x: 3.5, y: 3.2 }, { x: 3.5, y: 2.5 }], width: 0.35 }
          ],
          pins: [
            { id: 'pin_1', number: '1', name: 'А', x: -7.5, y: 0, length: 5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '1' },
            { id: 'pin_2', number: '2', name: 'К', x: 7.5, y: 0, length: 5, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '2' }
          ]
        }
      ]
    },
    {
      id: 'COMP_VS_KU202',
      name: 'КУ202Н (тиристор)',
      library: 'Диоды и Тиристоры (ГОСТ 2.730)',
      refDesPrefix: 'VS',
      defaultValue: 'КУ202Н',
      gostStandard: 'ГОСТ 2.730-73',
      description: 'Триодный тиристор (тринистор) 400 В, 10 А',
      patternId: 'PAT_KT28_TO220',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'polyline', points: [{ x: -2.5, y: -2.5 }, { x: 2.5, y: 0 }, { x: -2.5, y: 2.5 }], closed: true, width: 0.35 },
            { type: 'line', x1: -2.5, y1: 0, x2: 2.5, y2: 0, width: 0.25 },
            { type: 'line', x1: 2.5, y1: -3, x2: 2.5, y2: 3, width: 0.4 },
            { type: 'polyline', points: [{ x: 2.5, y: 1.5 }, { x: 5, y: 4 }, { x: 5, y: 5 }], width: 0.3 }
          ],
          pins: [
            { id: 'p1', number: '2', name: 'А', x: -7.5, y: 0, length: 5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '2' },
            { id: 'p2', number: '1', name: 'К', x: 7.5, y: 0, length: 5, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '1' },
            { id: 'p3', number: '3', name: 'УЭ', x: 5, y: 7.5, length: 2.5, orientation: 270, electricalType: 'Input', style: 'Line', showName: false, showNumber: true, padMapping: '3' }
          ]
        }
      ]
    },
    {
      id: 'COMP_VD_D814A',
      name: 'Д814А (стабилитрон 7,5В)',
      library: 'Диоды и Оптопары (ГОСТ 2.730)',
      refDesPrefix: 'VD',
      defaultValue: 'Д814А',
      gostStandard: 'ГОСТ 2.730-73',
      description: 'Стабилитрон кремниевый маломощный (7,5 В, ГОСТ 2.730-73)',
      patternId: 'PAT_KD522',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'polyline', points: [{ x: -2.5, y: -2.5 }, { x: 2.5, y: 0 }, { x: -2.5, y: 2.5 }], closed: true, width: 0.35 },
            { type: 'line', x1: -2.5, y1: 0, x2: 2.5, y2: 0, width: 0.25 },
            { type: 'polyline', points: [{ x: 1.3, y: -3.2 }, { x: 2.5, y: -3.2 }, { x: 2.5, y: 3.2 }, { x: 3.7, y: 3.2 }], width: 0.4 }
          ],
          pins: [
            { id: 'p1', number: '1', name: 'А', x: -7.5, y: 0, length: 5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '1' },
            { id: 'p2', number: '2', name: 'К', x: 7.5, y: 0, length: 5, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '2' }
          ]
        }
      ]
    },
    {
      id: 'COMP_VD_KC407A',
      name: 'КЦ407А (диодный мост)',
      library: 'Диоды и Оптопары (ГОСТ 2.730)',
      refDesPrefix: 'VD',
      defaultValue: 'КЦ407А',
      gostStandard: 'бК0.347.114 ТУ',
      description: 'Выпрямительный диодный мост 400 В / 0,5 А (ГОСТ 2.730-73)',
      patternId: 'PAT_BRIDGE_KC407',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'polyline', points: [{ x: 0, y: -6 }, { x: 6, y: 0 }, { x: 0, y: 6 }, { x: -6, y: 0 }], closed: true, width: 0.38 },
            { type: 'polyline', points: [{ x: -1.5, y: 1.6 }, { x: 1.5, y: 1.6 }, { x: 0, y: -1.6 }], closed: true, width: 0.28 },
            { type: 'line', x1: -1.5, y1: -1.6, x2: 1.5, y2: -1.6, width: 0.32 }
          ],
          pins: [
            { id: 'p1', number: '1', name: '~', x: -10, y: 0, length: 4, orientation: 0, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true, padMapping: '1' },
            { id: 'p2', number: '2', name: '~', x: 10, y: 0, length: 4, orientation: 180, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true, padMapping: '2' },
            { id: 'p3', number: '3', name: '+', x: 0, y: -10, length: 4, orientation: 90, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '3' },
            { id: 'p4', number: '4', name: '-', x: 0, y: 10, length: 4, orientation: 270, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '4' }
          ]
        }
      ]
    }
  ]
};
