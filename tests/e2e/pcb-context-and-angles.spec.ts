import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('PCB Ergonomics, Context Menus, Hotkeys & Angle Modes', () => {
  test('context menu on canvas, grid cycling (G) and layer switching (1, 2, B, T)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?module=pcb');
    await expect(page.locator('.dt-menubar')).toBeVisible({ timeout: 30000 });
    await page.locator('.sch-splash').waitFor({ state: 'detached', timeout: 30000 }).catch(() => {});

    const canvas = page.locator('.dt-canvas-wrap canvas');
    await expect(canvas).toBeVisible();

    // 1. Test Grid Cycling with G key
    const initialGrid = await page.getByLabel('Шаг сетки платы').inputValue();
    await canvas.focus();
    await page.keyboard.press('g');
    await page.waitForTimeout(100);
    const nextGrid = await page.getByLabel('Шаг сетки платы').inputValue();
    expect(nextGrid).not.toBe(initialGrid);

    // 2. Test Layer Switching with B / T keys
    await page.keyboard.press('b');
    await page.waitForTimeout(100);
    await expect(page.getByLabel('Активный слой меди')).toHaveValue('BottomCopper');

    await page.keyboard.press('t');
    await page.waitForTimeout(100);
    await expect(page.getByLabel('Активный слой меди')).toHaveValue('TopCopper');

    await page.keyboard.press('2');
    await page.waitForTimeout(100);
    await expect(page.getByLabel('Активный слой меди')).toHaveValue('BottomCopper');

    await page.keyboard.press('1');
    await page.waitForTimeout(100);
    await expect(page.getByLabel('Активный слой меди')).toHaveValue('TopCopper');

    // 3. Test Right-Click Context Menu on Canvas
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + 100, box.y + 100, { button: 'right' });
    await page.waitForTimeout(150);

    const ctxMenu = page.locator('.dt-dropdown[role="menu"]');
    await expect(ctxMenu).toBeVisible();
    await expect(ctxMenu).toContainText(/Ручная трассировка/);
    await expect(ctxMenu).toContainText(/Проверка DRC/);

    // Dismiss with Escape
    await page.keyboard.press('Escape');
    await expect(ctxMenu).toBeHidden();

    // 4. Test Manual Routing & Angle Cycling (Shift+Space, /)
    await page.getByTitle(/Ручная трассировка/).click();
    await page.mouse.click(box.x + 300, box.y + 300);
    await page.waitForTimeout(100);

    // Cycle angle mode with /
    await page.keyboard.press('/');
    await page.waitForTimeout(100);
    await expect(page.locator('.dt-statusbar')).toContainText(/Режим трассировки/);

    // Cancel draft with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  });
});
