import React from 'react';
import { GostAccuracyClass, PcbProject } from '../../../../../core/types';
import { GOST_ACCURACY_CLASS_PRESETS, createGostDesignRules } from '../../../../../gost/gostRules';
import { createDefaultPcbLayers } from '../../../../../engines/netlist';

export interface PcbRulesDialogProps {
  pcb: PcbProject;
  commitPcb: (updater: (prev: PcbProject) => PcbProject, pushUndo?: boolean) => void;
  onClose: () => void;
}

/** GOST 23751-86 / GOST R 53429 PCB design rules & accuracy class selector modal. */
export const PcbRulesDialog: React.FC<PcbRulesDialogProps> = ({ pcb, commitPcb, onClose }) => (
  <div className="dt-modal-backdrop" onClick={onClose}>
    <div className="dt-modal" style={{ width: 540 }} onClick={(e) => e.stopPropagation()}>
      <div className="dt-modal-title">
        <span>Правила проектирования и классы точности (ГОСТ 23751-86 / ГОСТ Р 53429)</span>
        <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>×</button>
      </div>
      <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>Предустановки классов точности печатных плат ГОСТ 23751-86:</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {([1, 2, 3, 4, 5] as GostAccuracyClass[]).map((cls) => (
            <button
              key={cls}
              className={`dt-btn ${pcb.designRules.gostAccuracyClass === cls ? 'primary' : ''}`}
              onClick={() => commitPcb((p) => ({ ...p, designRules: createGostDesignRules(cls) }))}
            >
              {cls} класс ({GOST_ACCURACY_CLASS_PRESETS[cls].minTraceWidth} мм)
            </button>
          ))}
        </div>
        <div style={{ padding: 6, background: '#fff', border: '1px solid #ccc' }}>
          <b>Класс точности {pcb.designRules.gostAccuracyClass} по ГОСТ 23751-86 / ГОСТ Р 53429-2009</b>
          <div style={{ fontSize: 11, color: '#444' }}>
            Мин. дорожка {pcb.designRules.minTraceWidth} мм, мин. зазор {pcb.designRules.clearanceTraceToTrace} мм, переходы Ø{pcb.designRules.minViaOuter}/{pcb.designRules.minViaHole} мм
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label>
            Мин. ширина дорожки (мм):{' '}
            <input
              className="dt-input"
              type="number"
              step="0.05"
              value={pcb.designRules.minTraceWidth}
              onChange={(e) => commitPcb((p) => ({ ...p, designRules: { ...p.designRules, minTraceWidth: parseFloat(e.target.value) || 0.15 } }))}
            />
          </label>
          <label>
            Мин. зазор (мм):{' '}
            <input
              className="dt-input"
              type="number"
              step="0.05"
              value={pcb.designRules.clearanceTraceToTrace}
              onChange={(e) => {
                const v = parseFloat(e.target.value) || 0.15;
                commitPcb((p) => ({
                  ...p,
                  designRules: { ...p.designRules, clearanceTraceToTrace: v, clearanceTraceToPad: v, clearancePadToPad: v, clearanceViaToAny: v }
                }));
              }}
            />
          </label>
          <label>
            Стек слоёв меди:
            <select
              className="dt-select"
              value={pcb.layerCount}
              onChange={(e) => {
                const lc = Number(e.target.value) as 2 | 4;
                commitPcb((p) => ({ ...p, layerCount: lc, layers: createDefaultPcbLayers(lc) }));
              }}
            >
              <option value={2}>2 слоя (Двусторонняя ПП)</option>
              <option value={4}>4 слоя (Многослойная МПП)</option>
            </select>
          </label>
          <label>
            Финишное покрытие:
            <select
              className="dt-select"
              value={pcb.surfaceFinish}
              onChange={(e) => commitPcb((p) => ({ ...p, surfaceFinish: e.target.value as any }))}
            >
              <option value="HASL">ПОС-63 (HASL)</option>
              <option value="ENIG">Иммерсионное золото (ENIG)</option>
              <option value="ImmersionSilver">Иммерсионное серебро</option>
            </select>
          </label>
        </div>
      </div>
      <div className="dt-modal-footer">
        <button className="dt-btn primary" onClick={onClose}>Применить</button>
      </div>
    </div>
  </div>
);
