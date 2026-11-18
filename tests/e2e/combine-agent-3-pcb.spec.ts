import { test, expect, Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDemoRs485Pcb } from '../../src/gost/demoProjects';
import { PcbProject } from '../../src/core/types';

const APP_ROOT = path.resolve(__dirname, '../..');
const SHOT_DIR = path.join(APP_ROOT, 'tests', 'screenshots', 'combine-agent-3');
const PCB_KEY = 'gosttrace_active_pcb_v2';

function shot(name: string): string {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  return path.join(SHOT_DIR, name);
}

async function openPcb(page: Page, pcb?: PcbProject): Promise<string[]> {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const errors: string[] = [];
  await page.setViewportSize({ width: 1440, height: 900 });
  if (pcb) {
    await page.addInitScript(([key, board]) => {
      if (location.protocol.startsWith('http')) {
        localStorage.setItem(key, JSON.stringify(board));
      }
    }, [PCB_KEY, pcb] as const);
  }
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      await page.goto('/?module=pcb', { waitUntil: 'domcontentloaded' });
      break;
    } catch (err) {
      if (attempt === 14) throw err;
      await page.waitForTimeout(1000);
    }
  }
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('ERR_CONNECTION_REFUSED') && !text.includes('WebSocket')) {
        errors.push(`console.error: ${text}`);
      }
    }
  });
  await expect(page.getByLabel('Редактор топологии печатной платы')).toBeVisible({ timeout: 30000 });
  await page.locator('.sch-splash').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(250);
  return errors;
}

