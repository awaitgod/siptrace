import { useState, useMemo, useRef, useEffect } from 'react';
import type { ColorSchemeId } from '../../../../core/models';
import type { RecentProjectItem, RecentProjectSnapshot } from '../../../../core/store';
import type { AppModuleId } from '../../../../core/types';
import { useAgentSession } from './hooks/useAgentSession';
import { AgentTopBar } from './components/AgentTopBar';
import { AgentConversation } from './components/AgentConversation';
import { AgentComposer } from './components/AgentComposer';
import { AgentInspector } from './components/AgentInspector';
import { AgentSettingsDialog } from './components/AgentSettingsDialog';
import { AgentLiveDocument, type AgentDocumentItem } from './AgentLiveDocument';
import { toolLabels } from './types';
import './agent.css';

interface Props {
  visible: boolean;
  theme: ColorSchemeId;
  selected?: RecentProjectItem;
  selectedDocuments?: RecentProjectSnapshot;
  onSaved: (id: string) => void;
  onSwitchModule?: (moduleId: AppModuleId) => void;
}

export default function AgentPanel({
  visible,
  theme,
  selected,
  selectedDocuments,
  onSaved,
  onSwitchModule
}: Props) {
  const session = useAgentSession(visible, theme, selected, selectedDocuments, onSaved);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<'documents' | 'checks'>('documents');
  const [activeDocument, setActiveDocument] = useState('');
  const [liveDocumentOpen, setLiveDocumentOpen] = useState(false);

  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const { schematic, pcb } = session.draft.documents;
  const hasDocuments = Boolean(schematic || pcb);
  const projectName = schematic?.projectName ?? pcb?.projectName;

  useEffect(() => {
    if (visible) {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      conversationEndRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: session.messages.length && !reducedMotion ? 'smooth' : 'instant'
      });
    }
  }, [session.messages.length, session.busy, visible]);

  useEffect(() => {
    if (!visible) setLiveDocumentOpen(false);
  }, [visible]);

  const documents: AgentDocumentItem[] = useMemo(() => [
    ...(schematic?.sheets.map(sheet => ({ id: sheet.id, label: sheet.name, kind: 'schematic' as const })) ?? []),
    ...(pcb ? [{ id: 'pcb', label: 'Печатная плата', kind: 'pcb' as const }] : [])
  ], [schematic, pcb]);

  const current = documents.find(item => item.id === activeDocument) ?? documents[0];
  const currentCapture = session.captures.find(item => item.id === current?.id);

  const previewDocuments = useMemo(() => {
    return current?.kind === 'schematic' && schematic
      ? { ...session.draft.documents, schematic: { ...schematic, activeSheetId: current.id } }
      : session.draft.documents;
  }, [session.draft.documents, schematic, current?.id]);

  const lastStep = session.steps.at(-1) ?? 'Подготовка';
  const displayStep = lastStep.includes(' · ')
    ? toolLabels[lastStep.split(' · ')[1]] ?? lastStep
    : lastStep;

  const handleOpenSettings = (trigger: HTMLElement) => {
    lastTriggerRef.current = trigger;
    setSettingsOpen(true);
  };

  const handleOpenLiveDocument = (trigger?: HTMLElement) => {
    if (trigger) lastTriggerRef.current = trigger;
    setLiveDocumentOpen(true);
  };

  const handleCopyProject = () => {
    if (
      (!hasDocuments && !session.messages.length) ||
      window.confirm('Заменить текущий черновик копией выбранного проекта?')
    ) {
      session.replaceDraft(selectedDocuments);
    }
  };

  const handleNewDraft = () => {
    if (
      (!hasDocuments && !session.messages.length) ||
      window.confirm('Начать новый черновик и очистить переписку?')
    ) {
      session.replaceDraft();
    }
  };

  return (
    <section
      className={`launch-agent ${inspectorOpen ? 'agent-with-inspector' : ''}`}
      aria-label="ИИ-агент"
    >
      <AgentTopBar
        projectName={projectName}
        busy={session.busy}
        inspectorOpen={inspectorOpen}
        onNewDraft={handleNewDraft}
        onOpenSettings={handleOpenSettings}
        onToggleInspector={() => setInspectorOpen(v => !v)}
      />

      <div className="agent-chat">
        <AgentConversation
          messages={session.messages}
          hasDocuments={hasDocuments}
          busy={session.busy}
          displayStep={displayStep}
          steps={session.steps}
          stats={session.stats}
          conversationEndRef={conversationEndRef}
          onSelectPrompt={prompt => {
            session.setTask(prompt);
            composerRef.current?.focus();
          }}
        />

        <AgentComposer
          task={session.task}
          setTask={session.setTask}
          busy={session.busy}
          error={session.error}
          notice={session.notice}
          storageFailed={session.storageFailed}
          lastFailedTask={session.lastFailedTask}
          connection={session.connection}
          selected={selected}
          selectedDocuments={selectedDocuments}
          composerRef={composerRef}
          onSubmit={session.start}
          onAbort={session.abort}
          onRetry={session.retry}
          onOpenSettings={handleOpenSettings}
          onCopyProject={handleCopyProject}
        />
      </div>

      <AgentInspector
        open={inspectorOpen}
        inspectorTab={inspectorTab}
        setInspectorTab={setInspectorTab}
        documents={documents}
        current={current}
        currentCapture={currentCapture}
        previewDocuments={previewDocuments}
        theme={theme}
        draft={session.draft}
        busy={session.busy}
        onSelectDocument={setActiveDocument}
        onOpenLiveDocument={handleOpenLiveDocument}
        onSaveProject={session.saveProject}
        onDownload={session.download}
        onSwitchModule={onSwitchModule}
      />

      {current && (
        <AgentLiveDocument
          open={visible && liveDocumentOpen}
          documents={session.draft.documents}
          items={documents}
          current={current}
          theme={theme}
          busy={session.busy}
          step={displayStep}
          onSelect={setActiveDocument}
          onClose={() => setLiveDocumentOpen(false)}
        />
      )}

      <AgentSettingsDialog
        open={visible && settingsOpen}
        busy={session.busy}
        connection={session.connection}
        onSaveConnection={session.saveConnection}
        onClose={() => setSettingsOpen(false)}
        triggerRef={lastTriggerRef}
      />
    </section>
  );
}
