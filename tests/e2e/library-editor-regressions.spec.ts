import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { CadLibraryBundle } from '../../src/core/persistence/libraryStore';
import type { ComponentDef, PatternDef } from '../../src/core/types';

const component = (id: string, library: string, name: string): ComponentDef => ({
  id, library, name, refDesPrefix: 'U', defaultValue: 'LM50', gostStandard: '',
  description: 'УГО для проверки библиотеки', patternId: 'absent-footprint',
  parts: [{ partIndex: 1, name: 'Секция 1', primitives: [], pins: [
    { id: 'pin1', number: '1', name: 'IN', x: 0, y: 0, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true }
  ] }]
});

const pattern = (id: string, library: string, name: string): PatternDef => ({
  id, library, name, description: 'Корпус для проверки библиотеки',
  courtyard: { width: 4, height: 4 },
  model3d: { shape: 'Box', bodyWidth: 3, bodyLength: 3, bodyHeight: 2, color: '#424242' },
  pads: [{ id: 'pad1', number: '1', type: 'SMD', shape: 'Rect', x: 0, y: 0, width: 1, height: 1, layer: 'Top' }], graphics: []
});

const imported = [
  { component: component('user-cap-symbol', 'Конденсаторы', 'Элемент A'), pattern: pattern('user-cap-pattern', 'Конденсаторы', 'Корпус A'), category: 'Пассивные' },
  { component: component('user-ic-symbol', 'Микросхемы', 'Элемент B'), pattern: pattern('user-ic-pattern', 'Микросхемы', 'Корпус B'), category: 'Активные' }
];

function libraryBundles(): CadLibraryBundle[] {
  return imported.map((entry, index) => ({
    id: `audit-cad-${index}`,
    name: entry.component.library,
    sourceFormat: 'GOSTLIB',
    sourceFile: 'audit.gostlib',
    category: entry.category,
    gostAdapted: false,
    importedAt: '2026-11-17',
    componentIds: [entry.component.id],
    patternIds: [entry.pattern.id]
  }));
}

test('Пользователь связывает корпус с УГО клавиатурой, фокус возвращается к кнопке', async ({ page }, testInfo) => {
  await page.goto('/?module=componentEditor');
  const attach = page.getByRole('button', { name: 'Привязать...' });
  await attach.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: /Привязка посадочного корпуса/ });
  await expect(dialog).toBeVisible();
  const choice = dialog.getByRole('button', { name: /^DIP-14/ }).first();
  await choice.focus();
  await expect(choice).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('footprint-keyboard-selection.png') });
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(attach).toBeFocused();
  await expect(page.locator('.dt-panel-header')).toContainText(['Менеджер выводов', 'Корпус: DIP-14']);
});

test('Проверка УГО показывает отсутствующий корпус, дубликаты и все остальные замечания', async ({ page }, testInfo) => {
  const stored = component('check-component', 'lib_user', 'Проверяемое УГО');
  const source = stored.parts[0].pins[0];
  stored.parts[0].pins.push(...Array.from({ length: 5 }, (_, index) => ({
    ...source, id: `duplicate-${index}`, x: 1.25 + index * 2.5, y: 1.25
  })));
  await page.addInitScript((initial) => localStorage.setItem('gosttrace_user_components_v1', JSON.stringify(initial)), [stored]);
  await page.goto('/?module=componentEditor');
  await page.getByRole('button', { name: 'Проверить УГО' }).click();
  const report = page.getByRole('dialog', { name: 'Проверка УГО' });
  await expect(report.getByRole('listitem')).toHaveCount(11);
  await expect(report).toContainText('«absent-footprint» не найден');
  await expect(report.getByText(/дубликат номера/)).toHaveCount(5);
  await page.screenshot({ path: testInfo.outputPath('symbol-check-findings.png') });
});

