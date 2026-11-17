import { reviewAgentActions, type AgentEvent } from './decisions';
import { toolDefinitions, commands, type CommandName } from './commands';
import { AGENT_INSTRUCTIONS } from './instructions';
import type { AgentCapture, createAgentWorkspace } from './workspace';

type Workspace = ReturnType<typeof createAgentWorkspace>;
type RequestMessage = Record<string, unknown> & { role: string };
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

const endpoint = 'https://api.aitunnel.ru/v1/chat/completions';
const maxTurns = 50;

export async function runAgent(
  workspace: Workspace,
  settings: { key: string; model: string; task: string; previousTask?: string; signal: AbortSignal; onEvent?: (event: AgentEvent) => void },
  onStep: (message: string) => void,
  checkpoint: () => void
): Promise<void> {
  const { key, model, task, signal, previousTask } = settings;
  const messages: RequestMessage[] = [
    { role: 'system', content: AGENT_INSTRUCTIONS },
    { role: 'user', content: JSON.stringify({ task, previousTask, plan: workspace.draft.plan, previousReport: workspace.draft.report }) }
  ];
  const emit = settings.onEvent ?? (() => {});
  const history: { name: string; args: unknown; ok: boolean; error?: string }[] = [];
  let lastCheck: unknown;
  let repairFailures = 0;
  let reviewDeferrals = 0;
  let consecutiveErrors = 0;
  for (let turn = 0; turn < maxTurns; turn++) {
    signal.throwIfAborted();
    onStep('Запрос к модели ' + (turn + 1) + '/' + maxTurns);
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]),
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, tools: toolDefinitions, tool_choice: 'required', max_tokens: 8192 })
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('AITUNNEL отклонил ключ или доступ к модели.');
      if (response.status === 402) throw new Error('AITUNNEL отклонил запрос по балансу.');
      if (response.status === 429) throw new Error('Достигнут лимит запросов AITUNNEL. Черновик можно продолжить.');
      throw new Error('Ошибка AITUNNEL (HTTP ' + response.status + '). Проверьте доступность модели и поддержку инструментов.');
    }
    const data = await response.json() as { id?: string; usage?: unknown; choices?: { message?: RequestMessage; finish_reason?: string }[] };
    emit({ kind: 'chat', id: data.id, model, usage: data.usage, response: data });
    signal.throwIfAborted();
    const choice = data.choices?.[0];
    const message = choice?.message;
    const calls = message?.tool_calls as ToolCall[] | undefined;
    if (!message || !Array.isArray(calls) || calls.length === 0) {
      if (choice?.finish_reason === 'content_filter') throw new Error('Провайдер остановил ответ модели.');
      if (++consecutiveErrors >= 3) throw new Error('Модель трижды ответила без команд.');
      messages.push({ role: 'user', content: 'Ответ не содержал команд. Продолжи через tools, по возможности сгруппируй однотипные действия.' });
      continue;
    }

    messages.push({
      role: 'assistant', content: message.content ?? null, tool_calls: calls,
      ...(typeof message.reasoning_content === 'string' ? { reasoning_content: message.reasoning_content } : {})
    });
    let intercepted: string | undefined;
    const risky = calls.some(call => ['finish', 'delete_schematic', 'delete_board', 'restore_verified', 'set_targets'].includes(call.function.name));
    if ((risky || repairFailures >= 2) && reviewDeferrals < 2) {
      try {
        onStep('Проверка действий · d1.2-ultra');
        const state = {
          task, plan: workspace.draft.plan, targets: workspace.draft.targets,
          actual: workspace.execute('inspect', {}), lastCheck,
          proposed: calls.map(call => ({ name: call.function.name, arguments: call.function.arguments })),
          recent: history.slice(-8)
        };
        const decision = await reviewAgentActions(state, key, signal, emit);
        if (decision.action === 'restore' && (state.actual as { canRestoreVerified?: boolean }).canRestoreVerified) {
          workspace.execute('restore_verified', {});
          lastCheck = undefined;
          intercepted = 'Контролёр восстановил последнюю проверенную версию. Проверь inspect, check и сделай новые снимки.';
        } else if (decision.action !== 'continue') {
          intercepted = 'Контролёр отклонил пакет как потенциальную регрессию или несоответствие ТЗ. Сверь последние ошибки с inspect, сохрани обязательные объекты и предложи локальное исправление. Данные решения: ' + JSON.stringify(decision);
        }
        if (intercepted) {
          reviewDeferrals++;
          emit({ kind: 'checkpoint', intervention: intercepted, decision });
          onStep('Контролёр запросил пересмотр действий');
        } else reviewDeferrals = 0;
      } catch (error) {
        signal.throwIfAborted();
        emit({ kind: 'decision_error', error: error instanceof Error ? error.message : String(error) });
        onStep('Контролёр недоступен · действуют проверки SIPTrace');
      }
    }
    const images: AgentCapture[] = [];
    let hadSuccessfulCall = false;
    for (const call of calls) {
      signal.throwIfAborted();
      const name = call.function.name as CommandName;
      let output: unknown;
      try {
        if (intercepted) throw new Error(intercepted);
        if (!Object.hasOwn(commands, name)) throw new Error('Неизвестная команда.');
        if (name === 'finish' && calls.length !== 1) throw new Error('finish выполняется отдельно после просмотра PNG.');
        const args: unknown = JSON.parse(call.function.arguments);
        output = workspace.execute(name, args);
        if (name === 'screenshot') {
          const capture = output as AgentCapture;
          images.push(capture);
          output = { label: capture.label, captured: true };
        }
        if (name === 'check') lastCheck = output;
        history.push({ name, args, ok: true });
        emit({ kind: 'tool', name, args, ok: true, output });
        repairFailures = 0;
        hadSuccessfulCall = true;
        onStep('Готово · ' + name);
        if (name === 'finish') {
          checkpoint();
          return;
        }
      } catch (error) {
        output = { error: error instanceof Error ? error.message : 'Ошибка команды' };
        history.push({ name, args: call.function.arguments, ok: false, error: (output as { error: string }).error });
        emit({ kind: 'tool', name, args: call.function.arguments, ok: false, output, intercepted: Boolean(intercepted) });
        if (!intercepted) repairFailures++;
        onStep('Ошибка · ' + name);
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) });
    }
    checkpoint();
    if (!intercepted && !hadSuccessfulCall && ++consecutiveErrors >= 5) throw new Error('Пять ответов подряд содержали команды с ошибками.');
    if (hadSuccessfulCall) consecutiveErrors = 0;
    if (images.length) {
      // Keep old tool records and their image labels, but do not resend outdated PNG data.
      for (const message of messages) {
        if (Array.isArray(message.content) && message.role === 'user') {
          message.content = 'Предыдущее изображение документа. Для повторного просмотра вызови screenshot.';
        }
      }
      messages.push({
        role: 'user',
        content: images.flatMap(image => [
          { type: 'text', text: 'Снимок документа «' + image.label + '». Проверь эту версию визуально.' },
          { type: 'image_url', image_url: { url: image.url } }
        ])
      });
    }
  }
  throw new Error('Достигнут лимит запросов. Продолжите работу с сохранённым черновиком.');
}
