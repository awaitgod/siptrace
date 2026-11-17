import React, { useEffect, useLayoutEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { AppModuleId } from '../../../core/types';
import {
  createProjectFromOptions,
  loadSettings,
  saveActivePcb,
  saveActiveSchematic,
  saveSettings,
  togglePinRecentProject,
  removeRecentProject,
  openPickedProjectFile,
  STORAGE_KEYS
} from '../../../core/store';
import type { NewProjectOptions, RecentProjectItem } from '../../../core/store';
import { clearSavedFileHandle, pickCadFile, PickedCadFile } from '../../../core/utils/fileIo';
import { MenuBar } from '../../components/MenuBar';
import type { TopMenuSpec } from '../../components/MenuBar';
import { NewProjectDialog } from '../../components/NewProjectDialog';
import { CadLibraryManagerDialog } from '../../components/CadLibraryManagerDialog';
import { LauncherSidebar, LauncherNavTab, EDITORS } from './components/LauncherSidebar';
import { LauncherActionBar } from './components/LauncherActionBar';
import { LauncherProjectsView, matchesProjectFilter, type LauncherFilter } from './components/LauncherProjectsView';
import { LauncherTemplatesView } from './components/LauncherTemplatesView';
import { LauncherUtilitiesView } from './components/LauncherUtilitiesView';
import { LauncherInspector } from './components/LauncherInspector';
import { getProjectDocuments } from './projectDocuments';
import './launcher.css';

const AgentPanel = React.lazy(() => import('./agent/AgentPanel'));

interface Props {
  active: boolean;
  onSwitchModule: (moduleId: AppModuleId) => void;
}

export function LauncherModule({ active, onSwitchModule }: Props) {
  const [settings, setSettings] = useState(loadSettings);
  const [activeTab, setActiveTab] = useState<LauncherNavTab>('projects');
  const [agentOpened, setAgentOpened] = useState(false);
  const [agentSurface] = useState(() => {
    const surface = document.createElement('div');
    surface.className = 'launch-agent-host';
    return surface;
  });
  const agentHost = useRef<HTMLDivElement>(null);
  const selectTab = (tab: LauncherNavTab) => {
    if (tab === 'agent') setAgentOpened(true);
    setActiveTab(tab);
  };
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => localStorage.getItem('siptrace.launcher.view') === 'grid' ? 'grid' : 'table');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [showLibraryManager, setShowLibraryManager] = useState(false);
  const [selectedId, setSelectedId] = useState(() => sessionStorage.getItem('siptrace.launcher.selected'));
  const [filter, setFilter] = useState<LauncherFilter>('all');
  const [inspectorOpen, setInspectorOpen] = useState(() => localStorage.getItem('siptrace.launcher.inspector') !== 'closed');
  const [inspectorWidth, setInspectorWidth] = useState(() => Number(localStorage.getItem('siptrace.launcher.width')) || 380);
  const scroll = useRef<HTMLDivElement>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!active) return;
    document.title = 'SIPTrace';
    setSettings(loadSettings());
    const syncSettings = (event: StorageEvent) => {
      if (event.key === STORAGE_KEYS.SETTINGS || event.key === null) {
        const next = loadSettings();
        setSettings(next);
      }
    };
    window.addEventListener('storage', syncSettings);
    return () => window.removeEventListener('storage', syncSettings);
  }, [active]);

  const projects = settings.recentProjects ?? [];
  const documents = useMemo(() => Object.fromEntries(
    (settings.recentProjects ?? []).map(project => [project.id, getProjectDocuments(project)])
  ), [settings]);
  const search = query.trim().toLocaleLowerCase('ru');
  const results = projects.filter(project =>
    (project.name + ' ' + project.designation).toLocaleLowerCase('ru').includes(search)
  );
  const recent = results.filter(project => matchesProjectFilter(project, filter))
    .sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)));
  const selectedProject = recent.find(project => project.id === selectedId) ?? recent[0];
  const selectedDocuments = selectedProject && documents[selectedProject.id];

  const selectProject = (id: string) => {
    setSelectedId(id);
    sessionStorage.setItem('siptrace.launcher.selected', id);
  };

  useEffect(() => {
    const element = scroll.current;
    if (element) element.scrollTop = Number(sessionStorage.getItem('siptrace.launcher.scroll')) || 0;
  }, [active]);

  // Keep the agent mounted while moving its surface out of the editor's DOM.
  useLayoutEffect(() => {
    if (active && agentOpened) agentHost.current?.append(agentSurface);
    return () => agentSurface.remove();
  }, [active, agentOpened, agentSurface]);

  useEffect(() => localStorage.setItem('siptrace.launcher.view', viewMode), [viewMode]);
  useEffect(() => localStorage.setItem('siptrace.launcher.width', String(inspectorWidth)), [inspectorWidth]);
  useEffect(() => localStorage.setItem('siptrace.launcher.inspector', inspectorOpen ? 'open' : 'closed'), [inspectorOpen]);

  function resizeInspector(width: number) {
    setInspectorWidth(Math.min(620, Math.max(270, width)));
  }

  const dark = settings.colorScheme === 'dark';

  const setTheme = (colorScheme: 'light' | 'dark') => {
    const next = { ...loadSettings(), colorScheme };
    saveSettings(next);
    setSettings(next);
    document.documentElement.dataset.theme = colorScheme;
  };

  const showNotification = (msg: string) => {
    setBannerMessage(msg);
    setTimeout(() => setBannerMessage(null), 4000);
  };

  const openRecent = (project: RecentProjectItem, targetModuleOverride?: AppModuleId) => {
    const snapshot = documents[project.id];
    const targetModule = targetModuleOverride ?? project.module;

    if (targetModule === 'schematic' ? !snapshot?.schematic?.sheets.length : !snapshot?.pcb) {
      setError(`Копия проекта «${project.name}» недоступна. Откройте исходный файл с диска.`);
      return;
    }
    selectProject(project.id);
    sessionStorage.setItem('siptrace.launcher.scroll', String(scroll.current?.scrollTop ?? 0));
    if (snapshot?.schematic) {
      clearSavedFileHandle('schematic');
      saveActiveSchematic(snapshot.schematic);
    }
    if (snapshot?.pcb) {
      clearSavedFileHandle('pcb');
      saveActivePcb(snapshot.pcb);
    }
    onSwitchModule(targetModule);
  };

  const handleOpenFile = async () => {
    try {
      const picked = await pickCadFile();
      if (!picked) return;
      const result = await openPickedProjectFile(picked);
      showNotification(`Файл «${picked.name}» успешно открыт (${result.detectedFormat}).`);
      onSwitchModule(result.targetModule);
    } catch (err) {
      setError(`Не удалось открыть файл: ${(err as Error)?.message || 'Неизвестная ошибка'}`);
    }
  };

  const handleTogglePin = (id: string) => {
    togglePinRecentProject(id);
    setSettings(loadSettings());
  };

  const handleRemoveProject = (id: string) => {
    removeRecentProject(id);
    const next = loadSettings();
    setSettings(next);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const picked: PickedCadFile = {
        name: file.name,
        filePath: file.name,
        bytes
      };
      const result = await openPickedProjectFile(picked);
      showNotification(`Импортирован файл «${file.name}» (${result.detectedFormat}).`);
      onSwitchModule(result.targetModule);
    } catch (err) {
      setError(`Ошибка импорта при перетаскивании: ${(err as Error)?.message}`);
    }
  };

  const create = (options: NewProjectOptions) => {
    const result = createProjectFromOptions(options, 'schematic');
    setCreating(false);
    onSwitchModule(result.targetModule);
  };

  const menus: TopMenuSpec[] = [
    {
      id: 'file',
      label: 'Файл',
      items: [
        { label: 'Новый проект…', onClick: () => setCreating(true) },
        { label: 'Открыть или импортировать…', onClick: handleOpenFile }
      ]
    },
    {
      id: 'view',
      label: 'Вид',
      items: [
        { label: 'Светлая тема', checked: !dark, onClick: () => setTheme('light') },
        { label: 'Тёмная тема', checked: dark, onClick: () => setTheme('dark') },
        { label: 'Свойства проекта', checked: inspectorOpen, onClick: () => setInspectorOpen(value => !value) }
      ]
    },
    {
      id: 'tools',
      label: 'Инструменты',
      items: EDITORS.map(({ id, label }) => ({ id, label, onClick: () => onSwitchModule(id) }))
    }
  ];

  return <>
    {active && <div
      className={`launch-workspace ${isDragging ? 'drag-over' : ''}`}
      onKeyDown={event => {
        if (creating || showLibraryManager || event.altKey || !event.ctrlKey) return;
        const key = event.code;
        if (key === 'KeyN' || key === 'KeyO') {
          event.preventDefault();
          if (key === 'KeyN') setCreating(true);
          if (key === 'KeyO') void handleOpenFile();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <MenuBar menus={menus} brand={null} />

      {isDragging && (
        <div className="launch-drag-overlay">
          <h2>Перетащите файл проекта или библиотеки сюда</h2>
          <p>Поддерживаются форматы SIPTrace, KiCad, Altium, DipTrace, Eagle, Gerber, DXF</p>
        </div>
      )}

      <div className={`launch-body ${inspectorOpen && selectedProject && activeTab === 'projects' ? 'launch-with-inspector' : ''}`}
        style={{ '--launch-inspector-width': inspectorWidth + 'px' } as React.CSSProperties}>
        {/* Left Navigation Sidebar (230px) */}
        <LauncherSidebar
          activeTab={activeTab}
          onSelectTab={selectTab}
          onOpenLibraries={() => setShowLibraryManager(true)}
          onSwitchModule={onSwitchModule}
          projectsCount={projects.length}
        />

        {/* Central Studio Main Area */}
        <main className="launch-main-area" aria-label="Центральная рабочая область">
          {activeTab !== 'agent' && <LauncherActionBar
            onCreateProject={() => setCreating(true)}
            onOpenFile={handleOpenFile}
            inspectorOpen={inspectorOpen}
            canInspect={Boolean(selectedProject)}
            onToggleInspector={() => setInspectorOpen(value => !value)}
            searchQuery={query}
            onSearchChange={(q) => {
              setQuery(q);
              setError('');
            }}
            viewMode={viewMode}
            onToggleViewMode={setViewMode}
            activeTab={activeTab}
          />}

          <div className={`launch-content-scroll ${activeTab === 'agent' ? 'launch-agent-scroll' : ''}`} ref={scroll}>
            {bannerMessage && (
              <div className="launch-banner-msg" role="status">
                {bannerMessage}
              </div>
            )}

            {error && (
              <p className="dt-error-message launch-error" role="alert">
                {error}
              </p>
            )}

            {activeTab === 'projects' && (
              <LauncherProjectsView
                projects={results}
                filtered={recent}
                filter={filter}
                onFilter={setFilter}
                documents={documents}
                theme={settings.colorScheme}
                selectedProjectId={selectedProject?.id}
                onSelectProject={selectProject}
                onOpenProject={(p) => openRecent(p)}
                onTogglePin={handleTogglePin}
                onRemoveProject={handleRemoveProject}
                viewMode={viewMode}
              />
            )}

            {agentOpened && <div className="launch-agent-host" ref={agentHost} hidden={activeTab !== 'agent'} />}

            {activeTab === 'templates' && (
              <LauncherTemplatesView
                onSwitchModule={onSwitchModule}
                onShowMessage={showNotification}
              />
            )}

            {activeTab === 'utilities' && (
              <LauncherUtilitiesView onShowMessage={showNotification} />
            )}
          </div>
        </main>

        {activeTab === 'projects' && inspectorOpen && selectedProject && selectedDocuments && <>
          <div className="launch-panel-separator" role="separator" aria-label="Ширина свойств проекта"
            aria-orientation="vertical" aria-valuemin={270} aria-valuemax={620}
            aria-valuenow={inspectorWidth} tabIndex={0}
            onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
            onPointerMove={event => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                resizeInspector(window.innerWidth - event.clientX);
              }
            }}
            onKeyDown={event => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                resizeInspector(inspectorWidth + (event.key === 'ArrowLeft' ? 16 : -16));
              }
            }}
          />
          <LauncherInspector key={selectedProject.id}
            project={selectedProject}
            documents={selectedDocuments}
            theme={settings.colorScheme}
            onClose={() => setInspectorOpen(false)}
            onOpenFile={handleOpenFile}
            onOpenProject={openRecent}
            onTogglePin={handleTogglePin}
            onRemoveProject={handleRemoveProject}
            onShowMessage={showNotification}
          />
        </>}
      </div>

      <footer className="dt-statusbar launch-status">
        <div className="dt-status-cell" role="status">
          {recent.length === projects.length ? `Проектов: ${projects.length}` : `Показано: ${recent.length} из ${projects.length}`}
        </div>
      </footer>

      {creating && <NewProjectDialog onCreate={create} onClose={() => setCreating(false)} />}

      {showLibraryManager && (
        <CadLibraryManagerDialog onClose={() => setShowLibraryManager(false)} />
      )}
    </div>}
    {agentOpened && createPortal(
      <React.Suspense fallback={<p role="status">Загрузка агента…</p>}>
        <AgentPanel visible={active && activeTab === 'agent'} theme={settings.colorScheme} selected={selectedProject} selectedDocuments={selectedDocuments}
          onSaved={id => {
            setSettings(loadSettings());
            selectProject(id);
            setFilter('all');
            setQuery('');
          }} />
      </React.Suspense>, agentSurface)}
  </>;
}

export default LauncherModule;
