import { ComponentLibrary } from '../../../core/types';

export const libRussianMcu: ComponentLibrary = {
  id: 'lib_gost_mcu',
  name: 'Микроконтроллеры РФ',
  category: 'Микросхемы',
  description: 'Отечественные микроконтроллеры Миландр (К1986ВЕ92QI) и НИИЭТ (К1921ВК01Т)',
  components: [
    {
      id: 'COMP_DD_K1986VE92QI',
      name: 'К1986ВЕ92QI (Миландр Cortex-M3)',
      library: 'Микроконтроллеры РФ',
      refDesPrefix: 'DD',
      defaultValue: 'К1986ВЕ92QI',
      gostStandard: 'АЕНВ.431290.021 ТУ',
      description: '32-разрядный микроконтроллер ARM Cortex-M3 (АО «ПКК Миландр», LQFP-64)',
      manufacturer: 'АО «ПКК Миландр»',
      patternId: 'PAT_LQFP64',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'rect', x: -17.5, y: -25, w: 35, h: 50, width: 0.45 },
            { type: 'text', x: 0, y: -21, text: 'К1986ВЕ92QI', size: 2.8, align: 'center' },
            { type: 'text', x: 0, y: -17, text: 'МПК (Миландр)', size: 2.2, align: 'center' }
          ],
          pins: [
            { id: 'p1', number: '1', name: 'PA0', x: -22.5, y: -15, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '1' },
            { id: 'p2', number: '2', name: 'PA1', x: -22.5, y: -10, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '2' },
            { id: 'p3', number: '3', name: 'PA2/TX', x: -22.5, y: -5, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '3' },
            { id: 'p4', number: '4', name: 'PA3/RX', x: -22.5, y: 0, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '4' },
            { id: 'p5', number: '19', name: 'RST', x: -22.5, y: 10, length: 5, orientation: 0, electricalType: 'Input', style: 'Inverted', showName: true, showNumber: true, padMapping: '19' },
            { id: 'p6', number: '20', name: 'OSC_IN', x: -22.5, y: 15, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true, padMapping: '20' },
            { id: 'p7', number: '21', name: 'OSC_OUT', x: -22.5, y: 20, length: 5, orientation: 0, electricalType: 'Output', style: 'Line', showName: true, showNumber: true, padMapping: '21' },
            { id: 'p8', number: '25', name: 'PB0', x: 22.5, y: -15, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '25' },
            { id: 'p9', number: '26', name: 'PB1', x: 22.5, y: -10, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '26' },
            { id: 'p10', number: '45', name: 'SWDIO', x: 22.5, y: 0, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '45' },
            { id: 'p11', number: '46', name: 'SWCLK', x: 22.5, y: 5, length: 5, orientation: 180, electricalType: 'Input', style: 'Clock', showName: true, showNumber: true, padMapping: '46' },
            { id: 'p12', number: '32', name: 'VCC', x: 0, y: -30, length: 5, orientation: 90, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '32' },
            { id: 'p13', number: '31', name: 'GND', x: 0, y: 30, length: 5, orientation: 270, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '31' }
          ]
        }
      ]
    }
  ]
};
