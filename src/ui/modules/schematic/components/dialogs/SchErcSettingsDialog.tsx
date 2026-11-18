import React, { useState, useEffect } from 'react';
import {
  DEFAULT_PIN_MATRIX,
  ErcMatrixSeverity,
  ErcSettings,
  PIN_ELECTRICAL_TYPES,
  PinElectricalType
} from '../../../../../engines/erc';

export interface SchErcSettingsDialogProps {
  ercSettings: ErcSettings;
  setErcSettings: React.Dispatch<React.SetStateAction<ErcSettings>>;
  onRunNow: () => void;
  onClose: () => void;
}

const PIN_TYPE_LABELS: Record<PinElectricalType, string> = {
  Input: 'Вход (In)',
  Output: 'Выход (Out)',
  Bidirectional: 'Двунапр. (Bi)',
  TriState: 'Z-сост. (Tri)',
  Power: 'Питание (Pwr)',
  Passive: 'Пассивный (Pass)',
  NotConnected: 'Не подкл. (NC)'
};

/** Modal configuring schematic Electrical Rules Check toggles and Pin-to-Pin Matrix. */
export const SchErcSettingsDialog: React.FC<SchErcSettingsDialogProps> = ({
  ercSettings,
  setErcSettings,
  onRunNow,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'rules' | 'matrix'>('rules');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const matrix = ercSettings.pinMatrix ?? DEFAULT_PIN_MATRIX;

  const cycleMatrixCell = (t1: PinElectricalType, t2: PinElectricalType) => {
    const cur = (matrix[t1] && matrix[t1][t2]) ?? (matrix[t2] && matrix[t2][t1]) ?? 'None';
    const next: ErcMatrixSeverity = cur === 'None' ? 'Warning' : cur === 'Warning' ? 'Error' : 'None';

    setErcSettings((prev) => {
      const prevMatrix = prev.pinMatrix ?? DEFAULT_PIN_MATRIX;
      const nextMatrix = { ...prevMatrix };
      nextMatrix[t1] = { ...(nextMatrix[t1] ?? {}), [t2]: next };
      nextMatrix[t2] = { ...(nextMatrix[t2] ?? {}), [t1]: next };
      return { ...prev, pinMatrix: nextMatrix };
    });
  };

  const handleResetMatrix = () => {
    setErcSettings((prev) => ({ ...prev, pinMatrix: { ...DEFAULT_PIN_MATRIX } }));
  };

  return (
    <div className="dt-modal-backdrop">
      <div className="dt-modal" role="dialog" aria-modal="true" style={{ width: activeTab === 'matrix' ? 680 : 460 }}>
        <div className="dt-modal-title">
          <span>Параметры проверки электрических правил (ERC)</span>
          <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>×</button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 4, padding: '4px 8px', borderBottom: '1px solid #ddd', background: '#fafafa' }}>
          <button
            className={`dt-btn ${activeTab === 'rules' ? 'primary' : ''}`}
            style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => setActiveTab('rules')}
          >
            Основные правила
          </button>
          <button
            className={`dt-btn ${activeTab === 'matrix' ? 'primary' : ''}`}
            style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => setActiveTab('matrix')}
          >
            Матрица типов выводов
          </button>
        </div>

        <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
          {activeTab === 'rules' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12 }}>
              <label><input type="checkbox" checked={ercSettings.checkUnconnectedPins} onChange={(e) => setErcSettings((p) => ({ ...p, checkUnconnectedPins: e.target.checked }))} /> Проверять неподключённые выводы (висячие цепи)</label>
              <label><input type="checkbox" checked={ercSettings.checkOutputConflicts} onChange={(e) => setErcSettings((p) => ({ ...p, checkOutputConflicts: e.target.checked }))} /> Проверять конфликты выходов (Output–Output)</label>
              <label><input type="checkbox" checked={ercSettings.checkSinglePinNets} onChange={(e) => setErcSettings((p) => ({ ...p, checkSinglePinNets: e.target.checked }))} /> Предупреждать о цепях с 1 подключением</label>
              <label><input type="checkbox" checked={ercSettings.checkDuplicateRefDes} onChange={(e) => setErcSettings((p) => ({ ...p, checkDuplicateRefDes: e.target.checked }))} /> Проверять дубликаты позиционных обозначений</label>
              <label><input type="checkbox" checked={ercSettings.checkMissingPattern} onChange={(e) => setErcSettings((p) => ({ ...p, checkMissingPattern: e.target.checked }))} /> Проверять наличие привязанных корпусов</label>
              <label><input type="checkbox" checked={ercSettings.checkFloatingInputs} onChange={(e) => setErcSettings((p) => ({ ...p, checkFloatingInputs: e.target.checked }))} /> Предупреждать о неподключённых входах</label>
              <label><input type="checkbox" checked={ercSettings.checkPinMatrix !== false} onChange={(e) => setErcSettings((p) => ({ ...p, checkPinMatrix: e.target.checked }))} /> Контроль соединений по матрице типов выводов</label>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, color: '#555', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Нажмите на ячейку для переключения: OK (серый) → Предупреждение (жёлтый W) → Ошибка (красный E).</span>
                <button className="dt-btn" style={{ fontSize: 10, padding: '1px 6px' }} onClick={handleResetMatrix}>Сбросить</button>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid #ccc', background: '#fff' }}>
                <table className="dt-table" style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 100, textAlign: 'left', padding: '4px 6px' }}>Вывод / Вывод</th>
                      {PIN_ELECTRICAL_TYPES.map((t) => (
                        <th key={t} style={{ textAlign: 'center', padding: '4px 2px', width: 44, fontSize: 9 }}>
                          {t.slice(0, 4)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PIN_ELECTRICAL_TYPES.map((t1) => (
                      <tr key={t1}>
                        <td style={{ fontWeight: 600, padding: '3px 6px', whiteSpace: 'nowrap' }}>
                          {PIN_TYPE_LABELS[t1]}
                        </td>
                        {PIN_ELECTRICAL_TYPES.map((t2) => {
                          const rule = (matrix[t1] && matrix[t1][t2]) ?? (matrix[t2] && matrix[t2][t1]) ?? 'None';
                          const bg = rule === 'Error' ? '#ff4d4f' : rule === 'Warning' ? '#faad14' : '#f0f0f0';
                          const color = rule === 'None' ? '#888' : '#fff';
                          const text = rule === 'Error' ? 'E' : rule === 'Warning' ? 'W' : '—';
                          return (
                            <td
                              key={t2}
                              onClick={() => cycleMatrixCell(t1, t2)}
                              title={`${t1} ↔ ${t2}: ${rule === 'Error' ? 'Ошибка' : rule === 'Warning' ? 'Предупреждение' : 'Разрешено'}`}
                              style={{
                                textAlign: 'center',
                                padding: 2,
                                cursor: 'pointer',
                                background: bg,
                                color,
                                fontWeight: 'bold',
                                border: '1px solid #ddd'
                              }}
                            >
                              {text}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="dt-modal-footer">
          <button className="dt-btn primary" onClick={() => { onClose(); onRunNow(); }}>Проверить сейчас</button>
          <button className="dt-btn" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
};
