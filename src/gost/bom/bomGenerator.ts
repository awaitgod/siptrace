import { BomEntry, PlacedComponent, SchematicProject } from '../../core/types';
import { GOST_GROUP_ORDER } from '../rules';
import {
  buildGostComponentFullName,
  formatRefDesRange,
  getGroupTitle,
  splitRefDes
} from './refDesUtils';

/** Формирует Перечень элементов строго по ГОСТ 2.701-2008 / ГОСТ 2.106-96. */
export function generateGostBom(project: SchematicProject): BomEntry[] {
  const allComponents: PlacedComponent[] = [];
  const seenRefDes = new Set<string>();
  for (const sheet of project.sheets) {
    for (const c of sheet.components) {
      // Исключаем служебные символы цепей (Земля, Питание), если у них нет позиционного обозначения
      if (!c.refDes || c.refDes.startsWith('#')) continue;
      // Многосекционные ИМС (DD1.1..DD1.4) учитываются в ПЭ3 как один физический корпус
      if (seenRefDes.has(c.refDes)) continue;
      seenRefDes.add(c.refDes);
      allComponents.push(c);
    }
  }

  // Группировка по алфавитному префиксу ГОСТ
  const byPrefix = new Map<string, PlacedComponent[]>();
  for (const c of allComponents) {
    const { prefix } = splitRefDes(c.refDes);
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix)!.push(c);
  }

  // ГОСТ 2.701-2008 п. 5.7: группы располагаются в алфавитном порядке буквенных позиционных обозначений
  const prefixes = Array.from(byPrefix.keys()).sort((a, b) => a.localeCompare(b, 'en'));

  const entries: BomEntry[] = [];

  for (const prefix of prefixes) {
    const items = byPrefix.get(prefix)!;
    const groupTitle = getGroupTitle(prefix);

    // Группируем одинаковые компоненты (одинаковый тип + номинал + ГОСТ + пометка DNM)
    const buckets = new Map<string, PlacedComponent[]>();
    for (const item of items) {
      const fullName = buildGostComponentFullName(item);
      const key = `${fullName}||${item.doNotMount ? 'DNM' : 'M'}||${item.gostNote ?? ''}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(item);
    }

    const sortedBuckets = Array.from(buckets.values()).sort((a, b) => {
      const minA = Math.min(...a.map((x) => splitRefDes(x.refDes).num));
      const minB = Math.min(...b.map((x) => splitRefDes(x.refDes).num));
      return minA - minB;
    });

    for (const group of sortedBuckets) {
      const first = group[0];
      const refs = group.map((g) => g.refDes);
      entries.push({
        groupTitle,
        refDesList: formatRefDesRange(refs),
        name: buildGostComponentFullName(first),
        quantity: group.length,
        note: first.doNotMount ? 'Не устанавливать' : (first.gostNote ?? ''),
        gostStandard: first.gostStandard,
        pattern: first.patternId
      });
    }
  }

  return entries;
}