test.describe('Combine Agent 3: Comprehensive PCB Editor, DRC, Copper Pour & CAM E2E Audit', () => {
  test('1. Main PCB Overview, Top Menu Dropdowns, Sidebars (Layers/Options/Objects/Nets) & Units/Measure', async ({ page }) => {
    const errors = await openPcb(page);

    await page.screenshot({ path: shot('01_main_overview.png') });

    // Top menu dropdowns
    for (const [menuName, fileName] of [
      ['Файл', '02_menu_file.png'],
      ['Трассировка', '03_menu_route.png'],
      ['Объекты', '04_menu_objects.png']
    ] as const) {
      await page.getByRole('button', { name: menuName, exact: true }).click();
      await page.waitForTimeout(120);
      await page.screenshot({ path: shot(fileName) });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(80);
    }

    // Right sidebar: Options tab + Nets tab
    const rightSidebar = page.locator('.dt-right-sidebar');
    await rightSidebar.getByRole('button', { name: 'Опции' }).click();
    await rightSidebar.getByTitle('Цепи').click();
    await page.waitForTimeout(150);
    // Highlight GND net (use exact: true so we don't click 'Прошить GND переходами')
    const gndNetBtn = rightSidebar.getByRole('button', { name: 'GND', exact: true });
    if (await gndNetBtn.isVisible()) {
      await gndNetBtn.click();
    }
    await page.waitForTimeout(150);
    await page.screenshot({ path: shot('05_sidebar_options_nets_gnd_highlight.png') });

    // Back to Layers & Components
    await rightSidebar.getByRole('button', { name: 'Слои' }).click();
    await rightSidebar.getByTitle('Компоненты').click();

    // Test StatusBar units toggle (mm -> mil) and Measure ruler
    const statusBar = page.locator('.dt-statusbar');
    await expect(statusBar).toContainText('Ед: мм');
    await statusBar.getByText('Ед: мм').click();
    await expect(statusBar).toContainText('Ед: mil');

    await page.getByTitle('Линейка (измерение)').click();
    const canvas = page.getByLabel('Редактор топологии печатной платы');
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55);
    await page.mouse.up();
    await page.waitForTimeout(150);
    await page.screenshot({ path: shot('06_measure_tool_mil_units.png') });

    // Switch back to mm and select tool
    await statusBar.getByText('Ед: mil').click();
    await statusBar.getByText('Ед: in').click();
    await expect(statusBar).toContainText('Ед: мм');
    await page.keyboard.press('Escape');

    expect(errors).toEqual([]);
  });

  test('2. Component Selection, Drag Move, Rotate (R), Flip Side (F), Context Menus & Interactive Routing with Via', async ({ page }) => {
    const base = createDemoRs485Pcb();
    const errors = await openPcb(page, base);

    const rightSidebar = page.locator('.dt-right-sidebar');
    const firstComp = base.components[0];
    const compRow = rightSidebar.getByRole('button', { name: new RegExp(`^${firstComp.refDes} \\(`) });
    await compRow.click();
    await page.waitForTimeout(150);

    // Rotate with R and Flip side with F
    await page.locator('.dt-canvas-wrap canvas').focus();
    await page.keyboard.press('r');
    await page.waitForTimeout(120);
    await page.keyboard.press('f');
    await page.waitForTimeout(150);
    await expect(page.getByLabel('Сторона компонента')).toHaveValue('Bottom');
    await page.screenshot({ path: shot('07_component_flipped_bottom_rotated.png') });

    // Open Component Context Menu via right-click on the centered component
    const canvas = page.getByLabel('Редактор топологии печатной платы');
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5, { button: 'right' });
    await page.waitForTimeout(150);
    await page.screenshot({ path: shot('08a_context_menu_component.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    // Right click on empty canvas area for canvas context menu
    await page.mouse.click(box.x + 25, box.y + 25, { button: 'right' });
    await page.waitForTimeout(150);
    await page.screenshot({ path: shot('08_context_menu_canvas.png') });
    await page.keyboard.press('Escape');

    // Interactive routing across Top & Bottom with Via (V key), angle cycling (/), Backspace, Enter
    await page.getByTitle(/Ручная трассировка/).click();
    const rx = box.x + box.width * 0.35;
    const ry = box.y + box.height * 0.45;
    await page.mouse.click(rx, ry);
    await page.mouse.move(rx + 60, ry + 35);
    await page.waitForTimeout(120);
    await page.keyboard.press('/');
    await page.waitForTimeout(100);
    await page.keyboard.press('/');
    await page.waitForTimeout(100);
    await page.keyboard.press('/');
    await page.waitForTimeout(100);
    await page.keyboard.press('/');
    await page.waitForTimeout(100);

    // Click second segment point, then press V to insert via & switch to BottomCopper
    await page.mouse.click(rx + 60, ry + 35);
    await page.mouse.move(rx + 120, ry + 70);
    await page.keyboard.press('v');
    await expect(page.getByLabel('Активный слой меди')).toHaveValue('BottomCopper');
    await page.mouse.click(rx + 120, ry + 70);
    await page.mouse.move(rx + 170, ry + 70);
    await page.waitForTimeout(150);
    await page.screenshot({ path: shot('09_interactive_routing_top_via_bottom.png') });

    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });

  test('3. Copper Pour with Cutout & Keepout, Thermal Reliefs, Autoplacer, Autorouter & DRC Click-to-Pan', async ({ page }) => {
    const base = createDemoRs485Pcb();
    // Clear existing traces/pours to test fresh pour + cutout + keepout + autoroute + DRC
    const cleanPcb: PcbProject = {
      ...base,
      traces: [],
      vias: [],
      copperPours: [],
      cutouts: [{ id: 'cut1', points: [{ x: 38, y: 20 }, { x: 48, y: 20 }, { x: 48, y: 30 }, { x: 38, y: 30 }] }],
      keepouts: [{ id: 'ko1', layer: 'AllCopper', kind: 'RouteKeepout', points: [{ x: 15, y: 38 }, { x: 28, y: 38 }, { x: 28, y: 48 }, { x: 15, y: 48 }] }]
    };
    const errors = await openPcb(page, cleanPcb);

    // Open Copper Pour Dialog
    await page.getByTitle('Заливка медным полигоном').click();
    const pourModal = page.locator('.dt-modal');
    await expect(pourModal).toContainText('Заливка медного полигона');
    await page.screenshot({ path: shot('10_dialog_copper_pour.png') });
    // Pour along board outline on TopCopper
    await pourModal.locator('select').first().selectOption('TopCopper');
    await pourModal.getByRole('button', { name: 'Залить по контуру платы' }).click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: shot('11_copper_pour_with_cutout_keepout_thermals.png') });

    // Autoplacer & Autorouter
    await page.getByTitle('Авторазмещение компонентов').click();
    await page.waitForTimeout(250);
    await page.getByTitle('Автотрассировщик').click();
    await page.waitForTimeout(400);
    await expect(page.locator('.dt-route-report')).toBeVisible();
    await page.screenshot({ path: shot('12_autorouter_banner_and_routed_board.png') });

    // Run DRC via F9 and click an error item
    await page.keyboard.press('F9');
    await page.waitForTimeout(250);
    const rightSidebar = page.locator('.dt-right-sidebar');
    const firstIssue = rightSidebar.locator('.dt-panel-body button.dt-tree-row').first();
    if (await firstIssue.isVisible()) {
      await firstIssue.click();
      await page.waitForTimeout(150);
    }
    await page.screenshot({ path: shot('13_drc_errors_and_markers.png') });

    expect(errors).toEqual([]);
  });

  test('4. All Remaining PCB Dialogs: Rules, Board Wizard, Compare, RF Calc, Panelize & All 5 CAM Tabs', async ({ page }) => {
    const errors = await openPcb(page, createDemoRs485Pcb());

    // Rules Dialog
    await page.getByRole('button', { name: /Нормы ГОСТ 23751/ }).click();
    await expect(page.locator('.dt-modal')).toContainText('ГОСТ 23751-86');
    await page.screenshot({ path: shot('14_dialog_rules.png') });
    await page.locator('.dt-modal').getByRole('button', { name: 'Отмена' }).click();

    // Board Wizard Dialog
    await page.getByRole('button', { name: 'Файл', exact: true }).click();
    await page.getByRole('menuitem', { name: /Мастер контура/ }).click();
    await expect(page.locator('.dt-modal')).toContainText('Мастер контура');
    await page.screenshot({ path: shot('15_dialog_board_wizard.png') });
    await page.locator('.dt-modal').getByRole('button', { name: 'Отмена' }).click();

    // Compare Dialog
    await page.getByTitle('Сравнить/Обновить из схемы').click();
    await expect(page.locator('.dt-modal')).toContainText('Синхронизация и сравнение');
    await page.screenshot({ path: shot('16_dialog_compare.png') });
    await page.locator('.dt-modal').getByRole('button', { name: 'Закрыть' }).click();

    // RF Calc Dialog
    await page.getByRole('button', { name: 'Инструменты', exact: true }).click();
    await page.getByRole('menuitem', { name: /Калькулятор ширины дорожек/ }).click();
    await expect(page.locator('.dt-modal')).toContainText('Калькулятор трассировщика');
    await page.screenshot({ path: shot('17_dialog_rf_calc.png') });
    await page.locator('.dt-modal').getByRole('button', { name: 'Закрыть' }).click();

    // Panelize Dialog -> Apply 2x2 and inspect
    await page.getByRole('button', { name: 'Правка', exact: true }).click();
    await page.getByRole('menuitem', { name: /Панелизация/ }).click();
    await expect(page.locator('.dt-modal')).toContainText('Панелизация');
    await page.screenshot({ path: shot('18_dialog_panelize.png') });
    await page.locator('.dt-modal').getByRole('button', { name: /Создать панель/ }).click();
    await page.waitForTimeout(250);
    await page.keyboard.press('Home');
    await page.waitForTimeout(150);
    await page.screenshot({ path: shot('19_panelized_2x2_board.png') });

    // Reset back to single demo board for clean CAM preview screenshots
    await openPcb(page, createDemoRs485Pcb());

    // CAM Dialog - All 5 Tabs
    await page.getByTitle('Экспорт Gerber RS-274X / Сверловка / ЛУТ SVG').click();
    const camModal = page.locator('.dt-modal');
    await expect(camModal).toContainText('Производственные файлы');
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('20_cam_tab1_gerber_preview.png') });

    await camModal.getByRole('button', { name: /2\. Сверловка Excellon/ }).click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: shot('21_cam_tab2_excellon.png') });

    await camModal.getByRole('button', { name: /3\. ЛУТ SVG 1:1/ }).click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: shot('22_cam_tab3_lut_svg.png') });

    await camModal.getByRole('button', { name: /4\. Экспорт DXF/ }).click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: shot('23_cam_tab4_dxf.png') });

    await camModal.getByRole('button', { name: /5\. ЧПУ G-Code/ }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: shot('24_cam_tab5_gcode.png') });

    await camModal.getByRole('button', { name: 'Закрыть', exact: true }).click();
    expect(errors).toEqual([]);
  });
});
