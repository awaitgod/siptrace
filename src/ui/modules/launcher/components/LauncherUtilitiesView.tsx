import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  IconCalculator,
  IconFlame,
  IconCpu,
  IconCheck,
  IconDeviceFloppy,
  IconArrowRight,
  IconExternalLink
} from '@tabler/icons-react';
import type { AppModuleId } from '../../../../core/types';
import {
  calcMicrostripImpedance,
  calcMicrostripWidthForZ0,
  MicrostripInput,
  MicrostripResult
} from '../../../../engines/rfCalc/microstripCalc';
import {
  calcTraceWidthByCurrent,
  calcMaxCurrentByTraceWidth,
  TraceCurrentInput,
  TraceCurrentResult
} from '../../../../engines/rfCalc/traceCurrentCalc';
import {
  generateParametricPattern,
  PatternGeneratorFamily,
  PatternGeneratorParams
} from '../../../../engines/patternGenerator';
import { loadUserPatterns, saveUserPatterns } from '../../../../core/store';
import { SmdResistorCalculator } from './utilities/SmdResistorCalculator';
import { CapacitorCalculator } from './utilities/CapacitorCalculator';
import { ViaCalculator } from './utilities/ViaCalculator';
import { Timer555Calculator } from './utilities/Timer555Calculator';
import { VoltageDividerCalculator } from './utilities/VoltageDividerCalculator';
import { UnitConverterCalculator } from './utilities/UnitConverterCalculator';

export type LauncherUtilityTab =
  | 'rf'
  | 'current'
  | 'smd'
  | 'cap'
  | 'via'
  | 'timer555'
  | 'divider'
  | 'converter'
  | 'ipc';

interface LauncherUtilitiesViewProps {
  onShowMessage: (msg: string) => void;
  onSwitchModule?: (moduleId: AppModuleId) => void;
}

interface PackagePreset {
  label: string;
  family: PatternGeneratorFamily;
  pinCount: number;
  pitch: number;
  rowSpacing: number;
  padWidth: number;
  padHeight: number;
  holeDiameter: number;
  bodyWidth: number;
  bodyLength: number;
  thermalPadSize?: number;
}

