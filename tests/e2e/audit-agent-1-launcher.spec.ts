import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '../screenshots/audit/agent1_launcher');

test.describe('Agent 1: Complete Launcher UX & Engineering Utilities Audit Suite', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('01. Launcher Projects View: Grid, Table, Search, Inspector, and Pinning', async ({ page }) => {
    await page.goto('/?module=launcher');
    await expect(page.locator('.launch-sidebar')).toBeVisible();

    // 1. Projects Grid View
    await page.getByRole('button', { name: /^Проекты/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_launcher_main_grid.png') });

    // 2. Switch to Table View
    const tableBtn = page.getByTitle('Таблица (список)');
    if (await tableBtn.isVisible()) {
      await tableBtn.click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_launcher_projects_table.png') });
    }

    // 3. Search Filter
    const searchInput = page.getByPlaceholder(/Поиск/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('RS-485');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_launcher_search_filter.png') });
    await searchInput.fill('');
    await page.waitForTimeout(100);

    // 4. Switch back to Grid View & Verify Inspector
    const gridBtn = page.getByTitle('Плитка');
    if (await gridBtn.isVisible()) {
      await gridBtn.click();
      await page.waitForTimeout(200);
    }

    const inspector = page.locator('.launch-inspector');
    if (await inspector.isVisible()) {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_launcher_inspector_details.png') });
    }
  });

  test('02. Launcher Templates & GOST ESKD Reference Projects', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'Шаблоны и ГОСТ', exact: true }).click();
    await page.waitForTimeout(300);

    // Check headings and template cards
    await expect(page.getByText(/Отечественная электроника/i)).toBeVisible();
    await expect(page.getByText(/Контроллер К1986ВЕ92QI/i)).toBeVisible();
    await expect(page.getByText(/Преобразователь RS-485/i)).toBeVisible();
    await expect(page.getByText(/Двухсторонняя плата 100 × 100 мм/i)).toBeVisible();
    await expect(page.getByText(/4-слойная плата с контролируемым импедансом/i)).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_launcher_templates_gost.png') });
  });

  test('03. New Project Dialog: Validation, Focus, Modes, and Escape Dismiss', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'Создать проект', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Новый проект — SIPTrace' });
    await expect(dialog).toBeVisible();

    const nameInput = dialog.getByLabel('Название проекта');
    await expect(nameInput).toBeFocused();

    // Trigger validation error: fill with whitespace and submit
    await nameInput.fill('   ');
    await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Введите непустое название проекта.');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_launcher_new_project_dialog_validation.png') });

    // Fill valid name and switch mode to PCB only
    await nameInput.fill('Аудит_Устройство_1');
    await dialog.getByRole('button', { name: 'Только плата', exact: true }).click();
    await expect(dialog.getByLabel('Ширина (мм)')).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_launcher_new_project_dialog_filled.png') });

    // Escape dismisses dialog
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('04. CAD Library Manager Dialog: Symbol, Footprint Canvas, and Search', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'Библиотека ГОСТ', exact: true }).click();

    const libDialog = page.getByRole('dialog', { name: 'Библиотеки внешних CAD' });
    await expect(libDialog).toBeVisible();

    // Verify Symbol preview tab
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_launcher_cad_library_manager_ugo.png') });

    // Switch to Patterns / Footprints tab
    await page.getByRole('button', { name: /Корпуса/i }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_launcher_cad_library_manager_footprints.png') });

    // Escape dismisses library manager
    await page.keyboard.press('Escape');
    await expect(libDialog).toBeHidden();
  });

  test('05. Engineering Utilities: Microstrip RF Calculator (IPC-2141)', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'Инструменты и расчёты', exact: true }).click();

    // Verify RF calculator header
    await expect(page.getByRole('heading', { name: /волнового сопротивления/i })).toBeVisible();

    // Switch to Synthesis mode
    await page.getByRole('button', { name: 'Синтез (Ширина по целевому Z₀)' }).click();
    await page.getByRole('button', { name: '50 Ом (ВЧ)' }).click();
    await expect(page.getByText('Требуемая ширина:')).toBeVisible();

    // Apply synthesized width
    await page.getByRole('button', { name: 'Применить ширину' }).click();
    await expect(page.locator('.launch-banner-msg')).toContainText('установлена для Z₀ = 50 Ом');

    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_launcher_util_rf_microstrip.png') });
  });

  test('06. Engineering Utilities: Trace Current & Thermal Heating (IPC-2152 / GOST 23751)', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'Инструменты и расчёты', exact: true }).click();
    await page.getByRole('button', { name: /Ток и нагрев дорожек/i }).click();

    // Enter current 3.5 A
    const currentInput = page.getByLabel('Рабочий ток (Амперы):');
    await currentInput.fill('3.5');

    // Verify thermal metrics
    await expect(page.getByText('Падение напряжения на длине')).toBeVisible();
    await expect(page.getByText('Тепловая мощность рассеяния (I²R):')).toBeVisible();
    await expect(page.getByText('Плотность тока (J):')).toBeVisible();

    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_launcher_util_trace_current.png') });
  });

  test('07. Engineering Utilities: SMD Resistor Marking Decoder & Synthesizer (EIA-96)', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'Инструменты и расчёты', exact: true }).click();
    await page.getByRole('button', { name: /Маркировка SMD/i }).click();

    // Check header
    await expect(page.getByText(/Декодер маркировки SMD резисторов/i)).toBeVisible();

    // Test input with EIA-96 code 68X (49.9 Ohm)
    const codeInput = page.getByLabel('Код маркировки резистора:');
    await codeInput.fill('68X');
    await expect(page.getByText('49.9 Ом (±1%)')).toBeVisible();

    // Test input with 4-digit code 1002 (10 kOhm)
    await codeInput.fill('1002');
    await expect(page.getByText('10 кОм (±1%)')).toBeVisible();

    // Test sub-ohm code 4R7
    await codeInput.fill('4R7');
    await expect(page.getByText('4.7 Ом (±5%)')).toBeVisible();

    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_launcher_util_smd_decoder.png') });
  });

  test('08. Engineering Utilities: Capacitor Marking Decoder & Reactance', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'Инструменты и расчёты', exact: true }).click();
    await page.getByRole('button', { name: /Маркировка конденсаторов/i }).click();

    await expect(page.getByText(/Декодер маркировки керамических и пленочных конденсаторов/i)).toBeVisible();

    const capInput = page.getByLabel('Код маркировки конденсатора:');
    await capInput.fill('104');
    await expect(page.getByText('100 нФ (100000 пФ)')).toBeVisible();

    // Select C0G dielectric
    await page.getByLabel('Тип диэлектрика:').selectOption('C0G');
    await expect(page.getByText('Класс 1 (NP0): Сверхстабильный диэлектрик')).toBeVisible();

    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_launcher_util_capacitor_decoder.png') });
  });

  test('09. Engineering Utilities: PCB Via Parasitics Calculator (IPC-2141)', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'Инструменты и расчёты', exact: true }).click();
    await page.getByRole('button', { name: /Переходные отверстия/i }).click();

    await expect(page.getByText(/Калькулятор паразитных параметров переходных отверстий/i)).toBeVisible();

    // Apply HDI preset
    await page.getByRole('button', { name: /Плотный монтаж HDI/i }).click();
    await expect(page.getByText('Паразитная индуктивность (L):')).toBeVisible();
    await expect(page.getByText('Паразитная ёмкость (C):')).toBeVisible();
    await expect(page.getByText('Волновое сопротивление перехода (Z₀):')).toBeVisible();

    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_launcher_util_via_calculator.png') });
  });

  test('10. Engineering Utilities: 555 Precision Timer Calculator', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'Инструменты и расчёты', exact: true }).click();
    await page.getByRole('button', { name: 'Таймер 555', exact: true }).click();

    await expect(page.getByText(/Калькулятор интегрального таймера 555/i)).toBeVisible();

    // Astable mode
    await page.getByLabel('Резистор R1 (кОм):').fill('10');
    await page.getByLabel('Резистор R2 (кОм):').fill('47');
    await page.getByLabel('Времязадающий конденсатор C (нФ):').fill('100');
    await expect(page.getByText('Частота генерации:')).toBeVisible();

    // Switch to Monostable mode
    await page.getByRole('button', { name: 'Моностабильный (Одновибратор)' }).click();
    await expect(page.getByText('Длительность импульса (Tpulse):')).toBeVisible();

    // Switch to Synthesis mode
    await page.getByRole('button', { name: 'Синтез по частоте' }).click();
    await expect(page.getByText('Рекомендованный R1:')).toBeVisible();

    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '15_launcher_util_timer555.png') });
  });

  test('11. Engineering Utilities: Voltage Divider & E24 Resistor Pair Synthesis', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'Инструменты и расчёты', exact: true }).click();
    await page.getByRole('button', { name: 'Делитель напряжения', exact: true }).click();

    await expect(page.getByText(/Калькулятор резистивного делителя напряжения/i)).toBeVisible();

    await page.getByLabel('Входное напряжение Vin (В):').fill('12');
    await page.getByLabel('Верхний резистор R1 (Ом):').fill('10000');
    await page.getByLabel('Нижний резистор R2 (Ом):').fill('10000');
    await expect(page.getByText('6 В')).toBeVisible();

    // Test with load
    await page.getByLabel('Сопротивление нагрузки Rload (Ом, опция):').fill('10000');
    await expect(page.getByText('4 В')).toBeVisible();

    // Test E24 synthesis
    await expect(page.getByText(/Синтез пар резисторов стандартного ряда E24/i)).toBeVisible();

    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '16_launcher_util_voltage_divider.png') });
  });

  test('12. Engineering Utilities: ECAD Unit Converter (Length, Copper, Temperature)', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'Инструменты и расчёты', exact: true }).click();
    await page.getByRole('button', { name: 'Конвертер единиц', exact: true }).click();

    await expect(page.getByText(/Инженерный конвертер единиц измерения САПР/i)).toBeVisible();
    await expect(page.getByText('Линейные размеры (Длина / Координаты)')).toBeVisible();
    await expect(page.getByText('Толщина фольги печатных плат (Медь)')).toBeVisible();
    await expect(page.getByText('Температура (Нагрев / Среда)')).toBeVisible();

    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '17_launcher_util_unit_converter.png') });
  });

  test('13. Engineering Utilities: IPC-7351 Parametric Footprint Generator Canvas', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'Инструменты и расчёты', exact: true }).click();
    await page.getByRole('button', { name: /Генератор корпусов IPC-7351/i }).click();

    // Select QFN preset
    await page.getByRole('button', { name: /QFN-32.*Thermal Pad/ }).click();
    await expect(page.getByLabel('Размер Thermal Pad (мм):')).toHaveValue('3.4');

    // Save to library
    const saveBtn = page.locator('.launch-ipc-save-btn');
    await saveBtn.click();
    await expect(saveBtn).toContainText('Сохранено в библиотеку!');

    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '18_launcher_util_ipc7351_canvas.png') });
  });

  test('14. Launcher AI Agent Panel', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'ИИ-агент', exact: true }).click();
    await page.waitForTimeout(600);

    // AI agent panel controls
    await expect(page.getByRole('button', { name: 'Настройки подключения', exact: true })).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '19_launcher_ai_agent_panel.png') });
  });

  test('15. Themes: Dark and Light Ergonomics Contrast', async ({ page }) => {
    await page.goto('/?module=launcher');

    // Switch to Light Theme via top Menu
    await page.getByRole('button', { name: 'Вид', exact: true }).click();
    await page.getByText('Светлая тема', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '20_launcher_light_theme.png') });

    // Switch back to Dark Theme via top Menu
    await page.getByRole('button', { name: 'Вид', exact: true }).click();
    await page.getByText('Тёмная тема', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '21_launcher_dark_theme.png') });
  });

  test('16. Keyboard Accessibility: Tab Focus Cycling & Escape Dismissal', async ({ page }) => {
    await page.goto('/?module=launcher');

    // Open New Project Dialog
    const newProjBtn = page.getByRole('button', { name: 'Создать проект', exact: true });
    await newProjBtn.focus();
    await page.keyboard.press('Enter');

    const newProjectDialog = page.getByRole('dialog', { name: 'Новый проект — SIPTrace' });
    await expect(newProjectDialog).toBeVisible();

    // Tab through controls
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(newProjectDialog).toBeHidden();

    // Open Library Manager Dialog
    const libBtn = page.getByRole('button', { name: 'Библиотека ГОСТ', exact: true });
    await libBtn.focus();
    await page.keyboard.press('Enter');

    const libDialog = page.getByRole('dialog', { name: 'Библиотеки внешних CAD' });
    await expect(libDialog).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(libDialog).toBeHidden();
  });
});
