import { reviewAgentActions, type AgentEvent } from './decisions';
import { toolDefinitions, commands, type CommandName } from './commands';
import { AGENT_INSTRUCTIONS } from './instructions';
import { RouteConflict } from './pcbChecks';
import type { AgentCapture, createAgentWorkspace } from './workspace';

type Workspace = ReturnType<typeof createAgentWorkspace>;
type Progress = ReturnType<Workspace['getProgress']>;
type RequestMessage = Record<string, unknown> & { role: string };
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
type Attempt = { name: string; args?: unknown; ok: boolean; error?: string };
type ToolFailure = { code: string; error: string; conflicts?: RouteConflict['conflicts'] };
type PreparedCall = { call: ToolCall; name: CommandName; args?: unknown; signature?: string; failure?: ToolFailure };

const maxTurns = 50;
const schematicTools = new Set<CommandName>([
  'create_schematic', 'add_sheet', 'set_frame', 'configure_document', 'define_pattern', 'define_component',
  'place_component', 'set_component_labels', 'set_component_values', 'sync_board_from_schematic', 'move_schematic', 'delete_schematic', 'wire', 'connect_net',
  'add_sheet_text', 'mark_no_connect', 'simulate', 'bom'
]);
const reviewCommands = new Set<CommandName>(['check', 'compare_requirements', 'finalize_project', 'screenshot', 'render_review']);
const routingCommands: CommandName[] = ['route_net', 'route_remaining', 'route_between_pads', 'route_trace', 'add_via', 'inspect'];

function prepare(call: ToolCall): PreparedCall {
  const name = call.function.name as CommandName;
  if (!Object.hasOwn(commands, name)) {
    return { call, name, failure: { code: 'UNKNOWN_TOOL', error: 'Неизвестная команда.' } };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(call.function.arguments);
  } catch {
    return {
      call, name, signature: call.function.arguments, failure: {
        code: 'INVALID_TOOL_JSON',
        error: 'Аргументы команды должны быть JSON-объектом. Соберите их заново по схеме инструмента.'
      }
    };
  }
  const parsed = commands[name].safeParse(raw);
  if (!parsed.success) {
    return {
      call, name, signature: JSON.stringify(raw), failure: {
        code: 'INVALID_TOOL_ARGUMENTS',
        error: parsed.error.issues.slice(0, 4).map(issue => issue.path.join('.') + ': ' + issue.message).join('; ')
      }
    };
  }
  return { call, name, args: parsed.data, signature: JSON.stringify(parsed.data) };
}

function focusAfterTruncation(progress: Progress): { tools: CommandName[]; instruction: string } {
  if (progress.phase === 'placement') {
    return { tools: ['place_target_footprints', 'place_footprints', 'inspect', 'query_library'],
      instruction: 'Установи отсутствующие корпуса. Если координаты и назначения уже заданы в targets, используй place_target_footprints.' };
  }
  if (progress.phase === 'routing' && progress.unrouted.length) {
    const first = progress.unrouted[0];
    if (progress.unrouted.length > 1) {
      return { tools: routingCommands,
        instruction: 'При готовых ограничениях платы вызови route_remaining для оставшихся связей. Если пакет уже сообщил об отсутствии прогресса, проверь конкретную сеть через inspect с pcbNet.' };
    }
    return {
      tools: routingCommands,
      instruction: 'Следующая операция: попробуй route_net для одной связи ' + first.netName + ' ' +
        first.fromLabel + ' → ' + first.toLabel + ', сохраняя требования к слоям и ширине. При конфликте выбери другой путь.'
    };
  }
  if (progress.phase === 'requirements' || progress.missing.length) {
    return { tools: ['set_targets', 'inspect'], instruction: 'Заполни недостающие требования по исходному ТЗ: ' + progress.missing.join(', ') };
  }
  if (progress.phase === 'create_schematic' || progress.phase === 'create_board') {
    return { tools: [progress.phase], instruction: 'Создай обязательный документ. Выполни один вызов.' };
  }
  if (progress.phase === 'schematic') {
    return { tools: ['inspect', 'connect_net', 'wire', 'check', 'create_board', 'place_component', 'query_library'],
      instruction: 'Выполни одно незавершённое соединение по контракту либо перейди к плате после проверки схемы.' };
  }
  return { tools: ['inspect', 'check', 'compare_requirements', 'finalize_project', 'finish', 'route_net', 'refill_copper', 'move_footprint',
    'set_component_labels', 'move_schematic', 'wire', 'connect_net'],
    instruction: 'Исправь один актуальный блокер или выполни итоговую проверку текущего документа.' };
}

