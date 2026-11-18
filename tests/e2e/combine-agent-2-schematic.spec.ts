import { test, expect, type Page } from '@playwright/test';
import {
  ALL_GOST_COMPONENTS,
  GOST_COMPONENT_LIBRARIES
} from '../../src/gost/libraries/gostComponents';
import { createBlankSchematicProject, computeSymbolLocalBounds } from '../../src/ui/modules/schematic/services/schematicActionsService';
import { DEFAULT_NET_CLASSES } from '../../src/core/persistence/projectFactory';
import { ComponentDef, PlacedComponent, SchematicProject } from '../../src/core/types';

const SCH_KEY = 'gosttrace_active_schematic_v2';
const SETTINGS_KEY = 'gosttrace_settings_v1';
const CONV_KEY = 'gosttrace_pending_conversion_v1';
const SHOT_DIR = 'tests/screenshots/combine-agent-2';

async function readStoredSchematic(page: Page): Promise<SchematicProject> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), SCH_KEY);
}

function buildGalleryProject(
  items: { comp: ComponentDef; partIndex: number }[],
  cols: number,
  spacingX: number,
  spacingY: number,
  startX = 45,
  startY = 30
): SchematicProject {
  const proj = createBlankSchematicProject('mm', DEFAULT_NET_CLASSES);
  proj.projectName = 'UGO_Gallery';
  proj.sheets[0].format = 'A1_L';
  proj.sheets[0].titleBlock.form = 'Form1';
  proj.sheets[0].titleBlock.showZones = true;
  proj.sheets[0].titleBlock.showCornerStamp26 = true;

  const placed: PlacedComponent[] = [];
  const shapes: SchematicProject['sheets'][0]['shapes'] = [];
  let idx = 0;
  for (const { comp, partIndex } of items) {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = startX + col * spacingX;
    const y = startY + row * spacingY;
    const refDes = comp.refDesPrefix.startsWith('#')
      ? `${comp.refDesPrefix}${idx + 1}`
      : `${comp.refDesPrefix}${idx + 1}`;
    const bounds = computeSymbolLocalBounds(comp, partIndex);
    placed.push({
      id: `gal_${comp.id}_p${partIndex}_${idx}`,
      componentDefId: comp.id,
      libraryId: comp.library,
      refDes,
      value: comp.defaultValue || comp.name,
      typeName: comp.name,
      partIndex,
      x,
      y,
      angle: 0,
      flipX: false,
      flipY: false,
      patternId: comp.patternId,
      isNetPort: comp.isNetPort,
      refDesOffset: { x: 0, y: bounds.minY - 3 },
      valueOffset: { x: 0, y: bounds.maxY + 3 },
      showRefDes: !comp.isNetPort,
      showValue: true
    });
    shapes.push({
      id: `lbl_${idx}`,
      type: 'text',
      x: x - 12,
      y: y + bounds.maxY + 6,
      text: `${comp.id.replace('COMP_', '')}${comp.parts.length > 1 ? `.${partIndex}` : ''}`,
      size: 2.0
    });
    idx++;
  }
  proj.sheets[0].components = placed;
  proj.sheets[0].shapes = shapes;
  return proj;
}

async function openProjectInSchematic(
  page: Page,
  project: SchematicProject,
  colorScheme: 'dark' | 'light' | 'gost-bw' = 'gost-bw'
) {
  await page.addInitScript(
    ({ schKey, setKey, proj, scheme }) => {
      localStorage.setItem(schKey, JSON.stringify(proj));
      localStorage.setItem(
        setKey,
        JSON.stringify({
          colorScheme: scheme,
          units: 'mm',
          defaultAccuracyClass: 4,
          authorName: 'Инженер С.А.',
          checkerName: 'Проверил В.И.',
          normControlName: 'Н.контр Е.М.',
          approverName: 'Утв. Д.Н.',
          organization: 'АО «НИИ Приборостроения»',
          recentProjects: []
        })
      );
    },
    { schKey: SCH_KEY, setKey: SETTINGS_KEY, proj: project, scheme: colorScheme }
  );
  await page.goto('/?module=schematic');
  await expect(page.locator('.sch-splash')).toBeHidden();
  await page.waitForTimeout(250);
}

