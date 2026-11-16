import { expect, test } from '@playwright/test';

test('native DipTrace schematic is rejected visibly without opening a false project', async ({ page }) => {
  await page.goto('/?module=launcher');
  const choose = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Открыть...', exact: true }).click();
  await (await choose).setFiles({ name: 'example.dch', mimeType: 'application/octet-stream', buffer: Buffer.from([7, 68, 84, 83, 67, 72, 69, 77, 0, 255]) });
  await expect(page.getByRole('alert')).toContainText('двоичный файл DipTrace');
  await expect(page.getByRole('alert')).toContainText('XML');
  await expect(page).toHaveURL(/module=launcher/);
});