test('Мастер УГО проверяет границы и оставляет выбор корпуса инженеру', async ({ page }, testInfo) => {
  await page.goto('/?module=componentEditor');
  await page.getByRole('button', { name: 'Мастер УГО ИМС' }).click();
  const dialog = page.getByRole('dialog', { name: /Мастер создания УГО/ });
  const create = dialog.getByRole('button', { name: 'Создать УГО' });
  await dialog.getByRole('spinbutton', { name: /Входов слева/ }).fill('33');
  await expect(create).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('ic-wizard-invalid-input.png') });
  await dialog.getByRole('spinbutton', { name: /Входов слева/ }).fill('8');
  await dialog.getByRole('spinbutton', { name: /Выходов справа/ }).fill('6');
  await create.click();
  await expect(page.getByText('Менеджер выводов (14)')).toBeVisible();
  await expect(page.getByText('Корпус: Нет')).toBeVisible();
  await expect(page.locator('.dt-statusbar')).toContainText('Назначьте корпус и проверьте распиновку');
});

test('Новый вывод получает свободный номер и Ctrl+S работает после закрытия мастера', async ({ page }) => {
  await page.goto('/?module=componentEditor');
  await page.getByTitle('Новый компонент ГОСТ', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Номер вывода 2' }).click();
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await page.getByTitle('Добавить вывод (Pin)').click();
  await page.locator('.dt-canvas-wrap canvas').click({ position: { x: 200, y: 200 } });
  await expect(page.getByRole('textbox', { name: 'Номер вывода 2' })).toHaveValue('2');
  await expect(page.getByRole('textbox', { name: 'Номер вывода 3' })).toHaveCount(1);
  const wizard = page.getByRole('button', { name: 'Мастер УГО ИМС' });
  await wizard.click();
  await expect(page.getByRole('dialog', { name: /Мастер создания УГО/ })).toBeVisible();
  await page.keyboard.press('Control+s');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('gosttrace_user_components_v1'))).toBeNull();
  await page.keyboard.press('Escape');
  await expect(wizard).toBeFocused();
  await page.keyboard.press('Control+s');
  await expect(page.locator('.dt-statusbar')).toContainText('сохранён');
});

test('Отмена замены сохраняет правки УГО, сохранённый черновик доступен после перезагрузки', async ({ page }) => {
  await page.goto('/?module=componentEditor');
  const name = page.getByRole('textbox', { name: 'Наименование:' });
  await name.fill('Правки инженера');
  const discard = page.waitForEvent('dialog');
  const newComponent = page.getByTitle('Новый компонент ГОСТ', { exact: true }).click();
  const confirmation = await discard;
  expect(confirmation.message()).toContain('Компонент изменён');
  await confirmation.dismiss();
  await newComponent;
  await expect(name).toHaveValue('Правки инженера');
  await page.keyboard.press('Control+s');
  await page.reload();
  await expect(name).toHaveValue('Правки инженера');
});

test('Крепёжное отверстие не участвует в нумерации и не получает медную площадку при автонумерации', async ({ page }, testInfo) => {
  await page.goto('/?module=patternEditor');
  await page.getByTitle('Новый корпус', { exact: true }).click();
  const canvas = page.locator('.dt-canvas-wrap canvas');
  await page.getByTitle('Крепёжное отверстие', { exact: true }).click();
  await canvas.click({ position: { x: 260, y: 190 } });
  await page.getByTitle('Площадка SMD', { exact: true }).click();
  await canvas.click({ position: { x: 310, y: 190 } });
  await expect(page.getByRole('textbox', { name: 'Номер площадки 3' })).toHaveValue('3');
  await page.getByRole('button', { name: 'Корпус', exact: true }).click();
  await page.getByText('Автонумерация контактных площадок (1..N)').click();
  const mechanical = page.getByRole('textbox', { name: 'Номер площадки без номера' });
  await expect(mechanical).toBeDisabled();
  await expect(mechanical).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'Номер площадки 3' })).toHaveValue('3');
  await page.getByRole('combobox', { name: 'Тип площадки 3' }).selectOption('THT');
  await expect(page.getByRole('spinbutton', { name: 'Диаметр отверстия площадки 3' })).toHaveValue('0.9');
  await page.getByRole('combobox', { name: 'Тип площадки 3' }).selectOption('SMD');
  await expect(page.getByRole('spinbutton', { name: 'Диаметр отверстия площадки 3' })).toBeDisabled();
  await expect(page.getByRole('spinbutton', { name: 'Диаметр отверстия площадки 3' })).toHaveValue('0');
  await page.screenshot({ path: testInfo.outputPath('footprint-pads-numbering.png') });
});

