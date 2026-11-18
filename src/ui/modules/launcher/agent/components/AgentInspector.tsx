import React from 'react';
import {
  IconFile,
  IconArrowsMaximize,
  IconDownload,
  IconCheck,
  IconAlertTriangle,
  IconEdit
} from '@tabler/icons-react';
import type { ColorSchemeId } from '../../../../../core/models';
import type { AgentDraft, AgentCapture } from '../workspace';
import { LauncherDocumentPreview } from '../../components/LauncherDocumentPreview';
import type { AgentDocumentItem } from '../AgentLiveDocument';
import type { AppModuleId } from '../../../../../core/types';

interface Props {
  open: boolean;
  inspectorTab: 'documents' | 'checks';
  setInspectorTab: (tab: 'documents' | 'checks') => void;
  documents: AgentDocumentItem[];
  current?: AgentDocumentItem;
  currentCapture?: AgentCapture;
  previewDocuments: AgentDraft['documents'];
  theme: ColorSchemeId;
  draft: AgentDraft;
  busy: boolean;
  onSelectDocument: (id: string) => void;
  onOpenLiveDocument: (trigger?: HTMLElement) => void;
  onSaveProject: () => void;
  onDownload: (target: 'schematic' | 'pcb') => void;
  onSwitchModule?: (moduleId: AppModuleId) => void;
}

