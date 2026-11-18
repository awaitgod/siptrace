import React from 'react';
import { IconPlus, IconSettings, IconLayoutSidebarRight } from '@tabler/icons-react';
import logo from '/logo.svg?url';

interface Props {
  projectName?: string;
  busy: boolean;
  inspectorOpen: boolean;
  onNewDraft: () => void;
  onOpenSettings: (trigger: HTMLElement) => void;
  onToggleInspector: () => void;
}

export const AgentTopBar: React.FC<Props> = ({
  projectName,
  busy,
  inspectorOpen,
  onNewDraft,
  onOpenSettings,
  onToggleInspector
}) => {
  return (
    <header className="agent-topbar" aria-label="Панель управления агентом">
      <div className="agent-title">
        <img src={logo} alt="" width={20} height={20} />
        <span>ИИ-инженер САПР</span>
        {projectName && (
          <span className="agent-project-name" title={`Текущий проект: ${projectName}`}>
            {projectName}
          </span>
        )}
      </div>

      <div className="agent-toolbar">
        <button
          className="dt-tb-btn agent-icon-button"
          aria-label="Новый черновик"
          title="Начать новый проект (очистить черновик)"
          disabled={busy}
          onClick={onNewDraft}
        >
          <IconPlus size={18} />
        </button>

        <button
          className="dt-tb-btn agent-icon-button"
          aria-label="Настройки подключения"
          title="Параметры подключения к серверу ИИ"
          onClick={e => onOpenSettings(e.currentTarget)}
        >
          <IconSettings size={17} />
        </button>

        <button
          className="dt-tb-btn agent-icon-button"
          aria-label="Показать документы и проверки"
          title="Панель документов и проверок"
          aria-pressed={inspectorOpen}
          onClick={onToggleInspector}
        >
          <IconLayoutSidebarRight size={18} />
        </button>
      </div>
    </header>
  );
};
