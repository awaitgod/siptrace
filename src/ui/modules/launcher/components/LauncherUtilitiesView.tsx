import React, { useState } from 'react';
import {
  IconCalculator,
  IconFlame,
  IconCpu,
  IconCheck,
  IconDeviceFloppy
} from '@tabler/icons-react';
import {
  calcMicrostripImpedance,
  MicrostripInput,
  MicrostripResult
} from '../../../../engines/rfCalc/microstripCalc';
import {
  calcTraceWidthByCurrent,
  TraceCurrentInput,
  TraceCurrentResult
} from '../../../../engines/rfCalc/traceCurrentCalc';
import {
  generateParametricPattern,
  PatternGeneratorFamily
} from '../../../../engines/patternGenerator';
import { loadUserPatterns, saveUserPatterns } from '../../../../core/store';

interface LauncherUtilitiesViewProps {
  onShowMessage: (msg: string) => void;
}

export const LauncherUtilitiesView: React.FC<LauncherUtilitiesViewProps> = ({ onShowMessage }) => {
  const [activeUtilTab, setActiveUtilTab] = useState<'rf' | 'current' | 'ipc'>('rf');

  // --- RF Calculator State ---
  const [rfInput, setRfInput] = useState<MicrostripInput>({
    traceWidthMm: 0.35,
    copperThicknessMm: 0.035,
    dielectricHeightMm: 0.2,
    er: 4.4,
    diffGapMm: 0.25
  });
  const rfResult: MicrostripResult = calcMicrostripImpedance(rfInput);

  // --- Trace Current Calculator State ---
  const [curInput, setCurInput] = useState<TraceCurrentInput>({
    currentAmps: 2.0,
    tempRiseC: 10,
    copperThicknessUm: 35,
    isExternalLayer: true
  });
  const curResult: TraceCurrentResult = calcTraceWidthByCurrent(curInput);

  // --- IPC-7351 Generator State ---
  const [ipcFamily, setIpcFamily] = useState<PatternGeneratorFamily>('SOIC');
  const [ipcName, setIpcName] = useState('SOIC-8_1.27');
  const [ipcPinCount, setIpcPinCount] = useState(8);
  const [ipcPitch, setIpcPitch] = useState(1.27);
  const [ipcDensity, setIpcDensity] = useState<'A' | 'B' | 'C'>('B');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSavePattern = () => {
    const pattern = generateParametricPattern({
      family: ipcFamily,
      name: ipcName,
      pinCount: ipcPinCount,
      pitch: ipcPitch,
      rowSpacing: ipcFamily === 'SOIC' ? 5.8 : 8.0,
      padWidth: 0.6,
      padHeight: 1.5,
      holeDiameter: 0,
      bodyWidth: 4.0,
      bodyLength: 5.0,
      bodyHeight: 1.75,
      densityLevel: ipcDensity
    });

    const currentPatterns = loadUserPatterns();
    const updated = [pattern, ...currentPatterns.filter((p) => p.name !== pattern.name)];
    saveUserPatterns(updated);
    setSavedSuccess(true);
    onShowMessage(`Посадочное место «${pattern.name}» сохранено в библиотеку пользователя.`);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="launch-utilities-view">
      <div className="launch-util-tabs">
        <button
          type="button"
          className={`dt-btn launch-util-tab ${activeUtilTab === 'rf' ? 'active' : ''}`}
          onClick={() => setActiveUtilTab('rf')}
        >
          <IconCalculator size={15} />
          <span>СВЧ / Импеданс (IPC-2141)</span>
        </button>

        <button
          type="button"
          className={`dt-btn launch-util-tab ${activeUtilTab === 'current' ? 'active' : ''}`}
          onClick={() => setActiveUtilTab('current')}
        >
          <IconFlame size={15} />
          <span>Ток и нагрев дорожек (ГОСТ 23751)</span>
        </button>

        <button
          type="button"
          className={`dt-btn launch-util-tab ${activeUtilTab === 'ipc' ? 'active' : ''}`}
          onClick={() => setActiveUtilTab('ipc')}
        >
          <IconCpu size={15} />
          <span>Генератор корпусов IPC-7351</span>
        </button>
      </div>

      {/* RF & Impedance Calculator */}
      {activeUtilTab === 'rf' && (
        <div className="dt-panel-card launch-util-card">
          <div className="launch-util-header">
            <h3>Расчёт волнового сопротивления микрополосковых и дифференциальных линий</h3>
            <p className="launch-util-sub">
              Математический расчёт по формулам Хаммерстада и стандарту IPC-2141. Определение параметров для
              трассировки линий USB 2.0 (90 Ом), Ethernet (100 Ом) и ВЧ 50 Ом.
            </p>
          </div>

          <div className="launch-util-body-grid">
            <div className="launch-util-form">
              <label className="launch-input-row">
                <span className="launch-input-label">Ширина проводника (W, мм):</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.05"
                  className="dt-input"
                  value={rfInput.traceWidthMm}
                  onChange={(e) => setRfInput({ ...rfInput, traceWidthMm: parseFloat(e.target.value) || 0.1 })}
                />
              </label>

              <label className="launch-input-row">
                <span className="launch-input-label">Высота диэлектрика (H, мм):</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.05"
                  className="dt-input"
                  value={rfInput.dielectricHeightMm}
                  onChange={(e) => setRfInput({ ...rfInput, dielectricHeightMm: parseFloat(e.target.value) || 0.1 })}
                />
              </label>

              <label className="launch-input-row">
                <span className="launch-input-label">Толщина фольги (T, мм):</span>
                <select
                  className="dt-select"
                  value={rfInput.copperThicknessMm}
                  onChange={(e) => setRfInput({ ...rfInput, copperThicknessMm: parseFloat(e.target.value) })}
                >
                  <option value={0.018}>18 мкм (0.5 oz)</option>
                  <option value={0.035}>35 мкм (1.0 oz - стандарт)</option>
                  <option value={0.070}>70 мкм (2.0 oz)</option>
                </select>
              </label>

              <label className="launch-input-row">
                <span className="launch-input-label">Диэлектрическая проницаемость (εr):</span>
                <select
                  className="dt-select"
                  value={rfInput.er}
                  onChange={(e) => setRfInput({ ...rfInput, er: parseFloat(e.target.value) })}
                >
                  <option value={4.4}>FR-4 Standard (4.4)</option>
                  <option value={3.66}>Rogers RO4350B (3.66 - ВЧ)</option>
                  <option value={9.8}>Алюминиевая керамика Al2O3 (9.8)</option>
                  <option value={2.2}>Политетрафторэтилен ФТОРОПЛАСТ (2.2)</option>
                </select>
              </label>

              <label className="launch-input-row">
                <span className="launch-input-label">Зазор дифференциальной пары (S, мм):</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.05"
                  className="dt-input"
                  value={rfInput.diffGapMm ?? 0.25}
                  onChange={(e) => setRfInput({ ...rfInput, diffGapMm: parseFloat(e.target.value) || 0.1 })}
                />
              </label>
            </div>

            <div className="launch-util-results">
              <h4>Результаты расчёта</h4>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Волновое сопротивление одиночной линии (Z₀):</span>
                <strong className="launch-metric-value">{rfResult.z0SingleOhm} Ом</strong>
              </div>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Дифференциальный импеданс пары (Z_diff):</span>
                <strong className="launch-metric-value">{rfResult.zDiffOhm} Ом</strong>
              </div>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Задержка распространения сигнала:</span>
                <strong className="launch-metric-value">{rfResult.propDelayPsPerMm} пс/мм</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trace Current & Thermal Limit Calculator */}
      {activeUtilTab === 'current' && (
        <div className="dt-panel-card launch-util-card">
          <div className="launch-util-header">
            <h3>Расчёт ширины проводника по допустимому току и нагреву</h3>
            <p className="launch-util-sub">
              Расчёт допустимой токовой нагрузки печатных проводников по ГОСТ 23751-86 и IPC-2221.
              Оценка теплового режима и падения напряжения в цепях питания.
            </p>
          </div>

          <div className="launch-util-body-grid">
            <div className="launch-util-form">
              <label className="launch-input-row">
                <span className="launch-input-label">Рабочий ток (Амперы):</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.01"
                  className="dt-input"
                  value={curInput.currentAmps}
                  onChange={(e) => setCurInput({ ...curInput, currentAmps: parseFloat(e.target.value) || 0.1 })}
                />
              </label>

              <label className="launch-input-row">
                <span className="launch-input-label">Допустимый перегрев проводника (ΔT, °C):</span>
                <select
                  className="dt-select"
                  value={curInput.tempRiseC}
                  onChange={(e) => setCurInput({ ...curInput, tempRiseC: parseFloat(e.target.value) })}
                >
                  <option value={10}>10 °C (рекомендуется для надёжности)</option>
                  <option value={20}>20 °C (номинальный режим)</option>
                  <option value={30}>30 °C (плотный монтаж)</option>
                  <option value={45}>45 °C (предельный режим)</option>
                </select>
              </label>

              <label className="launch-input-row">
                <span className="launch-input-label">Толщина медной фольги:</span>
                <select
                  className="dt-select"
                  value={curInput.copperThicknessUm}
                  onChange={(e) => setCurInput({ ...curInput, copperThicknessUm: parseInt(e.target.value, 10) })}
                >
                  <option value={18}>18 мкм (0.5 oz)</option>
                  <option value={35}>35 мкм (1.0 oz - стандарт)</option>
                  <option value={70}>70 мкм (2.0 oz - силовые платы)</option>
                </select>
              </label>

              <label className="launch-input-row">
                <span className="launch-input-label">Расположение слоя:</span>
                <select
                  className="dt-select"
                  value={curInput.isExternalLayer ? 'ext' : 'int'}
                  onChange={(e) => setCurInput({ ...curInput, isExternalLayer: e.target.value === 'ext' })}
                >
                  <option value="ext">Внешний слой (охлаждение воздухом)</option>
                  <option value="int">Внутренний слой (ухудшенный теплоотвод)</option>
                </select>
              </label>
            </div>

            <div className="launch-util-results">
              <h4>Результаты по ГОСТ 23751 / IPC-2221</h4>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Минимальная ширина проводника:</span>
                <strong className="launch-metric-value">{curResult.requiredWidthMm} мм</strong>
              </div>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Падение напряжения на длине 100 мм:</span>
                <strong className="launch-metric-value">{curResult.voltageDropMvPer100mm} мВ</strong>
              </div>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Омическое сопротивление проводника:</span>
                <strong className="launch-metric-value">{curResult.resistanceOhmPer100mm} Ом/100 мм</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* IPC-7351 Pattern Generator */}
      {activeUtilTab === 'ipc' && (
        <div className="dt-panel-card launch-util-card">
          <div className="launch-util-header">
            <h3>Параметрический генератор посадочных мест (IPC-7351)</h3>
            <p className="launch-util-sub">
              Автоматическое построение контактных площадок SMD/THT компонентов с тремя уровнями плотности монтажа
              (A - максимальный, B - номинальный, C - компактный) и сохранением в локальную библиотеку.
            </p>
          </div>

          <div className="launch-util-body-grid">
            <div className="launch-util-form">
              <label className="launch-input-row">
                <span className="launch-input-label">Тип корпуса:</span>
                <select
                  className="dt-select"
                  value={ipcFamily}
                  onChange={(e) => {
                    const f = e.target.value as PatternGeneratorFamily;
                    setIpcFamily(f);
                    setIpcName(`${f}-${f === 'SOIC' ? 8 : f === 'QFP' ? 32 : 16}`);
                  }}
                >
                  <option value="SOIC">SOIC / SOP (микросхема)</option>
                  <option value="QFP">QFP / TQFP (четырёхсторонний)</option>
                  <option value="QFN">QFN (с Thermal Pad)</option>
                  <option value="BGA">BGA (матрица шариков)</option>
                  <option value="ChipSMD">Chip SMD (резистор / конденсатор)</option>
                  <option value="SOT23">SOT-23 / SOT-223</option>
                  <option value="DIP">DIP (выводной THT)</option>
                </select>
              </label>

              <label className="launch-input-row">
                <span className="launch-input-label">Имя посадочного места:</span>
                <input
                  type="text"
                  className="dt-input"
                  value={ipcName}
                  onChange={(e) => setIpcName(e.target.value)}
                />
              </label>

              <label className="launch-input-row">
                <span className="launch-input-label">Число выводов:</span>
                <input
                  type="number"
                  min="2"
                  max="256"
                  className="dt-input"
                  value={ipcPinCount}
                  onChange={(e) => setIpcPinCount(parseInt(e.target.value, 10) || 8)}
                />
              </label>

              <label className="launch-input-row">
                <span className="launch-input-label">Шаг выводов (Pitch, мм):</span>
                <select
                  className="dt-select"
                  value={ipcPitch}
                  onChange={(e) => setIpcPitch(parseFloat(e.target.value))}
                >
                  <option value={1.27}>1.27 мм (SOIC-стандарт)</option>
                  <option value={0.80}>0.80 мм (QFP)</option>
                  <option value={0.65}>0.65 мм (TSSOP)</option>
                  <option value={0.50}>0.50 мм (LQFP / QFN)</option>
                  <option value={2.54}>2.54 мм (DIP-стандарт)</option>
                </select>
              </label>

              <label className="launch-input-row">
                <span className="launch-input-label">Уровень плотности IPC-7351:</span>
                <select
                  className="dt-select"
                  value={ipcDensity}
                  onChange={(e) => setIpcDensity(e.target.value as 'A' | 'B' | 'C')}
                >
                  <option value="B">Level B (Номинальный - стандартное производство)</option>
                  <option value="A">Level A (Максимальный - высокая надёжность, спецприёмка)</option>
                  <option value="C">Level C (Минимальный - высокая плотность монтажа)</option>
                </select>
              </label>

              <button
                type="button"
                className="dt-btn primary launch-ipc-save-btn"
                onClick={handleSavePattern}
              >
                {savedSuccess ? <IconCheck size={15} /> : <IconDeviceFloppy size={15} />}
                <span>{savedSuccess ? 'Сохранено в библиотеку!' : 'Сгенерировать и сохранить'}</span>
              </button>
            </div>

            <div className="launch-util-results">
              <h4>Параметры сгенерированного посадочного места</h4>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Имя в библиотеке:</span>
                <strong className="launch-metric-value">{ipcName}</strong>
              </div>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Выводов / площадок:</span>
                <strong className="launch-metric-value">{ipcPinCount} шт.</strong>
              </div>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Стандарт разметки:</span>
                <strong className="launch-metric-value">IPC-7351{ipcDensity}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
