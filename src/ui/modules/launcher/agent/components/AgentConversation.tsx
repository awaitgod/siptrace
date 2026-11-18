import React from 'react';
import { IconCircuitResistor, IconChevronDown, IconLoader2, IconArrowUp } from '@tabler/icons-react';
import logo from '/logo.svg?url';
import type { Message, RunStats } from '../types';
import { toolLabels } from '../types';

interface Props {
  messages: Message[];
  hasDocuments: boolean;
  busy: boolean;
  displayStep: string;
  steps: string[];
  stats: RunStats;
  conversationEndRef: React.RefObject<HTMLDivElement | null>;
  onSelectPrompt: (prompt: string) => void;
}

const PRESET_PROMPTS: [string, string][] = [
  [
    'RC-фильтр',
    'Создай схему RC-ФНЧ с R1=10 кОм и C1=100 нФ, входом IN, выходом OUT и GND. Формат A4, обозначение ТЕСТ.000001 Э3. Рассчитай частоту среза.'
  ],
  [
    'Делитель напряжения',
    'Создай схему делителя 5 В → 2,5 В на двух резисторах 10 кОм. Формат A4, обозначение ТЕСТ.000002 Э3.'
  ],
  [
    'Схема и плата',
    'Создай схему и плату 40×30 мм с двумя резисторами 0805. Соедини площадки 1 цепью A, площадки 2 цепью B. Проверь разводку и соответствие схеме.'
  ]
];

export const AgentConversation: React.FC<Props> = ({
  messages,
  hasDocuments,
  busy,
  displayStep,
  steps,
  stats,
  conversationEndRef,
  onSelectPrompt
}) => {
  return (
    <div className="agent-conversation" role="log" aria-live="polite" aria-label="Переписка с агентом">
      {!messages.length && (
        <div className="agent-welcome">
          <img className="agent-welcome-mark" src={logo} alt="" width={48} height={48} />
          <h1>
            {hasDocuments
              ? 'Что изменить в проекте?'
              : 'Какое устройство спроектируем?'}
          </h1>
          <div className="agent-suggestions" role="group" aria-label="Готовые инженерные сценарии">
            {PRESET_PROMPTS.map(([title, prompt]) => (
              <button
                className="dt-btn"
                key={title}
                type="button"
                onClick={() => onSelectPrompt(prompt)}
              >
                <span>{title}</span>
                <IconArrowUp size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="agent-messages">
        {messages.map(message => (
          <article
            key={message.id}
            className={`agent-message agent-message-${message.role}`}
            aria-label={message.role === 'assistant' ? 'Ответ ассистента' : 'Сообщение пользователя'}
          >
            {message.role === 'assistant' && (
              <div className="agent-message-author">
                <IconCircuitResistor size={16} aria-hidden="true" />
                {message.status === 'draft' && <span className="agent-draft-label">Черновик</span>}
              </div>
            )}
            <div className="agent-message-content">{message.content}</div>
            {message.verification && <p aria-label="Результат проверки SIPTrace">{message.verification}</p>}
            {message.details && (
              <details className="agent-message-details">
                <summary tabIndex={0}>Ограничения и замечания</summary>
                <p>{message.details}</p>
              </details>
            )}
          </article>
        ))}

        {busy && (
          <div className="agent-thinking" role="status" aria-live="assertive">
            <IconLoader2 className="agent-spin" size={16} aria-hidden="true" />
            <span key={displayStep}>{displayStep}</span>
          </div>
        )}

        {(steps.length > 0 || stats.requests > 0) && (
          <details className="agent-activity">
            <summary tabIndex={0}>
              <span>Журнал операций</span>
              <IconChevronDown size={14} aria-hidden="true" />
            </summary>
            <ol aria-label="Список выполненных операций">
              {steps.map((step, index) => (
                <li key={index}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <span>
                    {step.includes(' · ')
                      ? toolLabels[step.split(' · ')[1]] ?? step
                      : step}
                  </span>
                </li>
              ))}
            </ol>
            {stats.requests > 0 && (
              <p className="agent-activity-stats">
                Запросы: {stats.requests} · Токены: {stats.tokens.toLocaleString('ru-RU')}
                {stats.decisions > 0 && ` · Верификации: ${stats.decisions}`}
              </p>
            )}
          </details>
        )}

        <div ref={conversationEndRef} />
      </div>
    </div>
  );
};
