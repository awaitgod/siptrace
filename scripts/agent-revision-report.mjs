import { isDeepStrictEqual } from 'node:util';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { scenarios } from './agent-revision-scenarios.mjs';

const roots = process.argv.slice(2);
if (!roots.length) throw new Error('Pass one or more run directories.');
const cell = value => String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ');
const row = (...values) => '| ' + values.map(cell).join(' | ') + ' |';
const seconds = ms => (ms / 1000).toFixed(2);
const sum = (events, read) => events.reduce((total, event) => total + (read(event) ?? 0), 0);
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const table = (headers, rows) => [row(...headers), row(...headers.map(() => '---')), ...rows.map(items => row(...items))].join('\n');

function compareDocuments(scenario, actual) {
  const original = readJson(scenario.seed).draft.documents;
  const { id, requirements } = scenario;
  const rename = id.startsWith('13') ? 'LINK_MID' : undefined;
  const boardEdit = id.startsWith('12') ? ['N4'] : id.startsWith('14') ? ['N3'] : id.startsWith('15') ? ['N5', 'N6'] : [];
  const mapNet = net => rename && net === 'N3' ? rename : net;
  const named = item => item.netName === mapNet(item.netName) ? item : { ...item, netName: mapNet(item.netName) };
  const records = [];
  const test = (label, expected, got) => records.push([label, isDeepStrictEqual(expected, got) ? 'да' : 'нет']);
  if (!actual?.schematic || !actual.pcb) return [['Оба редактируемых документа', 'нет']];
  test('ID и порядок листов', original.schematic.sheets.map(item => item.id), actual.schematic.sheets.map(item => item.id));
  if (id.startsWith('14')) test('Схема целиком без изменений', original.schematic, actual.schematic);
  for (const sheet of original.schematic.sheets) {
    const updated = actual.schematic.sheets.find(item => item.id === sheet.id);
    if (!updated) continue;
    const keepWires = sheet.wires.filter(item => !(id.startsWith('12') && item.netName === 'N4'));
    test('Лист ' + sheet.name + ': сохранённые провода (' + keepWires.length + ')', keepWires.map(named),
      keepWires.map(wire => updated.wires.find(item => item.id === wire.id)));
    test('Лист ' + sheet.name + ': порты (' + sheet.netPorts.length + ')', sheet.netPorts.map(named), updated.netPorts);
    const expectedParts = sheet.components.map(part => ({
      ...part, value: requirements.values?.[part.refDes] ?? part.value,
      patternId: id.startsWith('15') && part.refDes === 'R6' ? 'PAT_CHIP_1608M' : part.patternId
    }));
    test('Лист ' + sheet.name + ': исходные компоненты и требуемые правки',
      expectedParts, expectedParts.map(part => updated.components.find(item => item.id === part.id)));
  }
  const pcb = actual.pcb;
  test('Неизменённые PCB-дорожки и via', [...original.pcb.traces, ...original.pcb.vias]
    .filter(item => !boardEdit.includes(item.netName)).map(named),
  [...pcb.traces, ...pcb.vias].filter(item => !boardEdit.includes(item.netName) && !(id.startsWith('12') && item.netName === 'N4B')));
  test('ID, позиции, номиналы и корпуса', requirements.board.positions.map(position => {
    const part = original.pcb.components.find(item => item.refDes === position.ref);
    return [position.ref, part?.id ?? null, position.x, position.y, position.angle, position.side,
      requirements.values?.[position.ref] ?? part?.value,
      id.startsWith('15') && position.ref === 'R6' ? 'PAT_CHIP_1608M' : part?.patternId ?? 'PAT_CHIP_2012M'];
  }), requirements.board.positions.map(({ref}) => {
    const part = pcb.components.find(item => item.refDes === ref);
    const existing = original.pcb.components.some(item => item.refDes === ref);
    return part && [part.refDes, existing ? part.id : null, part.x, part.y, part.angle, part.side, part.value, part.patternId];
  }));
  test('Переходы между слоями и исходные заливки', original.pcb.copperPours.map(named), pcb.copperPours);
  if (id.startsWith('13')) {
    test('ID, геометрия и назначения площадок при переименовании', original.pcb.components.map(part => ({
      ...part, padNets: Object.fromEntries(Object.entries(part.padNets).map(([pin, net]) => [pin, mapNet(net)]))
    })), pcb.components);
  }
  return records;
}

