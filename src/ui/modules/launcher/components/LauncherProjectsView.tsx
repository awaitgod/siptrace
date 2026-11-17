import React, { useState } from 'react';
import { IconFolderOpen, IconPin, IconTrash } from '@tabler/icons-react';
import type { RecentProjectItem, RecentProjectSnapshot } from '../../../../core/store';
import type { ColorSchemeId } from '../../../../core/types';
import { DipIcon } from '../../../theme/DipTraceIcons';
import { formatProjectDate } from '../projectDocuments';
import { LauncherDocumentPreview } from './LauncherDocumentPreview';

const filters = { all: 'Все', pinned: 'Закреплённые', schematic: 'Схемы', pcb: 'Платы' } as const;
export type LauncherFilter = keyof typeof filters;

export function matchesProjectFilter(project: RecentProjectItem, filter: LauncherFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'pinned') return Boolean(project.isPinned);
  return filter === 'schematic' ? project.module === 'schematic' : project.module !== 'schematic';
}

const types = {
  schematic: { label: 'Схема', icon: 'wire' },
  pcb: { label: 'Плата', icon: 'toPcb' },
  pcb3d: { label: '3D-модель', icon: 'view3d' }
} as const;

type Props = {
  projects: RecentProjectItem[];
  filtered: RecentProjectItem[];
  filter: LauncherFilter;
  onFilter: (filter: LauncherFilter) => void;
  selectedProjectId?: string;
  onSelectProject: (id: string) => void;
  onOpenProject: (project: RecentProjectItem) => void;
  onTogglePin: (id: string) => void;
  onRemoveProject: (id: string) => void;
  documents: Record<string, RecentProjectSnapshot>;
  viewMode: 'grid' | 'table';
  theme: ColorSchemeId;
};

export function LauncherProjectsView({
  projects, filtered, filter, onFilter, selectedProjectId, onSelectProject, onOpenProject,
  onTogglePin, onRemoveProject, documents, viewMode, theme
}: Props) {
  const [context, setContext] = useState<{ id: string; x: number; y: number } | null>(null);
  const contextProject = filtered.find(project => project.id === context?.id);

  function rowActions(project: RecentProjectItem, index: number) {
    return {
      'data-project-index': index,
      'aria-current': selectedProjectId === project.id ? true as const : undefined,
      tabIndex: selectedProjectId === project.id ? 0 : -1,
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        onSelectProject(project.id);
        event.currentTarget.focus();
      },
      onDoubleClick: () => onOpenProject(project),
      onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        onSelectProject(project.id);
        setContext({ id: project.id, x: event.clientX, y: event.clientY });
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          setContext({ id: project.id, x: bounds.left, y: bounds.bottom });
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          onOpenProject(project);
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? filtered.length - 1 :
            Math.max(0, Math.min(filtered.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1)));
          onSelectProject(filtered[next].id);
          event.currentTarget.closest('.launch-projects-list')?.querySelector<HTMLButtonElement>(
            '[data-project-index="' + next + '"]'
          )?.focus();
        }
      }
    };
  }

  function projectLabel(project: RecentProjectItem) {
    const type = types[project.module];
    return <>
      <DipIcon name={type.icon} size={16} />
      <span className="launch-item-text">
        <strong title={project.name}>{project.name}</strong>
        {project.designation && <small title={project.designation}>{project.designation}</small>}
      </span>
      {project.isPinned && <IconPin size={13} aria-label="Закреплён" />}
    </>;
  }

  function specs(project: RecentProjectItem) {
    const document = documents[project.id];
    if (project.module === 'schematic') {
      const sheet = document?.schematic?.sheets.find(sheet => sheet.id === document.schematic?.activeSheetId)
        ?? document?.schematic?.sheets[0];
      return sheet ? sheet.format.split('_')[0].replace('A', 'А') : '—';
    }
    return document?.pcb ? document.pcb.layerCount + ' слоя' : '—';
  }

  return <div className="launch-projects-list">
    <div className="launch-filter-bar" role="group" aria-label="Фильтр проектов">
      {(Object.keys(filters) as LauncherFilter[]).map(value => <button key={value} type="button"
        className={`launch-filter-btn ${filter === value ? 'active' : ''}`} aria-pressed={filter === value}
        onClick={() => { setContext(null); onFilter(value); }}>
        {filters[value]} <span>{projects.filter(project => matchesProjectFilter(project, value)).length}</span>
      </button>)}
    </div>
    {filtered.length === 0 ? <p className="launch-empty-message">{projects.length || filter !== 'all'
      ? 'В этом разделе нет проектов' : 'Проекты не найдены'}</p> :
    viewMode === 'table' ? <table className="dt-table launch-table" aria-label="Последние проекты">
      <colgroup><col /><col className="launch-type-col" /><col className="launch-spec-col" /><col className="launch-date-col" /></colgroup>
      <thead><tr><th scope="col">Проект</th><th scope="col">Тип</th><th scope="col">Параметры</th><th scope="col">Изменён</th></tr></thead>
      <tbody>{filtered.map((project, index) => <tr key={project.id}
        className={`launch-table-row ${selectedProjectId === project.id ? 'selected' : ''}`}
        onClick={() => onSelectProject(project.id)} onDoubleClick={event => {
          if (!(event.target instanceof Element && event.target.closest('button'))) onOpenProject(project);
        }}>
        <td><button type="button" className="launch-project" {...rowActions(project, index)}>{projectLabel(project)}</button></td>
        <td>{types[project.module].label}</td><td>{specs(project)}</td><td>{formatProjectDate(project.updatedAt)}</td>
      </tr>)}</tbody>
    </table> : <div className="launch-grid">
      {filtered.map((project, index) => <div key={project.id} className="launch-project-tile"
        data-selected={selectedProjectId === project.id}>
        <LauncherDocumentPreview documents={documents[project.id]} board={project.module !== 'schematic'} theme={theme} />
        <button type="button" className="launch-project" {...rowActions(project, index)}>{projectLabel(project)}</button>
      </div>)}
    </div>}
    {context && contextProject && <div className="launch-context-backdrop" onClick={() => setContext(null)}
      onContextMenu={event => { event.preventDefault(); setContext(null); }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          setContext(null);
          document.querySelector<HTMLButtonElement>('.launch-project[aria-current="true"]')?.focus();
        }
      }}>
      <div className="launch-project-menu-items" role="group" aria-label="Команды проекта"
        style={{ position: 'fixed', left: Math.max(0, Math.min(context.x, window.innerWidth - 200)),
          top: Math.max(0, Math.min(context.y, window.innerHeight - 104)), right: 'auto' }}>
        <button autoFocus className="dt-btn" onClick={() => onOpenProject(contextProject)}><IconFolderOpen size={14} />Открыть</button>
        <button className="dt-btn" onClick={() => onTogglePin(contextProject.id)}><IconPin size={14} />
          {contextProject.isPinned ? 'Открепить' : 'Закрепить'}</button>
        <button className="dt-btn" onClick={() => onRemoveProject(contextProject.id)}><IconTrash size={14} />Убрать из недавних</button>
      </div>
    </div>}
  </div>;
}
