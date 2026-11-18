import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const APP_ROOT = path.resolve(__dirname, '../..');
const SCREENSHOT_DIR = path.join(APP_ROOT, 'tests', 'screenshots', 'audit', 'agent3_pcb');

async function openPcbEditor(page: Page): Promise<string[]> {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('ERR_CONNECTION_REFUSED') && !text.includes('WebSocket')) {
        errors.push(`console.error: ${text}`);
      }
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?module=pcb');
  await expect(page.locator('.dt-menubar')).toBeVisible({ timeout: 30000 });
  await page.locator('.sch-splash').waitFor({ state: 'detached', timeout: 30000 }).catch(() => {});
  return errors;
}

test.describe('AGENT 3: PCB Layout, Interactive Routing, DRC (ГОСТ 23751) & CAM Production Audit', () => {

  test('1. PCB Module Ergonomics, Layers Stack & Multi-Layer Switching', async ({ page }) => {
    const errors = await openPcbEditor(page);
    await page.waitForTimeout(300);

    // Verify main UI landmarks
    await expect(page.locator('.dt-menubar')).toBeVisible();
    await expect(page.locator('.dt-toolbar-row')).toBeVisible();
    await expect(page.locator('.dt-left-sidebar')).toBeVisible();
    await expect(page.locator('.dt-right-sidebar')).toBeVisible();
    await expect(page.locator('.dt-canvas-wrap canvas')).toBeVisible();
    await expect(page.locator('.dt-statusbar')).toContainText('ГОСТ 23751');

    // Screenshot 1: PCB Editor Main Overview
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_pcb_layout_main_overview.png') });

    // Right sidebar: Layers panel
    await expect(page.locator('.dt-right-sidebar')).toContainText('Слои');
    const rightSidebar = page.locator('.dt-right-sidebar');

    // Verify layer presence: Top, Bottom, Silk, Mask, BoardOutline
    await expect(rightSidebar).toContainText('Верхний (Top)');
    await expect(rightSidebar).toContainText('Нижний (Bottom)');
    await expect(rightSidebar).toContainText('Шелкография Верх');
    await expect(rightSidebar).toContainText('Маска Верх');
    await expect(rightSidebar).toContainText('Контур платы');

    // Switch active copper layer via keyboard hotkey '2' or 'b'
    await page.keyboard.press('2');
    await page.waitForTimeout(150);
    await expect(page.getByLabel('Активный слой меди')).toHaveValue('BottomCopper');

    // Switch active copper layer via hotkey '1' or 't'
    await page.keyboard.press('1');
    await page.waitForTimeout(150);
    await expect(page.getByLabel('Активный слой меди')).toHaveValue('TopCopper');

    // Switch layer via UI dropdown in toolbar
    await page.getByLabel('Активный слой меди').selectOption('BottomCopper');
    await page.waitForTimeout(150);
    await expect(page.getByLabel('Активный слой меди')).toHaveValue('BottomCopper');

    // Switch layer back via clicking button in Right Sidebar Layer Stack
    await rightSidebar.getByRole('button', { name: 'Верхний (Top)' }).click();
    await page.waitForTimeout(150);
    await expect(page.getByLabel('Активный слой меди')).toHaveValue('TopCopper');

    // Toggle layer visibility checkbox
    const silkCheck = rightSidebar.locator('input[aria-label="Показывать слой «Шелкография Верх»"]');
    if (await silkCheck.isVisible()) {
      await silkCheck.uncheck();
      await page.waitForTimeout(100);
      await silkCheck.check();
      await page.waitForTimeout(100);
    }

    // Screenshot 2: Layers Panel with switched active layer
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_pcb_layers_panel_verified.png') });

    expect(errors).toEqual([]);
  });

  test('2. Manual Interactive Routing: 45°/90°/Arc Modes, Backspace Undo, Via Insertion & Enter Finish', async ({ page }) => {
    const errors = await openPcbEditor(page);
    await page.waitForTimeout(300);

    // Activate manual routing tool
    await page.getByTitle(/Ручная трассировка/).click();
    await expect(page.getByTitle(/Ручная трассировка/)).toHaveClass(/active/);

    const canvas = page.locator('.dt-canvas-wrap canvas');
    const box = (await canvas.boundingBox())!;

    // 1. Click on canvas to start routing segment
    const startX = box.x + box.width * 0.45;
    const startY = box.y + box.height * 0.45;
    await page.mouse.click(startX, startY);
    await page.waitForTimeout(150);

    // Move to draft first segment
    await page.mouse.move(startX + 50, startY + 30);
    await page.waitForTimeout(150);

    // Cycle angle modes with '/' hotkey: 45° -> 90° -> free -> arc -> 45°
    await page.keyboard.press('/');
    await page.waitForTimeout(100);
    await expect(page.locator('.dt-statusbar')).toContainText(/90°/);

    await page.keyboard.press('/');
    await page.waitForTimeout(100);
    await expect(page.locator('.dt-statusbar')).toContainText(/Свободный угол/);

    await page.keyboard.press('/');
    await page.waitForTimeout(100);
    await expect(page.locator('.dt-statusbar')).toContainText(/дугами|Arc/);

    await page.keyboard.press('/');
    await page.waitForTimeout(100);
    await expect(page.locator('.dt-statusbar')).toContainText(/45°/);

    // Invert elbow with Space
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);

    // Click to commit segment 1
    await page.mouse.click(startX + 50, startY + 30);
    await page.waitForTimeout(150);

    // Move to segment 2
    await page.mouse.move(startX + 90, startY + 70);
    await page.waitForTimeout(150);
    await page.mouse.click(startX + 90, startY + 70);
    await page.waitForTimeout(150);

    // Test Backspace to undo last segment
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(150);

    // Move mouse and insert a Via on the fly using hotkey 'v'
    await page.mouse.move(startX + 80, startY + 50);
    await page.keyboard.press('v');
    await page.waitForTimeout(200);

    // Verify status bar reports via transition to opposite layer
    await expect(page.locator('.dt-statusbar')).toContainText(/переход/i);

    // Screenshot 3: Interactive routing with dynamic via
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_pcb_interactive_routing_via.png') });

    // Move to continue on Bottom layer and finalize route with Enter key!
    await page.mouse.move(startX + 120, startY + 50);
    await page.mouse.click(startX + 120, startY + 50);
    await page.waitForTimeout(150);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Screenshot 4: Trace finished with Enter
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_pcb_trace_finished_enter.png') });

    // Test Right-Click context menu on canvas (outside board in margin)
    await page.mouse.click(box.x + 35, box.y + 35, { button: 'right' });
    await page.waitForTimeout(200);

    const ctxMenu = page.locator('.dt-dropdown[role="menu"]');
    await expect(ctxMenu).toBeVisible();
    await expect(ctxMenu).toContainText(/Ручная трассировка|Параметры заливки/);

    // Screenshot 5: Context Menu
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_pcb_canvas_context_menu.png') });

    // Dismiss context menu with Escape
    await page.keyboard.press('Escape');
    await expect(ctxMenu).toBeHidden();

    expect(errors).toEqual([]);
  });

  test('3. Copper Pour Polygon Dialog, Spoke Thermal Reliefs & Pour Clearance', async ({ page }) => {
    const errors = await openPcbEditor(page);
    await page.waitForTimeout(300);

    // Open Copper Pour dialog from toolbar
    await page.getByTitle('Заливка медным полигоном').click();
    await page.waitForTimeout(300);

    const modal = page.locator('.dt-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Заливка медного полигона');

    // Verify controls in modal
    await expect(modal).toContainText('Сплошная заливка (Solid)');
    await expect(modal).toContainText('4 спицы (4-Spoke)');
    await expect(modal).toContainText('Зазор до меди (мм)');

    // Select Hatch fill and 2-Spoke thermal relief
    const fillSelect = modal.locator('select').nth(2);
    await fillSelect.selectOption('Hatch');

    const thermalSelect = modal.locator('select').nth(3);
    await thermalSelect.selectOption('2Spoke');

    // Screenshot 6: Copper Pour Settings Dialog
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_copper_pour_dialog.png') });

    // Click "Залить по контуру платы"
    const pourBoardBtn = modal.getByRole('button', { name: 'Залить по контуру платы' });
    if (await pourBoardBtn.isEnabled()) {
      await pourBoardBtn.click();
      await page.waitForTimeout(300);
      await expect(modal).toBeHidden();
      await expect(page.locator('.dt-statusbar')).toContainText(/Полигон .* добавлен/);
    } else {
      await modal.getByRole('button', { name: '×' }).click();
    }

    // Screenshot 7: Board with Copper Pour updated
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_copper_pour_on_board.png') });

    expect(errors).toEqual([]);
  });

  test('4. DRC Verification (ГОСТ 23751-86 1-5 Classes), Violation Table & Highlight', async ({ page }) => {
    const errors = await openPcbEditor(page);
    await page.waitForTimeout(300);

    // Open DRC Design Rules & Accuracy Classes dialog via Menu: Проверка -> Настройка классов точности
    await page.getByRole('button', { name: 'Проверка', exact: true }).click();
    await page.waitForTimeout(150);
    await page.getByRole('menuitem', { name: /Настройка классов точности/ }).click();
    await page.waitForTimeout(300);

    const rulesModal = page.locator('.dt-modal');
    await expect(rulesModal).toBeVisible();
    await expect(rulesModal).toContainText('Правила проектирования и классы точности');
    await expect(rulesModal).toContainText('ГОСТ 23751-86');

    // Verify presence of classes 1 to 5 buttons
    for (const cls of [1, 2, 3, 4, 5]) {
      await expect(rulesModal.getByRole('button', { name: new RegExp(`${cls} класс`) })).toBeVisible();
    }

    // Switch to Class 4 preset
    await rulesModal.getByRole('button', { name: /4 класс/ }).click();
    await page.waitForTimeout(150);

    // Screenshot 8: DRC Rules Dialog (ГОСТ 23751)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_drc_rules_gost_dialog.png') });

    // Apply rules
    await rulesModal.getByRole('button', { name: 'Применить' }).click();
    await expect(rulesModal).toBeHidden();

    // Run DRC check via toolbar button (F9)
    await page.getByTitle('Проверка DRC (F9)').click();
    await page.waitForTimeout(300);

    // Right sidebar DRC tab
    await page.getByTitle('Ошибки DRC').click();
    await page.waitForTimeout(200);

    const sidebar = page.locator('.dt-right-sidebar');
    await expect(sidebar).toContainText(/\[DRC-/);

    // Screenshot 9: DRC Violations Report & Highlighted Board
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_drc_violations_highlighted.png') });

    // Click on the first DRC violation error row to center canvas on error marker
    const firstDrcRow = sidebar.locator('.dt-tree-row').filter({ hasText: '[DRC-' }).first();
    if (await firstDrcRow.isVisible()) {
      await firstDrcRow.click();
      await page.waitForTimeout(200);
    }

    expect(errors).toEqual([]);
  });

  test('5. CAM Export Workbench: Gerber RS-274X, Excellon, SVG 1:1, DXF & CNC G-Code', async ({ page }) => {
    const errors = await openPcbEditor(page);
    await page.waitForTimeout(300);

    // Open CAM dialog
    await page.getByTitle('Экспорт Gerber RS-274X / Сверловка / ЛУТ SVG').click();
    await page.waitForTimeout(400);

    const camModal = page.locator('.dt-modal');
    await expect(camModal).toBeVisible();
    await expect(camModal).toContainText('Производственные файлы (Gerber RS-274X/X2');

    // Tab 1: Gerber RS-274X/X2
    await expect(camModal.getByRole('button', { name: /1\. Gerber RS-274X/ })).toBeVisible();
    // Screenshot 10: CAM Gerber Tab
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_cam_gerber_workbench.png') });

    // Tab 2: Excellon Drill
    await camModal.getByRole('button', { name: /2\. Сверловка Excellon/ }).click();
    await page.waitForTimeout(250);
    await expect(camModal).toContainText('METRIC,TZ');
    // Screenshot 11: CAM Excellon Drill Tab
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_cam_excellon_tab.png') });

    // Tab 3: ЛУТ SVG 1:1
    await camModal.getByRole('button', { name: /3\. ЛУТ SVG 1:1/ }).click();
    await page.waitForTimeout(250);
    await expect(camModal).toContainText(/Зеркал/);
    // Screenshot 12: CAM LUT SVG 1:1 Tab
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_cam_lut_svg_tab.png') });

    // Tab 4: DXF Export
    await camModal.getByRole('button', { name: /4\. Экспорт DXF/ }).click();
    await page.waitForTimeout(250);
    await expect(camModal).toContainText('Единицы DXF');
    // Screenshot 13: CAM DXF Tab
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_cam_dxf_tab.png') });

    // Tab 5: CNC G-Code
    await camModal.getByRole('button', { name: /5\. ЧПУ G-Code/ }).click();
    await page.waitForTimeout(300);
    await expect(camModal).toContainText('Постпроцессор');
    await expect(camModal).toContainText('Диаметр гравера');
    await expect(camModal).toContainText('Кадров G-Code');
    // Canvas preview for CNC toolpath
    await expect(camModal.locator('canvas')).toBeVisible();
    // Screenshot 14: CAM CNC G-Code Tab
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_cam_gcode_cnc_tab.png') });

    // Close CAM dialog
    await camModal.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await expect(camModal).toBeHidden();

    expect(errors).toEqual([]);
  });
});