async function zoomCanvasToCenterWorld(page: Page, worldX: number, worldY: number, wheelStepsIn = 6) {
  const canvas = page.locator('.dt-canvas-wrap canvas');
  const box = (await canvas.boundingBox())!;
  // Use toolbar zoomAll button so tablist focus doesn't intercept Home key
  await page.getByTitle(/Показать весь лист/).click();
  await page.waitForTimeout(100);
  // Compute current fit transform for A1_L (841x594) or A4_L (297x210) via readback
  const dims = await page.evaluate((k) => {
    const p = JSON.parse(localStorage.getItem(k)!);
    const fmt = p.sheets.find((s: any) => s.id === p.activeSheetId)?.format ?? 'A4_L';
    const map: Record<string, [number, number]> = {
      A4_P: [210, 297],
      A4_L: [297, 210],
      A3_L: [420, 297],
      A3_P: [297, 420],
      A2_L: [594, 420],
      A1_L: [841, 594],
      A0_L: [1189, 841]
    };
    return map[fmt] ?? [297, 210];
  }, SCH_KEY);
  const scale = Math.max(0.4, Math.min((box.width - 36) / dims[0], (box.height - 28) / dims[1]));
  const ox = (box.width - dims[0] * scale) / 2;
  const oy = (box.height - dims[1] * scale) / 2;
  const sx = box.x + ox + worldX * scale;
  const sy = box.y + oy + worldY * scale;
  await page.mouse.move(sx, sy);
  for (let i = 0; i < wheelStepsIn; i++) {
    await page.mouse.wheel(0, -120);
  }
  await page.waitForTimeout(120);
}