export const AgentInspector: React.FC<Props> = ({
  open,
  inspectorTab,
  setInspectorTab,
  documents,
  current,
  currentCapture,
  previewDocuments,
  theme,
  draft,
  busy,
  onSelectDocument,
  onOpenLiveDocument,
  onSaveProject,
  onDownload,
  onSwitchModule
}) => {
  const checks = draft.checks;
  const isPcb = current?.kind === 'pcb';
  const reportTitle =
    draft.report?.status === 'draft'
      ? 'Отчёт агента · незавершённый черновик'
      : 'Отчёт агента';

  return (
    <aside className="dt-right-sidebar agent-inspector" inert={!open} aria-label="Документы и проверки">
      <div className="agent-inspector-tabs" role="tablist" aria-label="Панель результатов">
        <button
          id="agent-tab-docs"
          className={`dt-tab-btn ${inspectorTab === 'documents' ? 'active' : ''}`}
          role="tab"
          tabIndex={inspectorTab === 'documents' ? 0 : -1}
          aria-selected={inspectorTab === 'documents'}
          aria-controls="agent-tabpanel-docs"
          onClick={() => setInspectorTab('documents')}
          onKeyDown={e => {
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              setInspectorTab('checks');
              document.getElementById('agent-tab-checks')?.focus();
            }
          }}
        >
          <span>Документы</span>
          {documents.length > 0 && <span className="tab-count">{documents.length}</span>}
        </button>

        <button
          id="agent-tab-checks"
          className={`dt-tab-btn ${inspectorTab === 'checks' ? 'active' : ''}`}
          role="tab"
          tabIndex={inspectorTab === 'checks' ? 0 : -1}
          aria-selected={inspectorTab === 'checks'}
          aria-controls="agent-tabpanel-checks"
          onClick={() => setInspectorTab('checks')}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              setInspectorTab('documents');
              document.getElementById('agent-tab-docs')?.focus();
            }
          }}
        >
          <span>Проверки</span>
        </button>
      </div>

      <div
        key={inspectorTab}
        id={inspectorTab === 'documents' ? 'agent-tabpanel-docs' : 'agent-tabpanel-checks'}
        className="agent-inspector-body"
        role="tabpanel"
        aria-labelledby={inspectorTab === 'documents' ? 'agent-tab-docs' : 'agent-tab-checks'}
      >
        {inspectorTab === 'documents' ? (
          <>
            {documents.length ? (
              <>
                <div className="agent-document-list">
                  {documents.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={current?.id === item.id}
                      onClick={() => onSelectDocument(item.id)}
                    >
                      <IconFile size={15} aria-hidden="true" />
                      <span>{item.label}</span>
                      <small>{item.kind === 'pcb' ? 'PCB' : 'Схема'}</small>
                    </button>
                  ))}
                </div>

                <div
                  key={current?.id}
                  className="agent-preview agent-preview-interactive"
                  role="button"
                  tabIndex={0}
                  title="Нажмите для открытия интерактивного полноэкранного просмотра"
                  aria-label="Открыть интерактивный просмотр"
                  onClick={e => onOpenLiveDocument(e.currentTarget)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenLiveDocument(e.currentTarget);
                    }
                  }}
                >
                  {currentCapture ? (
                    <img src={currentCapture.url} alt={`Снимок · ${currentCapture.label}`} />
                  ) : (
                    <LauncherDocumentPreview
                      documents={previewDocuments}
                      board={isPcb}
                      theme={theme}
                    />
                  )}
                  <div className="agent-preview-overlay">
                    <IconArrowsMaximize size={20} aria-hidden="true" />
                  </div>
                </div>

                <div className="agent-artifact-actions">
                  {onSwitchModule && (
                    <button
                      type="button"
                      className="dt-btn primary"
                      onClick={() => onSwitchModule(isPcb ? 'pcb' : 'schematic')}
                      title={`Перейти в редактор для редактирования ${isPcb ? 'платы' : 'схемы'}`}
                    >
                      <IconEdit size={15} aria-hidden="true" />
                      <span>В редактор</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="dt-btn"
                    onClick={e => onOpenLiveDocument(e.currentTarget)}
                    title="Просмотр чертежа с масштабированием и панорамированием"
                  >
                    <IconArrowsMaximize size={15} aria-hidden="true" />
                    <span>Открыть {isPcb ? 'плату' : 'схему'}</span>
                  </button>

                  <button
                    type="button"
                    className="dt-btn"
                    disabled={busy}
                    onClick={onSaveProject}
                    title="Сохранить копию проекта в списке недавних проектов"
                  >
                    <span>Сохранить копию в проектах</span>
                  </button>

                  <button
                    type="button"
                    className="dt-btn"
                    disabled={busy}
                    onClick={() => onDownload(isPcb ? 'pcb' : 'schematic')}
                    title={`Экспорт в файл .${isPcb ? 'gostpcb' : 'gostsch'}`}
                  >
                    <IconDownload size={15} aria-hidden="true" />
                    <span>Выгрузить {isPcb ? 'плату' : 'схему'}</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="agent-inspector-empty">
                <IconFile size={32} stroke={1.3} aria-hidden="true" />
                <p>Нет документов</p>
              </div>
            )}

            {draft.plan && (
              <details className="agent-plan">
                <summary tabIndex={0}>План и память</summary>
                <p>{draft.plan}</p>
              </details>
            )}
          </>
        ) : (
          <>
            {draft.report && <h2>{reportTitle}</h2>}
            {checks ? (
              <>
                <div className="agent-check-grid" role="group" aria-label="Сводка проверок САПР">
                  <div
                    className="agent-check-card"
                    data-status={checks.erc === 0 ? 'pass' : 'fail'}
                    title="Electrical Rule Check по ГОСТ 2.702"
                  >
                    <span className="check-title">ERC</span>
                    <strong>{checks.erc}</strong>
                  </div>

                  <div
                    className="agent-check-card"
                    data-status={checks.drc === 0 ? 'pass' : 'fail'}
                    title="Design Rule Check по нормам IPC-2221"
                  >
                    <span className="check-title">DRC</span>
                    <strong>{checks.drc}</strong>
                  </div>

                  <div
                    className="agent-check-card"
                    data-status={checks.outsideFrame === 0 ? 'pass' : 'fail'}
                    title="Проверка расположения элементов в рабочем поле ГОСТ 2.104"
                  >
                    <span className="check-title">Вне рамки</span>
                    <strong>{checks.outsideFrame}</strong>
                  </div>

                  <div
                    className="agent-check-card"
                    data-status={checks.unrouted === 0 ? 'pass' : 'warning'}
                    title="Количество неразведенных связей схемы на плате"
                  >
                    <span className="check-title">Неразведённые связи</span>
                    <strong>{checks.unrouted ?? '—'}</strong>
                  </div>
                </div>

                {checks.inSync !== undefined && (
                  <div className="agent-sync" data-sync={checks.inSync}>
                    {checks.inSync ? (
                      <span className="sync-pass">
                        <IconCheck size={14} aria-hidden="true" />
                        <span>Схема и плата синхронизированы</span>
                      </span>
                    ) : (
                      <span className="sync-warn">
                        <IconAlertTriangle size={14} aria-hidden="true" />
                        <span>Обновите связи между схемой и платой</span>
                      </span>
                    )}
                  </div>
                )}

                {checks.requirements?.map((row, index) => (
                  <div className="agent-requirement" key={index} data-pass={row.pass}>
                    {row.pass ? (
                      <IconCheck size={15} aria-hidden="true" />
                    ) : (
                      <IconAlertTriangle className="dt-error-message" size={15} aria-hidden="true" />
                    )}
                    <span>
                      {row.requirement}
                      {!row.pass && (
                        <small>
                          Ожидалось: {JSON.stringify(row.expected)}, получено: {JSON.stringify(row.actual)}
                        </small>
                      )}
                    </span>
                  </div>
                ))}

                {checks.blockers?.map((issue, index) => (
                  <p className="dt-error-message agent-check-issue" key={index}>
                    {issue}
                  </p>
                ))}
              </>
            ) : (
              <div className="agent-inspector-empty">
                <IconCheck size={28} stroke={1.3} aria-hidden="true" />
                <p>Нет результатов проверок</p>
              </div>
            )}

            {draft.report && (
              <div className="agent-check-report">
                <p>{draft.report.summary}</p>
                {draft.report.limitations && <p>{draft.report.limitations}</p>}
              </div>
            )}
          </>
        )}
      </div>

    </aside>
  );
};
