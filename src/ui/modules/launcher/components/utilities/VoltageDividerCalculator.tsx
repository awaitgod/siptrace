import React, { useState } from 'react';
import {
  calcVoltageDivider,
  synthesizeDividerPairs
} from '../../../../../engines/rfCalc/voltageDividerCalc';

export const VoltageDividerCalculator: React.FC = () => {
  const [vin, setVin] = useState('12');
  const [r1, setR1] = useState('10000');
  const [r2, setR2] = useState('10000');
  const [rLoad, setRLoad] = useState('');

  // Synthesis target
  const [targetVout, setTargetVout] = useState('3.3');
  const [targetCurrentMa, setTargetCurrentMa] = useState('1.0');

  const vinNum = parseFloat(vin) || 0;
  const r1Num = parseFloat(r1) || 1;
  const r2Num = parseFloat(r2) || 1;
  const rLoadNum = rLoad.trim() ? parseFloat(rLoad) : undefined;

  const result = calcVoltageDivider(vinNum, r1Num, r2Num, rLoadNum);
  const recommendations = synthesizeDividerPairs(
    vinNum,
    parseFloat(targetVout) || 3.3,
    parseFloat(targetCurrentMa) || 1.0
  );

  return (
    <div className="dt-panel-card launch-util-card">
      <div className="launch-util-header">
        <h3>Калькулятор резистивного делителя напряжения и подбор ряда E24</h3>
        <p className="launch-util-sub">
          Расчёт точного выходного напряжения Vout с учётом сопротивления нагрузки Rload, сквозного тока, рассеиваемой мощности и эквивалента Тевенена.
        </p>
      </div>

      <div className="launch-util-body-grid">
        {/* Form controls */}
        <div className="launch-util-form">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="dt-form-group">
              <label htmlFor="divider-vin">Входное напряжение Vin (В):</label>
              <input
                id="divider-vin"
                className="dt-input"
                type="number"
                step="0.5"
                value={vin}
                onChange={(e) => setVin(e.target.value)}
              />
            </div>

            <div className="dt-form-group">
              <label htmlFor="divider-rload">Сопротивление нагрузки Rload (Ом, опция):</label>
              <input
                id="divider-rload"
                className="dt-input"
                type="number"
                step="100"
                value={rLoad}
                onChange={(e) => setRLoad(e.target.value)}
                placeholder="Без нагрузки (∞)"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="dt-form-group">
              <label htmlFor="divider-r1">Верхний резистор R1 (Ом):</label>
              <input
                id="divider-r1"
                className="dt-input"
                type="number"
                step="100"
                value={r1}
                onChange={(e) => setR1(e.target.value)}
              />
            </div>

            <div className="dt-form-group">
              <label htmlFor="divider-r2">Нижний резистор R2 (Ом):</label>
              <input
                id="divider-r2"
                className="dt-input"
                type="number"
                step="100"
                value={r2}
                onChange={(e) => setR2(e.target.value)}
              />
            </div>
          </div>

          {/* Synthesis table */}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--ui-border)' }}>
            <h4 style={{ margin: '0 0 6px', fontSize: '11px', color: 'var(--ui-muted)' }}>
              Синтез пар резисторов стандартного ряда E24:
            </h4>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: '11px' }}>Целевое Vout (В):</label>
              <input
                className="dt-input"
                type="number"
                step="0.1"
                value={targetVout}
                onChange={(e) => setTargetVout(e.target.value)}
                style={{ width: 80 }}
              />
              <label style={{ fontSize: '11px', marginLeft: 8 }}>Ток делителя (мА):</label>
              <input
                className="dt-input"
                type="number"
                step="0.5"
                value={targetCurrentMa}
                onChange={(e) => setTargetCurrentMa(e.target.value)}
                style={{ width: 70 }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '4px 8px',
                    background: 'var(--ui-subtle)',
                    borderRadius: 2,
                    fontSize: '11px'
                  }}
                >
                  <span>
                    R1 = <strong>{rec.r1Ohm >= 1000 ? `${rec.r1Ohm / 1000} кОм` : `${rec.r1Ohm} Ом`}</strong>,{' '}
                    R2 = <strong>{rec.r2Ohm >= 1000 ? `${rec.r2Ohm / 1000} кОм` : `${rec.r2Ohm} Ом`}</strong>
                  </span>
                  <span>
                    Vout = <strong>{rec.vout} В</strong> (ошибка {rec.errorPercent}%)
                  </span>
                  <button
                    type="button"
                    className="dt-btn small"
                    onClick={() => {
                      setR1(String(rec.r1Ohm));
                      setR2(String(rec.r2Ohm));
                    }}
                  >
                    Применить
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Results column */}
        <div className="launch-util-results">
          <h4>Выходные параметры делителя</h4>

          <div className="launch-metric-box">
            <span className="launch-metric-title">Выходное напряжение (Vout):</span>
            <strong className="launch-metric-value" style={{ fontSize: '16px', color: 'var(--ui-accent)' }}>
              {result.vout} В
            </strong>
          </div>

          <div className="launch-metric-box">
            <span className="launch-metric-title">Коэффициент передачи (Vout/Vin):</span>
            <strong className="launch-metric-value">{result.ratio}</strong>
          </div>

          <div className="launch-metric-box">
            <span className="launch-metric-title">Сквозной ток делителя:</span>
            <strong className="launch-metric-value">{result.dividerCurrentMa} мА</strong>
          </div>

          {result.loadCurrentMa !== undefined && (
            <div className="launch-metric-box">
              <span className="launch-metric-title">Ток в нагрузке Rload:</span>
              <strong className="launch-metric-value">{result.loadCurrentMa} мА</strong>
            </div>
          )}

          <div className="launch-metric-box">
            <span className="launch-metric-title">Мощность потерь на R1 / R2:</span>
            <strong className="launch-metric-value">{result.powerR1Mw} мВт / {result.powerR2Mw} мВт</strong>
          </div>

          <div className="launch-metric-box">
            <span className="launch-metric-title">Суммарная рассеиваемая мощность:</span>
            <strong className="launch-metric-value">{result.totalPowerMw} мВт</strong>
          </div>

          <div className="launch-metric-box">
            <span className="launch-metric-title">Выходной импеданс Тевенена (Rth):</span>
            <strong className="launch-metric-value">
              {result.theveninResistanceOhm >= 1000
                ? `${(result.theveninResistanceOhm / 1000).toFixed(2)} кОм`
                : `${result.theveninResistanceOhm} Ом`}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
};
