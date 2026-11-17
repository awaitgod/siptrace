import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createBlankSchematicProject } from '../../src/ui/modules/schematic/services/schematicActionsService';

test('the sheet bar localizes default DipTrace names and keeps button sizes stable', async ({ page }) => {
  const project = createBlankSchematicProject('mm', []);
  const first = project.sheets[0];
  first.name = 'Sheet 1';
  project.sheets.push(
    { ...first, id: 'second', name: 'Sheet 2' },
    { ...first, id: 'logic', name: 'Sheet 3 — Logic board' }
  );
  await page.addInitScript(project => {
    localStorage.setItem('gosttrace_active_schematic_v2', JSON.stringify(project));
  }, project);
  await page.goto('/?module=schematic');

  const sheetBar = page.locator('.dt-sheet-bar');
  await expect(sheetBar.getByRole('tab', { name: 'Лист 1', selected: true })).toBeVisible();
  await expect(sheetBar.getByRole('tab', { name: 'Лист 2', selected: false })).toBeVisible();
  await expect(page.locator('.dt-statusbar')).toContainText('Лист: Лист 1');

  const measureButtons = () => sheetBar.locator('button').evaluateAll(buttons => buttons.map(button => {
    const { width, height } = button.getBoundingClientRect();
    return { width, height };
  }));
  const sizes = await measureButtons();
  const [firstSize, secondSize, customSize, addSize, managerSize] = sizes;
  expect(firstSize).toEqual(secondSize);
  expect(firstSize).toEqual(addSize);
  expect(firstSize).toEqual(managerSize);
  expect(customSize.height).toBe(firstSize.height);

  const customTab = sheetBar.getByRole('tab', { name: 'Sheet 3 — Logic board' });
  await customTab.click();
  await expect(customTab).toHaveAttribute('aria-selected', 'true');
  expect(await measureButtons()).toEqual(sizes);
});

test('corrupted DipTrace binary schematic is rejected visibly without crashing editor', async ({ page }) => {
  await page.goto('/?module=schematic');
  const choose = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Открыть схему (Ctrl+O)' }).click();
  await (await choose).setFiles({ name: 'example.dch', mimeType: 'application/octet-stream', buffer: Buffer.from([7, 68, 84, 83, 67, 72, 69, 77, 0, 255]) });
  await expect(page.locator('.dt-statusbar')).toContainText('Ошибка открытия файла');
  await expect(page).toHaveURL(/module=schematic/);
});

test('one Open command detects different ASC schematics by content', async ({ page }) => {
  await page.goto('/?module=schematic');
  await page.getByRole('button', { name: 'Файл', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /Импорт сторонних САПР/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /^Открыть проект/ })).toHaveCount(0);

  const dipTraceChooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: /^Открыть\.\.\./ }).click();
  const dipTraceFile = await dipTraceChooser;
  expect(await dipTraceFile.element().evaluate(input => (input as HTMLInputElement).accept)).toBe('');
  await dipTraceFile.setFiles({
    name: 'diptrace.asc',
    mimeType: 'text/plain',
    buffer: Buffer.from('(Source "DipTrace-Schematic" "GOSTTrace-Export")\n(Schematic "Test")')
  });
  const status = page.locator('.dt-statusbar');
  await expect(status).toContainText('Открыто (DipTrace ASCII');
  await expect.poll(() => page.evaluate(() => {
    const stored = localStorage.getItem('gosttrace_active_schematic_v2');
    return stored && JSON.parse(stored).filePath;
  })).toBe('diptrace.asc');

  const ltspiceChooser = page.waitForEvent('filechooser', { timeout: 5000 });
  await page.keyboard.press('Control+o');
  await (await ltspiceChooser).setFiles({
    name: 'ltspice.asc',
    mimeType: 'text/plain',
    buffer: Buffer.from('Version 4\nSHEET 1 880 680\nSYMBOL res 80 96 R0\nSYMATTR InstName R1\nSYMATTR Value 1k\n')
  });
  await expect(status).toContainText('Открыто (LTspice (.asc)): ltspice.asc');
});

