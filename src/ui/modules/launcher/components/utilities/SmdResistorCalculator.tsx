import React, { useState } from 'react';
import {
  decodeSmdResistor,
  encodeSmdResistor,
  formatResistance
} from '../../../../../engines/rfCalc/smdResistorCalc';

const QUICK_PRESETS = [
  '0R', '100', '471', '102', '472', '103', '473', '104',
  '4R7', 'R22', '1001', '4701', '1002', '01A', '01Y', '68X'
];

export const SmdResistorCalculator: React.FC = () => {
  const [code, setCode] = useState('472');
  const [synthOhms, setSynthOhms] = useState('4700');

  const decoded = decodeSmdResistor(code);
  const synthVal = parseFloat(synthOhms) || 0;
  const encoded = encodeSmdResistor(synthVal);

  return (
    <div className="dt-panel-card launch-util-card">
      <div className="launch-util-header">
        <h3>Декодер маркировки SMD резисторов (3 цифры, 4 цифры, EIA-96 1%)</h3>
        <p className="launch-util-sub">
          Декодирование и синтез маркировки резисторов поверхностного монтажа по стандартам EIA-96, IEC 60062 и ГОСТ 28883.
          Поддерживаются стандартные трёхзначные коды (±5%), четырёхзначные прецизионные (±1%) и двухзначные с буквой EIA-96.
        </p>
      </div>

      <div className="launch-util-body-grid">
        {/* Form controls */}
        <div className="launch-util-form">
          <div className="dt-form-group">
            <label htmlFor="smd-code-input">Код маркировки резистора:</label>
            <input
              id="smd-code-input"
              className="dt-input"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Напр. 472, 1002, 68X, 4R7, 0R"
              style={{ fontWeight: 600, letterSpacing: '0.05em', fontSize: '13px' }}
            />
          </div>

          <div className="dt-form-group">
            <label>Быстрые примеры и типовые номиналы:</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="dt-btn small"
                  onClick={() => setCode(preset)}
                  style={{ minWidth: 42, padding: '2px 6px' }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--ui-border)' }}>
            <h4 style={{ margin: '0 0 6px', fontSize: '11px', color: 'var(--ui-muted)' }}>
              Синтез маркировки по сопротивлению (Ом):
            </h4>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="dt-input"
                type="number"
                value={synthOhms}
                onChange={(e) => setSynthOhms(e.target.value)}
                placeholder="Сопротивление в Омах"
                style={{ width: 140 }}
              />
              <span style={{ fontSize: '11px', color: 'var(--ui-muted)' }}>
                = {formatResistance(synthVal)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '11px' }}>
              <span>3 цифры: <strong>{encoded.code3Digit || '—'}</strong></span>
              <span>4 цифры: <strong>{encoded.code4Digit || '—'}</strong></span>
              <span>EIA-96: <strong>{encoded.eia96 || '—'}</strong></span>
            </div>
          </div>
        </div>

        {/* Results column */}
        <div className="launch-util-results">
          <h4>Результаты распознавания</h4>

          {decoded.valid ? (
            <>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Номинальное сопротивление:</span>
                <strong className="launch-metric-value" style={{ fontSize: '15px', color: 'var(--ui-accent)' }}>
                  {decoded.formatted}
                </strong>
              </div>

              <div className="launch-metric-box">
                <span className="launch-metric-title">В Омах (точно):</span>
                <strong className="launch-metric-value">{decoded.resistanceOhm} Ом</strong>
              </div>

              <div className="launch-metric-box">
                <span className="launch-metric-title">Тип кодировки:</span>
                <strong className="launch-metric-value">{decoded.standard}</strong>
              </div>

              <div className="launch-metric-box">
                <span className="launch-metric-title">Типовой допуск (погрешность):</span>
                <strong className="launch-metric-value">±{decoded.tolerancePercent}%</strong>
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