export async function runAgent(
  workspace: Workspace,
  settings: {
    key: string;
    model: string;
    task: string;
    previousTask?: string;
    signal: AbortSignal;
    onEvent?: (event: AgentEvent) => void;
    endpoint?: string;
  },
  onStep: (message: string) => void,
  checkpoint: () => void
): Promise<void> {
  const { key, model, task, signal, previousTask } = settings;
  const baseUrl = (settings.endpoint || 'https://api.aitunnel.ru/v1').replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  const chatEndpoint = `${baseUrl}/chat/completions`;
  const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) requestHeaders.Authorization = 'Bearer ' + key;
  // Structured user input anchors acceptance. Ordinary text still uses set_targets.
  let userInput: unknown;
  let taskContext: unknown = task;
  try { userInput = JSON.parse(task); } catch { /* Natural-language task. */ }
  if (userInput && typeof userInput === 'object' && 'requirements' in userInput) {
    workspace.setUserTargets(userInput.requirements);
    const { requirements, ...instructions } = userInput;
    taskContext = instructions;
  }

  const messages: RequestMessage[] = [];
  const emit = settings.onEvent ?? (() => {});
  const history: Attempt[] = workspace.draft.progress?.recent.map(item => ({ ...item })) ?? [];
  const failed = new Map<string, ToolFailure>();
  const reviewed = new Set<string>();
  const presented = new Set<string>();
  let visualRevision = -1;
  let fullyFinalizedRevision = -1;
  let emptyAnswers = 0;
  let truncatedAnswers = 0;
  let failingBatches = 0;
  let stagnantTurns = 0;
  let reviewDeferrals = 0;
  let recovery: ReturnType<typeof focusAfterTruncation> | undefined;
  let lastIssue = workspace.draft.progress?.lastIssue;
  const recordProgress = ({ phase } = workspace.getProgress()) => {
    workspace.draft.progress = {
      phase, lastIssue,
      recent: history.slice(-8).map(({name, ok, error}) => ({ name, ok, error: error?.slice(0, 500) }))
    };
    checkpoint();
  };
  function compact(progress: Progress, instruction?: string) {
    messages.splice(0, messages.length, { role: 'system', content: AGENT_INSTRUCTIONS }, {
      role: 'user', content: JSON.stringify({
        task: taskContext, previousTask: previousTask === task ? undefined : previousTask, plan: workspace.draft.plan, targets: workspace.draft.targets,
        previousReport: workspace.draft.report, progress, lastIssue, recent: history.slice(-8), instruction
      })
    });
  }
  function exhausted(reason: string): never {
    lastIssue = reason;
    recordProgress();
    const { blockers, unrouted } = workspace.getProgress();
    const remaining = [...blockers.slice(0, 2), ...unrouted.slice(0, 2).map(connection =>
      connection.netName + ' ' + connection.fromLabel + ' → ' + connection.toLabel)];
    throw new Error(reason + ' Черновик сохранён.' + (remaining.length ? ' Осталось: ' + remaining.join(' · ') : ''));
  }

  compact(workspace.getProgress());
  for (let turn = 0; turn < maxTurns; turn++) {
    signal.throwIfAborted();
    const before = workspace.getProgress();
    const turnRevision = before.revision;
    const waitingForImage = Array.isArray(messages.at(-1)?.content);
    const didReview = visualRevision === turnRevision && presented.size > 0;
    const ready = before.checked && !before.blockers.length && !before.missing.length &&
      visualRevision === turnRevision && (before.documents.pcb || before.documents.schematic.length > 0) &&
      before.documents.schematic.every(id => presented.has(id)) && (!before.documents.pcb || presented.has('pcb'));
    if (turn > 0 && turn % 6 === 0 && !waitingForImage && !recovery) compact(before);

    let restricted = recovery?.tools;
    if (ready && !waitingForImage && (stagnantTurns >= 2 || fullyFinalizedRevision === turnRevision)) {
      restricted = ['finish', 'render_review'];
      if (stagnantTurns >= 4) restricted = ['finish'];
    }
    onStep('Запрос к модели ' + (turn + 1) + '/' + maxTurns);
    const response = await fetch(chatEndpoint, {
      method: 'POST',
      signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]),
      headers: requestHeaders,
      body: JSON.stringify({
        model, messages,
        tools: toolDefinitions.filter(tool => {
          const name = tool.function.name as CommandName;
          if (restricted) return restricted.includes(name);
          return workspace.draft.targets?.documents !== 'pcb' || !schematicTools.has(name);
        }),
        tool_choice: restricted?.length === 1 ? { type: 'function', function: { name: restricted[0] } } : 'required',
        max_tokens: 8192
      })
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('Сервер ИИ отклонил ключ или доступ к модели.');
      if (response.status === 402) throw new Error('Сервер ИИ отклонил запрос по балансу/квоте.');
      if (response.status === 429) throw new Error('Достигнут лимит запросов сервера ИИ. Черновик можно продолжить.');
      if (response.status === 400 && restricted) {
        recovery = undefined;
        compact(before, 'Выполни один ближайший шаг по текущей фазе.');
        continue;
      }
      throw new Error('Ошибка сервера ИИ (HTTP ' + response.status + '). Проверьте доступность модели и поддержку инструментов.');
    }
    const data = await response.json() as { id?: string; usage?: unknown; choices?: { message?: RequestMessage; finish_reason?: string }[] };
    emit({ kind: 'chat', id: data.id, model, usage: data.usage, response: data });
    signal.throwIfAborted();
    const choice = data.choices?.[0];
    const message = choice?.message;
    const calls = Array.isArray(message?.tool_calls) ? (message.tool_calls as ToolCall[]).filter(call =>
      typeof call?.id === 'string' && typeof call.function?.name === 'string' && typeof call.function?.arguments === 'string') : [];
    if (!calls.length) {
      if (choice?.finish_reason === 'content_filter') throw new Error('Провайдер остановил ответ модели.');
      const isTruncated = choice?.finish_reason === 'length';
      truncatedAnswers = isTruncated ? truncatedAnswers + 1 : 0;
      emptyAnswers = isTruncated ? 0 : emptyAnswers + 1;
      recovery = ready ? { tools: ['finish'], instruction: 'Просмотр текущей ревизии выполнен. Подготовь итоговый отчёт.' } : focusAfterTruncation(before);
      lastIssue = isTruncated ? 'Модель исчерпала лимит ответа до вызова команды.' : 'Ответ модели не содержал команды.';
      emit({ kind: 'checkpoint', intervention: lastIssue, next: recovery.instruction, phase: before.phase });
      recordProgress(before);
      if (truncatedAnswers >= 4 || emptyAnswers >= 3) exhausted(lastIssue);
      compact(before, lastIssue + ' ' + recovery.instruction);
      continue;
    }
    emptyAnswers = 0;
    truncatedAnswers = 0;
    recovery = undefined;

    messages.push({
      role: 'assistant', content: message?.content ?? null, tool_calls: calls,
      ...(typeof message?.reasoning_content === 'string' ? { reasoning_content: message.reasoning_content } : {})
    });
    const prepared = calls.map(prepare);
    const signature = (operation: PreparedCall) => workspace.revision + ':' + operation.name + ':' + operation.signature;
    const candidates = prepared.filter(operation => !operation.failure && !failed.has(signature(operation)) &&
      !(operation.name === 'finish' && (calls.length !== 1 || !didReview ||
        ((operation.args as {status?: string}).status !== 'draft' && !ready))));
    const risky = candidates.some(({name}) => ['finish', 'delete_schematic', 'delete_board', 'restore_verified'].includes(name));
    let intercepted: string | undefined;
    if (risky && reviewDeferrals < 2) {
      try {
        onStep('Проверка действий · d1.2-ultra');
        const { plan, targets, currentChecks, ...actual } = workspace.execute('inspect', {}) as Record<string, unknown>;
        const state = {
          task: taskContext, plan, targets, actual, currentChecks, stagnantTurns,
          proposed: candidates.map(({name, args}) => ({ name, arguments: JSON.stringify(args) })), recent: history.slice(-8)
        };
        const decision = await reviewAgentActions(state, key, signal, emit, baseUrl);
        if (decision.action === 'restore' && (state.actual as {canRestoreVerified?: boolean}).canRestoreVerified) {
          workspace.execute('restore_verified', {});
          intercepted = 'Контролёр восстановил последнюю проверенную версию. Проверь её и получи новые снимки.';
        } else if (decision.action !== 'continue') {
          intercepted = 'Контролёр отклонил пакет. Сверь конкретный блокер и предложи локальное исправление.';
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
    for (const operation of prepared) {
      const toolStarted = performance.now();
      signal.throwIfAborted();
      const { call, name, args } = operation;
      const key = signature(operation);
      let failure = operation.failure;
      const alreadyFailed = failed.get(key);
      if (alreadyFailed) failure = { code: 'REPEATED_TOOL_FAILURE', error: 'Та же команда уже завершилась ошибкой: ' + alreadyFailed.error };
      let output: unknown;
      const isIntercepted = Boolean(intercepted && !failure);
      try {
        if (failure) throw new Error(failure.error);
        if (isIntercepted) throw new Error(intercepted);
        if (name === 'finish' && calls.length !== 1) throw new Error('finish выполняется отдельно после просмотра PNG.');
        if (name === 'finish' && (workspace.draft.documents.schematic || workspace.draft.documents.pcb) && !didReview) {
          throw new Error('Сначала выполните finalize_project или снимки всех документов и просмотрите их в следующем ответе.');
        }
        if (reviewCommands.has(name) && reviewed.has(key) && didReview) {
          output = { unchanged: true, revision: workspace.revision, next: 'Используйте результаты этой ревизии. Исправьте указанный блокер или вызовите finish.' };
        } else {
          const input = name === 'check' || name === 'finalize_project' ? { detail: 'summary', ...args as object } : args;
          output = workspace.execute(name, input);
          const route = output as { closed?: number; remaining?: number; applied?: boolean; previewId?: string; addedTraces?: number };
          if ((name === 'route_remaining' && !route.closed && route.remaining !== 0) ||
              (name === 'route_net' && route.applied === false && !route.previewId) ||
              (name === 'auto_route' && !route.addedTraces)) {
            failure = { code: 'NO_ROUTING_PROGRESS',
              error: 'Разводка не дала результата. Сверьте оставшиеся пары и причины отказов, затем измените подход.' };
            output = { ...failure, ...(output as object) };
          }
          if (reviewCommands.has(name)) reviewed.add(key);
          if (name === 'finalize_project') {
            const result = output as { report: unknown; captures: AgentCapture[]; revision: number; next: string };
            images.push(...result.captures);
            fullyFinalizedRevision = result.revision;
            output = { ...result, captures: result.captures.map(({id, label, revision}) => ({id, label, revision})) };
          }
          if (name === 'screenshot' || name === 'render_review') {
            const capture = output as AgentCapture;
            images.push(capture);
            output = { label: capture.label, captured: true };
          }
        }
        const ok = !failure;
        if (failure) {
          failed.set(key, failure);
          lastIssue = failure.error;
        }
        history.push({ name, args: JSON.stringify(args)?.slice(0, 600), ok, error: failure?.error });
        emit({ kind: 'tool', name, args, ok, output, durationMs: performance.now() - toolStarted });
        if (!ok) {
          onStep('Нет продвижения · ' + name);
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) });
          continue;
        }
        hadSuccessfulCall = true;
        onStep('Готово · ' + name);
        if (name === 'finish') {
          lastIssue = undefined;
          recordProgress();
          return;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Ошибка команды';
        failure ??= {
          code: isIntercepted ? 'REVIEW_REVISE' : error instanceof RouteConflict ? 'ROUTE_CONFLICT' : 'TOOL_ERROR',
          error: message, ...(error instanceof RouteConflict ? { conflicts: error.conflicts.slice(0, 12) } : {})
        };
        if (!isIntercepted && !alreadyFailed && name !== 'finish') failed.set(key, failure);
        output = failure;
        lastIssue = failure.error;
        history.push({ name, args: call.function.arguments.slice(0, 600), ok: false, error: failure.error });
        emit({ kind: 'tool', name, args: call.function.arguments, ok: false, output, intercepted: isIntercepted,
          durationMs: performance.now() - toolStarted });
        onStep('Ошибка · ' + name);
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) });
    }

    const current = workspace.getProgress();
    const advanced = current.revision !== turnRevision || before.phase !== current.phase ||
      before.missing.length !== current.missing.length;
    stagnantTurns = advanced ? 0 : stagnantTurns + 1;
    failingBatches = hadSuccessfulCall ? 0 : failingBatches + Number(!intercepted);
    if (advanced) lastIssue = undefined;
    recordProgress(current);
    if (failingBatches >= 5) exhausted('Пять пакетов подряд не выполнили ни одной команды.');
    if (stagnantTurns >= 10) exhausted('Агент исчерпал попытки без изменения рабочей версии.');
    if (stagnantTurns === 4 || (!hadSuccessfulCall && !intercepted)) {
      const focus = focusAfterTruncation(current);
      if (!(current.phase === 'review' && current.checked && !current.blockers.length)) {
        recovery = stagnantTurns >= 4 ? focus : undefined;
        messages.push({ role: 'user', content: focus.instruction });
      } else {
        messages.push({ role: 'user', content: 'Версия проверена. После итоговых снимков вызови finish отдельным ответом.' });
      }
    }

    const currentImages = images.filter(capture => capture.revision === undefined || capture.revision === current.revision);
    if (currentImages.length) {
      if (visualRevision !== current.revision) presented.clear();
      visualRevision = current.revision;
      for (const image of currentImages) presented.add(image.id);
      for (const entry of messages) {
        if (Array.isArray(entry.content) && entry.role === 'user') entry.content = 'Предыдущий снимок документа.';
      }
      const content = currentImages.flatMap(image => [
          { type: 'text', text: 'Снимок документа «' + image.label + '». Проверь эту версию визуально.' },
          { type: 'image_url', image_url: { url: image.url } }
      ]);
      if (current.checked && !current.blockers.length && !current.missing.length &&
        current.documents.schematic.every(id => presented.has(id)) && (!current.documents.pcb || presented.has('pcb'))) {
        content.push({ type: 'text', text: 'Проверка текущей ревизии пройдена. Если на снимках нет существенного дефекта, вызови finish сейчас.' });
      }
      messages.push({ role: 'user', content });
    }
  }
  exhausted('Достигнут лимит запросов.');
}
