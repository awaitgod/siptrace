import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const APP_ROOT = path.resolve(__dirname, '../..');
const SCREENSHOT_DIR = path.join(APP_ROOT, 'tests', 'screenshots', 'audit', 'pcb');

async function openPcbModule(page: Page, moduleId: 'pcb' | 'pcb3d'): Promise<string[]> {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`console.error: ${msg.text()}`);
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?module=${encodeURIComponent(moduleId)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  return errors;
}

test.describe('SIPTrace Deep PCB & 3D Audit Suite', () => {
  test('1. PCB Module: Ergonomics, Toolbars, Sidebars, Pan/Zoom & Layers Panel', async ({ page }) => {
    const errors = await openPcbModule(page, 'pcb');
    await page.waitForTimeout(400);

    // Verify main components are present
    await expect(page.locator('.dt-menubar')).toBeVisible();
    await expect(page.locator('.dt-toolbar-row')).toBeVisible();
    await expect(page.locator('.dt-left-sidebar')).toBeVisible();
    await expect(page.locator('.dt-right-sidebar')).toBeVisible();
    await expect(page.locator('.dt-canvas-wrap canvas')).toBeVisible();
    await expect(page.locator('.dt-statusbar')).toBeVisible();

    // Verify Title & Status
    await expect(page.locator('.dt-statusbar')).toContainText('ГОСТ 23751');

    // Screenshot 1: Overview
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_pcb_overview.png') });

    // Test Layers panel
    await expect(page.locator('.dt-right-sidebar')).toContainText('Слои');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_pcb_layers_panel.png') });

    // Test mouse wheel zoom on canvas
    const canvas = page.locator('.dt-canvas-wrap canvas');
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(200);

    // Test MMB (Middle Mouse Button) Pan
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 50);
    await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(200);

    // Zoom to fit via Home button
    await page.getByTitle('Показать всю плату (Home)').click();
    await page.waitForTimeout(200);

    expect(errors).toEqual([]);
  });

  test('2. PCB Manual Trace Routing & Via Insertion ergonomics', async ({ page }) => {
    const errors = await openPcbModule(page, 'pcb');
    await page.waitForTimeout(400);

    // Activate manual route tool
    await page.getByTitle(/Ручная трассировка/).click();
    await expect(page.getByTitle(/Ручная трассировка/)).toHaveClass(/active/);

    const canvas = page.locator('.dt-canvas-wrap canvas');
    const box = (await canvas.boundingBox())!;

    // Click near component pad to start route
    const startX = box.x + box.width * 0.45;
    const startY = box.y + box.height * 0.5;
    await page.mouse.click(startX, startY);
    await page.waitForTimeout(150);

    // Move to create 45-degree segment preview
    await page.mouse.move(startX + 60, startY + 40);
    await page.waitForTimeout(200);

    // Screenshot 3: Manual routing preview with 45° bend
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_pcb_manual_routing.png') });

    // Flip elbow with Space
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);

    // Switch layer to insert via (hotkey 2 -> BottomCopper)
    await page.keyboard.press('2');
    await page.waitForTimeout(200);
    await expect(page.locator('.dt-statusbar')).toContainText(/переход/i);

    // Cancel draft with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    expect(errors).toEqual([]);
  });

  test('3. DRC Verification (ГОСТ 23751-86) & Violation Navigation', async ({ page }) => {
    const errors = await openPcbModule(page, 'pcb');
    await page.waitForTimeout(400);

    // Run DRC check
    await page.getByTitle('Проверка DRC (F9)').click();
    await page.waitForTimeout(300);

    // Check status bar and DRC tab in Project Manager
    await expect(page.locator('.dt-statusbar')).toContainText(/Проверка DRC/);
    await expect(page.locator('.dt-right-sidebar')).toContainText(/Менеджер проекта/);

    // Click Manager Tab DRC errors icon
    await page.getByTitle('Ошибки DRC').click();
    await page.waitForTimeout(200);

    // Screenshot 4: DRC Report
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_pcb_drc_report.png') });

    expect(errors).toEqual([]);
  });

  test('4. Copper Pour Dialog & Polygon Options', async ({ page }) => {
    const errors = await openPcbModule(page, 'pcb');
    await page.waitForTimeout(400);

    // Open Copper Pour dialog
    await page.getByTitle('Заливка медным полигоном').click();
    await page.waitForTimeout(300);

    const modal = page.locator('.dt-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Заливка медного полигона');
    await expect(modal).toContainText('Сплошная заливка');

    // Screenshot 5: Copper Pour Dialog
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_pcb_copper_pour_dialog.png') });

    // Close modal
    await modal.getByRole('button', { name: '×' }).click();
    await page.waitForTimeout(200);

    expect(errors).toEqual([]);
  });

  test('5. CAM / Gerber RS-274X, Excellon & CNC G-Code Workbench', async ({ page }) => {
    const errors = await openPcbModule(page, 'pcb');
    await page.waitForTimeout(400);

    // Open CAM dialog
    await page.getByTitle('Экспорт Gerber RS-274X / Сверловка / ЛУТ SVG').click();
    await page.waitForTimeout(400);

    const modal = page.locator('.dt-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Производственные файлы (Gerber RS-274X/X2');

    // Screenshot 6: CAM Gerber preview
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_pcb_cam_gerber_preview.png') });

    // Close CAM dialog
    await modal.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await page.waitForTimeout(200);

    expect(errors).toEqual([]);
  });

  test('6. 3D WebGL PCB Viewer: PBR Materials, Camera Presets, Explode & OrbitControls', async ({ page }) => {
    const errors = await openPcbModule(page, 'pcb3d');
    await page.waitForTimeout(800);

    // Verify 3D canvas is rendered
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // Screenshot 7: Iso view
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_pcb3d_iso_view.png') });

    // Switch to Top view
    await page.getByRole('button', { name: 'Сверху' }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_pcb3d_top_view.png') });

    // Switch to Bottom view
    await page.getByRole('button', { name: 'Снизу' }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_pcb3d_bottom_view.png') });

    // Switch back to Iso and test Explode factor
    await page.getByRole('button', { name: 'Изометрия' }).click();
    await page.waitForTimeout(300);

    const slider = page.locator('input[type="range"]');
    await slider.fill('1.2');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_pcb3d_exploded_layers.png') });

    // Reset explode factor
    await slider.fill('0');
    await page.waitForTimeout(200);

    // Change solder mask color to Blue and enable ENIG gold finish
    await page.locator('select.dt-tb-select').selectOption({ label: 'Синяя' });
    await page.getByLabel('Золото (ENIG)').check();
    await page.waitForTimeout(400);

    // Screenshot 11: Blue mask + ENIG finish
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_pcb3d_blue_mask_enig.png') });

    // Test OrbitControls drag rotation on 3D canvas
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 - 60, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Verify no WebGL crashes occurred
    expect(errors).toEqual([]);
  });
});