const PACKAGE_PRESETS: PackagePreset[] = [
  {
    label: 'SOIC-8 (1.27 мм)',
    family: 'SOIC',
    pinCount: 8,
    pitch: 1.27,
    rowSpacing: 5.8,
    padWidth: 0.6,
    padHeight: 1.5,
    holeDiameter: 0,
    bodyWidth: 3.9,
    bodyLength: 4.9
  },
  {
    label: 'SOIC-14 (1.27 мм)',
    family: 'SOIC',
    pinCount: 14,
    pitch: 1.27,
    rowSpacing: 5.8,
    padWidth: 0.6,
    padHeight: 1.5,
    holeDiameter: 0,
    bodyWidth: 3.9,
    bodyLength: 8.65
  },
  {
    label: 'SOIC-16 (1.27 мм)',
    family: 'SOIC',
    pinCount: 16,
    pitch: 1.27,
    rowSpacing: 5.8,
    padWidth: 0.6,
    padHeight: 1.5,
    holeDiameter: 0,
    bodyWidth: 3.9,
    bodyLength: 9.9
  },
  {
    label: 'TSSOP-16 (0.65 мм)',
    family: 'SOIC',
    pinCount: 16,
    pitch: 0.65,
    rowSpacing: 6.4,
    padWidth: 0.42,
    padHeight: 1.4,
    holeDiameter: 0,
    bodyWidth: 4.4,
    bodyLength: 5.0
  },
  {
    label: 'TQFP-32 (0.8 мм)',
    family: 'QFP',
    pinCount: 32,
    pitch: 0.8,
    rowSpacing: 9.0,
    padWidth: 0.5,
    padHeight: 1.4,
    holeDiameter: 0,
    bodyWidth: 7.0,
    bodyLength: 7.0
  },
  {
    label: 'LQFP-48 (0.5 мм)',
    family: 'QFP',
    pinCount: 48,
    pitch: 0.5,
    rowSpacing: 9.0,
    padWidth: 0.3,
    padHeight: 1.4,
    holeDiameter: 0,
    bodyWidth: 7.0,
    bodyLength: 7.0
  },
  {
    label: 'LQFP-64 (0.5 мм)',
    family: 'QFP',
    pinCount: 64,
    pitch: 0.5,
    rowSpacing: 12.0,
    padWidth: 0.3,
    padHeight: 1.4,
    holeDiameter: 0,
    bodyWidth: 10.0,
    bodyLength: 10.0
  },
  {
    label: 'QFN-32 (0.5 мм, 5×5 с Thermal Pad)',
    family: 'QFN',
    pinCount: 32,
    pitch: 0.5,
    rowSpacing: 5.0,
    padWidth: 0.28,
    padHeight: 0.8,
    holeDiameter: 0,
    bodyWidth: 5.0,
    bodyLength: 5.0,
    thermalPadSize: 3.4
  },
  {
    label: 'Chip SMD 0805 (2012 Metric)',
    family: 'ChipSMD',
    pinCount: 2,
    pitch: 0,
    rowSpacing: 1.9,
    padWidth: 1.3,
    padHeight: 1.0,
    holeDiameter: 0,
    bodyWidth: 1.25,
    bodyLength: 2.0
  },
  {
    label: 'Chip SMD 0603 (1608 Metric)',
    family: 'ChipSMD',
    pinCount: 2,
    pitch: 0,
    rowSpacing: 1.5,
    padWidth: 0.95,
    padHeight: 0.8,
    holeDiameter: 0,
    bodyWidth: 0.8,
    bodyLength: 1.6
  },
  {
    label: 'Chip SMD 1206 (3216 Metric)',
    family: 'ChipSMD',
    pinCount: 2,
    pitch: 0,
    rowSpacing: 3.0,
    padWidth: 1.6,
    padHeight: 1.2,
    holeDiameter: 0,
    bodyWidth: 1.6,
    bodyLength: 3.2
  },
  {
    label: 'SOT-23-3 (0.95 мм)',
    family: 'SOT23',
    pinCount: 3,
    pitch: 0.95,
    rowSpacing: 2.5,
    padWidth: 0.65,
    padHeight: 1.0,
    holeDiameter: 0,
    bodyWidth: 1.3,
    bodyLength: 2.9
  },
  {
    label: 'BGA-64 (8×8, 0.8 мм)',
    family: 'BGA',
    pinCount: 64,
    pitch: 0.8,
    rowSpacing: 5.6,
    padWidth: 0.4,
    padHeight: 0.4,
    holeDiameter: 0,
    bodyWidth: 8.0,
    bodyLength: 8.0
  },
  {
    label: 'DIP-8 (2.54 мм, THT)',
    family: 'DIP',
    pinCount: 8,
    pitch: 2.54,
    rowSpacing: 7.62,
    padWidth: 1.6,
    padHeight: 1.6,
    holeDiameter: 0.85,
    bodyWidth: 6.35,
    bodyLength: 9.6
  },
  {
    label: 'DIP-14 (2.54 мм, THT)',
    family: 'DIP',
    pinCount: 14,
    pitch: 2.54,
    rowSpacing: 7.62,
    padWidth: 1.6,
    padHeight: 1.6,
    holeDiameter: 0.85,
    bodyWidth: 6.35,
    bodyLength: 19.0
  },
  {
    label: 'DIP-16 (2.54 мм, THT)',
    family: 'DIP',
    pinCount: 16,
    pitch: 2.54,
    rowSpacing: 7.62,
    padWidth: 1.6,
    padHeight: 1.6,
    holeDiameter: 0.85,
    bodyWidth: 6.35,
    bodyLength: 20.0
  }
];

