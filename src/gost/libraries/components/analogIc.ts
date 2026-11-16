import { ComponentLibrary } from '../../../core/types';

export const libAnalogIC: ComponentLibrary = {
  id: 'lib_gost_analog',
  name: 'Аналоговые ИМС (ГОСТ 2.759)',
  category: 'Микросхемы',
  description: 'КР140УД708, КР142ЕН5А, К5559ИН10А (RS-485), КР1006ВИ1',
  components: [
    {
      id: 'COMP_DA_K5559IN10A',
      name: 'К5559ИН10А (приёмопередатчик RS-485)',
      library: 'Аналоговые ИМС (ГОСТ 2.759)',
      refDesPrefix: 'DA',
      defaultValue: 'К5559ИН10А',
      gostStandard: 'АЕНВ.431290.025 ТУ',
      description: 'Российский полудуплексный приёмопередатчик RS-485 (АО «ПКК Миландр»)',
      manufacturer: 'АО «ПКК Миландр»',
      patternId: 'PAT_DIP8',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'rect', x: -10, y: -12.5, w: 20, h: 25, width: 0.4 },
            { type: 'text', x: 0, y: 0.1, text: 'RS-485', size: 2.0, bold: true, align: 'center' },
            // Receiver triangle pointing left & Driver triangle pointing right (clear of pin labels)
            { type: 'polyline', points: [{ x: 3.2, y: -6.2 }, { x: 3.2, y: -2.2 }, { x: -2.8, y: -4.2 }], closed: true, width: 0.25 },
            { type: 'polyline', points: [{ x: -3.2, y: 2.4 }, { x: -3.2, y: 6.4 }, { x: 2.8, y: 4.4 }], closed: true, width: 0.25 }
          ],
          pins: [
            { id: 'p1', number: '1', name: 'RO', x: -15, y: -7.5, length: 5, orientation: 0, electricalType: 'Output', style: 'Line', showName: true, showNumber: true, padMapping: '1' },
            { id: 'p2', number: '2', name: 'RE', x: -15, y: -2.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Inverted', showName: true, showNumber: true, padMapping: '2' },
            { id: 'p3', number: '3', name: 'DE', x: -15, y: 2.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true, padMapping: '3' },
            { id: 'p4', number: '4', name: 'DI', x: -15, y: 7.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true, padMapping: '4' },
            { id: 'p8', number: '8', name: 'VCC', x: 0, y: -17.5, length: 5, orientation: 90, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '8' },
            { id: 'p5', number: '5', name: 'GND', x: 0, y: 17.5, length: 5, orientation: 270, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '5' },
            { id: 'p6', number: '6', name: 'A', x: 15, y: -5, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '6' },
            { id: 'p7', number: '7', name: 'B', x: 15, y: 5, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '7' }
          ]
        }
      ]
    },
    {
      id: 'COMP_DA_KR140UD708',
      name: 'КР140УД708 (операционный усилитель)',
      library: 'Аналоговые ИМС (ГОСТ 2.759)',
      refDesPrefix: 'DA',
      defaultValue: 'КР140УД708',
      gostStandard: 'бК0.348.203 ТУ',
      description: 'Операционный усилитель общего применения (ГОСТ 2.759-82)',
      patternId: 'PAT_DIP8',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'rect', x: -7.5, y: -7.5, w: 15, h: 15, width: 0.4 },
            // ГОСТ triangle symbol inside box (clear of top +U pin label)
            { type: 'text', x: 0, y: 0.2, text: '▷', size: 3.4, align: 'center' },
            { type: 'text', x: -5.5, y: -2.5, text: '+', size: 2.6 },
            { type: 'text', x: -5.5, y: 2.5, text: '–', size: 2.6 }
          ],
          pins: [
            { id: 'p3', number: '3', name: '+', x: -12.5, y: -2.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: false, showNumber: true, padMapping: '3' },
            { id: 'p2', number: '2', name: '-', x: -12.5, y: 2.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: false, showNumber: true, padMapping: '2' },
            { id: 'p6', number: '6', name: 'ВЫХ', x: 12.5, y: 0, length: 5, orientation: 180, electricalType: 'Output', style: 'Line', showName: false, showNumber: true, padMapping: '6' },
            { id: 'p7', number: '7', name: '+U', x: 0, y: -12.5, length: 5, orientation: 90, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '7' },
            { id: 'p4', number: '4', name: '-U', x: 0, y: 12.5, length: 5, orientation: 270, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '4' }
          ]
        }
      ]
    },
    {
      id: 'COMP_DA_KR142EN5A',
      name: 'КР142ЕН5А (стабилизатор +5В)',
      library: 'Аналоговые ИМС (ГОСТ 2.759)',
      refDesPrefix: 'DA',
      defaultValue: 'КР142ЕН5А',
      gostStandard: 'бК0.348.541 ТУ',
      description: 'Интегральный линейный стабилизатор напряжения +5 В, 1.5 А',
      patternId: 'PAT_KT28_TO220',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'rect', x: -7.5, y: -5, w: 15, h: 10, width: 0.4 },
            { type: 'text', x: 0, y: -2.7, text: 'U=+5В', size: 2.1, bold: true, align: 'center' }
          ],
          pins: [
            { id: 'p1', number: '1', name: 'ВХ', x: -12.5, y: 0, length: 5, orientation: 0, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '1' },
            { id: 'p2', number: '2', name: 'ОБЩ', x: 0, y: 10, length: 5, orientation: 270, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '2' },
            { id: 'p3', number: '3', name: 'ВЫХ', x: 12.5, y: 0, length: 5, orientation: 180, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '3' }
          ]
        }
      ]
    },
    {
      id: 'COMP_DA_KR142EN8B',
      name: 'КР142ЕН8Б (стабилизатор +12В)',
      library: 'Аналоговые ИМС (ГОСТ 2.759)',
      refDesPrefix: 'DA',
      defaultValue: 'КР142ЕН8Б',
      gostStandard: 'бК0.348.541 ТУ',
      description: 'Линейный стабилизатор напряжения +12 В (КТ-28 / TO-220)',
      patternId: 'PAT_KT28_TO220',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'rect', x: -7.5, y: -5, w: 15, h: 10, width: 0.4 },
            { type: 'text', x: 0, y: -2.7, text: 'U=+12В', size: 2.1, bold: true, align: 'center' }
          ],
          pins: [
            { id: 'p1', number: '1', name: 'ВХ', x: -12.5, y: 0, length: 5, orientation: 0, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '1' },
            { id: 'p2', number: '2', name: 'ОБЩ', x: 0, y: 10, length: 5, orientation: 270, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '2' },
            { id: 'p3', number: '3', name: 'ВЫХ', x: 12.5, y: 0, length: 5, orientation: 180, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '3' }
          ]
        }
      ]
    },
    {
      id: 'COMP_DA_K1156EU2',
      name: 'К1156ЕУ2 (ШИМ-контроллер)',
      library: 'Аналоговые ИМС (ГОСТ 2.759)',
      refDesPrefix: 'DA',
      defaultValue: 'К1156ЕУ2',
      gostStandard: 'АЕЯР.431200.145 ТУ',
      description: 'Быстродействующий двухтактный ШИМ-контроллер (DIP-16 / SOIC-16)',
      patternId: 'PAT_DIP16',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'rect', x: -12.5, y: -15, w: 25, h: 30, width: 0.4 },
            { type: 'text', x: 0, y: -5.5, text: 'ШИМ', size: 2.4, bold: true, align: 'center' }
          ],
          pins: [
            { id: 'p1', number: '1', name: 'ИНВ', x: -17.5, y: -7.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true, padMapping: '1' },
            { id: 'p2', number: '2', name: 'НЕИНВ', x: -17.5, y: -2.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true, padMapping: '2' },
            { id: 'p3', number: '3', name: 'ОС', x: -17.5, y: 2.5, length: 5, orientation: 0, electricalType: 'Output', style: 'Line', showName: true, showNumber: true, padMapping: '3' },
            { id: 'p4', number: '4', name: 'СИНХ', x: -17.5, y: 7.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true, padMapping: '4' },
            { id: 'p5', number: '11', name: 'ВЫХ_А', x: 17.5, y: -5, length: 5, orientation: 180, electricalType: 'Output', style: 'Line', showName: true, showNumber: true, padMapping: '11' },
            { id: 'p6', number: '14', name: 'ВЫХ_B', x: 17.5, y: 0, length: 5, orientation: 180, electricalType: 'Output', style: 'Line', showName: true, showNumber: true, padMapping: '14' },
            { id: 'p7', number: '16', name: 'VREF', x: 17.5, y: 7.5, length: 5, orientation: 180, electricalType: 'Output', style: 'Line', showName: true, showNumber: true, padMapping: '16' },
            { id: 'p8', number: '15', name: '+U', x: 0, y: -20, length: 5, orientation: 90, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '15' },
            { id: 'p9', number: '10', name: 'GND', x: 0, y: 20, length: 5, orientation: 270, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '10' }
          ]
        }
      ]
    }
  ]
};