test('Генератор удерживает форму при неверном числе выводов и создаёт точное число после правки', async ({ page }, testInfo) => {
  await page.goto('/?module=patternEditor');
  await page.getByRole('button', { name: 'Генератор корпусов (IPC-7351)...' }).click();
  const generator = page.getByRole('dialog', { name: /Параметрический генератор/ });
  await generator.getByRole('combobox', { name: 'Семейство корпуса:' }).selectOption('QFP');
  const count = generator.getByRole('spinbutton', { name: 'Количество выводов:' });
  await count.fill('49');
  await count.press('Enter');
  await expect(generator.getByRole('alert')).toContainText('кратное 4');
  await page.screenshot({ path: testInfo.outputPath('footprint-generator-validation.png') });
  await count.fill('48');
  await count.press('Enter');
  await expect(generator).toBeHidden();
  await expect(page.getByText('Контактные площадки (48)')).toBeVisible();
});

test('Менеджер фильтрует обе вкладки и открывает корпус только с клавиатуры', async ({ page }, testInfo) => {
  await page.addInitScript(({ entries, bundles }) => {
    localStorage.setItem('gosttrace_user_components_v1', JSON.stringify(entries.map((entry) => entry.component)));
    localStorage.setItem('gosttrace_user_patterns_v1', JSON.stringify(entries.map((entry) => entry.pattern)));
    localStorage.setItem('gosttrace_imported_lib_bundles_v1', JSON.stringify(bundles));
  }, { entries: imported, bundles: libraryBundles() });
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/?module=patternEditor');
  await page.getByTestId('pated-cadlib-btn').focus();
  await page.keyboard.press('Enter');
  const manager = page.getByRole('dialog', { name: /Библиотеки внешних CAD/ });
  await expect(manager.getByRole('textbox', { name: 'Поиск по корпусам' })).toBeFocused();
  await manager.getByTitle('Фильтр по категории').selectOption('Активные');
  await expect(manager.getByRole('button', { name: 'Корпус A', exact: true })).toBeHidden();
  await expect(manager.getByRole('button', { name: 'Корпус B', exact: true })).toBeVisible();
  await manager.getByRole('button', { name: /^УГО / }).press('Space');
  await expect(manager.getByRole('button', { name: 'Элемент A', exact: true })).toBeHidden();
  await expect(manager.getByRole('button', { name: 'Элемент B', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('cad-manager-symbols-800.png') });
  await manager.getByRole('button', { name: /^Корпуса / }).press('Space');
  await manager.getByRole('button', { name: 'Корпус B', exact: true }).press('Space');
  await expect(manager.getByRole('button', { name: 'Корпус B', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: testInfo.outputPath('cad-manager-footprints-800.png') });
  await manager.getByRole('button', { name: 'Выбрать корпус' }).press('Enter');
  await expect(manager).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Наименование:' })).toHaveValue('Корпус B');
});

test('Отмена удаления сохраняет CAD-библиотеку, подтверждение обновляет списки', async ({ page }) => {
  await page.addInitScript(({ entries, bundles }) => {
    localStorage.setItem('gosttrace_user_components_v1', JSON.stringify(entries.map((entry) => entry.component)));
    localStorage.setItem('gosttrace_user_patterns_v1', JSON.stringify(entries.map((entry) => entry.pattern)));
    localStorage.setItem('gosttrace_imported_lib_bundles_v1', JSON.stringify(bundles));
  }, { entries: imported, bundles: libraryBundles() });
  await page.goto('/?module=componentEditor');
  await page.getByTestId('comped-cadlib-btn').click();
  const manager = page.getByRole('dialog', { name: /Библиотеки внешних CAD/ });
  const remove = manager.getByRole('button', { name: 'Удалить библиотеку Конденсаторы' });
  page.once('dialog', (dialog) => dialog.dismiss());
  await remove.press('Enter');
  await expect(remove).toBeVisible();
  await expect(manager.getByRole('button', { name: 'Элемент A', exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await remove.press('Enter');
  await expect(remove).toBeHidden();
  await expect(manager.getByRole('button', { name: 'Элемент A', exact: true })).toBeHidden();
  await expect(manager.getByRole('button', { name: 'Элемент B', exact: true })).toBeVisible();
});

test('Импорт и экспорт GOSTLIB сохраняют ссылку УГО на корпус и вывод на площадку', async ({ page }, testInfo) => {
  const footprint = pattern('audit-footprint', 'Библиотека для проверки', 'Корпус для экспорта');
  const symbol = { ...component('audit-symbol', footprint.library, 'УГО для экспорта'), patternId: footprint.id };
  symbol.parts[0].pins[0].padMapping = '1';
  await page.goto('/?module=componentEditor');
  await page.getByTestId('comped-cadlib-btn').click();
  const manager = page.getByRole('dialog', { name: /Библиотеки внешних CAD/ });
  const chooserPromise = page.waitForEvent('filechooser');
  await manager.getByTestId('cadlib-import-btn').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'exchange.gostlib',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ name: footprint.library, components: [symbol], patterns: [footprint] }))
  });
  await expect(manager.getByRole('status')).toContainText('Импортировано: 1 комп., 1 корп.');
  await expect(manager.getByText(`Предпросмотр корпуса (${footprint.name})`)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('cad-manager-imported-symbol-and-footprint.png') });

  const downloadPromise = page.waitForEvent('download');
  await manager.getByRole('button', { name: `Экспортировать библиотеку ${footprint.library}` }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.gostlib$/);
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(exported.components).toHaveLength(1);
  expect(exported.patterns).toHaveLength(1);
  expect(exported.components[0].patternId).toBe(exported.patterns[0].id);
  expect(exported.components[0].parts[0].pins[0].padMapping).toBe(exported.patterns[0].pads[0].number);
});

