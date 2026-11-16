import React from 'react';
import { ErcSettings } from '../../../../../engines/erc';

export interface SchErcSettingsDialogProps {
  ercSettings: ErcSettings;
  setErcSettings: React.Dispatch<React.SetStateAction<ErcSettings>>;
  onRunNow: () => void;
  onClose: () => void;
}

/** Modal configuring schematic Electrical Rules Check toggles. */
export const SchErcSettingsDialog: React.FC<SchErcSettingsDialogProps> = ({
  ercSettings,
  setErcSettings,
  onRunNow,
  onClose
}) => (
  <div className="dt-modal-backdrop">
    <div className="dt-modal" style={{ width: 420 }}>
      <div className="dt-modal-title">
        <span>Параметры проверки электрических правил (ERC)</span>
        <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>×</button>
      </div>
      <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label><input type="checkbox" checked={ercSettings.checkUnconnectedPins} onChange={(e) => setErcSettings((p) => ({ ...p, checkUnconnectedPins: e.target.checked }))} /> Проверять неподключённые выводы (висячие цепи)</label>
        <label><input type="checkbox" checked={ercSettings.checkOutputConflicts} onChange={(e) => setErcSettings((p) => ({ ...p, checkOutputConflicts: e.target.checked }))} /> Проверять конфликты выходов (Output–Output)</label>
        <label><input type="checkbox" checked={ercSettings.checkSinglePinNets} onChange={(e) => setErcSettings((p) => ({ ...p, checkSinglePinNets: e.target.checked }))} /> Предупреждать о цепях с 1 подключением</label>
        <label><input type="checkbox" checked={ercSettings.checkDuplicateRefDes} onChange={(e) => setErcSettings((p) => ({ ...p, checkDuplicateRefDes: e.target.checked }))} /> Проверять дубликаты позиционных обозначений</label>
        <label><input type="checkbox" checked={ercSettings.checkMissingPattern} onChange={(e) => setErcSettings((p) => ({ ...p, checkMissingPattern: e.target.checked }))} /> Проверять наличие привязанных корпусов</label>
        <label><input type="checkbox" checked={ercSettings.checkFloatingInputs} onChange={(e) => setErcSettings((p) => ({ ...p, checkFloatingInputs: e.target.checked }))} /> Предупреждать о неподключённых входах</label>
      </div>
      <div className="dt-modal-footer">
        <button className="dt-btn primary" onClick={() => { onClose(); onRunNow(); }}>Проверить сейчас</button>
        <button className="dt-btn" onClick={onClose}>Закрыть</button>
      </div>
    </div>
  </div>
);
