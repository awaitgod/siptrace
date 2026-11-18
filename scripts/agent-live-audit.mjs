import { chromium } from 'playwright';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';

const endpoint = 'https://api.aitunnel.ru/v1';
const modules = (process.env.SIPTRACE_AUDIT_MODULES || 'client.ts,workspace.ts,instructions.ts').split(',');
const key = process.env.SIPTRACE_AUDIT_KEY;
if (!key) throw new Error('Set SIPTRACE_AUDIT_KEY in the process environment.');
const auditTimeout = 25 * 60_000;
const output = join(process.env.SIPTRACE_AUDIT_OUTPUT || 'audit/agent-runs', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(output, { recursive: true });
console.log(output);

const points = coordinates => coordinates.map(([x, y]) => ({ x, y }));
const rect = (x, y, w, h) => points([[x, y], [x+w, y], [x+w, y+h], [x, y+h]]);
const outline = rect(0, 0, 52, 44);
const pair = (...labels) => labels.map(label => {
  const [ref, pin] = label.split('.');
  return { ref, pin };
});
const chain = count => Object.fromEntries(Array.from({ length: count - 1 }, (_, i) =>
  ['N' + (i + 1), pair('R' + (i+1) + '.2', 'R' + (i+2) + '.1')]));
const row = [[7, 12], [19, 12], [31, 12], [43, 12]];
const grid = [...row, [43, 32], [31, 32], [19, 32], [7, 32]];
const top = 'TopCopper';
const bottom = 'BottomCopper';
const makePcb = (id, title, positions, boardNets, options = {}, note = '') => {
  const placed = positions.map(([x,y,side = 'Top',angle = 0], i) => ({
    ref: 'R' + (i + 1), x, y, side, angle, locked: true
  }));
  const requirements = { documents: 'pcb', boardRefs: placed.map(p => p.ref), boardNets,
    board: { width:52, height:44, outline, layers: 2, positions: placed, ...options } };
  return { id, requirements, task: title + '. Все корпуса PAT_CHIP_2012M. Координаты в мм. ' + note };
};
const makeLinked = (id, task, count, extra = {}) => {
  const refs = grid.slice(0,count).map((_, i) => 'R' + (i+1));
  const nets = chain(count);
  return { id, task, requirements: { documents:'both', schematicRefs:refs, schematicNets:nets,
    boardRefs:refs, boardNets:nets, board:{width:52,height:44,outline,layers:2}, ...extra } };
};
const defaultScenarios = [
  makePcb('01-serpentine', 'Восьмипозиционная последовательная цепочка', grid, chain(8),
    { routes: { N3: { allowedLayers: [top], width: 0.6 }, N5: { allowedLayers: [bottom], width: 0.45 } } }),
  makePcb('02-crossing', 'Две взаимно пересекающиеся сети и две периферийные связи',
    [[7,8],[44,36],[7,36,'Bottom'],[44,8,'Bottom'],[13,21],[38,21]], {
      A:pair('R1.1','R2.1'), B:pair('R3.1','R4.1'), C:pair('R5.2','R6.2'),
      D:pair('R1.2','R5.1'), E:pair('R4.2','R6.1')
    }, { routes:{ A:{allowedLayers:[top],width:.5}, B:{allowedLayers:[bottom],width:.5} } }),
  makePcb('03-cutout', 'Плата с центральным вырезом и двумя обходными маршрутами', grid,
    { A:pair('R1.1','R5.1'), B:pair('R4.1','R8.1'), N1:pair('R1.2','R2.1'),
      N2:pair('R2.2','R3.1'), N3:pair('R5.2','R6.1'), N4:pair('R6.2','R7.1') },
    { cutouts:[rect(20,16,12,13)], routes:{A:{minWidth:.55}, B:{minWidth:.4}} }),
  makePcb('04-keepouts', 'Две зоны запрета маршрутизации с узким коридором',
    [[7,7],[7,22],[7,37],[45,37],[45,22],[45,7]], chain(6),
    { keepouts:[{layer:'AllCopper',kind:'RouteKeepout',points:rect(21,2,10,16)},
      {layer:'AllCopper',kind:'RouteKeepout',points:rect(21,27,10,15)}] }),
  makePcb('05-mixed-side', 'Чередование стороны монтажа и ориентации в одной цепочке',
    [[7,12,'Top',90],[18,12,'Bottom',90],[29,12,'Top',180],[41,12,'Bottom',180],
      [41,32,'Top',270],[29,32,'Bottom',270],[18,32,'Top',0],[7,32,'Bottom',0]], chain(8)),
  makePcb('06-star-pour', 'Звезда GND с заливкой и последовательной сигнальной цепью', grid,
    { GND:pair(...grid.map((_,i) => 'R'+(i+1)+'.1')),
      SIG:pair(...grid.map((_,i) => 'R'+(i+1)+'.2')) },
    { pours:[{layer:bottom,net:'GND',outline:rect(1,1,50,42),clearance:.3}] }),
  makePcb('07-four-layer', 'Четырёхслойная плата с широкими внутренними маршрутами', grid,
    { A:pair('R1.1','R4.1','R6.1'), B:pair('R2.1','R5.1','R8.1'),
      C:pair('R3.1','R7.1'), D:pair('R1.2','R2.2'), E:pair('R3.2','R4.2'),
      F:pair('R5.2','R6.2'), G:pair('R7.2','R8.2') },
    { layers:4, routes:{A:{allowedLayers:[top,'Inner1'],minWidth:.7}, B:{allowedLayers:[top,'Inner2'],minWidth:.6}} }),
  makePcb('08-concave', 'Г-образная плата с обходом внутреннего угла',
    [[7,7],[18,7],[30,7],[44,7],[44,16],[18,19],[18,30],[7,36]], chain(8),
    { outline:points([[0,0],[52,0],[52,21],[24,21],[24,44],[0,44]]),
      routes:{N5:{allowedLayers:[top],minWidth:.5}} }),
  makeLinked('09-linked-erc', 'Схема Э3 и связанная плата. Цепочка из 8 резисторов COMP_R_R1_12_0805. Явно отметь оба крайних свободных вывода. Оформи лист A4, размещай символы и подписи читаемо. Проверь BOM и соответствие платы схеме.', 8,
    { designation:'AUD.009 Э3', values:{R1:'1 кОм',R2:'2 кОм',R3:'3 кОм',R4:'4 кОм',R5:'5 кОм',R6:'6 кОм',R7:'7 кОм',R8:'8 кОм'} }),
  makeLinked('10-offpage', 'Два листа A4 и связанная плата. По три резистора COMP_R_R1_12_0805 на листе, последовательно. N3 между R3 и R4 со встречными OffPage-портами. Отметь крайние свободные выводы.', 6,
    { designation:'AUD.010 Э3', sheets:[
      {name:'Вход',format:'A4_L',form:'Form1',refs:['R1','R2','R3'],ports:[{net:'N3',style:'OffPageOut'}]},
      {name:'Выход',format:'A4_L',form:'Form2a',refs:['R4','R5','R6'],ports:[{net:'N3',style:'OffPageIn'}]}
    ] })
];

const scenarios = process.env.SIPTRACE_AUDIT_SCENARIOS
  ? (await import(process.env.SIPTRACE_AUDIT_SCENARIOS)).scenarios
  : defaultScenarios;

const server = process.env.SIPTRACE_AUDIT_URL ? undefined : await createServer({
  server: { host: '127.0.0.1', port: 4180, hmr: false, watch: null }
});
await server?.listen();
const appUrl = process.env.SIPTRACE_AUDIT_URL || server?.resolvedUrls?.local[0];
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge' });
  const selected = (process.env.SIPTRACE_AUDIT_CASES || '').split(',').filter(Boolean);
  await Promise.all(scenarios.filter(item => !selected.length || selected.some(id => item.id.startsWith(id))).map(async scenario => {
    const dir = join(output, scenario.id);
    mkdirSync(dir);
    writeFileSync(join(dir, 'task.json'), JSON.stringify(scenario, null, 2));
    const initial = scenario.seed
      ? JSON.parse(readFileSync(scenario.seed, 'utf8')).draft.documents
      : {};
    const start = Date.now();
    const log = data => appendFileSync(join(dir, 'events.jsonl'), JSON.stringify({ ms: Date.now() - start, ...data }) + '\n');
    const context = await browser.newContext();
    const page = await context.newPage();
    const transport = new AbortController();
    await page.route(endpoint + '/**', async route => {
      const request = route.request();
      const headers = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'content-type' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status:204, headers });
      const input = request.postDataJSON();
      const path = new URL(request.url()).pathname;
      const started = Date.now();
      log({ kind:'request', path, model:input.model, tools:input.tools?.length, messages:input.messages?.length,
        bytes:Buffer.byteLength(request.postData() || ''), images:input.messages?.at(-1)?.content?.length && Array.isArray(input.messages.at(-1).content)
          ? input.messages.at(-1).content.filter(item => item.type === 'image_url').length : 0 });
      try {
        const response = await fetch(request.url(), { method:'POST',
          signal:AbortSignal.any([transport.signal, AbortSignal.timeout(175_000)]),
          headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + key }, body:request.postData() });
        const body = await response.text();
        const info = { kind:'http', path, status:response.status, duration:Date.now()-started };
        if (!response.ok) info.error = body.replaceAll(key, '[redacted]').slice(0, 1500);
        log(info);
        await route.fulfill({ status:response.status, contentType:'application/json', headers, body });
      } catch (error) {
        log({kind:'transport_error',path,error:String(error)});
        await route.abort().catch(() => {});
      }
    });
    await page.exposeFunction('auditEvent', log);
    let result;
    const deadline = setTimeout(() => {
      log({kind:'audit_timeout'});
      transport.abort();
      void context.close().catch(() => {});
    }, auditTimeout + 5000);
    try {
      await page.goto(appUrl);
      result = await page.evaluate(async ({ scenario, initial, endpoint, modules, auditTimeout }) => {
        const root = '/src/ui/modules/launcher/agent/';
        const [{runAgent}, {createAgentWorkspace}, {DEFAULT_AGENT_MODEL}] = await Promise.all(
          modules.map(name => import(root+name)));
        const ws = createAgentWorkspace({ documents:initial, plan:'' }, 'light');
        let error;
        try {
          const {seed, ...task} = scenario;
          await runAgent(ws, { key:'', endpoint, model:DEFAULT_AGENT_MODEL, task:JSON.stringify(task),
            signal:AbortSignal.timeout(auditTimeout),
            onEvent:event => {
              if (event.kind === 'chat') {
                const choice = event.response?.choices?.[0];
                const { content, reasoning_content, tool_calls } = choice?.message ?? {};
                const { response, ...meta } = event;
                void window.auditEvent({ ...meta, finishReason:choice?.finish_reason, content, reasoning_content, tool_calls });
              } else void window.auditEvent(event);
            }
          }, step => void window.auditEvent({kind:'step',step}),
          () => void window.auditEvent({kind:'progress', ...ws.getProgress()}));
        } catch (e) {
          error = String(e);
        }
        let finalCheck;
        if (ws.draft.documents.pcb || ws.draft.documents.schematic) {
          try { finalCheck = ws.execute('check', {}); } catch (e) { finalCheck = {error:String(e)}; }
        }
        return { error, finalCheck, draft:ws.draft, captures:[...ws.captures.values()] };
      }, {scenario, initial, endpoint, modules, auditTimeout});
    } catch (error) {
      result = {error:String(error)};
    } finally {
      clearTimeout(deadline);
      transport.abort();
      await context.close();
    }
    for (const capture of result.captures ?? []) {
      const name = capture.id.replace(/[^a-z0-9_-]/gi, '_');
      writeFileSync(join(dir, name+'.png'), Buffer.from(capture.url.split(',')[1], 'base64'));
    }
    delete result.captures;
    for (const [kind, extension] of [['schematic','gostsch'],['pcb','gostpcb']]) {
      const document = result.draft?.documents?.[kind];
      if (document) writeFileSync(join(dir, scenario.id + '.' + extension), JSON.stringify(document, null, 2));
    }
    result.durationMs = Date.now() - start;
    writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2));
    console.log(scenario.id, result.draft?.report?.status ?? result.error ?? 'no report', result.durationMs);
  }));
} finally {
  await browser?.close();
  await server?.close();
}
