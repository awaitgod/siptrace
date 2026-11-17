import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createDemoRs485Pcb } from '../../src/gost/demoProjects';

const modules = [
  ['schematic', 'Редактор схем'],
  ['pcb', 'Редактор плат'],
  ['componentEditor', 'Редактор компонентов'],
  ['patternEditor', 'Редактор посадочных мест'],
  ['pcb3d', '3D-просмотр платы']
] as const;

for (const [id, label] of modules) {
  test(`launcher opens ${id} from the keyboard and supports browser Back`, async ({ page }) => {
    await page.setViewportSize({ width: 344, height: 266 });
    await page.goto('/');
    const editors = page.getByRole('region', { name: 'Редакторы' });
    await expect(editors.getByRole('button', { name: label, exact: true })).toBeVisible();
    const menu = page.getByRole('button', { name: 'Инструменты', exact: true });
    await menu.focus();
    await page.keyboard.press('Enter');
    for (const [index, [, name]] of modules.entries()) {
      if (index > 0) await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('menuitem', { name, exact: true })).toBeFocused();
      if (name === label) break;
    }
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`module=${id}$`));
    await page.goBack();
    await expect(editors.getByRole('button', { name: label, exact: true })).toBeVisible();
  });
}

for (const [id] of modules) {
  test(`capture ${id} and every top-level menu`, async ({ page }, info) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`/?module=${id}`);
    const triggers = page.locator('.dt-menubar .dt-menu-item');
    await expect(triggers.first()).toBeVisible();
    await page.screenshot({ path: info.outputPath(`${id}.png`) });
    for (const [index, trigger] of (await triggers.all()).entries()) {
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      const menu = page.getByRole('menu').first();
      await expect(menu).toBeVisible();
      await expect(menu).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: info.outputPath(`${id}-menu-${index + 1}.png`) });
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
    }
    expect(pageErrors).toEqual([]);
  });
}

async function getFrame(canvas: Locator) {
  return canvas.evaluate((surface: HTMLCanvasElement) => surface.toDataURL());
}

async function seedBoard(page: Page) {
  const pcb = createDemoRs485Pcb();
  pcb.soldermaskColor = '#427950';
  await page.addInitScript((project) => {
    localStorage.setItem('gosttrace_active_pcb_v2', JSON.stringify(project));
  }, pcb);
}

test('3D camera reacts to keyboard, wheel and drag and can return to its original view', async ({ page }, info) => {
  await seedBoard(page);
  await page.goto('/?module=pcb3d');
  const canvas = page.getByRole('img', { name: '3D-модель печатной платы' });
  await expect(canvas).toBeVisible();
  await expect(page.getByLabel('Маска')).toHaveValue('#427950');
  await canvas.focus();
  await page.keyboard.press('2');
  await canvas.screenshot({ path: info.outputPath('top.png') });
  const top = await getFrame(canvas);
  for (const key of ['ArrowRight', 'Equal']) {
    const before = await getFrame(canvas);
    await page.keyboard.press(key);
    await expect.poll(() => getFrame(canvas)).not.toBe(before);
  }
  await page.keyboard.press('2');
  await expect.poll(() => getFrame(canvas)).toBe(top);
  await canvas.hover();
  await page.mouse.wheel(0, -150);
  await expect.poll(() => getFrame(canvas)).not.toBe(top);
  const beforeDrag = await getFrame(canvas);
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 60, bounds.y + bounds.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => getFrame(canvas)).not.toBe(beforeDrag);
  await page.keyboard.press('Home');
  await expect.poll(() => getFrame(canvas)).not.toBe(top);
  await canvas.screenshot({ path: info.outputPath('isometric.png') });
});

test('3D exports a PNG snapshot and model files through their normal actions', async ({ page }) => {
  await seedBoard(page);
  await page.setViewportSize({ width: 1024, height: 680 });
  await page.goto('/?module=pcb3d');
  await expect(page.getByRole('img', { name: '3D-модель печатной платы' })).toBeVisible();
  const formats = [
    ['Снимок PNG', '.png', /^PNG/],
    ['Экспорт STL', '.stl', /^solid /],
    ['Экспорт STEP', '.stp', /^ISO-10303-21;/],
    ['Экспорт WRL', '.wrl', /^#VRML V2.0 utf8/],
    ['Экспорт OBJ', '.obj', /^#.*OBJ/]
  ] as const;
  for (const [button, extension, header] of formats) {
    const action = page.getByRole('button', { name: button });
    await expect(action).toBeInViewport({ ratio: 1 });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      action.click()
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\${extension}$`));
    const target = await download.path();
    expect((await readFile(target)).subarray(0, 100).toString('latin1')).toMatch(header);
  }
});

test('3D distinguishes a WebGL failure from a ready preview', async ({ page }, info) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type === 'webgl' || type === 'webgl2') return null;
        return Reflect.apply(getContext, this, [type, ...args]);
      }
    });
  });
  await page.goto('/?module=pcb3d');
  await expect(page.getByRole('alert')).toContainText('WebGL 2');
  await expect(page.getByRole('button', { name: 'Снимок PNG' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Экспорт OBJ' })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('webgl-unavailable.png') });
});
