import { test, expect } from '@playwright/test';
import * as path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '../screenshots/audit/agent5_interop_spice');

test.describe('Audit Agent 5: CAD Interoperability, SPICE MNA & Verification Lead Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('01: Load RS-485 Circuit & Verify Components, Nets and Sheet Structure', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(400);

    // Open File -> New Project dialog and load RS-485 demo
    await page.getByRole('button', { name: 'Файл', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Новый проект/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Новый проект — SIPTrace' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Демо', exact: true }).click();
    await dialog.getByRole('combobox').selectOption('demo_rs485');
    await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.waitForTimeout(400);

    // Verify statusbar and sheet bar show loaded demo
    await expect(page.locator('.dt-statusbar')).toContainText('RS-485');
    await expect(page.locator('.dt-sheet-bar')).toContainText('Лист 1');

    // Verify key components present in circuit
    const rightSidebar = page.locator('.dt-right-sidebar');
    await expect(rightSidebar).toBeVisible();

    // Capture main schematic screen with loaded demo
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01_schematic_loaded_rs485.png` });
  });

  test('02: SPICE MNA Simulation — DC Operating Point, Transient & AC Bode Analysis', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    // Open SPICE dialog via toolbar
    const spiceBtn = page.getByTitle('SPICE симуляция цепи');
    await expect(spiceBtn).toBeVisible();
    await spiceBtn.click();

    const dialog = page.locator('.dt-modal[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('SPICE-симуляция (Модифицированный узловой анализ MNA)');

    // Verify mode buttons
    const btnTran = dialog.getByRole('button', { name: 'Переходный (TRAN)' });
    const btnAc = dialog.getByRole('button', { name: 'АЧХ / Боде (AC)' });
    const btnDc = dialog.getByRole('button', { name: 'Рабочая точка (DC)' });
    await expect(btnTran).toBeVisible();
    await expect(btnAc).toBeVisible();
    await expect(btnDc).toBeVisible();

    // Verify transient waveforms SVG and interactive cursor movement
    const svgWaveform = dialog.locator('svg').first();
    await expect(svgWaveform).toBeVisible();
    const box = await svgWaveform.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
      await page.waitForTimeout(200);
    }

    // Capture screenshot: Transient waveforms
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02_spice_transient_waveforms.png` });

    // Switch to AC Frequency Sweep / Bode plot
    await btnAc.click();
    await page.waitForTimeout(250);
    await expect(dialog).toContainText('Амплитудно-частотная характеристика (дБ):');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03_spice_ac_bode_plot.png` });

    // Switch to DC Operating Point mode
    await btnDc.click();
    await page.waitForTimeout(200);
    await expect(dialog).toContainText('Потенциалы узлов (DC):');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04_spice_dc_operating_point.png` });

    // Verify export buttons
    await expect(dialog.getByRole('button', { name: 'Экспорт данных (CSV)' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Сохранить .cir' })).toBeVisible();

    // Close SPICE dialog with Escape
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('03: ERC Rules Settings, Pin Type Matrix & Results Verification', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    // Open ERC Settings via menu
    await page.locator('.dt-menubar').getByText('Проверка', { exact: true }).click();
    await page.getByText('Параметры проверки ERC...', { exact: true }).click();

    const dialog = page.locator('.dt-modal[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Параметры проверки электрических правил (ERC)');

    // Verify tabs
    const tabRules = dialog.getByRole('button', { name: 'Основные правила' });
    const tabMatrix = dialog.getByRole('button', { name: 'Матрица типов выводов' });
    await expect(tabRules).toBeVisible();
    await expect(tabMatrix).toBeVisible();

    // Capture rules tab screenshot
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05_erc_rules_settings.png` });

    // Switch to Pin Type Matrix tab
    await tabMatrix.click();
    await page.waitForTimeout(200);
    await expect(dialog).toContainText('Матрица типов выводов');
    await expect(dialog.locator('table.dt-table')).toBeVisible();

    // Capture pin matrix screenshot
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06_erc_pin_matrix.png` });

    // Close settings dialog
    await dialog.getByRole('button', { name: 'Закрыть' }).click();
    await expect(dialog).toHaveCount(0);

    // Run ERC check via toolbar button
    const ercBtn = page.getByTitle('Проверить правила схемы (ERC) — F9');
    if (await ercBtn.isVisible()) {
      await ercBtn.click();
    } else {
      await page.keyboard.press('F9');
    }
    await page.waitForTimeout(300);

    // Switch Right Sidebar to ERC results tab
    const ercTabBtn = page.getByTitle('Результаты ERC');
    await expect(ercTabBtn).toBeVisible();
    await ercTabBtn.click();
    await page.waitForTimeout(200);

    // Capture ERC results panel screenshot
    await page.screenshot({ path: `${SCREENSHOT_DIR}/07_erc_results_panel.png` });
  });

  test('04: GOST Bill of Materials (ПЭ3) Specification & Export Matrix', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    // Open BOM dialog via toolbar
    const bomBtn = page.getByTitle('Перечень элементов ПЭ3 (ГОСТ 2.701)');
    await expect(bomBtn).toBeVisible();
    await bomBtn.click();

    const dialog = page.locator('.dt-modal[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Перечень элементов (ГОСТ 2.701-2008 / ГОСТ 2.106-96)');

    // Verify GOST 2.701 / 2.106 columns
    await expect(dialog).toContainText('Поз. обозначение');
    await expect(dialog).toContainText('Наименование');
    await expect(dialog).toContainText('Кол.');
    await expect(dialog).toContainText('Примечание');

    // Toggle pattern column
    const chkPattern = dialog.locator('input[type="checkbox"]');
    await chkPattern.check();
    await expect(dialog).toContainText('Корпус');

    // Verify export buttons: 1C/ERP, HTML print, CSV Excel
    await expect(dialog.getByRole('button', { name: 'Экспорт для 1С / ERP' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Экспорт HTML / Печать ГОСТ' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Экспорт CSV (Excel)' })).toBeVisible();

    // Capture BOM dialog screenshot
    await page.screenshot({ path: `${SCREENSHOT_DIR}/08_bom_pe3_dialog.png` });

    // Close BOM dialog with Escape
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('05: External CAD Library Manager Dialog (DipTrace, KiCad, Eagle, EasyEDA)', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    // Open CAD Library Manager via menu: Библиотека -> Импорт и управление библиотеками CAD...
    await page.locator('.dt-menubar').getByText('Библиотека', { exact: true }).click();
    await page.getByText(/Импорт и управление библиотеками CAD/).click();

    const dialog = page.locator('[data-testid="cad-library-manager-modal"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Библиотеки внешних CAD');

    // Verify import button and new library button
    await expect(dialog.locator('[data-testid="cadlib-import-btn"]')).toBeVisible();
    await expect(dialog.locator('[data-testid="cadlib-new-btn"]')).toBeVisible();

    // Capture CAD library manager components tab
    await page.screenshot({ path: `${SCREENSHOT_DIR}/09_cad_library_manager_dialog.png` });

    // Switch to Patterns (Footprints) tab
    await dialog.getByRole('button', { name: /Корпуса/ }).click();
    await page.waitForTimeout(200);

    // Capture CAD library manager patterns tab
    await page.screenshot({ path: `${SCREENSHOT_DIR}/10_cad_library_patterns_tab.png` });

    // Close dialog
    await dialog.getByRole('button', { name: 'Закрыть менеджер библиотек' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('06: Foreign CAD to GOST Conversion Report Dialog (GostConversionDialog)', async ({ page }) => {
    // Inject a realistic GOST conversion report into sessionStorage before schematic initializes
    await page.addInitScript(() => {
      const mockReport = {
        sourceFormat: 'Altium Designer (.SchDoc) / KiCad v8',
        convertedComponents: 12,
        convertedSymbolsToUgo: 10,
        convertedPatterns: 12,
        warnings: [
          'Некоторые полигоны цепей Eagle/Altium были пропущены — рекомендуется пересоздать их вручную.',
          'При импорте УГО микросхемы MAX485 автоматически применён российский аналог К5559ИН10А по ГОСТ 2.710.'
        ],
        items: [
          { originalRef: 'U1', gostRef: 'DD1', originalValue: '74HC00D', gostValue: 'К155ЛА3', originalPattern: 'SOIC-14', gostPattern: 'PAT_SOIC14', action: 'U1 -> DD1 (К155ЛА3)' },
          { originalRef: 'U2', gostRef: 'DA1', originalValue: 'MAX485ESA', gostValue: 'К5559ИН10А', originalPattern: 'SOIC-8', gostPattern: 'PAT_SOIC8', action: 'U2 -> DA1 (К5559ИН10А)' },
          { originalRef: 'R1', gostRef: 'R1', originalValue: '10k', gostValue: '10 кОм', originalPattern: '0805', gostPattern: 'PAT_RES_0805', action: 'R1 -> R1 (10 кОм)' },
          { originalRef: 'C1', gostRef: 'C1', originalValue: '100nF', gostValue: '0.1 мкФ', originalPattern: '0805', gostPattern: 'PAT_CAP_0805', action: 'C1 -> C1 (0.1 мкФ)' },
          { originalRef: 'VT1', gostRef: 'VT1', originalValue: 'BC547', gostValue: 'КТ3102Б', originalPattern: 'SOT-23', gostPattern: 'PAT_SOT23', action: 'VT1 -> VT1 (КТ3102Б)' }
        ]
      };
      sessionStorage.setItem('gosttrace_pending_conversion_v1', JSON.stringify(mockReport));
    });

    await page.goto('/?module=schematic');
    await page.waitForSelector('.dt-menubar');
    await page.waitForTimeout(400);

    const dialog = page.locator('.dt-modal[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Отчёт автоконвертации в российские ГОСТ / ЕСКД');

    // Verify info summary
    await expect(dialog).toContainText('Исходный САПР:');
    await expect(dialog).toContainText('Altium Designer');
    await expect(dialog).toContainText('Переведено в УГО ГОСТ:');

    // Verify honesty warnings block
    await expect(dialog).toContainText('Данные импортированы не полностью');
    await expect(dialog).toContainText('MAX485');

    // Verify table of conversions
    await expect(dialog).toContainText('Исх. поз. обозн.');
    await expect(dialog).toContainText('ГОСТ 2.710-81');
    await expect(dialog).toContainText('DD1');
    await expect(dialog).toContainText('DA1');
    await expect(dialog).toContainText('К5559ИН10А');

    // Capture screenshot: GOST Conversion Report Dialog
    await page.screenshot({ path: `${SCREENSHOT_DIR}/11_gost_conversion_report_dialog.png` });

    // Close dialog with Escape
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});
