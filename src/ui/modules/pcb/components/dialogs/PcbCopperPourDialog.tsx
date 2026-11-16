import React from 'react';
import { PcbCopperPour, PcbProject, Point2D } from '../../../../../core/types';
import { updateAllCopperPours } from '../../../../../engines/copperPour';
import { buildPcbCopperPour } from '../../services/pcbActionsService';
import { CopperLayerId, PcbToolId } from '../../types';

export interface PcbCopperPourDialogProps {
  pcb: PcbProject;
  netNames: string[];
  newPourLayer: CopperLayerId;
  setNewPourLayer: (l: CopperLayerId) => void;
  newPourNet: string;
  setNewPourNet: (n: string) => void;
  newPourFill: PcbCopperPour['fillType'];
  setNewPourFill: (f: PcbCopperPour['fillType']) => void;
  commitPcb: (updater: (prev: PcbProject) => PcbProject, pushUndo?: boolean) => void;
  setPolyDraftPts: React.Dispatch<React.SetStateAction<Point2D[]>>;
  setActiveLayer: React.Dispatch<React.SetStateAction<CopperLayerId>>;
  setTool: React.Dispatch<React.SetStateAction<PcbToolId>>;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  onClose: () => void;
}

/** Modal for configuring and creating solid/hatch copper pours with 4-spoke thermal reliefs. */
export const PcbCopperPourDialog: React.FC<PcbCopperPourDialogProps> = (p) => (
  <div className="dt-modal-backdrop">
    <div className="dt-modal" style={{ width: 420 }}>
      <div className="dt-modal-title">
        <span>Заливка медного полигона (Copper Pour)</span>
        <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={p.onClose}>×</button>
      </div>
      <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label>
          Слой заливки:
          <select className="dt-select" style={{ width: '100%' }} value={p.newPourLayer} onChange={(e) => p.setNewPourLayer(e.target.value as CopperLayerId)}>
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
          Цепь подключения (термобарьеры 4-спицы):
          <select className="dt-select" style={{ width: '100%' }} value={p.newPourNet} onChange={(e) => p.setNewPourNet(e.target.value)}>
            <option value="GND">GND</option>
            {p.netNames.filter((n) => n !== 'GND').map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>
          Тип заполнения:
          <select className="dt-select" style={{ width: '100%' }} value={p.newPourFill} onChange={(e) => p.setNewPourFill(e.target.value as any)}>
            <option value="Solid">Сплошная заливка (Solid)</option>
            <option value="Hatch">Сетчатая заливка (Hatch)</option>
          </select>
        </label>
      </div>
      <div className="dt-modal-footer">
        <button
          className="dt-btn primary"
          onClick={() => {
            const pour = buildPcbCopperPour({
              pcb: p.pcb,
              layer: p.newPourLayer,
              netName: p.newPourNet,
              outline: [...p.pcb.boardOutline],
              dependOnBoardOutline: true,
              fillType: p.newPourFill
            });
            p.commitPcb((prev) => updateAllCopperPours({ ...prev, copperPours: [...prev.copperPours, pour] }));
            p.onClose();
            p.setStatusMessage(`Полигон «${p.newPourNet}» на слое ${p.newPourLayer} залит по контуру платы.`);
          }}
        >
          Залить по контуру платы
        </button>
        <button
          className="dt-btn"
          onClick={() => {
            p.setPolyDraftPts([]);
            p.setActiveLayer(p.newPourLayer);
            p.setTool('copperPour');
            p.onClose();
            p.setStatusMessage('Укажите вершины контура полигона на плате (ПКМ — завершить и залить).');
          }}
        >
          Нарисовать вручную
        </button>
      </div>
    </div>
  </div>
);
