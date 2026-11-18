import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const APP_ROOT = path.resolve(__dirname, '../..');
const SCREENSHOT_DIR = path.join(APP_ROOT, 'tests', 'screenshots', 'audit', 'libraries');

async function openModule(page: Page, moduleId: string): Promise<string[]> {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('WebSocket') && !msg.text().includes('ERR_CONNECTION_REFUSED')) {
      errors.push(`console.error: ${msg.text()}`);
    }
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/?module=${encodeURIComponent(moduleId)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  return errors;
}

test.describe('Component & Pattern Editors, IC Wizard & Library Manager Total Audit', () => {

  test('1. Component Editor: Main layout, property editing, pins, multi-part and verification', async ({ page }) => {
    const errors = await openModule(page, 'componentEditor');
    await expect(page).toHaveTitle(/Редактор компонентов/);

    // Verify main UI sections exist
    await expect(page.locator('.dt-left-sidebar')).toContainText('Компоненты библиотек');
    await expect(page.locator('.dt-left-sidebar')).toContainText('Свойства компонента');
    await expect(page.locator('.dt-right-sidebar')).toContainText('Менеджер выводов');
    await expect(page.locator('.dt-right-sidebar')).toContainText('Корпус:');

    // 01: Capture initial Component Editor view
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_component_editor_main.png') });

    // Select first component and verify Pin Manager table
    const pinTable = page.locator('.dt-right-sidebar table.dt-table');
    await expect(pinTable).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_component_editor_pin_manager.png') });

    // Test grid selector
    const gridSelect = page.locator('.dt-toolbar-row select.dt-tb-select');
    await gridSelect.selectOption('1.25');
    await expect(gridSelect).toHaveValue('1.25');

    // Test adding a pin
    const pinToolBtn = page.locator('button[title*="вывод (Pin)"]');
    await pinToolBtn.click();
    // Click on canvas to place pin
    const canvas = page.locator('.dt-canvas-wrap canvas');
    await canvas.click({ position: { x: 350, y: 250 } });
    await page.waitForTimeout(100);

    // Test adding a multi-section part
    await page.locator('.dt-menubar').getByText('Компонент').click();
    await page.getByText('Добавить новую секцию (Multi-part)').click();
    await page.waitForTimeout(150);

    // Verify section count incremented in properties panel
    await expect(page.locator('.dt-left-sidebar')).toContainText('Секции (2)');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_component_editor_multipart_section.png') });

    // Test component verification
    await page.getByRole('button', { name: 'Проверить УГО' }).click();
    const verification = page.getByRole('dialog', { name: 'Проверка УГО' });
    await expect(verification).toContainText('Проверка УГО');
    await verification.getByRole('button', { name: 'Закрыть', exact: true }).click();

    // Test attaching pattern modal
    await page.locator('.dt-right-sidebar').getByRole('button', { name: 'Привязать...' }).click();
    await page.waitForTimeout(150);
    const patternModal = page.locator('.dt-modal');
    await expect(patternModal).toContainText('Привязка посадочного корпуса (ГОСТ)');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_component_editor_attach_pattern_dialog.png') });
    await page.locator('.dt-modal').getByRole('button', { name: 'Закрыть' }).click();

    expect(errors).toEqual([]);
  });

  test('2. Component Editor: GOST 2.743 IC Wizard dialog and generated symbol', async ({ page }) => {
    const errors = await openModule(page, 'componentEditor');
    await page.waitForTimeout(200);

    // Open IC Wizard modal
    await page.getByRole('button', { name: 'Мастер УГО ИМС' }).click();
    await page.waitForTimeout(150);

    const modal = page.locator('.dt-modal');
    await expect(modal).toContainText('Мастер создания УГО микросхемы (ГОСТ 2.743-91)');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_component_editor_ic_wizard_dialog.png') });

    // Fill IC Wizard fields: 1533ИЕ7 / 74HC161 counter with 8 in and 6 out
    const inputs = modal.locator('input');
    await inputs.nth(0).fill('К1533ИЕ7');
    await inputs.nth(1).fill('DD');
    await inputs.nth(2).fill('8');
    await inputs.nth(3).fill('6');

    // Click "Создать УГО"
    await modal.getByRole('button', { name: 'Создать УГО' }).click();
    await page.waitForTimeout(200);

    // Check generated component properties and pins
    await expect(page.locator('.dt-left-sidebar input').first()).toHaveValue('К1533ИЕ7');
    await expect(page.locator('.dt-right-sidebar')).toContainText('Менеджер выводов (14)');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_component_editor_ic_wizard_generated.png') });
    expect(errors).toEqual([]);
  });

  test('3. Pattern Editor: Main layout, Pad Manager, auto-numbering and drawing tools', async ({ page }) => {
    const errors = await openModule(page, 'patternEditor');
    await expect(page).toHaveTitle(/Редактор корпусов/);

    // Verify main UI sections exist
    await expect(page.locator('.dt-left-sidebar')).toContainText('Корпуса библиотек');
    await expect(page.locator('.dt-left-sidebar')).toContainText('Свойства корпуса');
    await expect(page.locator('.dt-right-sidebar')).toContainText('Контактные площадки');

    // 07: Capture initial Pattern Editor view
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_pattern_editor_main.png') });

    // Select first pad and inspect Pad Manager
    const padTable = page.locator('.dt-right-sidebar table.dt-table');
    await expect(padTable).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_pattern_editor_pad_manager.png') });

    // Test adding SMD pad
    await page.locator('button[title*="Площадка SMD"]').click();
    const canvas = page.locator('.dt-canvas-wrap canvas');
    await canvas.click({ position: { x: 380, y: 240 } });
    await page.waitForTimeout(100);

    // Test adding THT pad
    await page.locator('button[title*="Вывод THT"]').click();
    await canvas.click({ position: { x: 420, y: 240 } });
    await page.waitForTimeout(100);

    // Test auto-numbering pads from menu
    await page.locator('.dt-menubar').getByText('Корпус').click();
    await page.getByText('Автонумерация контактных площадок (1..N)').click();
    await page.waitForTimeout(100);

    expect(errors).toEqual([]);
  });

  test('4. Pattern Editor: IPC-7351 / GOST Parametric Generator dialog and generated QFP/BGA footprints', async ({ page }) => {
    const errors = await openModule(page, 'patternEditor');
    await page.waitForTimeout(200);

    // Open Parametric Pattern Generator
    await page.getByRole('button', { name: 'Генератор корпусов (IPC-7351)...' }).click();
    await page.waitForTimeout(150);

    const modal = page.locator('.dt-modal');
    await expect(modal).toContainText('Параметрический генератор корпусов (IPC-7351 / ГОСТ)');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_pattern_editor_generator_dialog.png') });

    // Generate QFP-48
    await modal.locator('select').first().selectOption('QFP');
    await page.waitForTimeout(100);
    await modal.getByRole('button', { name: 'Сгенерировать корпус' }).click();
    await page.waitForTimeout(200);

    // Verify generated QFP
    await expect(page.locator('.dt-right-sidebar')).toContainText('Контактные площадки (48)');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_pattern_editor_generated_qfp.png') });

    // Reopen Generator and generate BGA-16
    await page.getByRole('button', { name: 'Генератор корпусов (IPC-7351)...' }).click();
    await page.waitForTimeout(150);
    const modal2 = page.locator('.dt-modal');
    await modal2.locator('select').first().selectOption('BGA');
    await page.waitForTimeout(100);
    await modal2.getByRole('button', { name: 'Сгенерировать корпус' }).click();
    await page.waitForTimeout(200);

    // Verify generated BGA
    await expect(page.locator('.dt-right-sidebar')).toContainText('Контактные площадки (16)');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_pattern_editor_generated_bga.png') });

    expect(errors).toEqual([]);
  });

  test('5. CAD Library Manager Dialog: Component and Pattern catalogs, search and dual preview', async ({ page }) => {
    const errors = await openModule(page, 'componentEditor');
    await page.waitForTimeout(200);

    // Open Cad Library Manager Dialog
    await page.getByTestId('comped-cadlib-btn').click();
    await page.waitForTimeout(200);

    const dialog = page.getByTestId('cad-library-manager-modal');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Библиотеки внешних CAD');

    // 12: Capture Components tab
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_cad_library_manager_components.png') });

    // Switch to Patterns tab
    await dialog.getByRole('button', { name: /Корпуса \(/ }).click();
    await page.waitForTimeout(150);

    // 13: Capture Patterns tab
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_cad_library_manager_patterns.png') });

    // Switch back to Components and test search
    await dialog.getByRole('button', { name: /УГО \(/ }).click();
    const searchInput = page.getByTestId('cadlib-search-input');
    await searchInput.fill('DD');
    await page.waitForTimeout(150);

    // 14: Capture Dual Preview area
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_cad_library_manager_dual_preview.png') });

    // Close dialog
    await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await page.waitForTimeout(100);
    await expect(dialog).not.toBeVisible();

    expect(errors).toEqual([]);
  });

});
