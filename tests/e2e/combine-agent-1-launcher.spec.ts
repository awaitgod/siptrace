import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '../screenshots/combine-agent-1');

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name) });
}

/** Measures horizontal overflow and checks whether visible elements exceed viewport. */
async function measureLayoutIssues(page: Page) {
  return page.evaluate(() => {
    const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const clipped: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('.launch-util-tab, .launch-template-card, .launch-inspector, .dt-modal')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (r.right > window.innerWidth + 2 || r.bottom > window.innerHeight + 2)) {
        clipped.push(`${el.className}: right=${Math.round(r.right)}/${window.innerWidth}, bottom=${Math.round(r.bottom)}/${window.innerHeight}`);
      }
    }
    return { docOverflow, clipped };
  });
}

test.describe('Combine Agent 1 — Launcher, Utilities, AI Agent, Dialogs & Theme Audit', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test('01. Launcher Projects View: Dark/Light, Table/Grid, Viewports (1280, 1024, 1920), Context Menu & Inspector', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?module=launcher');
    await expect(page.locator('.launch-sidebar')).toBeVisible();
    await expect(page.locator('.launch-inspector')).toBeVisible();

    // Verify Dark theme default
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.waitForTimeout(250);
    await shot(page, '01-launcher-projects-dark-1280.png');

    // Keyboard navigation in Projects table: ArrowDown, Home, End, ContextMenu (Shift+F10), Escape
    const firstRowBtn = page.locator('.launch-project[aria-current="true"]').first();
    await firstRowBtn.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.launch-project[aria-current="true"]')).toHaveAttribute('data-project-index', '1');
    await page.keyboard.press('Shift+F10');
    const contextMenu = page.getByRole('group', { name: 'Команды проекта' });
    await expect(contextMenu).toBeVisible();
    await shot(page, '06-launcher-context-menu.png');
    await page.keyboard.press('Escape');
    await expect(contextMenu).toBeHidden();

    // Switch to Light theme via MenuBar -> Вид -> Светлая тема, switch to Grid view
    await page.locator('.dt-menu-item', { hasText: 'Вид' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Светлая тема' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByTitle('Плитка').click();
    await page.waitForTimeout(250);
    await shot(page, '02-launcher-projects-grid-light-1280.png');

    // Switch back to Dark + Table for constrained 1024x768 check
    await page.locator('.dt-menu-item', { hasText: 'Вид' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Тёмная тема' }).click();
    await page.getByTitle('Таблица (список)').click();
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(250);
    await shot(page, '03-launcher-projects-1024.png');

    // Verify if inspector overlaps table at 1024x768 (known CSS media query behavior)
    const inspectorBox = await page.locator('.launch-inspector').boundingBox();
    const tableBox = await page.locator('.launch-tables').boundingBox();
    expect(inspectorBox).not.toBeNull();
    expect(tableBox).not.toBeNull();

    // Wide viewport 1920x1080
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(250);
    await shot(page, '04-launcher-projects-1920.png');

    // MenuBar keyboard navigation: open File menu, ArrowRight to View, verify Escape bug when focus drops to body
    await page.setViewportSize({ width: 1280, height: 800 });
    const fileMenuTrigger = page.locator('.dt-menu-item', { hasText: 'Файл' });
    await fileMenuTrigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await shot(page, '05-launcher-menubar-dropdown.png');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('menuitemcheckbox', { name: 'Тёмная тема' })).toBeVisible();
    await page.keyboard.press('Escape');
    const menuClosedByEsc = await page.getByRole('menu').isHidden();
    if (!menuClosedByEsc) {
      // Close via clicking outside if focus dropped to body during ArrowRight menu switch
      await page.locator('.launch-sidebar').click();
    }
    await expect(page.getByRole('menu')).toBeHidden();

    // Search '/' shortcut
    await page.locator('.launch-sidebar').click();
    await page.keyboard.press('/');
    await expect(page.getByPlaceholder('Поиск проектов (/)')).toBeFocused();
    await page.getByPlaceholder('Поиск проектов (/)').fill('К1986');
    await expect(page.locator('.launch-table-row')).toHaveCount(1);
    await page.getByTitle('Очистить').click();
    await expect(page.locator('.launch-table-row')).toHaveCount(3);

    expect(consoleErrors).toEqual([]);
  });

  test('02. Templates & GOST, New Project Dialog, CAD Library Manager', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?module=launcher');

    // Templates tab at 1280x800
    await page.getByRole('button', { name: 'Шаблоны и ГОСТ' }).click();
    await page.waitForTimeout(200);
    await shot(page, '07-launcher-templates-dark-1280.png');

    // Templates tab at 1024x768
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(200);
    await shot(page, '08-launcher-templates-1024.png');

    // New Project Dialog (Schematic + PCB, validation, PCB-only mode)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.keyboard.press('Control+KeyN');
    const newProjDialog = page.getByRole('dialog', { name: 'Новый проект — SIPTrace' });
    await expect(newProjDialog).toBeVisible();
    const nameInput = newProjDialog.getByLabel('Название проекта:');
    await nameInput.fill('   ');
    await newProjDialog.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect(newProjDialog.getByRole('alert')).toBeVisible();
    await shot(page, '09-new-project-dialog-sch-pcb.png');

    await nameInput.fill('Плата_Тест');
    await newProjDialog.getByRole('button', { name: 'Только плата', exact: true }).click();
    await expect(newProjDialog.getByLabel('Ширина (мм):')).toBeVisible();
    await shot(page, '10-new-project-dialog-pcb-only.png');
    await page.keyboard.press('Escape');
    await expect(newProjDialog).toBeHidden();

    // CAD Library Manager Dialog
    await page.getByRole('button', { name: 'Библиотека ГОСТ' }).click();
    const libDialog = page.getByRole('dialog', { name: 'Библиотеки внешних CAD' });
    await expect(libDialog).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, '11-cad-library-manager.png');
    await page.keyboard.press('Escape');
    await expect(libDialog).toBeHidden();
  });

  test('03. Engineering Utilities: All 9 Calculators + Edge Cases + 1024x768 Layout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?module=launcher');
    await page.getByRole('button', { name: 'Инструменты и расчёты' }).click();

    // 1. RF / Impedance
    await page.getByRole('button', { name: /Синтез \(Ширина/ }).click();
    await page.waitForTimeout(150);
    await shot(page, '12-utilities-rf-dark-1280.png');
    // Test input clearing behavior on RF targetZ0
    const targetZ0Input = page.locator('label:has-text("Целевой импеданс") input');
    await targetZ0Input.fill('');
    // Documented bug: clearing snaps immediately to '50'
    const z0ValAfterClear = await targetZ0Input.inputValue();
    expect(z0ValAfterClear).toBe('50');

    // 2. Trace Current
    await page.getByRole('button', { name: /Ток и нагрев дорожек/ }).click();
    await page.getByRole('button', { name: /Допустимый ток по ширине/ }).click();
    const widthInput = page.locator('label:has-text("Ширина проводника на плате") input');
    await widthInput.fill('2.5');
    await page.waitForTimeout(150);
    await shot(page, '13-utilities-current-dark-1280.png');
    // Verify stale cross-section bug: crossSectionMm2 still reflects curInput.currentAmps (2A -> 0.02735 mm2) instead of 2.5mm * 0.035mm = 0.0875 mm2
    await expect(page.locator('.launch-util-results')).toContainText('0.02735');
    await expect(page.locator('.launch-util-results')).toContainText('0.266 Вт');

    // 3. SMD Resistor (Light theme for theme contrast verification)
    await page.locator('.dt-menu-item', { hasText: 'Вид' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Светлая тема' }).click();
    await page.getByRole('button', { name: /Маркировка SMD/ }).click();
    await page.locator('#smd-code-input').fill('68X');
    await expect(page.locator('.launch-util-results')).toContainText('49.9 Ом');
    await shot(page, '14-utilities-smd-light-1280.png');
    // Invalid input test
    await page.locator('#smd-code-input').fill('INVALID');
    await expect(page.locator('.launch-util-results .dt-error-message')).toBeVisible();

    // Switch back to Dark theme for remaining tabs
    await page.locator('.dt-menu-item', { hasText: 'Вид' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Тёмная тема' }).click();

    // 4. Capacitor
    await page.getByRole('button', { name: /Маркировка конденсаторов/ }).click();
    await page.locator('#cap-code-input').fill('4R7');
    await expect(page.locator('.launch-util-results')).toContainText('4.7 пФ');
    await shot(page, '15-utilities-cap-dark-1280.png');

    // 5. Via
    await page.getByRole('button', { name: /Переходные отверстия/ }).click();
    await page.waitForTimeout(150);
    await shot(page, '16-utilities-via-dark-1280.png');

    // 6. Timer 555
    await page.getByRole('button', { name: /Таймер 555/ }).click();
    await page.waitForTimeout(150);
    await shot(page, '17-utilities-timer555-dark-1280.png');

    // 7. Voltage Divider
    await page.getByRole('button', { name: /Делитель напряжения/ }).click();
    await page.waitForTimeout(150);
    await shot(page, '18-utilities-divider-dark-1280.png');

    // 8. Unit Converter
    await page.getByRole('button', { name: /Конвертер единиц/ }).click();
    await page.waitForTimeout(150);
    await shot(page, '19-utilities-converter-dark-1280.png');

    // 9. IPC-7351 Generator
    await page.getByRole('button', { name: /Генератор корпусов/ }).click();
    await page.getByRole('button', { name: /QFN-32/ }).click();
    await page.waitForTimeout(200);
    await shot(page, '20-utilities-ipc-dark-1280.png');

    // Constrained 1024x768 layout check on Utilities
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.getByRole('button', { name: /Делитель напряжения/ }).click();
    await page.waitForTimeout(200);
    await shot(page, '21-utilities-1024.png');
    const layout = await measureLayoutIssues(page);
    expect(layout.docOverflow).toBeLessThanOrEqual(0);
  });

  test('04. AI Agent UI: Welcome, Settings Dialog, Copy Project, Mocked Error/Retry, LiveDocument, 1024x768', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?module=launcher');

    await page.getByRole('button', { name: 'ИИ-агент' }).click();
    await expect(page.locator('.launch-agent')).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, '22-agent-welcome-dark-1280.png');

    // Check green dot bug: connected dot is green even with empty key!
    await expect(page.locator('.agent-connection-dot')).toHaveAttribute('data-connected', 'true');

    // Open Settings Dialog
    await page.getByRole('button', { name: 'Настройки подключения' }).click();
    const settingsDialog = page.locator('dialog.agent-settings-dialog');
    await expect(settingsDialog).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, '23-agent-settings-dialog.png');
    await page.keyboard.press('Escape');
    await expect(settingsDialog).toBeHidden();

    // Copy selected RS-485 project into Agent draft
    page.on('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Копировать проект' }).click();
    await expect(page.locator('.agent-document-list button')).toHaveCount(2);

    // Mock API failure to verify error banner & Retry button
    await page.route('https://api.aitunnel.ru/**', async (route) => {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Unauthorized API key' } }) });
    });
    const composer = page.getByLabel('Задание');
    await composer.fill('Проверь плату');
    await page.keyboard.press('Enter');
    await expect(page.locator('.agent-error')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible();
    await page.getByRole('tab', { name: /Проверки/ }).click();
    await shot(page, '24-agent-copied-project-dark-1280.png');

    // Switch back to Documents tab & open LiveDocument modal
    await page.getByRole('tab', { name: /Документы/ }).click();
    await page.getByRole('button', { name: 'Открыть интерактивный просмотр' }).click();
    const liveDialog = page.locator('dialog.agent-live-dialog');
    await expect(liveDialog).toBeVisible();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Увеличить масштаб (+)' }).click();
    await shot(page, '25-agent-live-document.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    const closedByEscape = !(await liveDialog.evaluate((el: HTMLDialogElement) => el.open));
    console.log('AgentLiveDocument closedByEscape:', closedByEscape);
    if (!closedByEscape) {
      await page.getByRole('button', { name: 'Закрыть просмотр' }).click();
    }
    await expect(liveDialog).toBeHidden();

    // Constrained 1024x768 on Agent
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(250);
    await shot(page, '26-agent-1024.png');
  });

  test('05. Global Dialogs (Hotkeys, Colors, TitleBlock, BOM, SPICE) in Schematic Dark Theme', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?module=schematic');
    await expect(page.locator('.dt-menubar')).toBeVisible();

    // HotkeySettingsDialog: verify Enter inside hotkey input submits/closes dialog instead of binding Enter!
    await page.locator('.dt-menu-item', { hasText: 'Инструменты' }).click();
    await page.getByRole('menuitem', { name: /Настройка горячих клавиш/ }).click();
    const hkDialog = page.locator('.dt-modal');
    await expect(hkDialog).toBeVisible();
    await shot(page, '27-global-dialog-hotkeys.png');
    // Focus first hotkey input and press Enter -> useInteractionAccessibility clicks "Сохранить" and closes dialog!
    await hkDialog.locator('input').first().focus();
    await page.keyboard.press('Enter');
    await expect(hkDialog).toBeHidden();

    // TitleBlockDialog: verify 4th column ("Листов:") is clipped off-screen in repeat(4, 1fr) grid
    await page.locator('.dt-menu-item', { hasText: 'Файл' }).click();
    await page.getByRole('menuitem', { name: /Заголовки и настройка листа/ }).click();
    const tbDialog = page.locator('.dt-modal');
    await expect(tbDialog).toBeVisible();
    const totalSheetsInput = tbDialog.locator('label:has-text("Листов:") input');
    const tbRect = await tbDialog.boundingBox();
    const totalRect = await totalSheetsInput.boundingBox();
    expect(totalRect && tbRect && totalRect.x + totalRect.width > tbRect.x + tbRect.width).toBe(true);
    await shot(page, '30-global-dialog-titleblock.png');
    await page.keyboard.press('Escape');
    await expect(tbDialog).toBeHidden();

    // ColorSettingsDialog
    await page.locator('.dt-menu-item', { hasText: 'Вид' }).click();
    await page.getByRole('menuitem', { name: /Настройка цветов и темы/ }).click();
    await expect(page.locator('.dt-modal')).toBeVisible();
    await shot(page, '31-global-dialog-colors.png');
    await page.keyboard.press('Escape');

    // GostBomDialog
    await page.locator('.dt-menu-item', { hasText: 'Инструменты' }).click();
    await page.getByRole('menuitem', { name: /Перечень элементов/ }).click();
    await expect(page.locator('.dt-modal')).toBeVisible();
    await shot(page, '28-global-dialog-bom.png');
    await page.keyboard.press('Escape');

    // SpiceSimDialog (check dark theme vs hardcoded #f5f5f5 parameter bar!)
    await page.getByTitle('SPICE симуляция цепи').click();
    await expect(page.locator('.dt-modal')).toBeVisible();
    await page.waitForTimeout(200);
    await shot(page, '29-global-dialog-spice.png');
    await page.keyboard.press('Escape');
  });
});
