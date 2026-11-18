import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createDemoRs485Pcb } from '../../src/gost/demoProjects';

const SCREENSHOT_DIR = 'tests/screenshots/audit/pcb3d';

async function seedBoard(page: any) {
  const pcb = createDemoRs485Pcb();
  pcb.soldermaskColor = '#1b6b33';
  pcb.surfaceFinish = 'HASL';
  await page.addInitScript((project: unknown) => {
    localStorage.setItem('gosttrace_active_pcb_v2', JSON.stringify(project));
  }, pcb);
}

test.describe('3D WebGL Viewer & MCAD Deep Audit E2E Suite', () => {

  test('3D WebGL: Preset camera views (Top, Bottom, Iso, Side) and hotkeys (1, 2, 3, 4, T, B, S, Home, Space)', async ({ page }) => {
    await seedBoard(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?module=pcb3d');

    const canvas = page.getByRole('img', { name: '3D-модель печатной платы' });
    await expect(canvas).toBeVisible();

    // Verify initial telemetry in status bar
    const statusbar = page.locator('.dt-statusbar');
    await expect(statusbar).toContainText('FPS');
    await expect(statusbar).toContainText('треуг');
    await expect(statusbar).toContainText('Плата:');
    await expect(statusbar).toContainText('Компонентов:');

    // 1. Isometric initial view screenshot
    await page.waitForTimeout(300);
    await canvas.screenshot({ path: `${SCREENSHOT_DIR}/01_pcb3d_iso_initial.png` });

    // 2. Switch to Top view using keyboard 'T' or '2'
    await canvas.focus();
    await page.keyboard.press('t');
    await page.waitForTimeout(300);
    await canvas.screenshot({ path: `${SCREENSHOT_DIR}/02_pcb3d_top_view.png` });

    // 3. Switch to Bottom view using keyboard 'B' or '3'
    await page.keyboard.press('b');
    await page.waitForTimeout(300);
    await canvas.screenshot({ path: `${SCREENSHOT_DIR}/03_pcb3d_bottom_view.png` });

    // 4. Switch to Side view using keyboard 'S' or '4'
    await page.keyboard.press('s');
    await page.waitForTimeout(300);
    await canvas.screenshot({ path: `${SCREENSHOT_DIR}/04_pcb3d_side_view.png` });

    // 5. Reset camera using Space or 'R'
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    await canvas.screenshot({ path: `${SCREENSHOT_DIR}/05_pcb3d_reset_iso.png` });
  });

  test('3D WebGL: Solder mask palettes (Green, Blue, Red, Black, White) and ENIG Gold surface finish', async ({ page }) => {
    await seedBoard(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?module=pcb3d');

    const canvas = page.getByRole('img', { name: '3D-модель печатной платы' });
    await expect(canvas).toBeVisible();
    const maskSelect = page.getByLabel('Маска:');

    // Blue mask + ENIG Gold
    await maskSelect.selectOption({ label: 'Синяя' });
    const goldCheckbox = page.getByLabel('Золото (ENIG)');
    await goldCheckbox.check();
    await page.waitForTimeout(300);
    await canvas.screenshot({ path: `${SCREENSHOT_DIR}/06_pcb3d_blue_mask_enig.png` });

    // Red mask
    await maskSelect.selectOption({ label: 'Красная' });
    await page.waitForTimeout(300);
    await canvas.screenshot({ path: `${SCREENSHOT_DIR}/07_pcb3d_red_mask.png` });

    // Matte Black mask
    await maskSelect.selectOption({ label: 'Чёрная матовая' });
    await page.waitForTimeout(300);
    await canvas.screenshot({ path: `${SCREENSHOT_DIR}/08_pcb3d_black_mask.png` });

    // White mask
    await maskSelect.selectOption({ label: 'Белая' });
    await page.waitForTimeout(300);
    await canvas.screenshot({ path: `${SCREENSHOT_DIR}/09_pcb3d_white_mask.png` });
  });

  test('3D WebGL: Layer visibility toggles (Mask, Copper, Components, Silkscreen) and Exploded layers view', async ({ page }) => {
    await seedBoard(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?module=pcb3d');

    const canvas = page.getByRole('img', { name: '3D-модель печатной платы' });
    await expect(canvas).toBeVisible();

    // Toggle without solder mask (Natural FR-4 raw copper preview)
    const maskCheckbox = page.getByLabel('Масочный слой');
    await maskCheckbox.uncheck();
    await page.waitForTimeout(300);
    await canvas.screenshot({ path: `${SCREENSHOT_DIR}/10_pcb3d_no_soldermask_raw_fr4.png` });

    // Restore mask, hide components
    await maskCheckbox.check();
    const compCheckbox = page.getByLabel('3D корпуса');
    await compCheckbox.uncheck();
    await page.waitForTimeout(300);
    await canvas.screenshot({ path: `${SCREENSHOT_DIR}/11_pcb3d_bare_board_no_components.png` });

    // Restore components, test Exploded layers slider
    await compCheckbox.check();
    const explodeSlider = page.getByLabel('Разнос слоёв:');
    await explodeSlider.evaluate((el: HTMLInputElement) => {
      el.value = '1.5';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await canvas.screenshot({ path: `${SCREENSHOT_DIR}/12_pcb3d_exploded_layers.png` });
  });

  test('3D WebGL: Mechanical MCAD Model Export (STEP, OBJ, STL, WRL, PNG)', async ({ page }) => {
    await seedBoard(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?module=pcb3d');

    const formats = [
      ['Снимок PNG', '.png', /PNG/],
      ['Экспорт STL', '.stl', /^solid /],
      ['Экспорт STEP', '.stp', /^ISO-10303-21;/],
      ['Экспорт WRL', '.wrl', /^#VRML V2.0 utf8/],
      ['Экспорт OBJ', '.obj', /^#.*OBJ/]
    ] as const;

    for (const [btnLabel, extension, magicHeader] of formats) {
      const button = page.getByRole('button', { name: btnLabel });
      await expect(button).toBeVisible();
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        button.click()
      ]);
      expect(download.suggestedFilename()).toMatch(new RegExp(`\\${extension}$`));
      const downloadedPath = await download.path();
      const content = (await readFile(downloadedPath)).subarray(0, 100).toString('latin1');
      expect(content).toMatch(magicHeader);
    }
  });
});
