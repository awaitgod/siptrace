import { ComponentLibrary } from '../../../core/types';

export const libOpto: ComponentLibrary = {
  id: 'lib_gost_opto',
  name: 'Оптоэлектроника (ГОСТ 2.730)',
  category: 'Полупроводники',
  description: 'Транзисторные и логические оптопары АОТ128, АОУ103, К249ЛП1 по ГОСТ 2.730-73',
  components: [
    {
      id: 'COMP_U_AOT128A',
      name: 'АОТ128А (оптрон транзисторный)',
      library: 'Оптоэлектроника (ГОСТ 2.730)',
      refDesPrefix: 'U',
      defaultValue: 'АОТ128А',
      gostStandard: 'аА0.339.427 ТУ',
      description: 'Оптопара транзисторная с гальванической развязкой DIP-6 (ГОСТ 2.730-73)',
      patternId: 'PAT_DIP6',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            // Rectangular optocoupler body per ГОСТ 2.730
            { type: 'rect', x: -7.5, y: -5, w: 15, h: 10, width: 0.35 },
            // LED on left (vertical downward from y=-2.5 to y=2.5)
            { type: 'line', x1: -7.5, y1: -2.5, x2: -4.5, y2: -2.5, width: 0.25 },
            { type: 'line', x1: -4.5, y1: -2.5, x2: -4.5, y2: 2.5, width: 0.25 },
            { type: 'line', x1: -4.5, y1: 2.5, x2: -7.5, y2: 2.5, width: 0.25 },
            { type: 'polyline', points: [{ x: -5.8, y: -1.3 }, { x: -3.2, y: -1.3 }, { x: -4.5, y: 1.2 }], closed: true, width: 0.3 },
            { type: 'line', x1: -5.8, y1: 1.2, x2: -3.2, y2: 1.2, width: 0.35 },
            // Optical arrows left -> right
            { type: 'line', x1: -2.2, y1: -1.0, x2: 1.2, y2: -1.0, width: 0.25 },
            { type: 'polyline', points: [{ x: 0.2, y: -1.5 }, { x: 1.2, y: -1.0 }, { x: 0.2, y: -0.5 }], width: 0.25 },
            { type: 'line', x1: -2.2, y1: 1.0, x2: 1.2, y2: 1.0, width: 0.25 },
            { type: 'polyline', points: [{ x: 0.2, y: 0.5 }, { x: 1.2, y: 1.0 }, { x: 0.2, y: 1.5 }], width: 0.25 },
            // Phototransistor on right
            { type: 'line', x1: 2.8, y1: -2.5, x2: 2.8, y2: 2.5, width: 0.45 },
            { type: 'line', x1: 2.8, y1: -1.0, x2: 5.5, y2: -2.5, width: 0.3 },
            { type: 'line', x1: 5.5, y1: -2.5, x2: 7.5, y2: -2.5, width: 0.3 },
            { type: 'line', x1: 2.8, y1: 1.0, x2: 5.5, y2: 2.5, width: 0.3 },
            { type: 'line', x1: 5.5, y1: 2.5, x2: 7.5, y2: 2.5, width: 0.3 },
            { type: 'polyline', points: [{ x: 4.1, y: 2.3 }, { x: 5.5, y: 2.5 }, { x: 4.7, y: 1.2 }], closed: true, fill: true }
          ],
          pins: [
            { id: 'p1', number: '1', name: 'А', x: -12.5, y: -2.5, length: 5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '1' },
            { id: 'p2', number: '2', name: 'К', x: -12.5, y: 2.5, length: 5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '2' },
            { id: 'p5', number: '5', name: 'Ктр', x: 12.5, y: -2.5, length: 5, orientation: 180, electricalType: 'OpenCollector', style: 'Line', showName: false, showNumber: true, padMapping: '5' },
            { id: 'p4', number: '4', name: 'Этр', x: 12.5, y: 2.5, length: 5, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '4' }
          ]
        }
      ]
    }
  ]
};
