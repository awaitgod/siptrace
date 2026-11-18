import React, { useState } from 'react';
import {
  convertLength,
  convertCopper,
  convertTemperature
} from '../../../../../engines/rfCalc/unitConverterCalc';

export const UnitConverterCalculator: React.FC = () => {
  // Length state
  const [lengthVal, setLengthVal] = useState('2.54');
  const [lengthUnit, setLengthUnit] = useState<'mm' | 'mils' | 'in' | 'um'>('mm');

  // Copper state
  const [copperVal, setCopperVal] = useState('1.0');
  const [copperUnit, setCopperUnit] = useState<'oz' | 'um' | 'mils'>('oz');

  // Temperature state
  const [tempVal, setTempVal] = useState('25');
  const [tempUnit, setTempUnit] = useState<'C' | 'F' | 'K'>('C');

  const lengthRes = convertLength(parseFloat(lengthVal) || 0, lengthUnit);
  const copperRes = convertCopper(parseFloat(copperVal) || 0, copperUnit);
  const tempRes = convertTemperature(parseFloat(tempVal) || 0, tempUnit);

  return (
    <div className="dt-panel-card launch-util-card">
      <div className="launch-util-header">
        <h3>Инженерный конвертер единиц измерения САПР (ECAD Converter)</h3>
        <p className="launch-util-sub">
          Двунаправленная конвертация метрических и имперских единиц длины, толщины/массы медной фольги печатных плат и температуры.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {/* 1. Length Converter */}
        <div style={{ background: 'var(--ui-subtle)', padding: 12, borderRadius: 3, border: '1px solid var(--ui-border)' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '12px' }}>Линейные размеры (Длина / Координаты)</h4>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              className="dt-input"
              type="number"
              step="0.1"
              value={lengthVal}
              onChange={(e) => setLengthVal(e.target.value)}
              style={{ flex: 1 }}
            />
            <select
              className="dt-select"
              value={lengthUnit}
              onChange={(e) => setLengthUnit(e.target.value as any)}
              style={{ width: 85 }}
            >
              <option value="mm">мм</option>
              <option value="mils">mils (thou)</option>
              <option value="in">дюймы (in)</option>
              <option value="um">мкм (µm)</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '11.5px' }}>
            <div className="launch-metric-box">
              <span className="launch-metric-title">Миллиметры (мм):</span>
              <strong className="launch-metric-value">{lengthRes.mm} мм</strong>
            </div>
            <div className="launch-metric-box">
              <span className="launch-metric-title">Милс (mils / thou):</span>
              <strong className="launch-metric-value">{lengthRes.mils} mil</strong>
            </div>
            <div className="launch-metric-box">
              <span className="launch-metric-title">Дюймы (in):</span>
              <strong className="launch-metric-value">{lengthRes.inches} in</strong>
            </div>
            <div className="launch-metric-box">
              <span className="launch-metric-title">Микрометры (мкм):</span>
              <strong className="launch-metric-value">{lengthRes.um} мкм</strong>
            </div>
          </div>
        </div>

        {/* 2. Copper Foil Weight & Thickness */}
        <div style={{ background: 'var(--ui-subtle)', padding: 12, borderRadius: 3, border: '1px solid var(--ui-border)' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '12px' }}>Толщина фольги печатных плат (Медь)</h4>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              className="dt-input"
              type="number"
              step="0.5"
              value={copperVal}
              onChange={(e) => setCopperVal(e.target.value)}
              style={{ flex: 1 }}
            />
            <select
              className="dt-select"
              value={copperUnit}
              onChange={(e) => setCopperUnit(e.target.value as any)}
              style={{ width: 85 }}
            >
              <option value="oz">oz/ft²</option>
              <option value="um">мкм (µm)</option>
              <option value="mils">mils</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '11.5px' }}>
            <div className="launch-metric-box">
              <span className="launch-metric-title">Вес (унции на кв. фут):</span>
              <strong className="launch-metric-value">{copperRes.ozFt2} oz/ft²</strong>
            </div>
            <div className="launch-metric-box">
              <span className="launch-metric-title">Толщина в микрометрах:</span>
              <strong className="launch-metric-value">{copperRes.um} мкм</strong>
            </div>
            <div className="launch-metric-box">
              <span className="launch-metric-title">Толщина в миллиметрах:</span>
              <strong className="launch-metric-value">{copperRes.mm} мм</strong>
            </div>
            <div className="launch-metric-box">
              <span className="launch-metric-title">Толщина в милсах:</span>
              <strong className="launch-metric-value">{copperRes.mils} mil</strong>
            </div>
          </div>
        </div>

        {/* 3. Temperature */}
        <div style={{ background: 'var(--ui-subtle)', padding: 12, borderRadius: 3, border: '1px solid var(--ui-border)' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '12px' }}>Температура (Нагрев / Среда)</h4>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              className="dt-input"
              type="number"
              step="1"
              value={tempVal}
              onChange={(e) => setTempVal(e.target.value)}
              style={{ flex: 1 }}
            />
            <select
              className="dt-select"
              value={tempUnit}
              onChange={(e) => setTempUnit(e.target.value as any)}
              style={{ width: 85 }}
            >
              <option value="C">°C</option>
              <option value="F">°F</option>
              <option value="K">K</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '11.5px' }}>
            <div className="launch-metric-box">
              <span className="launch-metric-title">Градусы Цельсия (°C):</span>
              <strong className="launch-metric-value">{tempRes.celsius} °C</strong>
            </div>
            <div className="launch-metric-box">
              <span className="launch-metric-title">Градусы Фаренгейта (°F):</span>
              <strong className="launch-metric-value">{tempRes.fahrenheit} °F</strong>
            </div>
            <div className="launch-metric-box">
              <span className="launch-metric-title">Кельвины (K):</span>
              <strong className="launch-metric-value">{tempRes.kelvin} K</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
