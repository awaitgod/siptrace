import React, { useRef, useEffect } from 'react';
import { IconPlugConnected, IconX } from '@tabler/icons-react';
import type { AiConnectionSettings } from '../types';
import { PRESET_ENDPOINTS, DEFAULT_MODELS } from '../types';

interface Props {
  open: boolean;
  busy: boolean;
  connection: AiConnectionSettings;
  onSaveConnection: (settings: Partial<AiConnectionSettings>) => void;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const AgentSettingsDialog: React.FC<Props> = ({
  open,
  busy,
  connection,
  onSaveConnection,
  onClose,
  triggerRef
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const endpointInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      endpointInputRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      triggerRef?.current?.focus();
    }
  }, [open, triggerRef]);

  const handleClose = () => {
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="agent-settings-dialog"
      aria-label="Настройки подключения"
      onCancel={event => {
        event.preventDefault();
        handleClose();
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          handleClose();
        }
      }}
    >
      <div className="dt-modal agent-settings-panel">
        <div className="dt-modal-title agent-settings-heading">
          <IconPlugConnected size={20} aria-hidden="true" />
          <h2>Подключение</h2>
          <button
            className="dt-tb-btn agent-icon-button"
            aria-label="Закрыть настройки"
            title="Закрыть настройки (Esc)"
            onClick={handleClose}
          >
            <IconX size={18} />
          </button>
        </div>

        <div className="dt-modal-body">
          <label>
            Адрес сервера
            <input
              ref={endpointInputRef}
              className="dt-input"
              value={connection.endpoint}
              disabled={busy}
              onChange={event => onSaveConnection({ endpoint: event.target.value })}
              placeholder="https://api.aitunnel.ru/v1 или http://127.0.0.1:11434/v1"
            />
          </label>

          <div className="agent-endpoint-presets" role="group" aria-label="Пресеты серверов">
            {PRESET_ENDPOINTS.map(preset => (
              <button
                key={preset.url}
                type="button"
                className={`dt-btn ${connection.endpoint === preset.url ? 'active' : ''}`}
                onClick={() => onSaveConnection({ endpoint: preset.url })}
                title={preset.url}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <label>
            Ключ API
            <input
              className="dt-input"
              type="password"
              aria-label="Ключ AITUNNEL"
              value={connection.key}
              autoComplete="off"
              disabled={busy}
              onChange={event => onSaveConnection({ key: event.target.value })}
              placeholder="sk-… (не требуется для локальных Ollama / vLLM)"
            />
          </label>

          <label>
            Модель
            <input
              className="dt-input"
              aria-label="Модель"
              value={connection.model}
              disabled={busy}
              onChange={event => onSaveConnection({ model: event.target.value })}
              list="agent-models"
            />
          </label>

          <datalist id="agent-models">
            {DEFAULT_MODELS.map(modelId => (
              <option key={modelId} value={modelId} />
            ))}
          </datalist>

        </div>

        <div className="dt-modal-footer">
          <button className="dt-btn primary" onClick={handleClose}>
            Готово
          </button>
        </div>
      </div>
    </dialog>
  );
};
