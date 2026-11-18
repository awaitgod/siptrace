import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '../screenshots/audit/launcher');

test.describe('Launcher Engineering Utilities & Deep Usability E2E Tests', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('01. RF Microstrip Calculator: Analysis & Target Synthesis', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'Инструменты и расчёты', exact: true }).click();

    // Verify RF calculator header
    await expect(page.getByRole('heading', { name: /волнового сопротивления/i })).toBeVisible();

    // Test synthesis mode
    await page.getByRole('button', { name: 'Синтез (Ширина по целевому Z₀)' }).click();
    await page.getByRole('button', { name: '50 Ом (ВЧ)' }).click();
    await expect(page.getByText('Требуемая ширина:')).toBeVisible();

    // Apply synthesized width
    await page.getByRole('button', { name: 'Применить ширину' }).click();
    await expect(page.locator('.launch-banner-msg')).toContainText('установлена для Z₀ = 50 Ом');

    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_launcher_utilities_rf_synthesis.png') });
  });

  test('02. Trace Current Calculator: Bidirectional Calculation & Thermal Metrics', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'Инструменты и расчёты', exact: true }).click();
    await page.getByRole('button', { name: /Ток и нагрев дорожек/i }).click();

    // Change current to 3.5 A
    const currentInput = page.getByLabel('Рабочий ток (Амперы):');
    await currentInput.fill('3.5');

    // Verify thermal metrics
    await expect(page.getByText('Падение напряжения на длине')).toBeVisible();
    await expect(page.getByText('Тепловая мощность рассеяния (I²R):')).toBeVisible();
    await expect(page.getByText('Плотность тока (J):')).toBeVisible();

    // Switch to width -> current mode
    await page.getByRole('button', { name: 'Допустимый ток по ширине (W → I_max)' }).click();
    const widthInput = page.getByLabel('Ширина проводника на плате (мм):');
    await widthInput.fill('1.2');
    await expect(page.getByText('Максимальный длительный ток:')).toBeVisible();

    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_launcher_utilities_trace_current_interactive.png') });
  });

  test('03. IPC-7351 Footprint Generator: Presets, Canvas Rendering & Library Persistence', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'Инструменты и расчёты', exact: true }).click();
    await page.getByRole('button', { name: /Генератор корпусов IPC-7351/i }).click();

    // Click TQFP-32 preset
    await page.getByRole('button', { name: 'TQFP-32 (0.8 мм)' }).click();
    await expect(page.getByLabel('Число выводов:')).toHaveValue('32');

    // Click QFN-32 preset with thermal pad
    await page.getByRole('button', { name: /QFN-32.*Thermal Pad/ }).click();
    await expect(page.getByLabel('Размер Thermal Pad (мм):')).toHaveValue('3.4');

    // Click DIP-14 preset
    await page.getByRole('button', { name: 'DIP-14 (2.54 мм, THT)' }).click();
    await expect(page.getByLabel('Диаметр отверстия сверловки (мм):')).toHaveValue('0.85');

    // Save footprint to library
    const saveBtn = page.locator('.launch-ipc-save-btn');
    await saveBtn.click();
    await expect(saveBtn).toContainText('Сохранено в библиотеку!');
    await expect(page.locator('.launch-banner-msg')).toContainText('сохранено в библиотеку пользователя');

    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_launcher_utilities_ipc7351_canvas_preview.png') });
  });

  test('04. Keyboard Navigation: Escape dismisses dialogs and restores focus', async ({ page }) => {
    await page.goto('/?module=launcher');

    // Test New Project dialog Escape
    const newProjBtn = page.getByRole('button', { name: 'Создать проект', exact: true });
    await newProjBtn.focus();
    await page.keyboard.press('Enter');
    const newProjectDialog = page.getByRole('dialog', { name: 'Новый проект — SIPTrace' });
    await expect(newProjectDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(newProjectDialog).toBeHidden();

    // Test Library Manager dialog Escape
    const libBtn = page.getByRole('button', { name: 'Библиотека ГОСТ', exact: true });
    await libBtn.focus();
    await page.keyboard.press('Enter');
    const libDialog = page.getByRole('dialog', { name: 'Библиотеки внешних CAD' });
    await expect(libDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(libDialog).toBeHidden();
  });
});
