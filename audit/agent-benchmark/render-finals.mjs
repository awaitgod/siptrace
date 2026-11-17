import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = 'audit/agent-benchmark';
const models = ['claude-haiku-5.5', 'deepseek-v4.1-flash-1017'];
const tasks = JSON.parse((await fs.readFile(root + '/tasks.json','utf8')).replace(/^\uFEFF/,''));
const read = async file => { try { return JSON.parse(await fs.readFile(file,'utf8')); } catch { return undefined; } };
const browser = await chromium.launch({ channel:'msedge' });
try {
  const page = await browser.newPage({ viewport: {width: 1600,height: 1100} });
  await page.goto('http://127.0.0.1:4189/');
  for (const task of tasks) for (const model of models) {
    const dir = path.join(root,'runs',task.id,model);
    const run = await read(path.join(dir,'run.json'));
    if (!run) continue;
    const schematic = await read(path.join(dir,'schematic.gostsch'));
    const pcb = await read(path.join(dir,'board.gostpcb'));
    const targets = [...(schematic?.sheets ?? []).map(sheet => ({id: sheet.id, label: sheet.name, board:false})),
      ...(pcb ? [{id:'pcb', label:'Печатная плата', board:true}] : [])].filter(item => !run.captures.some(capture => capture.id === item.id));
    if (!targets.length) continue;
    const rendered = await page.evaluate(async ({schematic,pcb,targets}) => {
      const {drawLauncherPreview} = await import('/src/ui/modules/launcher/drawLauncherPreview.ts');
      const container = document.createElement('div');
      container.style.cssText='position:fixed;top:0;left:-3000px;width:1600px;height:1100px';
      const canvas = document.createElement('canvas');
      container.append(canvas);
      document.body.append(container);
      try {
        return targets.map(item => {
          drawLauncherPreview(canvas,container,{schematic,pcb},item.board,'light',item.board ? undefined : item.id);
          return {...item,url:canvas.toDataURL('image/png')};
        });
      } finally { container.remove(); }
    }, {schematic,pcb,targets});
    for (const [index,item] of rendered.entries()) {
      item.file='audit-final-'+(index+1)+'.png';
      await fs.writeFile(path.join(dir,item.file),Buffer.from(item.url.split(',')[1],'base64'));
      delete item.url;
    }
    await fs.writeFile(path.join(dir,'audit-captures.json'),JSON.stringify(rendered,null,2));
  }
} finally { await browser.close(); }
