const header = /^\s*\(Source "DipTrace-Schematic" \d+\)/;
const windows1251 = new TextDecoder('windows-1251');
const byteForCharacter = new Map(Array.from({ length: 256 }, (_, byte) =>
  [windows1251.decode(Uint8Array.of(byte)), byte] as const));
const engineeringCharacters: Record<string, string> = { 'µ': 'u', 'μ': 'u', 'Ω': 'Ом', '−': '-', '″': '”' };

/** The Windows DipTrace ASCII importer reads ANSI bytes on a Russian system. */
export function encodeDipTraceSchematicAscii(text: string): Uint8Array<ArrayBuffer> {
  const bytes: number[] = [];
  for (const character of text) {
    const byte = byteForCharacter.get(character);
    if (byte !== undefined) {
      bytes.push(byte);
      continue;
    }
    const replacement = engineeringCharacters[character] ?? `[U+${character.codePointAt(0)!.toString(16).toUpperCase()}]`;
    for (const letter of replacement) bytes.push(byteForCharacter.get(letter)!);
  }
  return Uint8Array.from(bytes);
}

/** Keep accepting UTF-8 ASC from earlier exporters. Fall back only for the native ASCII format. */
export function decodeDipTraceSchematicAscii(bytes: Uint8Array): string | undefined {
  if (!header.test(windows1251.decode(bytes.subarray(0, 128)))) return;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return windows1251.decode(bytes);
  }
}
