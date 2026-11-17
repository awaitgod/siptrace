import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PcbTrace, PcbVia, Point2D, Units } from '../../../core/types';
import { dist, uid } from '../../../core/geometry';
import { snapPoint } from '../../../core/units';
import {
  broadcastEdaEvent,
  consumePendingConversionReport,
  createProjectFromOptions,
  getUserPatternLibraries,
  NewProjectOptions,
  openAppModule,
  recordRecentProject,
  saveActivePcb,
  saveHotkeys,
  subscribeEdaEvents
} from '../../../core/store';
import { GOST_PATTERN_LIBRARIES, findPatternById } from '../../../gost/libraries/gostPatterns';
import { computeUnroutedRatlines, getWorldPads } from '../../../engines/drc';
import { updateAllCopperPours } from '../../../engines/copperPour';
import { AutorouterReport, DEFAULT_AUTOROUTER_SETTINGS, runAutorouter } from '../../../engines/autorouter';
import { runAutoplacer } from '../../../engines/autoplacer';
import { GostConversionReport, importCadPcb, serializePcb } from '../../../engines/importers';
import { clearSavedFileHandle, nativeCadFilename, pickCadFile, saveTextFile } from '../../../core/utils/fileIo';
import { GostConversionDialog } from '../../components/GostConversionDialog';
import { NewProjectDialog } from '../../components/NewProjectDialog';
import { MenuBar } from '../../components/MenuBar';
import { StatusBar } from '../../components/StatusBar';
import { HotkeySettingsDialog } from '../../components/CommonDialogs';
import { renderPcbCanvas } from './canvas/renderPcbCanvas';
import { PcbLeftSidebar } from './components/PcbLeftSidebar';
import { PcbRightSidebar } from './components/PcbRightSidebar';
import { PcbToolbar } from './components/PcbToolbar';
import { PcbAutorouteBanner } from './components/dialogs/PcbAutorouteBanner';
import { PcbBoardWizardDialog } from './components/dialogs/PcbBoardWizardDialog';
import { PcbCamDialog } from './components/dialogs/PcbCamDialog';
import { PcbCompareDialog } from './components/dialogs/PcbCompareDialog';
import { PcbCopperPourDialog } from './components/dialogs/PcbCopperPourDialog';
import { PcbPanelizeDialog } from './components/dialogs/PcbPanelizeDialog';
import { PcbRfCalcDialog } from './components/dialogs/PcbRfCalcDialog';
import { PcbRulesDialog } from './components/dialogs/PcbRulesDialog';
import { usePcbHotkeys } from './hooks/usePcbHotkeys';
import { NO_DRC_ISSUES, usePcbDrcReport } from './hooks/usePcbDrcReport';
import { usePcbProjectState } from './hooks/usePcbProjectState';
import { usePcbCanvasInteraction } from './interactions/usePcbCanvasInteraction';
import { createPcbTopMenus } from './menus/pcbMenuSpec';
import { buildViaStitchingVias, PcbCopperPourSettings } from './services/pcbActionsService';
import { isInnerCopperLayer } from './services/pcbLayerStack';
import { CopperLayerId, MeasureRulerState, PcbExtraSelection, PcbToolId } from './types';

