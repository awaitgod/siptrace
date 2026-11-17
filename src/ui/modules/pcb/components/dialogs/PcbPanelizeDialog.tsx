import React, { useState } from 'react';
import { PcbProject } from '../../../../../core/types';
import { applyConfigurablePanelization } from '../../services/pcbActionsService';

export interface PcbPanelizeDialogProps {
  commitPcb: (updater: (prev: PcbProject) => PcbProject, pushUndo?: boolean) => void;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  onClose: () => void;
}

/** Modal to duplicate the current board into a configurable N×M scored production panel. */
export const PcbPanelizeDialog: React.FC<PcbPanelizeDialogProps> = ({ commitPcb, setStatusMessage, onClose }) => {
  const [cols, setCols] = useState('2');
  const [rows, setRows] = useState('2');
  const [gapMm, setGapMm] = useState('4');

  function handlePanelize(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const columns = Number(cols);
    const rowCount = Number(rows);
    if (columns === 1 && rowCount === 1) return;
    commitPcb((pcb) => applyConfigurablePanelization(pcb, columns, rowCount, Number(gapMm)));
    onClose();
    setStatusMessage(`Создана панель ${cols}×${rows}. Зазор: ${gapMm} мм.`);
  }

  return (
    <div className="dt-modal-backdrop" onClick={onClose}>
      <form className="dt-modal" style={{ width: 410 }} onSubmit={handlePanelize} onClick={(e) => e.stopPropagation()}>
        <div className="dt-modal-title">
          <span>Панелизация (Мультизаготовка ПП)</span>
          <button type="button" className="dt-btn" aria-label="Закрыть панелизацию" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>×</button>
        </div>
        <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11.5 }}>
          <p style={{ margin: 0 }}>Панель заменит текущую плату. Между копиями будут добавлены линии разделения.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <label>
              По X (шт):
              <input type="number" required min={1} max={10} className="dt-input" style={{ width: '100%' }} value={cols} onChange={(e) => setCols(e.target.value)} />
            </label>
            <label>
              По Y (шт):
              <input type="number" required min={1} max={10} className="dt-input" style={{ width: '100%' }} value={rows} onChange={(e) => setRows(e.target.value)} />
            </label>
            <label>
              Зазор (мм):
              <input type="number" required min={0} max={25} step="any" className="dt-input" style={{ width: '100%' }} value={gapMm} onChange={(e) => setGapMm(e.target.value)} />
            </label>
          </div>
        </div>
        <div className="dt-modal-footer">
          <button
            type="submit"
            className="dt-btn primary"
            disabled={Number(cols) === 1 && Number(rows) === 1}
          >
            Создать панель {cols}×{rows}
          </button>
          <button type="button" className="dt-btn" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </div>
  );
};
