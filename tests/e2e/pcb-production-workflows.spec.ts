import { readFile } from 'node:fs/promises';
import { expect, Page, test } from '@playwright/test';
import { PcbProject } from '../../src/core/types';
import { createZipArchive, extractZipEntries, utf8Decode } from '../../src/core/utils/zipArchive';
import { createDefaultPcbLayers } from '../../src/engines/netlist';
import { createDemoRs485Pcb } from '../../src/gost/demoProjects';

const pcbStorageKey = 'gosttrace_active_pcb_v2';

async function openPcb(page: Page, pcb = createDemoRs485Pcb()) {
  await page.addInitScript(([key, board]) => localStorage.setItem(key, JSON.stringify(board)), [pcbStorageKey, pcb] as const);
  await page.goto('/?module=pcb');
  await expect(page.getByLabel('Редактор топологии печатной платы')).toBeVisible();
}

async function storedPcb(page: Page): Promise<PcbProject> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), pcbStorageKey);
}

async function openCam(page: Page) {
  await page.getByTitle('Экспорт Gerber RS-274X / Сверловка / ЛУТ SVG').click();
  const modal = page.getByRole('dialog', { name: /Производственные файлы/ });
  await expect(modal.getByLabel(/Медь верх/)).toBeVisible();
  return modal;
}

async function openBoardWizard(page: Page) {
  await page.getByRole('button', { name: 'Файл', exact: true }).click();
  await page.getByRole('menuitem', { name: /Мастер контура/ }).click();
  return page.getByRole('dialog', { name: /Мастер контура/ });
}

function boardWithFourLayers(): PcbProject {
  return { ...createDemoRs485Pcb(), layerCount: 4, layers: createDefaultPcbLayers(4) };
}

test('DRC distinguishes an unchecked board, violations and stale results', async ({ page }, info) => {
  const pcb = createDemoRs485Pcb();
  pcb.traces.push({ id: 'audit-narrow', layer: 'TopCopper', netName: 'AUDIT', width: 0.01, points: [{ x: 17, y: 17 }, { x: 23, y: 17 }] });
  await openPcb(page, pcb);
  const sidebar = page.locator('.dt-right-sidebar');
  await sidebar.getByTitle('Ошибки DRC').click();
  await expect(sidebar.getByRole('status')).toHaveText('Проверка DRC ещё не запускалась.');
  await sidebar.getByRole('button', { name: 'Запустить проверку DRC' }).press('Enter');
  const narrowTrace = sidebar.getByRole('button', { name: /AUDIT/ }).first();
  await expect(narrowTrace).toBeVisible();
  await narrowTrace.press('Space');
  await expect(narrowTrace).toBeFocused();
  await page.screenshot({ path: info.outputPath('drc-violations.png') });

  const ratlineStatus = page.locator('.dt-statusbar');
  const before = await ratlineStatus.innerText();
  await sidebar.getByRole('button', { name: 'Опции' }).click();
  await sidebar.getByLabel('Связи (Ratlines)').uncheck();
  await expect(ratlineStatus).toContainText(before.match(/Неразведённых: \d+/)![0]);
  await expect(narrowTrace).toBeVisible();

  await page.getByTitle('Установить переходное отверстие (Via)').click();
  await page.getByLabel('Редактор топологии печатной платы').click({ position: { x: 250, y: 220 } });
  await expect(sidebar.getByRole('status')).toHaveText('Плата изменена после проверки DRC.');
  await expect(narrowTrace).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('drc-stale.png') });
  await page.keyboard.press('F9');
  await expect(narrowTrace).toBeVisible();
});

test('keyboard selects a component and lock disables geometry editing', async ({ page }, info) => {
  const pcb = createDemoRs485Pcb();
  const component = { ...pcb.components[0], locked: true };
  pcb.components[0] = component;
  await openPcb(page, pcb);
  const row = page.getByRole('button', { name: new RegExp(`^${component.refDes} \\(`) });
  await row.press('Space');
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  const side = page.getByLabel('Сторона компонента');
  const angle = page.getByLabel('Угол компонента в градусах');
  await expect(side).toBeDisabled();
  await expect(angle).toBeDisabled();
  await row.press('r');
  expect((await storedPcb(page)).components[0].angle).toBe(component.angle);
  await page.screenshot({ path: info.outputPath('locked-component.png') });
  await page.getByLabel('Закрепить компонент').uncheck();
  await expect(angle).toBeEnabled();
  await angle.fill('45');
  await expect.poll(async () => (await storedPcb(page)).components[0].angle).toBe(45);
});

