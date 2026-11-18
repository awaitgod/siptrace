import { BomEntry, PlacedComponent, SchematicProject } from '../../core/types';
import { GOST_GROUP_ORDER } from '../rules';
import {
  buildGostComponentFullName,
  formatRefDesRange,
  getGroupTitle,
  splitRefDes
} from './refDesUtils';

/** Формирует Перечень элементов строго по ГОСТ 2.701-2008 / ГОСТ 2.702-2011 / ГОСТ 2.106-96. */
export function generateGostBom(project: SchematicProject, rangeSeparator: '...' | ' - ' = '...'): BomEntry[] {
  const allComponents: PlacedComponent[] = [];
  const seenPhysicalRefDes = new Set<string>();

  for (const sheet of project.sheets) {
    for (const c of sheet.components) {
      // Исключаем служебные символы цепей (Земля, Питание), порты и пустые обозначения
      if (!c.refDes || c.refDes.startsWith('#') || c.isNetPort) continue;

      // Нормализуем базовое позиционное обозначение (DD1.1 -> DD1) для предотвращения дублирования многосекционных ИМС
      const parsed = splitRefDes(c.refDes);
      const baseRef = parsed.num > 0 ? `${parsed.prefix}${parsed.num}` : c.refDes;

      if (seenPhysicalRefDes.has(baseRef)) continue;
      seenPhysicalRefDes.add(baseRef);
      allComponents.push(c);
    }
  }

  // Группировка по буквенному префиксу ГОСТ
  const byPrefix = new Map<string, PlacedComponent[]>();
  for (const c of allComponents) {
    const { prefix } = splitRefDes(c.refDes);
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix)!.push(c);
  }

  // ГОСТ 2.701-2008 п. 5.7 / ГОСТ 2.702-2011: группы располагаются в порядке GOST_GROUP_ORDER
  const getOrderIndex = (p: string) => {
    const idx = GOST_GROUP_ORDER.indexOf(p);
    return idx >= 0 ? idx : 999;
  };

  const prefixes = Array.from(byPrefix.keys()).sort((a, b) => {
    const ia = getOrderIndex(a);
    const ib = getOrderIndex(b);
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b, 'en');
  });

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
      const refs = group.map((g) => {
        const parsed = splitRefDes(g.refDes);
        return parsed.num > 0 ? `${parsed.prefix}${parsed.num}` : g.refDes;
      });
      entries.push({
        groupTitle,
        refDesList: formatRefDesRange(refs, rangeSeparator),
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
