import { expect, it } from 'vitest';
import { importCadSchematic, importCadSchematicSync } from '../../src/engines/importers';
import { createZipArchive } from '../../src/core/utils/zipArchive';

it('rejects a native DipTrace binary explicitly, including inside a ZIP', async () => {
  const bytes = new Uint8Array([7, 68, 84, 83, 67, 72, 69, 77, 0, 255]);
  await expect(importCadSchematic(bytes, 'example.dch')).rejects.toThrow('двоичный файл DipTrace');
  expect(() => importCadSchematicSync('\x07DTSCHEM', 'example.dch')).toThrow('двоичный файл DipTrace');
  const zip = createZipArchive({ 'example.dch': bytes });
  await expect(importCadSchematic(zip, 'example.zip')).rejects.toThrow('двоичный файл DipTrace');
});
