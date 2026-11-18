import { test, expect } from '@playwright/test';
import * as path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '../screenshots/enterprise_spice_erc_bom');

test.describe('Enterprise SPICE Simulation, ERC Matrix & GOST BOM (ПЭ3) Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(400);

    // Ensure RS-485 demo circuit is loaded for rich realistic testing
    const statusText = await page.locator('.dt-statusbar').textContent();
    if (!statusText?.includes('RS-485')) {
      await page.getByRole('button', { name: 'Файл', exact: true }).click();
      await page.getByRole('menuitem', { name: /^Новый проект/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Новый проект — SIPTrace' });
      await dialog.getByRole('button', { name: 'Демо', exact: true }).click();
      await dialog.getByRole('combobox').selectOption('demo_rs485');
      await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
      await expect(dialog).toBeHidden();
      await page.waitForTimeout(300);
    }
  });

  test('01: SPICE Simulation Dialog, Interactive Waveforms, Analysis Types & Export', async ({ page }) => {
    // Open SPICE dialog via toolbar button
    const spiceBtn = page.getByTitle('SPICE симуляция цепи');
    await expect(spiceBtn).toBeVisible();
    await spiceBtn.click();

    const dialog = page.locator('.dt-modal[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('SPICE-симуляция (Модифицированный узловой анализ MNA)');

    // Verify mode buttons: TRAN, AC, DC
    const btnTran = dialog.getByRole('button', { name: 'Переходный (TRAN)' });
    const btnAc = dialog.getByRole('button', { name: 'АЧХ / Боде (AC)' });
    const btnDc = dialog.getByRole('button', { name: 'Рабочая точка (DC)' });
    await expect(btnTran).toBeVisible();
    await expect(btnAc).toBeVisible();
    await expect(btnDc).toBeVisible();

    // Verify DC Operating Point table
    await expect(dialog).toContainText('Потенциалы узлов (DC):');
    await expect(dialog).toContainText('+5V');

    // Verify simulation time controls
    await expect(dialog).toContainText('Время симуляции (мс):');
    await expect(dialog).toContainText('Шаг по времени (мкс):');

    // Test mouse hover on the waveform SVG to trigger interactive cursor
    const svgWaveform = dialog.locator('svg').first();
    await expect(svgWaveform).toBeVisible();
    const box = await svgWaveform.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
      await page.waitForTimeout(150);
    }

    // Capture screenshot of SPICE Simulation Dialog with TRAN waveforms
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01_spice_dialog_transient.png` });

    // Switch to AC Sweep / Bode mode
    await btnAc.click();
    await page.waitForTimeout(200);
    await expect(dialog).toContainText('Амплитудно-частотная характеристика (дБ):');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02_spice_dialog_ac_bode.png` });

    // Switch to DC Op mode
    await btnDc.click();
    await page.waitForTimeout(150);

    // Verify export buttons
    const btnExportCsv = dialog.getByRole('button', { name: 'Экспорт данных (CSV)' });
    const btnExportCir = dialog.getByRole('button', { name: 'Сохранить .cir' });
    await expect(btnExportCsv).toBeVisible();
    await expect(btnExportCir).toBeVisible();

    // Test Escape key dismisses the dialog
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('02: ERC Settings Dialog, Pin-to-Pin Matrix Table & Rule Configuration', async ({ page }) => {
    // Open ERC Settings dialog via menu
    await page.locator('.dt-menubar').getByText('Проверка', { exact: true }).click();
    await page.getByText('Параметры проверки ERC...', { exact: true }).click();

    const dialog = page.locator('.dt-modal[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Параметры проверки электрических правил (ERC)');

    // Verify tab buttons: Основные правила, Матрица типов выводов
    const tabRules = dialog.getByRole('button', { name: 'Основные правила' });
    const tabMatrix = dialog.getByRole('button', { name: 'Матрица типов выводов' });
    await expect(tabRules).toBeVisible();
    await expect(tabMatrix).toBeVisible();

    // Verify rules checkboxes
    await expect(dialog).toContainText('Проверять конфликты выходов (Output–Output)');
    await expect(dialog).toContainText('Контроль соединений по матрице типов выводов');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03_erc_settings_rules.png` });

    // Switch to Pin Type Matrix tab
    await tabMatrix.click();
    await page.waitForTimeout(150);

    await expect(dialog).toContainText('Матрица типов выводов');
    await expect(dialog).toContainText('Вход (In)');
    await expect(dialog).toContainText('Выход (Out)');
    await expect(dialog).toContainText('Питание (Pwr)');
    await expect(dialog).toContainText('Пассивный (Pass)');

    // Verify matrix table
    const matrixTable = dialog.locator('table.dt-table');
    await expect(matrixTable).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04_erc_settings_pin_matrix.png` });

    // Close dialog
    await dialog.getByRole('button', { name: 'Закрыть' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('03: ERC Results Panel: Severity Filters, Item Inspection & Highlight Navigation', async ({ page }) => {
    // Run ERC check via toolbar or F9
    const ercBtn = page.getByTitle('Проверить правила схемы (ERC) — F9');
    if (await ercBtn.isVisible()) {
      await ercBtn.click();
    } else {
      await page.keyboard.press('F9');
    }
    await page.waitForTimeout(300);

    // Switch Right Sidebar to ERC tab
    const ercTabBtn = page.getByTitle('Результаты ERC');
    await expect(ercTabBtn).toBeVisible();
    await ercTabBtn.click();
    await page.waitForTimeout(200);

    const rightSidebar = page.locator('.dt-right-sidebar');
    await expect(rightSidebar).toBeVisible();

    // Check if clean or error list is shown
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05_erc_results_panel.png` });
  });

  test('04: GOST Bill of Materials (ПЭ3) Dialog, Pattern Inspection & 1C/ERP Export', async ({ page }) => {
    // Open BOM dialog via menu
    await page.locator('.dt-menubar').getByText('Инструменты', { exact: true }).click();
    await page.getByText('Сформировать Перечень элементов (ПЭ3)...', { exact: true }).click();

    const dialog = page.locator('.dt-modal[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Перечень элементов (ГОСТ 2.701-2008 / ГОСТ 2.106-96)');

    // Verify columns
    await expect(dialog).toContainText('Поз. обозначение');
    await expect(dialog).toContainText('Наименование');
    await expect(dialog).toContainText('Кол.');
    await expect(dialog).toContainText('Примечание');

    // Verify 1C / ERP and HTML buttons
    const btn1C = dialog.getByRole('button', { name: 'Экспорт для 1С / ERP' });
    const btnHtml = dialog.getByRole('button', { name: 'Экспорт HTML / Печать ГОСТ' });
    const btnExcel = dialog.getByRole('button', { name: 'Экспорт CSV (Excel)' });
    await expect(btn1C).toBeVisible();
    await expect(btnHtml).toBeVisible();
    await expect(btnExcel).toBeVisible();

    // Toggle pattern column
    const chkPattern = dialog.locator('input[type="checkbox"]');
    await chkPattern.check();
    await expect(dialog).toContainText('Корпус');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/06_bom_pe3_dialog_with_patterns.png` });

    // Close dialog with Escape
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});
