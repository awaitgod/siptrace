import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { compareDipTraceScreenshots } from './helpers/diptrace-image-comparison';

function findReferences(root: string) {
  const files = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name))
    .sort();
  const projects = new Map(files.filter(path => /\.dch$/i.test(path)).map(path => [path.slice(0, -4), path]));
  const pairs = new Map<string, { sheet: number; path: string }[]>();
  for (const path of files) {
    const match = /^(.*)_sheet_([1-9]\d*)\.png$/i.exec(path);
    if (!match) continue;
    const schematic = projects.get(match[1]);
    if (!schematic) throw new Error(`Missing .dch for ${path}`);
    const references = pairs.get(schematic) ?? [];
    references.push({ sheet: Number(match[2]), path });
    pairs.set(schematic, references);
  }
  return [...pairs].map(([schematic, references]) => ({
    schematic,
    references: references.sort((a, b) => a.sheet - b.sheet)
  }));
}

const root = process.env.SIPTRACE_DIPTRACE_REFERENCES;
if (!root) {
  test.skip('compare native DipTrace screenshots (set SIPTRACE_DIPTRACE_REFERENCES)', () => {});
} else {
  const cases = findReferences(root);
  if (!cases.length) throw new Error(`No .dch and *_sheet_N.png pairs in ${root}`);

  test.use({ viewport: { width: 1936, height: 1048 }, deviceScaleFactor: 1 });

  for (const { schematic, references } of cases) {
    test(relative(root, schematic), async ({ page }, info) => {
      await page.goto('/?module=schematic');
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Открыть схему (Ctrl+O)' }).click();
      await (await chooser).setFiles(schematic);
      await expect(page.locator('.dt-statusbar')).toContainText(/Открыто \(DipTrace Binary Schematic|Ошибка открытия файла/);
      await expect(page.locator('.dt-statusbar')).toContainText('Открыто (DipTrace Binary Schematic');
      const report = page.getByRole('button', { name: 'Принять результат ГОСТ' });
      if (await report.isVisible()) await report.click();

      const tabs = page.getByRole('tablist', { name: 'Листы схемы' }).getByRole('tab');
      const sheetCount = await tabs.count();
      expect(sheetCount).toBeGreaterThan(0);
      for (let sheet = 1; sheet <= sheetCount; sheet++) {
        expect(references.some(ref => ref.sheet === sheet), `missing reference for sheet ${sheet}`).toBeTruthy();
      }

      const canvas = page.locator('#schematic-sheet-panel canvas');
      let actual: Buffer | undefined;
      let lastSheet: string | undefined;
      for (const reference of references) {
        const prefix = `sheet-${reference.sheet}`;
        const expected = await readFile(reference.path);
        const extraCapture = reference.sheet > sheetCount;
        if (!extraCapture) {
          const tab = tabs.nth(reference.sheet - 1);
          await tab.click();
          await expect(tab).toHaveAttribute('aria-selected', 'true');
          await page.getByRole('button', { name: /Показать весь лист/ }).click();
          actual = await canvas.screenshot({ path: info.outputPath(`${prefix}-siptrace.png`), animations: 'disabled' });
          await info.attach(`${prefix}-siptrace`, { body: actual, contentType: 'image/png' });
        }
        if (!actual) throw new Error(`No captured SIPTrace sheet for ${reference.path}`);
        await info.attach(`${prefix}-diptrace`, { body: expected, contentType: 'image/png' });
        const comparison = await page.evaluate(compareDipTraceScreenshots, {
          actual: actual.toString('base64'),
          expected: expected.toString('base64'),
          lastSheet: extraCapture ? lastSheet : undefined
        });
        const diff = Buffer.from(comparison.diff, 'base64');
        await writeFile(info.outputPath(`${prefix}-diff.png`), diff);
        await info.attach(`${prefix}-diff`, { body: diff, contentType: 'image/png' });
        const message = `${basename(reference.path)} — reference: ${comparison.referenceMatch.toFixed(3)}, SIPTrace: ${comparison.actualMatch.toFixed(3)}`;
        console.log(message);
        if (extraCapture) {
          expect.soft(comparison.duplicate, `${reference.path} shows a sheet missing from the import`).toBeTruthy();
        } else {
          lastSheet = expected.toString('base64');
          // Some native labels and densely spaced pin stubs form continuous yellow runs.
          expect.soft(comparison.referenceMatch, message).toBeGreaterThanOrEqual(0.80);
          expect.soft(comparison.actualMatch, message).toBeGreaterThanOrEqual(0.95);
        }
      }
    });
  }
}
