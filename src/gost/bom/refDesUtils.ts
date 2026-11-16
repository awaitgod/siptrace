import { PlacedComponent } from '../../core/types';
import { GOST_REFDES_GROUPS } from '../rules';

/** Splits a GOST reference designator into uppercase prefix and numeric index. */
export function splitRefDes(refDes: string): { prefix: string; num: number } {
  const m = /^([A-Za-zА-Яа-я]+)(\d+)$/.exec(refDes.trim());
  if (!m) return { prefix: refDes, num: 0 };
  return { prefix: m[1].toUpperCase(), num: parseInt(m[2], 10) };
}

/** Sorts reference designators numerically and collapses 3+ sequential items with ellipsis (R1...R3) per ГОСТ 2.701-2008. */
export function formatRefDesRange(refs: string[]): string {
  const sorted = [...refs].sort((a, b) => splitRefDes(a).num - splitRefDes(b).num);
  if (sorted.length <= 2) return sorted.join(', ');
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    const startItem = splitRefDes(sorted[i]);
    let j = i;
    while (j + 1 < sorted.length) {
      const curr = splitRefDes(sorted[j]);
      const next = splitRefDes(sorted[j + 1]);
      if (curr.prefix === next.prefix && next.num === curr.num + 1 && curr.num > 0) j++;
      else break;
    }
    if (j - i >= 2) {
      parts.push(`${sorted[i]}...${sorted[j]}`);
    } else {
      for (let k = i; k <= j; k++) parts.push(sorted[k]);
    }
    if (startItem.num === 0 && j === i && i < sorted.length) {
      // non-numeric fallback already pushed
    }
    i = j + 1;
  }
  return parts.join(', ');
}

/** Resolves the GOST 2.710-81 group heading for a reference prefix. */
export function getGroupTitle(prefix: string): string {
  const info = GOST_REFDES_GROUPS.find((g) => g.prefix === prefix);
  return info ? info.groupName : `Прочие элементы (${prefix})`;
}

/** Builds the standardized component designation string for GOST ПЭ3 entries. */
export function buildGostComponentFullName(c: PlacedComponent): string {
  const parts: string[] = [];
  if (c.typeName) parts.push(c.typeName);
  if (c.value && c.value !== c.typeName) parts.push(c.value);
  if (c.gostStandard && !c.gostStandard.startsWith('ГОСТ 2.')) {
    parts.push(c.gostStandard);
  }
  return parts.join(' ').trim() || c.typeName || 'Элемент';
}
