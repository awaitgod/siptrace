import React, { useRef } from 'react';
import {
  IconPlus,
  IconFolderOpen,
  IconLayoutSidebarRight,
  IconSearch,
  IconLayoutGrid,
  IconList,
  IconX
} from '@tabler/icons-react';

interface LauncherActionBarProps {
  onCreateProject: () => void;
  onOpenFile: () => void;
  inspectorOpen: boolean;
  canInspect: boolean;
  onToggleInspector: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  viewMode: 'grid' | 'table';
  onToggleViewMode: (mode: 'grid' | 'table') => void;
  activeTab: 'projects' | 'templates' | 'utilities';
}

export const LauncherActionBar: React.FC<LauncherActionBarProps> = ({
  onCreateProject,
  onOpenFile,
  inspectorOpen,
  canInspect,
  onToggleInspector,
  searchQuery,
  onSearchChange,
  viewMode,
  onToggleViewMode,
  activeTab
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (searchInputRef.current && !document.querySelector('[role=dialog]') && tag !== 'input' && tag !== 'textarea' && !(document.activeElement as HTMLElement | null)?.isContentEditable) {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="launch-action-bar">
      <div className="launch-action-buttons">
        <button
          type="button"
          className="dt-btn launch-btn-create"
          onClick={onCreateProject}
          title="Создать новый проект (Ctrl+N)"
        >
          <IconPlus size={14} />
          <span>Создать проект</span>
        </button>

        <button
          type="button"
          className="dt-btn launch-btn-open"
          onClick={onOpenFile}
          title="Открыть файл проекта с диска (Ctrl+O)"
        >
          <IconFolderOpen size={14} />
          <span>Открыть или импортировать…</span>
        </button>

      </div>

      {activeTab === 'projects' && (
        <div className="launch-search-and-view">
          <label className="launch-search-wrap">
            <IconSearch size={13} className="launch-search-icon" />
            <input
              ref={searchInputRef}
              className="dt-input launch-search-input"
              type="search"
              aria-label="Поиск проектов"
              placeholder="Поиск проектов (/)"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="launch-search-clear"
                onClick={() => onSearchChange('')}
                title="Очистить"
              >
                <IconX size={11} />
              </button>
            )}
          </label>

          <div className="dt-toolbar" role="group" aria-label="Вид отображения" style={{ padding: 0 }}>
            <button
              type="button"
              className={`dt-tb-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => onToggleViewMode('table')}
              title="Таблица (список)"
              aria-label="Вид таблицей (список)"
            >
              <IconList size={14} />
            </button>
            <button
              type="button"
              className={`dt-tb-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => onToggleViewMode('grid')}
              title="Плитка"
              aria-label="Вид сеткой (плитка)"
            >
              <IconLayoutGrid size={14} />
            </button>
            <button type="button" className={`dt-tb-btn ${inspectorOpen && canInspect ? 'active' : ''}`}
              title="Свойства проекта" aria-label="Свойства проекта" aria-pressed={inspectorOpen && canInspect}
              disabled={!canInspect} onClick={onToggleInspector}>
              <IconLayoutSidebarRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
