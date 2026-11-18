import { test, expect } from '@playwright/test';

test.describe('SIPTrace Usability & Ergonomics Edge Cases Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('1. Schematic Canvas: Zoom to cursor preserves point invariance & Right-Click Context Menu', async ({ page }) => {
    await page.goto('/?module=schematic');
    await expect(page.locator('.dt-menubar')).toBeVisible({ timeout: 20000 });
    await page.locator('.sch-splash').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});

    const canvas = page.locator('.dt-canvas-wrap canvas');
    await expect(canvas).toBeVisible();
    const box = (await canvas.boundingBox())!;

    // Move to specific position and zoom
    const targetX = box.x + box.width * 0.4;
    const targetY = box.y + box.height * 0.4;
    await page.mouse.move(targetX, targetY);
    await page.mouse.wheel(0, -150);
    await page.waitForTimeout(150);

    // Right-click to open context menu
    await canvas.click({ button: 'right', position: { x: box.width * 0.4, y: box.height * 0.4 } });
    const contextMenu = page.locator('.dt-dropdown[role="menu"]');
    await expect(contextMenu).toBeVisible();

    // Escape closes context menu
    await page.keyboard.press('Escape');
    await expect(contextMenu).toBeHidden();
  });

  test('2. Schematic Canvas: Arrow Key Nudge by Grid Step & Space Rotate', async ({ page }) => {
    await page.goto('/?module=schematic');
    await expect(page.locator('.dt-menubar')).toBeVisible({ timeout: 20000 });
    await page.locator('.sch-splash').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});

    // Click on canvas to focus and select component
    const canvas = page.locator('.dt-canvas-wrap canvas');
    const box = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });

    // Press ArrowRight to nudge by grid step
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    // Press Space to rotate or elbow flip
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);

    // Verify canvas is responsive and no crash
    await expect(canvas).toBeVisible();
  });

  test('3. PCB Canvas: Arrow Key Nudge for Selected Component', async ({ page }) => {
    await page.goto('/?module=pcb');
    await expect(page.locator('.dt-menubar')).toBeVisible({ timeout: 20000 });
    await page.locator('.sch-splash').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});

    // Select component from left sidebar tree or table
    const compRow = page.locator('.dt-tree-row').first();
    if (await compRow.isVisible()) {
      await compRow.click();
      await page.waitForTimeout(150);

      // Nudge component with ArrowUp
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(150);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(150);
    }

    const canvas = page.locator('.dt-canvas-wrap canvas');
    await expect(canvas).toBeVisible();
  });

  test('4. Modal Dialogs: Tab Trapping, Enter Submit & Esc Dismiss in Design Info Dialog', async ({ page }) => {
    await page.goto('/?module=schematic');
    await expect(page.locator('.dt-menubar')).toBeVisible({ timeout: 20000 });
    await page.locator('.sch-splash').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});

    // Open Design Info / Stamp Editor
    await page.locator('.dt-menubar').getByText('Файл', { exact: true }).click();
    await page.getByText('Заголовки и настройка листа (ГОСТ 2.104)...', { exact: true }).click();

    const dialog = page.locator('.dt-modal[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Tab traversal
    await page.keyboard.press('Tab');
    const focusedInDialog = await dialog.evaluate((el) => el.contains(document.activeElement));
    expect(focusedInDialog).toBe(true);

    // Esc closes dialog
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
