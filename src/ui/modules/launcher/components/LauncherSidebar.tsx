import React from 'react';
import {
  IconFolder,
  IconTemplate,
  IconCalculator,
  IconBook,
  IconRobot,
  IconChevronRight
} from '@tabler/icons-react';
import type { AppModuleId } from '../../../../core/types';
import { DipIcon } from '../../../theme/DipTraceIcons';

export type LauncherNavTab = 'projects' | 'templates' | 'utilities' | 'agent';

export const EDITORS = [
  { id: 'schematic', label: 'Редактор схем', detail: 'Электрические схемы', icon: 'wire' },
  { id: 'pcb', label: 'Редактор плат', detail: 'Размещение и трассировка', icon: 'toPcb' },
  { id: 'componentEditor', label: 'Редактор компонентов', detail: 'Символы и выводы', icon: 'placeComp' },
  { id: 'patternEditor', label: 'Редактор посадочных мест', detail: 'Корпуса и контактные площадки', icon: 'padSmd' },
  { id: 'pcb3d', label: '3D-просмотр платы', detail: 'Объёмная модель и сборка', icon: 'view3d' }
] as const;

interface LauncherSidebarProps {
  activeTab: LauncherNavTab;
  onSelectTab: (tab: LauncherNavTab) => void;
  onOpenLibraries: () => void;
  onSwitchModule: (moduleId: AppModuleId) => void;
  projectsCount: number;
}

export const LauncherSidebar: React.FC<LauncherSidebarProps> = ({
  activeTab,
  onSelectTab,
  onOpenLibraries,
  onSwitchModule,
  projectsCount
}) => {
  return (
    <aside className="dt-left-sidebar launch-sidebar" aria-label="Панель навигации">
      {/* Main Navigation with dt-black-bar header */}
      <div className="dt-black-bar">Рабочая область</div>
      <nav className="launch-nav" aria-label="Разделы лаунчера">
        <button type="button"
          className={`dt-lib-item launch-nav-row ${activeTab === 'agent' ? 'selected' : ''}`}
          onClick={() => onSelectTab('agent')}
        >
          <IconRobot size={14} />
          <span className="launch-nav-item-title">ИИ-агент</span>
        </button>

        <button type="button"
          className={`dt-lib-item launch-nav-row ${activeTab === 'projects' ? 'selected' : ''}`}
          onClick={() => onSelectTab('projects')}
        >
          <IconFolder size={14} />
          <span className="launch-nav-item-title">Проекты</span>
          <span className="launch-nav-count">({projectsCount})</span>
        </button>

        <button type="button"
          className={`dt-lib-item launch-nav-row ${activeTab === 'templates' ? 'selected' : ''}`}
          onClick={() => onSelectTab('templates')}
        >
          <IconTemplate size={14} />
          <span className="launch-nav-item-title">Шаблоны и ГОСТ</span>
        </button>

        <button type="button"
          className={`dt-lib-item launch-nav-row ${activeTab === 'utilities' ? 'selected' : ''}`}
          onClick={() => onSelectTab('utilities')}
        >
          <IconCalculator size={14} />
          <span className="launch-nav-item-title">Инструменты и расчёты</span>
        </button>

        <button type="button"
          className="dt-lib-item launch-nav-row"
          onClick={onOpenLibraries}
          title="Открыть менеджер библиотек ГОСТ УГО и посадочных мест"
        >
          <IconBook size={14} />
          <span className="launch-nav-item-title">Библиотека ГОСТ</span>
        </button>
      </nav>

      {/* Editors Quick Launch Section with dt-black-bar */}
      <section className="launch-editors-section" aria-label="Редакторы">
        <div className="dt-black-bar" id="launch-editors-title">
          Запуск редакторов
        </div>
        <div className="dt-comp-list launch-editors-comp-list">
          {EDITORS.map(({ id, icon, label, detail }) => (
            <button
              key={id}
              type="button"
              className="dt-comp-item launch-editor-mini-btn"
              aria-label={label}
              onClick={() => onSwitchModule(id)}
              title={`${label} — ${detail}`}
            >
              <DipIcon name={icon} size={14} />
              <span className="launch-editor-mini-text">{label}</span>
              <IconChevronRight size={11} className="launch-editor-chevron" />
            </button>
          ))}
        </div>
      </section>

    </aside>
  );
};
