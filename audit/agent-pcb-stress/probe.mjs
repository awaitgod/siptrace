import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] ?? path.join(base,'runs'));
const root = path.resolve(base,'../..');
const origin = 'http://127.0.0.1:4198';
const server = spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port','4198','--strictPort'],{cwd:root,stdio:'ignore',windowsHide:true});
let browser;
try {
  for (let attempt=0; attempt<40; attempt++) {
    if (await fetch(origin).then(r => r.ok, () => false)) break;
    if (server.exitCode !== null || attempt === 39) throw new Error('Local Vite failed to start.');
    await new Promise(resolve => setTimeout(resolve,300));
  }
  browser = await chromium.launch({channel:'msedge'});
  const page = await browser.newPage();
  await page.goto(origin);
  const load = async id => JSON.parse(await fs.readFile(path.join(out,id,'checkpoint.json'),'utf8')).documents.pcb;
  const input = Object.fromEntries(await Promise.all(
    ['02-mirrored-crossbar','03-inner-layers','04-slalom','05-cutout','06-split-pours','09-dense-ladder','10-trace-classes']
      .map(async id => [id,await load(id)])
  ));
  const result = await page.evaluate(async input => {
    const [{createAgentWorkspace},{runPcbDrc,computeUnroutedRatlines,getWorldPads},{updateAllCopperPours}] = await Promise.all([
      import('/src/ui/modules/launcher/agent/workspace.ts'),
      import('/src/engines/drc.ts'),
      import('/src/engines/copperPour/index.ts')
    ]);
    const summary = pcb => ({
      ratlines:computeUnroutedRatlines(pcb),
      drc:runPcbDrc({...pcb,drcWaivers:{},designRules:{...pcb.designRules,checkUnroutedNets:true}}),
      layerUse:Object.fromEntries([...new Set(pcb.traces.map(t=>t.netName))].map(net => [
        net,[...new Set(pcb.traces.filter(t=>t.netName===net).map(t=>t.layer))].sort()
      ])),
      widths:Object.fromEntries([...new Set(pcb.traces.map(t=>t.netName))].map(net => [
        net,[...new Set(pcb.traces.filter(t=>t.netName===net).map(t=>t.width))].sort()
      ]))
    });
    const cases = [];
    for (const [id,original] of Object.entries(input)) {
      if (!original || id==='06-split-pours') continue;
      const blank = {...original,traces:[],vias:[],copperPours:[]};
      const workspace = createAgentWorkspace({documents:{pcb:blank},plan:''},'light');
      const initial = computeUnroutedRatlines(blank).length;
      try {
        const report = workspace.execute('auto_route',{});
        const board = workspace.draft.documents.pcb;
        cases.push({case:id,test:'auto_route с чистой разводкой',initial,report,...summary(board),board});
      } catch (error) {
        cases.push({case:id,test:'auto_route с чистой разводкой',initial,error:String(error)});
      }
    }
    const cutout = input['05-cutout'];
    if (cutout?.cutouts.length) {
      const workspace = createAgentWorkspace({documents:{pcb:{...cutout,traces:[],vias:[]}},plan:''},'light');
      const pads = getWorldPads(cutout);
      const padX = ref => pads.find(p => p.refDes === ref && p.pad.number === '1').x;
      const args = {from:{ref:'R1',pin:'1'},to:{ref:'R4',pin:'1'},net:'SENSE',layer:'TopCopper',width:cutout.designRules.defaultTraceWidth,
        waypoints:[{x:padX('R1'),y:20},{x:25,y:20},{x:padX('R4'),y:20}]};
      try {
        const report = workspace.execute('route_between_pads',args);
        const board = workspace.draft.documents.pcb;
        cases.push({case:'05-cutout',test:'Контрольная трасса через (25,20) внутри выреза',args,report,...summary(board),board});
      } catch (error) {
        cases.push({case:'05-cutout',test:'Контрольная трасса через (25,20) внутри выреза',args,error:String(error)});
      }
    }
    const poured = input['06-split-pours'];
    for (const clearance of [0.3,0.35,0.4,0.45,0.5]) {
      const board = updateAllCopperPours({...poured,copperPours:poured.copperPours.map(p=>({...p,clearance}))});
      cases.push({case:'06-split-pours',test:'Растровая заливка с заданным clearance',clearance,...summary(board),board});
    }
    return cases;
  }, input);
  for (const [index,item] of result.entries()) {
    if (!item.board) continue;
    const file = 'probe-' + String(index+1).padStart(2,'0') + '.gostpcb';
    await fs.writeFile(path.join(out,file),JSON.stringify(item.board,null,2));
    delete item.board;
    item.boardFile = file;
  }
  await fs.writeFile(path.join(out,'PROBES.json'),JSON.stringify(result,null,2));
  console.log(result.length,'local probes recorded');
} finally {
  await browser?.close();
  server.kill();
}
