import React from 'react';
import {
  IconArrowUp,
  IconSquare,
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconPlus,
  IconRefresh
} from '@tabler/icons-react';
import type { AiConnectionSettings } from '../types';
import type { RecentProjectItem, RecentProjectSnapshot } from '../../../../../core/store';

interface Props {
  task: string;
  setTask: (text: string) => void;
  busy: boolean;
  error: string;
  notice: string;
  storageFailed: boolean;
  lastFailedTask: string | null;
  connection: AiConnectionSettings;
  selected?: RecentProjectItem;
  selectedDocuments?: RecentProjectSnapshot;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  onSubmit: () => void;
  onAbort: () => void;
  onRetry: () => void;
  onOpenSettings: (trigger: HTMLElement) => void;
  onCopyProject: () => void;
}

export const AgentComposer: React.FC<Props> = ({
  task,
  setTask,
  busy,
  error,
  notice,
  storageFailed,
  lastFailedTask,
  connection,
  selected,
  selectedDocuments,
  composerRef,
  onSubmit,
  onAbort,
  onRetry,
  onOpenSettings,
  onCopyProject
}) => {
  const isConnected = Boolean(connection.key || connection.endpoint);

  return (
    <div className="agent-compose-area">
      {error && (
        <div className="dt-message-warning agent-error" role="alert">
          <IconAlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
          {lastFailedTask && (
            <button
              type="button"
              className="dt-btn agent-retry-btn"
              onClick={onRetry}
              title="Повторить отправку предыдущего задания"
            >
              <IconRefresh size={13} aria-hidden="true" />
              <span>Повторить</span>
            </button>
          )}
        </div>
      )}

      {storageFailed && (
        <div className="dt-message-warning agent-error" role="alert">
          <IconAlertTriangle size={16} aria-hidden="true" />
          <span>Локальная запись недоступна (превышена квота браузера). Экспортируйте документы перед закрытием.</span>
        </div>
      )}

      {notice && !error && (
        <div key={notice} className="dt-message-success agent-notice" role="status">
          <IconCheck size={14} aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      <form
        className="agent-composer"
        onSubmit={event => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <textarea
          ref={composerRef}
          aria-label="Задание"
          value={task}
          maxLength={16000}
          rows={3}
          disabled={busy}
          placeholder="Задание для агента"
          onChange={event => setTask(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape' && busy) {
              event.preventDefault();
              onAbort();
              return;
            }
            const isSubmit =
              (event.key === 'Enter' && !event.shiftKey) ||
              (event.key === 'Enter' && (event.ctrlKey || event.metaKey));
            if (isSubmit && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />

        <div className="agent-composer-footer">
          <div className="agent-composer-options">
            <button
              type="button"
              className="agent-model-btn"
              title={`Сервер: ${connection.endpoint}\nМодель: ${connection.model}`}
              aria-label={`Сервер ИИ: ${connection.model}`}
              aria-haspopup="dialog"
              onClick={e => onOpenSettings(e.currentTarget)}
            >
              <span className="agent-connection-dot" data-connected={isConnected} />
              <span>{connection.model.startsWith('deepseek') ? 'DeepSeek Flash' : connection.model}</span>
              <IconChevronDown size={13} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="agent-copy-project"
              disabled={busy || !(selectedDocuments?.schematic || selectedDocuments?.pcb)}
              title={
                selected?.name
                  ? `Копировать «${selected.name}» в черновик`
                  : 'Выберите проект в списке проектов лаунчера'
              }
              onClick={onCopyProject}
            >
              <IconPlus size={14} aria-hidden="true" />
              <span>Копировать проект</span>
            </button>
          </div>

          {busy ? (
            <button
              className="dt-btn agent-send"
              aria-label="Остановить"
              title="Остановить выполнение (Esc)"
              type="button"
              onClick={onAbort}
            >
              <IconSquare className="agent-send-symbol" size={15} fill="currentColor" />
            </button>
          ) : (
            <button
              className="dt-btn primary agent-send"
              aria-label="Запустить агента"
              title={isConnected ? 'Отправить (Enter или Ctrl+Enter)' : 'Настроить подключение и отправить'}
              type="submit"
              disabled={!task.trim()}
            >
              <IconArrowUp className="agent-send-symbol" size={19} />
            </button>
          )}
        </div>
      </form>

    </div>
  );
};
