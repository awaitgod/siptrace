import { test, expect } from '@playwright/test';

test('the selected theme updates the interface and persists across modules and reloads', async ({ page }) => {
  await page.goto('/?module=schematic');
  await expect.poll(() => page.evaluate(() => document.fonts.check('12px "Inter"', 'Схема') && document.fonts.check('12px OpenGost', 'Схема'))).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.dt-menubar')).toHaveCSS('background-color', 'rgb(23, 28, 33)');
  await expect(page.locator('.dt-prop-val').first()).toHaveCSS('background-color', 'rgb(19, 24, 28)');

  await page.locator('.dt-menubar').getByText('Вид', { exact: true }).click();
  await page.getByText('Настройка цветов и темы (Тёмная / ГОСТ Белая)...').click();
  await page.getByText('Светлая (цветные цепи на светло-сером поле)').click();
  await page.locator('.dt-modal').getByRole('button', { name: 'ОК', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.locator('.dt-menubar').getByText('Вид', { exact: true }).click();
  await page.getByText('Настройка цветов и темы (Тёмная / ГОСТ Белая)...').click();
  await page.getByText('Тёмная (тёмный интерфейс и чёрное поле)').click();
  await page.locator('.dt-modal').getByRole('button', { name: 'ОК', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/?module=pcb');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.dt-right-sidebar')).toHaveCSS('background-color', 'rgb(17, 22, 25)');
  await expect(page.locator('.dt-pcb-quick-settings')).toHaveCSS('background-color', 'rgb(19, 24, 28)');
});

test('dark library and SPICE dialogs keep their content readable', async ({ page }) => {
  await page.goto('/?module=schematic');
  await page.getByTestId('schematic-cadlib-btn').click();
  const dialog = page.getByTestId('cad-library-manager-modal');
  const preview = dialog.getByText('Предпросмотр УГО', { exact: true });
  await expect(preview.locator('..')).toHaveCSS('background-color', 'rgb(19, 24, 28)');
  await expect(dialog.getByTestId('cadlib-status')).toHaveCSS('color', 'rgb(179, 192, 204)');
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByTitle('SPICE симуляция цепи').click();
  await expect(page.locator('.dt-message-success')).toHaveCSS('background-color', 'rgb(37, 55, 44)');
  await expect(page.locator('.dt-message-success')).toHaveCSS('color', 'rgb(213, 239, 219)');
});

test('schematic and preview backgrounds follow the selected color scheme', async ({ page }) => {
  await page.goto('/?module=schematic');
  const canvases = page.locator('.dt-canvas-wrap canvas, #schematic-library .dt-preview-box');
  const colors = async () => canvases.evaluateAll(elements => elements.map(element => {
    const canvas = element as HTMLCanvasElement;
    return Array.from(canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data);
  }));
  const expectBackground = async (rgb: number[]) => {
    await expect.poll(colors).toEqual([rgb, rgb, rgb]);
  };
  await expectBackground([0, 0, 0, 255]);
  const selectScheme = async (label: string) => {
    await page.locator('.dt-menubar').getByText('Вид', { exact: true }).click();
    await page.getByText('Настройка цветов и темы (Тёмная / ГОСТ Белая)...').click();
    await page.getByText(label).click();
    await page.locator('.dt-modal').getByRole('button', { name: 'ОК', exact: true }).click();
  };
  await selectScheme('Светлая (цветные цепи на светло-сером поле)');
  await expectBackground([240, 241, 242, 255]);
  await selectScheme('Чёрно-белая ЕСКД (строго под печать ГОСТ)');
  await expectBackground([255, 255, 255, 255]);
});
