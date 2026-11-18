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
  await page.waitForTimeout(300);
  return errors;
}

test.describe('Component & Pattern Editors Advanced Usability & Standards Verification', () => {

  test('1. Component Editor: Pin Manager Quick Range (D0..D7), Sorting and Renumbering', async ({ page }) => {
    const errors = await openModule(page, 'componentEditor');
    await expect(page).toHaveTitle(/Редактор компонентов/);

    // Click "+ Диапазон..." in Pin Manager action bar
    const rangeBtn = page.getByRole('button', { name: '+ Диапазон...' });
    await expect(rangeBtn).toBeVisible();
    await rangeBtn.click();
    await page.waitForTimeout(150);

    // Range dialog should open
    const rangeDialog = page.getByRole('dialog', { name: 'Быстрый ввод диапазона выводов' });
    await expect(rangeDialog).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'adv_01_pin_range_dialog.png') });

    // Fill range D0..D7 and add pins
    const rangeInput = rangeDialog.locator('input[placeholder="D0..D7"]');
    await rangeInput.fill('D0..D7');
    await rangeDialog.getByRole('button', { name: 'Добавить выводы' }).click();
    await page.waitForTimeout(200);

    // Verify 8 pins D0..D7 were added to Pin Manager table
    const pinRows = page.locator('.dt-right-sidebar table.dt-table tbody tr');
    const pinCount = await pinRows.count();
    expect(pinCount).toBeGreaterThanOrEqual(8);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'adv_02_pins_added_from_range.png') });

    // Test renumbering 1..N
    const renumBtn = page.getByRole('button', { name: '1..N' });
    await renumBtn.click();
    await page.waitForTimeout(100);

    // Test sorting toggle
    const sortBtn = page.getByRole('button', { name: /Сорт:/ });
    await sortBtn.click(); // cycle to Name sort
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'adv_03_pins_sorted_by_name.png') });

    // Check Footprint Mapping comparison indicator in right sidebar
    const mappingInfo = page.locator('.dt-right-sidebar').getByText(/Выв: \d+ \/ Площ: \d+/);
    await expect(mappingInfo).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('2. Pattern Editor: Design Rules & IPC-7351 Verification Dialog', async ({ page }) => {
    const errors = await openModule(page, 'patternEditor');
    await expect(page).toHaveTitle(/Редактор корпусов/);

    // Click "Проверить корпус" in toolbar
    const verifyBtn = page.getByRole('button', { name: 'Проверить корпус' });
    await expect(verifyBtn).toBeVisible();
    await verifyBtn.click();
    await page.waitForTimeout(200);

    // Verification modal should be visible
    const modal = page.getByRole('dialog', { name: 'Проверка корпуса' });
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Проверка корпуса (IPC-7351 / ГОСТ)');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'adv_04_pattern_verification_dialog.png') });

    // Close verification modal
    await modal.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await page.waitForTimeout(100);
    await expect(modal).not.toBeVisible();

    // Select first pad and change shape to Polygon
    const firstPadRow = page.locator('.dt-right-sidebar table.dt-table tbody tr').first();
    await firstPadRow.click();
    await page.waitForTimeout(100);

    const shapeSelect = page.getByRole('combobox', { name: /Форма площадки/ });
    await expect(shapeSelect).toBeVisible();
    await shapeSelect.selectOption('Polygon');
    await page.waitForTimeout(100);
    await expect(shapeSelect).toHaveValue('Polygon');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'adv_05_polygon_pad_selected.png') });

    expect(errors).toEqual([]);
  });

  test('3. CAD Library Manager: Keyboard Arrow Navigation and Escape Dismiss', async ({ page }) => {
    const errors = await openModule(page, 'componentEditor');

    // Open CAD Library Manager Dialog
    await page.getByTestId('comped-cadlib-btn').click();
    await page.waitForTimeout(200);

    const dialog = page.getByTestId('cad-library-manager-modal');
    await expect(dialog).toBeVisible();

    // Focus inside search or list and navigate with ArrowDown
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'adv_06_cad_library_keyboard_navigation.png') });

    // Press Escape to dismiss
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await expect(dialog).not.toBeVisible();

    expect(errors).toEqual([]);
  });

});
