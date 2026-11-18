import { expect, Page, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createZipArchive } from '../../src/core/utils/zipArchive';

const ROOT = path.resolve(__dirname, '../..');
const EXT = path.join(ROOT, 'tests/fixtures/external');
const AUDIT_EXT = path.join(ROOT, 'audit/external');
const SHOT_DIR = path.join(ROOT, 'tests/screenshots/combine-agent-5');

fs.mkdirSync(SHOT_DIR, { recursive: true });

async function dismissGostDialogIfPresent(page: Page, screenshotName?: string) {
  const dlg = page.getByRole('dialog', { name: 'Отчёт автоконвертации в российские ГОСТ / ЕСКД' });
  const visible = await dlg.isVisible().catch(() => false);
  if (visible) {
    if (screenshotName) {
      await page.screenshot({ path: path.join(SHOT_DIR, screenshotName) });
    }
    await dlg.getByRole('button', { name: 'Принять результат ГОСТ' }).click();
    await expect(dlg).toBeHidden();
  }
}

async function openFileViaToolbar(page: Page, buttonTitle: string, filePath: string, overrideName?: string) {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTitle(buttonTitle).click();
  const chooser = await chooserPromise;
  if (overrideName) {
    await chooser.setFiles({
      name: overrideName,
      mimeType: 'application/octet-stream',
      buffer: fs.readFileSync(filePath)
    });
  } else {
    await chooser.setFiles(filePath);
  }
}

function buildMixtapeGerberZipBuffer(): Buffer {
  const files = ['mixtape.gtl', 'mixtape.gbl', 'mixtape.gto', 'mixtape.gbo', 'mixtape.gts', 'mixtape.gbs', 'mixtape.gml', 'mixtape.txt'];
  const entries: Record<string, Uint8Array> = {};
  for (const fn of files) {
    entries[fn] = new Uint8Array(fs.readFileSync(path.join(EXT, 'gerber-mixtape', fn)));
  }
  return Buffer.from(createZipArchive(entries));
}

