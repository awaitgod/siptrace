import React, { useState } from 'react';
import { GostAccuracyClass, PcbProject } from '../../../../../core/types';
import { GOST_ACCURACY_CLASS_PRESETS, createGostDesignRules } from '../../../../../gost/gostRules';
import { createDefaultPcbLayers } from '../../../../../engines/netlist';

export interface PcbRulesDialogProps {
  pcb: PcbProject;
  commitPcb: (updater: (prev: PcbProject) => PcbProject, pushUndo?: boolean) => void;
  onClose: () => void;
}

/** GOST 23751-86 / GOST R 53429 PCB design rules & accuracy class selector modal. */
export const PcbRulesDialog: React.FC<PcbRulesDialogProps> = ({ pcb, commitPcb, onClose }) => {
  const [rules, setRules] = useState(() => ({ ...pcb.designRules }));
  const [layerCount, setLayerCount] = useState<2 | 4>(pcb.layerCount);
  const [surfaceFinish, setSurfaceFinish] = useState(pcb.surfaceFinish);
  const [netClasses, setNetClasses] = useState<PcbProject['netClasses']>(() => pcb.netClasses.map((nc) => ({ ...nc })));

  const handleApply = () => {
    commitPcb((p) => ({
      ...p,
      designRules: rules,
      layerCount,
      layers: layerCount !== p.layerCount ? createDefaultPcbLayers(layerCount) : p.layers,
      surfaceFinish,
      netClasses
    }));
    onClose();
  };

  return (
    <div className="dt-modal-backdrop" onClick={onClose}>
      <div className="dt-modal" style={{ width: 580 }} onClick={(e) => e.stopPropagation()}>
        <div className="dt-modal-title">
          <span>Правила проектирования и классы точности (ГОСТ 23751-86 / ГОСТ Р 53429)</span>
          <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>×</button>
        </div>
        <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '72vh', overflowY: 'auto' }}>
          <div>Предустановки классов точности печатных плат ГОСТ 23751-86:</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {([1, 2, 3, 4, 5] as GostAccuracyClass[]).map((cls) => (
              <button
                key={cls}
                className={`dt-btn ${rules.gostAccuracyClass === cls ? 'primary' : ''}`}
                onClick={() => setRules(createGostDesignRules(cls))}
              >
                {cls} класс ({GOST_ACCURACY_CLASS_PRESETS[cls].minTraceWidth} мм)
              </button>
            ))}
          </div>
          <div style={{ padding: 6, background: '#fff', border: '1px solid #ccc' }}>
            <b>Класс точности {rules.gostAccuracyClass} по ГОСТ 23751-86 / ГОСТ Р 53429-2009</b>
            <div style={{ fontSize: 11, color: '#444' }}>
              Мин. дорожка {rules.minTraceWidth} мм, мин. зазор {rules.clearanceTraceToTrace} мм, переходы Ø{rules.minViaOuter}/{rules.minViaHole} мм
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label>
              Мин. ширина дорожки (мм):{' '}
              <input
                className="dt-input"
                type="number"
                step="0.05"
                value={rules.minTraceWidth}
                onChange={(e) => setRules((r) => ({ ...r, minTraceWidth: parseFloat(e.target.value) || 0.15 }))}
              />
            </label>
            <label>
              Мин. зазор (мм):{' '}
              <input
                className="dt-input"
                type="number"
                step="0.05"
                value={rules.clearanceTraceToTrace}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0.15;
                  setRules((r) => ({
                    ...r,
                    clearanceTraceToTrace: v,
                    clearanceTraceToPad: v,
                    clearancePadToPad: v,
                    clearanceViaToAny: v
                  }));
                }}
              />
            </label>
            <label>
              Мин. Ø перехода внешний (мм):{' '}
              <input
                className="dt-input"
                type="number"
                step="0.05"
                value={rules.minViaOuter}
                onChange={(e) => setRules((r) => ({ ...r, minViaOuter: parseFloat(e.target.value) || 0.5 }))}
              />
            </label>
            <label>
              Мин. Ø сверловки перехода (мм):{' '}
              <input
                className="dt-input"
                type="number"
                step="0.05"
                value={rules.minViaHole}
                onChange={(e) => setRules((r) => ({ ...r, minViaHole: parseFloat(e.target.value) || 0.25 }))}
              />
            </label>
            <label>
              Мин. гарантийный поясок (мм):{' '}
              <input
                className="dt-input"
                type="number"
                step="0.02"
                value={rules.minAnnularRing}
                onChange={(e) => setRules((r) => ({ ...r, minAnnularRing: parseFloat(e.target.value) || 0.1 }))}
              />
            </label>
            <label>
              Стек слоёв меди:
              <select
                className="dt-select"
                value={layerCount}
                onChange={(e) => setLayerCount((Number(e.target.value) === 4 ? 4 : 2))}
              >
                <option value={2}>2 слоя (Двусторонняя ПП)</option>
                <option value={4}>4 слоя (Многослойная МПП)</option>
              </select>
            </label>
            <label>
              Финишное покрытие:
              <select
                className="dt-select"
                value={surfaceFinish}
                onChange={(e) => setSurfaceFinish(e.target.value as any)}
              >
                <option value="HASL">ПОС-63 (HASL)</option>
                <option value="ENIG">Иммерсионное золото (ENIG)</option>
                <option value="ImmersionSilver">Иммерсионное серебро</option>
              </select>
            </label>
          </div>
          {netClasses.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Классы цепей (NetClasses):</div>
              <table className="dt-table">
                <thead>
                  <tr><th>Имя класса</th><th>Ширина, мм</th><th>Зазор, мм</th></tr>
                </thead>
                <tbody>
                  {netClasses.map((nc, idx) => (
                    <tr key={nc.id}>
                      <td>{nc.name}</td>
                      <td>
                        <input
                          type="number"
                          step="0.05"
                          className="dt-input"
                          style={{ width: 70 }}
                          value={nc.traceWidth}
                          onChange={(e) => {
                            const v = Math.max(0.1, parseFloat(e.target.value) || 0.25);
                            setNetClasses((prev) => prev.map((item, k) => (k === idx ? { ...item, traceWidth: v } : item)));
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.05"
                          className="dt-input"
                          style={{ width: 70 }}
                          value={nc.clearance}
                          onChange={(e) => {
                            const v = Math.max(0.1, parseFloat(e.target.value) || 0.2);
                            setNetClasses((prev) => prev.map((item, k) => (k === idx ? { ...item, clearance: v } : item)));
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="dt-modal-footer">
          <button className="dt-btn primary" onClick={handleApply}>Применить</button>
          <button className="dt-btn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
};
