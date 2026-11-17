import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = 'audit/agent-benchmark';
const tasks = JSON.parse((await fs.readFile(base + '/tasks.json', 'utf8')).replace(/^\uFEFF/, ''));
const models = ['deepseek-v4.1-flash-1017', 'claude-haiku-5.5', 'gpt-6-luna-pro'];
const key = process.env.SIPTRACE_BENCH_KEY;
if (!key) throw new Error('Set SIPTRACE_BENCH_KEY in the process environment.');
const out = process.env.SIPTRACE_BENCH_OUT ?? base + '/runs';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4189/');
  await page.exposeFunction('saveBenchResult', async result => {
    const dir = path.join(out, result.test.id, result.model);
    await fs.mkdir(dir, { recursive: true });
    for (const [index, capture] of result.captures.entries()) {
      const filename = 'capture-' + (index + 1) + '.png';
      await fs.writeFile(path.join(dir, filename), Buffer.from(capture.url.split(',')[1], 'base64'));
      delete capture.url;
      capture.file = filename;
    }
    for (const [kind, doc] of Object.entries(result.draft.documents)) {
      await fs.writeFile(path.join(dir, kind === 'pcb' ? 'board.gostpcb' : 'schematic.gostsch'), JSON.stringify(doc, null, 2));
    }
    delete result.draft.documents;
    await fs.writeFile(path.join(dir, 'run.json'), JSON.stringify(result, null, 2));
    console.log(result.test.id, result.model, result.error ?? 'finish', result.requests.length, 'requests');
  });
  await page.exposeFunction('benchEvent', async ({ testId, model, event }) => {
    const dir = path.join(out, testId, model);
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, 'events.ndjson'), JSON.stringify(event) + '\n');
  });
  await page.evaluate(async ({ tasks, models, key }) => {
    const [{ runAgent }, { createAgentWorkspace }, erc, drc] = await Promise.all([
      import('/src/ui/modules/launcher/agent/client.ts'),
      import('/src/ui/modules/launcher/agent/workspace.ts'),
      import('/src/engines/erc.ts'),
      import('/src/engines/drc.ts')
    ]);
    window.benchTransports = new Map();
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (url, options) => {
      if (url !== 'https://api.aitunnel.ru/v1/chat/completions') return originalFetch(url, options);
      const body = JSON.parse(options.body);
      const task = JSON.parse(body.messages[1].content).task;
      const log = window.benchTransports.get(body.model + '\n' + task);
      const started = Date.now();
      const imageCount = body.messages.flatMap(msg => Array.isArray(msg.content) ? msg.content : []).filter(item => item.type === 'image_url').length;
      try {
        const response = await originalFetch(url, options);
        const data = await response.clone().json().catch(() => ({}));
        log?.({ http: response.status, id: data.id ?? response.headers.get('x-request-id'), msApi: Date.now() - started, imageCount,
          usage: data.usage, finishReason: data.choices?.[0]?.finish_reason,
          callNames: data.choices?.[0]?.message?.tool_calls?.map(call => call.function.name),
          apiError: data.error?.message });
        return response;
      } catch (error) {
        log?.({ networkError: String(error), msApi: Date.now() - started, imageCount });
        throw error;
      }
    };
    await Promise.all(tasks.flatMap(test => models.map(async model => {
      const workspace = createAgentWorkspace({ documents: {}, plan: '' }, 'light');
      const execute = workspace.execute;
      const events = [];
      const requests = [];
      const pendingWrites = [];
      const started = Date.now();
      function record(event) {
        const entry = { ms: Date.now() - started, ...event };
        events.push(entry);
        pendingWrites.push(window.benchEvent({ testId: test.id, model, event: entry }));
      }
      workspace.execute = (name, args) => {
        try {
          const output = execute(name, args);
          record({ kind: 'tool', name, args, output: name === 'screenshot' ? { label: output.label } : output, ok: true });
          return output;
        } catch (error) {
          record({ kind: 'tool', name, args, error: String(error), ok: false });
          throw error;
        }
      };
      // runAgent resolves global fetch synchronously until the next await. The wrapper
      // identifies each run by the unchanged first user message and requested model.
      const task = test.task;
      const transportKey = model + '\n' + task;
      window.benchTransports.set(transportKey, item => {
        requests.push(item);
        record({ kind: 'api', ...item });
      });
      let error;
      try {
        await runAgent(workspace, { key, model, task, signal: AbortSignal.timeout(900000) },
          step => record({ kind: 'step', step }), () => {});
      } catch (err) {
        error = String(err);
      }
      const { schematic, pcb } = workspace.draft.documents;
      const independent = {};
      try {
        if (schematic) {
          independent.erc = erc.runSchematicErc(schematic);
          independent.nets = erc.extractSchematicNets(schematic).map(net => ({
            name: net.netName, pins: net.pins.map(pin => pin.refDes + '.' + pin.pinNumber), wires: net.wireIds
          }));
        }
        if (pcb) {
          independent.drc = drc.runPcbDrc({ ...pcb, drcWaivers: {}, designRules: { ...pcb.designRules, checkUnroutedNets: true } });
          independent.ratlines = drc.computeUnroutedRatlines(pcb);
        }
      } catch (err) {
        independent.error = String(err);
      }
      await Promise.allSettled(pendingWrites);
      await window.saveBenchResult({ test, model, error, durationMs: Date.now() - started, requests, events,
        independent, captures: [...workspace.captures.values()], draft: workspace.draft });
    })));
  }, { tasks, models, key });
} finally {
  await browser.close();
}