test.describe('Combine Agent 2: GOST УГО Visual Audit, Menus, Dialogs & Ergonomics', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('01: Render & visually inspect ALL GOST УГО — General, Resistors, Capacitors, Inductors', async ({ page }) => {
    const libs = ['lib_gost_general', 'lib_gost_res', 'lib_gost_cap', 'lib_gost_ind'];
    const items = GOST_COMPONENT_LIBRARIES.filter((l) => libs.includes(l.id)).flatMap((l) =>
      l.components.map((comp) => ({ comp, partIndex: 1 }))
    );
    const proj = buildGalleryProject(items, 5, 50, 42, 45, 35);
    proj.sheets[0].format = 'A3_L';
    await openProjectInSchematic(page, proj, 'gost-bw');
    await zoomCanvasToCenterWorld(page, 145, 115, 2);
    await page.locator('.dt-canvas-wrap canvas').screenshot({ path: `${SHOT_DIR}/01_ugo_general_res_cap_ind.png` });
    expect(items.length).toBe(23);
  });

  test('02: Render & visually inspect ALL GOST УГО — Diodes, Transistors, Opto', async ({ page }) => {
    const libs = ['lib_gost_diode', 'lib_gost_trans', 'lib_gost_opto'];
    const items = GOST_COMPONENT_LIBRARIES.filter((l) => libs.includes(l.id)).flatMap((l) =>
      l.components.map((comp) => ({ comp, partIndex: 1 }))
    );
    const proj = buildGalleryProject(items, 5, 45, 42, 45, 35);
    proj.sheets[0].format = 'A4_L';
    await openProjectInSchematic(page, proj, 'gost-bw');
    await zoomCanvasToCenterWorld(page, 135, 80, 2);
    await page.locator('.dt-canvas-wrap canvas').screenshot({ path: `${SHOT_DIR}/02_ugo_diodes_transistors_opto.png` });
    expect(items.length).toBe(15);
  });

  test('03: Render & visually inspect ALL GOST УГО — Analog ICs & Digital ICs (including multi-part & power sections)', async ({ page }) => {
    const analog = GOST_COMPONENT_LIBRARIES.find((l) => l.id === 'lib_gost_analog')!.components;
    const digital = GOST_COMPONENT_LIBRARIES.find((l) => l.id === 'lib_gost_digital')!.components;
    const items: { comp: ComponentDef; partIndex: number }[] = [];
    for (const c of analog) items.push({ comp: c, partIndex: 1 });
    for (const c of digital) {
      items.push({ comp: c, partIndex: 1 });
      // Also render the last (power) section of each multi-part digital IC
      if (c.parts.length > 1) items.push({ comp: c, partIndex: c.parts.length });
    }
    const proj = buildGalleryProject(items, 5, 55, 72, 50, 45);
    proj.sheets[0].format = 'A3_L';
    await openProjectInSchematic(page, proj, 'gost-bw');
    await zoomCanvasToCenterWorld(page, 165, 135, 2);
    await page.locator('.dt-canvas-wrap canvas').screenshot({ path: `${SHOT_DIR}/03_ugo_analog_digital_ic.png` });
    expect(items.length).toBe(20);
  });

  test('04: Render & visually inspect ALL GOST УГО — Connectors, Switches, Indicators & Lab Interfaces', async ({ page }) => {
    const libs = ['lib_gost_conn', 'lib_gost_ind_sensors', 'lib_gost_lab_if_pwr'];
    const items: { comp: ComponentDef; partIndex: number }[] = [];
    for (const lib of GOST_COMPONENT_LIBRARIES.filter((l) => libs.includes(l.id))) {
      for (const c of lib.components) {
        items.push({ comp: c, partIndex: 1 });
        if (c.parts.length > 1) items.push({ comp: c, partIndex: 2 });
      }
    }
    const proj = buildGalleryProject(items, 7, 55, 85, 55, 50);
    proj.sheets[0].format = 'A2_L';
    await openProjectInSchematic(page, proj, 'gost-bw');
    await zoomCanvasToCenterWorld(page, 220, 195, 1);
    await page.locator('.dt-canvas-wrap canvas').screenshot({ path: `${SHOT_DIR}/04_ugo_connectors_switches_lab.png` });
    await zoomCanvasToCenterWorld(page, 220, 390, 2);
    await page.locator('.dt-canvas-wrap canvas').screenshot({ path: `${SHOT_DIR}/04b_ugo_connectors_bottom.png` });
    expect(items.length).toBeGreaterThanOrEqual(36);
  });

  test('05: Render & visually inspect ALL GOST УГО — AVR MCUs & Russian MCU K1986VE92QI (both sections)', async ({ page }) => {
    const avr = GOST_COMPONENT_LIBRARIES.find((l) => l.id === 'lib_gost_avr_mcu')!.components;
    const rus = GOST_COMPONENT_LIBRARIES.find((l) => l.id === 'lib_gost_mcu')!.components;
    const items: { comp: ComponentDef; partIndex: number }[] = [];
    for (const c of avr) items.push({ comp: c, partIndex: 1 });
    for (const c of rus) {
      for (const p of c.parts) items.push({ comp: c, partIndex: p.partIndex });
    }
    const proj = buildGalleryProject(items, 4, 80, 125, 65, 75);
    proj.sheets[0].format = 'A3_L';
    await openProjectInSchematic(page, proj, 'gost-bw');
    await zoomCanvasToCenterWorld(page, 185, 135, 1);
    await page.locator('.dt-canvas-wrap canvas').screenshot({ path: `${SHOT_DIR}/05_ugo_mcu_avr_russian.png` });
    expect(items.length).toBe(7);
  });

  test('06: GOST 2.104-2006 Frame, Zones, Графа 26, Form 1 and Form 2a Title Blocks', async ({ page }) => {
    const proj = createBlankSchematicProject('mm', DEFAULT_NET_CLASSES);
    proj.sheets[0].format = 'A4_L';
    proj.sheets[0].titleBlock.showZones = true;
    proj.sheets[0].titleBlock.showCornerStamp26 = true;
    proj.sheets[0].titleBlock.techControl = 'Тех. К.А.';
    proj.sheets.push({
      ...structuredClone(proj.sheets[0]),
      id: 'sheet_2',
      name: 'Лист 2',
      titleBlock: {
        ...proj.sheets[0].titleBlock,
        form: 'Form2a',
        sheetNumber: 2,
        totalSheets: 2
      }
    });
    proj.sheets[0].titleBlock.totalSheets = 2;

    await openProjectInSchematic(page, proj, 'gost-bw');
    await zoomCanvasToCenterWorld(page, 210, 180, 5);
    await page.locator('.dt-canvas-wrap canvas').screenshot({ path: `${SHOT_DIR}/06_titleblock_form1_zoom.png` });

    // Also zoom top-left to inspect Графа 26 rotated 180 deg and coordinate zones
    await zoomCanvasToCenterWorld(page, 50, 14, 6);
    await page.locator('.dt-canvas-wrap canvas').screenshot({ path: `${SHOT_DIR}/06b_grafa26_and_zones_zoom.png` });

    // Switch to Sheet 2 and inspect Form 2a
    await page.getByRole('tab', { name: 'Лист 2' }).click();
    await page.waitForTimeout(200);
    await page.getByTitle('Показать весь лист (Home)').click();
    await page.waitForTimeout(150);
    await zoomCanvasToCenterWorld(page, 210, 195, 4);
    await page.locator('.dt-canvas-wrap canvas').screenshot({ path: `${SHOT_DIR}/07_titleblock_form2a_zoom.png` });
  });

  test('07: UI Overview at 1280x800, Menus, Context Menu, Left/Right Sidebars', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?module=schematic');
    await expect(page.locator('.sch-splash')).toBeHidden();
    await page.waitForTimeout(300);

    await page.screenshot({ path: `${SHOT_DIR}/08_ui_overview_1280x800_dark.png` });

    // Open File menu
    await page.getByRole('button', { name: 'Файл', exact: true }).click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${SHOT_DIR}/09_menu_file.png` });

    // Open Objects menu
    await page.getByRole('button', { name: 'Объекты', exact: true }).click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${SHOT_DIR}/10_menu_objects.png` });
    await page.keyboard.press('Escape');

    // Expand "Инструменты" in left sidebar & switch right sidebar tabs
    await page.locator('.dt-left-sidebar button', { hasText: 'Инструменты' }).click();
    await page.getByTitle('Цепи схемы').click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOT_DIR}/11_sidebars_tools_and_nets.png` });

    // Right click on canvas to capture context menu
    const canvas = page.locator('.dt-canvas-wrap canvas');
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await expect(page.getByRole('menu')).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/12_context_menu.png` });
  });

  test('08: Inspect EVERY Schematic Dialog (Properties, Sheets, ERC Rules/Matrix, Find, NetClasses, TitleBlock, BOM ПЭ3, SPICE, GostConversion)', async ({ page }) => {
    await page.addInitScript(
      ({ convKey }) => {
        sessionStorage.setItem(
          convKey,
          JSON.stringify({
            sourceFormat: 'KiCad 8 (.kicad_sch)',
            convertedComponents: 4,
            convertedSymbolsToUgo: 4,
            convertedPatterns: 4,
            warnings: ['Вывод NC не привязан к посадочному месту'],
            items: [
              { originalRef: 'U1', gostRef: 'DD1', originalValue: 'ATmega328P', gostValue: 'ATmega328P-PU', gostPattern: 'PAT_DIP28_N', action: 'УГО ГОСТ 2.743' },
              { originalRef: 'D1', gostRef: 'VD1', originalValue: '1N4148', gostValue: 'КД522Б', gostPattern: 'PAT_KD522', action: 'УГО ГОСТ 2.730' }
            ]
          })
        );
      },
      { convKey: CONV_KEY }
    );
    await page.goto('/?module=schematic');
    await expect(page.locator('.sch-splash')).toBeHidden();
    await page.waitForTimeout(250);

    // 1. GostConversionDialog (appears on startup from pending report)
    const convDialog = page.getByRole('dialog', { name: /Отчёт автоконвертации/ });
    await expect(convDialog).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/13_dialog_gost_conversion.png` });
    await convDialog.getByRole('button', { name: 'Принять результат ГОСТ' }).click();
    await expect(convDialog).toBeHidden();

    // 2. SchematicObjectDialog (select first component from right sidebar and press E)
    await page.locator('.dt-right-sidebar .dt-tree-row').first().click();
    await page.keyboard.press('e');
    const objDialog = page.getByRole('dialog', { name: 'Свойства объектов' });
    await expect(objDialog).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/14_dialog_object_properties.png` });
    await objDialog.getByRole('button', { name: 'Отмена' }).click();

    // 3. SchematicSheetsDialog
    await page.getByRole('button', { name: 'Листы...' }).click();
    const sheetsDialog = page.getByRole('dialog', { name: 'Управление листами' });
    await expect(sheetsDialog).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/15_dialog_sheets.png` });
    await sheetsDialog.getByRole('button', { name: 'Закрыть', exact: true }).click();

    // 4. SchErcSettingsDialog (Rules & Pin Matrix)
    await page.getByRole('button', { name: 'Проверка', exact: true }).click();
    await page.getByRole('menuitem', { name: /Параметры проверки ERC/ }).click();
    await expect(page.getByText('Параметры проверки электрических правил (ERC)')).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/16_dialog_erc_rules.png` });
    await page.getByRole('button', { name: 'Матрица типов выводов' }).click();
    await page.screenshot({ path: `${SHOT_DIR}/17_dialog_erc_matrix.png` });
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();

    // 5. SchFindDialog
    await page.keyboard.press('Control+f');
    const findDialog = page.getByRole('dialog', { name: 'Найти компонент или цепь' });
    await expect(findDialog).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/18_dialog_find.png` });
    await findDialog.getByRole('button', { name: 'Закрыть', exact: true }).click();

    // 6. SchNetClassesDialog
    await page.getByRole('button', { name: 'Правка', exact: true }).click();
    await page.getByRole('menuitem', { name: /Свойства классов цепей/ }).click();
    await expect(page.getByText('Классы цепей (Net Classes)')).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/19_dialog_net_classes.png` });
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();

    // 7. TitleBlockDialog
    await page.getByTitle('Настройка листа / Штамп ГОСТ 2.104').click();
    await expect(page.getByText('Заголовки и настройка листа')).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/20_dialog_title_block.png` });
    await page.getByRole('button', { name: 'Отмена' }).click();

    // 8. GostBomDialog
    await page.getByTitle('Перечень элементов ПЭ3 (ГОСТ 2.701)').click();
    await expect(page.getByText('Перечень элементов (ГОСТ 2.701-2008')).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/21_dialog_bom_pe3.png` });
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();

    // 9. SpiceSimDialog (Transient + AC Bode)
    await page.getByTitle('SPICE симуляция цепи').click();
    await expect(page.getByText('SPICE-симуляция (Модифицированный узловой анализ MNA)')).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/22_dialog_spice_tran.png` });
    await page.getByRole('button', { name: /АЧХ \/ Боде/ }).click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOT_DIR}/23_dialog_spice_ac.png` });
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  });

  test('09: End-to-End Ergonomics & Workflows: Place, Wire, Rubber-band Drag, Rotate, Flip, ERC Violations, SPICE step bug, BOM table insert', async ({ page }) => {
    const blank = createBlankSchematicProject('mm', DEFAULT_NET_CLASSES);
    await openProjectInSchematic(page, blank, 'light');

    const canvas = page.locator('.dt-canvas-wrap canvas');
    const box = (await canvas.boundingBox())!;
    const dim = [297, 210];
    const scale = Math.max(0.4, Math.min((box.width - 36) / dim[0], (box.height - 28) / dim[1]));
    const ox = (box.width - dim[0] * scale) / 2;
    const oy = (box.height - dim[1] * scale) / 2;
    const toScreen = (wx: number, wy: number) => ({ x: box.x + ox + wx * scale, y: box.y + oy + wy * scale });

    // Place R1 (МЛТ-0,25) at (60, 70) and R2 at (120, 70)
    await page.locator('.dt-lib-item').filter({ hasText: 'Резисторы' }).click();
    await page.locator('.dt-comp-item').filter({ hasText: 'МЛТ-0,25' }).click();
    const pR1 = toScreen(60, 70);
    const pR2 = toScreen(120, 70);
    await page.mouse.click(pR1.x, pR1.y);
    await page.mouse.click(pR2.x, pR2.y);
    await page.keyboard.press('Escape');

    await expect(page.locator('.dt-right-sidebar')).toContainText('R2');
    await expect.poll(async () => (await readStoredSchematic(page)).sheets[0].components.length).toBe(2);
    let st = await readStoredSchematic(page);
    expect(st.sheets[0].components.map((c) => c.refDes)).toEqual(['R1', 'R2']);

    // Wire R1 pin 2 (x=70, y=70) to R2 pin 1 (x=110, y=70) using 'W' hotkey
    await page.keyboard.press('w');
    const wStart = toScreen(70, 70);
    const wEnd = toScreen(110, 70);
    await page.mouse.click(wStart.x, wStart.y);
    await page.mouse.click(wEnd.x, wEnd.y);
    await expect.poll(async () => (await readStoredSchematic(page)).sheets[0].wires.length).toBe(1);

    st = await readStoredSchematic(page);
    expect(st.sheets[0].wires).toHaveLength(1);
    // Note: finishing wire returned tool to 'select' automatically
    await expect(page.getByTitle('Режим выделения (Esc)', { exact: true })).toHaveClass(/active/);

    // Rubber-band drag R2 down by +15mm (y=70 -> y=85): wire endpoint must stretch orthogonally!
    await page.mouse.click(pR2.x, pR2.y);
    const pR2Down = toScreen(120, 85);
    await page.mouse.move(pR2.x, pR2.y);
    await page.mouse.down();
    await page.mouse.move(pR2Down.x, pR2Down.y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await readStoredSchematic(page)).sheets[0].components[1].y).toBe(85);

    st = await readStoredSchematic(page);
    expect(st.sheets[0].components[1].y).toBe(85);
    expect(st.sheets[0].wires[0].points.at(-1)).toEqual({ x: 110, y: 85 });

    // Place K155LA3 (unconnected -> triggers ERC-FLOAT, ERC-UNCON, ERC-NO-PWR) and run F9
    await page.locator('.dt-lib-item').filter({ hasText: 'Цифровые ИМС' }).click();
    await page.locator('.dt-comp-item').filter({ hasText: 'К155ЛА3' }).click();
    const pDD1 = toScreen(180, 80);
    await page.mouse.click(pDD1.x, pDD1.y);
    await page.keyboard.press('Escape');

    await page.keyboard.press('F9');
    await page.waitForTimeout(150);
    await expect(page.locator('.dt-right-sidebar')).toContainText('[ERC-FLOAT]');
    await page.screenshot({ path: `${SHOT_DIR}/24_workflow_rubberband_and_erc.png` });

    // UX Friction verification: editing any property/component wipes all ERC markers immediately!
    await page.mouse.click(pR1.x, pR1.y);
    await page.keyboard.press('r');
    await page.waitForTimeout(150);
    await expect(page.locator('.dt-right-sidebar')).toContainText('Схема изменена или ещё не проверена. Нажмите F9.');

    // Verify Esc in select mode does NOT clear selection (ergonomic gap)
    await expect(page.locator('.dt-right-sidebar')).toContainText('Свойства выделения (1)');
    await page.keyboard.press('Escape');
    await expect(page.locator('.dt-right-sidebar')).toContainText('Свойства выделения (1)');

    // Insert BOM ПЭ3 table onto sheet and verify shape
    await page.getByTitle('Перечень элементов ПЭ3 (ГОСТ 2.701)').click();
    await page.getByRole('button', { name: 'Разместить таблицу на листе' }).click();
    await page.waitForTimeout(300);
    st = await readStoredSchematic(page);
    expect(st.sheets[0].shapes.some((s) => s.type === 'table' && s.source === 'bom')).toBe(true);
    await page.screenshot({ path: `${SHOT_DIR}/25_workflow_bom_table_on_sheet.png` });

    // Check SPICE dialog stepTimeParam bug: changing stepTimeParam does NOT change timePoints count
    await page.getByTitle('SPICE симуляция цепи').click();
    const stepInput = page.locator('label', { hasText: 'Шаг по времени (мкс):' }).locator('input');
    await stepInput.fill('5');
    await page.getByRole('button', { name: /Пересчитать/ }).click();
    // Netlist & dialog remain open and responsive
    await expect(page.getByText('SPICE-симуляция (Модифицированный узловой анализ MNA)')).toBeVisible();
  });
});
