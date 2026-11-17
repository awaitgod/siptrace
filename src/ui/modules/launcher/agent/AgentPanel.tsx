import { useEffect, useMemo, useRef, useState } from 'react';
import { IconArrowUp, IconCheck, IconChevronDown, IconCircuitResistor, IconDownload, IconFile, IconLayoutSidebarRight,
  IconLoader2, IconPlus, IconSettings, IconSquare, IconX, IconPlugConnected, IconAlertTriangle, IconArrowsMaximize } from '@tabler/icons-react';
import type { ColorSchemeId } from '../../../../core/models';
import { loadSettings, loadRecentProjectSnapshot, recordRecentProject, type RecentProjectItem,
  type RecentProjectSnapshot } from '../../../../core/store';
import { readStorageJson, writeStorageJson } from '../../../../core/persistence/jsonStorage';
import { exportTextFile } from '../../../../core/utils/fileIo';
import { DEFAULT_AGENT_MODEL } from './instructions';
import { runAgent } from './client';
import type { AgentEvent } from './decisions';
import { createAgentWorkspace, type AgentCapture, type AgentDraft } from './workspace';
import { LauncherDocumentPreview } from '../components/LauncherDocumentPreview';
import { AgentLiveDocument } from './AgentLiveDocument';
import './agent.css';

const draftKey = 'siptrace.agent.draft.v1';
interface Message { id: string; role: 'user' | 'assistant'; content: string; details?: string; status?: string }
interface RunStats { requests: number; tokens: number; decisionCost: number; decisions: number }
interface SavedDraft extends AgentDraft { task?: string; conversation?: Message[]; stats?: RunStats }
const emptyDraft = (): SavedDraft => ({ documents: {}, plan: '' });
const emptyStats = (): RunStats => ({ requests: 0, tokens: 0, decisionCost: 0, decisions: 0 });

interface Props {
  visible: boolean; theme: ColorSchemeId; selected?: RecentProjectItem; selectedDocuments?: RecentProjectSnapshot; onSaved: (id: string) => void;
}

const toolLabels: Record<string, string> = {
  query_library: 'Подбор компонентов', search_library: 'Поиск в библиотеке', read_library: 'Чтение определения',
  create_schematic: 'Создание схемы', place_component: 'Размещение компонента', connect_net: 'Соединение цепи',
  wire: 'Прокладка провода', configure_document: 'Оформление документа', set_frame: 'Настройка листа',
  create_board: 'Создание платы', route_between_pads: 'Соединение площадок', route_trace: 'Прокладка дорожки',
  check: 'Проверка проекта', compare_requirements: 'Сверка с заданием', finalize_project: 'Итоговая проверка',
  screenshot: 'Снимок документа', render_review: 'Визуальная проверка', set_targets: 'Уточнение требований',
  set_component_labels: 'Размещение подписей', remember: 'Обновление плана', inspect: 'Проверка состояния',
  finish: 'Подготовка результата', restore_verified: 'Восстановление версии', delete_schematic: 'Изменение схемы',
  delete_board: 'Изменение платы', refill_copper: 'Пересчёт заливки'
};

