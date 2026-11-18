import React, { useState } from 'react';
import {
  decodeCapacitor,
  formatCapacitance
} from '../../../../../engines/rfCalc/capacitorCalc';

const CAP_PRESETS = [
  '100', '220', '470', '101', '471', '102', '472', '103', '473', '104', '474', '105', '4R7'
];

export const CapacitorCalculator: React.FC = () => {
  const [code, setCode] = useState('104');
  const [tolerance, setTolerance] = useState('K');
  const [voltage, setVoltage] = useState('1H');
  const [dielectric, setDielectric] = useState('X7R');

  const decoded = decodeCapacitor(code, tolerance, voltage, dielectric);

  return (
    <div className="dt-panel-card launch-util-card">
      <div className="launch-util-header">
        <h3>Декодер маркировки керамических и пленочных конденсаторов</h3>
        <p className="launch-util-sub">
          Расчёт номинальной ёмкости по трёхзначному коду EIA/IEC, допуску, рабочему напряжению и реактивному сопротивлению Xc на рабочих частотах.
        </p>
      </div>

      <div className="launch-util-body-grid">
        {/* Form controls */}
        <div className="launch-util-form">
          <div className="dt-form-group">
            <label htmlFor="cap-code-input">Код маркировки конденсатора:</label>
            <input
              id="cap-code-input"
              className="dt-input"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Напр. 104, 473, 220, 4R7"
              style={{ fontWeight: 600, letterSpacing: '0.05em', fontSize: '13px' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="dt-form-group">
              <label htmlFor="cap-tolerance-select">Допуск (погрешность):</label>
              <select
                id="cap-tolerance-select"
                className="dt-select"
                value={tolerance}
                onChange={(e) => setTolerance(e.target.value)}
              >
                <option value="J">J (±5%)</option>
                <option value="K">K (±10%)</option>
                <option value="M">M (±20%)</option>
                <option value="Z">Z (+80% / -20%)</option>
                <option value="C">C (±0.25 пФ)</option>
                <option value="D">D (±0.5 пФ)</option>
              </select>
            </div>

            <div className="dt-form-group">
              <label htmlFor="cap-voltage-select">Номинальное напряжение:</label>
              <select
                id="cap-voltage-select"
                className="dt-select"
                value={voltage}
                onChange={(e) => setVoltage(e.target.value)}
              >
                <option value="0J">0J (6.3 В)</option>
                <option value="1A">1A (10 В)</option>
                <option value="1C">1C (16 В)</option>
                <option value="1E">1E (25 В)</option>
                <option value="1H">1H (50 В)</option>
                <option value="2A">2A (100 В)</option>
                <option value="2E">2E (250 В)</option>
                <option value="3A">3A (1000 В)</option>
              </select>
            </div>
          </div>

          <div className="dt-form-group">
            <label htmlFor="cap-dielectric-select">Тип диэлектрика:</label>
            <select
              id="cap-dielectric-select"
              className="dt-select"
              value={dielectric}
              onChange={(e) => setDielectric(e.target.value)}
            >
              <option value="C0G">C0G / NP0 (Класс 1, ±30 ppm/°C, высокостабильный)</option>
              <option value="X7R">X7R (Класс 2, ±15%, рабочий диапазон -55…+125°C)</option>
              <option value="X5R">X5R (Класс 2, компактный для блокировки питания)</option>
              <option value="Y5V">Y5V (Класс 3, высокая удельная ёмкость, низкая стабильность)</option>
            </select>
          </div>

          <div className="dt-form-group">
            <label>Быстрые типономиналы:</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {CAP_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="dt-btn small"
                  onClick={() => setCode(preset)}
                  style={{ minWidth: 38, padding: '2px 5px' }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results column */}
        <div className="launch-util-results">
          <h4>Параметры конденсатора</h4>

          {decoded.valid ? (
            <>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Номинальная ёмкость:</span>
                <strong className="launch-metric-value" style={{ fontSize: '15px', color: 'var(--ui-accent)' }}>
                  {decoded.formatted}
                </strong>
              </div>

              <div className="launch-metric-box">
                <span className="launch-metric-title">В пикофарадах / микрофарадах:</span>
                <strong className="launch-metric-value">
                  {decoded.capacitancePf} пФ = {decoded.capacitanceUf} мкФ
                </strong>
              </div>

              <div className="launch-metric-box">
                <span className="launch-metric-title">Допуск и напряжение:</span>
                <strong className="launch-metric-value">
                  {decoded.toleranceText} • {decoded.voltageText}
                </strong>
              </div>

              <div className="launch-metric-box">
                <span className="launch-metric-title">Реактивное сопротивление Xc:</span>
                <div style={{ fontSize: '11px', marginTop: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span>на 1 кГц: <strong>{decoded.reactanceAt1kHz ? `${decoded.reactanceAt1kHz.toFixed(1)} Ом` : '—'}</strong></span>
                  <span>на 100 кГц: <strong>{decoded.reactanceAt100kHz ? `${decoded.reactanceAt100kHz.toFixed(2)} Ом` : '—'}</strong></span>
                  <span>на 1 МГц: <strong>{decoded.reactanceAt1MHz ? `${decoded.reactanceAt1MHz.toFixed(3)} Ом` : '—'}</strong></span>
                </div>
              </div>

              <div style={{ fontSize: '10px', color: 'var(--ui-muted)', marginTop: 4, lineHeight: 1.3 }}>
                {decoded.dielectricDescription}
              </div>
            </>
          ) : (
            <div className="dt-error-message" style={{ margin: 0 }}>
              {decoded.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
