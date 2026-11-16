const assert = require('node:assert/strict');
// Read-only UX audit against a disposable Playwright browser profile.
// Run with Vite on 127.0.0.1:5174: node audit/schematic-ux-probe.cjs
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto('http://127.0.0.1:5174/?module=schematic');
    const storageKey = 'gosttrace_active_schematic_v2';
    const fixture = await page.evaluate(async () => {
      const { createBlankSchematicProject } = await import('/src/ui/modules/schematic/services/schematicActionsService.ts');
      const project = createBlankSchematicProject('mm', []);
      project.projectName = 'UX audit';
      project.customComponentDefs.audit = {
        id: 'audit', name: 'Audit symbol', library: 'audit', refDesPrefix: 'R', defaultValue: '1k',
        gostStandard: 'audit', description: 'Audit fixture', patternId: 'PAT_CHIP_2012M',
        parts: [{ partIndex: 1, name: '1', primitives: [{ type: 'rect', x: -5, y: -2.5, w: 10, h: 5 }],
          pins: [-10, 10].map((x, i) => ({ id: `pin${i}`, number: String(i + 1), name: 'P', x, y: 0,
            length: 5, orientation: i ? 180 : 0, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true })) }]
      };
      project.sheets[0].components = [75, 125].map((x, i) => ({ id: `c${i + 1}`, refDes: `R${i + 1}`, x, y: 75,
        componentDefId: 'audit', libraryId: 'audit', value: '1k', typeName: 'Audit symbol', partIndex: 1,
        angle: 0, flipX: false, flipY: false, patternId: 'PAT_CHIP_2012M',
        refDesOffset: { x: 0, y: -8 }, valueOffset: { x: 0, y: 8 }, showRefDes: true, showValue: true }));
      Object.assign(project.sheets[0], {
        wires: [{ id: 'w1', points: [{ x: 85, y: 75 }, { x: 115, y: 75 }], netName: '' },
          { id: 'w2', points: [{ x: 100, y: 75 }, { x: 100, y: 100 }], netName: '' }],
        junctions: [{ id: 'j1', x: 100, y: 75, netName: '' }],
        netPorts: [{ id: 'np1', x: 100, y: 100, angle: 0, style: 'Ground', netName: 'GND' }],
        shapes: [{ id: 't1', type: 'text', x: 80, y: 110, text: 'Audit note', size: 3.5 }],
        buses: [{ id: 'b1', points: [{ x: 60, y: 120 }, { x: 140, y: 120 }], busName: 'D[0..7]' }]
      });
      return project;
    });
    await page.addInitScript(({storageKey,fixture})=>localStorage.setItem(storageKey,JSON.stringify(fixture)),{storageKey,fixture});
    const observations = [];
    const record = (id, observed) => { observations.push({ id, observed }); console.log(JSON.stringify(observations.at(-1))); };
    async function seed() {
      await page.evaluate(({ storageKey, fixture }) => localStorage.setItem(storageKey, JSON.stringify(fixture)), { storageKey, fixture });
      await page.reload(); await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
    async function state() { await page.waitForTimeout(350);return page.evaluate(k => JSON.parse(localStorage.getItem(k)), storageKey); }
    async function xy(x, y) {
      const b = await page.locator('.dt-canvas-wrap canvas').boundingBox();
      const scale = Math.max(0.5, Math.min((b.width - 36) / 297, (b.height - 28) / 210));
      return { x: b.x + b.width / 2 + (x - 148.5) * scale, y: b.y + b.height / 2 + (y - 105) * scale };
    }
    async function click(x, y, options) { const p = await xy(x, y); await page.mouse.click(p.x, p.y, options); await page.waitForTimeout(60); }
    async function drag(x1, y1, x2, y2) {
      const a = await xy(x1, y1), b = await xy(x2, y2);
      await page.mouse.move(a.x, a.y); await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(350);
    }
    async function selected() { return page.locator('.dt-right-sidebar .dt-tree-row.selected').allTextContents(); }
    async function wireToolActive() { return (await page.getByTitle('Проложить провод (W)', { exact: true }).getAttribute('class')).includes('active'); }

    await seed(); await page.keyboard.press('w'); await click(160, 140, { button: 'right' });
    record('right-click-cancel', { wireToolStillActive: await wireToolActive() });
    await seed(); await click(65,75);await click(135,75);
    record('wire-from-select', { wireCount: (await state()).sheets[0].wires.length });
    await seed(); await drag(50, 50, 150, 130); const picked = await selected(); await page.keyboard.press('Delete'); await page.waitForTimeout(350);
    let sheet = (await state()).sheets[0];
    record('marquee-delete', { picked, remaining: Object.fromEntries(['components', 'wires', 'junctions', 'netPorts', 'shapes', 'buses'].map(k => [k, sheet[k].length])) });
    await seed(); await click(100, 87.5); await page.keyboard.press('Delete'); await page.waitForTimeout(350);
    record('single-wire-delete', { remainingWireIds: (await state()).sheets[0].wires.map(w => w.id) });
    await seed(); await drag(50, 50, 150, 130); await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v'); await click(180,140);await page.waitForTimeout(350);
    sheet = (await state()).sheets[0];
    record('copy-fragment', { components: sheet.components.length, wires: sheet.wires.length, ports: sheet.netPorts.length, selected: await selected() });
    await seed(); await drag(50, 50, 150, 130); await drag(75, 75, 85, 85); sheet = (await state()).sheets[0];
    record('move-group', { components: sheet.components.map(c => ({ id: c.id, x: c.x, y: c.y })), wires: sheet.wires, junctions: sheet.junctions, ports: sheet.netPorts });
    await seed(); await click(75, 75); await page.keyboard.press('r'); await page.waitForTimeout(350); sheet = (await state()).sheets[0];
    record('rotate-connected', { angle: sheet.components[0].angle, refDesOffset: sheet.components[0].refDesOffset, valueOffset: sheet.components[0].valueOffset, wire: sheet.wires[0] });
    await seed(); await click(75, 75, { button: 'right' }); const menusBefore = await page.locator('.dt-dropdown').count(); await page.keyboard.press('Escape');
    record('escape-context-menu', { menusBefore, menusAfter: await page.locator('.dt-dropdown').count() });
    await seed(); await click(75, 75); await page.keyboard.press('r'); await page.keyboard.press('Control+z'); await page.waitForTimeout(350);
    record('undo-single-action', { angle: (await state()).sheets[0].components[0].angle, undoDisabled: await page.getByTitle('Отменить (Ctrl+Z)', { exact: true }).isDisabled() });
    await seed(); await page.keyboard.press('Control+a'); record('select-all', { selected: await selected() });
    await seed(); const zoomBefore = await page.locator('.dt-tb-select').first().innerText(); await page.keyboard.press('+');
    record('zoom-plus', { before: zoomBefore, after: await page.locator('.dt-tb-select').first().innerText() });
    await seed(); await page.keyboard.press('w'); await click(160, 140); await click(170, 140); await page.keyboard.press('Escape');
    record('escape-wire-tool', { wireToolStillActive: await wireToolActive() });
    await seed(); await click(100, 104.5); await drag(100, 104.5, 110, 114.5); sheet = (await state()).sheets[0];
    record('move-port', { port: sheet.netPorts[0], wire: sheet.wires[1] });
    await seed(); await click(75, 75); await page.keyboard.press('r'); await page.keyboard.press('Control+z'); await page.waitForTimeout(350);
    const afterFirstUndo = (await state()).sheets[0].components[0].angle;
    await page.keyboard.press('Control+z'); await page.waitForTimeout(350);
    record('history-duplicate', { afterFirstUndo, afterSecondUndo: (await state()).sheets[0].components[0].angle });
    await seed(); await click(75, 75); await click(100, 87.5, { button: 'right' });
    await page.locator('.dt-dropdown-row').filter({ hasText: 'Удалить провод' }).click();
    await page.waitForTimeout(350); sheet = (await state()).sheets[0];
    record('context-deletes-stale-selection', { remainingComponents: sheet.components.map(c => c.id), remainingWires: sheet.wires.map(w => w.id) });
    await seed(); await click(75, 75); await page.getByTitle('Разместить выбранный компонент', { exact: true }).click(); await page.keyboard.press('r'); await page.waitForTimeout(350);
    record('rotate-placement-with-selection', { existingComponentAngle: (await state()).sheets[0].components[0].angle });
    await seed(); const start = await xy(75, 75); await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(start.x + 30, 10, { steps: 4 }); await page.mouse.up();
    const afterRelease = (await state()).sheets[0].components[0]; const reenter = await xy(95, 95);
    await page.mouse.move(reenter.x, reenter.y); await page.waitForTimeout(350);
    record('drag-release-outside-canvas', { afterRelease: { x: afterRelease.x, y: afterRelease.y }, afterReenter: (await state()).sheets[0].components[0] });
    await seed();
    const engineObservations = await page.evaluate(async fixture => {
      const { extractSchematicNets, runSchematicErc, renumberSchematicComponents } = await import('/src/engines/erc.ts');
      const { convertSchematicToPcb } = await import('/src/engines/netlist.ts');
      const { generateSchematicSvg } = await import('/src/ui/modules/schematic/services/schematicActionsService.ts');
      const classes = structuredClone(fixture);
      classes.netClasses = [{ id: 'wide', name: 'Wide', traceWidth: 2, clearance: 1, minWidth: 1, maxWidth: 4, viaOuterDiameter: 1, viaHoleDiameter: 0.5 }];
      classes.sheets[0].wires[0].netClassId = 'wide';
      const pcb = convertSchematicToPcb(classes);
      const multipart = structuredClone(fixture);
      multipart.sheets[0].components[1].refDes = 'R1'; multipart.sheets[0].components[1].partIndex = 2;
      multipart.customComponentDefs.audit.parts.push({ ...structuredClone(multipart.customComponentDefs.audit.parts[0]), partIndex: 2 });
      const local = structuredClone(fixture);
      local.sheets[0].wires = [{ id: 'local1', netName: '', points: [{ x: 85, y: 75 }, { x: 95, y: 75 }] }];
      local.sheets[0].netPorts = [{ id: 'localport1', x: 95, y: 75, angle: 0, style: 'PortLeft', netName: 'LOCAL' }];
      const second = structuredClone(local.sheets[0]); second.id = 'sheet2';
      second.components = second.components.map(c => ({ ...c, id: c.id + '_2', refDes: c.refDes + '0' }));
      second.wires[0].id = 'local2'; second.netPorts[0].id = 'localport2'; local.sheets.push(second);
      const svg = generateSchematicSvg(fixture.sheets[0], fixture.customComponentDefs);
      return {
        wireClassTransfer: { wireClass: classes.sheets[0].wires[0].netClassId, pcbAssignments: pcb.netClassAssignments },
        multipart: { duplicateErrors: runSchematicErc(multipart).filter(e => e.code === 'ERC-DUP').length, renumbered: renumberSchematicComponents(multipart).sheets[0].components.map(c => c.refDes) },
        localPorts: extractSchematicNets(local).filter(n => n.netName === 'LOCAL').map(n => n.pins.map(p => p.compId)),
        svgMissing: { value: !svg.includes('1k'), note: !svg.includes('Audit note'), busName: !svg.includes('D[0..7]') }
      };
    }, fixture);
    record('engine-observations', engineObservations);
    const result = id => observations.find(o=>o.id===id).observed;
    assert.equal(result('right-click-cancel').wireToolStillActive,false);
    assert.equal(result('wire-from-select').wireCount,3);
    assert.ok(Object.values(result('marquee-delete').remaining).every(n=>n===0));
    assert.deepEqual(result('single-wire-delete').remainingWireIds,['w1']);
    assert.equal(result('copy-fragment').components,4);assert.equal(result('copy-fragment').wires,4);
    assert.equal(result('move-group').junctions[0].x,110);assert.equal(result('move-group').ports[0].x,110);
    assert.equal(result('rotate-connected').angle,90);assert.equal(result('rotate-connected').refDesOffset.x,8);
    assert.equal(result('escape-context-menu').menusAfter,0);assert.equal(result('undo-single-action').undoDisabled,true);
    assert.equal(result('select-all').selected.length,2);assert.notEqual(result('zoom-plus').before,result('zoom-plus').after);
    assert.equal(result('escape-wire-tool').wireToolStillActive,false);assert.equal(result('move-port').port.x,110);
    assert.equal(result('context-deletes-stale-selection').remainingComponents.length,2);assert.equal(result('rotate-placement-with-selection').existingComponentAngle,0);
    const released=result('drag-release-outside-canvas');assert.equal(released.afterRelease.x,released.afterReenter.x);assert.equal(released.afterRelease.y,released.afterReenter.y);
    const engine=result('engine-observations');assert.ok(Object.values(engine.wireClassTransfer.pcbAssignments).includes('wide'));assert.equal(engine.multipart.duplicateErrors,0);assert.equal(engine.localPorts.length,2);assert.ok(Object.values(engine.svgMissing).every(v=>!v));
    console.log('All UX verification assertions passed.');
    fs.mkdirSync('audit', { recursive: true });
    fs.writeFileSync('audit/schematic-ux-verification-results.json', JSON.stringify({ date: '2026-11-16', mode: 'Vite development / React StrictMode / Edge headless', observations }, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
