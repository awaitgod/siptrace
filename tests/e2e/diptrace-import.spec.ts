import { expect, test } from '@playwright/test';

test('corrupted DipTrace binary schematic is rejected visibly without crashing editor', async ({ page }) => {
  await page.goto('/?module=schematic');
  const choose = page.waitForEvent('filechooser');
  await page.locator('button[title="Открыть схему (.gostsch / .dch)"]').click();
  await (await choose).setFiles({ name: 'example.dch', mimeType: 'application/octet-stream', buffer: Buffer.from([7, 68, 84, 83, 67, 72, 69, 77, 0, 255]) });
  await expect(page.locator('.dt-statusbar')).toContainText(/Ошибка импорта файла|Повреждён|двоичный/i);
  await expect(page).toHaveURL(/module=schematic/);
});