test('schematic open recognizes file content with a misleading extension', async ({ page }) => {
  await page.goto('/?module=schematic');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Открыть схему (Ctrl+O)' }).click();
  await (await chooser).setFiles({
    name: 'circuit.kicad_sch',
    mimeType: 'text/plain',
    buffer: Buffer.from('Version 4\nSHEET 1 880 680\nWIRE 48 64 16 64\n')
  });
  await expect(page.locator('.dt-statusbar')).toContainText('Открыто (LTspice (.asc)): circuit.kicad_sch');
});

test('desktop schematic export reports the outcome of the native save command', async ({ page }) => {
  const project = { ...createBlankSchematicProject('mm', []), projectName: 'курс' };
  await page.addInitScript(project => {
    localStorage.setItem('gosttrace_active_schematic_v2', JSON.stringify(project));
    const savedPath = 'C:/Exports/переименованная схема.asc';
    let attempts = 0;
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: { filename: string; extension: string; bytes: number[] }) => {
          if (command !== 'export_text_file') return;
          const content = new TextDecoder('windows-1251').decode(Uint8Array.from(args.bytes));
          if (args.filename !== 'курс.asc' || args.extension !== 'asc' ||
              !content.startsWith('(Source "DipTrace-Schematic" 46)\r\n') || !content.includes('(Pages\r\n')) {
            throw new Error('Неверные данные экспорта');
          }
          attempts++;
          if (attempts === 1) return null;
          if (attempts === 2) throw new Error('Отказано в доступе');
          return savedPath;
        }
      }
    });
  }, project);
  await page.goto('/?module=schematic');

  const status = page.locator('.dt-statusbar');
  const fileMenu = page.getByRole('button', { name: 'Файл', exact: true });
  const exportItem = page.getByRole('menuitem', { name: 'Экспорт схемы (.asc)...' });
  for (const message of [
    'Экспорт отменён.',
    'Отказано в доступе',
    'Файл сохранён: C:/Exports/переименованная схема.asc'
  ]) {
    await fileMenu.click();
    await exportItem.click();
    await expect(status).toContainText(message);
  }
});

test('schematic export downloads an ASC file when there is no save picker', async ({ page }) => {
  const project = { ...createBlankSchematicProject('mm', []), projectName: 'курс' };
  await page.addInitScript(project => {
    localStorage.setItem('gosttrace_active_schematic_v2', JSON.stringify(project));
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined });
  }, project);
  await page.goto('/?module=schematic');
  await page.getByRole('button', { name: 'Файл', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Экспорт схемы (.asc)...' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('курс.asc');
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  const bytes = await readFile(path);
  const content = new TextDecoder('windows-1251').decode(bytes);
  expect(content).toMatch(/^\(Source "DipTrace-Schematic" 46\)\r\n/);
  expect(content).toContain('(Name "Схема электрическая принципиальная")');
  await expect(page.locator('.dt-statusbar')).toContainText('Начата загрузка файла курс.asc.');
});

test('export format submenu opens below Save As and supports keyboard selection', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined });
  });
  await page.goto('/?module=schematic');
  await page.getByRole('button', { name: 'Файл', exact: true }).click();

  const exportItem = page.getByRole('menuitem', { name: 'Экспорт схемы (.asc)...' });
  const toggle = exportItem.getByRole('button', { name: /Подменю/ });
  const formats = exportItem.getByRole('menu');
  await expect(formats).toHaveCount(0);
  await expect(exportItem.locator('xpath=preceding-sibling::*[1]')).toContainText('Сохранить как...');
  await toggle.click();
  await expect(formats.getByRole('menuitem')).toHaveCount(4);
  const toggleBox = await toggle.boundingBox();
  const formatsBox = await formats.boundingBox();
  expect(formatsBox!.y).toBeGreaterThanOrEqual(toggleBox!.y + toggleBox!.height);
  await toggle.click();
  await expect(formats).toHaveCount(0);
  await expect(exportItem).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(formats.getByRole('menuitem', { name: 'DipTrace ASCII (.asc)...' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(formats.getByRole('menuitem', { name: 'Чертёж ГОСТ (.svg)...' })).toBeFocused();
  const download = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expect((await download).suggestedFilename()).toMatch(/\.svg$/);
});
