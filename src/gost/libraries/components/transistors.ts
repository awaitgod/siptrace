import { ComponentLibrary } from '../../../core/types';

export const libTransistors: ComponentLibrary = {
  id: 'lib_gost_trans',
  name: 'Транзисторы (ГОСТ 2.730)',
  category: 'Полупроводники',
  description: 'КТ315, КТ361, КТ815, КТ814, КП501А, КП303А по ГОСТ 2.730-73',
  components: [
    {
      id: 'COMP_VT_KT315B',
      name: 'КТ315Б (биполярный n-p-n)',
      library: 'Транзисторы (ГОСТ 2.730)',
      refDesPrefix: 'VT',
      defaultValue: 'КТ315Б',
      gostStandard: 'ГОСТ 2.730-73',
      description: 'Транзистор кремниевый эпитаксиально-планарный n-p-n',
      patternId: 'PAT_KT315_FLAT',
      spiceModel: { prefix: 'Q', modelName: 'KT315B', params: { BF: 120 } },
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'circle', cx: 1.5, cy: 0, r: 4.9, width: 0.3 },
            // Base bar
            { type: 'line', x1: -2, y1: -3.2, x2: -2, y2: 3.2, width: 0.55 },
            // Collector
            { type: 'line', x1: -2, y1: -1.5, x2: 2.5, y2: -3.8, width: 0.35 },
            { type: 'line', x1: 2.5, y1: -3.8, x2: 2.5, y2: -5, width: 0.35 },
            // Emitter with outward arrow (n-p-n)
            { type: 'line', x1: -2, y1: 1.5, x2: 2.5, y2: 3.8, width: 0.35 },
            { type: 'line', x1: 2.5, y1: 3.8, x2: 2.5, y2: 5, width: 0.35 },
            { type: 'polyline', points: [{ x: 0.2, y: 3.4 }, { x: 2.1, y: 3.6 }, { x: 1.0, y: 1.9 }], closed: true, fill: true }
          ],
          pins: [
            { id: 'p_b', number: '3', name: 'Б', x: -7.5, y: 0, length: 5.5, orientation: 0, electricalType: 'Input', style: 'Line', showName: false, showNumber: true, padMapping: '3' },
            { id: 'p_c', number: '2', name: 'К', x: 2.5, y: -10, length: 5, orientation: 90, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '2' },
            { id: 'p_e', number: '1', name: 'Э', x: 2.5, y: 10, length: 5, orientation: 270, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '1' }
          ]
        }
      ]
    },
    {
      id: 'COMP_VT_KT361B',
      name: 'КТ361Б (биполярный p-n-p)',
      library: 'Транзисторы (ГОСТ 2.730)',
      refDesPrefix: 'VT',
      defaultValue: 'КТ361Б',
      gostStandard: 'ГОСТ 2.730-73',
      description: 'Транзистор кремниевый p-n-p',
      patternId: 'PAT_KT315_FLAT',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'circle', cx: 1.5, cy: 0, r: 4.9, width: 0.3 },
            { type: 'line', x1: -2, y1: -3.2, x2: -2, y2: 3.2, width: 0.55 },
            // Emitter top with inward arrow (p-n-p)
            { type: 'line', x1: -2, y1: -1.5, x2: 2.5, y2: -3.8, width: 0.35 },
            { type: 'line', x1: 2.5, y1: -3.8, x2: 2.5, y2: -5, width: 0.35 },
            { type: 'polyline', points: [{ x: -1.2, y: -1.9 }, { x: 0.7, y: -2.0 }, { x: 0.1, y: -3.5 }], closed: true, fill: true },
            // Collector bottom
            { type: 'line', x1: -2, y1: 1.5, x2: 2.5, y2: 3.8, width: 0.35 },
            { type: 'line', x1: 2.5, y1: 3.8, x2: 2.5, y2: 5, width: 0.35 }
          ],
          pins: [
            { id: 'p_b', number: '3', name: 'Б', x: -7.5, y: 0, length: 5.5, orientation: 0, electricalType: 'Input', style: 'Line', showName: false, showNumber: true, padMapping: '3' },
            { id: 'p_e', number: '1', name: 'Э', x: 2.5, y: -10, length: 5, orientation: 90, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '1' },
            { id: 'p_c', number: '2', name: 'К', x: 2.5, y: 10, length: 5, orientation: 270, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '2' }
          ]
        }
      ]
    },
    {
      id: 'COMP_VT_KP501A',
      name: 'КП501А (полевой n-МОП)',
      library: 'Транзисторы (ГОСТ 2.730)',
      refDesPrefix: 'VT',
      defaultValue: 'КП501А',
      gostStandard: 'ГОСТ 2.730-73',
      description: 'Транзистор полевой n-канал с изолированным затвором (аналог логич. ключа)',
      patternId: 'PAT_KT26_TO92',
      spiceModel: { prefix: 'M', modelName: 'KP501A', params: { VTO: 1.8 } },
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            // Outer GOST circle
            { type: 'circle', cx: 1.6, cy: 0, r: 5.1, width: 0.3 },
            // Insulated Gate (vertical line + lead)
            { type: 'line', x1: -2.4, y1: -3.2, x2: -2.4, y2: 3.2, width: 0.45 },
            // Segmented channel (enhancement mode)
            { type: 'line', x1: -0.9, y1: -3.5, x2: -0.9, y2: -1.8, width: 0.45 },
            { type: 'line', x1: -0.9, y1: -0.9, x2: -0.9, y2: 0.9, width: 0.45 },
            { type: 'line', x1: -0.9, y1: 1.8, x2: -0.9, y2: 3.5, width: 0.45 },
            // Drain (top)
            { type: 'line', x1: -0.9, y1: -2.6, x2: 2.5, y2: -2.6, width: 0.35 },
            { type: 'line', x1: 2.5, y1: -2.6, x2: 2.5, y2: -5, width: 0.35 },
            // Source + substrate link (bottom)
            { type: 'line', x1: -0.9, y1: 0, x2: 2.5, y2: 0, width: 0.35 },
            { type: 'line', x1: 2.5, y1: 0, x2: 2.5, y2: 5, width: 0.35 },
            { type: 'line', x1: -0.9, y1: 2.6, x2: 2.5, y2: 2.6, width: 0.35 },
            // Substrate arrow pointing left (n-channel)
            { type: 'polyline', points: [{ x: -0.7, y: 0 }, { x: 0.9, y: -0.8 }, { x: 0.9, y: 0.8 }], closed: true, fill: true },
            // Body diode inside circle per ГОСТ
            { type: 'line', x1: 2.5, y1: 2.6, x2: 4.5, y2: 2.6, width: 0.25 },
            { type: 'line', x1: 4.5, y1: 2.6, x2: 4.5, y2: -2.6, width: 0.25 },
            { type: 'line', x1: 4.5, y1: -2.6, x2: 2.5, y2: -2.6, width: 0.25 },
            { type: 'polyline', points: [{ x: 3.7, y: 0.8 }, { x: 5.3, y: 0.8 }, { x: 4.5, y: -0.8 }], closed: true, width: 0.25 },
            { type: 'line', x1: 3.7, y1: -0.8, x2: 5.3, y2: -0.8, width: 0.3 }
          ],
          pins: [
            { id: 'p_g', number: '3', name: 'З', x: -7.5, y: 0, length: 5.1, orientation: 0, electricalType: 'Input', style: 'Line', showName: false, showNumber: true, padMapping: '3' },
            { id: 'p_d', number: '2', name: 'С', x: 2.5, y: -10, length: 5, orientation: 90, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '2' },
            { id: 'p_s', number: '1', name: 'И', x: 2.5, y: 10, length: 5, orientation: 270, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '1' }
          ]
        }
      ]
    },
    {
      id: 'COMP_VT_KP505A',
      name: 'КП505А (полевой p-МОП)',
      library: 'Транзисторы (ГОСТ 2.730)',
      refDesPrefix: 'VT',
      defaultValue: 'КП505А',
      gostStandard: 'ГОСТ 2.730-73',
      description: 'Транзистор полевой p-канал с изолированным затвором обогащенного типа (ГОСТ 2.730-73)',
      patternId: 'PAT_KT26_TO92',
      spiceModel: { prefix: 'M', modelName: 'KP505A', params: { VTO: -1.8 } },
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'circle', cx: 1.6, cy: 0, r: 5.1, width: 0.3 },
            { type: 'line', x1: -2.4, y1: -3.2, x2: -2.4, y2: 3.2, width: 0.45 },
            { type: 'line', x1: -0.9, y1: -3.5, x2: -0.9, y2: -1.8, width: 0.45 },
            { type: 'line', x1: -0.9, y1: -0.9, x2: -0.9, y2: 0.9, width: 0.45 },
            { type: 'line', x1: -0.9, y1: 1.8, x2: -0.9, y2: 3.5, width: 0.45 },
            { type: 'line', x1: -0.9, y1: -2.6, x2: 2.5, y2: -2.6, width: 0.35 },
            { type: 'line', x1: 2.5, y1: -2.6, x2: 2.5, y2: -5, width: 0.35 },
            { type: 'line', x1: -0.9, y1: 0, x2: 2.5, y2: 0, width: 0.35 },
            { type: 'line', x1: 2.5, y1: 0, x2: 2.5, y2: 5, width: 0.35 },
            { type: 'line', x1: -0.9, y1: 2.6, x2: 2.5, y2: 2.6, width: 0.35 },
            // Substrate arrow pointing right / outward (p-channel)
            { type: 'polyline', points: [{ x: 1.1, y: 0 }, { x: -0.5, y: -0.8 }, { x: -0.5, y: 0.8 }], closed: true, fill: true },
            // Body diode inside circle per ГОСТ (opposite polarity for P-MOS)
            { type: 'line', x1: 2.5, y1: 2.6, x2: 4.5, y2: 2.6, width: 0.25 },
            { type: 'line', x1: 4.5, y1: 2.6, x2: 4.5, y2: -2.6, width: 0.25 },
            { type: 'line', x1: 4.5, y1: -2.6, x2: 2.5, y2: -2.6, width: 0.25 },
            { type: 'polyline', points: [{ x: 3.7, y: -0.8 }, { x: 5.3, y: -0.8 }, { x: 4.5, y: 0.8 }], closed: true, width: 0.25 },
            { type: 'line', x1: 3.7, y1: 0.8, x2: 5.3, y2: 0.8, width: 0.3 }
          ],
          pins: [
            { id: 'p_g', number: '3', name: 'З', x: -7.5, y: 0, length: 5.1, orientation: 0, electricalType: 'Input', style: 'Line', showName: false, showNumber: true, padMapping: '3' },
            { id: 'p_d', number: '2', name: 'С', x: 2.5, y: -10, length: 5, orientation: 90, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '2' },
            { id: 'p_s', number: '1', name: 'И', x: 2.5, y: 10, length: 5, orientation: 270, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '1' }
          ]
        }
      ]
    },
    {
      id: 'COMP_VT_KT815G',
      name: 'КТ815Г (силовой n-p-n, КТ-28)',
      library: 'Транзисторы (ГОСТ 2.730)',
      refDesPrefix: 'VT',
      defaultValue: 'КТ815Г',
      gostStandard: 'ГОСТ 2.730-73',
      description: 'Транзистор средней/высокой мощности n-p-n 100 В, 1.5 А',
      patternId: 'PAT_KT28_TO220',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'circle', cx: 1.5, cy: 0, r: 4.9, width: 0.3 },
            { type: 'line', x1: -2, y1: -3.2, x2: -2, y2: 3.2, width: 0.55 },
            { type: 'line', x1: -2, y1: -1.5, x2: 2.5, y2: -3.8, width: 0.35 },
            { type: 'line', x1: 2.5, y1: -3.8, x2: 2.5, y2: -5, width: 0.35 },
            { type: 'line', x1: -2, y1: 1.5, x2: 2.5, y2: 3.8, width: 0.35 },
            { type: 'line', x1: 2.5, y1: 3.8, x2: 2.5, y2: 5, width: 0.35 },
            { type: 'polyline', points: [{ x: 0.2, y: 3.4 }, { x: 2.1, y: 3.6 }, { x: 1.0, y: 1.9 }], closed: true, fill: true }
          ],
          pins: [
            { id: 'p_b', number: '3', name: 'Б', x: -7.5, y: 0, length: 5.5, orientation: 0, electricalType: 'Input', style: 'Line', showName: false, showNumber: true, padMapping: '3' },
            { id: 'p_c', number: '2', name: 'К', x: 2.5, y: -10, length: 5, orientation: 90, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '2' },
            { id: 'p_e', number: '1', name: 'Э', x: 2.5, y: 10, length: 5, orientation: 270, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '1' }
          ]
        }
      ]
    },
    {
      id: 'COMP_VT_KT3102AM',
      name: 'КТ3102АМ (NPN малошум.)',
      library: 'Транзисторы (ГОСТ 2.730)',
      refDesPrefix: 'VT',
      defaultValue: 'КТ3102АМ',
      gostStandard: 'аА0.336.183 ТУ',
      description: 'Малошумящий биполярный транзистор структуры n-p-n (КТ-26)',
      patternId: 'PAT_KT26_TO92',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'circle', cx: 1.5, cy: 0, r: 4.5, width: 0.35 },
            { type: 'line', x1: -2, y1: -2.5, x2: -2, y2: 2.5, width: 0.55 },
            { type: 'line', x1: -2, y1: -1.5, x2: 2.5, y2: -3.8, width: 0.35 },
            { type: 'line', x1: 2.5, y1: -3.8, x2: 2.5, y2: -5, width: 0.35 },
            { type: 'line', x1: -2, y1: 1.5, x2: 2.5, y2: 3.8, width: 0.35 },
            { type: 'line', x1: 2.5, y1: 3.8, x2: 2.5, y2: 5, width: 0.35 },
            { type: 'polyline', points: [{ x: 0.2, y: 3.4 }, { x: 2.1, y: 3.6 }, { x: 1.0, y: 1.9 }], closed: true, fill: true }
          ],
          pins: [
            { id: 'p_b', number: '2', name: 'Б', x: -7.5, y: 0, length: 5.5, orientation: 0, electricalType: 'Input', style: 'Line', showName: false, showNumber: true, padMapping: '2' },
            { id: 'p_c', number: '3', name: 'К', x: 2.5, y: -10, length: 5, orientation: 90, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '3' },
            { id: 'p_e', number: '1', name: 'Э', x: 2.5, y: 10, length: 5, orientation: 270, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '1' }
          ]
        }
      ]
    },
    {
      id: 'COMP_VT_KT3107B',
      name: 'КТ3107Б (PNP маломощн.)',
      library: 'Транзисторы (ГОСТ 2.730)',
      refDesPrefix: 'VT',
      defaultValue: 'КТ3107Б',
      gostStandard: 'аА0.336.184 ТУ',
      description: 'Кремниевый биполярный транзистор структуры p-n-p (КТ-26)',
      patternId: 'PAT_KT26_TO92',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'circle', cx: 1.5, cy: 0, r: 4.5, width: 0.35 },
            { type: 'line', x1: -2, y1: -2.5, x2: -2, y2: 2.5, width: 0.55 },
            { type: 'line', x1: -2, y1: -1.5, x2: 2.5, y2: -3.8, width: 0.35 },
            { type: 'line', x1: 2.5, y1: -3.8, x2: 2.5, y2: -5, width: 0.35 },
            { type: 'line', x1: -2, y1: 1.5, x2: 2.5, y2: 3.8, width: 0.35 },
            { type: 'line', x1: 2.5, y1: 3.8, x2: 2.5, y2: 5, width: 0.35 },
            { type: 'polyline', points: [{ x: -1.3, y: 1.8 }, { x: 0.6, y: 1.9 }, { x: -0.3, y: 3.5 }], closed: true, fill: true }
          ],
          pins: [
            { id: 'p_b', number: '2', name: 'Б', x: -7.5, y: 0, length: 5.5, orientation: 0, electricalType: 'Input', style: 'Line', showName: false, showNumber: true, padMapping: '2' },
            { id: 'p_c', number: '3', name: 'К', x: 2.5, y: -10, length: 5, orientation: 90, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '3' },
            { id: 'p_e', number: '1', name: 'Э', x: 2.5, y: 10, length: 5, orientation: 270, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '1' }
          ]
        }
      ]
    }
  ]
};