test('Gerber ZIP and folder contain identical files for the chosen RS-274X options', async ({ page }, info) => {
  await page.addInitScript(() => {
    const files: Record<string, string> = {};
    Object.assign(window, {
      auditCamWrittenFiles: files,
      showDirectoryPicker: async () => ({
        name: 'audit-board',
        getFileHandle: async (name: string) => ({
          createWritable: async () => ({ write: async (value: string) => { files[name] = value; }, close: async () => {} })
        })
      })
    });
  });
  await openPcb(page, boardWithFourLayers());
  const cam = await openCam(page);
  await expect(cam.getByLabel('Медь внутренний 1 (.g2l)')).toBeChecked();
  await expect(cam.getByLabel('Шелкография низ (.gbo)')).not.toBeChecked();
  await cam.getByLabel('Атрибуты Gerber X2').uncheck();
  await cam.getByLabel(/Включить сверловку/).uncheck();
  await expect(cam.getByLabel('Сверловка (.drl)', { exact: true })).toHaveCount(0);
  const downloadEvent = page.waitForEvent('download');
  await cam.getByRole('button', { name: 'Скачать Gerber (.zip)...' }).click();
  const download = await downloadEvent;
  const entries = await extractZipEntries(await readFile((await download.path())!));
  await cam.getByRole('button', { name: /Экспортировать в папку/ }).click();
  await expect(page.locator('.dt-statusbar')).toContainText('Экспортировано 11 файлов');
  const zipContents = Object.fromEntries(Object.entries(entries).map(([name, bytes]) => [name, utf8Decode(bytes)]));
  const folderContents = await page.evaluate(() => Object.getOwnPropertyDescriptor(window, 'auditCamWrittenFiles')!.value);
  expect(folderContents).toEqual(zipContents);
  expect(Object.keys(zipContents).some((name) => name.endsWith('.drl'))).toBe(false);
  expect(Object.keys(zipContents).some((name) => name.endsWith('.G2L'))).toBe(true);
  expect(Object.values(zipContents).every((content) => !content.includes('%TF.'))).toBe(true);
  await page.screenshot({ path: info.outputPath('gerber-rs274x-four-layer.png') });
});

test('external drill files can be isolated and project drill table reflects the export', async ({ page }, info) => {
  await openPcb(page);
  const cam = await openCam(page);
  const projectLayer = cam.getByLabel('Медь верх (.gtl)');
  await expect(projectLayer).toBeChecked();
  const fileChooser = page.waitForEvent('filechooser');
  await cam.getByRole('button', { name: /Открыть Gerber \/ ZIP/ }).click();
  await (await fileChooser).setFiles({
    name: 'external-drills.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(createZipArchive({
      'plated.drl': 'M48\nMETRIC,TZ\nT01C0.925\n%\nT01\nX7.5Y8\nM30',
      'non-plated.drl': 'M48\nMETRIC,TZ\nT01C2.1\n%\nT01\nX15Y20\nM30'
    }))
  });
  await expect(cam.getByLabel('plated.drl', { exact: true })).toBeChecked();
  await cam.getByLabel('plated.drl', { exact: true }).uncheck();
  await expect(cam.getByLabel('non-plated.drl', { exact: true })).toBeChecked();
  await expect(projectLayer).toHaveCount(0);
  await cam.getByLabel(/Все слои вместе/).uncheck();
  await cam.getByLabel('Слой для предпросмотра').selectOption('non-plated.drl');
  await page.screenshot({ path: info.outputPath('gerber-external-drills.png') });
  await cam.getByRole('button', { name: /Сверловка Excellon/ }).click();
  const contents = await cam.getByLabel('Содержимое файла Excellon').inputValue();
  for (const [, tool, diameter] of contents.matchAll(/^(T\d+)C([\d.]+)$/gm)) {
    await expect(cam.getByText(`${tool} — Ø ${diameter} мм`)).toBeVisible();
  }
  const drillCount = [...contents.matchAll(/^X/gm)].length;
  expect(drillCount).toBeGreaterThan(2);
  await expect(cam.getByText(`Всего отверстий: ${drillCount}`)).toBeVisible();
  await page.screenshot({ path: info.outputPath('excellon-project-tools.png') });
});

test('layer-count-only edits preserve the contour, layer visibility and valid active layer', async ({ page }, info) => {
  const pcb = boardWithFourLayers();
  pcb.layers.find((layer) => layer.id === 'BottomMask')!.visible = false;
  pcb.boardOutline = [{ x: 1, y: 1 }, { x: 28, y: 1 }, { x: 25, y: 24 }, { x: 4, y: 18 }];
  await openPcb(page, pcb);
  const active = page.getByLabel('Активный слой меди');
  await page.getByLabel('Редактор топологии печатной платы').press('3');
  await expect(active).toHaveValue('Inner1');
  const wizard = await openBoardWizard(page);
  await expect(wizard.getByLabel('Заменить контур платы')).not.toBeChecked();
  await expect(wizard.getByLabel('Ширина, мм')).toBeDisabled();
  await wizard.getByLabel('Слоёв меди').selectOption('2');
  await page.screenshot({ path: info.outputPath('board-stack-preserve-outline.png') });
  await wizard.getByRole('button', { name: 'Применить' }).click();
  await expect(active).toHaveValue('TopCopper');
  const saved = await storedPcb(page);
  expect(saved.layerCount).toBe(2);
  expect(saved.boardOutline).toEqual(pcb.boardOutline);
  expect(saved.layers.find((layer) => layer.id === 'BottomMask')?.visible).toBe(false);
});

