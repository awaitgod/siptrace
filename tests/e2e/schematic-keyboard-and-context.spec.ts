import { expect, test, type Page } from '@playwright/test';
import { fixture } from '../fixtures/editorProject';

const storageKey = 'gosttrace_active_schematic_v2';
async function cursorAt(page: Page, x: number, y: number) {
    const bounds = (await page.getByLabel('Редактор электрической схемы').boundingBox())!;
    const scale = Math.min((bounds.width - 36) / 297, (bounds.height - 28) / 210);
    return { x: bounds.x + bounds.width / 2 + (x - 148.5) * scale, y: bounds.y + bounds.height / 2 + (y - 105) * scale };
}

test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const project = fixture();
    project.sheets[0].name = 'Силовая часть';
    project.sheets[0].wires = [{
        id: 'bent-wire', netName: '', points: [{ x: 90, y: 145 }, { x: 130, y: 145 }, { x: 130, y: 175 }, { x: 160, y: 175 }]
    }];
    project.sheets[0].netPorts.push({ id: 'isolated-ground', x: 155, y: 110, angle: 0, style: 'Ground', netName: 'GND_ISO' });
    for (const [id, name] of [['logic', 'Логика'], ['inputs', 'Входы']]) {
        const sheet = fixture().sheets[0];
        project.sheets.push({ ...sheet, id, name, components: [], wires: [], junctions: [], netPorts: [], shapes: [], buses: [] });
    }
    await page.addInitScript(({ key, project }) => localStorage.setItem(key, JSON.stringify(project)), { key: storageKey, project });
    await page.goto('/?module=schematic');
    await expect(page.locator('.sch-splash')).toBeHidden();
    await expect(page.getByRole('tab', { name: 'Силовая часть' })).toHaveAttribute('aria-selected', 'true');
});

test('sheet tabs follow horizontal arrows, Home and End without moving a component', async ({ page }) => {
    const first = page.getByRole('tab', { name: 'Силовая часть' });
    const second = page.getByRole('tab', { name: 'Логика' });
    const third = page.getByRole('tab', { name: 'Входы' });
    await page.locator('.dt-tree-row').filter({ hasText: 'R1' }).click();
    await first.focus();

    await page.keyboard.press('ArrowRight');
    await expect(second).toBeFocused();
    await expect(second).toHaveAttribute('aria-selected', 'true');
    await expect(first).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('End');
    await expect(third).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(first).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(third).toBeFocused();
    await page.keyboard.press('Home');
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tablist', { name: 'Листы схемы' }).getByRole('button')).toHaveCount(0);

    const x = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).sheets[0].components[0].x, storageKey);
    expect(x).toBe(75);
});

test('both panel splitters resize horizontally with keyboard and preserve the schematic', async ({ page }) => {
    const library = page.getByRole('separator', { name: 'Ширина библиотеки' });
    const properties = page.getByRole('separator', { name: 'Ширина свойств' });
    const undo = page.getByTitle('Отменить (Ctrl+Z)', { exact: true });
    await page.locator('.dt-tree-row').filter({ hasText: 'R1' }).click();

    await library.focus();
    await page.keyboard.press('ArrowRight');
    await expect(library).toHaveAttribute('aria-valuenow', '205');
    await page.keyboard.press('ArrowUp');
    await expect(library).toHaveAttribute('aria-valuenow', '205');

    await properties.focus();
    await page.keyboard.press('ArrowRight');
    await expect(properties).toHaveAttribute('aria-valuenow', '230');
    await page.keyboard.press('ArrowLeft');
    await expect(properties).toHaveAttribute('aria-valuenow', '240');
    await expect(undo).toBeDisabled();
});

