import { ComponentDef, PatternDef } from '../../../core/types';

export function validateComponent(component: ComponentDef, pattern: PatternDef | null): string[] {
  const issues: string[] = [];
  if (!component.name.trim()) issues.push('Не задано наименование компонента');
  if (!component.refDesPrefix.trim()) issues.push('Не задан буквенный префикс (R, C, DA, DD...)');
  if (!component.patternId && !component.isNetPort) issues.push('Не привязан посадочный корпус');
  else if (component.patternId && !pattern) issues.push(`Посадочный корпус «${component.patternId}» не найден в библиотеках`);

  const padNumbers = new Set(pattern?.pads.map((pad) => pad.number.trim()).filter(Boolean));
  for (const part of component.parts) {
    const seen = new Set<string>();
    for (const pin of part.pins) {
      const number = pin.number.trim();
      const label = `Секция ${part.partIndex}, вывод ${number || 'без номера'}`;
      if (!number) issues.push(`${label}: задайте номер вывода`);
      else if (seen.has(number)) issues.push(`${label}: дубликат номера`);
      seen.add(number);
      const mapping = (pin.padMapping ?? number).trim();
      if (pattern && (!mapping || !padNumbers.has(mapping))) {
        issues.push(`${label}: площадка «${mapping || '—'}» отсутствует в корпусе «${pattern.name}»`);
      }
      if ([pin.x, pin.y].some((coordinate) => Math.abs(Math.round(coordinate / 2.5) * 2.5 - coordinate) > 0.05)) {
        issues.push(`${label}: точка подключения (${pin.x}, ${pin.y}) вне сетки 2,5 мм`);
      }
    }
  }
  return issues;
}
