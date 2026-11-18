import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('Pass the path printed by agent-live-audit.mjs.');
const entries = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory());
const counts = items => Object.fromEntries([...new Set(items)].sort().map(item =>
  [item, items.filter(value => value === item).length]));

for (const entry of entries) {
  const dir = join(root, entry.name);
  const read = (name, fallback) => existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : fallback;
  const events = read('events.jsonl', '').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const result = JSON.parse(read('result.json', 'null'));
  const tools = events.filter(event => event.kind === 'tool');
  const chats = events.filter(event => event.kind === 'chat');
  const decisions = events.filter(event => event.kind === 'decision');
  const http = events.filter(event => event.kind === 'http');
  const last = events.findLast(event => event.kind === 'progress');
  const sum = (records, metric) => records.reduce((total, record) => total + (metric(record) ?? 0), 0);
  const noRoute = tools.filter(event => event.ok && (
    (event.name === 'route_net' && event.output?.applied === false && !event.output.previewId) ||
    (event.name === 'auto_route' && !event.output?.addedTraces)
  ));
  console.log(JSON.stringify({
    scenario:entry.name, status:result ? result.draft?.report?.status ?? 'error' : 'running',
    seconds:Math.round((result?.durationMs ?? events.at(-1)?.ms ?? 0) / 1000),
    requests:counts(http.map(event => event.path + ' ' + event.status)),
    chat:chats.length, decisions:decisions.length,
    promptTokens:sum(chats, event => event.usage?.prompt_tokens),
    responseTokens:sum(chats, event => event.usage?.completion_tokens),
    decisionsRub:sum(decisions, event => event.usage?.cost_rub),
    failedTools:counts(tools.filter(event => !event.ok).map(event => event.name)),
    stalledRoutes:noRoute.length,
    tools:counts(tools.map(event => event.name)),
    sequence:tools.map(event => event.name + (!event.ok ? '!' : noRoute.includes(event) ? '~' : '')),
    phase:last?.phase, revision:last?.revision, unrouted:result?.draft?.checks?.unrouted,
    blockers:result?.finalCheck?.blockers ?? last?.blockers, error:result?.error
  }));
}