export default function AgentPanel({ visible, theme, selected, selectedDocuments, onSaved }: Props) {
  const [draft, setDraft] = useState(() => readStorageJson<SavedDraft>(draftKey) ?? emptyDraft());
  const [messages, setMessages] = useState<Message[]>(() => draft.conversation ?? (draft.task ? [
    { id: 'previous-user', role: 'user', content: draft.task },
    ...(draft.report ? [{ id: 'previous-assistant', role: 'assistant' as const, content: draft.report.summary, details: draft.report.limitations, status: draft.report.status }] : [])
  ] : []));
  const messagesRef = useRef(messages);
  const [key, setKey] = useState('');
  const [model, setModel] = useState(DEFAULT_AGENT_MODEL);
  const [task, setTask] = useState('');
  const [steps, setSteps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);
  const [captures, setCaptures] = useState<AgentCapture[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<'documents' | 'checks'>('documents');
  const [activeDocument, setActiveDocument] = useState('');
  const [liveDocumentOpen, setLiveDocumentOpen] = useState(false);
  const [stats, setStats] = useState<RunStats>(() => draft.stats ?? emptyStats());
  const statsRef = useRef(stats);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const { schematic, pcb } = draft.documents;
  const hasDocuments = Boolean(schematic || pcb);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    const dialog = settingsRef.current;
    if (visible && settingsOpen && !dialog?.open) dialog?.showModal();
    if ((!visible || !settingsOpen) && dialog?.open) dialog.close();
  }, [settingsOpen, visible]);
  useEffect(() => { if (visible) conversationEnd.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length, busy, visible]);
  useEffect(() => { if (!visible) setLiveDocumentOpen(false); }, [visible]);

  function saveDraft(next: SavedDraft) {
    const saved = { ...next, conversation: messagesRef.current, stats: statsRef.current };
    setDraft(saved);
    setStorageFailed(!writeStorageJson(draftKey, saved));
  }
  function appendMessage(message: Omit<Message, 'id'>) {
    const next = [...messagesRef.current, { ...message, id: crypto.randomUUID() }].slice(-100);
    messagesRef.current = next;
    setMessages(next);
  }
  function replaceDraft(documents: RecentProjectSnapshot = {}) {
    const copy = structuredClone(documents);
    if (copy.schematic) copy.schematic.filePath = '';
    if (copy.pcb) { copy.pcb.filePath = ''; delete copy.pcb.linkedSchematicPath; }
    messagesRef.current = [];
    statsRef.current = emptyStats();
    setStats(statsRef.current);
    setMessages([]);
    saveDraft({ documents: copy, plan: '' });
    setCaptures([]); setSteps([]); setNotice(''); setError(''); setActiveDocument('');
  }

  function handleEvent(event: AgentEvent) {
    if (!mounted.current) return;
    if (event.kind === 'chat') {
      const usage = event.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
      statsRef.current = { ...statsRef.current, requests: statsRef.current.requests + 1,
        tokens: statsRef.current.tokens + (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0) };
      setStats(statsRef.current);
    }
    if (event.kind === 'decision') {
      const usage = event.usage as { cost_rub?: number };
      statsRef.current = { ...statsRef.current, decisions: statsRef.current.decisions + 1,
        decisionCost: statsRef.current.decisionCost + (usage?.cost_rub ?? 0) };
      setStats(statsRef.current);
    }
  }

  async function start() {
    if (controller.current || !task.trim()) return;
    if (!key.trim() || !model.trim()) { setSettingsOpen(true); return; }
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true); setNotice(''); setError(''); setSteps([]); setCaptures([]);
    const instruction = task.trim();
    appendMessage({ role: 'user', content: instruction });
    setTask('');
    const workspace = createAgentWorkspace(draft, theme);
    const checkpoint = () => {
      if (!mounted.current) return;
      saveDraft({ ...structuredClone(workspace.draft), task: instruction });
      setCaptures([...workspace.captures.values()]);
    };
    try {
      await runAgent(workspace, { key: key.trim(), model: model.trim(), task: instruction, previousTask: draft.task,
        signal: abort.signal, onEvent: handleEvent }, step => {
        if (mounted.current) setSteps(items => [...items.slice(-149), step]);
      }, checkpoint);
      if (mounted.current) {
        appendMessage({ role: 'assistant', content: workspace.draft.report?.summary ?? 'Черновик сохранён.',
          details: workspace.draft.report?.limitations, status: workspace.draft.report?.status });
        checkpoint();
        setNotice(workspace.draft.report?.status === 'draft' ? 'Сохранён незавершённый черновик' : 'Проверка завершена');
      }
    } catch (err) {
      if (mounted.current) {
        const message = abort.signal.aborted ? 'Остановлено. Черновик доступен для продолжения.' :
          err instanceof Error ? err.message : 'Не удалось выполнить задачу.';
        appendMessage({ role: 'assistant', content: message, status: 'draft' });
        checkpoint();
        if (abort.signal.aborted) setNotice(message); else setError(message);
      }
    } finally {
      controller.current = null;
      if (mounted.current) setBusy(false);
    }
  }

  function saveProject() {
    const document = schematic ?? pcb;
    if (!document) return;
    const existing = loadSettings().recentProjects ?? [];
    let name = document.projectName + ' — ИИ';
    for (let index = 2; existing.some(item => item.name === name); index++) name = document.projectName + ' — ИИ ' + index;
    const id = 'agent_' + crypto.randomUUID();
    const snapshot = structuredClone(draft.documents);
    if (snapshot.schematic) snapshot.schematic.projectName = name;
    if (snapshot.pcb) snapshot.pcb.projectName = name;
    recordRecentProject({ id, name, designation: schematic?.sheets[0]?.titleBlock.designation ?? '', module: schematic ? 'schematic' : 'pcb' }, snapshot);
    if (!loadRecentProjectSnapshot(id) || !loadSettings().recentProjects?.some(item => item.id === id)) {
      setError('Не удалось записать проект. Выгрузите документы в файл.'); return;
    }
    onSaved(id); setNotice('Копия сохранена в проектах лаунчера.');
  }
  async function download(target: 'schematic' | 'pcb') {
    const document = draft.documents[target];
    if (!document) return;
    const extension = target === 'pcb' ? 'gostpcb' : 'gostsch';
    try { await exportTextFile(document.projectName.replace(/[<>:"/\\|?*]/g, '_') + '.' + extension,
      JSON.stringify(document, null, 2), extension, 'SIPTrace'); }
    catch { setError('Не удалось выгрузить документ.'); }
  }

  const documents = useMemo(() => [
    ...(schematic?.sheets.map(sheet => ({ id: sheet.id, label: sheet.name, kind: 'schematic' as const })) ?? []),
    ...(pcb ? [{ id: 'pcb', label: 'Печатная плата', kind: 'pcb' as const }] : [])
  ], [schematic, pcb]);
  const current = documents.find(item => item.id === activeDocument) ?? documents[0];
  const currentCapture = captures.find(item => item.id === current?.id);
  const previewDocuments = useMemo(() => current?.kind === 'schematic' && schematic
    ? { ...draft.documents, schematic: { ...schematic, activeSheetId: current.id } } : draft.documents,
    [draft.documents, current?.id]);
  const lastStep = steps.at(-1) ?? 'Подготовка';
  const displayStep = lastStep.includes(' · ') ? (toolLabels[lastStep.split(' · ')[1]] ?? lastStep) : lastStep;
  const checks = draft.checks;
  const reportTitle = draft.report?.status === 'draft' ? 'Отчёт агента · незавершённый черновик' : 'Отчёт агента';

  return (
    <section className={'launch-agent' + (inspectorOpen ? ' agent-with-inspector' : '')} aria-label="ИИ-агент">
      <header className="agent-topbar">
        <div className="agent-title"><IconCircuitResistor size={19} /><span>ИИ-агент</span>
          {hasDocuments && <span className="agent-project-name">{schematic?.projectName ?? pcb?.projectName}</span>}</div>
        <div className="agent-toolbar">
          <button className="dt-tb-btn agent-icon-button" aria-label="Новый черновик" title="Новый черновик" disabled={busy} onClick={() => {
            if ((!hasDocuments && !messages.length) || window.confirm('Начать новый черновик и очистить переписку?')) replaceDraft();
          }}><IconPlus size={18} /></button>
          <button className="dt-tb-btn agent-icon-button" aria-label="Настройки подключения" title="Настройки подключения" onClick={() => setSettingsOpen(true)}><IconSettings size={17} /></button>
          <button className="dt-tb-btn agent-icon-button" aria-label="Показать документы и проверки" title="Документы и проверки" aria-pressed={inspectorOpen}
            onClick={() => setInspectorOpen(value => !value)}><IconLayoutSidebarRight size={18} /></button>
        </div>
      </header>
      <div className="agent-chat">
        <div className="agent-conversation" aria-label="Переписка с агентом">
          {!messages.length && <div className="agent-welcome">
            <div className="agent-welcome-mark"><IconCircuitResistor size={30} stroke={1.4} /></div>
            <h1>{hasDocuments ? 'Продолжим работу над проектом' : 'Какое устройство спроектируем?'}</h1>
            <p>Опишите схему или плату. Укажите питание, компоненты и требования.</p>
            <div className="agent-suggestions">
              {[
                ['RC-фильтр', 'Создай схему RC-ФНЧ с R1=10 кОм и C1=100 нФ, входом IN, выходом OUT и GND. Формат A4, обозначение ТЕСТ.000001 Э3. Рассчитай частоту среза.'],
                ['Делитель напряжения', 'Создай схему делителя 5 В → 2,5 В на двух резисторах 10 кОм. Формат A4, обозначение ТЕСТ.000002 Э3.'],
                ['Схема и плата', 'Создай схему и плату 40×30 мм с двумя резисторами 0805. Соедини площадки 1 цепью A, площадки 2 цепью B. Проверь разводку и соответствие схеме.']
              ].map(([title, prompt]) => <button className="dt-btn" key={title} onClick={() => { setTask(prompt); composer.current?.focus(); }}>{title}<IconArrowUp size={14} /></button>)}
            </div>
          </div>}
          <div className="agent-messages">
            {messages.map(message => <article key={message.id} className={'agent-message agent-message-' + message.role}>
              {message.role === 'assistant' && <div className="agent-message-author"><IconCircuitResistor size={16} /><span>SIPTrace</span>
                {message.status === 'draft' && <span className="agent-draft-label">Черновик</span>}</div>}
              <div className="agent-message-content">{message.content}</div>
              {message.details && <details className="agent-message-details"><summary>Ограничения и замечания</summary><p>{message.details}</p></details>}
            </article>)}
            {busy && <div className="agent-thinking" role="status"><IconLoader2 className="agent-spin" size={16} />{displayStep}</div>}
            {steps.length > 0 && <details className="agent-activity">
              <summary><span>{busy ? 'Ход работы' : 'Действия агента'}</span><span>{steps.filter(step => step.startsWith('Готово')).length} выполнено</span><IconChevronDown size={14} /></summary>
              <ol aria-label="Журнал действий">{steps.map((step, index) => <li key={index}><span>{String(index + 1).padStart(2, '0')}</span>
                {step.includes(' · ') ? (toolLabels[step.split(' · ')[1]] ?? step) : step}</li>)}</ol>
            </details>}
            <div ref={conversationEnd} />
          </div>
        </div>
        <div className="agent-compose-area">
          {error && <div className="dt-message-warning agent-error" role="alert"><IconAlertTriangle size={16} />{error}</div>}
          {storageFailed && <div className="dt-message-warning agent-error" role="alert">Локальная запись недоступна. Выгрузите документы перед закрытием.</div>}
          {notice && !error && <div className="dt-message-success agent-notice" role="status"><IconCheck size={14} />{notice}</div>}
          <form className="agent-composer" onSubmit={event => { event.preventDefault(); void start(); }}>
            {hasDocuments && <div className="agent-context"><IconFile size={13} />{schematic?.projectName ?? pcb?.projectName}</div>}
            <textarea ref={composer} aria-label="Задание" value={task} maxLength={16000} rows={3} disabled={busy}
              placeholder="Опишите задачу или задайте уточнение…" onChange={event => setTask(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void start(); } }} />
            <div className="agent-composer-footer">
              <div className="agent-composer-options">
                <button type="button" title={model} onClick={() => setSettingsOpen(true)}><span className="agent-connection-dot" data-connected={Boolean(key)} />
                  {model.startsWith('deepseek') ? 'DeepSeek Flash' : model}<IconChevronDown size={13} /></button>
                <span className="agent-controller">D1.2 Ultra</span>
                <button type="button" className="agent-copy-project" disabled={busy || !(selectedDocuments?.schematic || selectedDocuments?.pcb)}
                  title={selected?.name ? 'Копировать «' + selected.name + '» в черновик' : 'Выберите проект в лаунчере'}
                  onClick={() => {
                    if ((!hasDocuments && !messages.length) || window.confirm('Заменить черновик копией выбранного проекта?')) replaceDraft(selectedDocuments);
                  }}><IconPlus size={14} />Проект</button>
              </div>
              {busy ? <button className="dt-btn agent-send" aria-label="Остановить" type="button" onClick={() => controller.current?.abort()}><IconSquare size={15} fill="currentColor" /></button> :
                <button className="dt-btn primary agent-send" aria-label="Запустить агента" title={key ? 'Отправить · Enter' : 'Настроить подключение и отправить'} type="submit" disabled={!task.trim()}><IconArrowUp size={19} /></button>}
            </div>
          </form>
          <div className="agent-compose-meta">
            <span>{key ? 'Подключено к AITUNNEL' : <button onClick={() => setSettingsOpen(true)}>Подключить AITUNNEL</button>}</span>
            {stats.requests > 0 ? <span>{stats.requests} запросов · {stats.tokens.toLocaleString('ru-RU')} токенов
              {stats.decisions > 0 && ' · Контролёр ' + stats.decisionCost.toFixed(3) + ' ₽'}</span> : <span>Enter — отправить · Shift+Enter — новая строка</span>}
          </div>
        </div>
      </div>
      {inspectorOpen && <aside className="dt-right-sidebar agent-inspector" aria-label="Документы и проверки">
        <div className="agent-inspector-tabs" role="tablist" aria-label="Панель результата">
          <button className={'dt-tab-btn' + (inspectorTab === 'documents' ? ' active' : '')} role="tab" aria-selected={inspectorTab === 'documents'} onClick={() => setInspectorTab('documents')}>Документы{documents.length > 0 && <span>{documents.length}</span>}</button>
          <button className={'dt-tab-btn' + (inspectorTab === 'checks' ? ' active' : '')} role="tab" aria-selected={inspectorTab === 'checks'} onClick={() => setInspectorTab('checks')}>Проверки</button>
        </div>
        <div className="agent-inspector-body" role="tabpanel" aria-label={inspectorTab === 'documents' ? 'Документы' : 'Проверки'}>
          {inspectorTab === 'documents' ? <>
            {documents.length ? <>
              <div className="agent-document-list">{documents.map(item => <button key={item.id} aria-pressed={current?.id === item.id} onClick={() => setActiveDocument(item.id)}>
                <IconFile size={15} /><span>{item.label}</span><small>{item.kind === 'pcb' ? 'PCB' : 'Схема'}</small></button>)}</div>
              <div className="agent-preview">
                {currentCapture ? <a href={currentCapture.url} target="_blank" rel="noreferrer" title="Открыть снимок в полном размере">
                  <img src={currentCapture.url} alt={'Снимок · ' + currentCapture.label} /></a> :
                  <LauncherDocumentPreview documents={previewDocuments} board={current?.kind === 'pcb'} theme={theme} />}
              </div>
              <div className="agent-artifact-actions">
                <button className="dt-btn primary" onClick={() => setLiveDocumentOpen(true)}><IconArrowsMaximize size={15} />Открыть {current?.kind === 'pcb' ? 'плату' : 'схему'}</button>
                <button className="dt-btn" disabled={busy} onClick={saveProject}>Сохранить копию в проектах</button>
                <button className="dt-btn" disabled={busy} onClick={() => void download(current?.kind === 'pcb' ? 'pcb' : 'schematic')}><IconDownload size={15} />Выгрузить {current?.kind === 'pcb' ? 'плату' : 'схему'}</button>
              </div>
            </> : <div className="agent-inspector-empty"><IconFile size={28} stroke={1.3} /><p>Документы появятся здесь</p><span>Схема, плата и снимки проверки</span></div>}
            {draft.plan && <details className="agent-plan"><summary>План и память</summary><p>{draft.plan}</p></details>}
          </> : <>
            <h2>{draft.report ? reportTitle : 'Проверка проекта'}</h2>
            {checks ? <>
              <div className="agent-check-grid">
                {[['ERC', checks.erc], ['DRC', checks.drc], ['Вне рамки', checks.outsideFrame],
                  ['Неразведённые связи', checks.unrouted ?? '—']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
              </div>
              {checks.inSync !== undefined && <p className="agent-sync">{checks.inSync ? 'Схема и плата совпадают' : 'Схема и плата расходятся'}</p>}
              {checks.requirements?.map((row, index) => <div className="agent-requirement" key={index} data-pass={row.pass}>
                {row.pass ? <IconCheck size={15} /> : <IconAlertTriangle className="dt-error-message" size={15} />}<span>{row.requirement}
                  {!row.pass && <small>Ожидалось {JSON.stringify(row.expected)}, получено {JSON.stringify(row.actual)}</small>}</span></div>)}
              {checks.blockers?.map((issue, index) => <p className="dt-error-message agent-check-issue" key={index}>{issue}</p>)}
            </> : <p className="agent-muted">Проверка последней версии ещё не выполнена.</p>}
            {draft.report && <div className="agent-check-report"><p>{draft.report.summary}</p><p>{draft.report.limitations}</p></div>}
          </>}
        </div>
        <footer className="agent-inspector-footer"><span className="agent-state-dot" data-busy={busy} />
          {busy ? 'Разработка выполняется' : draft.report?.status === 'complete' ? 'Проверка завершена' : 'Черновик проекта'}</footer>
      </aside>}
      {visible && liveDocumentOpen && <AgentLiveDocument documents={draft.documents} items={documents} current={current} theme={theme}
        busy={busy} step={displayStep} onSelect={setActiveDocument} onClose={() => setLiveDocumentOpen(false)} />}
      <dialog className="agent-settings-dialog" ref={settingsRef} aria-label="Настройки подключения" onCancel={() => setSettingsOpen(false)} onClose={() => setSettingsOpen(false)}>
        <div className="dt-modal agent-settings-panel">
          <div className="dt-modal-title agent-settings-heading"><IconPlugConnected size={20} /><h2>Подключение к AITUNNEL</h2><button className="dt-tb-btn agent-icon-button" aria-label="Закрыть настройки" onClick={() => setSettingsOpen(false)}><IconX size={18} /></button></div>
          <div className="dt-modal-body">
            <label>Ключ AITUNNEL<input className="dt-input" type="password" value={key} autoComplete="off" disabled={busy} onChange={event => setKey(event.target.value)} placeholder="sk-aitunnel-…" /></label>
            <label>Модель<input className="dt-input" value={model} disabled={busy} onChange={event => setModel(event.target.value)} list="agent-models" /></label>
            <datalist id="agent-models"><option value={DEFAULT_AGENT_MODEL} /><option value="claude-haiku-5.5" /></datalist>
            <p>Запросы, сведения о компонентах и снимки передаются в AITUNNEL. Ключ хранится в памяти до закрытия лаунчера. Контроль действий выполняет D1.2 Ultra.</p>
          </div>
          <div className="dt-modal-footer">
            <button className="dt-btn primary" onClick={() => { setSettingsOpen(false); composer.current?.focus(); }}>Готово</button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
