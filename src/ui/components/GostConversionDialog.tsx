import React, { useEffect } from 'react';
import { GostConversionReport } from '../../engines/importers';

interface GostConversionDialogProps {
  report: GostConversionReport;
  onClose: () => void;
}

/** Modal displaying details of automatic foreign CAD -> GOST/ESKD conversion after file import. */
export const GostConversionDialog: React.FC<GostConversionDialogProps> = ({ report, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dt-modal-backdrop" onClick={onClose}>
      <div
        className="dt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gost-conversion-dialog-title"
        style={{ width: 680, maxWidth: '94vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dt-modal-title">
          <strong id="gost-conversion-dialog-title">Отчёт автоконвертации в российские ГОСТ / ЕСКД</strong>
          <button
            type="button"
            className="dt-btn"
            aria-label="Закрыть"
            style={{ minWidth: 24, padding: '0 6px' }}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="dt-message-info" style={{ padding: '6px 8px', fontSize: 11.5 }}>
            <b>Исходный САПР:</b> {report.sourceFormat} · <b>Компонентов:</b> {report.convertedComponents} ·{' '}
            <b>Переведено в УГО ГОСТ:</b> {report.convertedSymbolsToUgo} · <b>Корпусов приведено:</b>{' '}
            {report.convertedPatterns}
          </div>

          {report.warnings && report.warnings.length > 0 && (
            <div role="alert" className="dt-message-warning" style={{ padding: '8px', fontSize: 12 }}>
              <b>Данные импортированы не полностью</b>
              <ul>{report.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
            </div>
          )}

          {report.items.length > 0 ? (
            <div
              style={{
                maxHeight: 300,
                overflowY: 'auto',
                border: '1px solid var(--ui-border, #b5b5b5)',
                background: 'var(--ui-surface, #fff)'
              }}
            >
              <table className="dt-table">
                <thead>
                  <tr>
                    <th>Исх. поз. обозн.</th>
                    <th>ГОСТ 2.710-81</th>
                    <th>Исх. номинал</th>
                    <th>Номинал ГОСТ</th>
                    <th>Корпус / Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {report.items.map((it, i) => (
                    <tr key={`${it.gostRef}_${i}`}>
                      <td>{it.originalRef}</td>
                      <td>
                        <b>{it.gostRef}</b>
                      </td>
                      <td>{it.originalValue || '—'}</td>
                      <td>{it.gostValue || '—'}</td>
                      <td>{it.gostPattern || it.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              style={{
                padding: 10,
                fontSize: 11.5,
                background: 'var(--ui-surface, #fff)',
                border: '1px solid var(--ui-border, #c0c0c0)'
              }}
            >
              Нет данных о преобразованных компонентах.
            </div>
          )}
        </div>

        <div className="dt-modal-footer">
          <button type="button" className="dt-btn primary" onClick={onClose}>
            Принять результат ГОСТ
          </button>
        </div>
      </div>
    </div>
  );
};
