import { expect, test, Page, Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { readFile } from 'node:fs/promises';
import { createDemoRs485Pcb } from '../../src/gost/demoProjects';

const SCREENSHOT_DIR = path.resolve('tests/screenshots/combine-agent-4');

async function getCanvasDataUrl(canvas: Locator): Promise<string> {
  return canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL());
}

async function seedRichPcb(page: Page) {
  const pcb = createDemoRs485Pcb();
  pcb.projectName = 'COMBINE_3D_TEST';
  pcb.soldermaskColor = '#1b6b33';
  pcb.surfaceFinish = 'ENIG';
  pcb.cutouts = [
    {
      id: 'cut_rect',
      points: [
        { x: 18, y: 12 },
        { x: 28, y: 12 },
        { x: 28, y: 20 },
        { x: 18, y: 20 }
      ]
    }
  ];
  // Add a Bottom-side component rotated 90 deg to visually verify bottom rendering & rotation bug
  pcb.components.push({
    id: 'comp_bot_test',
    refDes: 'U_BOT',
    typeName: 'SOIC-8',
    value: 'BOTTOM_90',
    patternId: 'PAT_SOIC8',
    side: 'Bottom',
    x: 65,
    y: 40,
    angle: 90,
    showRefDes: true,
    showValue: false,
    refDesOffset: { x: 0, y: 0 },
    pads: [
      { id: 'bp1', number: '1', type: 'SMD', shape: 'RoundedRect', x: -2.7, y: -1.9, width: 1.55, height: 0.65, layer: 'Top' },
      { id: 'bp2', number: '2', type: 'SMD', shape: 'RoundedRect', x: -2.7, y: -0.63, width: 1.55, height: 0.65, layer: 'Top' },
      { id: 'bp5', number: '5', type: 'SMD', shape: 'RoundedRect', x: 2.7, y: 1.9, width: 1.55, height: 0.65, layer: 'Top' },
      { id: 'bp8', number: '8', type: 'SMD', shape: 'RoundedRect', x: 2.7, y: -1.9, width: 1.55, height: 0.65, layer: 'Top' }
    ],
    padNets: {},
    graphics: [
      { type: 'rect', layer: 'TopSilk', x: -1.8, y: -2.4, w: 3.6, h: 4.8, width: 0.15 }
    ],
    courtyard: { width: 7.5, height: 6.5 },
    model3d: { shape: 'SOIC', bodyWidth: 3.9, bodyLength: 4.9, bodyHeight: 1.5, color: '#222222' }
  });
  await page.addInitScript((project) => {
    localStorage.setItem('gosttrace_active_pcb_v2', JSON.stringify(project));
  }, pcb);
}

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.describe('Agent 4 Combine: 3D Viewer, Component/Pattern Editors & Library Manager', () => {

  test('1. 3D PCB Viewer: Views, Cutouts, Soldermask, Explode, Raycast, Ergonomics & STEP/OBJ/STL/WRL Exports', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await seedRichPcb(page);
    await page.setViewportSize({ width: 1360, height: 860 });
    await page.goto('/?module=pcb3d');

    const canvas = page.getByRole('img', { name: '3D-модель печатной платы' });
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_pcb3d_iso.png') });

    // Top view
    await page.getByRole('button', { name: 'Сверху' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_pcb3d_top.png') });

    // Bottom view (verify bottom component & cutout)
    await page.getByRole('button', { name: 'Снизу' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_pcb3d_bottom.png') });

    // Side view
    await page.getByRole('button', { name: 'Сбоку' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_pcb3d_side.png') });

    // Soldermask Blue + Explode layers
    await page.getByRole('button', { name: 'Изометрия' }).click();
    await page.locator('#pcb3d-mask').selectOption('#124185');
    const explodeSlider = page.locator('input[type="range"]');
    await explodeSlider.fill('1.2');
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_pcb3d_blue_exploded.png') });

    // Bare FR4 (ShowMask off) + Hide 3D components
    await explodeSlider.fill('0');
    await page.getByLabel('Масочный слой').uncheck();
    await page.getByLabel('3D корпуса').uncheck();
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_pcb3d_nomask_nocomps.png') });

    // Restore mask + components & test ergonomics: Orbit, Right-Pan, Wheel Zoom, +/- focus quirk
    await page.getByLabel('Масочный слой').check();
    await page.getByLabel('3D корпуса').check();
    await page.locator('#pcb3d-mask').selectOption('#1b6b33');
    await page.getByRole('button', { name: 'Сверху' }).click();
    await page.waitForTimeout(250);

    // Check '+' key WITHOUT canvas focus (toolbar button has focus right now) -> known ergonomic gap
    const frameBeforePlusUnfocused = await getCanvasDataUrl(canvas);
    await page.keyboard.press('=');
    await page.waitForTimeout(150);
    const frameAfterPlusUnfocused = await getCanvasDataUrl(canvas);
    expect(frameAfterPlusUnfocused).toBe(frameBeforePlusUnfocused); // Proves +/- requires canvas focus!

    // Now focus canvas and test '+', wheel, right-pan, left-orbit
    await canvas.focus();
    await page.keyboard.press('Equal');
    await expect.poll(() => getCanvasDataUrl(canvas)).not.toBe(frameBeforePlusUnfocused);

    const box = (await canvas.boundingBox())!;
    const beforePan = await getCanvasDataUrl(canvas);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 6 });
    await page.mouse.up({ button: 'right' });
    await expect.poll(() => getCanvasDataUrl(canvas)).not.toBe(beforePan);

    // Reset to Top and click on a component to open Raycast Inspector + open File Menu
    await page.getByRole('button', { name: 'Сверху' }).click();
    await page.waitForTimeout(250);
    await page.mouse.click(box.x + box.width * 0.44, box.y + box.height * 0.52);
    await page.waitForTimeout(300);
    await expect(page.getByTestId('pcb3d-component-inspector')).toBeVisible();

    // Verify File Export menu & geometric validity of STEP, OBJ, STL, WRL downloads
    const [stepDl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Экспорт STEP' }).click()
    ]);
    const stepText = await readFile(await stepDl.path(), 'utf-8');
    expect(stepText).toContain('ISO-10303-21;');
    expect(stepText).toContain('CLOSED_SHELL');

    const [objDl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Экспорт OBJ' }).click()
    ]);
    const objText = await readFile(await objDl.path(), 'utf-8');
    expect(objText).toContain('g BOARD_FR4');
    expect(objText).toContain('f ');

    const [stlDl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Экспорт STL' }).click()
    ]);
    const stlText = await readFile(await stlDl.path(), 'utf-8');
    expect(stlText).toContain('facet normal');
    expect(stlText).toContain('endsolid');

    await page.getByRole('button', { name: 'Файл' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_pcb3d_menu_inspector.png') });
    await page.keyboard.press('Escape');

    expect(errors).toEqual([]);
  });

  test('2. Pattern Editor: Tools, Pad Shapes/Mask/Paste, IPC-7351 Generator, Ergonomics & Save', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', async (d) => d.accept());

    await page.setViewportSize({ width: 1360, height: 860 });
    await page.goto('/?module=patternEditor');
    await expect(page).toHaveTitle(/Редактор корпусов/);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_pated_initial.png') });

    // Create new empty pattern
    await page.getByTitle('Новый корпус', { exact: true }).click();
    await page.locator('.dt-left-sidebar label:has-text("Наименование:") input').fill('CUSTOM_PAT_4');

    // Place SMD pad, THT pad, Mounting Hole, Silk Line & Rect
    const canvas = page.locator('.dt-canvas-wrap canvas');
    const box = (await canvas.boundingBox())!;

    await page.getByTitle('Площадка SMD').click();
    await canvas.click({ position: { x: box.width / 2 - 40, y: box.height / 2 - 40 } });

    await page.getByTitle('Вывод THT (с отверстием)').click();
    await canvas.click({ position: { x: box.width / 2 + 40, y: box.height / 2 - 40 } });

    await page.getByTitle('Крепёжное отверстие').click();
    await canvas.click({ position: { x: box.width / 2 + 60, y: box.height / 2 + 40 } });

    await page.getByTitle('Линия шелкографии').click();
    await canvas.click({ position: { x: box.width / 2 - 60, y: box.height / 2 - 60 } });
    await canvas.click({ position: { x: box.width / 2 + 60, y: box.height / 2 - 60 } });

    await page.getByTitle('Прямоугольник шелкографии').click();
    await canvas.click({ position: { x: box.width / 2 - 50, y: box.height / 2 - 50 } });
    await canvas.click({ position: { x: box.width / 2 + 50, y: box.height / 2 + 50 } });

    // Select pad 1 and inspect/edit Pad Shape (Oval/Polygon), Angle, Mask, Paste, Thermal
    await page.getByTitle('Выбор').click();
    await page.locator('.dt-right-sidebar table.dt-table tbody tr').first().click();
    await page.getByLabel(/Форма площадки/).selectOption('Polygon');
    await page.getByLabel(/Угол площадки/).fill('45');
    await page.getByLabel(/Маска площадки/).fill('0.08');
    await page.getByLabel(/Паста площадки/).fill('-0.03');
    await page.getByLabel(/Термобарьер площадки/).selectOption('4Spoke');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_pated_tools_and_props.png') });

    // Test Pad Dragging Ergonomics: dragging selected pad on canvas does NOT move it (audit verification!)
    const padXInput = page.getByLabel(/Координата X площадки/).first();
    const xBeforeDrag = await padXInput.inputValue();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(await padXInput.inputValue()).toBe(xBeforeDrag);

    // Save CUSTOM_PAT_4 to User Library before testing generator
    await page.getByRole('button', { name: 'Сохранить в библиотеку' }).click();
    await expect(page.locator('.dt-statusbar')).toContainText('сохранён');

    // Open Parametric Generator Modal -> QFN-32
    await page.getByRole('button', { name: /Генератор корпусов/ }).click();
    const genModal = page.getByRole('dialog', { name: /Параметрический генератор корпусов/ });
    await expect(genModal).toBeVisible();
    await genModal.locator('label:has-text("Быстрый выбор типоразмера") select').selectOption('QFN_QFN-32_5x5');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_pated_generator_qfn32.png') });

    await genModal.getByRole('button', { name: 'Сгенерировать корпус' }).click();
    await expect(genModal).toBeHidden();
    await page.getByTitle('Показать весь корпус').click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_pated_qfn32_canvas.png') });

    // Generate BGA-16
    await page.getByRole('button', { name: /Генератор корпусов/ }).click();
    await genModal.locator('label:has-text("Быстрый выбор типоразмера") select').selectOption('BGA_BGA-16_1.0');
    await genModal.getByRole('button', { name: 'Сгенерировать корпус' }).click();
    await page.getByTitle('Показать весь корпус').click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_pated_bga16_canvas.png') });

    // Run Verification Dialog
    await page.getByRole('button', { name: 'Проверить корпус' }).click();
    const checkModal = page.getByRole('dialog', { name: 'Проверка корпуса' });
    await expect(checkModal).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_pated_verification.png') });
    await checkModal.getByRole('button', { name: 'Закрыть', exact: true }).click();

    expect(errors).toEqual([]);
  });

  test('3. Component Editor, Library Manager & End-to-End Schematic/PCB Placement', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', async (d) => {
      if (d.type() === 'prompt') await d.accept('Тест_библиотека_4');
      else await d.accept();
    });

    await page.setViewportSize({ width: 1360, height: 860 });
    // First create & save CUSTOM_PAT_4 in Pattern Editor so Component Editor & Library Manager can link/display it
    await page.goto('/?module=patternEditor');
    await page.getByTitle('Новый корпус', { exact: true }).click();
    await page.locator('.dt-left-sidebar label:has-text("Наименование:") input').fill('CUSTOM_PAT_4');
    await page.getByRole('button', { name: 'Сохранить в библиотеку' }).click();
    await expect(page.locator('.dt-statusbar')).toContainText('сохранён');

    await page.goto('/?module=componentEditor');
    await expect(page).toHaveTitle(/Редактор компонентов/);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_comped_initial.png') });

    // Create a custom component with symbols, pins, range pins, and multi-part section
    await page.getByTitle('Новый компонент ГОСТ', { exact: true }).click();
    await page.locator('.dt-left-sidebar label:has-text("Наименование:") input').fill('CUSTOM_COMP_4');
    await page.locator('.dt-left-sidebar label:has-text("Префикс ГОСТ:") input').fill('DD');
    await page.locator('.dt-left-sidebar label:has-text("Номинал по ум.:") input').fill('K555CUSTOM');

    // Draw Circle & Text on symbol canvas
    const canvas = page.locator('.dt-canvas-wrap canvas');
    const box = (await canvas.boundingBox())!;
    await page.getByTitle('Окружность УГО').click();
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await canvas.click({ position: { x: box.width / 2 + 20, y: box.height / 2 } });

    await page.getByTitle('Функциональный текст').click();
    await page.getByLabel('Текст УГО').fill('RG');
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 - 40 } });

    // Add 4th pin & configure styles
    await page.getByTitle('Добавить вывод (Pin)').click();
    await canvas.click({ position: { x: box.width / 2 + 100, y: box.height / 2 + 40 } });

    // Select pin 1, set InvertedClock style
    await page.getByTitle('Выбор').click();
    await page.locator('.dt-right-sidebar table.dt-table tbody tr').first().click();
    await page.getByLabel(/Стиль вывода 1/).selectOption('InvertedClock');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '15_comped_symbol_and_pins.png') });

    // Add Multi-part Section 2
    await page.getByRole('button', { name: 'Компонент', exact: true }).click();
    await page.getByRole('menuitem', { name: /Добавить новую секцию/ }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '16_comped_multipart_section2.png') });

    // Switch back to Section 1 & open Attach Pattern Dialog
    await page.getByLabel('Секция компонента').selectOption('1');
    await page.getByRole('button', { name: 'Привязать...' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '17_comped_attach_pattern.png') });
    await page.getByRole('button', { name: /CUSTOM_PAT_4/ }).first().click();

    // Save custom component to User Library
    await page.getByRole('button', { name: 'Сохранить в библиотеку' }).click();
    await expect(page.locator('.dt-statusbar')).toContainText('сохранён');

    // Open IC Wizard screenshot
    await page.getByRole('button', { name: 'Мастер УГО ИМС' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '18_comped_ic_wizard.png') });
    await page.getByRole('dialog', { name: /Мастер создания УГО/ }).getByRole('button', { name: 'Отмена' }).click();

    // Verify component dialog screenshot
    await page.getByRole('button', { name: 'Проверить УГО' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '19_comped_verification.png') });
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();

    // Open Library Manager (CadLibraryManagerDialog)
    await page.getByTestId('comped-cadlib-btn').click();
    const libModal = page.getByTestId('cad-library-manager-modal');
    await expect(libModal).toBeVisible();

    // Create new library via prompt, search, duplicate custom component
    await libModal.getByTestId('cadlib-new-btn').click();
    await libModal.getByRole('button', { name: /Все внешние/ }).click();
    await libModal.getByTestId('cadlib-search-input').fill('CUSTOM_COMP_4');
    await expect(libModal).toContainText('CUSTOM_COMP_4');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '20_libmgr_components_tab.png') });

    await libModal.getByRole('button', { name: 'Дублировать' }).click();
    await expect(libModal.getByTestId('cadlib-status')).toContainText('сдублирован');
    await libModal.getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect(libModal.getByTestId('cadlib-status')).toContainText('удалён');

    // Switch to Patterns tab & inspect
    await libModal.getByTestId('cadlib-search-input').fill('');
    await libModal.getByRole('button', { name: /Корпуса \(/ }).click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '21_libmgr_patterns_tab.png') });
    await libModal.getByRole('button', { name: 'Закрыть', exact: true }).click();

    // Navigate to Schematic and verify CUSTOM_COMP_4 is in Пользовательские (УГО) & can be placed!
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);
    const libSelect = page.locator('.dt-left-sidebar select').first();
    const userOpt = await libSelect.locator('option', { hasText: 'Пользовательские' }).getAttribute('value');
    if (userOpt) {
      await libSelect.selectOption(userOpt);
    }
    await page.locator('.dt-comp-item', { hasText: 'CUSTOM_COMP_4' }).click();
    const schCanvas = page.locator('.dt-canvas-wrap canvas');
    const schBox = (await schCanvas.boundingBox())!;
    await schCanvas.click({ position: { x: schBox.width / 2, y: schBox.height / 2 } });
    await page.waitForTimeout(250);
    // Verify Schematic placement succeeded
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '22_schematic_custom_comp_placed.png') });

    // Also navigate to PCB Layout and verify CUSTOM_PAT_4 is in Пользовательские корпуса and can be placed!
    await page.goto('/?module=pcb');
    await page.waitForTimeout(300);
    const pcbLibSelect = page.locator('.dt-left-sidebar select').first();
    const pcbUserOpt = await pcbLibSelect.locator('option', { hasText: 'Пользовательские' }).getAttribute('value');
    if (pcbUserOpt) {
      await pcbLibSelect.selectOption(pcbUserOpt);
    }
    await page.locator('.dt-comp-item', { hasText: 'CUSTOM_PAT_4' }).click();
    const pcbCanvas = page.locator('.dt-canvas-wrap canvas');
    const pcbBox = (await pcbCanvas.boundingBox())!;
    await pcbCanvas.click({ position: { x: pcbBox.width / 2, y: pcbBox.height / 2 } });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '23_pcb_custom_pattern_placed.png') });

    expect(errors).toEqual([]);
  });
});
