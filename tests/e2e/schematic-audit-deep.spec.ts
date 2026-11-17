import { test, expect, type Page } from '@playwright/test';

const SCREENSHOT_DIR = 'tests/screenshots/audit/schematic';

async function loadDemo(page: Page, mode = 'demo_rs485') {
  await page.getByRole('button', { name: 'Файл', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Новый проект/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Новый проект — SIPTrace' });
  await dialog.getByRole('button', { name: 'Демо', exact: true }).click();
  await dialog.getByRole('combobox').selectOption(mode);
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test.describe('Deep Audit of Schematic Capture (SIPTrace EDA)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('01: Main Schematic Screen with RS-485 Galvano-isolation Demo', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    await loadDemo(page);
    await page.waitForTimeout(400);

    // Verify main components are present in sidebar and sheet
    await expect(page.locator('.dt-right-sidebar')).toContainText('XP1');
    await expect(page.locator('.dt-sheet-bar')).toContainText('Лист 1');
    await expect(page.locator('.dt-statusbar')).toContainText('Гальваническая развязка RS-485');

    // Screenshot main canvas and layout
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01_schematic_rs485_main.png` });
  });

  test('02: Audit All Top Menus (File, Edit, View, Objects, Check, Library, Tools, Help)', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    const menubar = page.locator('.dt-menubar');
    const menus = [
      { name: 'Файл', filename: '02_menu_file.png' },
      { name: 'Правка', filename: '03_menu_edit.png' },
      { name: 'Вид', filename: '04_menu_view.png' },
      { name: 'Объекты', filename: '05_menu_objects.png' },
      { name: 'Проверка', filename: '06_menu_check.png' },
      { name: 'Библиотека', filename: '07_menu_library.png' },
      { name: 'Инструменты', filename: '08_menu_tools.png' },
      { name: 'Справка', filename: '09_menu_help.png' }
    ];

    for (const m of menus) {
      await menubar.getByText(m.name, { exact: true }).click();
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/${m.filename}` });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }
  });

  test('03: Object Properties Dialog (Свойства объектов)', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    // Select the first component from Project Manager in Right Sidebar
    await page.locator('.dt-right-sidebar .dt-tree-row').first().click();
    await page.waitForTimeout(150);

    // Click "Свойства выделения"
    await page.locator('.dt-right-sidebar').getByRole('button', { name: /^Свойства выделения/ }).click();
    const dialog = page.locator('.dt-modal[role="dialog"]');
    await expect(dialog).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/10_dialog_properties.png` });
    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('04: Bill of Materials PE3 Dialog (Перечень элементов по ГОСТ 2.701 / 2.106)', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    // Load RS-485 demo for comprehensive BOM
    await loadDemo(page);
    await page.waitForTimeout(400);

    // Open BOM dialog
    await page.locator('.dt-menubar').getByText('Инструменты', { exact: true }).click();
    await page.getByText('Сформировать Перечень элементов (ПЭ3)...', { exact: true }).click();

    const dialog = page.locator('.dt-modal[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Перечень элементов');
    await expect(dialog).toContainText('Поз. обозначение');
    await expect(dialog).toContainText('Наименование');
    await expect(dialog).toContainText('Кол.');
    await expect(dialog).toContainText('Примечание');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/11_dialog_bom_pe3.png` });
    await dialog.getByRole('button', { name: 'Закрыть' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('05: Multi-sheet Project Manager Dialog (Листы...)', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    // Click "Листы..." button in sheet bar
    await page.locator('.dt-sheet-bar').getByRole('button', { name: 'Листы...' }).click();

    const dialog = page.locator('.dt-modal');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Управление листами');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/12_dialog_sheets_manager.png` });
    await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('06: SPICE Circuit Simulation Dialog (DC, Transient, AC)', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    // Load RS-485 demo
    await loadDemo(page);
    await page.waitForTimeout(400);

    // Run SPICE simulation
    await page.locator('.dt-menubar').getByText('Проверка', { exact: true }).click();
    await page.getByText('Встроенная SPICE-симуляция (DC + Переходный анализ)...', { exact: true }).click();

    const dialog = page.locator('.dt-modal[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('SPICE-симуляция');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/13_dialog_spice_sim.png` });
    await dialog.getByRole('button', { name: 'Закрыть' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('07: Color Settings and Theme Customization Dialog', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    await page.locator('.dt-menubar').getByText('Вид', { exact: true }).click();
    await page.getByText('Настройка цветов и темы (Тёмная / ГОСТ Белая)...', { exact: true }).click();

    const dialog = page.locator('.dt-modal[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Цветовая схема интерфейса и схемы');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/14_dialog_color_settings.png` });
    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('08: Search and Find Dialog (Ctrl+F)', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    await page.keyboard.press('Control+f');
    const dialog = page.locator('.dt-modal[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Найти компонент или цепь');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/15_dialog_find_ctrl_f.png` });
    await dialog.getByRole('button', { name: 'Закрыть' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('09: Hotkeys Settings Dialog', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    await page.locator('.dt-menubar').getByText('Инструменты', { exact: true }).click();
    await page.getByText('Настройка горячих клавиш...', { exact: true }).click();

    const dialog = page.locator('.dt-modal[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Настройка горячих клавиш');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/16_dialog_hotkeys.png` });
    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('10: ERC Settings Dialog (Параметры проверки ERC)', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    await page.locator('.dt-menubar').getByText('Проверка', { exact: true }).click();
    await page.getByText('Параметры проверки ERC...', { exact: true }).click();

    const dialog = page.locator('.dt-modal[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Параметры проверки электрических правил');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/17_dialog_erc_settings.png` });
    await dialog.getByRole('button', { name: 'Закрыть' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('11: Net Classes Dialog (Классы цепей)', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    await page.locator('.dt-menubar').getByText('Правка', { exact: true }).click();
    await page.getByText('Свойства классов цепей...', { exact: true }).click();

    const dialog = page.locator('.dt-modal[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Классы цепей');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/18_dialog_net_classes.png` });
    await dialog.getByRole('button', { name: 'Закрыть' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('12: Title Block and Sheet Format Dialog (ГОСТ 2.104-2006)', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    await page.locator('.dt-menubar').getByText('Файл', { exact: true }).click();
    await page.getByText('Заголовки и настройка листа (ГОСТ 2.104)...', { exact: true }).click();

    const dialog = page.locator('.dt-modal[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Заголовки и настройка листа');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/19_dialog_title_block.png` });
    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('13: Right-click Context Menu on Component', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    // Click on canvas with right button
    const canvasWrap = page.locator('.dt-canvas-wrap canvas');
    const box = (await canvasWrap.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(200);

    const contextMenu = page.locator('.dt-dropdown[role="menu"]');
    await expect(contextMenu).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/20_context_menu.png` });
    await page.keyboard.press('Escape');
    await expect(contextMenu).toHaveCount(0);
  });

  test('14: MCU K1986BE92QI Demo Project', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    await loadDemo(page, 'demo_mcu');
    await page.waitForTimeout(400);

    await expect(page.locator('.dt-statusbar')).toContainText('Контроллер К1986ВЕ92QI');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/21_schematic_mcu_demo.png` });
  });

  test('15: White Paper GOST Theme View', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    // Switch to GOST white theme
    await page.locator('.dt-menubar').getByText('Вид', { exact: true }).click();
    await page.getByText('Настройка цветов и темы (Тёмная / ГОСТ Белая)...', { exact: true }).click();
    const dialog = page.locator('.dt-modal[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Select White GOST theme radio
    await dialog.getByLabel(/Светлая|Чёрно-белая ЕСКД/i).first().check();
    await dialog.getByRole('button', { name: 'ОК' }).click();
    await page.waitForTimeout(300);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/22_schematic_gost_white.png` });
  });
});
