import { ComponentLibrary } from '../../../core/types';

export const libGeneral: ComponentLibrary = {
  id: 'lib_gost_general',
  name: 'УГО Общие (ГОСТ 2.721)',
  category: 'Символы',
  description: 'Символы цепей питания, земли, корпуса и портов по ГОСТ 2.721-74',
  components: [
    {
      id: 'COMP_GND',
      name: 'Земля (GND)',
      library: 'УГО Общие (ГОСТ 2.721)',
      refDesPrefix: '#GND',
      defaultValue: 'GND',
      gostStandard: 'ГОСТ 2.721-74',
      description: 'Заземление / Общий провод схемы',
      patternId: '',
      isNetPort: true,
      portNetName: 'GND',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'line', x1: -2.5, y1: 5, x2: 2.5, y2: 5, width: 0.35 },
            { type: 'line', x1: -1.5, y1: 6.2, x2: 1.5, y2: 6.2, width: 0.35 },
            { type: 'line', x1: -0.6, y1: 7.4, x2: 0.6, y2: 7.4, width: 0.35 }
          ],
          pins: [
            { id: 'pin_1', number: '1', name: 'GND', x: 0, y: 0, length: 5, orientation: 90, electricalType: 'Power', style: 'Line', showName: false, showNumber: false }
          ]
        }
      ]
    },
    {
      id: 'COMP_VCC_5V',
      name: 'Питание +5В',
      library: 'УГО Общие (ГОСТ 2.721)',
      refDesPrefix: '#PWR',
      defaultValue: '+5V',
      gostStandard: 'ГОСТ 2.721-74',
      description: 'Шина питания +5В',
      patternId: '',
      isNetPort: true,
      portNetName: '+5V',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'line', x1: -2.5, y1: -5, x2: 2.5, y2: -5, width: 0.4 },
            { type: 'text', x: 0, y: -7.5, text: '+5V', size: 2.6, align: 'center' }
          ],
          pins: [
            { id: 'pin_1', number: '1', name: '+5V', x: 0, y: 0, length: 5, orientation: 270, electricalType: 'Power', style: 'Line', showName: false, showNumber: false }
          ]
        }
      ]
    },
    {
      id: 'COMP_VCC_3V3',
      name: 'Питание +3,3В',
      library: 'УГО Общие (ГОСТ 2.721)',
      refDesPrefix: '#PWR',
      defaultValue: '+3V3',
      gostStandard: 'ГОСТ 2.721-74',
      description: 'Шина питания +3,3В',
      patternId: '',
      isNetPort: true,
      portNetName: '+3V3',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'line', x1: -2.5, y1: -5, x2: 2.5, y2: -5, width: 0.4 },
            { type: 'text', x: 0, y: -7.5, text: '+3.3V', size: 2.6, align: 'center' }
          ],
          pins: [
            { id: 'pin_1', number: '1', name: '+3V3', x: 0, y: 0, length: 5, orientation: 270, electricalType: 'Power', style: 'Line', showName: false, showNumber: false }
          ]
        }
      ]
    },
    {
      id: 'COMP_VCC_12V',
      name: 'Питание +12В',
      library: 'УГО Общие (ГОСТ 2.721)',
      refDesPrefix: '#PWR',
      defaultValue: '+12V',
      gostStandard: 'ГОСТ 2.721-74',
      description: 'Шина питания +12В',
      patternId: '',
      isNetPort: true,
      portNetName: '+12V',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'line', x1: -2.5, y1: -5, x2: 2.5, y2: -5, width: 0.4 },
            { type: 'text', x: 0, y: -7.5, text: '+12V', size: 2.6, align: 'center' }
          ],
          pins: [
            { id: 'pin_1', number: '1', name: '+12V', x: 0, y: 0, length: 5, orientation: 270, electricalType: 'Power', style: 'Line', showName: false, showNumber: false }
          ]
        }
      ]
    },
    {
      id: 'COMP_CHASSIS',
      name: 'Корпус / Экран',
      library: 'УГО Общие (ГОСТ 2.721)',
      refDesPrefix: '#GND',
      defaultValue: 'CHASSIS',
      gostStandard: 'ГОСТ 2.721-74',
      description: 'Соединение с корпусом прибора',
      patternId: '',
      isNetPort: true,
      portNetName: 'CHASSIS',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'line', x1: -2.5, y1: 5, x2: 2.5, y2: 5, width: 0.35 },
            { type: 'line', x1: -2.5, y1: 5, x2: -3.8, y2: 7, width: 0.35 },
            { type: 'line', x1: 0, y1: 5, x2: -1.3, y2: 7, width: 0.35 },
            { type: 'line', x1: 2.5, y1: 5, x2: 1.2, y2: 7, width: 0.35 }
          ],
          pins: [
            { id: 'pin_1', number: '1', name: 'CHASSIS', x: 0, y: 0, length: 5, orientation: 90, electricalType: 'Power', style: 'Line', showName: false, showNumber: false }
          ]
        }
      ]
    },
    {
      id: 'COMP_NET_TIE',
      name: 'Перемычка AGND-DGND (Net-Tie)',
      library: 'Цепи питания и Базовые (ГОСТ 2.721)',
      refDesPrefix: 'X',
      defaultValue: 'Перемычка 0 Ом',
      gostStandard: 'ГОСТ 2.721-74',
      isNetTie: true,
      description: 'Топологическая перемычка (Net-Tie) для соединения аналоговой и цифровой земли в одной точке без ошибок DRC',
      patternId: 'PAT_NETTIE_0805',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'rect', x: -3.5, y: -1.5, w: 7, h: 3, width: 0.3 },
            { type: 'line', x1: -2.5, y1: 0, x2: 2.5, y2: 0, width: 0.45 },
            { type: 'circle', cx: -2.5, cy: 0, r: 0.6, fill: true },
            { type: 'circle', cx: 2.5, cy: 0, r: 0.6, fill: true }
          ],
          pins: [
            { id: 'p1', number: '1', name: '1', x: -7.5, y: 0, length: 4, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '1' },
            { id: 'p2', number: '2', name: '2', x: 7.5, y: 0, length: 4, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '2' }
          ]
        }
      ]
    },
    {
      id: 'COMP_MTG_M3',
      name: 'Отверстие крепёжное М3',
      library: 'Цепи питания и Базовые (ГОСТ 2.721)',
      refDesPrefix: 'H',
      defaultValue: 'М3 (Ø3,2)',
      gostStandard: 'ГОСТ 11284-75',
      description: 'Металлизированное крепёжное отверстие Ø3,2 мм с подключением к корпусу/GND',
      patternId: 'PAT_MTG_M3',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'circle', cx: 0, cy: 0, r: 2.8, width: 0.35 },
            { type: 'circle', cx: 0, cy: 0, r: 1.5, width: 0.35 }
          ],
          pins: [
            { id: 'p1', number: '1', name: 'MNT', x: -5, y: 0, length: 2.2, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '1' }
          ]
        }
      ]
    }
  ]
};