/** Thin Enterprise composition root for the PCB Layout & Autorouter Editor. */
export const PcbModule: React.FC<{ onSwitchModule?: (m: any) => void }> = ({ onSwitchModule }) => {
  const [statusMessage, setStatusMessage] = useState('Готово. Проектирование ПП по ГОСТ 23751-86.');
  const {
    pcb,
    history,
    redoStack,
    isDirty,
    hotkeys,
    setHotkeys,
    userPatterns,
    commitPcb,
    pushUndoSnapshot,
    replacePcb,
    markPcbSaved,
    handleUndo,
    handleRedo
  } = usePcbProjectState(setStatusMessage);

  useEffect(() => {
    setStatusMessage('Готово. Проектирование ПП по ГОСТ 23751-86 (Класс ' + pcb.designRules.gostAccuracyClass + ').');
    // Set initial accuracy-class status once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Library sidebar state
  const allPatternLibs = useMemo(() => {
    return [...GOST_PATTERN_LIBRARIES, ...getUserPatternLibraries()];
  }, [userPatterns]);

  const [selectedPatLibId, setSelectedPatLibId] = useState(allPatternLibs[0]?.id ?? 'patlib_gost_passives');
  const [selectedLibPatId, setSelectedLibPatId] = useState(allPatternLibs[0]?.patterns[0]?.id ?? 'PAT_CHIP_2012M');

  // Tool & layer state
  const [activeLayer, setActiveLayer] = useState<CopperLayerId>('TopCopper');
  const [tool, setTool] = useState<PcbToolId>('select');
  const [showGrid, setShowGrid] = useState(true);
  const [showRatlines, setShowRatlines] = useState(true);
  const [routeElbowFlip, setRouteElbowFlip] = useState(false);

  // Interactive drafts & selection
  const [routeNetName, setRouteNetName] = useState('');
  const [routeDraftPts, setRouteDraftPts] = useState<Point2D[]>([]);
  const [polyDraftPts, setPolyDraftPts] = useState<Point2D[]>([]);
  const [measurePts, setMeasurePts] = useState<MeasureRulerState | null>(null);
  const [lineStartPt, setLineStartPt] = useState<Point2D | null>(null);
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedViaId, setSelectedViaId] = useState<string | null>(null);
  const [highlightedNet, setHighlightedNet] = useState<string | null>(null);

  // Right dock tabs & verification reports
  const [rightTopTab, setRightTopTab] = useState<'layers' | 'objects'>('layers');
  const [managerTab, setManagerTab] = useState<'components' | 'nets' | 'drc'>('components');
  const { report: drcReport, runDrc, clearDrc } = usePcbDrcReport(pcb);
  const drcErrors = drcReport.status === 'current' ? drcReport.issues : NO_DRC_ISSUES;
  const [autorouteReport, setAutorouteReport] = useState<AutorouterReport | null>(null);

  // Modals & modal drafts
  const [showRulesDialog, setShowRulesDialog] = useState(false);
  const [showPourDialog, setShowPourDialog] = useState(false);
  const [showCamDialog, setShowCamDialog] = useState(false);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [showRfDialog, setShowRfDialog] = useState(false);
  const [showPanelDialog, setShowPanelDialog] = useState(false);
  const [showHotkeysDialog, setShowHotkeysDialog] = useState(false);
  const [showBoardWizard, setShowBoardWizard] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showFindDialog, setShowFindDialog] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [selectedExtraObj, setSelectedExtraObj] = useState<PcbExtraSelection | null>(null);
  const [conversionReport, setConversionReport] = useState<GostConversionReport | null>(() => consumePendingConversionReport());
  useEffect(() => {
    if (pcb.layerCount === 4 || !isInnerCopperLayer(activeLayer)) return;
    setActiveLayer('TopCopper');
    setRouteDraftPts([]);
    setPolyDraftPts([]);
    setTool('select');
  }, [pcb.layerCount, activeLayer]);

  const [pourDraft, setPourDraft] = useState<PcbCopperPourSettings | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const cursorMmRef = useRef<Point2D>({ x: 0, y: 0 });

  // Derived topology
  const ratlines = useMemo(() => computeUnroutedRatlines(pcb), [pcb]);
  const worldPads = useMemo(() => getWorldPads(pcb), [pcb]);
  const netNames = useMemo(() => {
    const s = new Set<string>();
    for (const wp of worldPads) if (wp.netName) s.add(wp.netName);
    return Array.from(s).sort();
  }, [worldPads]);

  const previewPatternDef = useMemo(
    () => userPatterns.find((p) => p.id === selectedLibPatId) ?? findPatternById(selectedLibPatId) ?? null,
    [selectedLibPatId, userPatterns]
  );

  const activeLib = useMemo(
    () => allPatternLibs.find((l) => l.id === selectedPatLibId) ?? allPatternLibs[0],
    [allPatternLibs, selectedPatLibId]
  );

  // Domain actions
  const handleRunDrc = useCallback(() => {
    setStatusMessage(runDrc());
    setManagerTab('drc');
  }, [runDrc]);

  const handleAutoroute = useCallback(() => {
    const { pcb: routed, report } = runAutorouter(pcb, {
      ...DEFAULT_AUTOROUTER_SETTINGS,
      enableInnerLayers: pcb.layerCount === 4
    });
    const poured = updateAllCopperPours(routed);
    commitPcb(() => poured);
    setAutorouteReport(report);
    setStatusMessage(
      `Автотрассировка: разведено ${report.routedConnections}, не разведено ${report.failedConnections}, переходов ${report.addedVias} (${report.durationMs} мс).`
    );
  }, [pcb, commitPcb]);

  const handleAutoplace = useCallback(() => {
    const placed = runAutoplacer(pcb);
    commitPcb(() => placed);
    setStatusMessage(`Авторазмещение выполнено для ${placed.components.length} компонентов.`);
  }, [pcb, commitPcb]);

  const handleUpdatePours = useCallback(() => {
    commitPcb((p) => updateAllCopperPours(p));
    setStatusMessage('Заливки медного полигона обновлены с учётом зазоров и термобарьеров.');
  }, [commitPcb]);

  const handleApplyViaStitching = useCallback(() => {
    const vias = buildViaStitchingVias(pcb, worldPads);
    commitPcb((p) => updateAllCopperPours({ ...p, vias: [...p.vias, ...vias] }));
    setStatusMessage(`Добавлено ${vias.length} прошивных переходных отверстий (Via Stitching GND).`);
  }, [pcb, worldPads, commitPcb]);

  const switchCopperLayer = useCallback(
    (targetLayer: CopperLayerId) => {
      if (tool === 'copperPour' && targetLayer !== activeLayer) {
        setStatusMessage('Слой полигона задаётся перед рисованием. Завершите заливку или нажмите Esc.');
        return;
      }
      if (tool === 'routeManual' && routeDraftPts.length > 0 && targetLayer !== activeLayer) {
        const cur = snapPoint(cursorMmRef.current, pcb.gridSize);
        let segmentPts = routeDraftPts;
        const last = routeDraftPts[routeDraftPts.length - 1];
        let viaPt = last;
        if (dist(cur, last) > 0.25) {
          const dx = cur.x - last.x;
          const dy = cur.y - last.y;
          const minD = Math.min(Math.abs(dx), Math.abs(dy));
          const midPt: Point2D = routeElbowFlip
            ? { x: last.x + Math.sign(dx) * minD, y: last.y + Math.sign(dy) * minD }
            : { x: cur.x - Math.sign(dx) * minD, y: cur.y - Math.sign(dy) * minD };
          segmentPts = [
            ...routeDraftPts,
            ...(dist(midPt, last) > 0.05 && dist(midPt, cur) > 0.05 ? [midPt] : []),
            cur
          ];
          viaPt = cur;
        }
        const newTrace: PcbTrace = {
          id: uid('tr'),
          layer: activeLayer,
          netName: routeNetName,
          points: segmentPts,
          width: pcb.designRules.defaultTraceWidth
        };
        const newVia: PcbVia = {
          id: uid('via'),
          x: viaPt.x,
          y: viaPt.y,
          netName: routeNetName,
          outerDiameter: pcb.designRules.minViaOuter + 0.1,
          holeDiameter: pcb.designRules.minViaHole,
          startLayer: 'TopCopper',
          endLayer: 'BottomCopper',
          viaStyle: 'Through'
        };
        commitPcb((p) => ({
          ...p,
          traces: segmentPts.length >= 2 ? [...p.traces, newTrace] : p.traces,
          vias: [...p.vias, newVia]
        }));
        setRouteDraftPts([viaPt]);
        setStatusMessage(`Переход на слой ${targetLayer} — установлено переходное отверстие.`);
      }
      setActiveLayer(targetLayer);
    },
    [tool, routeDraftPts, activeLayer, routeNetName, routeElbowFlip, pcb.gridSize, pcb.designRules, commitPcb]
  );

  // Canvas interactions & viewport
  const {
    viewport,
    cursorMm,
    zoomPercent,
    setZoomPercent,
    zoomToFit,
    centerOnWorldPt,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel
  } = usePcbCanvasInteraction({
    canvasRef,
    canvasWrapRef,
    pcb,
    worldPads,
    tool,
    setTool,
    activeLayer,
    previewPatternDef,
    highlightedNet,
    setHighlightedNet,
    selectedCompId,
    setSelectedCompId,
    setSelectedTraceId,
    setSelectedViaId,
    setSelectedExtraObj,
    routeNetName,
    setRouteNetName,
    routeDraftPts,
    setRouteDraftPts,
    polyDraftPts,
    setPolyDraftPts,
    routeElbowFlip,
    lineStartPt,
    setLineStartPt,
    pourDraft,
    setMeasurePts,
    setStatusMessage,
    commitPcb,
    pushUndoSnapshot
  });
  cursorMmRef.current = cursorMm;

  const confirmDiscardIfDirty = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm('Текущая плата изменена. Продолжить без сохранения?');
  }, [isDirty]);

  const handleNewPcbProject = useCallback(() => {
    if (!confirmDiscardIfDirty()) return;
    setShowNewProjectDialog(true);
  }, [confirmDiscardIfDirty]);

  const handleCreateProjectFromDialog = useCallback(
    (opts: NewProjectOptions) => {
      const res = createProjectFromOptions(opts, 'pcb');
      setShowNewProjectDialog(false);
      if (res.targetModule === 'schematic') {
        openAppModule('schematic', (m) => onSwitchModule?.(m));
        return;
      }
      replacePcb(res.pcb);
      setSelectedCompId(null);
      setSelectedTraceId(null);
      clearDrc();
      setAutorouteReport(null);
      setStatusMessage(res.statusMessage);
    },
    [onSwitchModule, replacePcb, clearDrc]
  );

  const handleSavePcbFile = useCallback(
    async (saveAs = false) => {
      saveActivePcb(pcb);
      const savedName = await saveTextFile(
        nativeCadFilename(pcb.filePath, pcb.projectName, 'gostpcb'),
        serializePcb(pcb),
        [{ name: 'Плата SIPTrace', extensions: ['gostpcb', 'json'] }],
        { saveKey: 'pcb', saveAs }
      );
      if (!savedName) return;
      commitPcb((prev) => ({ ...prev, filePath: savedName }), false);
      markPcbSaved();
      recordRecentProject(
        {
          id: `proj_pcb_${pcb.projectName}`,
          name: pcb.projectName,
          designation: savedName,
          module: 'pcb'
        },
        { pcb }
      );
      setStatusMessage(`Плата сохранена: ${savedName}`);
    },
    [pcb, commitPcb, markPcbSaved]
  );

  usePcbHotkeys({
    hotkeys,
    layerCount: pcb.layerCount,
    tool,
    activeLayer,
    selectedCompId,
    selectedTraceId,
    selectedViaId,
    selectedExtraObj,
    routeDraftPtsLength: routeDraftPts.length,
    zoomPercent,
    setZoomPercent,
    setShowGrid,
    setMeasurePts,
    handleUndo,
    handleRedo,
    switchCopperLayer,
    setRouteElbowFlip,
    setRouteDraftPts,
    setPolyDraftPts,
    setLineStartPt,
    setTool,
    setSelectedTraceId,
    setSelectedCompId,
    setSelectedViaId,
    setSelectedExtraObj,
    commitPcb,
    handleNewProject: handleNewPcbProject,
    handleOpenPcbFile: () => handleOpenPcbFile(),
    handleSavePcbFile: () => handleSavePcbFile(false),
    handleRunDrc,
    zoomToFit,
    onFind: () => setShowFindDialog(true)
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvasWrapRef.current;
    if (!canvas || !container) return;
    renderPcbCanvas({
      canvas,
      container,
      pcb,
      viewport,
      showGrid,
      showRatlines,
      ratlines,
      selectedCompId,
      selectedTraceId,
      selectedViaId,
      selectedExtraObj,
      highlightedNet,
      tool,
      activeLayer,
      routeDraftPts,
      polyDraftPts,
      cursorMm,
      routeElbowFlip,
      measurePts,
      drcErrors
    });
  }, [
    pcb,
    viewport,
    showGrid,
    showRatlines,
    ratlines,
    selectedCompId,
    selectedTraceId,
    selectedViaId,
    selectedExtraObj,
    highlightedNet,
    tool,
    routeDraftPts,
    polyDraftPts,
    cursorMm,
    routeElbowFlip,
    activeLayer,
    measurePts,
    drcErrors
  ]);

  const handleOpenPcbFile = useCallback(async () => {
    if (!confirmDiscardIfDirty()) return;
    const picked = await pickCadFile(
      '.gostpcb,.dip,.asc,.xml,.kicad_pcb,.brd,.json,.epcb,.pcbdoc,.dxf,.gbr,.gtl,.gbl,.gko,.gm1,.gto,.gbo,.gts,.gbs,.drl,.xln,.zip,.pdsprj,.dch,.kicad_sch,.sch',
      [
        {
          name: 'Все САПР ПП / Gerber / ZIP / Схемы (SIPTrace / DipTrace / KiCad / Eagle / EasyEDA / Altium / DXF)',
          extensions: ['gostpcb', 'dip', 'asc', 'xml', 'kicad_pcb', 'brd', 'json', 'epcb', 'pcbdoc', 'dxf', 'gbr', 'zip', 'pdsprj', 'dch', 'kicad_sch', 'sch']
        }
      ]
    );
    if (!picked) return;
    try {
      const res = await importCadPcb(picked.bytes, picked.name);
      res.pcb.filePath = picked.filePath;
      clearSavedFileHandle('pcb');
      replacePcb(res.pcb);
      setSelectedCompId(null);
      setSelectedTraceId(null);
      clearDrc();
      setAutorouteReport(null);
      recordRecentProject({
        id: res.pcb.projectName + '_pcb',
        name: res.pcb.projectName,
        designation: picked.name,
        module: 'pcb'
      });
      setStatusMessage(
        `Загружено (${res.detectedFormat}): ${picked.name} — корпусов: ${res.pcb.components.length}, трасс: ${res.pcb.traces.length}`
      );
      if (res.report.items.length > 0 || res.report.convertedComponents > 0 || (res.report.warnings?.length ?? 0) > 0) {
        setConversionReport(res.report);
      }
    } catch (err) {
      setStatusMessage(`Ошибка открытия файла платы: ${(err as Error).message}`);
    }
  }, [confirmDiscardIfDirty, replacePcb, clearDrc]);

  const remoteProbeId = useRef<string | null>(null);
  // Cross-probe synchronization between Schematic & PCB
  useEffect(() => {
    if (!selectedCompId) return;
    if(remoteProbeId.current===selectedCompId){remoteProbeId.current=null;return;}
    const comp = pcb.components.find((c) => c.id === selectedCompId);
    if (comp) broadcastEdaEvent('crossprobe:refdes', { refDes: comp.refDes, source:'pcb', target:'schematic' });
  }, [selectedCompId, pcb.components]);

  useEffect(() => {
    return subscribeEdaEvents((ch, payload: unknown) => {
      if (ch === 'crossprobe:refdes' && (payload as { refDes?: string })?.refDes && (payload as {source?:string}).source!=='pcb') {
        const ref = (payload as { refDes: string }).refDes;
        const comp = pcb.components.find((c) => c.refDes === ref);
        if (comp && comp.id !== selectedCompId) {
          remoteProbeId.current=comp.id;
          setSelectedCompId(comp.id);
          setStatusMessage(`Перекрёстный выбор со схемы: ${comp.refDes}`);
        }
      }
    });
  }, [pcb.components, selectedCompId]);

  const topMenus = useMemo(
    () =>
      createPcbTopMenus({
        pcb,
        historyLength: history.length,
        redoLength: redoStack.length,
        showGrid,
        setShowGrid,
        showRatlines,
        setShowRatlines,
        selectedCompId,
        tool,
        setTool,
        setRouteDraftPts,
        setPolyDraftPts,
        commitPcb,
        replacePcb,
        confirmDiscardIfDirty,
        setStatusMessage,
        handleNewProject: handleNewPcbProject,
        handleSavePcbFile,
        handleUndo,
        handleRedo,
        zoomToFit,
        handleAutoplace,
        handleAutoroute,
        handleRunDrc,
        handleUpdatePours,
        handleApplyViaStitching,
        setShowCompareDialog,
        setShowCamDialog,
        setShowPanelDialog,
        setShowRulesDialog,
        setShowPourDialog,
        setShowRfDialog,
        setShowHotkeysDialog,
        setShowBoardWizard,
        handleOpenPcbFile,
        onSwitchModule
      }),
    [
      pcb,
      history.length,
      redoStack.length,
      showGrid,
      showRatlines,
      selectedCompId,
      tool,
      commitPcb,
      replacePcb,
      confirmDiscardIfDirty,
      handleNewPcbProject,
      handleSavePcbFile,
      handleUndo,
      handleRedo,
      zoomToFit,
      handleAutoplace,
      handleAutoroute,
      handleRunDrc,
      handleUpdatePours,
      handleApplyViaStitching,
      handleOpenPcbFile,
      onSwitchModule
    ]
  );

  const selectedComp = pcb.components.find((c) => c.id === selectedCompId) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#f0f0f0' }}>
      <MenuBar menus={topMenus} onBrandClick={() => openAppModule('launcher', (m) => onSwitchModule?.(m))} />

      <PcbToolbar
        pcb={pcb}
        historyLength={history.length}
        redoLength={redoStack.length}
        zoomPercent={zoomPercent}
        activeLayer={activeLayer}
        tool={tool}
        commitPcb={commitPcb}
        handleNewProject={handleNewPcbProject}
        handleOpenPcbFile={handleOpenPcbFile}
        handleSavePcbFile={() => handleSavePcbFile(false)}
        handleUndo={handleUndo}
        handleRedo={handleRedo}
        zoomToFit={zoomToFit}
        setZoomPercent={setZoomPercent}
        switchCopperLayer={switchCopperLayer}
        setTool={setTool}
        setRouteDraftPts={setRouteDraftPts}
        setPolyDraftPts={setPolyDraftPts}
        setShowCompareDialog={setShowCompareDialog}
        setShowPourDialog={setShowPourDialog}
        handleUpdatePours={handleUpdatePours}
        handleAutoplace={handleAutoplace}
        handleAutoroute={handleAutoroute}
        handleRunDrc={handleRunDrc}
        setShowCamDialog={setShowCamDialog}
        onSwitchModule={onSwitchModule}
      />

      <div className="dt-workspace">
        <PcbLeftSidebar
          allPatternLibs={allPatternLibs}
          selectedPatLibId={selectedPatLibId}
          setSelectedPatLibId={setSelectedPatLibId}
          selectedLibPatId={selectedLibPatId}
          setSelectedLibPatId={setSelectedLibPatId}
          activeLib={activeLib}
          previewPatternDef={previewPatternDef}
          pcb={pcb}
          commitPcb={commitPcb}
          setTool={setTool}
          setStatusMessage={setStatusMessage}
          setShowRulesDialog={setShowRulesDialog}
        />

        <div className="dt-center-col">
          <div className="dt-canvas-wrap" ref={canvasWrapRef}>
            <canvas
              ref={canvasRef}
              tabIndex={0}
              aria-label="Редактор топологии печатной платы"
              style={{ display: 'block', width: '100%', height: '100%', cursor: tool === 'select' ? 'default' : 'crosshair' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onWheel={handleWheel}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>
        </div>

        <PcbRightSidebar
          pcb={pcb}
          activeLayer={activeLayer}
          switchCopperLayer={switchCopperLayer}
          rightTopTab={rightTopTab}
          setRightTopTab={setRightTopTab}
          managerTab={managerTab}
          setManagerTab={setManagerTab}
          showRatlines={showRatlines}
          setShowRatlines={setShowRatlines}
          showGrid={showGrid}
          setShowGrid={setShowGrid}
          handleApplyViaStitching={handleApplyViaStitching}
          selectedCompId={selectedCompId}
          setSelectedCompId={setSelectedCompId}
          selectedTraceId={selectedTraceId}
          setSelectedTraceId={setSelectedTraceId}
          selectedViaId={selectedViaId}
          setSelectedViaId={setSelectedViaId}
          selectedExtraObj={selectedExtraObj}
          setSelectedExtraObj={setSelectedExtraObj}
          highlightedNet={highlightedNet}
          setHighlightedNet={setHighlightedNet}
          netNames={netNames}
          drcReport={drcReport}
          onRunDrc={handleRunDrc}
          selectedComp={selectedComp}
          ratlineCount={ratlines.length}
          onCenterWorldPt={centerOnWorldPt}
          commitPcb={commitPcb}
        />
      </div>

      <StatusBar
        hint={drcReport.status === 'stale' && statusMessage.startsWith('Проверка DRC')
          ? 'Плата изменена после проверки DRC. Повторить проверку: F9.'
          : statusMessage}
        extraCenter={`Слой: ${activeLayer} | Неразведённых: ${ratlines.length} | Дорожек: ${pcb.traces.length} | Переходов: ${pcb.vias.length}`}
        gridMm={pcb.gridSize}
        units={pcb.units}
        cursorX={cursorMm.x}
        cursorY={cursorMm.y}
        onToggleUnits={() => {
          const ord: Units[] = ['mm', 'mil', 'in'];
          commitPcb((p) => ({ ...p, units: ord[(ord.indexOf(p.units) + 1) % ord.length] }), false);
        }}
      />

      {showRulesDialog && (
        <PcbRulesDialog pcb={pcb} commitPcb={commitPcb} onClose={() => setShowRulesDialog(false)} />
      )}
      {showPourDialog && (
        <PcbCopperPourDialog
          pcb={pcb}
          netNames={netNames}
          initialLayer={activeLayer}
          onDraw={(settings) => {
            setPourDraft(settings);
            setRouteDraftPts([]);
            setPolyDraftPts([]);
            setActiveLayer(settings.layer);
            setTool('copperPour');
            setShowPourDialog(false);
            setStatusMessage('Укажите вершины полигона на плате. ПКМ — завершить заливку.');
          }}
          commitPcb={commitPcb}
          setStatusMessage={setStatusMessage}
          onClose={() => setShowPourDialog(false)}
        />
      )}
      {showCamDialog && (
        <PcbCamDialog
          pcb={pcb}
          setStatusMessage={setStatusMessage}
          onClose={() => setShowCamDialog(false)}
        />
      )}
      {showCompareDialog && (
        <PcbCompareDialog
          pcb={pcb}
          commitPcb={commitPcb}
          setStatusMessage={setStatusMessage}
          onClose={() => setShowCompareDialog(false)}
        />
      )}
      {showRfDialog && <PcbRfCalcDialog onClose={() => setShowRfDialog(false)} />}
      {showPanelDialog && (
        <PcbPanelizeDialog
          commitPcb={commitPcb}
          setStatusMessage={setStatusMessage}
          onClose={() => setShowPanelDialog(false)}
        />
      )}
      {showHotkeysDialog && (
        <HotkeySettingsDialog
          hotkeys={hotkeys}
          onSave={(hk) => {
            setHotkeys(hk);
            saveHotkeys(hk);
            setShowHotkeysDialog(false);
          }}
          onClose={() => setShowHotkeysDialog(false)}
        />
      )}
      {showBoardWizard && (
        <PcbBoardWizardDialog
          pcb={pcb}
          commitPcb={commitPcb}
          onClose={() => setShowBoardWizard(false)}
          onApply={() => {
            setShowBoardWizard(false);
            setStatusMessage('Параметры платы применены.');
          }}
        />
      )}
      {showFindDialog && (() => {
        const executeFind = () => {
          const q = findQuery.trim().toLowerCase();
          if (!q) return;
          const comp = pcb.components.find((c) => c.refDes.toLowerCase().includes(q) || c.value.toLowerCase().includes(q));
          if (comp) {
            setSelectedCompId(comp.id);
            setSelectedTraceId(null);
            setSelectedViaId(null);
            setSelectedExtraObj(null);
            centerOnWorldPt(comp.x, comp.y);
            setStatusMessage(`Найден компонент: ${comp.refDes} (${comp.value})`);
            setShowFindDialog(false);
            return;
          }
          const net = netNames.find((n) => n.toLowerCase().includes(q));
          if (net) {
            setHighlightedNet(net);
            const pad = worldPads.find((wp) => wp.netName === net);
            if (pad) centerOnWorldPt(pad.x, pad.y);
            setStatusMessage(`Найдена цепь: ${net}`);
            setShowFindDialog(false);
            return;
          }
          setStatusMessage(`Объект «${findQuery}» не найден.`);
        };
        return (
          <div className="dt-modal-backdrop" onClick={() => setShowFindDialog(false)}>
            <div className="dt-modal" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
              <div className="dt-modal-title">
                <strong>Поиск компонента или цепи (Ctrl+F)</strong>
                <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={() => setShowFindDialog(false)}>×</button>
              </div>
              <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  autoFocus
                  className="dt-input"
                  placeholder="Поз. обозначение (R1, U1) или имя цепи (GND, VCC)..."
                  value={findQuery}
                  onChange={(e) => setFindQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') executeFind();
                  }}
                />
              </div>
              <div className="dt-modal-footer">
                <button className="dt-btn primary" onClick={executeFind}>Найти</button>
                <button className="dt-btn" onClick={() => setShowFindDialog(false)}>Отмена</button>
              </div>
            </div>
          </div>
        );
      })()}

      {showNewProjectDialog && (
        <NewProjectDialog
          initialMode="pcb_only"
          onCreate={handleCreateProjectFromDialog}
          onClose={() => setShowNewProjectDialog(false)}
        />
      )}

      {conversionReport && (
        <GostConversionDialog report={conversionReport} onClose={() => setConversionReport(null)} />
      )}

      {autorouteReport && <PcbAutorouteBanner report={autorouteReport} onDismiss={() => setAutorouteReport(null)} />}
    </div>
  );
};
