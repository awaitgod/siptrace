import { expect, test } from '@playwright/test';

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
