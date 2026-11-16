import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PcbProject, Point2D } from '../../../../../core/types';
import { pickCadFile, saveBinaryFile, saveTextFile } from '../../../../../core/utils/fileIo';
import {
  exportGerberZipBytes,
  GerberInspectionSummary,
  inspectGerberProjectOrBytes
} from '../../../../../engines/camBundle';
import { DxfExportOptions, exportExcellonDrill, exportPcbDxf, exportPcbSvg1to1 } from '../../../../../engines/camExport';
import {
  DEFAULT_GCODE_OPTIONS,
  GCodeOptions,
  GCodePostprocessor,
  generatePcbGCode
} from '../../../../../engines/gcodeGenerator';
import { GerberPreviewBox } from './GerberPreviewBox';

export interface PcbCamDialogProps {
  pcb: PcbProject;
  gerberFiles: Record<string, string>;
  gerberNames: string[];
  previewGerberFile: string;
  setPreviewGerberFile: (fn: string) => void;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  onClose: () => void;
}

type CamTab = 'gerber' | 'excellon' | 'lut' | 'dxf' | 'gcode';

/** Interactive CAM export workbench: Gerber RS-274X/X2 + ZIP + Multi-Layer Viewer, Excellon, ЛУТ SVG 1:1, DXF Layers/Units, and CNC G-Code. */
export const PcbCamDialog: React.FC<PcbCamDialogProps> = ({
  pcb,
  gerberFiles,
  gerberNames,
  previewGerberFile,
  setPreviewGerberFile,
  setStatusMessage,
  onClose
}) => {
  const [tab, setTab] = useState<CamTab>('gerber');
  const [x2Attributes, setX2Attributes] = useState(true);
  const [includeDrills, setIncludeDrills] = useState(true);
  const [compositeView, setCompositeView] = useState(true);
  const [lutLayer, setLutLayer] = useState<'TopCopper' | 'BottomCopper'>('BottomCopper');
  const [lutMirror, setLutMirror] = useState(true);
  const [externalInspect, setExternalInspect] = useState<GerberInspectionSummary | null>(null);
  const [projectInspect, setProjectInspect] = useState<GerberInspectionSummary | null>(null);

  const activeGerberFile = useMemo(
    () => (previewGerberFile && gerberFiles[previewGerberFile] ? previewGerberFile : (gerberNames.find((n) => /\.GTL$/i.test(n)) ?? gerberNames[0] ?? '')),
    [previewGerberFile, gerberFiles, gerberNames]
  );

  useEffect(() => {
    if (!previewGerberFile && activeGerberFile) {
      setPreviewGerberFile(activeGerberFile);
    }
  }, [previewGerberFile, activeGerberFile, setPreviewGerberFile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>({
    boardOutline: true,
    bottomCopper: true,
    topCopper: true,
    topMask: true,
    bottomMask: false,
    topSilk: true,
    drill: true
  });

  // DXF options (Lab 1)
  const [dxfOpts, setDxfOpts] = useState<DxfExportOptions>({
    units: 'mm',
    scale: 1,
    layers: {
      outline: true,
      cutouts: true,
      drills: true,
      topCopper: true,
      bottomCopper: true,
      topSilk: false,
      bottomSilk: false
    }
  });

  // G-Code CNC options (Lab 1)
  const [gcodeOpts, setGcodeOpts] = useState<GCodeOptions>(DEFAULT_GCODE_OPTIONS);
  const gcodeCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let active = true;
    inspectGerberProjectOrBytes(pcb, x2Attributes).then((summary) => {
      if (active) setProjectInspect(summary);
    });
    return () => { active = false; };
  }, [pcb, x2Attributes]);

  const activeInspect = externalInspect ?? projectInspect;
  const gcodeResult = useMemo(() => generatePcbGCode(pcb, gcodeOpts), [pcb, gcodeOpts]);
  const dxfPreview = useMemo(() => exportPcbDxf(pcb, dxfOpts), [pcb, dxfOpts]);
  const excellonText = useMemo(() => exportExcellonDrill(pcb), [pcb]);
  const lutSvg = useMemo(() => exportPcbSvg1to1(pcb, lutLayer, lutMirror), [pcb, lutLayer, lutMirror]);

  // Draw G-Code CNC toolpath canvas when G-code tab is active
  useEffect(() => {
    if (tab !== 'gcode') return;
    const canvas = gcodeCanvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth || 440;
    const h = canvas.clientHeight || 240;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0b101b';
    ctx.fillRect(0, 0, w, h);

    const pts: Point2D[] = [...pcb.boardOutline];
    gcodeResult.segments.forEach((s) => {
      pts.push(s.p1, s.p2);
    });
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = xs.length ? Math.min(...xs) - 5 : 0;
    const maxX = xs.length ? Math.max(...xs) + 5 : 100;
    const minY = ys.length ? Math.min(...ys) - 5 : 0;
    const maxY = ys.length ? Math.max(...ys) + 5 : 70;
    const sc = Math.min((w - 20) / Math.max(10, maxX - minX), (h - 20) / Math.max(10, maxY - minY));
    const toPx = (p: Point2D) => ({
      x: 10 + (p.x - minX) * sc,
      y: 10 + (p.y - minY) * sc
    });

    for (const seg of gcodeResult.segments) {
      const a = toPx(seg.p1);
      const b = toPx(seg.p2);
      if (seg.kind === 'drill') {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.setLineDash(seg.rapid ? [3, 4] : []);
      ctx.strokeStyle = seg.rapid ? 'rgba(239,68,68,0.45)' : seg.kind === 'outline' ? '#facc15' : '#22d3ee';
      ctx.lineWidth = seg.rapid ? 0.8 : 1.4;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }, [tab, pcb, gcodeResult]);

  const handleExportGerberZip = async () => {
    const zipBytes = exportGerberZipBytes(pcb, x2Attributes, includeDrills);
    const saved = await saveBinaryFile(`${pcb.projectName}_Gerber.zip`, zipBytes, [
      { name: 'ZIP-архив Gerber+Excellon', extensions: ['zip'] }
    ]);
    if (saved) setStatusMessage(`Экспортирован архив Gerber + Excellon: ${saved}`);
  };

  const handleExportGerberFolder = async () => {
    const picker = (window as unknown as {
      showDirectoryPicker?: () => Promise<{
        name: string;
        getFileHandle: (
          name: string,
          opts: { create: boolean }
        ) => Promise<{
          createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
        }>;
      }>;
    }).showDirectoryPicker;
    if (picker) {
      try {
        const dirHandle = await picker();
        const names = Object.keys(gerberFiles);
        for (const name of names) {
          const fh = await dirHandle.getFileHandle(name, { create: true });
          const writable = await fh.createWritable();
          await writable.write(gerberFiles[name]);
          await writable.close();
        }
        setStatusMessage(`CAM Gerber & Excellon экспортировано (${names.length} файлов в папку ${dirHandle.name}).`);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          await handleExportGerberZip();
        }
      }
      return;
    }
    await handleExportGerberZip();
  };

  const handleInspectExternalGerber = async () => {
    const picked = await pickCadFile('.zip,.gbr,.gtl,.gbl,.gko,.gto,.gts,.gbs,.drl,.xln', [
      { name: 'Gerber / ZIP / Excellon', extensions: ['zip', 'gbr', 'gtl', 'gbl', 'gko', 'drl', 'xln'] }
    ]);
    if (!picked) return;
    const summary = await inspectGerberProjectOrBytes(pcb, x2Attributes, picked.bytes, picked.name);
    const nextVis: Record<string, boolean> = {};
    summary.layers.forEach((l) => { nextVis[l.key] = true; });
    setVisibleLayers(nextVis);
    setExternalInspect(summary);
    setCompositeView(true);
    setStatusMessage(`Gerber Viewer загрузил внешний файл: ${picked.name} (слоёв: ${summary.layers.length})`);
  };

  const handleExportDxf = async () => {
    const saved = await saveTextFile(`${pcb.projectName}.dxf`, dxfPreview, [{ name: 'AutoCAD DXF', extensions: ['dxf'] }]);
    if (saved) setStatusMessage(`Экспортирован DXF (${dxfOpts.units}, масштаб ${dxfOpts.scale}): ${saved}`);
  };

  const handleExportGCode = async () => {
    const saved = await saveTextFile(`${pcb.projectName}_${gcodeOpts.postprocessor}.nc`, gcodeResult.gcode, [
      { name: 'ЧПУ G-Code', extensions: ['nc', 'gcode', 'tap'] }
    ]);
    if (saved) setStatusMessage(`Экспортирован G-Code (${gcodeOpts.postprocessor}, ${gcodeResult.stats.lineCount} кадров): ${saved}`);
  };

  return (
    <div className="dt-modal-backdrop" onClick={onClose}>
      <div className="dt-modal" style={{ width: 820, maxWidth: '95vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="dt-modal-title">
          <strong>Производственные файлы (Gerber RS-274X/X2 / ZIP / Viewer / DXF / G-Code) — {pcb.projectName}</strong>
          <button type="button" className="dt-btn" onClick={onClose} style={{ minWidth: 24, padding: '0 6px' }}>×</button>
        </div>

        <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Tab Switcher */}
          <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #c0c0c0', paddingBottom: 6, flexWrap: 'wrap' }}>
            <button type="button" className={`dt-btn ${tab === 'gerber' ? 'primary' : ''}`} onClick={() => setTab('gerber')}>
              1. Gerber RS-274X/X2
            </button>
            <button type="button" className={`dt-btn ${tab === 'excellon' ? 'primary' : ''}`} onClick={() => setTab('excellon')}>
              2. Сверловка Excellon
            </button>
            <button type="button" className={`dt-btn ${tab === 'lut' ? 'primary' : ''}`} onClick={() => setTab('lut')}>
              3. ЛУТ SVG 1:1
            </button>
            <button type="button" className={`dt-btn ${tab === 'dxf' ? 'primary' : ''}`} onClick={() => setTab('dxf')}>
              4. Экспорт DXF
            </button>
            <button type="button" className={`dt-btn ${tab === 'gcode' ? 'primary' : ''}`} onClick={() => setTab('gcode')}>
              5. ЧПУ G-Code
            </button>
          </div>

          {tab === 'gerber' && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', fontSize: 11.5 }}>
                <label><input type="checkbox" checked={x2Attributes} onChange={(e) => setX2Attributes(e.target.checked)} /> Атрибуты Gerber X2</label>
                <label><input type="checkbox" checked={includeDrills} onChange={(e) => setIncludeDrills(e.target.checked)} /> Включить сверловку Excellon (.drl)</label>
                <label><input type="checkbox" checked={compositeView} onChange={(e) => setCompositeView(e.target.checked)} /> Все слои вместе (Gerber Viewer)</label>
                {!compositeView && (
                  <select className="dt-select" value={activeGerberFile} onChange={(e) => setPreviewGerberFile(e.target.value)}>
                    {gerberNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
                {externalInspect && (
                  <button type="button" className="dt-btn" onClick={() => setExternalInspect(null)}>
                    ← Вернуть плату проекта
                  </button>
                )}
              </div>

              {compositeView && activeInspect && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, background: '#ffffff', padding: '5px 8px', border: '1px solid #c8c8c8' }}>
                  {activeInspect.layers.map((l) => (
                    <label key={l.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="checkbox"
                        checked={visibleLayers[l.key] !== false}
                        onChange={(e) => setVisibleLayers((v) => ({ ...v, [l.key]: e.target.checked }))}
                      />
                      <span style={{ display: 'inline-block', width: 9, height: 9, background: l.color, border: '1px solid #333' }} />
                      {l.label}
                    </label>
                  ))}
                </div>
              )}

              <GerberPreviewBox
                gerberContent={gerberFiles[activeGerberFile] ?? ''}
                outline={pcb.boardOutline}
                multiLayerSummary={activeInspect}
                visibleLayers={visibleLayers}
                showComposite={compositeView}
              />

              <div style={{ fontSize: 11.5, background: '#e5f1fb', border: '1px solid #99d1ff', padding: '5px 8px', display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  Размер: <b>{activeInspect?.widthMm ?? 0} × {activeInspect?.heightMm ?? 0} мм</b> · Слоёв: <b>{activeInspect?.layers.length ?? 0}</b>
                </span>
                <span>
                  Отверстий: <b>{activeInspect?.drillCount ?? 0}</b> · Свёрла: <b>{activeInspect?.uniqueDrillSizes.join(', ') || '—'} мм</b>
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="dt-btn primary" onClick={handleExportGerberZip}>
                  📦 Скачать Gerber + Drill (.zip)...
                </button>
                <button type="button" className="dt-btn" onClick={handleExportGerberFolder}>
                  📁 Экспортировать в папку...
                </button>
                <button type="button" className="dt-btn" onClick={handleInspectExternalGerber}>
                  🔍 Открыть Gerber / ZIP для проверки...
                </button>
              </div>
            </>
          )}

          {tab === 'excellon' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 10 }}>
                <div style={{ background: '#fff', border: '1px solid #c0c0c0', padding: 8, fontSize: 11.5 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Таблица свёрл Excellon (METRIC,TZ):</div>
                  <div>Всего отверстий: <b>{activeInspect?.drillCount ?? 0}</b></div>
                  <div style={{ marginTop: 6 }}>
                    {(activeInspect?.uniqueDrillSizes ?? []).length === 0 ? (
                      <span style={{ color: '#666' }}>Отверстий на плате нет</span>
                    ) : (
                      activeInspect!.uniqueDrillSizes.map((dia, i) => (
                        <div key={dia} style={{ padding: '2px 0', borderBottom: '1px solid #eee' }}>
                          <b>T{String(i + 1).padStart(2, '0')}</b> — Ø {dia} мм
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <textarea readOnly className="dt-input" style={{ height: 240, fontFamily: 'monospace', fontSize: 11, resize: 'none' }} value={excellonText} />
              </div>
              <div>
                <button
                  type="button"
                  className="dt-btn primary"
                  onClick={async () => {
                    const saved = await saveTextFile(`${pcb.projectName || 'board'}.drl`, excellonText, [{ name: 'Excellon N/C Drill', extensions: ['drl'] }]);
                    if (saved) setStatusMessage(`Файл сверловки Excellon сохранён: ${saved}`);
                  }}
                >
                  Сохранить Excellon (.drl)...
                </button>
              </div>
            </>
          )}

          {tab === 'lut' && (
            <>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 11.5, flexWrap: 'wrap' }}>
                <label>
                  Слой шаблона 1:1:{' '}
                  <select
                    className="dt-select"
                    value={lutLayer}
                    onChange={(e) => {
                      const lay = e.target.value as 'TopCopper' | 'BottomCopper';
                      setLutLayer(lay);
                      setLutMirror(lay === 'BottomCopper');
                    }}
                  >
                    <option value="BottomCopper">Нижняя медь (BottomCopper)</option>
                    <option value="TopCopper">Верхняя медь (TopCopper)</option>
                  </select>
                </label>
                <label>
                  <input type="checkbox" checked={lutMirror} onChange={(e) => setLutMirror(e.target.checked)} /> Зеркалить по X (для ЛУТ / термопереноса)
                </label>
              </div>
              <div style={{ background: '#e5e7eb', border: '1px solid #94a3b8', padding: 8, textAlign: 'center', maxHeight: 280, overflow: 'auto' }}>
                <img
                  alt="Фотошаблон ЛУТ SVG 1:1"
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(lutSvg)}`}
                  style={{ maxWidth: '100%', maxHeight: 256, background: '#fff', border: '1px solid #333' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="dt-btn primary"
                  onClick={async () => {
                    const suffix = lutLayer === 'BottomCopper' ? 'Bottom' : 'Top';
                    const saved = await saveTextFile(`${pcb.projectName || 'board'}_${suffix}_1to1.svg`, lutSvg, [{ name: 'SVG 1:1 Фотошаблон', extensions: ['svg'] }]);
                    if (saved) setStatusMessage(`Фотошаблон 1:1 сохранён в SVG: ${saved}`);
                  }}
                >
                  Сохранить фотошаблон ЛУТ SVG (1:1)...
                </button>
              </div>
            </>
          )}

          {tab === 'dxf' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: '#ffffff', border: '1px solid #c0c0c0', padding: 10, fontSize: 11.5 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Слои экспорта DXF (AutoCAD / CAM):</div>
                  {(
                    [
                      ['outline', 'Контур платы (BOARD_OUTLINE)'],
                      ['cutouts', 'Внутренние вырезы (CUTOUTS)'],
                      ['drills', 'Отверстия и переходы (DRILL)'],
                      ['topCopper', 'Верхняя медь: дорожки и КП (TOP_COPPER)'],
                      ['bottomCopper', 'Нижняя медь: дорожки и КП (BOTTOM_COPPER)'],
                      ['topSilk', 'Шелкография верх (TOPSILK)'],
                      ['bottomSilk', 'Шелкография низ (BOTTOMSILK)']
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} style={{ display: 'block', marginBottom: 4 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(dxfOpts.layers?.[key])}
                        onChange={(e) =>
                          setDxfOpts((o) => ({ ...o, layers: { ...o.layers, [key]: e.target.checked } }))
                        }
                      />{' '}
                      {label}
                    </label>
                  ))}
                </div>

                <div style={{ background: '#ffffff', border: '1px solid #c0c0c0', padding: 10, fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontWeight: 700 }}>Единицы и масштаб чертежа:</div>
                  <label>
                    Единицы DXF ($INSUNITS):{' '}
                    <select
                      className="dt-select"
                      value={dxfOpts.units}
                      onChange={(e) => setDxfOpts((o) => ({ ...o, units: e.target.value as 'mm' | 'in' }))}
                    >
                      <option value="mm">Миллиметры (mm)</option>
                      <option value="in">Дюймы (in)</option>
                    </select>
                  </label>
                  <label>
                    Коэффициент масштабирования:{' '}
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="100"
                      className="dt-input"
                      style={{ width: 80 }}
                      value={dxfOpts.scale ?? 1}
                      onChange={(e) => setDxfOpts((o) => ({ ...o, scale: Math.max(0.05, Number(e.target.value) || 1) }))}
                    />
                  </label>
                  <div style={{ fontSize: 11, color: '#334155', marginTop: 4 }}>
                    Примитивов в DXF: <b>{dxfPreview.split('\n0\nLINE').length + dxfPreview.split('\n0\nCIRCLE').length - 2}</b> · Размер текста: <b>{dxfPreview.length} байт</b>
                  </div>
                </div>
              </div>
              <div>
                <button type="button" className="dt-btn primary" onClick={handleExportDxf}>
                  Сохранить .DXF...
                </button>
              </div>
            </>
          )}

          {tab === 'gcode' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr', gap: 10 }}>
                <div style={{ background: '#ffffff', border: '1px solid #c0c0c0', padding: 8, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label>
                    Постпроцессор:{' '}
                    <select
                      className="dt-select"
                      value={gcodeOpts.postprocessor}
                      onChange={(e) => setGcodeOpts((o) => ({ ...o, postprocessor: e.target.value as GCodePostprocessor }))}
                    >
                      <option value="GRBL">GRBL 1.1</option>
                      <option value="Mach3">Mach3 CNC</option>
                      <option value="LinuxCNC">LinuxCNC</option>
                    </select>
                  </label>
                  <label>Диаметр гравера (мм): <input type="number" step="0.05" className="dt-input" style={{ width: 65 }} value={gcodeOpts.toolDiameterMm} onChange={(e) => setGcodeOpts((o) => ({ ...o, toolDiameterMm: Number(e.target.value) || 0.3 }))} /></label>
                  <label>Глубина гравировки (мм): <input type="number" step="0.02" className="dt-input" style={{ width: 65 }} value={gcodeOpts.engraveDepth} onChange={(e) => setGcodeOpts((o) => ({ ...o, engraveDepth: Number(e.target.value) || 0.12 }))} /></label>
                  <label>Глубина обрезки (мм): <input type="number" step="0.1" className="dt-input" style={{ width: 65 }} value={gcodeOpts.cutDepth} onChange={(e) => setGcodeOpts((o) => ({ ...o, cutDepth: Number(e.target.value) || 1.65 }))} /></label>
                  <label>Подача X/Y (мм/мин): <input type="number" step="10" className="dt-input" style={{ width: 65 }} value={gcodeOpts.feedRateMmMin} onChange={(e) => setGcodeOpts((o) => ({ ...o, feedRateMmMin: Number(e.target.value) || 180 }))} /></label>
                  <label><input type="checkbox" checked={gcodeOpts.millTopIsolation} onChange={(e) => setGcodeOpts((o) => ({ ...o, millTopIsolation: e.target.checked }))} /> Изоляция верх (Top)</label>
                  <label><input type="checkbox" checked={gcodeOpts.millBottomIsolation} onChange={(e) => setGcodeOpts((o) => ({ ...o, millBottomIsolation: e.target.checked }))} /> Изоляция низ (Bottom)</label>
                  <label><input type="checkbox" checked={gcodeOpts.mirrorBottomX} onChange={(e) => setGcodeOpts((o) => ({ ...o, mirrorBottomX: e.target.checked }))} /> Зеркалить X для Bottom</label>
                  <label><input type="checkbox" checked={gcodeOpts.drillHoles} onChange={(e) => setGcodeOpts((o) => ({ ...o, drillHoles: e.target.checked }))} /> Сверловка отверстий</label>
                  <label><input type="checkbox" checked={gcodeOpts.cutOutline} onChange={(e) => setGcodeOpts((o) => ({ ...o, cutOutline: e.target.checked }))} /> Обрезка контура</label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <canvas ref={gcodeCanvasRef} style={{ width: '100%', height: 240, border: '1px solid #475569' }} />
                  <div style={{ fontSize: 11, background: '#e5f1fb', border: '1px solid #99d1ff', padding: '4px 8px' }}>
                    Кадров G-Code: <b>{gcodeResult.stats.lineCount}</b> · Контуров: <b>{gcodeResult.stats.isolationLoops}</b> · Сверловок: <b>{gcodeResult.stats.drillCount}</b> · Путь: <b>{gcodeResult.stats.totalLengthMm} мм</b> (~{gcodeResult.stats.estimatedMinutes} мин)
                  </div>
                </div>
              </div>
              <div>
                <button type="button" className="dt-btn primary" onClick={handleExportGCode}>
                  Сохранить G-Code (.nc / .gcode)...
                </button>
              </div>
            </>
          )}
        </div>

        <div className="dt-modal-footer">
          <button type="button" className="dt-btn" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
};