test('stack dialogs block removal of an inner layer that still has routing', async ({ page }, info) => {
  const pcb = boardWithFourLayers();
  pcb.traces.push({ id: 'audit-inner', layer: 'Inner2', netName: 'AUDIT', width: 0.2, points: [{ x: 17, y: 17 }, { x: 23, y: 17 }] });
  await openPcb(page, pcb);
  const wizard = await openBoardWizard(page);
  await expect(wizard.getByRole('option', { name: '2 слоя', exact: true })).toBeDisabled();
  await expect(wizard.getByText(/Перенесите или удалите объекты/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(wizard).toBeHidden();
  await page.getByRole('button', { name: /Нормы ГОСТ 23751/ }).click();
  const rules = page.getByRole('dialog', { name: /Правила проектирования/ });
  await expect(rules.getByRole('option', { name: /2 слоя/ })).toBeDisabled();
  await expect(rules.getByText(/Перенесите или удалите объекты/)).toBeVisible();
  await page.screenshot({ path: info.outputPath('rules-occupied-inner-layers.png') });
  await rules.getByRole('button', { name: 'Применить' }).click();
  const saved = await storedPcb(page);
  expect(saved.layerCount).toBe(4);
  expect(saved.traces).toContainEqual(pcb.traces.at(-1));
});

test('a manually drawn copper pour keeps all configured electrical properties', async ({ page }, info) => {
  const pcb = createDemoRs485Pcb();
  await openPcb(page, pcb);
  await page.getByTitle('Заливка медным полигоном', { exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Заливка медного полигона/ });
  await dialog.getByLabel(/Слой заливки/).selectOption('BottomCopper');
  await dialog.getByLabel(/Тип заполнения/).selectOption('Hatch');
  await dialog.getByLabel('Термобарьеры:').selectOption('2Spoke');
  await dialog.getByLabel(/Зазор до меди/).fill('0.65');
  await dialog.getByLabel('Ширина спицы', { exact: true }).fill('0.55');
  await dialog.getByLabel('Зазор термобарьера', { exact: true }).fill('0.45');
  await dialog.getByLabel(/Удалять изолированные/).uncheck();
  await page.screenshot({ path: info.outputPath('copper-pour-options.png') });
  await dialog.getByRole('button', { name: 'Нарисовать вручную' }).click();
  const canvas = page.getByLabel('Редактор топологии печатной платы');
  await canvas.click({ position: { x: 155, y: 160 } });
  await canvas.click({ position: { x: 235, y: 165 } });
  await canvas.click({ position: { x: 220, y: 245 } });
  await canvas.click({ button: 'right', position: { x: 220, y: 245 } });
  const board = await storedPcb(page);
  expect(board.copperPours).toHaveLength(pcb.copperPours.length + 1);
  expect(board.copperPours.at(-1)).toMatchObject({
    layer: 'BottomCopper', fillType: 'Hatch', thermalType: '2Spoke', clearance: 0.65, thermalSpokeWidth: 0.55,
    thermalGap: 0.45, removeIslands: false, dependOnBoardOutline: false
  });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await storedPcb(page)).copperPours.length).toBe(pcb.copperPours.length);
});

test('panelization validates the selected dimensions and can be undone', async ({ page }, info) => {
  const pcb = createDemoRs485Pcb();
  await openPcb(page, pcb);
  await page.getByRole('button', { name: 'Правка', exact: true }).click();
  await page.getByRole('menuitem', { name: /Панелизация платы/ }).click();
  const panel = page.getByRole('dialog', { name: /Панелизация/ });
  await panel.getByLabel(/По X/).fill('11');
  await panel.getByRole('button', { name: /Создать панель/ }).click();
  await expect(panel).toBeVisible();
  expect((await storedPcb(page)).components).toHaveLength(pcb.components.length);
  await panel.getByLabel(/По X/).fill('2');
  await panel.getByLabel(/По Y/).fill('1');
  await page.screenshot({ path: info.outputPath('panelization.png') });
  await panel.getByLabel(/По Y/).press('Enter');
  await expect(panel).toBeHidden();
  const panelized = await storedPcb(page);
  expect(panelized.components).toHaveLength(pcb.components.length * 2);
  expect(panelized.traces).toHaveLength(pcb.traces.length * 2);
  await page.keyboard.press('Control+z');
  await expect.poll(() => storedPcb(page)).toEqual(pcb);
});
