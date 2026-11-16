import { ComponentLibrary } from '../../../core/types';

export const libConnectorsAndSwitch: ComponentLibrary = {
  id: 'lib_gost_conn',
  name: 'Соединители и Коммутация (ГОСТ 2.755)',
  category: 'Разъёмы и реле',
  description: 'Разъёмы ПЛС, КЗ, РЭС49, кнопки КН-1, кварцы РК-169 по ГОСТ 2.755-87',
  components: [
    {
      id: 'COMP_XP_PLS5',
      name: 'ПЛС-5 (вилка 5 конт.)',
      library: 'Соединители и Коммутация (ГОСТ 2.755)',
      refDesPrefix: 'XP',
      defaultValue: 'ПЛС-5',
      gostStandard: 'ГОСТ 2.755-87',
      description: 'Соединитель штыревой 5-контактный (ГОСТ 2.755-87)',
      patternId: 'PAT_PLS_5',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'rect', x: -10, y: -12.5, w: 13.5, h: 25, width: 0.4 },
            // ГОСТ 2.755 штыревые контакты (короткие толстые штрихи у правой стенки, свободны от подписей)
            { type: 'line', x1: 2.0, y1: -10, x2: 3.5, y2: -10, width: 0.5 },
            { type: 'line', x1: 2.0, y1: -5, x2: 3.5, y2: -5, width: 0.5 },
            { type: 'line', x1: 2.0, y1: 0, x2: 3.5, y2: 0, width: 0.5 },
            { type: 'line', x1: 2.0, y1: 5, x2: 3.5, y2: 5, width: 0.5 },
            { type: 'line', x1: 2.0, y1: 10, x2: 3.5, y2: 10, width: 0.5 }
          ],
          pins: [
            { id: 'p1', number: '1', name: '+5V', x: 7.5, y: -10, length: 4, orientation: 180, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true, padMapping: '1' },
            { id: 'p2', number: '2', name: 'RX', x: 7.5, y: -5, length: 4, orientation: 180, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true, padMapping: '2' },
            { id: 'p3', number: '3', name: 'TX', x: 7.5, y: 0, length: 4, orientation: 180, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true, padMapping: '3' },
            { id: 'p4', number: '4', name: 'E', x: 7.5, y: 5, length: 4, orientation: 180, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true, padMapping: '4' },
            { id: 'p5', number: '5', name: 'GND', x: 7.5, y: 10, length: 4, orientation: 180, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true, padMapping: '5' }
          ]
        }
      ]
    },
    {
      id: 'COMP_XT_KZ4',
      name: 'КЗ-4 (клеммник 4 конт.)',
      library: 'Соединители и Коммутация (ГОСТ 2.755)',
      refDesPrefix: 'XT',
      defaultValue: 'КЗ-4-5,0',
      gostStandard: 'ГОСТ 2.755-87',
      description: 'Клеммник винтовой 4-контактный (выходная шина RS-485)',
      patternId: 'PAT_KZ_4_5MM',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'rect', x: -3.5, y: -10, w: 9, h: 20, width: 0.4 },
            { type: 'circle', cx: 3.3, cy: -7.5, r: 1.05, width: 0.3 },
            { type: 'circle', cx: 3.3, cy: -2.5, r: 1.05, width: 0.3 },
            { type: 'circle', cx: 3.3, cy: 2.5, r: 1.05, width: 0.3 },
            { type: 'circle', cx: 3.3, cy: 7.5, r: 1.05, width: 0.3 }
          ],
          pins: [
            { id: 'p1', number: '1', name: '+5V', x: -7.5, y: -7.5, length: 4, orientation: 0, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true, padMapping: '1' },
            { id: 'p2', number: '2', name: 'A', x: -7.5, y: -2.5, length: 4, orientation: 0, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true, padMapping: '2' },
            { id: 'p3', number: '3', name: 'B', x: -7.5, y: 2.5, length: 4, orientation: 0, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true, padMapping: '3' },
            { id: 'p4', number: '4', name: 'GND', x: -7.5, y: 7.5, length: 4, orientation: 0, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true, padMapping: '4' }
          ]
        }
      ]
    },
    {
      id: 'COMP_XT_KZ2',
      name: 'КЗ-2 (клеммник 2 конт.)',
      library: 'Соединители и Коммутация (ГОСТ 2.755)',
      refDesPrefix: 'XT',
      defaultValue: 'КЗ-2-5,0',
      gostStandard: 'ГОСТ 2.755-87',
      description: 'Клеммник винтовой 2-контактный питания',
      patternId: 'PAT_KZ_2_5MM',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'rect', x: -3.5, y: -5, w: 8.5, h: 10, width: 0.4 },
            { type: 'circle', cx: 2.8, cy: -2.5, r: 1.0, width: 0.3 },
            { type: 'circle', cx: 2.8, cy: 2.5, r: 1.0, width: 0.3 }
          ],
          pins: [
            { id: 'p1', number: '1', name: '1', x: -7.5, y: -2.5, length: 4, orientation: 0, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true, padMapping: '1' },
            { id: 'p2', number: '2', name: '2', x: -7.5, y: 2.5, length: 4, orientation: 0, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true, padMapping: '2' }
          ]
        }
      ]
    },
    {
      id: 'COMP_SB_KN1',
      name: 'КН-1 (кнопка тактовая)',
      library: 'Соединители и Коммутация (ГОСТ 2.755)',
      refDesPrefix: 'SB',
      defaultValue: 'КН-1',
      gostStandard: 'ГОСТ 2.755-87',
      description: 'Кнопка нажимная с замыкающим контактом',
      patternId: 'PAT_KN_TACT',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'line', x1: -5, y1: 0, x2: 5, y2: -3.5, width: 0.35 },
            { type: 'line', x1: 0, y1: -1.75, x2: 0, y2: -5.5, width: 0.25, dashed: true },
            { type: 'line', x1: -2.5, y1: -5.5, x2: 2.5, y2: -5.5, width: 0.35 }
          ],
          pins: [
            { id: 'p1', number: '1', name: '1', x: -10, y: 0, length: 5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '1' },
            { id: 'p2', number: '2', name: '2', x: 10, y: 0, length: 5, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '2' }
          ]
        }
      ]
    },
    {
      id: 'COMP_K_RES49',
      name: 'РЭС49 (реле электромагнитное)',
      library: 'Соединители и Коммутация (ГОСТ 2.755)',
      refDesPrefix: 'K',
      defaultValue: 'РЭС49',
      gostStandard: 'РС4.569.421',
      description: 'Реле электромагнитное с обмоткой и переключающим контактом',
      patternId: 'PAT_RES49',
      parts: [
        {
          partIndex: 1,
          name: 'Обмотка и контакты',
          primitives: [
            { type: 'rect', x: -7.5, y: -2.5, w: 6, h: 5, width: 0.35 },
            { type: 'line', x1: -1.5, y1: 0, x2: 1.5, y2: 0, width: 0.25, dashed: true },
            { type: 'line', x1: 1.5, y1: 0, x2: 6.0, y2: -2.5, width: 0.35 },
            { type: 'circle', cx: 6.2, cy: -2.5, r: 0.45, width: 0.25 },
            { type: 'circle', cx: 6.2, cy: 2.5, r: 0.45, width: 0.25 }
          ],
          pins: [
            { id: 'p1', number: '1', name: 'А1', x: -12.5, y: -2.5, length: 5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '1' },
            { id: 'p2', number: '2', name: 'А2', x: -12.5, y: 2.5, length: 5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '2' },
            { id: 'p3', number: '3', name: 'П', x: 10, y: 0, length: 8.5, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '3' },
            { id: 'p4', number: '4', name: 'НЗ', x: 10, y: -2.5, length: 3.3, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '4' },
            { id: 'p5', number: '5', name: 'НР', x: 10, y: 2.5, length: 3.3, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '5' }
          ]
        }
      ]
    },
    {
      id: 'COMP_BQ_RK169',
      name: 'РК-169 (кварц 8 МГц)',
      library: 'Соединители и Коммутация (ГОСТ 2.755)',
      refDesPrefix: 'BQ',
      defaultValue: '8 МГц',
      gostStandard: 'ГОСТ 2.721-74',
      description: 'Кварцевый резонатор (ГОСТ 2.721-74)',
      patternId: 'PAT_RK169',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'rect', x: -1.5, y: -3.5, w: 3, h: 7, width: 0.35 },
            { type: 'line', x1: -3.2, y1: -2.5, x2: -3.2, y2: 2.5, width: 0.4 },
            { type: 'line', x1: 3.2, y1: -2.5, x2: 3.2, y2: 2.5, width: 0.4 }
          ],
          pins: [
            { id: 'p1', number: '1', name: '1', x: -7.5, y: 0, length: 4.3, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '1' },
            { id: 'p2', number: '2', name: '2', x: 7.5, y: 0, length: 4.3, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '2' }
          ]
        }
      ]
    },
    {
      id: 'COMP_XS_USBC',
      name: 'ОНЦ-USB-C (розетка USB Type-C)',
      library: 'Соединители и Коммутация (ГОСТ 2.755)',
      refDesPrefix: 'XS',
      defaultValue: 'USB Type-C 16p',
      gostStandard: 'ГОСТ 2.755-87 / IEC 62680',
      description: 'Розетка USB Type-C 16-контактная (питание VBUS, линии D+/D-, CC1/CC2, экран)',
      patternId: 'PAT_USBC_16P',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'rect', x: -7.5, y: -15, w: 12.5, h: 30, width: 0.4 },
            { type: 'text', x: -4.0, y: -10.5, text: 'USB-C', size: 1.9, bold: true, align: 'center' }
          ],
          pins: [
            { id: 'p1', number: '1', name: 'VBUS', x: 10, y: -10, length: 5, orientation: 180, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '2' },
            { id: 'p2', number: '2', name: 'D+', x: 10, y: -5, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '6' },
            { id: 'p3', number: '3', name: 'D-', x: 10, y: 0, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '5' },
            { id: 'p4', number: '4', name: 'CC1', x: 10, y: 5, length: 5, orientation: 180, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true, padMapping: '4' },
            { id: 'p5', number: '5', name: 'CC2', x: 10, y: 10, length: 5, orientation: 180, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true, padMapping: '10' },
            { id: 'p6', number: '6', name: 'GND', x: -5, y: 20, length: 5, orientation: 270, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '1' },
            { id: 'p7', number: 'S1', name: 'SHLD', x: 2.5, y: 20, length: 5, orientation: 270, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: 'S1' }
          ]
        }
      ]
    },
    {
      id: 'COMP_XS_DB9',
      name: 'ОНЦ / DB-9F (розетка RS-232 9 конт.)',
      library: 'Соединители и Коммутация (ГОСТ 2.755)',
      refDesPrefix: 'XS',
      defaultValue: 'DB-9F',
      gostStandard: 'ГОСТ 2.755-87',
      description: 'Розетка приборная 9-контактная для интерфейсов RS-232 / RS-485 / CAN',
      patternId: 'PAT_DB9_F',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'rect', x: -7.5, y: -25, w: 12.5, h: 50, width: 0.4 },
            { type: 'text', x: -4.0, y: -21.5, text: 'XS 9p', size: 2.0, bold: true, align: 'center' }
          ],
          pins: Array.from({ length: 9 }, (_, i) => ({
            id: `p${i + 1}`,
            number: `${i + 1}`,
            name: `${i + 1}`,
            x: 10,
            y: -20 + i * 5,
            length: 5,
            orientation: 180 as const,
            electricalType: 'Passive' as const,
            style: 'Line' as const,
            showName: false,
            showNumber: true,
            padMapping: `${i + 1}`
          }))
        }
      ]
    }
  ]
};
