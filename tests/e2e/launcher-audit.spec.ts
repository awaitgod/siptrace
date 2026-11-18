import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '../screenshots/audit/launcher');

test.describe('SIPTrace Deep Launcher Audit Suite', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('01. Launcher Projects View (Grid & Table, Search, Inspector)', async ({ page }) => {
    await page.goto('/?module=launcher');
    await expect(page.locator('.dt-left-sidebar')).toBeVisible();

    // Verify projects tab is active
    await page.getByRole('button', { name: /^Проекты/ }).click();
    await page.waitForTimeout(300);

    // Screenshot 1: Projects Grid View
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_launcher_projects_grid.png') });

    // Switch to Table view
    const tableBtn = page.getByTitle('Таблица (список)');
    if (await tableBtn.isVisible()) {
      await tableBtn.click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_launcher_projects_table.png') });
    }

    // Switch back to Grid view
    const gridBtn = page.getByTitle('Плитка');
    if (await gridBtn.isVisible()) {
      await gridBtn.click();
      await page.waitForTimeout(200);
    }

    // Test Search input
    const searchInput = page.getByPlaceholder(/Поиск/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill('RS-485');
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_launcher_project_search_filter.png') });
      await searchInput.fill('');
    }
  });

  test('02. Launcher Templates & GOST View', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'Шаблоны и ГОСТ', exact: true }).click();
    await page.waitForTimeout(400);

    // Verify templates view content
    await expect(page.getByText(/ГОСТ/i).first()).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_launcher_templates_gost.png') });
  });

  test('03. Launcher Engineering Utilities (RF, Trace Current IPC-2152, IPC-7351 Generator)', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'Инструменты и расчёты', exact: true }).click();
    await page.waitForTimeout(400);

    // RF Microstrip view
    await expect(page.getByText(/волнового сопротивления/i)).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_launcher_utilities_rf.png') });

    // Switch to Trace Current tab
    await page.getByRole('button', { name: /Ток и нагрев дорожек/i }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_launcher_utilities_trace_current.png') });

    // Switch to IPC-7351 Generator tab
    await page.getByRole('button', { name: /Генератор корпусов IPC-7351/i }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_launcher_utilities_ipc7351.png') });
  });

  test('04. Launcher AI Agent Panel', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'ИИ-агент', exact: true }).click();
    await page.waitForTimeout(600);

    // AI agent panel
    await expect(page.getByRole('button', { name: 'Настройки подключения', exact: true })).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_launcher_agent_panel.png') });
  });

  test('05. Launcher Modals: New Project & Cad Library Manager', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.waitForTimeout(300);

    // Open New Project Dialog
    await page.getByRole('button', { name: 'Создать проект', exact: true }).click();
    const newProjectDialog = page.getByRole('dialog', { name: 'Новый проект — SIPTrace' });
    await expect(newProjectDialog).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_launcher_new_project_dialog.png') });
    await page.keyboard.press('Escape');
    await expect(newProjectDialog).toBeHidden();

    // Open Cad Library Manager Dialog
    await page.getByRole('button', { name: 'Библиотека ГОСТ', exact: true }).click();
    const libManagerDialog = page.getByRole('dialog', { name: 'Библиотеки внешних CAD' });
    await expect(libManagerDialog).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_launcher_cad_library_manager.png') });
    await page.keyboard.press('Escape');
    await expect(libManagerDialog).toBeHidden();
  });
});
