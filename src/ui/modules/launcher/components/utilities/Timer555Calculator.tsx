import React, { useState } from 'react';
import {
  calc555Astable,
  calc555Monostable,
  synthesize555Astable,
  formatTimeSec,
  formatFrequencyHz
} from '../../../../../engines/rfCalc/timer555Calc';

export const Timer555Calculator: React.FC = () => {
  const [mode, setMode] = useState<'astable' | 'monostable' | 'synthesize'>('astable');

  // Astable state
  const [r1kOhm, setR1kOhm] = useState('10');
  const [r2kOhm, setR2kOhm] = useState('47');
  const [cnF, setCnF] = useState('100');

  // Monostable state
  const [monoRkOhm, setMonoRkOhm] = useState('100');
  const [monoCuF, setMonoCuF] = useState('10');

  // Synthesis state
  const [targetFreq, setTargetFreq] = useState('1000');
  const [targetDuty, setTargetDuty] = useState('60');

  const astableResult = calc555Astable(
    (parseFloat(r1kOhm) || 1) * 1e3,
    (parseFloat(r2kOhm) || 1) * 1e3,
    (parseFloat(cnF) || 1) * 1e-9
  );

  const monostableResult = calc555Monostable(
    (parseFloat(monoRkOhm) || 1) * 1e3,
    (parseFloat(monoCuF) || 1) * 1e-6
  );

  const synthResult = synthesize555Astable(
    parseFloat(targetFreq) || 1000,
    parseFloat(targetDuty) || 55
  );

  return (
    <div className="dt-panel-card launch-util-card">
      <div className="launch-util-header">
        <h3>Калькулятор интегрального таймера 555 (NE555 / ICM7555 / КР1006ВИ1)</h3>
        <p className="launch-util-sub">
          Расчёт частоты генерации, скважности импульсов, длительности периодов заряда/разряда конденсатора в астабильном и моностабильном режимах.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button
          type="button"
          className={`dt-btn ${mode === 'astable' ? 'primary' : ''}`}
          onClick={() => setMode('astable')}
        >
          Астабильный (Мультивибратор)
        </button>
        <button
          type="button"
          className={`dt-btn ${mode === 'monostable' ? 'primary' : ''}`}
          onClick={() => setMode('monostable')}
        >
          Моностабильный (Одновибратор)
        </button>
        <button
          type="button"
          className={`dt-btn ${mode === 'synthesize' ? 'primary' : ''}`}
          onClick={() => setMode('synthesize')}
        >
          Синтез по частоте
        </button>
      </div>

      <div className="launch-util-body-grid">
        {/* Form controls */}
        <div className="launch-util-form">
          {mode === 'astable' && (
            <>
              <div className="dt-form-group">
                <label htmlFor="timer-r1">Резистор R1 (кОм):</label>
                <input
                  id="timer-r1"
                  className="dt-input"
                  type="number"
                  step="0.5"
                  value={r1kOhm}
                  onChange={(e) => setR1kOhm(e.target.value)}
                />
              </div>

              <div className="dt-form-group">
                <label htmlFor="timer-r2">Резистор R2 (кОм):</label>
                <input
                  id="timer-r2"
                  className="dt-input"
                  type="number"
                  step="1"
                  value={r2kOhm}
                  onChange={(e) => setR2kOhm(e.target.value)}
                />
              </div>

              <div className="dt-form-group">
                <label htmlFor="timer-c">Времязадающий конденсатор C (нФ):</label>
                <input
                  id="timer-c"
                  className="dt-input"
                  type="number"
                  step="10"
                  value={cnF}
                  onChange={(e) => setCnF(e.target.value)}
                />
              </div>
            </>
          )}

          {mode === 'monostable' && (
            <>
              <div className="dt-form-group">
                <label htmlFor="timer-mono-r">Резистор R (кОм):</label>
                <input
                  id="timer-mono-r"
                  className="dt-input"
                  type="number"
                  step="5"
                  value={monoRkOhm}
                  onChange={(e) => setMonoRkOhm(e.target.value)}
                />
              </div>

              <div className="dt-form-group">
                <label htmlFor="timer-mono-c">Конденсатор C (мкФ):</label>
                <input
                  id="timer-mono-c"
                  className="dt-input"
                  type="number"
                  step="1"
                  value={monoCuF}
                  onChange={(e) => setMonoCuF(e.target.value)}
                />
              </div>
            </>
          )}

          {mode === 'synthesize' && (
            <>
              <div className="dt-form-group">
                <label htmlFor="timer-target-freq">Требуемая частота генерации (Гц):</label>
                <input
                  id="timer-target-freq"
                  className="dt-input"
                  type="number"
                  step="50"
                  value={targetFreq}
                  onChange={(e) => setTargetFreq(e.target.value)}
                />
              </div>

              <div className="dt-form-group">
                <label htmlFor="timer-target-duty">Желаемый коэффициент заполнения (%):</label>
                <input
                  id="timer-target-duty"
                  className="dt-input"
                  type="number"
                  step="1"
                  min="51"
                  max="99"
                  value={targetDuty}
                  onChange={(e) => setTargetDuty(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {/* Results column */}
        <div className="launch-util-results">
          <h4>Выходные параметры таймера</h4>

          {mode === 'astable' && (
            <>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Частота генерации:</span>
                <strong className="launch-metric-value" style={{ fontSize: '15px', color: 'var(--ui-accent)' }}>
                  {astableResult.formattedFreq}
                </strong>
              </div>

              <div className="launch-metric-box">
                <span className="launch-metric-title">Полный период колебаний (T):</span>
                <strong className="launch-metric-value">{astableResult.formattedPeriod}</strong>
              </div>

              <div className="launch-metric-box">
                <span className="launch-metric-title">Длительность высокого уровня (Thigh):</span>
                <strong className="launch-metric-value">{formatTimeSec(astableResult.tHighSec)}</strong>
              </div>

              <div className="launch-metric-box">
                <span className="launch-metric-title">Длительность низкого уровня (Tlow):</span>
                <strong className="launch-metric-value">{formatTimeSec(astableResult.tLowSec)}</strong>
              </div>

              <div className="launch-metric-box">
                <span className="launch-metric-title">Коэффициент заполнения (Duty):</span>
                <strong className="launch-metric-value">{astableResult.dutyCyclePercent}%</strong>
              </div>
            </>
          )}

          {mode === 'monostable' && (
            <>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Длительность импульса (Tpulse):</span>
                <strong className="launch-metric-value" style={{ fontSize: '15px', color: 'var(--ui-accent)' }}>
                  {monostableResult.formattedPulse}
                </strong>
              </div>

              <div className="launch-metric-box">
                <span className="launch-metric-title">Формула расчёта:</span>
                <strong className="launch-metric-value" style={{ fontSize: '11px', fontWeight: 400 }}>
                  T ≈ 1.1 × R × C
                </strong>
              </div>
            </>
          )}

          {mode === 'synthesize' && (
            <>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Рекомендованный R1:</span>
                <strong className="launch-metric-value">{synthResult.r1Ohm} Ом ({Number((synthResult.r1Ohm / 1000).toFixed(2))} кОм)</strong>
              </div>

              <div className="launch-metric-box">
                <span className="launch-metric-title">Рекомендованный R2:</span>
                <strong className="launch-metric-value">{synthResult.r2Ohm} Ом ({Number((synthResult.r2Ohm / 1000).toFixed(2))} кОм)</strong>
              </div>

              <div className="launch-metric-box">
                <span className="launch-metric-title">Рекомендованный C:</span>
                <strong className="launch-metric-value">{synthResult.cFarads * 1e9} нФ</strong>
              </div>

              <div className="launch-metric-box">
                <span className="launch-metric-title">Результирующая частота:</span>
                <strong className="launch-metric-value">{formatFrequencyHz(synthResult.actualFreqHz)} ({synthResult.actualDutyPercent}%)</strong>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