function collect(dir, scenario) {
  const events = readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const path = join(dir, 'result.json');
  const result = existsSync(path) ? readJson(path) : undefined;
  const calls = events.filter(event => event.kind === 'tool');
  const chat = events.filter(event => event.kind === 'chat');
  const http = events.filter(event => event.kind === 'http');
  const decisions = events.filter(event => event.kind === 'decision');
  const progress = events.findLast(event => event.kind === 'progress');
  const label = result?.draft?.report?.status ?? (result?.error ? 'остановка' : 'нет итогового файла');
  const millis = result?.durationMs ?? events.at(-1)?.ms ?? 0;
  console.log('### ' + scenario.id + '\n');
  console.log(table(['Статус', 'Секунды', 'HTTP, с', 'Ответы модели', 'Команды', 'Отказы', 'Контролёр', 'Вход', 'Выход'], [[
    label, seconds(millis), seconds(sum(http, event => event.duration)), chat.length, calls.length,
    calls.filter(item => !item.ok).length, decisions.length,
    sum(chat, event => event.usage?.prompt_tokens), sum(chat, event => event.usage?.completion_tokens)
  ]]) + '\n');

  const turns = [];
  let current;
  for (const event of events) {
    if (event.kind === 'request' && event.path.endsWith('/chat/completions')) {
      current = { request: event, http: [], actions: [] };
      turns.push(current);
    }
    if (!current) continue;
    if (event.kind === 'http') current.http.push(event);
    if (event.kind === 'chat') current.response = event;
    if (event.kind === 'tool') current.actions.push(event);
    if (event.kind === 'progress') current.progress = event;
    if (event.kind === 'decision') current.decision = event;
  }
  console.log(table(['Ход', 'HTTP, с', 'Вход / выход', 'PNG', 'Действия по порядку', 'Ревизия, фаза'], turns.map((turn, index) => [
    index + 1, turn.http.map(event => seconds(event.duration)).join(' + '),
    turn.response ? [turn.response.usage?.prompt_tokens, turn.response.usage?.completion_tokens].join(' / ') : '—',
    turn.request.images, [
      turn.decision && 'контролёр ' + turn.decision.answers.action.choice + (turn.decision.enforced ? ' (применено)' : ''),
      ...turn.actions.map(event => event.name + (event.ok ? '' : ' ×')),
      !turn.actions.length && (turn.response?.finishReason || 'без команды')
    ].filter(Boolean).join(' → '),
    turn.progress && turn.progress.revision + ', ' + turn.progress.phase
  ])) + '\n');

  for (const event of calls.filter(item => !item.ok)) {
    console.log('- ' + seconds(event.ms) + ' с, `' + event.name + '`. ' + event.output.error);
  }
  const blockers = result?.finalCheck?.blockers ?? progress?.blockers ?? [];
  for (const blocker of blockers) console.log('- Блокер. ' + blocker);
  if (result?.error) console.log('- Остановка. ' + result.error);
  const report = result?.draft?.report;
  if (report) console.log('- Проверка из отчёта. ' + report.verification);
  if (result?.draft?.documents) {
    const checks = compareDocuments(scenario, result.draft.documents);
    console.log('\n' + table(['Сверка с исходным документом и ТЗ', 'Совпало'], checks));
  }
  console.log('');
}

for (const root of roots) {
  console.log('## ' + root.split(/[\\/]/).filter(Boolean).slice(-2).join('/') + '\n');
  for (const id of readdirSync(root)) {
    const scenario = scenarios.find(item => item.id === id);
    if (scenario && existsSync(join(root, id, 'events.jsonl'))) collect(join(root, id), scenario);
  }
}