export const LauncherUtilitiesView: React.FC<LauncherUtilitiesViewProps> = ({
  onShowMessage,
  onSwitchModule
}) => {
  const [activeUtilTab, setActiveUtilTab] = useState<LauncherUtilityTab>('rf');

  // =========================================================================
  // RF / Impedance Calculator State
  // =========================================================================
  const [rfMode, setRfMode] = useState<'analyze' | 'synthesize'>('analyze');
  const [rfInput, setRfInput] = useState<MicrostripInput>({
    traceWidthMm: 0.35,
    copperThicknessMm: 0.035,
    dielectricHeightMm: 0.2,
    er: 4.4,
    diffGapMm: 0.25
  });
  const [targetZ0, setTargetZ0] = useState<number>(50);

  const rfResult: MicrostripResult = useMemo(() => calcMicrostripImpedance(rfInput), [rfInput]);

  const synthesizedWidth = useMemo(() => {
    return calcMicrostripWidthForZ0(
      targetZ0,
      rfInput.dielectricHeightMm,
      rfInput.er,
      rfInput.copperThicknessMm
    );
  }, [targetZ0, rfInput.dielectricHeightMm, rfInput.er, rfInput.copperThicknessMm]);

  const applySynthesizedWidth = () => {
    setRfInput((prev) => ({ ...prev, traceWidthMm: synthesizedWidth }));
    setRfMode('analyze');
    onShowMessage(`Ширина проводника ${synthesizedWidth} мм установлена для Z₀ = ${targetZ0} Ом.`);
  };

  // =========================================================================
  // Trace Current Calculator State
  // =========================================================================
  const [curMode, setCurMode] = useState<'current_to_width' | 'width_to_current'>('current_to_width');
  const [curInput, setCurInput] = useState<TraceCurrentInput>({
    currentAmps: 2.0,
    tempRiseC: 10,
    copperThicknessUm: 35,
    isExternalLayer: true,
    traceLengthMm: 100
  });
  const [inputWidthMm, setInputWidthMm] = useState<number>(0.5);

  const curResult: TraceCurrentResult = useMemo(() => calcTraceWidthByCurrent(curInput), [curInput]);

  const maxCurrentForWidth = useMemo(() => {
    return calcMaxCurrentByTraceWidth({
      traceWidthMm: inputWidthMm,
      tempRiseC: curInput.tempRiseC,
      copperThicknessUm: curInput.copperThicknessUm,
      isExternalLayer: curInput.isExternalLayer
    });
  }, [inputWidthMm, curInput.tempRiseC, curInput.copperThicknessUm, curInput.isExternalLayer]);

  // =========================================================================
  // IPC-7351 Parametric Pattern Generator State
  // =========================================================================
  const [ipcFamily, setIpcFamily] = useState<PatternGeneratorFamily>('SOIC');
  const [ipcName, setIpcName] = useState('SOIC-8_1.27');
  const [ipcPinCount, setIpcPinCount] = useState(8);
  const [ipcPitch, setIpcPitch] = useState(1.27);
  const [ipcRowSpacing, setIpcRowSpacing] = useState(5.8);
  const [ipcPadWidth, setIpcPadWidth] = useState(0.6);
  const [ipcPadHeight, setIpcPadHeight] = useState(1.5);
  const [ipcHoleDiameter, setIpcHoleDiameter] = useState(0);
  const [ipcBodyWidth, setIpcBodyWidth] = useState(3.9);
  const [ipcBodyLength, setIpcBodyLength] = useState(4.9);
  const [ipcThermalPadSize, setIpcThermalPadSize] = useState(0);
  const [ipcDensity, setIpcDensity] = useState<'A' | 'B' | 'C'>('B');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const applyPreset = (preset: PackagePreset) => {
    setIpcFamily(preset.family);
    setIpcName(preset.label.replace(/ \(.*/, '').replace(/ /g, '_'));
    setIpcPinCount(preset.pinCount);
    setIpcPitch(preset.pitch);
    setIpcRowSpacing(preset.rowSpacing);
    setIpcPadWidth(preset.padWidth);
    setIpcPadHeight(preset.padHeight);
    setIpcHoleDiameter(preset.holeDiameter);
    setIpcBodyWidth(preset.bodyWidth);
    setIpcBodyLength(preset.bodyLength);
    setIpcThermalPadSize(preset.thermalPadSize ?? 0);
  };

  const generatedPattern = useMemo(() => {
    const params: PatternGeneratorParams = {
      family: ipcFamily,
      name: ipcName.trim() || `${ipcFamily}-${ipcPinCount}`,
      pinCount: Math.max(2, ipcPinCount),
      pitch: Math.max(0.1, ipcPitch),
      rowSpacing: Math.max(0.2, ipcRowSpacing),
      padWidth: Math.max(0.1, ipcPadWidth),
      padHeight: Math.max(0.1, ipcPadHeight),
      holeDiameter: ipcFamily === 'DIP' || ipcFamily === 'AxialTHT' || ipcFamily === 'RadialTHT'
        ? Math.max(0.4, ipcHoleDiameter || 0.85)
        : 0,
      bodyWidth: Math.max(0.5, ipcBodyWidth),
      bodyLength: Math.max(0.5, ipcBodyLength),
      bodyHeight: 1.75,
      densityLevel: ipcDensity,
      thermalPadSize: ipcFamily === 'QFN' && ipcThermalPadSize > 0 ? ipcThermalPadSize : undefined,
      bgaCols: ipcFamily === 'BGA' ? Math.round(Math.sqrt(ipcPinCount)) : undefined,
      bgaRows: ipcFamily === 'BGA' ? Math.round(Math.sqrt(ipcPinCount)) : undefined
    };
    return generateParametricPattern(params);
  }, [
    ipcFamily,
    ipcName,
    ipcPinCount,
    ipcPitch,
    ipcRowSpacing,
    ipcPadWidth,
    ipcPadHeight,
    ipcHoleDiameter,
    ipcBodyWidth,
    ipcBodyLength,
    ipcThermalPadSize,
    ipcDensity
  ]);

  // Live Canvas Rendering of Pattern
  useEffect(() => {
    if (activeUtilTab !== 'ipc') return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Dark grid background
    ctx.fillStyle = '#181b20';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#272c35';
    ctx.lineWidth = 1;
    const gridStep = 20;
    for (let x = 0; x < width; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Determine bounding box in mm
    let minX = -ipcBodyWidth / 2 - 1.0;
    let maxX = ipcBodyWidth / 2 + 1.0;
    let minY = -ipcBodyLength / 2 - 1.0;
    let maxY = ipcBodyLength / 2 + 1.0;

    for (const pad of generatedPattern.pads) {
      minX = Math.min(minX, pad.x - pad.width / 2 - 0.5);
      maxX = Math.max(maxX, pad.x + pad.width / 2 + 0.5);
      minY = Math.min(minY, pad.y - pad.height / 2 - 0.5);
      maxY = Math.max(maxY, pad.y + pad.height / 2 + 0.5);
    }

    const spanX = Math.max(2.0, maxX - minX);
    const spanY = Math.max(2.0, maxY - minY);
    const scale = Math.min((width - 40) / spanX, (height - 40) / spanY);
    const cx = width / 2;
    const cy = height / 2;

    const toScreenX = (xMm: number) => cx + xMm * scale;
    const toScreenY = (yMm: number) => cy + yMm * scale;

    // Draw silkscreen / component body outline
    ctx.strokeStyle = '#f4e04d';
    ctx.lineWidth = 1.5;
    const bwPx = ipcBodyWidth * scale;
    const blPx = ipcBodyLength * scale;
    ctx.strokeRect(cx - bwPx / 2, cy - blPx / 2, bwPx, blPx);

    // Pin 1 dot
    ctx.fillStyle = '#f4e04d';
    ctx.beginPath();
    ctx.arc(cx - bwPx / 2 + 6, cy - blPx / 2 + 6, 3, 0, Math.PI * 2);
    ctx.fill();

    // Draw pads
    for (const pad of generatedPattern.pads) {
      const px = toScreenX(pad.x);
      const py = toScreenY(pad.y);
      const pw = pad.width * scale;
      const ph = pad.height * scale;

      // Copper color
      ctx.fillStyle = pad.type === 'THT' ? '#2e8b57' : '#cf732b';
      ctx.strokeStyle = '#f09848';
      ctx.lineWidth = 1;

      if (pad.shape === 'Round' || (pad.shape as string) === 'Circle') {
        ctx.beginPath();
        ctx.arc(px, py, pw / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(px - pw / 2, py - ph / 2, pw, ph);
        ctx.strokeRect(px - pw / 2, py - ph / 2, pw, ph);
      }

      // Draw drill hole for THT
      if (pad.type === 'THT' && (pad.holeDiameter ?? 0) > 0) {
        ctx.fillStyle = '#121214';
        ctx.beginPath();
        ctx.arc(px, py, (pad.holeDiameter! * scale) / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Pin number text
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pad.number, px, py);
    }
  }, [activeUtilTab, generatedPattern, ipcBodyWidth, ipcBodyLength]);

  const handleSavePattern = () => {
    const currentPatterns = loadUserPatterns();
    const updated = [generatedPattern, ...currentPatterns.filter((p) => p.name !== generatedPattern.name)];
    saveUserPatterns(updated);
    setSavedSuccess(true);
    onShowMessage(`Посадочное место «${generatedPattern.name}» сохранено в библиотеку пользователя.`);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleOpenInPatternEditor = () => {
    handleSavePattern();
    if (onSwitchModule) {
      onSwitchModule('patternEditor');
    }
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
          className={`dt-btn launch-util-tab ${activeUtilTab === 'smd' ? 'active' : ''}`}
          onClick={() => setActiveUtilTab('smd')}
        >
          <IconCalculator size={15} />
          <span>Маркировка SMD (EIA-96)</span>
        </button>

        <button
          type="button"
          className={`dt-btn launch-util-tab ${activeUtilTab === 'cap' ? 'active' : ''}`}
          onClick={() => setActiveUtilTab('cap')}
        >
          <IconCalculator size={15} />
          <span>Маркировка конденсаторов</span>
        </button>

        <button
          type="button"
          className={`dt-btn launch-util-tab ${activeUtilTab === 'via' ? 'active' : ''}`}
          onClick={() => setActiveUtilTab('via')}
        >
          <IconCalculator size={15} />
          <span>Переходные отверстия (Via)</span>
        </button>

        <button
          type="button"
          className={`dt-btn launch-util-tab ${activeUtilTab === 'timer555' ? 'active' : ''}`}
          onClick={() => setActiveUtilTab('timer555')}
        >
          <IconCalculator size={15} />
          <span>Таймер 555</span>
        </button>

        <button
          type="button"
          className={`dt-btn launch-util-tab ${activeUtilTab === 'divider' ? 'active' : ''}`}
          onClick={() => setActiveUtilTab('divider')}
        >
          <IconCalculator size={15} />
          <span>Делитель напряжения</span>
        </button>

        <button
          type="button"
          className={`dt-btn launch-util-tab ${activeUtilTab === 'converter' ? 'active' : ''}`}
          onClick={() => setActiveUtilTab('converter')}
        >
          <IconCalculator size={15} />
          <span>Конвертер единиц</span>
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

      {/* =================================================================== */}
      {/* 1. RF & Impedance Calculator                                        */}
      {/* =================================================================== */}
      {activeUtilTab === 'rf' && (
        <div className="dt-panel-card launch-util-card">
          <div className="launch-util-header">
            <h3>Расчёт волнового сопротивления микрополосковых и дифференциальных линий</h3>
            <p className="launch-util-sub">
              Математический расчёт по формулам Хаммерстада-Йенсена, Уилера и стандарту IPC-2141. Определение
              параметров для трассировки одиночных ВЧ-линий 50 Ом, пар USB 2.0 (90 Ом) и Ethernet / PCIe / LVDS (100 Ом).
            </p>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button
              type="button"
              className={`dt-btn ${rfMode === 'analyze' ? 'primary' : ''}`}
              onClick={() => setRfMode('analyze')}
            >
              Анализ (Импеданс по геометрии)
            </button>
            <button
              type="button"
              className={`dt-btn ${rfMode === 'synthesize' ? 'primary' : ''}`}
              onClick={() => setRfMode('synthesize')}
            >
              Синтез (Ширина по целевому Z₀)
            </button>
          </div>

          <div className="launch-util-body-grid">
            <div className="launch-util-form">
              {rfMode === 'synthesize' && (
                <div style={{ background: 'var(--ui-subtle)', padding: 8, border: '1px solid var(--ui-border)', marginBottom: 8 }}>
                  <label className="launch-input-row">
                    <span className="launch-input-label">Целевой импеданс Z₀ (Ом):</span>
                    <input
                      type="number"
                      step="1"
                      min="10"
                      max="150"
                      className="dt-input"
                      value={targetZ0}
                      onChange={(e) => setTargetZ0(parseFloat(e.target.value) || 50)}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <button type="button" className="dt-btn" style={{ fontSize: 10 }} onClick={() => setTargetZ0(50)}>50 Ом (ВЧ)</button>
                    <button type="button" className="dt-btn" style={{ fontSize: 10 }} onClick={() => setTargetZ0(75)}>75 Ом (Видео)</button>
                    <button type="button" className="dt-btn" style={{ fontSize: 10 }} onClick={() => setTargetZ0(90)}>90 Ом (USB)</button>
                    <button type="button" className="dt-btn" style={{ fontSize: 10 }} onClick={() => setTargetZ0(100)}>100 Ом (Ethernet)</button>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Требуемая ширина: <strong>{synthesizedWidth} мм</strong></span>
                    <button type="button" className="dt-btn primary" style={{ fontSize: 10.5 }} onClick={applySynthesizedWidth}>
                      Применить ширину
                    </button>
                  </div>
                </div>
              )}

              <label className="launch-input-row">
                <span className="launch-input-label">Ширина проводника (W, мм):</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.02"
                  max="10.0"
                  className="dt-input"
                  value={rfInput.traceWidthMm}
                  onChange={(e) => setRfInput({ ...rfInput, traceWidthMm: Math.max(0.02, parseFloat(e.target.value) || 0.1) })}
                />
              </label>

              <label className="launch-input-row">
                <span className="launch-input-label">Высота диэлектрика (H, мм):</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.02"
                  max="10.0"
                  className="dt-input"
                  value={rfInput.dielectricHeightMm}
                  onChange={(e) => setRfInput({ ...rfInput, dielectricHeightMm: Math.max(0.02, parseFloat(e.target.value) || 0.1) })}
                />
              </label>

              <label className="launch-input-row">
                <span className="launch-input-label">Толщина фольги (T, мм):</span>
                <select
                  className="dt-select"
                  value={rfInput.copperThicknessMm}
                  onChange={(e) => setRfInput({ ...rfInput, copperThicknessMm: parseFloat(e.target.value) })}
                >
                  <option value={0.018}>18 мкм (0.5 oz - тонкая медь)</option>
                  <option value={0.035}>35 мкм (1.0 oz - стандарт)</option>
                  <option value={0.070}>70 мкм (2.0 oz - силовая медь)</option>
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
                  <option value={3.66}>Rogers RO4350B (3.66 - ВЧ ламинат)</option>
                  <option value={3.55}>Rogers RO4003C (3.55 - СВЧ)</option>
                  <option value={4.0}>Isola 370HR (4.0 - High Tg)</option>
                  <option value={3.4}>Полиимид / Flex (3.4 - гибкие платы)</option>
                  <option value={9.8}>Алюминиевая керамика Al2O3 (9.8)</option>
                  <option value={2.2}>Политетрафторэтилен ФТОРОПЛАСТ (2.2)</option>
                </select>
              </label>

              <label className="launch-input-row">
                <span className="launch-input-label">Зазор дифференциальной пары (S, мм):</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.02"
                  max="5.0"
                  className="dt-input"
                  value={rfInput.diffGapMm ?? 0.25}
                  onChange={(e) => setRfInput({ ...rfInput, diffGapMm: Math.max(0.02, parseFloat(e.target.value) || 0.1) })}
                />
              </label>
            </div>

            <div className="launch-util-results">
              <h4>Результаты расчёта линии передачи</h4>
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
              <div className="launch-metric-box">
                <span className="launch-metric-title">Эффективная диэлектрическая проницаемость (ε_eff):</span>
                <strong className="launch-metric-value">{rfResult.erEff}</strong>
              </div>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Фазовая скорость распространения:</span>
                <strong className="launch-metric-value">{rfResult.phaseVelocityPercentC}% c ({rfResult.phaseVelocityKmPerS} км/с)</strong>
              </div>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Погонная индуктивность / емкость:</span>
                <strong className="launch-metric-value">{rfResult.inductanceNhPerMm} нГн/мм · {rfResult.capacitancePfPerMm} пФ/мм</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 2. Trace Current & Thermal Limit Calculator                         */}
      {/* =================================================================== */}
      {activeUtilTab === 'current' && (
        <div className="dt-panel-card launch-util-card">
          <div className="launch-util-header">
            <h3>Расчёт ширины проводника по допустимому току и нагреву</h3>
            <p className="launch-util-sub">
              Расчёт допустимой токовой нагрузки печатных проводников по стандартам ГОСТ 23751-86, IPC-2152 и IPC-2221.
              Оценка тепловыделения, омических потерь и падения напряжения в сильноточных цепях питания.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button
              type="button"
              className={`dt-btn ${curMode === 'current_to_width' ? 'primary' : ''}`}
              onClick={() => setCurMode('current_to_width')}
            >
              Расчёт ширины по току (I → W)
            </button>
            <button
              type="button"
              className={`dt-btn ${curMode === 'width_to_current' ? 'primary' : ''}`}
              onClick={() => setCurMode('width_to_current')}
            >
              Допустимый ток по ширине (W → I_max)
            </button>
          </div>

          <div className="launch-util-body-grid">
            <div className="launch-util-form">
              {curMode === 'current_to_width' ? (
                <label className="launch-input-row">
                  <span className="launch-input-label">Рабочий ток (Амперы):</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0.01"
                    max="100.0"
                    className="dt-input"
                    value={curInput.currentAmps}
                    onChange={(e) => setCurInput({ ...curInput, currentAmps: Math.max(0.01, parseFloat(e.target.value) || 0.1) })}
                  />
                </label>
              ) : (
                <label className="launch-input-row">
                  <span className="launch-input-label">Ширина проводника на плате (мм):</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    max="50.0"
                    className="dt-input"
                    value={inputWidthMm}
                    onChange={(e) => setInputWidthMm(Math.max(0.05, parseFloat(e.target.value) || 0.1))}
                  />
                </label>
              )}

              <label className="launch-input-row">
                <span className="launch-input-label">Допустимый перегрев проводника (ΔT, °C):</span>
                <select
                  className="dt-select"
                  value={curInput.tempRiseC}
                  onChange={(e) => setCurInput({ ...curInput, tempRiseC: parseFloat(e.target.value) })}
                >
                  <option value={10}>10 °C (рекомендуется для надёжности / ГОСТ)</option>
                  <option value={20}>20 °C (номинальный режим аппаратуры)</option>
                  <option value={30}>30 °C (плотный монтаж блоков)</option>
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
                  <option value={105}>105 мкм (3.0 oz - сильноточные модули)</option>
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

              <label className="launch-input-row">
                <span className="launch-input-label">Длина проводника для расчёта потерь (мм):</span>
                <input
                  type="number"
                  step="5"
                  min="5"
                  max="1000"
                  className="dt-input"
                  value={curInput.traceLengthMm ?? 100}
                  onChange={(e) => setCurInput({ ...curInput, traceLengthMm: Math.max(5, parseFloat(e.target.value) || 100) })}
                />
              </label>
            </div>

            <div className="launch-util-results">
              <h4>Результаты по ГОСТ 23751 / IPC-2221</h4>

              {curMode === 'width_to_current' ? (
                <div className="launch-metric-box">
                  <span className="launch-metric-title">Максимальный длительный ток:</span>
                  <strong className="launch-metric-value">{maxCurrentForWidth} А</strong>
                </div>
              ) : (
                <div className="launch-metric-box">
                  <span className="launch-metric-title">Минимальная ширина проводника:</span>
                  <strong className="launch-metric-value">{curResult.requiredWidthMm} мм ({curResult.requiredWidthMil} mil)</strong>
                </div>
              )}

              <div className="launch-metric-box">
                <span className="launch-metric-title">Сечение проводника:</span>
                <strong className="launch-metric-value">{curResult.crossSectionMm2} мм²</strong>
              </div>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Падение напряжения на длине {curInput.traceLengthMm ?? 100} мм:</span>
                <strong className="launch-metric-value">{curResult.voltageDropMvPer100mm} мВ</strong>
              </div>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Омическое сопротивление проводника:</span>
                <strong className="launch-metric-value">{curResult.resistanceOhmPer100mm} Ом</strong>
              </div>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Тепловая мощность рассеяния (I²R):</span>
                <strong className="launch-metric-value">{curResult.powerDissipationWPer100mm} Вт</strong>
              </div>
              <div className="launch-metric-box">
                <span className="launch-metric-title">Плотность тока (J):</span>
                <strong className="launch-metric-value">
                  {curResult.currentDensityAPerMm2} А/мм²{' '}
                  <span style={{ fontSize: 10, color: curResult.gostCompliant ? '#5cb85c' : '#d9534f' }}>
                    ({curResult.gostCompliant ? '✓ Норма ГОСТ 23751' : '⚠ Выше рекомендованного предела'})
                  </span>
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 3. SMD Resistor Marking Code Decoder & Synthesizer                  */}
      {/* =================================================================== */}
      {activeUtilTab === 'smd' && <SmdResistorCalculator />}

      {/* =================================================================== */}
      {/* 4. Capacitor Marking Decoder & Reactance Calculator                 */}
      {/* =================================================================== */}
      {activeUtilTab === 'cap' && <CapacitorCalculator />}

      {/* =================================================================== */}
      {/* 5. High-Speed PCB Via Parasitics Calculator                         */}
      {/* =================================================================== */}
      {activeUtilTab === 'via' && <ViaCalculator />}

      {/* =================================================================== */}
      {/* 6. Precision 555 Timer Calculator (Astable & Monostable)            */}
      {/* =================================================================== */}
      {activeUtilTab === 'timer555' && <Timer555Calculator />}

      {/* =================================================================== */}
      {/* 7. Resistive Voltage Divider & E24 Resistor Pair Synthesizer        */}
      {/* =================================================================== */}
      {activeUtilTab === 'divider' && <VoltageDividerCalculator />}

      {/* =================================================================== */}
      {/* 8. ECAD Unit Converter (Length, Copper, Temperature)                */}
      {/* =================================================================== */}
      {activeUtilTab === 'converter' && <UnitConverterCalculator />}

      {/* =================================================================== */}
      {/* 9. IPC-7351 Parametric Pattern Generator                            */}
      {/* =================================================================== */}
      {activeUtilTab === 'ipc' && (
        <div className="dt-panel-card launch-util-card">
          <div className="launch-util-header">
            <h3>Параметрический генератор посадочных мест (IPC-7351)</h3>
            <p className="launch-util-sub">
              Автоматическое построение контактных площадок SMD/THT компонентов с тремя уровнями плотности монтажа
              (A - максимальный, B - номинальный, C - компактный) и сохранением в локальную библиотеку.
            </p>
          </div>

          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Типовой корпус (готовый профиль):
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {PACKAGE_PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="dt-btn"
                  style={{ fontSize: 10.5, padding: '2px 6px' }}
                  onClick={() => applyPreset(p)}
                >
                  {p.label}
                </button>
              ))}
            </div>
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
                    const matching = PACKAGE_PRESETS.find((p) => p.family === f);
                    if (matching) applyPreset(matching);
                    else setIpcName(`${f}-${f === 'SOIC' ? 8 : f === 'QFP' ? 32 : 16}`);
                  }}
                >
                  <option value="SOIC">SOIC / SOP (микросхема)</option>
                  <option value="QFP">QFP / TQFP (четырёхсторонний SMD)</option>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
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
                  <span className="launch-input-label">Шаг выводов (мм):</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    max="5.0"
                    className="dt-input"
                    value={ipcPitch}
                    onChange={(e) => setIpcPitch(parseFloat(e.target.value) || 1.27)}
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <label className="launch-input-row">
                  <span className="launch-input-label">Пролёт рядов (мм):</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="50.0"
                    className="dt-input"
                    value={ipcRowSpacing}
                    onChange={(e) => setIpcRowSpacing(parseFloat(e.target.value) || 5.8)}
                  />
                </label>
                <label className="launch-input-row">
                  <span className="launch-input-label">Уровень плотности:</span>
                  <select
                    className="dt-select"
                    value={ipcDensity}
                    onChange={(e) => setIpcDensity(e.target.value as 'A' | 'B' | 'C')}
                  >
                    <option value="B">Level B (Номинальный)</option>
                    <option value="A">Level A (Максимальный)</option>
                    <option value="C">Level C (Минимальный)</option>
                  </select>
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <label className="launch-input-row">
                  <span className="launch-input-label">Ширина площадки (мм):</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="10.0"
                    className="dt-input"
                    value={ipcPadWidth}
                    onChange={(e) => setIpcPadWidth(parseFloat(e.target.value) || 0.6)}
                  />
                </label>
                <label className="launch-input-row">
                  <span className="launch-input-label">Длина площадки (мм):</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="10.0"
                    className="dt-input"
                    value={ipcPadHeight}
                    onChange={(e) => setIpcPadHeight(parseFloat(e.target.value) || 1.5)}
                  />
                </label>
              </div>

              {ipcFamily === 'DIP' && (
                <label className="launch-input-row">
                  <span className="launch-input-label">Диаметр отверстия сверловки (мм):</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0.4"
                    max="5.0"
                    className="dt-input"
                    value={ipcHoleDiameter || 0.85}
                    onChange={(e) => setIpcHoleDiameter(parseFloat(e.target.value) || 0.85)}
                  />
                </label>
              )}

              {ipcFamily === 'QFN' && (
                <label className="launch-input-row">
                  <span className="launch-input-label">Размер Thermal Pad (мм):</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="20.0"
                    className="dt-input"
                    value={ipcThermalPadSize}
                    onChange={(e) => setIpcThermalPadSize(parseFloat(e.target.value) || 0)}
                  />
                </label>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <label className="launch-input-row">
                  <span className="launch-input-label">Ширина тела (мм):</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="50.0"
                    className="dt-input"
                    value={ipcBodyWidth}
                    onChange={(e) => setIpcBodyWidth(parseFloat(e.target.value) || 3.9)}
                  />
                </label>
                <label className="launch-input-row">
                  <span className="launch-input-label">Длина тела (мм):</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="50.0"
                    className="dt-input"
                    value={ipcBodyLength}
                    onChange={(e) => setIpcBodyLength(parseFloat(e.target.value) || 4.9)}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button
                  type="button"
                  className="dt-btn primary launch-ipc-save-btn"
                  style={{ flex: 1 }}
                  onClick={handleSavePattern}
                >
                  {savedSuccess ? <IconCheck size={15} /> : <IconDeviceFloppy size={15} />}
                  <span>{savedSuccess ? 'Сохранено в библиотеку!' : 'Сгенерировать и сохранить'}</span>
                </button>
                {onSwitchModule && (
                  <button
                    type="button"
                    className="dt-btn"
                    title="Сохранить и открыть в Редакторе посадочных мест"
                    onClick={handleOpenInPatternEditor}
                  >
                    <IconExternalLink size={15} />
                    <span>В редактор</span>
                  </button>
                )}
              </div>
            </div>

            <div className="launch-util-results">
              <h4>Интерактивный чертёж и параметры</h4>
              <div style={{ display: 'flex', justifyContent: 'center', background: '#181b20', borderRadius: 4, padding: 6, marginBottom: 8 }}>
                <canvas
                  ref={previewCanvasRef}
                  width={280}
                  height={200}
                  style={{ maxWidth: '100%', height: 'auto', border: '1px solid #272c35' }}
                />
              </div>

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
              <div className="launch-metric-box">
                <span className="launch-metric-title">Габариты площадки:</span>
                <strong className="launch-metric-value">{generatedPattern.pads[0]?.width ?? 0} × {generatedPattern.pads[0]?.height ?? 0} мм</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
