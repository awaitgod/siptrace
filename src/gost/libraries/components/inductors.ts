import { ComponentLibrary } from '../../../core/types';
import { makeTwoPinHorizontal } from './helpers';

export const libInductors: ComponentLibrary = {
  id: 'lib_gost_ind',
  name: 'Индуктивности и Трансформаторы (ГОСТ 2.723)',
  category: 'Пассивные',
  description: 'Дроссели ДМ, ДПМ и трансформаторы ТПП, МИТ по ГОСТ 2.723-68',
  components: [
    {
      id: 'COMP_L_DM01',
      name: 'ДМ-0,1 (дроссель без сердечника)',
      library: 'Индуктивности и Трансформаторы (ГОСТ 2.723)',
      refDesPrefix: 'L',
      defaultValue: '100 мкГн',
      gostStandard: 'ОЯ0.475.002 ТУ',
      description: 'Дроссель высокочастотный ДМ-0,1 (ГОСТ 2.723-68)',
      patternId: 'PAT_DM_01',
      spiceModel: { prefix: 'L', params: { L: 1e-4 } },
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'arc', cx: -3.75, cy: 0, r: 1.25, startAngle: Math.PI, endAngle: 0, width: 0.35 },
            { type: 'arc', cx: -1.25, cy: 0, r: 1.25, startAngle: Math.PI, endAngle: 0, width: 0.35 },
            { type: 'arc', cx: 1.25, cy: 0, r: 1.25, startAngle: Math.PI, endAngle: 0, width: 0.35 },
            { type: 'arc', cx: 3.75, cy: 0, r: 1.25, startAngle: Math.PI, endAngle: 0, width: 0.35 }
          ],
          pins: makeTwoPinHorizontal()
        }
      ]
    },
    {
      id: 'COMP_L_FERRITE',
      name: 'Дроссель с ферритовым сердечником',
      library: 'Индуктивности и Трансформаторы (ГОСТ 2.723)',
      refDesPrefix: 'L',
      defaultValue: '47 мкГн',
      gostStandard: 'ГОСТ 2.723-68',
      description: 'Катушка с магнитодиэлектрическим / ферритовым сердечником',
      patternId: 'PAT_DM_01',
      spiceModel: { prefix: 'L', params: { L: 4.7e-5 } },
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            { type: 'arc', cx: -3.75, cy: 0, r: 1.25, startAngle: Math.PI, endAngle: 0, width: 0.35 },
            { type: 'arc', cx: -1.25, cy: 0, r: 1.25, startAngle: Math.PI, endAngle: 0, width: 0.35 },
            { type: 'arc', cx: 1.25, cy: 0, r: 1.25, startAngle: Math.PI, endAngle: 0, width: 0.35 },
            { type: 'arc', cx: 3.75, cy: 0, r: 1.25, startAngle: Math.PI, endAngle: 0, width: 0.35 },
            // ГОСТ 2.723-68: ферритовый магнитопровод — сплошная утолщённая линия
            { type: 'line', x1: -5, y1: -2.6, x2: 5, y2: -2.6, width: 0.85 }
          ],
          pins: makeTwoPinHorizontal()
        }
      ]
    },
    {
      id: 'COMP_T_IMP',
      name: 'МИТ-4 (трансформатор импульсный)',
      library: 'Индуктивности и Трансформаторы (ГОСТ 2.723)',
      refDesPrefix: 'T',
      defaultValue: 'МИТ-4В',
      gostStandard: 'ГОСТ 2.723-68',
      description: 'Трансформатор импульсный 1:1 со стальным/ферритовым магнитопроводом',
      patternId: 'PAT_DIP8',
      parts: [
        {
          partIndex: 1,
          name: 'Part 1',
          primitives: [
            // Primary coil (left)
            { type: 'arc', cx: -3.5, cy: -3.75, r: 1.25, startAngle: -Math.PI / 2, endAngle: Math.PI / 2, width: 0.35 },
            { type: 'arc', cx: -3.5, cy: -1.25, r: 1.25, startAngle: -Math.PI / 2, endAngle: Math.PI / 2, width: 0.35 },
            { type: 'arc', cx: -3.5, cy: 1.25, r: 1.25, startAngle: -Math.PI / 2, endAngle: Math.PI / 2, width: 0.35 },
            { type: 'arc', cx: -3.5, cy: 3.75, r: 1.25, startAngle: -Math.PI / 2, endAngle: Math.PI / 2, width: 0.35 },
            // Core
            { type: 'line', x1: -0.6, y1: -5.5, x2: -0.6, y2: 5.5, width: 0.45 },
            { type: 'line', x1: 0.6, y1: -5.5, x2: 0.6, y2: 5.5, width: 0.45 },
            // Secondary coil (right)
            { type: 'arc', cx: 3.5, cy: -3.75, r: 1.25, startAngle: Math.PI / 2, endAngle: 1.5 * Math.PI, width: 0.35 },
            { type: 'arc', cx: 3.5, cy: -1.25, r: 1.25, startAngle: Math.PI / 2, endAngle: 1.5 * Math.PI, width: 0.35 },
            { type: 'arc', cx: 3.5, cy: 1.25, r: 1.25, startAngle: Math.PI / 2, endAngle: 1.5 * Math.PI, width: 0.35 },
            { type: 'arc', cx: 3.5, cy: 3.75, r: 1.25, startAngle: Math.PI / 2, endAngle: 1.5 * Math.PI, width: 0.35 },
            // Polarity dots
            { type: 'circle', cx: -5, cy: -4, r: 0.45, fill: true },
            { type: 'circle', cx: 5, cy: -4, r: 0.45, fill: true }
          ],
          pins: [
            { id: 'p1', number: '1', name: 'I-Н', x: -7.5, y: -5, length: 4, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '1' },
            { id: 'p2', number: '2', name: 'I-К', x: -7.5, y: 5, length: 4, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '4' },
            { id: 'p3', number: '3', name: 'II-Н', x: 7.5, y: -5, length: 4, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '8' },
            { id: 'p4', number: '4', name: 'II-К', x: 7.5, y: 5, length: 4, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '5' }
          ]
        }
      ]
    }
  ]
};
