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
  const [cols, setCols] = useState(2);
  const [rows, setRows] = useState(2);
  const [gapMm, setGapMm] = useState(4);

  return (
    <div className="dt-modal-backdrop" onClick={onClose}>
      <div className="dt-modal" style={{ width: 410 }} onClick={(e) => e.stopPropagation()}>
        <div className="dt-modal-title">
          <span>Панелизация (Мультизаготовка ПП)</span>
          <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>×</button>
        </div>
        <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11.5 }}>
          <p style={{ margin: 0 }}>Тиражирует текущую плату массивом M×N с технологическим шагом скрайбирования / фрезерования:</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <label>
              По X (шт):
              <input type="number" min={1} max={10} className="dt-input" style={{ width: '100%' }} value={cols} onChange={(e) => setCols(Math.max(1, parseInt(e.target.value, 10) || 1))} />
            </label>
            <label>
              По Y (шт):
              <input type="number" min={1} max={10} className="dt-input" style={{ width: '100%' }} value={rows} onChange={(e) => setRows(Math.max(1, parseInt(e.target.value, 10) || 1))} />
            </label>
            <label>
              Зазор (мм):
              <input type="number" min={0} max={25} step="0.5" className="dt-input" style={{ width: '100%' }} value={gapMm} onChange={(e) => setGapMm(Math.max(0, parseFloat(e.target.value) || 0))} />
            </label>
          </div>
        </div>
        <div className="dt-modal-footer">
          <button
            className="dt-btn primary"
            onClick={() => {
              commitPcb((p) => applyConfigurablePanelization(p, cols, rows, gapMm));
              onClose();
              setStatusMessage(`Выполнена панелизация платы ${cols}×${rows} (зазор ${gapMm} мм).`);
            }}
          >
            Создать панель {cols}×{rows}
          </button>
          <button className="dt-btn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
};
