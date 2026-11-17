import { expect, test } from '@playwright/test';
import { fixture } from '../fixtures/editorProject';

test('menus and schematic buttons can be operated with the keyboard', async ({ page }) => {
  await page.goto('/?module=schematic');
  const fileMenu = page.getByRole('button', { name: 'Файл', exact: true });
  await fileMenu.focus();
  await page.keyboard.press('Enter');
  await expect(fileMenu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.dt-dropdown [role^="menuitem"]:focus')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.dt-dropdown [role^="menuitem"]:focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(fileMenu).toHaveAttribute('aria-expanded', 'false');
  await expect(fileMenu).toBeFocused();

  const stampButton = page.getByRole('button', { name: 'Настроить...' });
  await stampButton.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.dt-modal')).toBeVisible();
});

test('file menu is a single tab stop and restores focus after a dialog closes', async ({ page }) => {
  await page.goto('/?module=schematic');
  const file = page.getByRole('button', { name: 'Файл', exact: true });
  const edit = page.getByRole('button', { name: 'Правка', exact: true });
  await file.focus();
  await page.keyboard.press('ArrowUp');
  const rows = page.getByRole('menu').locator('[role^="menuitem"]');
  await expect(rows.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(rows.first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(edit).toBeFocused();
  await expect(file).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(rows.first()).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Новый проект — SIPTrace' });
  await expect(dialog.getByLabel('Название проекта')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(file).toBeFocused();
});

test('keyboard can choose a search result after the first match', async ({ page }) => {
  await page.addInitScript((project) => {
    localStorage.setItem('gosttrace_active_schematic_v2', JSON.stringify(project));
  }, fixture());
  await page.goto('/?module=schematic');
  const opener = page.getByTitle('Найти элемент / цепь (Ctrl+F)', { exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Найти компонент или цепь' });
  const query = dialog.getByRole('textbox');
  await expect(query).toBeFocused();
  await query.fill('1k');
  for (const ref of ['R1', 'R2']) {
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: new RegExp(`Элемент.*${ref}`) })).toBeFocused();
  }
  await page.keyboard.press('Space');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.dt-right-sidebar')).toContainText('R2');
});

test('library headings stay in the reading order and expansion is a keyboard action', async ({ page }) => {
  await page.goto('/?module=schematic');
  const sidebar = page.locator('.dt-left-sidebar');
  const categories = sidebar.getByRole('heading', { name: 'Компоненты (ГОСТ)' });
  const section = sidebar.getByRole('button', { name: 'Установить компонент', exact: true });
  await expect(categories).toBeVisible();
  await expect(categories).not.toHaveAttribute('tabindex', '0');
  await section.focus();
  await page.keyboard.press('Space');
  await expect(section).toHaveAttribute('aria-expanded', 'false');
  await expect(categories).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(categories).toBeVisible();
});
