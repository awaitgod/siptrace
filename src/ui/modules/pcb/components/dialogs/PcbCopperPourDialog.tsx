import React, { useState } from 'react';
import { PcbCopperPour, PcbProject } from '../../../../../core/types';
import { updateAllCopperPours } from '../../../../../engines/copperPour';
import { buildPcbCopperPour, PcbCopperPourSettings } from '../../services/pcbActionsService';
import { CopperLayerId } from '../../types';

export interface PcbCopperPourDialogProps {
  pcb: PcbProject;
  netNames: string[];
  initialLayer: CopperLayerId;
  onDraw: (settings: PcbCopperPourSettings) => void;
  commitPcb: (updater: (prev: PcbProject) => PcbProject, pushUndo?: boolean) => void;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  onClose: () => void;
}

/** Modal for configuring, listing, deleting, and creating solid/hatch copper pours with thermal reliefs. */
export const PcbCopperPourDialog: React.FC<PcbCopperPourDialogProps> = (p) => {
  const [layer, setLayer] = useState(p.initialLayer);
  const [netName, setNetName] = useState('GND');
  const [fillType, setFillType] = useState<PcbCopperPour['fillType']>('Solid');
  const [clearance, setClearance] = useState(p.pcb.designRules.clearanceTraceToTrace || 0.3);
  const [thermalType, setThermalType] = useState<PcbCopperPour['thermalType']>('4Spoke');
  const [thermalGap, setThermalGap] = useState(0.35);
  const [thermalSpokeWidth, setThermalSpokeWidth] = useState(0.4);
  const [removeIslands, setRemoveIslands] = useState(true);
  const settings: PcbCopperPourSettings = { layer, netName, fillType, clearance, thermalType, thermalGap, thermalSpokeWidth, removeIslands };

  return (
    <div className="dt-modal-backdrop" onClick={p.onClose}>
      <div className="dt-modal" style={{ width: 470 }} onClick={(e) => e.stopPropagation()}>
        <div className="dt-modal-title">
          <span>Заливка медного полигона (Copper Pour)</span>
          <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={p.onClose}>×</button>
        </div>
        <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '72vh', overflowY: 'auto' }}>
          <label>
            Слой заливки:
            <select className="dt-select" style={{ width: '100%' }} value={layer} onChange={(e) => setLayer(e.target.value as CopperLayerId)}>
              <option value="BottomCopper">Нижний слой (Bottom)</option>
              <option value="TopCopper">Верхний слой (Top)</option>
              {p.pcb.layerCount === 4 && (
                <>
                  <option value="Inner1">Внутренний слой 1 (Inner1 / GND)</option>
                  <option value="Inner2">Внутренний слой 2 (Inner2 / PWR)</option>
                </>
              )}
            </select>
          </label>
          <label>
            Цепь подключения:
            <select className="dt-select" style={{ width: '100%' }} value={netName} onChange={(e) => setNetName(e.target.value)}>
              <option value="GND">GND</option>
              {p.netNames.filter((n) => n !== 'GND').map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label>
              Тип заполнения:
              <select className="dt-select" style={{ width: '100%' }} value={fillType} onChange={(e) => setFillType(e.target.value as PcbCopperPour['fillType'])}>
                <option value="Solid">Сплошная заливка (Solid)</option>
                <option value="Hatch">Сетчатая заливка (Hatch)</option>
              </select>
            </label>
            <label>
              Термобарьеры:
              <select className="dt-select" style={{ width: '100%' }} value={thermalType} onChange={(e) => setThermalType(e.target.value as PcbCopperPour['thermalType'])}>
                <option value="4Spoke">4 спицы (4-Spoke)</option>
                <option value="2Spoke">2 спицы (2-Spoke)</option>
                <option value="Direct">Сплошной (Direct)</option>
                <option value="None">Без подключения</option>
              </select>
            </label>
            <label>
              Зазор до меди (мм):
              <input type="number" step="0.05" min="0.1" className="dt-input" style={{ width: '100%' }} value={clearance} onChange={(e) => setClearance(Math.max(0.1, parseFloat(e.target.value) || 0.3))} />
            </label>
            <label>
              Ширина спиц / зазор ТБ (мм):
              <div style={{ display: 'flex', gap: 4 }}>
                <input type="number" step="0.05" min="0.15" aria-label="Ширина спицы" className="dt-input" style={{ width: '50%' }} value={thermalSpokeWidth} onChange={(e) => setThermalSpokeWidth(Math.max(0.15, parseFloat(e.target.value) || 0.4))} />
                <input type="number" step="0.05" min="0.15" aria-label="Зазор термобарьера" className="dt-input" style={{ width: '50%' }} value={thermalGap} onChange={(e) => setThermalGap(Math.max(0.15, parseFloat(e.target.value) || 0.35))} />
              </div>
            </label>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={removeIslands} onChange={(e) => setRemoveIslands(e.target.checked)} />
            Удалять изолированные медные островки
          </label>

          {p.pcb.copperPours.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Полигоны на плате ({p.pcb.copperPours.length}):</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {p.pcb.copperPours.map((cp) => (
                  <div key={cp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', background: '#fff', border: '1px solid #d0d0d0', fontSize: 11 }}>
                    <span><b>{cp.netName}</b> ({cp.layer}, {cp.poured ? `${cp.computedIslands?.length ?? 0} остр.` : 'не залит'})</span>
                    <button
                      type="button"
                      className="dt-btn"
                      onClick={() => p.commitPcb((prev) => updateAllCopperPours({ ...prev, copperPours: prev.copperPours.filter((item) => item.id !== cp.id) }))}
                    >
                      Удалить
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="dt-modal-footer">
          <button
            className="dt-btn primary"
            disabled={p.pcb.boardOutline.length < 3}
            onClick={() => {
              const pour = buildPcbCopperPour({
                pcb: p.pcb,
                outline: [...p.pcb.boardOutline],
                dependOnBoardOutline: true,
                settings
              });
              p.commitPcb((prev) => updateAllCopperPours({ ...prev, copperPours: [...prev.copperPours, pour] }));
              p.onClose();
              p.setStatusMessage(`Полигон «${netName}» добавлен на слой ${layer} по контуру платы.`);
            }}
          >
            Залить по контуру платы
          </button>
          <button
            className="dt-btn"
            onClick={() => p.onDraw(settings)}
          >
            Нарисовать вручную
          </button>
          <button className="dt-btn" onClick={p.onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
};
