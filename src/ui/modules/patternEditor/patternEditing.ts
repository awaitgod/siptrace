import { PadDef, PadType } from '../../../core/types';
import { PatternGeneratorParams } from '../../../engines/patternGenerator';
import { nextAvailableNumber } from '../libraryEditors/numbering';

export function renumberPads(pads: PadDef[]): PadDef[] {
  let nextNumber = 1;
  return pads.map((pad) => ({
    ...pad,
    number: pad.type === 'MountingHole' && !pad.number.trim() ? '' : String(nextNumber++)
  }));
}

export function changePadType(pad: PadDef, type: PadType, pads: PadDef[]): PadDef {
  if (type === pad.type) return pad;
  if (type === 'SMD') {
    return {
      ...pad,
      type,
      number: pad.number || nextAvailableNumber(pads),
      holeDiameter: 0,
      layer: 'Top'
    };
  }
  const diameter = pad.holeDiameter || (type === 'THT' ? 0.9 : 3.2);
  return {
    ...pad,
    type,
    number: type === 'MountingHole' ? '' : pad.number || nextAvailableNumber(pads),
    width: Math.max(pad.width, diameter + 0.2),
    height: Math.max(pad.height, diameter + 0.2),
    holeDiameter: diameter,
    layer: 'All'
  };
}

export function validatePatternGenerator(parameters: PatternGeneratorParams): string | null {
  const { name, family, pinCount, pitch, rowSpacing, padWidth, padHeight, holeDiameter, bodyWidth, bodyLength } = parameters;
  if (!name.trim()) return 'Введите наименование корпуса.';
  if (!Number.isInteger(pinCount) || pinCount < 2 || pinCount > 4096) return 'Введите целое число выводов от 2 до 4096.';
  if (['ChipSMD', 'AxialTHT', 'RadialTHT'].includes(family) && pinCount !== 2) return 'Для этого семейства задайте 2 вывода.';
  if (family === 'SOT23' && pinCount !== 3) return 'Для SOT-23 задайте 3 вывода.';
  if ((family === 'DIP' || family === 'SOIC') && (pinCount < 4 || pinCount % 2 !== 0)) {
    return 'Для DIP и SOIC задайте чётное число выводов, не меньше 4.';
  }
  if (family === 'DFN' && (pinCount < 2 || pinCount % 2 !== 0)) {
    return 'Для DFN задайте чётное число выводов, не меньше 2.';
  }
  if (family === 'SIP' && pinCount < 2) {
    return 'Для SIP задайте не менее 2 выводов.';
  }
  if ((family === 'QFP' || family === 'QFN') && (pinCount < 8 || pinCount % 4 !== 0)) {
    return 'Для QFP и QFN задайте число выводов, кратное 4 и не меньше 8.';
  }
  if (family === 'Header' && rowSpacing > 0.5 && pinCount % 2 !== 0) {
    return 'Для двухрядного разъёма задайте чётное число выводов.';
  }
  if (family === 'BGA') {
    const columns = Math.round(Math.sqrt(pinCount));
    const rows = pinCount / columns;
    if (!Number.isInteger(rows) || rows > 20) return 'Задайте число шариков для полной сетки BGA до 20 рядов.';
  }
  if (![padWidth, padHeight, bodyWidth, bodyLength].every((dimension) => Number.isFinite(dimension) && dimension > 0)) {
    return 'Размеры площадки и корпуса должны быть положительными.';
  }
  if (pitch < 0 || rowSpacing < 0 || (pitch === 0 && !['ChipSMD', 'AxialTHT', 'SOT23'].includes(family))) {
    return 'Для выбранного семейства проверьте шаг площадок и расстояние между рядами.';
  }
  if (holeDiameter < 0) return 'Диаметр отверстия не может быть отрицательным.';
  if (['DIP', 'AxialTHT', 'RadialTHT', 'Header', 'SIP'].includes(family)) {
    const scale = { A: 1.15, B: 1, C: 0.88 }[parameters.densityLevel];
    if (holeDiameter <= 0 || holeDiameter >= Math.min(padWidth, padHeight) * scale) {
      return 'Для сквозной площадки задайте положительный диаметр отверстия меньше размеров площадки.';
    }
  }
  return null;
}
