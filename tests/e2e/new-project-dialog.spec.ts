import { expect, test } from '@playwright/test';

test('new project dialog contains keyboard focus and restores it on close', async ({ page }) => {
  await page.goto('/?module=launcher');
  const opener = page.getByRole('button', { name: '+ Создать проект...' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Новый проект — SIPTrace' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Название проекта:')).toBeFocused();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
