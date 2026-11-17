import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tasks } from './tasks.mjs';

const base = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(base, process.env.SIPTRACE_BENCH_RUN ?? 'runs');
const key = process.env.SIPTRACE_BENCH_KEY;
if (!key) throw new Error('Missing SIPTRACE_BENCH_KEY.');
delete process.env.SIPTRACE_BENCH_KEY;
const root = path.resolve(base, '../..');
const model = 'deepseek-v4.1-flash-1017';
const origin = 'http://127.0.0.1:4197';
await fs.mkdir(out, { recursive: false });
await fs.writeFile(path.join(out, 'tasks.json'), JSON.stringify(tasks, null, 2));
await fs.cp(path.join(root, 'src/ui/modules/launcher/agent'), path.join(out, 'source'), {
  recursive: true, filter: filename => !/\.(?:tsx|css)$/.test(filename)
});

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
  '--port', '4197', '--strictPort'], {cwd:root, stdio:'ignore', windowsHide:true});
let browser;
try {
  for (let i=0; i<60; i++) {
    if (server.exitCode !== null) throw new Error('Vite terminated during startup.');
    if (await fetch(origin).then(response => response.ok, () => false)) break;
    if (i === 59) throw new Error('Vite did not start.');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  browser = await chromium.launch({ channel:'msedge' });
  const page = await browser.newPage();
  await page.goto(origin);
  for (const test of tasks) await fs.mkdir(path.join(out, test.id));
  const writeJson = (id, filename, data) => fs.writeFile(path.join(out,id,filename), JSON.stringify(data, null, 2));
  await page.exposeFunction('writeBenchEvent', (id,event) =>
    fs.appendFile(path.join(out,id,'events.ndjson'), JSON.stringify(event) + '\n'));
  await page.exposeFunction('writeBenchCheckpoint', (id,draft) => writeJson(id,'checkpoint.json',draft));
  await page.exposeFunction('writeBenchResult', async (id,result,documents,images) => {
    for (const [kind, document] of Object.entries(documents)) {
      await writeJson(id, kind === 'pcb' ? 'board.gostpcb' : 'schematic.gostsch', document);
    }
    for (const [i,image] of images.entries()) {
      const filename = 'final-' + (i+1) + '.png';
      await fs.writeFile(path.join(out,id,filename), Buffer.from(image.url.split(',')[1],'base64'));
      result.images.push({file:filename, label:image.label, revision:image.revision});
    }
    await writeJson(id,'result.json',result);
    console.log(id, result.status, result.error ?? '', result.durationMs + ' ms');
  });
  const started = new Date().toISOString();
  await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({started,model,parallel:tasks.length},null,2));
  console.log('Starting',tasks.length,'concurrent jobs using',model);
  await page.evaluate(async ({tasks,key,model}) => {
    const [{ runAgent }, { createAgentWorkspace }, erc, drc, compare] = await Promise.all([
      import('/src/ui/modules/launcher/agent/client.ts'),
      import('/src/ui/modules/launcher/agent/workspace.ts'),
      import('/src/engines/erc.ts'),
      import('/src/engines/drc.ts'),
      import('/src/engines/netlist/pcbCompareAndAnnotate.ts')
    ]);
    const handlers = new Map();
    const fetchProvider = window.fetch.bind(window);
    window.fetch = async (url,options) => {
      if (!String(url).startsWith('https://api.aitunnel.ru/v1/')) return fetchProvider(url,options);
      const endpoint = String(url).endsWith('/decisions') ? 'decisions' : 'chat';
      const body = JSON.parse(options.body);
      const task = endpoint === 'chat' ? JSON.parse(body.messages[1].content).task : body.state.task;
      const record = handlers.get(task);
      const start = performance.now();
      const images = (body.messages ?? []).flatMap(message => Array.isArray(message.content) ? message.content : [])
        .filter(item => item.type === 'image_url');
      const request = record?.({kind:'request',endpoint,bytes:new Blob([options.body]).size,
        imageCount:images.length, imageBytes:images.reduce((sum,item) => sum + item.image_url.url.length,0)});
      try {
        const response = await fetchProvider(url,options);
        const payload = await response.clone().json().catch(() => ({}));
        record?.({kind:'response',endpoint,request,http:response.status,msApi:Math.round(performance.now()-start),
          id:payload.id ?? response.headers.get('x-request-id'),model:payload.model,usage:payload.usage,
          retryAfter:response.headers.get('retry-after'),error:payload.error?.message ?? payload.message,
          finishReason:payload.choices?.[0]?.finish_reason});
        return response;
      } catch (error) {
        record?.({kind:'response',endpoint,request,msApi:Math.round(performance.now()-start),error:String(error)});
        throw error;
      }
    };
    await Promise.all(tasks.map(async test => {
      const started = performance.now();
      const workspace = createAgentWorkspace({documents:{},plan:''},'light');
      const execute = workspace.execute.bind(workspace);
      let seq = 0;
      let writes = Promise.resolve();
      const queue = operation => { writes = writes.then(operation); };
      const elapsed = () => Math.round(performance.now()-started);
      const record = event => {
        const entry = {seq:++seq,ms:elapsed(),...event};
        queue(() => window.writeBenchEvent(test.id,entry));
        return entry.seq;
      };
      handlers.set(test.task,record);
      let checkCount = 0;
      workspace.execute = (name,args) => {
        const from = performance.now();
        const before = execute('inspect',{}).revision;
        try {
          const output = execute(name,args);
          const after = execute('inspect',{}).revision;
          if (name !== 'inspect') {
            const detail = name === 'screenshot' || name === 'render_review'
              ? {label:output.label,revision:output.revision,bytes:output.url.length}
              : name === 'finalize_project'
                ? {...output,captures:output.captures.map(({id,label,revision}) => ({id,label,revision}))}
                : ['check','compare_requirements'].includes(name) ? output : undefined;
            record({kind:'execution',name,before,after,msLocal:performance.now()-from,ok:true,detail});
            if (['check','finalize_project','compare_requirements'].includes(name)) checkCount++;
          }
          return output;
        } catch (error) {
          record({kind:'execution',name,before,msLocal:performance.now()-from,ok:false,error:String(error)});
          throw error;
        }
      };
      const checkpoint = () => {
        const snapshot = structuredClone(workspace.draft);
        queue(() => window.writeBenchCheckpoint(test.id,snapshot));
      };
      let error;
      record({kind:'start'});
      try {
        await runAgent(workspace,{key,model,task:test.task,signal:AbortSignal.timeout(1_500_000),
          onEvent:event => {
            if (event.kind === 'chat') {
              const {response,...meta} = event;
              const choice = response.choices?.[0];
              record({...meta, finishReason:choice?.finish_reason, message:choice?.message});
            } else record(event);
          }}, step => record({kind:'step',step}), checkpoint);
      } catch (err) {
        error = String(err);
      }
      checkpoint();
      const durationMs = elapsed();
      const {schematic,pcb} = workspace.draft.documents;
      const actual = execute('inspect',{});
      const independent = {};
      try {
        if (schematic) {
          independent.erc = erc.runSchematicErc(schematic);
          independent.nets = erc.extractSchematicNets(schematic).map(net => ({
            name:net.netName,pins:net.pins.map(pin => pin.refDes + '.' + pin.pinNumber),wires:net.wireIds
          }));
        }
        if (pcb) {
          const strict = {...pcb,drcWaivers:{},designRules:{...pcb.designRules,checkUnroutedNets:true}};
          independent.drc = drc.runPcbDrc(strict);
          independent.ratlines = drc.computeUnroutedRatlines(strict);
        }
        if (schematic && pcb) independent.comparison = compare.comparePcbToSchematic(schematic,pcb);
        if (schematic || pcb) independent.finalCheck = execute('check',{});
      } catch (err) {
        independent.error = String(err);
      }
      const images = [];
      for (const item of [...(schematic?.sheets ?? []).map(sheet => ({target:'schematic',sheet:sheet.id})),
        ...(pcb ? [{target:'pcb'}] : [])]) {
        try { images.push(execute('screenshot',item)); }
        catch (err) { record({kind:'audit_render_error',error:String(err)}); }
      }
      const {documents,...draft} = workspace.draft;
      record({kind:'end',error,durationMs});
      await writes;
      await window.writeBenchResult(test.id,{
        id:test.id,model,status:draft.report?.status ?? 'unfinished',error,durationMs,
        checkCount,actual,independent,draft:{...draft,checks:actual.currentChecks},images:[]
      },documents,images);
    }));
  },{tasks,key,model});
} finally {
  await browser?.close();
  server.kill();
}