test('Shift+F10 uses selection, confines navigation to the menu and restores canvas focus', async ({ page }, info) => {
    await page.locator('.dt-tree-row').filter({ hasText: 'R1' }).click();
    const canvas = page.getByLabel('Редактор электрической схемы');
    const menu = page.getByRole('menu', { name: 'Действия с выделением' });
    const properties = menu.getByRole('menuitem', { name: 'Свойства...' });
    const copy = menu.getByRole('menuitem', { name: 'Копировать' });

    await canvas.focus();
    await page.keyboard.press('Shift+F10');
    await expect(properties).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(copy).toBeFocused();
    await expect(page.getByTitle('Отменить (Ctrl+Z)', { exact: true })).toBeDisabled();
    await page.screenshot({ path: info.outputPath('schematic-keyboard-context-menu.png') });
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(canvas).toBeFocused();

    await page.keyboard.press('Shift+F10');
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Свойства объектов' });
    await expect(dialog.getByLabel('Позиционное обозначение', { exact: true })).toHaveValue('R1');
    await page.keyboard.press('Escape');
    await expect(canvas).toBeFocused();
});

test('context trimming uses the right-click anchor even if the cursor moves before activation', async ({ page }) => {
    const selected = await cursorAt(page, 149, 175);
    await page.mouse.click(selected.x, selected.y, { button: 'right' });
    const trim = page.getByRole('menuitem', { name: 'Удалить сегмент' });
    await expect(trim).toBeVisible();
    const other = await cursorAt(page, 104, 145);
    await page.mouse.move(other.x, other.y);
    await trim.click();
    await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).sheets[0].wires[0].points, storageKey))
        .toEqual([{ x: 90, y: 145 }, { x: 130, y: 145 }, { x: 130, y: 175 }]);
});

test('the wire context menu names group deletion and Undo restores the group', async ({ page }) => {
    const point = await cursorAt(page, 149, 175);
    await page.keyboard.press('Control+a');
    await page.mouse.click(point.x, point.y, { button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Удалить провод', exact: true })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Удалить выделение', exact: true }).click();
    await expect(page.locator('.dt-tree-row')).toHaveCount(0);

    await page.keyboard.press('Control+z');
    await expect(page.locator('.dt-tree-row').filter({ hasText: 'R1' })).toBeVisible();
});

test('duplicating a sheet preserves the copied symbol in the clipboard', async ({ page }, info) => {
    await page.locator('.dt-tree-row').filter({ hasText: 'R1' }).click();
    await page.keyboard.press('Control+c');
    await page.getByRole('button', { name: 'Листы...', exact: true }).click();
    const manager = page.getByRole('dialog', { name: 'Управление листами' });
    await expect(manager.getByLabel('Имя листа 1')).toBeFocused();
    await manager.getByRole('button', { name: 'Дублировать лист 1' }).click();
    await expect(manager.getByLabel('Имя листа 4')).toHaveValue('Силовая часть — копия');
    await page.screenshot({ path: info.outputPath('schematic-sheet-manager.png') });
    await manager.getByRole('button', { name: 'Открыть лист 2', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Логика' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Control+v');
    const point = await cursorAt(page, 120, 100);
    await page.mouse.click(point.x, point.y);
    await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).sheets[1].components.length, storageKey))
        .toBe(1);
});

for (const [active, next, collection] of [['w', 'b', 'buses'], ['b', 'w', 'wires']]) {
    test(`switching from ${active} to ${next} drops the old routing draft`, async ({ page }) => {
        await page.keyboard.press(active);
        for (const x of [170, 190]) {
            const point = await cursorAt(page, x, 135);
            await page.mouse.click(point.x, point.y);
        }
        await page.keyboard.press(next);
        const first = await cursorAt(page, 170, 155);
        const second = await cursorAt(page, 190, 155);
        await page.mouse.click(first.x, first.y);
        await page.mouse.click(second.x, second.y);
        await page.keyboard.press('Enter');
        await expect.poll(async () => page.evaluate(({ key, collection }) => JSON.parse(localStorage.getItem(key)!).sheets[0][collection].at(-1).points, {
            key: storageKey, collection
        })).toEqual([{ x: 170, y: 155 }, { x: 190, y: 155 }]);
    });
}

test('the vector sheet identifies a separately named ground port', async ({ page }, info) => {
    await page.keyboard.press('Control+p');
    const printFrame = page.frameLocator('#siptrace-print');
    await expect(printFrame.locator('svg').first().getByText('GND_ISO', { exact: true })).toHaveCount(1);
    await page.screenshot({ path: info.outputPath('schematic-isolated-ground.png') });
});
