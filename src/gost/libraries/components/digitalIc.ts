import { ComponentLibrary } from '../../../core/types';
import { makeGostLogicGatePart } from './helpers';

export const libDigitalIC: ComponentLibrary = {
  id: 'lib_gost_digital',
  name: 'Цифровые ИМС (ГОСТ 2.743)',
  category: 'Микросхемы',
  description: 'Многосекционная логика ТТЛ/КМОП (К155ЛА3, К555ТМ2, К561ЛА7) по ГОСТ 2.743-91',
  components: [
    {
      id: 'COMP_DD_K155LA3',
      name: 'К155ЛА3 (4 × 2И-НЕ)',
      library: 'Цифровые ИМС (ГОСТ 2.743)',
      refDesPrefix: 'DD',
      defaultValue: 'К155ЛА3',
      gostStandard: 'ГОСТ 2.743-91',
      description: 'Четыре логических элемента 2И-НЕ (4 секции + питание, корпус DIP-14)',
      patternId: 'PAT_DIP14',
      parts: [
        makeGostLogicGatePart(1, '&', '1', '2', '3', true),
        makeGostLogicGatePart(2, '&', '4', '5', '6', true),
        makeGostLogicGatePart(3, '&', '9', '10', '8', true),
        makeGostLogicGatePart(4, '&', '12', '13', '11', true),
        {
          partIndex: 5,
          name: 'Питание (VCC/GND)',
          primitives: [{ type: 'rect', x: -5, y: -5, w: 10, h: 10, width: 0.35 }],
          pins: [
            { id: 'p_5_vcc', number: '14', name: 'VCC', x: 0, y: -10, length: 5, orientation: 90, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '14' },
            { id: 'p_5_gnd', number: '7', name: 'GND', x: 0, y: 10, length: 5, orientation: 270, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '7' }
          ]
        }
      ]
    },
    {
      id: 'COMP_DD_K555LE1',
      name: 'К555ЛЕ1 (4 × 2ИЛИ-НЕ)',
      library: 'Цифровые ИМС (ГОСТ 2.743)',
      refDesPrefix: 'DD',
      defaultValue: 'К555ЛЕ1',
      gostStandard: 'ГОСТ 2.743-91',
      description: 'Четыре логических элемента 2ИЛИ-НЕ (4 секции + питание, корпус DIP-14)',
      patternId: 'PAT_DIP14',
      parts: [
        makeGostLogicGatePart(1, '1', '2', '3', '1', true),
        makeGostLogicGatePart(2, '1', '5', '6', '4', true),
        makeGostLogicGatePart(3, '1', '8', '9', '10', true),
        makeGostLogicGatePart(4, '1', '11', '12', '13', true),
        {
          partIndex: 5,
          name: 'Питание (VCC/GND)',
          primitives: [{ type: 'rect', x: -5, y: -5, w: 10, h: 10, width: 0.35 }],
          pins: [
            { id: 'p_5_vcc', number: '14', name: 'VCC', x: 0, y: -10, length: 5, orientation: 90, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '14' },
            { id: 'p_5_gnd', number: '7', name: 'GND', x: 0, y: 10, length: 5, orientation: 270, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '7' }
          ]
        }
      ]
    },
    {
      id: 'COMP_DD_K555TM2',
      name: 'К555ТМ2 (2 × D-триггер)',
      library: 'Цифровые ИМС (ГОСТ 2.743)',
      refDesPrefix: 'DD',
      defaultValue: 'К555ТМ2',
      gostStandard: 'ГОСТ 2.743-91',
      description: 'Два D-триггера с установкой и сбросом (ГОСТ 2.743-91)',
      patternId: 'PAT_DIP14',
      parts: [
        {
          partIndex: 1,
          name: 'Триггер 1',
          primitives: [
            { type: 'rect', x: -10, y: -10, w: 20, h: 20, width: 0.4 },
            { type: 'line', x1: -5, y1: -10, x2: -5, y2: 10, width: 0.25 },
            { type: 'line', x1: 5, y1: -10, x2: 5, y2: 10, width: 0.25 },
            { type: 'text', x: 0, y: -7.5, text: 'T', size: 2.8, align: 'center' }
          ],
          pins: [
            { id: 'p_s', number: '4', name: 'S', x: -15, y: -7.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Inverted', showName: true, showNumber: true, padMapping: '4' },
            { id: 'p_d', number: '2', name: 'D', x: -15, y: -2.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true, padMapping: '2' },
            { id: 'p_c', number: '3', name: 'C', x: -15, y: 2.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Clock', showName: true, showNumber: true, padMapping: '3' },
            { id: 'p_r', number: '1', name: 'R', x: -15, y: 7.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Inverted', showName: true, showNumber: true, padMapping: '1' },
            { id: 'p_q', number: '5', name: '', x: 15, y: -5, length: 5, orientation: 180, electricalType: 'Output', style: 'Line', showName: false, showNumber: true, padMapping: '5' },
            { id: 'p_nq', number: '6', name: '', x: 15, y: 5, length: 5, orientation: 180, electricalType: 'Output', style: 'Inverted', showName: false, showNumber: true, padMapping: '6' }
          ]
        },
        {
          partIndex: 2,
          name: 'Триггер 2',
          primitives: [
            { type: 'rect', x: -10, y: -10, w: 20, h: 20, width: 0.4 },
            { type: 'line', x1: -5, y1: -10, x2: -5, y2: 10, width: 0.25 },
            { type: 'line', x1: 5, y1: -10, x2: 5, y2: 10, width: 0.25 },
            { type: 'text', x: 0, y: -7.5, text: 'T', size: 2.8, align: 'center' }
          ],
          pins: [
            { id: 'p2_s', number: '10', name: 'S', x: -15, y: -7.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Inverted', showName: true, showNumber: true, padMapping: '10' },
            { id: 'p2_d', number: '12', name: 'D', x: -15, y: -2.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true, padMapping: '12' },
            { id: 'p2_c', number: '11', name: 'C', x: -15, y: 2.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Clock', showName: true, showNumber: true, padMapping: '11' },
            { id: 'p2_r', number: '13', name: 'R', x: -15, y: 7.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Inverted', showName: true, showNumber: true, padMapping: '13' },
            { id: 'p2_q', number: '9', name: '', x: 15, y: -5, length: 5, orientation: 180, electricalType: 'Output', style: 'Line', showName: false, showNumber: true, padMapping: '9' },
            { id: 'p2_nq', number: '8', name: '', x: 15, y: 5, length: 5, orientation: 180, electricalType: 'Output', style: 'Inverted', showName: false, showNumber: true, padMapping: '8' }
          ]
        },
        {
          partIndex: 3,
          name: 'Питание (VCC/GND)',
          primitives: [{ type: 'rect', x: -5, y: -5, w: 10, h: 10, width: 0.35 }],
          pins: [
            { id: 'p_3_vcc', number: '14', name: 'VCC', x: 0, y: -10, length: 5, orientation: 90, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '14' },
            { id: 'p_3_gnd', number: '7', name: 'GND', x: 0, y: 10, length: 5, orientation: 270, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '7' }
          ]
        }
      ]
    },
    {
      id: 'COMP_DD_K561LN2',
      name: 'К561ЛН2 (6 инверторов КМОП)',
      library: 'Цифровые ИМС (ГОСТ 2.743)',
      refDesPrefix: 'DD',
      defaultValue: 'К561ЛН2',
      gostStandard: 'бК0.347.064 ТУ',
      description: 'Шесть логических элементов НЕ (инверторов) КМОП по ГОСТ 2.743-91 (DIP-14)',
      patternId: 'PAT_DIP14',
      parts: [
        ...([1, 2, 3, 4, 5, 6] as const).map((idx) => {
          const pinMap: [string, string][] = [['1', '2'], ['3', '4'], ['5', '6'], ['9', '8'], ['11', '10'], ['13', '12']];
          const [inP, outP] = pinMap[idx - 1];
          return {
            partIndex: idx,
            name: `Инвертор ${idx}`,
            primitives: [
              { type: 'rect' as const, x: -5, y: -5, w: 10, h: 10, width: 0.4 },
              { type: 'text' as const, x: 0, y: -2.0, text: '1', size: 3.2, align: 'center' as const }
            ],
            pins: [
              { id: `p_${idx}_in`, number: inP, name: '', x: -10, y: 0, length: 5, orientation: 0 as const, electricalType: 'Input' as const, style: 'Line' as const, showName: false, showNumber: true, padMapping: inP },
              { id: `p_${idx}_out`, number: outP, name: '', x: 10, y: 0, length: 5, orientation: 180 as const, electricalType: 'Output' as const, style: 'Inverted' as const, showName: false, showNumber: true, padMapping: outP }
            ]
          };
        }),
        {
          partIndex: 7,
          name: 'Питание (VDD/VSS)',
          primitives: [{ type: 'rect', x: -5, y: -5, w: 10, h: 10, width: 0.35 }],
          pins: [
            { id: 'p_7_vdd', number: '14', name: 'VDD', x: 0, y: -10, length: 5, orientation: 90, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '14' },
            { id: 'p_7_vss', number: '7', name: 'VSS', x: 0, y: 10, length: 5, orientation: 270, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '7' }
          ]
        }
      ]
    }
  ]
};