const generatorFamilies = [
  ['SOIC', 16], ['DIP', 14], ['QFP', 48], ['QFN', 33], ['SOT23', 3],
  ['ChipSMD', 2], ['AxialTHT', 2], ['RadialTHT', 2], ['Header', 10], ['BGA', 16]
] as const;

for (const [family, count] of generatorFamilies) {
  test(`Генератор ${family}: ожидаемое число площадок и геометрия в менеджере`, async ({ page }, testInfo) => {
    await page.goto('/?module=patternEditor');
    await page.getByRole('button', { name: 'Генератор корпусов (IPC-7351)...' }).click();
    const generator = page.getByRole('dialog', { name: /Параметрический генератор/ });
    await generator.getByRole('combobox', { name: 'Семейство корпуса:' }).selectOption(family);
    await page.screenshot({ path: testInfo.outputPath(`${family}-generator.png`) });
    await generator.getByRole('button', { name: 'Сгенерировать корпус' }).click();
    await expect(generator).toBeHidden();
    const pads = page.getByRole('table').getByRole('row');
    await expect(pads).toHaveCount(count + 1);
    const padNumbers = await page.getByRole('textbox', { name: /Номер площадки/ }).evaluateAll((fields) =>
      fields.map((field) => (field as HTMLInputElement).value)
    );
    expect(new Set(padNumbers).size).toBe(count);
    const positions = await pads.locator('input[aria-label^="Координата"]').evaluateAll((fields) => {
      const coordinates = fields.map((field) => (field as HTMLInputElement).valueAsNumber);
      return coordinates.filter((_, index) => index % 2 === 0).map((x, index) => [x, coordinates[index * 2 + 1]]);
    });
    expect(positions.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    expect(new Set(positions.map(([x, y]) => `${x},${y}`)).size).toBe(count);
    await page.screenshot({ path: testInfo.outputPath(`${family}-generated.png`) });
  });
}

for (const moduleId of ['componentEditor', 'patternEditor'] as const) {
  test(`${moduleId}: все верхние меню открываются клавиатурой и возвращают фокус`, async ({ page }, testInfo) => {
    await page.goto(`/?module=${moduleId}`);
    await page.screenshot({ path: testInfo.outputPath('editor.png') });
    const menus = page.locator('.dt-menubar .dt-menu-item[aria-haspopup="menu"]');
    await expect(menus).toHaveCount(4);
    for (const [index, menu] of (await menus.all()).entries()) {
      await menu.press('Enter');
      await expect(menu).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('.dt-dropdown [role^="menuitem"]:focus')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`menu-${index + 1}.png`) });
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
    }
  });
}
