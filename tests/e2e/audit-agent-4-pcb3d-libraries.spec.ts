import { expect, test, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { readFile } from 'node:fs/promises';
import { createDemoRs485Pcb } from '../../src/gost/demoProjects';

const SCREENSHOT_DIR = path.resolve('tests/screenshots/audit/agent4_pcb3d_libraries');

async function seedPcbProject(page: Page) {
  const pcb = createDemoRs485Pcb();
  pcb.soldermaskColor = '#1b6b33';
  pcb.surfaceFinish = 'ENIG';
  await page.addInitScript((project: unknown) => {
    localStorage.setItem('gosttrace_active_pcb_v2', JSON.stringify(project));
  }, pcb);
}

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.describe('SUBAGENT 4: 3D MCAD & Component / Pattern Library Editors Comprehensive Audit', () => {

  test('1. 3D MCAD Viewer: Camera controls, view presets, raycasting component inspection and STEP/DXF export', async ({ page }) => {
    await seedPcbProject(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?module=pcb3d');

    const canvas = page.getByRole('img', { name: '3D-модель печатной платы' });
    await expect(canvas).toBeVisible();

    // Verify statusbar telemetry
    const statusbar = page.locator('.dt-statusbar');
    await expect(statusbar).toContainText('FPS');
    await expect(statusbar).toContainText('треуг');
    await expect(statusbar).toContainText('Плата:');
    await expect(statusbar).toContainText('Компонентов:');

    // 1. Initial Isometric 3D View
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_pcb3d_isometric_view.png') });

    // 2. Camera mouse orbit rotation test
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 - 80, { steps: 8 });
      await page.mouse.up({ button: 'left' });
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_pcb3d_rotated_orbit.png') });

    // 3. View Presets: Top, Bottom, Side, Left, Right, Isometric
    // Top View
    await page.getByRole('button', { name: 'Сверху' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_pcb3d_top_view.png') });

    // Bottom View
    await page.getByRole('button', { name: 'Снизу' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_pcb3d_bottom_view.png') });

    // Side View
    await page.getByRole('button', { name: 'Сбоку' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_pcb3d_side_view.png') });

    // Left View
    await page.getByRole('button', { name: 'Слева' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_pcb3d_left_view.png') });

    // Right View
    await page.getByRole('button', { name: 'Справа' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_pcb3d_right_view.png') });

    // Return to Isometric View
    await page.getByRole('button', { name: 'Изометрия' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_pcb3d_restored_isometric.png') });

    // 4. Raycasting Component Inspection on Click
    // Switch to Top view for predictable raycasting intersection onto U2 / DA1
    await page.getByRole('button', { name: 'Сверху' }).click();
    await page.waitForTimeout(300);

    const cbox = await canvas.boundingBox();
    expect(cbox).not.toBeNull();
    if (cbox) {
      // U2 is at x=34, y=31 (board center cx=45, cy=27.5). Center-left click hits U2 component body
      await page.mouse.click(cbox.x + cbox.width * 0.44, cbox.y + cbox.height * 0.52);
    }
    await page.waitForTimeout(400);

    // Inspector floating panel should be visible
    const inspector = page.getByTestId('pcb3d-component-inspector');
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText(/Корпус:/);
    await expect(inspector).toContainText(/Координаты:/);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_pcb3d_raycast_component_inspection.png') });

    // Dismiss inspector
    await inspector.getByRole('button', { name: 'Закрыть инспекцию' }).click();
    await expect(inspector).not.toBeVisible();

    // 5. STEP AP214 and DXF Mechanical CAD Model Exports
    // STEP Export
    const stepBtn = page.getByRole('button', { name: 'Экспорт STEP' });
    await expect(stepBtn).toBeVisible();
    const [stepDownload] = await Promise.all([
      page.waitForEvent('download'),
      stepBtn.click()
    ]);
    expect(stepDownload.suggestedFilename()).toMatch(/\.stp$/i);
    const stepPath = await stepDownload.path();
    const stepContent = (await readFile(stepPath)).subarray(0, 120).toString('latin1');
    expect(stepContent).toMatch(/^ISO-10303-21;/);

    // DXF Export
    const dxfBtn = page.getByRole('button', { name: 'Экспорт DXF' });
    await expect(dxfBtn).toBeVisible();
    const [dxfDownload] = await Promise.all([
      page.waitForEvent('download'),
      dxfBtn.click()
    ]);
    expect(dxfDownload.suggestedFilename()).toMatch(/\.dxf$/i);
    const dxfPath = await dxfDownload.path();
    const dxfContent = (await readFile(dxfPath)).subarray(0, 120).toString('latin1');
    expect(dxfContent).toContain('SECTION');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_pcb3d_export_completed.png') });
  });

  test('2. Component Editor: Pin Manager, pin types, GOST name/refdes editing and IC Wizard', async ({ page }) => {
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?module=componentEditor');
    await expect(page).toHaveTitle(/Редактор компонентов/);

    // Initial Component Editor screen
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_component_editor_initial.png') });

    // Edit Component properties (Name, RefDes prefix, Default value, Standard)
    const nameInput = page.locator('.dt-left-sidebar label:has-text("Наименование:") input');
    await nameInput.fill('К140УД7_ГОСТ');

    const prefixInput = page.locator('.dt-left-sidebar label:has-text("Префикс ГОСТ:") input');
    await prefixInput.fill('DA');

    const valInput = page.locator('.dt-left-sidebar label:has-text("Номинал по ум.:") input');
    await valInput.fill('К140УД7');

    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_component_properties_edited.png') });

    // Open Quick Pin Range Dialog (+ Диапазон...)
    const rangeBtn = page.getByRole('button', { name: '+ Диапазон...' });
    await expect(rangeBtn).toBeVisible();
    await rangeBtn.click();
    await page.waitForTimeout(200);

    const rangeDialog = page.getByRole('dialog', { name: 'Быстрый ввод диапазона выводов' });
    await expect(rangeDialog).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_component_pin_range_dialog.png') });

    // Add pins IN1..IN4
    const rangeInput = rangeDialog.locator('input[placeholder="D0..D7"]');
    await rangeInput.fill('IN1..IN4');
    await rangeDialog.getByRole('button', { name: 'Добавить выводы' }).click();
    await page.waitForTimeout(200);

    // Verify pins added in Pin Manager table
    const pinRows = page.locator('.dt-right-sidebar table.dt-table tbody tr');
    const pinCount = await pinRows.count();
    expect(pinCount).toBeGreaterThanOrEqual(4);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_component_pins_added.png') });

    // Select first pin and configure electrical type and orientation
    const firstPinRow = pinRows.first();
    await firstPinRow.click();
    const typeSelect = firstPinRow.locator('select[aria-label^="Электрический тип"]');
    await typeSelect.selectOption('Power');
    await page.waitForTimeout(150);

    // Renumber pins 1..N
    await page.getByRole('button', { name: '1..N' }).click();
    await page.waitForTimeout(100);

    // Sort pins
    const sortBtn = page.getByRole('button', { name: /Сорт:/ });
    await sortBtn.click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '15_component_pin_types_configured.png') });

    // Open IC Wizard (Мастер создания УГО ИМС) from Библиотека menu
    await page.getByRole('button', { name: 'Библиотека' }).click();
    await page.getByRole('menuitem', { name: /Мастер создания УГО ИМС/ }).click();
    await page.waitForTimeout(200);

    const icDialog = page.getByRole('dialog', { name: /Мастер создания УГО микросхемы/ });
    await expect(icDialog).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '16_component_ic_wizard_dialog.png') });

    // Fill IC Wizard fields and create symbol
    const icNameInput = icDialog.locator('label:has-text("Наименование ИМС:") input');
    await icNameInput.fill('К561ЛА7');
    await icDialog.getByRole('button', { name: 'Создать УГО' }).click();
    await page.waitForTimeout(300);
    await expect(icDialog).not.toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '17_component_ic_wizard_created.png') });
  });

  test('3. Pattern Editor: IPC-7351 parametric generator (SOIC-8 and QFP-32) and DRC verification', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?module=patternEditor');
    await expect(page).toHaveTitle(/Редактор корпусов/);

    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '18_pattern_editor_initial.png') });

    // 1. Open Parametric Generator Modal
    const genBtn = page.getByRole('button', { name: 'Генератор корпусов (IPC-7351)...' });
    await expect(genBtn).toBeVisible();
    await genBtn.click();
    await page.waitForTimeout(200);

    const genModal = page.locator('.dt-modal');
    await expect(genModal).toBeVisible();
    await expect(genModal).toContainText('Параметрический генератор корпусов (IPC-7351 / ГОСТ)');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '19_pattern_generator_modal.png') });

    // 2. Generate SOIC-8
    const presetSelect = genModal.locator('label:has-text("Быстрый выбор типоразмера") select');
    await presetSelect.selectOption('GW_SOIC-8');
    await page.waitForTimeout(200);

    // Verify SOIC-8 parameters populated
    const nameInput = genModal.locator('label:has-text("Название корпуса:") input');
    await expect(nameInput).toHaveValue('SOIC-8');
    const pitchInput = genModal.locator('label:has-text("Шаг выводов e") input');
    await expect(pitchInput).toHaveValue('1.27');
    const padWInput = genModal.locator('label:has-text("Ширина площадки") input');
    await expect(padWInput).toHaveValue('1.55');
    const padHInput = genModal.locator('label:has-text("Высота площадки") input');
    await expect(padHInput).toHaveValue('0.65');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '20_pattern_generator_soic8_inputs.png') });

    // Click Generate
    await genModal.getByRole('button', { name: 'Сгенерировать корпус' }).click();
    await page.waitForTimeout(300);
    await expect(genModal).not.toBeVisible();

    // Verify SOIC-8 pads in table
    const soicPads = page.locator('.dt-right-sidebar table.dt-table tbody tr');
    expect(await soicPads.count()).toBe(8);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '21_pattern_editor_soic8_generated.png') });

    // 3. Open Parametric Generator again and generate QFP-32
    await genBtn.click();
    await page.waitForTimeout(200);
    await expect(genModal).toBeVisible();

    // Select QFP-32 preset
    await presetSelect.selectOption('QFP_QFP-32_0.8');
    await page.waitForTimeout(200);

    // Verify QFP-32 inputs populated
    await expect(nameInput).toHaveValue('QFP-32_0.8');
    await expect(pitchInput).toHaveValue('0.8');
    await expect(padWInput).toHaveValue('1.5');
    await expect(padHInput).toHaveValue('0.5');
    const pinsInput = genModal.locator('label:has-text("Количество выводов:") input');
    await expect(pinsInput).toHaveValue('32');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '22_pattern_generator_qfp32_inputs.png') });

    // Click Generate
    await genModal.getByRole('button', { name: 'Сгенерировать корпус' }).click();
    await page.waitForTimeout(300);
    await expect(genModal).not.toBeVisible();

    // Verify 32 pads in table
    const qfpPads = page.locator('.dt-right-sidebar table.dt-table tbody tr');
    expect(await qfpPads.count()).toBe(32);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '23_pattern_editor_qfp32_generated.png') });

    // 4. Verify Pattern via IPC-7351 / ГОСТ DRC
    const verifyBtn = page.getByRole('button', { name: 'Проверить корпус' });
    await expect(verifyBtn).toBeVisible();
    await verifyBtn.click();
    await page.waitForTimeout(200);

    const checkModal = page.getByRole('dialog', { name: 'Проверка корпуса' });
    await expect(checkModal).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '24_pattern_verification_dialog.png') });

    await checkModal.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await page.waitForTimeout(200);
    await expect(checkModal).not.toBeVisible();
  });
});
