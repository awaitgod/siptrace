import { useState, useRef, useEffect, useCallback } from 'react';
import type { ColorSchemeId } from '../../../../../core/models';
import {
  loadSettings,
  saveSettings,
  recordRecentProject,
  loadRecentProjectSnapshot,
  removeRecentProject,
  type RecentProjectItem,
  type RecentProjectSnapshot
} from '../../../../../core/store';
import { readStorageJson, writeStorageJson } from '../../../../../core/persistence/jsonStorage';
import { exportTextFile } from '../../../../../core/utils/fileIo';
import { DEFAULT_AGENT_MODEL } from '../instructions';
import { runAgent } from '../client';
import type { AgentEvent } from '../decisions';
import { createAgentWorkspace, type AgentCapture, type AgentDraft } from '../workspace';
import type { Message, RunStats, SavedDraft, AiConnectionSettings } from '../types';

const DRAFT_KEY = 'siptrace.agent.draft.v1';

const emptyDraft = (): SavedDraft => ({ documents: {}, plan: '' });
const emptyStats = (): RunStats => ({ requests: 0, tokens: 0, decisionCost: 0, decisions: 0 });

function sanitizeFileName(name: string, fallback: string, ext: string): string {
  let clean = (name || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().replace(/\.+$/, '');
  if (!clean || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(clean)) {
    clean = fallback;
  }
  return `${clean}.${ext}`;
}

export function useAgentSession(
  visible: boolean,
  theme: ColorSchemeId,
  selected?: RecentProjectItem,
  selectedDocuments?: RecentProjectSnapshot,
  onSaved?: (id: string) => void
) {
  const [draft, setDraft] = useState<SavedDraft>(() => readStorageJson<SavedDraft>(DRAFT_KEY) ?? emptyDraft());
  const [messages, setMessages] = useState<Message[]>(() => draft.conversation ?? (draft.task ? [
    { id: 'previous-user', role: 'user', content: draft.task },
    ...(draft.report ? [{
      id: 'previous-assistant',
      role: 'assistant' as const,
      content: draft.report.summary,
      details: draft.report.limitations,
       verification: draft.report.verification,
      status: draft.report.status
    }] : [])
  ] : []));
  const messagesRef = useRef(messages);

  const initialSettings = loadSettings();
  const [connection, setConnection] = useState<AiConnectionSettings>({
    endpoint: initialSettings.aiEndpoint || 'https://api.aitunnel.ru/v1',
    key: '',
    model: initialSettings.aiModel || DEFAULT_AGENT_MODEL
  });

  const [task, setTask] = useState('');
  const [lastFailedTask, setLastFailedTask] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);
  const [captures, setCaptures] = useState<AgentCapture[]>([]);
  const [stats, setStats] = useState<RunStats>(() => draft.stats ?? emptyStats());
  const statsRef = useRef(stats);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  const saveConnection = useCallback((next: Partial<AiConnectionSettings>) => {
    setConnection(prev => {
      const updated = { ...prev, ...next };
      const currentSettings = loadSettings();
      saveSettings({
        ...currentSettings,
        aiEndpoint: updated.endpoint,
        aiModel: updated.model
      });
      return updated;
    });
  }, []);

  const saveDraft = useCallback((next: SavedDraft) => {
    const saved: SavedDraft = { ...next, conversation: messagesRef.current, stats: statsRef.current };
    setDraft(saved);
    setStorageFailed(!writeStorageJson(DRAFT_KEY, saved));
  }, []);

  const appendMessage = useCallback((message: Omit<Message, 'id'>) => {
    const next = [...messagesRef.current, { ...message, id: crypto.randomUUID() }].slice(-100);
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const handleEvent = useCallback((event: AgentEvent) => {
    if (!mounted.current) return;
    if (event.kind === 'chat') {
      const usage = event.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
      statsRef.current = {
        ...statsRef.current,
        requests: statsRef.current.requests + 1,
        tokens: statsRef.current.tokens + (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0)
      };
      setStats(statsRef.current);
    }
    if (event.kind === 'decision') {
      const usage = event.usage as { cost_rub?: number };
      statsRef.current = {
        ...statsRef.current,
        decisions: statsRef.current.decisions + 1,
        decisionCost: statsRef.current.decisionCost + (usage?.cost_rub ?? 0)
      };
      setStats(statsRef.current);
    }
  }, []);

  const replaceDraft = useCallback((documents: RecentProjectSnapshot = {}) => {
    const copy = structuredClone(documents);
    if (copy.schematic) copy.schematic.filePath = '';
    if (copy.pcb) {
      copy.pcb.filePath = '';
      delete copy.pcb.linkedSchematicPath;
    }
    messagesRef.current = [];
    statsRef.current = emptyStats();
    setStats(statsRef.current);
    setMessages([]);

    const sch = copy.schematic;
    const pcb = copy.pcb;
    const schRefs = sch?.sheets.flatMap(s => s.components.map(c => c.refDes)) ?? [];
    const boardRefs = pcb?.components.map(c => c.refDes) ?? [];
    const synthesizedTargets = (sch || pcb) ? {
      documents: (sch && pcb ? 'both' : (pcb ? 'pcb' : 'schematic')) as 'schematic' | 'pcb' | 'both',
      schematicRefs: schRefs.length ? schRefs : undefined,
      boardRefs: boardRefs.length ? boardRefs : undefined
    } : undefined;

    saveDraft({
      documents: copy,
      plan: (sch || pcb) ? `Копия проекта: ${sch?.projectName || pcb?.projectName || 'Проект'}` : '',
      targets: synthesizedTargets
    });
    setCaptures([]);
    setSteps([]);
    setNotice(selected?.name ? `Проект «${selected.name}» скопирован в черновик` : '');
    setError('');
    setLastFailedTask(null);
  }, [saveDraft, selected]);

  const startWithInstruction = useCallback(async (instructionText: string) => {
    if (controller.current || !instructionText.trim()) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setNotice('');
    setError('');
    setSteps([]);
    setCaptures([]);
    setLastFailedTask(null);

    const instruction = instructionText.trim();
    appendMessage({ role: 'user', content: instruction });
    setTask('');

    const workspace = createAgentWorkspace(draft, theme);
    const checkpoint = () => {
      if (!mounted.current) return;
      saveDraft({ ...structuredClone(workspace.draft), task: instruction });
      setCaptures([...workspace.captures.values()]);
    };

    try {
      await runAgent(
        workspace,
        {
          key: connection.key.trim(),
          model: connection.model.trim(),
          task: instruction,
          previousTask: draft.task,
          signal: abort.signal,
          onEvent: handleEvent,
          endpoint: connection.endpoint.trim()
        },
        step => {
          if (mounted.current) setSteps(items => [...items.slice(-149), step]);
        },
        checkpoint
      );

      if (mounted.current) {
        appendMessage({
          role: 'assistant',
          content: workspace.draft.report?.summary ?? 'Черновик сформирован и сохранён.',
          details: workspace.draft.report?.limitations,
           verification: workspace.draft.report?.verification,
          status: workspace.draft.report?.status
        });
        checkpoint();
        setNotice(workspace.draft.report?.status === 'draft' ? 'Сохранён промежуточный черновик' : 'Проект успешно верифицирован');
      }
    } catch (err) {
      if (mounted.current) {
        const message = abort.signal.aborted
          ? 'Остановлено оператором. Черновик сохранён.'
          : err instanceof Error
            ? err.message
            : 'Не удалось выполнить операцию проектирования.';
        appendMessage({ role: 'assistant', content: message, status: 'draft' });
        checkpoint();
        if (abort.signal.aborted) {
          setNotice(message);
        } else {
          setError(message);
          setLastFailedTask(instruction);
        }
      }
    } finally {
      controller.current = null;
      if (mounted.current) setBusy(false);
    }
  }, [connection, draft, theme, appendMessage, saveDraft, handleEvent]);

  const start = useCallback(() => {
    return startWithInstruction(task);
  }, [startWithInstruction, task]);

  const retry = useCallback(() => {
    if (lastFailedTask) {
      void startWithInstruction(lastFailedTask);
    }
  }, [lastFailedTask, startWithInstruction]);

  const abort = useCallback(() => {
    controller.current?.abort();
  }, []);

  const saveProject = useCallback(() => {
    const document = draft.documents.schematic ?? draft.documents.pcb;
    if (!document) return;
    const existing = loadSettings().recentProjects ?? [];
    let name = document.projectName + ' — ИИ';
    for (let index = 2; existing.some(item => item.name === name); index++) {
      name = document.projectName + ' — ИИ ' + index;
    }
    const id = 'agent_' + crypto.randomUUID();
    const snapshot = structuredClone(draft.documents);
    if (snapshot.schematic) snapshot.schematic.projectName = name;
    if (snapshot.pcb) snapshot.pcb.projectName = name;

    recordRecentProject(
      {
        id,
        name,
        designation: draft.documents.schematic?.sheets[0]?.titleBlock.designation ?? '',
        module: draft.documents.schematic ? 'schematic' : 'pcb'
      },
      snapshot
    );

    const savedSnapshot = loadRecentProjectSnapshot(id);
    const inSettings = loadSettings().recentProjects?.some(item => item.id === id);

    if (!savedSnapshot || !inSettings) {
      removeRecentProject(id);
      setError('Не удалось записать проект в хранилище (превышен лимит квоты). Экспортируйте документы в файл.');
      return;
    }

    onSaved?.(id);
    setNotice('Копия сохранена в проектах лаунчера.');
  }, [draft.documents, onSaved]);

  const download = useCallback(async (target: 'schematic' | 'pcb') => {
    const document = draft.documents[target];
    if (!document) return;
    const extension = target === 'pcb' ? 'gostpcb' : 'gostsch';
    const fallback = target === 'pcb' ? 'Плата' : 'Схема';
    const fileName = sanitizeFileName(document.projectName, fallback, extension);
    try {
      await exportTextFile(fileName, JSON.stringify(document, null, 2), extension, 'SIPTrace');
      setNotice(`Документ «${fileName}» успешно выгружен.`);
    } catch {
      setError('Не удалось выгрузить документ в файл.');
    }
  }, [draft.documents]);

  return {
    draft,
    messages,
    connection,
    saveConnection,
    task,
    setTask,
    lastFailedTask,
    retry,
    steps,
    busy,
    notice,
    setNotice,
    error,
    setError,
    storageFailed,
    captures,
    stats,
    start,
    abort,
    replaceDraft,
    saveProject,
    download
  };
}
