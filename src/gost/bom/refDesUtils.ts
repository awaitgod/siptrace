import { PlacedComponent } from '../../core/types';
import { GOST_REFDES_GROUPS } from '../rules';

/** Splits a GOST reference designator into uppercase prefix, numeric index, and optional sub-unit suffix. */
export function splitRefDes(refDes: string): { prefix: string; num: number; sub?: string } {
  const trimmed = refDes.trim();
  const m = /^([A-Za-zА-Яа-я#]+)(\d+)(?:[._-](\d+|[A-Za-z]+))?$/.exec(trimmed);
  if (!m) {
    const fallback = /^([A-Za-zА-Яа-я#]+)/.exec(trimmed);
    return { prefix: fallback ? fallback[1].toUpperCase() : trimmed, num: 0 };
  }
  return { prefix: m[1].toUpperCase(), num: parseInt(m[2], 10), sub: m[3] };
}

/** Sorts reference designators numerically and collapses 3+ sequential items (R1...R3 or R1 - R4) per ГОСТ 2.701-2008 / ГОСТ 2.702-2011. */
export function formatRefDesRange(refs: string[], separator: '...' | ' - ' = '...'): string {
  const uniqueRefs = Array.from(new Set(refs.filter(Boolean)));
  const sorted = uniqueRefs.sort((a, b) => {
    const da = splitRefDes(a);
    const db = splitRefDes(b);
    if (da.prefix !== db.prefix) return da.prefix.localeCompare(db.prefix);
    if (da.num !== db.num) return da.num - db.num;
    return (da.sub ?? '').localeCompare(db.sub ?? '');
  });
  if (sorted.length <= 2) return sorted.join(', ');
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length) {
      const curr = splitRefDes(sorted[j]);
      const next = splitRefDes(sorted[j + 1]);
      if (curr.prefix === next.prefix && next.num === curr.num + 1 && curr.num > 0 && !curr.sub && !next.sub) j++;
      else break;
    }
    if (j - i >= 2) {
      parts.push(`${sorted[i]}${separator}${sorted[j]}`);
    } else {
      for (let k = i; k <= j; k++) parts.push(sorted[k]);
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
