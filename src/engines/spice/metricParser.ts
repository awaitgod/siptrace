/** Parses localized metric/Russian SPICE component values (e.g., "10к", "1МОм", "4k7", "100µF", "100н") to SI units. */
export function parseMetricValue(valStr: string, defaultUnit = 1): number {
  let raw = valStr.replace(',', '.').trim();
  if (!raw) return defaultUnit;

  // Support European infix notation: 4k7 -> 4.7k, 4R7 -> 4.7, 2M2 -> 2.2M, 1м5 -> 1.5m
  const infix = /^(\d+)\s*([kKкКrRрРmMмМuUнНnNпПpPµμ])\s*(\d+)/.exec(raw);
  if (infix) {
    const unitChar = infix[2];
    const scaledNum = parseFloat(`${infix[1]}.${infix[3]}`);
    if (unitChar === 'M' || unitChar === 'М') return scaledNum * 1e6;
    if (unitChar === 'r' || unitChar === 'R' || unitChar === 'р' || unitChar === 'Р') return scaledNum;
    raw = `${infix[1]}.${infix[3]}${unitChar}`;
  }

  const m = /^([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*([a-zA-Zа-яА-ЯµμΩ]*)/.exec(raw);
  if (!m) return defaultUnit;
  const num = parseFloat(m[1]);
  if (!isFinite(num)) return defaultUnit;
  const origUnit = m[2];
  // Preserve uppercase Cyrillic М / Latin M for Mega when followed by Ом/Ohm/Hz/Гц or standalone
  if (
    origUnit === 'M' ||
    origUnit === 'М' ||
    /^(M|М)(Ом|Ohm|Hz|Гц|$)/i.test(origUnit) ||
    /^meg/i.test(origUnit) ||
    /^мгц/i.test(origUnit)
  ) {
    if (/^(M|М)(?!к|K)/u.test(origUnit)) return num * 1e6;
  }

  const unit = origUnit.toLowerCase();
  if (unit.startsWith('мк') || unit.startsWith('u') || unit.startsWith('µ') || unit.startsWith('μ')) return num * 1e-6;
  if (unit.startsWith('н') || unit.startsWith('n')) return num * 1e-9;
  if (unit.startsWith('п') || unit.startsWith('p')) return num * 1e-12;
  if (unit.startsWith('мгц') || unit.startsWith('meg')) return num * 1e6;
  if (unit.startsWith('м') || unit.startsWith('m')) return num * 1e-3;
  if (unit.startsWith('к') || unit.startsWith('k')) return num * 1e3;
  return num;
}
