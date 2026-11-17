import { convertSchematicToPcb } from '../../../../../engines/netlist/schematicToPcbConverter';
import React from 'react';
import { PcbProject } from '../../../../../core/types';
import { broadcastEdaEvent, loadActiveSchematic, saveActiveSchematic } from '../../../../../core/store';
import { backAnnotateSchematic, comparePcbToSchematic } from '../../../../../engines/netlist';

export interface PcbCompareDialogProps {
  pcb: PcbProject;
  commitPcb: (updater: (prev: PcbProject) => PcbProject, pushUndo?: boolean) => void;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  onClose: () => void;
}

/** Modal comparing PCB against active schematic and executing forward-update or back-annotation. */
export const PcbCompareDialog: React.FC<PcbCompareDialogProps> = ({ pcb, commitPcb, setStatusMessage, onClose }) => {
  const sch = loadActiveSchematic();
  const rep = comparePcbToSchematic(sch, pcb);

  return (
    <div className="dt-modal-backdrop">
      <div className="dt-modal" style={{ width: 520 }}>
        <div className="dt-modal-title">
          <span>Синхронизация и сравнение со схемой</span>
          <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>×</button>
        </div>
        <div className="dt-modal-body">
          {rep.inSync ? (
            <div style={{ color: '#2b7a2b', padding: 8 }}>Плата полностью соответствует принципиальной схеме (компоненты и цепи совпадают).</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rep.addedOnSchematic.length > 0 && <div><b>Добавлены на схеме:</b> {rep.addedOnSchematic.join(', ')}</div>}
              {rep.removedFromSchematic.length > 0 && <div><b>Отсутствуют на схеме:</b> {rep.removedFromSchematic.join(', ')}</div>}
              {rep.changedNets.length > 0 && (
                <div>
                  <b>Отличия цепей:</b>
                  <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                    {rep.changedNets.slice(0, 12).map((c, idx) => <li key={idx}>{c}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="dt-modal-footer">
          <button
            className="dt-btn primary"
            onClick={() => {
              try {
                const activeSch = loadActiveSchematic();
                commitPcb((p) => convertSchematicToPcb(activeSch, p));
                onClose();
                setStatusMessage('Список цепей и компоненты обновлены со схемы.');
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                setStatusMessage(`Ошибка обновления со схемы: ${msg}`);
              }
            }}
          >
            Обновить плату по схеме
          </button>
          <button
            className="dt-btn"
            onClick={() => {
              const activeSch = loadActiveSchematic();
              const nextSch = backAnnotateSchematic(activeSch, pcb);
              saveActiveSchematic(nextSch);
              broadcastEdaEvent('pcb:backannotate', pcb);
              onClose();
              setStatusMessage('Выполнена обратная аннотация в схему.');
            }}
          >
            Обратная аннотация в схему
          </button>
          <button className="dt-btn" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
};