test.describe('Combine Agent 5: Full CAD Import/Export UI, Real External Fixtures & Visual QA', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('01: Launcher Open, Drag-and-Drop & Error UX for External CAD Files', async ({ page }) => {
    await page.goto('/?module=launcher');
    await expect(page.locator('.launch-workspace')).toBeVisible();

    // 1a. Open KiCad schematic from Launcher Open button
    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('.launch-btn-open').click();
    const chooser = await chooserPromise;
    await chooser.setFiles(path.join(EXT, 'kicad-pic-programmer/pic_programmer.kicad_sch'));

    // Should navigate to Schematic editor and show GostConversionDialog
    await expect(page.locator('#schematic-library')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(300);
    await dismissGostDialogIfPresent(page, '01a_launcher_gost_conversion_dialog.png');
    await page.getByTitle(/^Показать весь лист/).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOT_DIR, '01b_sch_kicad_pic_programmer.png') });

    // 1b. Return to Launcher and test Drag-and-Drop of Eagle .brd
    await page.goto('/?module=launcher');
    await expect(page.locator('.launch-workspace')).toBeVisible();
    const brdBytes = Array.from(fs.readFileSync(path.join(AUDIT_EXT, 'sparkfun-rfm22b/SparkFun_RF_Transceiver-RFM22B.brd')));
    await page.locator('.launch-workspace').evaluate(async (el, bytes) => {
      const dt = new DataTransfer();
      const file = new File([new Uint8Array(bytes)], 'SparkFun_RF_Transceiver-RFM22B.brd', { type: 'text/xml' });
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, brdBytes);

    await expect(page.getByTitle('Открыть / Импортировать плату (Ctrl+O)')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(300);
    await dismissGostDialogIfPresent(page);
    await page.getByTitle('Показать всю плату (Home)').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOT_DIR, '01c_launcher_dnd_eagle_brd.png') });

    // 1c. Test unsupported/corrupted file error UX in Launcher
    await page.goto('/?module=launcher');
    const badChooserPromise = page.waitForEvent('filechooser');
    await page.locator('.launch-btn-open').click();
    await (await badChooserPromise).setFiles({
      name: 'corrupted_unknown.bin',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from([0x00, 0xfe, 0xca, 0x01, 0xff, 0x20, 0x99])
    });
    await expect(page.locator('.launch-error')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: path.join(SHOT_DIR, '01d_launcher_error_banner.png') });
  });

  test('02: Schematic Editor Imports — KiCad 9, Eagle, Altium OLE2, LTspice, DipTrace XML & Error Handling', async ({ page }) => {
    await page.goto('/?module=schematic');
    await expect(page.locator('#schematic-library')).toBeVisible();

    const samples = [
      { file: path.join(EXT, 'kicad-ecc83/ecc83-pp_v2.kicad_sch'), shot: '02a_sch_kicad9_ecc83.png', expectText: 'KiCad' },
      { file: path.join(AUDIT_EXT, 'sparkfun-rfm22b/SparkFun_RF_Transceiver-RFM22B.sch'), shot: '02b_sch_eagle_rfm22b.png', expectText: 'Eagle' },
      { file: path.join(EXT, 'altium/simplefoc-mini-native-power.SchDoc'), shot: '02c_sch_altium_simplefoc.png', expectText: 'Altium' },
      { file: path.join(EXT, 'ltspice/Clapp.asc'), shot: '02d_sch_ltspice_clapp.png', expectText: 'LTspice' },
      { file: path.join(EXT, 'diptrace-xml/i2c-level-shifter.dchxml'), shot: '02e_sch_diptrace_xml.png', expectText: 'DipTrace XML' }
    ];

    for (const s of samples) {
      await openFileViaToolbar(page, 'Открыть схему (Ctrl+O)', s.file);
      await page.waitForTimeout(300);
      await dismissGostDialogIfPresent(page);
      await expect(page.locator('.dt-statusbar')).toContainText(s.expectText);
      await page.getByTitle(/^Показать весь лист/).click();
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(SHOT_DIR, s.shot) });
    }

    // Also verify corrupted binary .dch shows status error cleanly
    const errChooserPromise = page.waitForEvent('filechooser');
    await page.getByTitle('Открыть схему (Ctrl+O)').click();
    await (await errChooserPromise).setFiles({
      name: 'broken.dch',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from([7, 68, 84, 83, 67, 72, 69, 77, 0, 255])
    });
    await expect(page.locator('.dt-statusbar')).toContainText('Ошибка открытия файла');
  });

  test('03: PCB Editor Imports + 3D View — KiCad 9, KiCad 6, Eagle, Altium PcbDoc, DXF, Gerber ZIP, DipTrace XML', async ({ page }) => {
    await page.goto('/?module=pcb');
    await expect(page.getByTitle('Открыть / Импортировать плату (Ctrl+O)')).toBeVisible({ timeout: 20000 });

    const pcbSamples = [
      { file: path.join(EXT, 'kicad-ecc83/ecc83-pp_v2.kicad_pcb'), shot: '03a_pcb_kicad9_ecc83.png', expectText: 'KiCad' },
      { file: path.join(EXT, 'kicad-pic-programmer/pic_programmer.kicad_pcb'), shot: '03b_pcb_kicad_pic_programmer.png', expectText: 'KiCad' },
      { file: path.join(EXT, 'altium/Battery_Level_Indicator.PcbDoc'), shot: '03c_pcb_altium_battery.png', expectText: 'Altium' },
      { file: path.join(EXT, 'dxf/test_outlines.dxf'), shot: '03d_pcb_dxf_outlines.png', expectText: 'DXF' },
      { file: path.join(EXT, 'diptrace-xml/i2c-level-shifter-pcb.dipxml'), shot: '03e_pcb_diptrace_xml.png', expectText: 'DipTrace XML' }
    ];

    for (const s of pcbSamples) {
      await openFileViaToolbar(page, 'Открыть / Импортировать плату (Ctrl+O)', s.file);
      await page.waitForTimeout(350);
      await dismissGostDialogIfPresent(page);
      await expect(page.locator('.dt-statusbar')).toContainText(s.expectText);
      await page.getByTitle('Показать всю плату (Home)').click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOT_DIR, s.shot) });
    }

    // Gerber + Excellon ZIP import in PCB editor
    const zipBuf = buildMixtapeGerberZipBuffer();
    const gbrChooserPromise = page.waitForEvent('filechooser');
    await page.getByTitle('Открыть / Импортировать плату (Ctrl+O)').click();
    await (await gbrChooserPromise).setFiles({
      name: '8bit-mixtape-gerbers.zip',
      mimeType: 'application/zip',
      buffer: zipBuf
    });
    await page.waitForTimeout(400);
    await dismissGostDialogIfPresent(page);
    await expect(page.locator('.dt-statusbar')).toContainText('Gerber ZIP');
    await page.getByTitle('Показать всю плату (Home)').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOT_DIR, '03f_pcb_gerber_mixtape_zip.png') });

    // Load KiCad ecc83 PCB again and open 3D View to verify imported 3D board & components
    await openFileViaToolbar(page, 'Открыть / Импортировать плату (Ctrl+O)', path.join(EXT, 'kicad-ecc83/ecc83-pp_v2.kicad_pcb'));
    await page.waitForTimeout(350);
    await dismissGostDialogIfPresent(page);
    await page.getByTitle('3D-просмотр печатной платы').click();
    await expect(page.getByRole('group', { name: 'Управление 3D-просмотром' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOT_DIR, '03g_pcb3d_kicad9_ecc83.png') });
  });

  test('04: CAM Dialog — Gerber Viewer (External ZIP), Excellon, LUT SVG & DXF Export Preview', async ({ page }) => {
    await page.goto('/?module=pcb');
    await openFileViaToolbar(page, 'Открыть / Импортировать плату (Ctrl+O)', path.join(EXT, 'kicad-ecc83/ecc83-pp_v2.kicad_pcb'));
    await page.waitForTimeout(300);
    await dismissGostDialogIfPresent(page);

    await page.getByTitle('Экспорт Gerber RS-274X / Сверловка / ЛУТ SVG').click();
    const camDlg = page.locator('.dt-modal').filter({ hasText: 'Производственные файлы' });
    await expect(camDlg).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOT_DIR, '04a_cam_gerber_preview_kicad9.png') });

    // Load external Gerber ZIP into Gerber Viewer
    const extZip = buildMixtapeGerberZipBuffer();
    const gbrChooser = page.waitForEvent('filechooser');
    await camDlg.getByRole('button', { name: 'Открыть Gerber / ZIP для проверки...' }).click();
    await (await gbrChooser).setFiles({
      name: '8bit-mixtape-gerbers.zip',
      mimeType: 'application/zip',
      buffer: extZip
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOT_DIR, '04b_cam_gerber_viewer_mixtape.png') });

    // Switch to DXF and Excellon tabs to audit export UX
    await camDlg.getByRole('button', { name: '4. Экспорт DXF' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOT_DIR, '04c_cam_dxf_export_tab.png') });

    await camDlg.getByRole('button', { name: '2. Сверловка Excellon' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOT_DIR, '04d_cam_excellon_tab.png') });
  });

  test('05: Library Manager Dialog — DipTrace Binary .eli+.lib, KiCad .kicad_sym/.kicad_mod, Eagle .lbr, EasyEDA JSON', async ({ page }) => {
    await page.goto('/?module=launcher');
    await page.getByTitle('Открыть менеджер библиотек ГОСТ УГО и посадочных мест').click();
    const modal = page.getByTestId('cad-library-manager-modal');
    await expect(modal).toBeVisible();

    // 5a. DipTrace Binary .eli + .lib paired import
    const dtChooser = page.waitForEvent('filechooser');
    await page.getByTestId('cadlib-import-btn').click();
    await (await dtChooser).setFiles([
      path.join(EXT, 'diptrace-bin/arduino.eli'),
      path.join(EXT, 'diptrace-bin/arduino.lib')
    ]);
    await expect(page.getByTestId('cadlib-status')).toContainText('Импортировано:', { timeout: 10000 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOT_DIR, '05a_lib_diptrace_binary_arduino.png') });

    // 5b. KiCad .kicad_sym
    const ksymChooser = page.waitForEvent('filechooser');
    await page.getByTestId('cadlib-import-btn').click();
    await (await ksymChooser).setFiles(path.join(EXT, 'kicad-ecc83/ecc83-pp.kicad_sym'));
    await expect(page.getByTestId('cadlib-status')).toContainText('KiCad Symbol Library');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOT_DIR, '05b_lib_kicad_sym_ecc83.png') });

    // 5c. KiCad .kicad_mod (patterns tab)
    const kmodChooser = page.waitForEvent('filechooser');
    await page.getByTestId('cadlib-import-btn').click();
    await (await kmodChooser).setFiles(path.join(EXT, 'kicad-lib/CP_Radial_D10.0mm_P5.00mm.kicad_mod'));
    await expect(page.getByTestId('cadlib-status')).toContainText('KiCad Footprint');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOT_DIR, '05c_lib_kicad_mod_radial.png') });

    // 5d. Eagle .lbr
    const lbrChooser = page.waitForEvent('filechooser');
    await page.getByTestId('cadlib-import-btn').click();
    await (await lbrChooser).setFiles(path.join(EXT, 'eagle-lib/SparkFun-Resistors.lbr'));
    await expect(page.getByTestId('cadlib-status')).toContainText('Eagle');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOT_DIR, '05d_lib_eagle_sparkfun.png') });

    // 5e. EasyEDA JSON (C1046.raweasy.json + C4147.json)
    const eeChooser = page.waitForEvent('filechooser');
    await page.getByTestId('cadlib-import-btn').click();
    await (await eeChooser).setFiles(path.join(EXT, 'easyeda/C1046.raweasy.json'));
    await expect(page.getByTestId('cadlib-status')).toContainText('EasyEDA');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOT_DIR, '05e_lib_easyeda_c1046.png') });

    const ee4147Chooser = page.waitForEvent('filechooser');
    await page.getByTestId('cadlib-import-btn').click();
    await (await ee4147Chooser).setFiles(path.join(EXT, 'easyeda/C4147.json'));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOT_DIR, '05f_lib_easyeda_c4147.png') });
  });

  test('06: UI Export -> Re-Import Roundtrip (Schematic DipTrace ASCII .asc & PCB DipTrace ASCII .dip)', async ({ page }) => {
    await page.addInitScript(() => {
      delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
    });
    // Schematic Export DipTrace ASCII (.asc) -> Re-Import
    await page.goto('/?module=schematic');
    await expect(page.locator('#schematic-library')).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: 'Файл', exact: true }).click();
    const schDownloadPromise = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: /^Экспорт схемы/ }).click();
    const schDl = await schDownloadPromise;
    const exportedAscPath = path.join(SHOT_DIR, '_roundtrip_sch.asc');
    await schDl.saveAs(exportedAscPath);
    expect(fs.statSync(exportedAscPath).size).toBeGreaterThan(500);

    await openFileViaToolbar(page, 'Открыть схему (Ctrl+O)', exportedAscPath);
    await page.waitForTimeout(300);
    await dismissGostDialogIfPresent(page);
    await expect(page.locator('.dt-statusbar')).toContainText('DipTrace ASCII');
    await page.getByTitle(/^Показать весь лист/).click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOT_DIR, '06a_roundtrip_sch_diptrace_asc.png') });
    fs.unlinkSync(exportedAscPath);

    // PCB Export DipTrace ASCII (.dip) -> Re-Import
    await page.goto('/?module=pcb');
    await page.getByRole('button', { name: 'Файл', exact: true }).click();
    const pcbDownloadPromise = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: /^Экспорт платы DipTrace ASCII/ }).click();
    const pcbDl = await pcbDownloadPromise;
    const exportedDipPath = path.join(SHOT_DIR, '_roundtrip_pcb.dip');
    await pcbDl.saveAs(exportedDipPath);
    expect(fs.statSync(exportedDipPath).size).toBeGreaterThan(200);

    await openFileViaToolbar(page, 'Открыть / Импортировать плату (Ctrl+O)', exportedDipPath);
    await page.waitForTimeout(300);
    await dismissGostDialogIfPresent(page);
    await expect(page.locator('.dt-statusbar')).toContainText('DipTrace ASCII PCB');
    await page.getByTitle('Показать всю плату (Home)').click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOT_DIR, '06b_roundtrip_pcb_diptrace_dip.png') });
    fs.unlinkSync(exportedDipPath);
  });
});
