import { ComponentLibrary } from '../../../core/types';
import { makeCapPrimitives, makeCapPins } from './helpers';

export const libCapacitors: ComponentLibrary = {
  id: 'lib_gost_cap',
  name: 'Конденсаторы (ГОСТ 2.728)',
  category: 'Пассивные',
  description: 'Конденсаторы К10-17, К50-35, К53-18, К73-17 в строгом формате ЕСКД',
  components: [
    {
      id: 'COMP_C_K10_17V_0805',
      name: 'К10-17в (ЧИП 2012М/0805)',
      library: 'Конденсаторы (ГОСТ 2.728)',
      refDesPrefix: 'C',
      defaultValue: '0,1 мкФ',
      gostStandard: 'ОЖ0.460.172 ТУ',
      description: 'Конденсатор керамический многослойный ЧИП К10-17в (2012М)',
      manufacturer: 'ОАО «Кулон»',
      patternId: 'PAT_CHIP_2012M',
      spiceModel: { prefix: 'C', params: { C: 1e-7 } },
      parts: [{ partIndex: 1, name: 'Part 1', primitives: makeCapPrimitives(false), pins: makeCapPins(false) }]
    },
    {
      id: 'COMP_C_K10_17V_0603',
      name: 'К10-17в (ЧИП 1608М/0603)',
      library: 'Конденсаторы (ГОСТ 2.728)',
      refDesPrefix: 'C',
      defaultValue: '22 пФ',
      gostStandard: 'ОЖ0.460.172 ТУ',
      description: 'Конденсатор керамический ЧИП К10-17в (1608М)',
      manufacturer: 'ОАО «Кулон»',
      patternId: 'PAT_CHIP_1608M',
      spiceModel: { prefix: 'C', params: { C: 22e-12 } },
      parts: [{ partIndex: 1, name: 'Part 1', primitives: makeCapPrimitives(false), pins: makeCapPins(false) }]
    },
    {
      id: 'COMP_C_K10_17B',
      name: 'К10-17б (выводной)',
      library: 'Конденсаторы (ГОСТ 2.728)',
      refDesPrefix: 'C',
      defaultValue: '0,1 мкФ',
      gostStandard: 'ОЖ0.460.172 ТУ',
      description: 'Конденсатор керамический выводной К10-17б',
      patternId: 'PAT_K10_17B',
      spiceModel: { prefix: 'C', params: { C: 1e-7 } },
      parts: [{ partIndex: 1, name: 'Part 1', primitives: makeCapPrimitives(false), pins: makeCapPins(false) }]
    },
    {
      id: 'COMP_C_K50_35',
      name: 'К50-35 (полярный электролит.)',
      library: 'Конденсаторы (ГОСТ 2.728)',
      refDesPrefix: 'C',
      defaultValue: '47 мкФ × 25В',
      gostStandard: 'АДПК.673541.001 ТУ',
      description: 'Конденсатор оксидно-электролитический полярный К50-35 (ГОСТ 2.728)',
      manufacturer: 'ОАО «Элеконд»',
      patternId: 'PAT_K50_35_6X11',
      spiceModel: { prefix: 'C', params: { C: 4.7e-5 } },
      parts: [{ partIndex: 1, name: 'Part 1', primitives: makeCapPrimitives(true), pins: makeCapPins(true) }]
    },
    {
      id: 'COMP_C_K53_18',
      name: 'К53-18 (тантал. полярный ЧИП)',
      library: 'Конденсаторы (ГОСТ 2.728)',
      refDesPrefix: 'C',
      defaultValue: '10 мкФ × 16В',
      gostStandard: 'ОЖ0.464.214 ТУ',
      description: 'Конденсатор оксидно-полупроводниковый танталовый ЧИП К53-18',
      patternId: 'PAT_CHIP_3216M',
      spiceModel: { prefix: 'C', params: { C: 1e-5 } },
      parts: [{ partIndex: 1, name: 'Part 1', primitives: makeCapPrimitives(true), pins: makeCapPins(true) }]
    }
  ]
};
