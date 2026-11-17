import { test, expect, Page } from '@playwright/test';
import { fixture } from '../fixtures/editorProject';
const key = 'gosttrace_active_schematic_v2';
async function read(page: Page) { return page.evaluate(k => JSON.parse(localStorage.getItem(k)!), key); }
async function xy(page: Page, x: number, y: number) { const b = (await page.locator('.dt-canvas-wrap canvas').boundingBox())!; const z = Math.max(.4, Math.min((b.width - 36) / 297, (b.height - 28) / 210)); return { x: b.x + b.width / 2 + (x - 148.5) * z, y: b.y + b.height / 2 + (y - 105) * z }; }
async function click(page: Page, x: number, y: number, button: 'left' | 'right' = 'left') { const p = await xy(page, x, y); await page.mouse.click(p.x, p.y, { button }); }
async function drag(page: Page, x1: number, y1: number, x2: number, y2: number) { const a = await xy(page, x1, y1), b = await xy(page, x2, y2); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up(); }
test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); await page.addInitScript(({ key, project }) => localStorage.setItem(key, JSON.stringify(project)), { key, project: fixture() }); await page.goto('/?module=schematic'); await expect(page.locator('.dt-right-sidebar')).toContainText('R1'); await page.waitForTimeout(150); });
test('a highlighted pin starts a wire in Select, right click and Escape cancel', async ({ page }) => {
    await click(page, 65, 75);
    await expect(page.getByTitle('Проложить провод (W)', { exact: true })).toHaveClass(/active/);
    await click(page, 135, 75);
    await expect.poll(async () => (await read(page)).sheets[0].wires.length).toBe(3);
    await page.keyboard.press('w');
    await click(page, 150, 150, 'right');
    await expect(page.getByTitle('Режим выделения (Esc)', { exact: true })).toHaveClass(/active/);
    await page.keyboard.press('w');
    await click(page, 150, 150);
    await page.keyboard.press('Escape');
    await expect(page.getByTitle('Режим выделения (Esc)', { exact: true })).toHaveClass(/active/);
});
test('marquee Delete, Undo and Redo operate atomically on every entity', async ({ page }) => {
    await drag(page, 50, 50, 150, 130);
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await read(page)).sheets[0].wires.length).toBe(0);
    expect((await read(page)).sheets[0].shapes).toHaveLength(0);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await read(page)).sheets[0].wires.length).toBe(2);
    expect((await read(page)).sheets[0].netPorts).toHaveLength(1);
    await page.keyboard.press('Control+y');
    await expect.poll(async () => (await read(page)).sheets[0].components.length).toBe(0);
});
test('group drag moves junction, branch, port and notes with one undo', async ({ page }) => {
    await drag(page, 50, 50, 150, 130);
    await drag(page, 75, 75, 85, 85);
    await expect.poll(async () => (await read(page)).sheets[0].junctions[0].x).toBe(110);
    const s = (await read(page)).sheets[0];
    expect(s.netPorts[0]).toMatchObject({ x: 110, y: 110 });
    expect(s.shapes[0]).toMatchObject({ x: 90, y: 120 });
    expect(s.wires[1].points[0]).toEqual({ x: 110, y: 85 });
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await read(page)).sheets[0].components[0].x).toBe(75);
    await expect(page.getByTitle('Отменить (Ctrl+Z)', { exact: true })).toBeDisabled();
});
test('context deletion has one target and the menu supports Escape', async ({ page }) => {
    await click(page, 75, 75);
    await click(page, 100, 87.5, 'right');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await click(page, 100, 87.5, 'right');
    await page.getByRole('menuitem', { name: 'Удалить провод', exact: true }).click();
    await expect.poll(async () => (await read(page)).sheets[0].wires.length).toBe(1);
    expect((await read(page)).sheets[0].components).toHaveLength(2);
});
test('copy and preview paste preserve an entire fragment and select the result', async ({ page }) => {
    await drag(page, 50, 50, 150, 130);
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    expect((await read(page)).sheets[0].components).toHaveLength(2);
    await click(page, 180, 140);
    await expect.poll(async () => (await read(page)).sheets[0].wires.length).toBe(4);
    const s = (await read(page)).sheets[0];
    expect(s.components.map((c: any) => c.refDes)).toEqual(['R1', 'R2', 'R3', 'R4']);
    expect(s.netPorts).toHaveLength(2);
    await expect(page.locator('.dt-tree-row.selected')).toHaveCount(2);
});
test('rotation moves the labels and remains one history command', async ({ page }) => {
    await click(page, 75, 75);
    await page.keyboard.press('r');
    await expect.poll(async () => (await read(page)).sheets[0].components[0].angle).toBe(90);
    expect((await read(page)).sheets[0].components[0].refDesOffset.x).toBeCloseTo(8);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await read(page)).sheets[0].components[0].angle).toBe(0);
    await expect(page.getByTitle('Отменить (Ctrl+Z)', { exact: true })).toBeDisabled();
});
test('releasing outside canvas ends drag and subsequent movement cannot alter the project', async ({ page }) => {
    const a = await xy(page, 75, 75);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 30, 10, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(350);
    const before = (await read(page)).sheets[0].components[0];
    const b = await xy(page, 95, 95);
    await page.mouse.move(b.x, b.y);
    await page.waitForTimeout(350);
    expect((await read(page)).sheets[0].components[0]).toEqual(before);
});
test('plus, select all, nudge and cut work as editor commands', async ({ page }) => {
    const zoom = await page.locator('.dt-tb-select').first().locator('option:checked').innerText();
    await page.keyboard.press('+');
    await expect(page.locator('.dt-tb-select').first().locator('option:checked')).not.toHaveText(zoom);
    // Restore the known view through Home before using sheet coordinates.
    await page.keyboard.press('Home');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await read(page)).sheets[0].components[0].x).toBe(77.5);
    await page.keyboard.press('Control+x');
    await expect.poll(async () => (await read(page)).sheets[0].components.length).toBe(0);
});
test('properties edit arbitrary text and Escape respects modal focus', async ({ page }) => {
    await click(page, 83, 111);
    await page.keyboard.press('e');
    const dialog = page.getByRole('dialog', { name: 'Свойства объектов' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Текст', { exact: true }).fill('Edited < note');
    await dialog.getByRole('button', { name: 'Применить' }).click();
    await expect.poll(async () => (await read(page)).sheets[0].shapes[0].text).toBe('Edited < note');
    await page.keyboard.press('e');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
});
test('autosave failures are visible and the in-memory document remains editable', async ({ page }) => {
    await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('Full', 'QuotaExceededError'); }; });
    await click(page, 75, 75);
    await page.keyboard.press('r');
    await expect(page.locator('.dt-statusbar')).toContainText('ОШИБКА автосохранения');
    await expect(page).toHaveTitle(/\*/);
    await page.keyboard.press('Control+z');
    await expect(page.getByTitle('Повторить (Ctrl+Y)', { exact: true })).toBeEnabled();
});
test('mixed selection canvas matches the reviewed reference', async ({ page }) => {
    await drag(page, 50, 50, 150, 130);
    await page.mouse.move(10, 10);
    await expect(page.locator('.dt-canvas-wrap canvas')).toHaveScreenshot('schematic-mixed-selection.png', { animations: 'disabled', maxDiffPixelRatio: .001 });
});
test('switching modules preserves dirty state, selection, clipboard and Undo',async({page})=>{
 await click(page,75,75);await page.keyboard.press('r');await expect.poll(async()=> (await read(page)).sheets[0].components[0].angle).toBe(90);
 await page.keyboard.press('Control+c');
 await page.locator('.dt-menubar').getByText('Библиотека',{exact:true}).click();await page.getByText('Открыть Редактор компонентов (УГО ГОСТ)...',{exact:true}).click();
 await expect(page).toHaveURL(/module=componentEditor/);await page.goBack();await expect(page).toHaveURL(/module=schematic/);await expect(page).toHaveTitle(/\*/);
 await expect(page.locator('.dt-tree-row.selected')).toHaveCount(1);await page.keyboard.press('Control+z');await expect.poll(async()=> (await read(page)).sheets[0].components[0].angle).toBe(0);await expect(page.getByTitle('Вставить (Ctrl+V)',{exact:true})).toBeEnabled();
});
test('print creates clean vector sheets with dimensions and complete content',async({page})=>{
 await page.keyboard.press('Control+p');await expect(page.locator('#siptrace-print')).toHaveCount(1);
 const output=await page.locator('#siptrace-print').evaluate(async (frame:HTMLIFrameElement)=>{const doc=frame.contentDocument!; await doc.fonts.ready; return {sections:doc.querySelectorAll('section').length,text:doc.body.textContent,svg:doc.querySelector('svg')?.getAttribute('width'),embedded:doc.querySelector('svg style')?.textContent?.includes('data:font/ttf;base64,'),font:doc.fonts.check('12px OpenGost','Схема')};});
 expect(output.sections).toBe(1);expect(output.text).toContain('1k');expect(output.text).toContain('Audit < note & value');expect(output.text).not.toContain('Менеджер проекта');expect(output.svg).toBe('297mm');
 expect(output.embedded).toBe(true);expect(output.font).toBe(true);
});
test('launcher expansion fits the initial sheet once and later resize preserves zoom',async({page})=>{
 await page.setViewportSize({width:364,height:268});await page.goto('/?module=launcher');await page.getByRole('button',{name:'Редактор схем',exact:true}).click();
 await page.setViewportSize({width:1440,height:900});const zoom=page.locator('.dt-tb-select').first().locator('option:checked');await expect.poll(async()=>parseInt(await zoom.innerText(),10)).toBeGreaterThan(100);
 await page.keyboard.press('+');const before=await zoom.innerText();await page.setViewportSize({width:1280,height:800});await expect(zoom).toHaveText(before);
});
for (const wireDraft of [false, true]) test(`held middle button pans without hit testing or document edits (wire draft: ${wireDraft})`, async ({ page }) => {
    if(wireDraft){await page.keyboard.press('w');await click(page,150,150);}
    await page.evaluate(() => {
        const proto = CanvasRenderingContext2D.prototype;
        const originalSetTransform = proto.setTransform, originalTranslate = proto.translate;
        const armed = new WeakSet<CanvasRenderingContext2D>();
        proto.setTransform = function (...args: any[]) {
            if (this.canvas.matches('.dt-canvas-wrap canvas')) { armed.add(this); (window as any).__panPaints++; }
            return originalSetTransform.apply(this, args as any);
        };
        proto.translate = function (x, y) {
            if (armed.has(this)) { (window as any).__camera = { x, y }; armed.delete(this); }
            return originalTranslate.call(this, x, y);
        };
        // Smart snapping reads this geometry. Panning must not touch it.
        (window as any).__pinScans = 0; (window as any).__panPaints = 0;
        const hypot = Math.hypot;
        Math.hypot = (...values) => { (window as any).__pinScans++; return hypot(...values); };
    });
    const start = await xy(page, 160, 150);
    await page.mouse.move(start.x, start.y);
    await expect.poll(() => page.evaluate(() => !!(window as any).__camera)).toBe(true);
    const before = await page.evaluate(() => (window as any).__camera);
    const project = await read(page);
    await page.mouse.down({ button: 'middle' });
    await page.evaluate(() => { (window as any).__pinScans = 0; (window as any).__panPaints = 0; });
    await page.mouse.move(start.x + 120, start.y + 80, { steps: 8 });
    const counts = await page.evaluate(() => ({ scans: (window as any).__pinScans, paints: (window as any).__panPaints }));
    await page.mouse.up({ button: 'middle' });
    await expect.poll(() => page.evaluate(() => (window as any).__camera)).toEqual({ x: before.x + 120, y: before.y + 80 });
    // Four pin-length calculations per paint are expected; smart hit testing adds more.
    expect(counts.scans).toBeLessThanOrEqual(counts.paints * 4);
    expect(await read(page)).toEqual(project);
});
test('blank left click clears an object or mixed selection and disables destructive commands', async ({page}) => {
    const original=await read(page);
    await click(page,75,75);await expect(page.locator('.dt-tree-row.selected')).toHaveCount(1);
    await click(page,180,170);await expect(page.getByRole('button',{name:/^Свойства выделения/})).toBeDisabled();
    await page.keyboard.press('Delete');await page.waitForTimeout(300);expect(await read(page)).toEqual(original);
    await page.keyboard.press('Control+a');await expect(page.getByRole('button',{name:/^Свойства выделения/})).toBeEnabled();
    await click(page,180,170);await expect(page.getByRole('button',{name:/^Свойства выделения/})).toBeDisabled();
    await page.keyboard.press('r');await page.keyboard.press('ArrowRight');await page.waitForTimeout(300);expect(await read(page)).toEqual(original);
});
test('empty space within outline geometry clears selection instead of selecting its bounding box', async ({page}) => {
    const project=fixture();project.sheets[0].shapes.push({id:'outline',type:'rect',x:40,y:40,w:160,h:110,width:.35},{id:'diagonal',type:'line',x1:40,y1:40,x2:200,y2:150,width:.35},{id:'ring',type:'circle',cx:170,cy:130,r:40,width:.35});
    await page.addInitScript(({key,project})=>localStorage.setItem(key,JSON.stringify(project)),{key,project});await page.reload();await page.waitForTimeout(180);
    await click(page,40,60);await expect(page.getByRole('button',{name:/^Свойства выделения/})).toBeEnabled();
    await click(page,180,140);await expect(page.getByRole('button',{name:/^Свойства выделения/})).toBeDisabled();
    await page.keyboard.press('Delete');await page.waitForTimeout(300);expect((await read(page)).sheets[0].shapes).toHaveLength(4);
});
test('blank click also clears highlighted electrical nets',async({page})=>{
    await page.getByTitle('Цепи схемы',{exact:true}).click();await page.locator('.dt-tree-row').filter({hasText:'GND'}).click();await expect(page.locator('.dt-tree-row.selected')).toHaveCount(1);
    await click(page,180,170);await expect(page.locator('.dt-tree-row.selected')).toHaveCount(0);
    await expect(page.getByRole('button',{name:/^Свойства выделения/})).toBeDisabled();
});
test('another schematic window cannot echo selections back or restore a cleared selection',async({page,context})=>{
    const other=await context.newPage();
    const instrument=()=>{
        (window as any).__crossprobeSends=0;
        const send=BroadcastChannel.prototype.postMessage;
        BroadcastChannel.prototype.postMessage=function(data:any){if(data?.channel==='crossprobe:refdes'){(window as any).__crossprobeSends++;if((window as any).__crossprobeSends>8)return;}return send.call(this,data);};
    };
    try{
        await other.setViewportSize({width:1440,height:900});await other.goto(page.url());await expect(other.locator('.dt-right-sidebar')).toContainText('R1');
        await page.evaluate(instrument);await other.evaluate(instrument);await page.bringToFront();
        await click(page,75,75);await expect(page.locator('.dt-tree-row.selected')).toHaveCount(1);await page.waitForTimeout(250);
        expect(await other.evaluate(()=>(window as any).__crossprobeSends)).toBe(0);
        await click(page,180,170);await page.waitForTimeout(250);await expect(page.getByRole('button',{name:/^Свойства выделения/})).toBeDisabled();
        // A late reply from an older window must not overwrite the foreground click.
        await other.evaluate(()=>{const bc=new BroadcastChannel('gosttrace-eda-events');bc.postMessage({channel:'crossprobe:refdes',senderId:'legacy-window',payload:{refDes:'R1'}});bc.close();});
        await page.waitForTimeout(250);await expect(page.getByRole('button',{name:/^Свойства выделения/})).toBeDisabled();
        // Genuine PCB probing into a background schematic remains available and does not echo.
        // Headless browsers can keep both pages focused: let the local-input guard expire.
        await page.waitForTimeout(1100);
        await other.bringToFront();await other.evaluate(()=>{const bc=new BroadcastChannel('gosttrace-eda-events');bc.postMessage({channel:'crossprobe:refdes',senderId:'pcb-window',payload:{refDes:'R2',source:'pcb',target:'schematic'}});bc.close();});
        await expect(page.locator('.dt-tree-row.selected')).toContainText(['R2']);expect(await page.evaluate(()=>(window as any).__crossprobeSends)).toBe(1);
    }finally{await other.close();}
});
test('entering a drawing tool clears old selection and cancels an unfinished object drag',async({page})=>{
    const original=await read(page),start=await xy(page,75,75);
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+30,start.y+20,{steps:3});
    await page.keyboard.press('w');await expect(page.getByRole('button',{name:/^Свойства выделения/})).toBeDisabled();
    await page.mouse.up();await page.waitForTimeout(350);expect(await read(page)).toEqual(original);
    await page.keyboard.press('Escape');await click(page,180,170);await page.keyboard.press('Delete');await page.waitForTimeout(300);expect(await read(page)).toEqual(original);
});
test('middle-button chord does not commit a stale object drag or end when only left is released',async({page})=>{
    const original=await read(page),start=await xy(page,75,75);
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+30,start.y+20,{steps:3});
    await page.mouse.down({button:'middle'});await page.mouse.move(start.x+45,start.y+30);
    await page.mouse.up({button:'left'});await expect(page.locator('.dt-canvas-wrap canvas')).toHaveCSS('cursor','grabbing');
    await page.mouse.move(start.x+90,start.y+60,{steps:3});await page.mouse.up({button:'middle'});await expect(page.locator('.dt-canvas-wrap canvas')).not.toHaveCSS('cursor','grabbing');
    await page.waitForTimeout(350);expect(await read(page)).toEqual(original);
    const canvas=await page.locator('.dt-canvas-wrap canvas').boundingBox();await page.mouse.click(canvas!.x+canvas!.width-30,canvas!.y+canvas!.height-30);
    await expect(page.getByRole('button',{name:/^Свойства выделения/})).toBeDisabled();
});
