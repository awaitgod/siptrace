import React, { useState } from 'react';
import {
  calcViaMetrics,
  ViaInput
} from '../../../../../engines/rfCalc/viaCalc';

export const ViaCalculator: React.FC = () => {
  const [params, setParams] = useState<ViaInput>({
    holeDiameterMm: 0.3,
    padDiameterMm: 0.6,
    antipadDiameterMm: 1.0,
    boardThicknessMm: 1.6,
    er: 4.4,
    platingThicknessUm: 25
  });

  const metrics = calcViaMetrics(params);

  const applyPreset = (hole: number, pad: number, antipad: number, thick: number, er: number) => {
    setParams({
      holeDiameterMm: hole,
      padDiameterMm: pad,
      antipadDiameterMm: antipad,
      boardThicknessMm: thick,
      er,
      platingThicknessUm: 25
    });
  };

  return (
    <div className="dt-panel-card launch-util-card">
      <div className="launch-util-header">
        <h3>Калькулятор паразитных параметров переходных отверстий (Via Parasitics IPC-2141)</h3>
        <p className="launch-util-sub">
          Расчёт паразитной индуктивности L, емкости C, волнового сопротивления Z₀, задержки сигнала и сопротивления металлизации для высокоскоростных печатных плат.
        </p>
      </div>

      <div className="launch-util-body-grid">
        {/* Form controls */}
        <div className="launch-util-form">
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="dt-btn small"
              onClick={() => applyPreset(0.3, 0.6, 1.0, 1.6, 4.4)}
            >
              Стандарт 1.6 мм (0.3 / 0.6 мм)
            </button>
            <button
              type="button"
              className="dt-btn small"
              onClick={() => applyPreset(0.2, 0.45, 0.85, 1.0, 4.2)}
            >
              Плотный монтаж HDI (0.2 / 0.45 мм)
            </button>
            <button
              type="button"
              className="dt-btn small"
              onClick={() => applyPreset(0.1, 0.25, 0.5, 0.8, 3.8)}
            >
              Microvia / Rogers (0.1 / 0.25 мм)
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="dt-form-group">
              <label htmlFor="via-hole-diameter">Диаметр сверления отверстия (d, мм):</label>
              <input
                id="via-hole-diameter"
                className="dt-input"
                type="number"
                step="0.05"
                value={params.holeDiameterMm}
                onChange={(e) => setParams({ ...params, holeDiameterMm: parseFloat(e.target.value) || 0.1 })}
              />
            </div>

            <div className="dt-form-group">
              <label htmlFor="via-pad-diameter">Диаметр площадки (D, мм):</label>
              <input
                id="via-pad-diameter"
                className="dt-input"
                type="number"
                step="0.05"
                value={params.padDiameterMm}
                onChange={(e) => setParams({ ...params, padDiameterMm: parseFloat(e.target.value) || 0.2 })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="dt-form-group">
              <label htmlFor="via-antipad-diameter">Диаметр зазора во внутренних слоях (Da, мм):</label>
              <input
                id="via-antipad-diameter"
                className="dt-input"
                type="number"
                step="0.05"
                value={params.antipadDiameterMm}
                onChange={(e) => setParams({ ...params, antipadDiameterMm: parseFloat(e.target.value) || 0.4 })}
              />
            </div>

            <div className="dt-form-group">
              <label htmlFor="via-board-thickness">Толщина печатной платы (h, мм):</label>
              <input
                id="via-board-thickness"
                className="dt-input"
                type="number"
                step="0.1"
                value={params.boardThicknessMm}
                onChange={(e) => setParams({ ...params, boardThicknessMm: parseFloat(e.target.value) || 0.5 })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="dt-form-group">
              <label htmlFor="via-er">Диэлектрическая проницаемость (εr):</label>
              <input
                id="via-er"
                className="dt-input"
                type="number"
                step="0.1"
                value={params.er}
                onChange={(e) => setParams({ ...params, er: parseFloat(e.target.value) || 4.4 })}
              />
            </div>

            <div className="dt-form-group">
              <label htmlFor="via-plating-thickness">Толщина металлизации ствола (мкм):</label>
              <input
                id="via-plating-thickness"
                className="dt-input"
                type="number"
                step="5"
                value={params.platingThicknessUm ?? 25}
                onChange={(e) => setParams({ ...params, platingThicknessUm: parseFloat(e.target.value) || 25 })}
              />
            </div>
          </div>
        </div>

        {/* Results column */}
        <div className="launch-util-results">
          <h4>Паразитные характеристики перехода</h4>

          <div className="launch-metric-box">
            <span className="launch-metric-title">Паразитная индуктивность (L):</span>
            <strong className="launch-metric-value" style={{ fontSize: '14px', color: 'var(--ui-accent)' }}>
              {metrics.inductanceNh} нГн
            </strong>
          </div>

          <div className="launch-metric-box">
            <span className="launch-metric-title">Паразитная ёмкость (C):</span>
            <strong className="launch-metric-value">{metrics.capacitancePf} пФ</strong>
          </div>

          <div className="launch-metric-box">
            <span className="launch-metric-title">Волновое сопротивление перехода (Z₀):</span>
            <strong className="launch-metric-value">{metrics.impedanceZ0Ohm} Ом</strong>
          </div>

          <div className="launch-metric-box">
            <span className="launch-metric-title">Задержка распространения (tpd):</span>
            <strong className="launch-metric-value">{metrics.delayPs} пс</strong>
          </div>

          <div className="launch-metric-box">
            <span className="launch-metric-title">Деградация фронта импульса (10-90%):</span>
            <strong className="launch-metric-value">{metrics.stepDegradationPs} пс</strong>
          </div>

          <div className="launch-metric-box">
            <span className="launch-metric-title">Сопротивление ствола (R_dc):</span>
            <strong className="launch-metric-value">{metrics.dcResistanceMilliOhm} мОм</strong>
          </div>
        </div>
      </div>
    </div>
  );
};
