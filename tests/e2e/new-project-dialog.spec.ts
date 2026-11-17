import { expect, test } from '@playwright/test';

test('new project dialog contains keyboard focus and restores it on close', async ({ page }) => {
  await page.goto('/?module=schematic');
  const opener = page.locator('button[title="Новая схема"]');
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

test('PCB-only project uses fractional dimensions entered with the keyboard', async ({ page }, info) => {
  await page.goto('/?module=schematic');
  await page.getByTitle('Новая схема', { exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Новый проект — SIPTrace' });
  await dialog.getByRole('button', { name: 'Только плата', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Только плата', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByLabel('Название проекта').fill('   ');
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Введите непустое название проекта.');
  await expect(dialog.getByLabel('Название проекта')).toBeFocused();
  await dialog.getByLabel('Название проекта').fill('Контроль размеров');
  await dialog.getByLabel('Ширина (мм)').fill('51.25');
  await dialog.getByLabel('Высота (мм)').fill('28.5');
  const radius = dialog.getByLabel('Радиус угла (мм)');
  await radius.fill('1.25');
  await page.screenshot({ path: info.outputPath('new-pcb-fractional-dimensions.png') });
  await radius.press('Enter');
  await expect(page).toHaveURL(/module=pcb$/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gosttrace_active_pcb_v2') ?? 'null'));
  const outline: { x: number; y: number }[] = saved.boardOutline;
  const width = Math.max(...outline.map((point) => point.x)) - Math.min(...outline.map((point) => point.x));
  const height = Math.max(...outline.map((point) => point.y)) - Math.min(...outline.map((point) => point.y));
  expect(saved.projectName).toBe('Контроль размеров');
  expect(width).toBeCloseTo(51.25, 2);
  expect(height).toBeCloseTo(28.5, 2);
  expect(outline.length).toBeGreaterThan(4);
});
