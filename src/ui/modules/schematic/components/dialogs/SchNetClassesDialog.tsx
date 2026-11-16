import React from 'react';
import { NetClassDef } from '../../../../../core/types';

export interface SchNetClassesDialogProps {
  netClasses: NetClassDef[];
  onClose: () => void;
}

/** Modal displaying project Net Class rules (trace width, clearance, via dimensions). */
export const SchNetClassesDialog: React.FC<SchNetClassesDialogProps> = ({
  netClasses,
  onClose
}) => (
  <div className="dt-modal-backdrop">
    <div className="dt-modal" style={{ width: 520 }}>
      <div className="dt-modal-title">
        <span>Классы цепей (Net Classes)</span>
        <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>×</button>
      </div>
      <div className="dt-modal-body">
        <table className="dt-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Ширина, мм</th>
              <th>Зазор, мм</th>
              <th>Отверст. пер., мм</th>
            </tr>
          </thead>
          <tbody>
            {netClasses.map((nc) => (
              <tr key={nc.id}>
                <td>{nc.name}</td>
                <td>{nc.traceWidth}</td>
                <td>{nc.clearance}</td>
                <td>{nc.viaOuterDiameter}/{nc.viaHoleDiameter}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dt-modal-footer">
        <button className="dt-btn primary" onClick={onClose}>ОК</button>
      </div>
    </div>
  </div>
);
