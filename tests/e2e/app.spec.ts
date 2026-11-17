import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const APP_ROOT = path.resolve(__dirname, '../..');
const SCREENSHOT_DIR = path.join(APP_ROOT, 'tests', 'screenshots');

async function openGostModule(page: Page, moduleId: string): Promise<string[]> {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`console.error: ${msg.text()}`);
    }
  });

  if (moduleId === 'launcher') {
    await page.setViewportSize({ width: 364, height: 268 });
  } else {
    await page.setViewportSize({ width: 1280, height: 800 });
  }

  await page.goto(`/?module=${encodeURIComponent(moduleId)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(450);
  return errors;
}

test.describe('SIPTrace — Vite Web Suite & Visual Verification', () => {
  test('1. Launcher module renders compact 5-button DipTrace launcher only', async ({ page }) => {
    const errors = await openGostModule(page, 'launcher');
    await expect(page).toHaveTitle('SIPTrace');
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /logo\.svg$/);
    await expect(page.locator('.dt-launcher-module-btn')).toHaveCount(5);
    await expect(page.getByText('+ Создать проект...')).toHaveCount(0);
    await expect(page.getByText('Параметры по умолчанию')).toHaveCount(0);
    await expect(page.getByText('Библиотеки CAD...')).toHaveCount(0);

    await expect(page.getByRole('button', { name: 'Редактор схем' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Редактор плат' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Редактор компонентов' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Редактор посадочных мест' })).toBeVisible();
    await expect(page.getByRole('button', { name: '3D-просмотр платы' })).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_launcher.png') });
    expect(errors).toEqual([]);
  });

  test('2. Schematic module matches DipTrace layout, runs ERC, GOST BOM, SPICE & Color Theme', async ({ page }) => {
    const errors = await openGostModule(page, 'schematic');
    await page.waitForTimeout(400);
    await expect(page.locator('.dt-menubar')).toContainText('Файл');
    await expect(page.locator('.dt-menubar')).toContainText('Проверка');
    await expect(page.locator('.dt-left-sidebar')).toContainText('Установить компонент');
    await expect(page.locator('.dt-right-sidebar')).toContainText('Менеджер проекта');
    await expect(page.getByRole('button', { name: 'Стенд МК/Лаб' })).toHaveCount(0);

    // Capture main RS-485 DipTrace-matching screenshot
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_schematic_rs485_dark.png') });

    // Switch library & select GOST Logic IC
    await page.getByText('Цифровые ИМС (ГОСТ 2.743)').click();
    await page.waitForTimeout(150);

    // Run ERC via toolbar button
    await page.getByTitle('Проверка ERC (F9)').click();
    await page.waitForTimeout(200);
    await expect(page.locator('.dt-statusbar')).toContainText('Проверка ERC');

    // Open GOST BOM (Перечень элементов ПЭ3)
    await page.getByTitle('Перечень элементов ПЭ3 (ГОСТ 2.701)').click();
    await page.waitForTimeout(200);
    await expect(page.locator('.dt-modal')).toContainText('Перечень элементов (ГОСТ 2.701-2008');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_schematic_bom_gost.png') });
    await page.locator('.dt-modal').getByRole('button', { name: 'Закрыть' }).click();

    // Run Built-in SPICE Simulator
    await page.getByTitle('SPICE симуляция цепи').click();
    await page.waitForTimeout(200);
    await expect(page.locator('.dt-modal')).toContainText('SPICE-симуляция (Модифицированный узловой анализ MNA)');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_schematic_spice.png') });
    await page.locator('.dt-modal').getByRole('button', { name: 'Закрыть' }).click();

    // Switch to GOST White Theme via Вид -> Настройка цветов
    await page.locator('.dt-menubar').getByText('Вид', { exact: true }).click();
    await page.getByText('Настройка цветов и темы (Тёмная / ГОСТ Белая)...').click();
    await page.getByText('Чёрно-белая ЕСКД (строго под печать ГОСТ)').click();
    await page.locator('.dt-modal').getByRole('button', { name: 'ОК', exact: true }).click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_schematic_gost_white.png') });

    expect(errors).toEqual([]);
  });

  test('3. PCB Layout module runs Autorouter, Copper Pour, DRC & Gerber Previewer', async ({ page }) => {
    const errors = await openGostModule(page, 'pcb');
    await page.waitForTimeout(450);
    await expect(page.locator('.dt-right-sidebar')).toContainText('Слои');
    await expect(page.locator('.dt-right-sidebar')).toContainText('Менеджер проекта');

    // Run Autorouter & Copper Pour update
    await page.getByTitle('Автотрассировщик').click();
    await page.waitForTimeout(400);
    await page.getByTitle('Проверка DRC (F9)').click();
    await page.waitForTimeout(200);
    await expect(page.locator('.dt-statusbar')).toContainText(/Проверка DRC.*(Нарушений не обнаружено|ошибок 0)/);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_pcb_layout.png') });

    // Open CAM / Gerber RS-274X Previewer
    await page.getByTitle('Экспорт Gerber RS-274X / Сверловка / ЛУТ SVG').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.dt-modal')).toContainText('Производственные файлы (Gerber RS-274X/X2');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_pcb_gerber_preview.png') });
    await page.locator('.dt-modal').getByRole('button', { name: 'Закрыть', exact: true }).click();

    expect(errors).toEqual([]);
  });

  test('4. 3D WebGL Preview renders board & procedural 3D bodies', async ({ page }) => {
    const errors = await openGostModule(page, 'pcb3d');
    await page.waitForTimeout(900);
    const canvasCount = await page.locator('canvas').count();
    expect(canvasCount).toBeGreaterThan(0);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_pcb_3d_view.png') });
    expect(errors).toEqual([]);
  });

  test('5. Component Editor renders GOST UGO canvas, Pin Manager & attached Pattern', async ({ page }) => {
    const errors = await openGostModule(page, 'componentEditor');
    await page.waitForTimeout(400);
    await expect(page.locator('.dt-right-sidebar')).toContainText('Менеджер выводов');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_component_editor.png') });
    expect(errors).toEqual([]);
  });

  test('6. Pattern Editor generates IPC-7351 / GOST parametric footprint', async ({ page }) => {
    const errors = await openGostModule(page, 'patternEditor');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Генератор корпусов (IPC-7351)...' }).click();
    await page.waitForTimeout(200);
    await expect(page.locator('.dt-modal')).toContainText('Параметрический генератор корпусов');
    await page.getByRole('button', { name: 'Сгенерировать корпус' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_pattern_editor_generator.png') });
    expect(errors).toEqual([]);
  });

  test('7. PCB CAM Workbench inspects Gerber layers, configures DXF & generates CNC G-Code', async ({ page }) => {
    const errors = await openGostModule(page, 'pcb');
    await page.waitForTimeout(400);
    await page.getByTitle('Экспорт Gerber RS-274X / Сверловка / ЛУТ SVG').click();
    await page.waitForTimeout(250);
    await expect(page.locator('.dt-modal')).toContainText('Отверстий:');
    await page.locator('.dt-modal').getByRole('button', { name: /Экспорт DXF/ }).click();
    await page.waitForTimeout(150);
    await expect(page.locator('.dt-modal')).toContainText('Примитивов в DXF:');
    await page.locator('.dt-modal').getByRole('button', { name: /ЧПУ G-Code/ }).click();
    await page.waitForTimeout(200);
    await expect(page.locator('.dt-modal')).toContainText('Кадров G-Code:');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_pcb_cam_gcode.png') });
    await page.locator('.dt-modal').getByRole('button', { name: 'Закрыть', exact: true }).click();
    expect(errors).toEqual([]);
  });

  test('8. Component Editor GOST IC Wizard generates rectangular GOST 2.743 symbol', async ({ page }) => {
    const errors = await openGostModule(page, 'componentEditor');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Мастер УГО ИМС' }).click();
    await page.waitForTimeout(200);
    await expect(page.locator('.dt-modal')).toContainText('Мастер создания УГО микросхемы (ГОСТ 2.743-91)');
    await page.locator('.dt-modal').getByRole('button', { name: 'Создать УГО' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_component_ic_wizard.png') });
    expect(errors).toEqual([]);
  });

  test('9. Project creation flow creates unified Schematic + PCB and PCB-only boards', async ({ page }) => {
    const errors = await openGostModule(page, 'schematic');
    await page.getByTitle('Новая схема').click();
    await expect(page.locator('.dt-modal')).toContainText('Новый проект — SIPTrace');

    const nameInput = page.locator('.dt-modal input').nth(0);
    const desInput = page.locator('.dt-modal input').nth(1);
    await nameInput.fill('БП_24В');
    await desInput.fill('СИПТ.436210.001');
    await page.locator('.dt-modal').getByRole('button', { name: 'Создать' }).click();
    await page.waitForTimeout(300);

    await expect(page).toHaveURL(/\?module=schematic/);
    await expect(page).toHaveTitle(/БП_24В/);
    await expect(page.locator('.dt-right-sidebar input').first()).toHaveValue('БП_24В');
    await expect(page.locator('.dt-right-sidebar')).toContainText('СИПТ.436210.001 Э3');

    // Convert empty/new schematic to linked PCB -> inherits exact project name
    await page.getByTitle('Преобразовать в печатную плату (Ctrl+B)').click();
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/\?module=pcb/);
    await expect(page).toHaveTitle(/БП_24В/);

    // Create PCB-only project directly inside PCB module
    await page.locator('.dt-menubar').getByText('Файл', { exact: true }).click();
    await page.getByText('Новый проект / Новая плата...').click();
    await expect(page.locator('.dt-modal')).toContainText('Новый проект — SIPTrace');
    await page.locator('.dt-modal input').nth(0).fill('Плата_Датчика');
    await page.locator('.dt-modal').getByRole('button', { name: 'Создать' }).click();
    await page.waitForTimeout(300);
    await expect(page).toHaveTitle(/Плата_Датчика/);

    expect(errors).toEqual([]);
  });
});
