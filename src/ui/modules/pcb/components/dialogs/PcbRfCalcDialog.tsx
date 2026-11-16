import React, { useEffect, useMemo, useState } from 'react';
import { calcMicrostripImpedance, calcTraceWidthByCurrent } from '../../../../../engines/rfCalc';

export interface PcbRfCalcDialogProps {
  onClose: () => void;
}

/** IPC-2221 / GOST trace current capacity and microstrip impedance calculator modal. */
export const PcbRfCalcDialog: React.FC<PcbRfCalcDialogProps> = ({ onClose }) => {
  const [rfCurrent, setRfCurrent] = useState(1.5);
  const [rfTempRise, setRfTempRise] = useState(10);
  const [rfCopperUm, setRfCopperUm] = useState(35);
  const [rfExternalLayer, setRfExternalLayer] = useState(true);
  const [rfTraceW, setRfTraceW] = useState(0.25);
  const [rfDielH, setRfDielH] = useState(0.2);
  const [rfEr, setRfEr] = useState(4.4);
  const [rfDiffGap, setRfDiffGap] = useState(0.2);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rfWidthRes = useMemo(
    () => calcTraceWidthByCurrent({ currentAmps: rfCurrent, tempRiseC: rfTempRise, copperThicknessUm: rfCopperUm, isExternalLayer: rfExternalLayer }),
    [rfCurrent, rfTempRise, rfCopperUm, rfExternalLayer]
  );
  const rfImpedanceRes = useMemo(
    () => calcMicrostripImpedance({ traceWidthMm: rfTraceW, copperThicknessMm: rfCopperUm / 1000, dielectricHeightMm: rfDielH, er: rfEr, diffGapMm: rfDiffGap }),
    [rfTraceW, rfCopperUm, rfDielH, rfEr, rfDiffGap]
  );

  return (
    <div className="dt-modal-backdrop" onClick={onClose}>
      <div className="dt-modal" style={{ width: 490 }} onClick={(e) => e.stopPropagation()}>
        <div className="dt-modal-title">
          <span>Калькулятор трассировщика (Ток ГОСТ/IPC-2221 и Импеданс)</span>
          <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>×</button>
        </div>
        <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 6 }}>
            <label>Ток нагрузки, А: <input className="dt-input" type="number" min="0.05" step="0.1" value={rfCurrent} onChange={(e) => setRfCurrent(Math.max(0.05, parseFloat(e.target.value) || 0.1))} /></label>
            <label>Нагрев ΔT, °C: <input className="dt-input" type="number" min="1" step="5" value={rfTempRise} onChange={(e) => setRfTempRise(Math.max(1, parseFloat(e.target.value) || 10))} /></label>
            <label>Толщина фольги, мкм:
              <select className="dt-select" value={rfCopperUm} onChange={(e) => setRfCopperUm(Number(e.target.value))}>
                <option value={18}>18 мкм</option>
                <option value={35}>35 мкм</option>
                <option value={70}>70 мкм</option>
                <option value={105}>105 мкм</option>
              </select>
            </label>
            <label>Слой проводника:
              <select className="dt-select" value={rfExternalLayer ? 'ext' : 'int'} onChange={(e) => setRfExternalLayer(e.target.value === 'ext')}>
                <option value="ext">Внешний (Top / Bottom)</option>
                <option value="int">Внутренний (Inner)</option>
              </select>
            </label>
          </div>
          <div style={{ background: '#fff', border: '1px solid #ccc', padding: '5px 8px' }}>
            <b>Мин. ширина: {rfWidthRes.requiredWidthMm} мм</b> &nbsp;|&nbsp; Сечение: {rfWidthRes.crossSectionMm2} мм² &nbsp;|&nbsp; R: {rfWidthRes.resistanceOhmPer100mm} Ом/100мм &nbsp;|&nbsp; ΔU: {rfWidthRes.voltageDropMvPer100mm} мВ
          </div>
          <hr style={{ margin: 0, border: 'none', borderTop: '1px solid #ccc' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 6 }}>
            <label>Ширина дорожки, мм: <input className="dt-input" type="number" min="0.05" step="0.05" value={rfTraceW} onChange={(e) => setRfTraceW(Math.max(0.05, parseFloat(e.target.value) || 0.25))} /></label>
            <label>Диэлектрик h, мм: <input className="dt-input" type="number" min="0.05" step="0.05" value={rfDielH} onChange={(e) => setRfDielH(Math.max(0.05, parseFloat(e.target.value) || 0.2))} /></label>
            <label>Диэл. прониц. εr: <input className="dt-input" type="number" min="1" step="0.1" value={rfEr} onChange={(e) => setRfEr(Math.max(1, parseFloat(e.target.value) || 4.4))} /></label>
            <label>Зазор дифф. пары, мм: <input className="dt-input" type="number" min="0.05" step="0.05" value={rfDiffGap} onChange={(e) => setRfDiffGap(Math.max(0.05, parseFloat(e.target.value) || 0.2))} /></label>
          </div>
          <div style={{ background: '#fff', border: '1px solid #ccc', padding: 6 }}>
            Микрополосковое Z₀ = <b>{rfImpedanceRes.z0SingleOhm} Ом</b> &nbsp;|&nbsp; Дифф. Z_diff = <b>{rfImpedanceRes.zDiffOhm} Ом</b> &nbsp;|&nbsp; Задержка: {rfImpedanceRes.propDelayPsPerMm} пс/мм
          </div>
        </div>
        <div className="dt-modal-footer">
          <button className="dt-btn" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
};
