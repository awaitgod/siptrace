export function nextAvailableNumber(items: ReadonlyArray<{ number: string }>): string {
  const taken = new Set(items.map((item) => item.number.trim()));
  let number = 1;
  while (taken.has(String(number))) number++;
  return String(number);
}
