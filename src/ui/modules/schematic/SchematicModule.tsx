import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppModuleId,
  ComponentLibrary,
  ErcError,
  PlacedComponent,
  Point2D,
  SchNetPort,
  SpiceSimResult
} from '../../../core/types';
import {
  broadcastEdaEvent,
  consumePendingConversionReport,
  createProjectFromOptions,
  loadActivePcb,
  NewProjectOptions,
  openAppModule,
  recordRecentProject,
  saveActivePcb,
  saveHotkeys,
  saveSettings
} from '../../../core/store';
import {
  DEFAULT_ERC_SETTINGS,
  ErcSettings,
  extractSchematicNets,
  runSchematicErc
} from '../../../engines/erc';
import {
  GostConversionReport,
  importCadSchematic,
  serializeSchematic
} from '../../../engines/importers';
import { clearSavedFileHandle, pickCadFile, saveTextFile } from '../../../core/utils/fileIo';
import { GostConversionDialog } from '../../components/GostConversionDialog';
import { NewProjectDialog } from '../../components/NewProjectDialog';
import { convertSchematicToPcb } from '../../../engines/netlist';
import { runBuiltInSpiceSimulation } from '../../../engines/spice';
import { generateGostBom } from '../../../gost/gostBom';
import { GOST_COMPONENT_LIBRARIES, findComponentById } from '../../../gost/libraries/gostComponents';
import { findPatternById } from '../../../gost/libraries/gostPatterns';
import {
  ColorSettingsDialog,
  GostBomDialog,
  HotkeySettingsDialog,
  SpiceSimDialog,
  TitleBlockDialog
} from '../../components/CommonDialogs';
import { MenuBar } from '../../components/MenuBar';
import { StatusBar } from '../../components/StatusBar';
import { renderSchematicCanvas } from './canvas/renderSchematicCanvas';
import { SchematicContextMenu } from './components/SchematicContextMenu';
import { SchematicLeftSidebar } from './components/SchematicLeftSidebar';
import { SchematicRightSidebar } from './components/SchematicRightSidebar';
import { SchematicSheetBar } from './components/SchematicSheetBar';
import { SchematicToolbar } from './components/SchematicToolbar';
import { SchErcSettingsDialog } from './components/dialogs/SchErcSettingsDialog';
import { SchFindDialog } from './components/dialogs/SchFindDialog';
import { SchNetClassesDialog } from './components/dialogs/SchNetClassesDialog';
import { useSchematicHotkeys } from './hooks/useSchematicHotkeys';
import { useSchematicProjectState } from './hooks/useSchematicProjectState';
import { useSchematicInteraction } from './interactions/useSchematicInteraction';
import { createSchematicTopMenus } from './menus/schematicMenuSpec';
import {
  buildBomTableShape,
  createBlankSchematicProject,
  exportTextFileViaNativeOrBrowser
} from './services/schematicActionsService';
import { SchContextMenu, SchMarqueeBox, SchToolId } from './types';

export interface SchematicModuleProps {
  onSwitchModule?: (m: AppModuleId) => void;
}

/** Main Schematic Capture CAD coordinator composing toolbars, library browser, 2D canvas, inspector, and modals. */
export const SchematicModule: React.FC<SchematicModuleProps> = ({ onSwitchModule }) => {
  const [selectedCompIds, setSelectedCompIds] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState(
    'Готов к работе. Выберите компонент слева или нажмите W для проводника.'
  );

  const {
    project,
    history,
    redoStack,
    isDirty,
    settings,
    setSettings,
    hotkeys,
    setHotkeys,
    userComponents,
    userPatterns,
    activeSheet,
    customCompMap,
    commitProject,
    pushUndoSnapshot,
    replaceProject,
    markProjectSaved,
    updateActiveSheet,
    handleUndo,
    handleRedo
  } = useSchematicProjectState({ setSelectedCompIds, setStatusMessage });

  // Tool & library browser state
  const [tool, setTool] = useState<SchToolId>('select');
  const [selectedLibId, setSelectedLibId] = useState<string>(
    GOST_COMPONENT_LIBRARIES[0]?.id ?? 'gost_general'
  );
  const [selectedLibCompId, setSelectedLibCompId] = useState<string>(
    GOST_COMPONENT_LIBRARIES[0]?.components[0]?.id ?? ''
  );
  const [selectedPartIndex, setSelectedPartIndex] = useState<number>(1);
  const [placeExpanded, setPlaceExpanded] = useState<boolean>(true);
  const [toolsExpanded, setToolsExpanded] = useState<boolean>(false);
  const [sortLibsAlpha, setSortLibsAlpha] = useState<boolean>(false);
  const [searchCompQuery, setSearchCompQuery] = useState<string>('');

  // Selection, highlight, ERC, and canvas draft states
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null);
  const [highlightedNet, setHighlightedNet] = useState<string | null>(null);
  const [managerTab, setManagerTab] = useState<'components' | 'nets' | 'erc'>('components');
  const [ercErrors, setErcErrors] = useState<ErcError[]>([]);
  const [ercSettings, setErcSettings] = useState<ErcSettings>(() => ({ ...DEFAULT_ERC_SETTINGS }));
  const [showGrid, setShowGrid] = useState<boolean>(true);

  // Placement transforms & net port presets
  const [placeAngle, setPlaceAngle] = useState<0 | 90 | 180 | 270>(0);
  const [placeFlipX, setPlaceFlipX] = useState<boolean>(false);
  const [placeFlipY, setPlaceFlipY] = useState<boolean>(false);
  const [autoPowerCheck, setAutoPowerCheck] = useState<boolean>(false);
  const [netPortStyle, setNetPortStyle] = useState<SchNetPort['style']>('Ground');
  const [netPortLabel, setNetPortLabel] = useState<string>('GND');
  const [elbowFlip, setElbowFlip] = useState<boolean>(false);

  const [wireDraftPts, setWireDraftPts] = useState<Point2D[]>([]);
  const [shapeStartPt, setShapeStartPt] = useState<Point2D | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<SchMarqueeBox | null>(null);
  const [clipboardComps, setClipboardComps] = useState<PlacedComponent[]>([]);
  const [contextMenu, setContextMenu] = useState<SchContextMenu | null>(null);

  // Modal dialogs
  const [showTitleDialog, setShowTitleDialog] = useState<boolean>(false);
  const [showBomDialog, setShowBomDialog] = useState<boolean>(false);
  const [spiceResult, setSpiceResult] = useState<SpiceSimResult | null>(null);
  const [showFindDialog, setShowFindDialog] = useState<boolean>(false);
  const [showNetClassesDialog, setShowNetClassesDialog] = useState<boolean>(false);
  const [showColorDialog, setShowColorDialog] = useState<boolean>(false);
  const [showErcSettingsDialog, setShowErcSettingsDialog] = useState<boolean>(false);
  const [showHotkeysDialog, setShowHotkeysDialog] = useState<boolean>(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState<boolean>(false);
  const [conversionReport, setConversionReport] = useState<GostConversionReport | null>(() => consumePendingConversionReport());

  useEffect(() => {
    setPlaceAngle(0);
    setPlaceFlipX(false);
    setPlaceFlipY(false);
  }, [selectedLibCompId]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);

  // Library browser derivations
  const allLibraries = useMemo<ComponentLibrary[]>(() => {
    const libs = [...GOST_COMPONENT_LIBRARIES];
    if (userComponents.length > 0) {
      libs.push({
        id: 'user_gost_ugos',
        name: 'Пользовательские (УГО)',
        category: 'Пользовательские',
        description: 'Пользовательские компоненты УГО',
        isUserLibrary: true,
        components: userComponents
      });
    }
    return sortLibsAlpha
      ? [...libs].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      : libs;
  }, [userComponents, sortLibsAlpha]);

  const activeLibrary = useMemo(
    () => allLibraries.find((l) => l.id === selectedLibId) ?? allLibraries[0],
    [allLibraries, selectedLibId]
  );

  const displayedLibComps = useMemo(() => {
    const q = searchCompQuery.trim().toLowerCase();
    const comps = q ? allLibraries.flatMap((lib) => lib.components) : activeLibrary?.components ?? [];
    const filtered = q
      ? comps.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.gostStandard.toLowerCase().includes(q) ||
            c.refDesPrefix.toLowerCase().includes(q) ||
            c.defaultValue.toLowerCase().includes(q)
        )
      : comps;
    return sortLibsAlpha ? [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'ru')) : filtered;
  }, [activeLibrary, allLibraries, searchCompQuery, sortLibsAlpha]);

  const previewComponentDef = useMemo(
    () => findComponentById(selectedLibCompId, customCompMap) ?? displayedLibComps[0] ?? null,
    [selectedLibCompId, customCompMap, displayedLibComps]
  );

  const previewPatternDef = useMemo(() => {
    if (!previewComponentDef?.patternId) return null;
    const customPatMap = Object.fromEntries(userPatterns.map((p) => [p.id, p]));
    return findPatternById(previewComponentDef.patternId, {
      ...project.customPatternDefs,
      ...customPatMap
    }) ?? null;
  }, [previewComponentDef, project.customPatternDefs, userPatterns]);

  const selectedPlacedComp = useMemo(
    () =>
      selectedCompIds.length > 0
        ? activeSheet.components.find((c) => c.id === selectedCompIds[0]) ?? null
        : null,
    [activeSheet.components, selectedCompIds]
  );

  const inspectorCompDef = useMemo(() => {
    if (selectedPlacedComp) {
      return findComponentById(selectedPlacedComp.componentDefId, customCompMap) ?? null;
    }
    return previewComponentDef;
  }, [selectedPlacedComp, customCompMap, previewComponentDef]);

  const schematicNets = useMemo(() => extractSchematicNets(project), [project]);

  const confirmDiscardIfDirty = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm('Текущий проект схемы изменён. Продолжить без сохранения?');
  }, [isDirty]);

  // Domain actions
  const handleNewProject = useCallback(() => {
    if (!confirmDiscardIfDirty()) return;
    setShowNewProjectDialog(true);
  }, [confirmDiscardIfDirty]);

  const handleCreateProjectFromDialog = useCallback(
    (opts: NewProjectOptions) => {
      const res = createProjectFromOptions(opts, 'schematic');
      setShowNewProjectDialog(false);
      if (res.targetModule === 'pcb') {
        openAppModule('pcb', (m) => onSwitchModule?.(m));
        return;
      }
      if (res.schematic) {
        replaceProject(res.schematic);
      }
      setSelectedCompIds([]);
      setSelectedWireId(null);
      setSelectedPortId(null);
      setErcErrors([]);
      setStatusMessage(res.statusMessage);
    },
    [onSwitchModule, replaceProject]
  );

  const handleOpenFile = useCallback(async () => {
    if (!confirmDiscardIfDirty()) return;
    const picked = await pickCadFile(
      '.gostsch,.dch,.dchxml,.asc,.xml,.pdsprj,.sec,.sdf,.kicad_sch,.sch,.json,.esch,.schdoc,.edf,.cir,.dxf,.zip',
      [
        {
          name: 'Все поддерживаемые САПР (SIPTrace / DipTrace / Proteus / KiCad / Eagle / EasyEDA / Altium / ZIP)',
          extensions: ['gostsch', 'dch', 'dchxml', 'asc', 'xml', 'pdsprj', 'sec', 'sdf', 'kicad_sch', 'sch', 'json', 'esch', 'schdoc', 'edf', 'cir', 'dxf', 'zip']
        }
      ]
    );
    if (!picked) return;
    try {
      const res = await importCadSchematic(picked.bytes, picked.name);
      res.project.filePath = picked.filePath;
      clearSavedFileHandle('schematic');
      replaceProject(res.project);
      setSelectedCompIds([]);
      setSelectedWireId(null);
      setSelectedPortId(null);
      setErcErrors([]);
      recordRecentProject({
        id: res.project.projectName,
        name: res.project.projectName,
        designation: res.project.sheets[0]?.titleBlock.designation || picked.name,
        module: 'schematic'
      });
      setStatusMessage(
        `Открыто (${res.detectedFormat}): ${picked.name} — элементов: ${res.project.sheets[0]?.components.length ?? 0}`
      );
      if (res.report.items.length > 0 || res.report.convertedComponents > 0 || (res.report.warnings?.length ?? 0) > 0) {
        setConversionReport(res.report);
      }
    } catch (err) {
      setStatusMessage(`Ошибка импорта файла: ${(err as Error).message}`);
    }
  }, [confirmDiscardIfDirty, replaceProject]);

  const handleExportTextFile = useCallback(
    async (filename: string, content: string, ext: string, desc = 'Файл SIPTrace') => {
      const msg = await exportTextFileViaNativeOrBrowser(filename, content, ext, desc);
      if (msg) setStatusMessage(msg);
    },
    []
  );

  const handleSaveFile = useCallback(
    async (saveAs = false) => {
      const json = serializeSchematic(project);
      const savedName = await saveTextFile(
        project.filePath || `${project.projectName}.gostsch`,
        json,
        [{ name: 'Схема SIPTrace', extensions: ['gostsch', 'json'] }],
        { saveKey: 'schematic', saveAs }
      );
      if (!savedName) return;
      commitProject((prev) => ({ ...prev, filePath: savedName }), false);
      markProjectSaved();
      recordRecentProject(
        {
          id: `proj_sch_${project.projectName}`,
          name: project.projectName,
          designation: activeSheet.titleBlock.designation || savedName,
          module: 'schematic'
        },
        { schematic: project, pcb: loadActivePcb() }
      );
      setStatusMessage(`Схема сохранена: ${savedName}`);
    },
    [project, activeSheet.titleBlock.designation, commitProject, markProjectSaved]
  );

  const handleRunErc = useCallback(() => {
    const errs = runSchematicErc(project, ercSettings);
    setErcErrors(errs);
    setManagerTab('erc');
    const eCnt = errs.filter((e) => e.severity === 'Error').length;
    const wCnt = errs.filter((e) => e.severity === 'Warning').length;
    setStatusMessage(
      errs.length === 0
        ? 'Проверка ERC: Нарушений не обнаружено!'
        : `Проверка ERC: ошибок ${eCnt}, предупреждений ${wCnt}.`
    );
  }, [project, ercSettings]);

  const handleConvertToPcb = useCallback(() => {
    const existing = loadActivePcb();
    const converted = convertSchematicToPcb(project, existing);
    saveActivePcb(converted);
    broadcastEdaEvent('pcb:updated', converted);
    setStatusMessage(
      `Преобразовано в печатную плату: ${converted.components.length} компонентов, ${converted.netClasses.length} классов цепей.`
    );
    openAppModule('pcb', (m) => onSwitchModule?.(m));
  }, [project, onSwitchModule]);

  const handleUpdatePcbFromSchematic = useCallback(() => {
    const existing = loadActivePcb();
    const updated = convertSchematicToPcb(project, existing);
    saveActivePcb(updated);
    broadcastEdaEvent('pcb:updated', updated);
    setStatusMessage(`Плата обновлена по схеме (${updated.components.length} корпусов).`);
  }, [project]);

  const handleRunSpice = useCallback(
    (mode: 'DC' | 'Transient' | 'AC' = 'Transient') => {
      const res = runBuiltInSpiceSimulation(project, mode);
      setSpiceResult(res);
      setStatusMessage(res.message);
    },
    [project]
  );

  // Editing operations on selected items
  const deleteSelection = useCallback(() => {
    if (selectedCompIds.length === 0 && !selectedWireId && !selectedPortId) return;
    updateActiveSheet((s) => ({
      ...s,
      components: s.components.filter((c) => !selectedCompIds.includes(c.id)),
      wires: selectedWireId ? s.wires.filter((w) => w.id !== selectedWireId) : s.wires,
      netPorts: selectedPortId ? s.netPorts.filter((np) => np.id !== selectedPortId) : s.netPorts
    }));
    setSelectedCompIds([]);
    setSelectedWireId(null);
    setSelectedPortId(null);
    setStatusMessage('Выделение удалено.');
  }, [selectedCompIds, selectedWireId, selectedPortId, updateActiveSheet]);

  const rotateSelection = useCallback(() => {
    if (selectedCompIds.length > 0) {
      updateActiveSheet((s) => ({
        ...s,
        components: s.components.map((c) =>
          selectedCompIds.includes(c.id)
            ? { ...c, angle: ((c.angle + 90) % 360) as 0 | 90 | 180 | 270 }
            : c
        )
      }));
    } else if (tool === 'placeComp') {
      setPlaceAngle((a) => ((a + 90) % 360) as 0 | 90 | 180 | 270);
    }
  }, [selectedCompIds, tool, updateActiveSheet]);

  const flipSelection = useCallback(
    (axis: 'X' | 'Y') => {
      if (selectedCompIds.length > 0) {
        updateActiveSheet((s) => ({
          ...s,
          components: s.components.map((c) =>
            selectedCompIds.includes(c.id)
              ? {
                  ...c,
                  flipX: axis === 'X' ? !c.flipX : c.flipX,
                  flipY: axis === 'Y' ? !c.flipY : c.flipY
                }
              : c
          )
        }));
      } else if (tool === 'placeComp') {
        if (axis === 'X') setPlaceFlipX((v) => !v);
        else setPlaceFlipY((v) => !v);
      }
    },
    [selectedCompIds, tool, updateActiveSheet]
  );

  const handleAlignSelection = useCallback(
    (axis: 'x' | 'y') => {
      if (selectedCompIds.length < 2) {
        setStatusMessage('Выделите минимум 2 элемента для выравнивания.');
        return;
      }
      updateActiveSheet((s) => {
        const picked = s.components.filter((c) => selectedCompIds.includes(c.id));
        const anchorVal = axis === 'x' ? picked[0].x : picked[0].y;
        return {
          ...s,
          components: s.components.map((c) =>
            selectedCompIds.includes(c.id)
              ? { ...c, x: axis === 'x' ? anchorVal : c.x, y: axis === 'y' ? anchorVal : c.y }
              : c
          )
        };
      });
      setStatusMessage(`Элементы выровнены по оси ${axis.toUpperCase()}.`);
    },
    [selectedCompIds, updateActiveSheet]
  );

  useEffect(() => {
    if (selectedCompIds.length !== 1) return;
    const comp = activeSheet.components.find((c) => c.id === selectedCompIds[0]);
    if (comp) broadcastEdaEvent('crossprobe:refdes', { refDes: comp.refDes });
  }, [selectedCompIds, activeSheet.components]);

  // Canvas interactions & viewport
  const {
    viewport,
    cursorMm,
    zoomPercent,
    setZoomByPercent,
    zoomToFit,
    centerOnWorldPt,
    snapWorldSmart,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleCanvasDoubleClick,
    handleCanvasWheel,
    handleContextMenu
  } = useSchematicInteraction({
    canvasRef,
    canvasWrapRef,
    project,
    activeSheet,
    customCompMap,
    tool,
    setTool,
    previewComponentDef,
    selectedPartIndex,
    placeAngle,
    placeFlipX,
    placeFlipY,
    autoPowerCheck,
    netPortStyle,
    netPortLabel,
    elbowFlip,
    wireDraftPts,
    setWireDraftPts,
    shapeStartPt,
    setShapeStartPt,
    marqueeBox,
    setMarqueeBox,
    selectedCompIds,
    setSelectedCompIds,
    setSelectedWireId,
    setSelectedPortId,
    setContextMenu,
    setStatusMessage,
    commitProject,
    pushUndoSnapshot,
    updateActiveSheet
  });

  useSchematicHotkeys({
    hotkeys,
    tool,
    project,
    activeSheet,
    selectedCompIds,
    clipboardComps,
    setClipboardComps,
    wireDraftPts,
    setWireDraftPts,
    shapeStartPt,
    setShapeStartPt,
    setTool,
    setElbowFlip,
    setShowFindDialog,
    setShowGrid,
    zoomPercent,
    setZoomByPercent,
    updateActiveSheet,
    handleNewProject,
    handleOpenFile,
    handleUndo,
    handleRedo,
    handleSaveFile: () => handleSaveFile(false),
    handleConvertToPcb,
    deleteSelection,
    rotateSelection,
    flipSelection,
    zoomToFit,
    handleRunErc
  });

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvasWrapRef.current;
    if (!canvas || !container) return;
    renderSchematicCanvas({
      canvas,
      container,
      activeSheet,
      origin: project.origin,
      gridSize: project.gridSize,
      viewport,
      colorScheme: settings.colorScheme,
      showGrid,
      customCompMap,
      selectedCompIds,
      selectedWireId,
      selectedPortId,
      highlightedNet,
      tool,
      previewComponentDef,
      selectedPartIndex,
      cursorMm,
      placeAngle,
      placeFlipX,
      placeFlipY,
      wireDraftPts,
      elbowFlip,
      shapeStartPt,
      marqueeBox,
      ercErrors,
      snapWorldSmart
    });
  }, [
    activeSheet,
    project.origin,
    project.gridSize,
    viewport,
    settings.colorScheme,
    showGrid,
    customCompMap,
    selectedCompIds,
    selectedWireId,
    selectedPortId,
    highlightedNet,
    tool,
    previewComponentDef,
    selectedPartIndex,
    cursorMm,
    placeAngle,
    placeFlipX,
    placeFlipY,
    wireDraftPts,
    elbowFlip,
    shapeStartPt,
    marqueeBox,
    ercErrors,
    snapWorldSmart
  ]);

  const topMenus = useMemo(
    () =>
      createSchematicTopMenus({
        project,
        activeSheet,
        customCompMap,
        historyLength: history.length,
        redoLength: redoStack.length,
        selectedCompIds,
        clipboardComps,
        setClipboardComps,
        showGrid,
        setShowGrid,
        zoomPercent,
        setZoomByPercent,
        tool,
        setTool,
        setSettings,
        commitProject,
        replaceProject,
        confirmDiscardIfDirty,
        updateActiveSheet,
        setStatusMessage,
        handleNewProject,
        handleOpenFile,
        handleSaveFile,
        handleUndo,
        handleRedo,
        deleteSelection,
        rotateSelection,
        flipSelection,
        zoomToFit,
        handleConvertToPcb,
        handleUpdatePcbFromSchematic,
        handleRunErc,
        handleRunSpice: () => handleRunSpice('Transient'),
        handleExportTextFile,
        setShowTitleDialog,
        setShowBomDialog,
        setShowFindDialog,
        setShowNetClassesDialog,
        setShowColorDialog,
        setShowErcSettingsDialog,
        setShowHotkeysDialog,
        handleAlignSelection,
        onSwitchModule
      }),
    [
      project,
      activeSheet,
      customCompMap,
      history.length,
      redoStack.length,
      selectedCompIds,
      clipboardComps,
      showGrid,
      zoomPercent,
      setZoomByPercent,
      tool,
      setSettings,
      commitProject,
      replaceProject,
      confirmDiscardIfDirty,
      updateActiveSheet,
      handleNewProject,
      handleOpenFile,
      handleSaveFile,
      handleUndo,
      handleRedo,
      deleteSelection,
      rotateSelection,
      flipSelection,
      zoomToFit,
      handleConvertToPcb,
      handleUpdatePcbFromSchematic,
      handleRunErc,
      handleRunSpice,
      handleExportTextFile,
      onSwitchModule
    ]
  );

  const bomEntries = useMemo(() => (showBomDialog ? generateGostBom(project) : []), [showBomDialog, project]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#f0f0f0' }}>
      <MenuBar menus={topMenus} onBrandClick={() => openAppModule('launcher', (m) => onSwitchModule?.(m))} />

      <SchematicToolbar
        project={project}
        activeSheet={activeSheet}
        historyLength={history.length}
        redoLength={redoStack.length}
        selectedCompIds={selectedCompIds}
        clipboardComps={clipboardComps}
        setClipboardComps={setClipboardComps}
        zoomPercent={zoomPercent}
        setZoomByPercent={setZoomByPercent}
        tool={tool}
        setTool={setTool}
        setWireDraftPts={setWireDraftPts}
        setShapeStartPt={setShapeStartPt}
        commitProject={commitProject}
        updateActiveSheet={updateActiveSheet}
        handleNewProject={handleNewProject}
        handleOpenFile={handleOpenFile}
        handleSaveFile={() => handleSaveFile(false)}
        setShowTitleDialog={setShowTitleDialog}
        setShowBomDialog={setShowBomDialog}
        handleUndo={handleUndo}
        handleRedo={handleRedo}
        zoomToFit={zoomToFit}
        setShowFindDialog={setShowFindDialog}
        handleRunErc={handleRunErc}
        handleRunSpice={() => handleRunSpice('Transient')}
        handleConvertToPcb={handleConvertToPcb}
      />

      <div className="dt-workspace">
        <SchematicLeftSidebar
          allLibraries={allLibraries}
          selectedLibId={selectedLibId}
          setSelectedLibId={setSelectedLibId}
          selectedLibCompId={selectedLibCompId}
          setSelectedLibCompId={setSelectedLibCompId}
          selectedPartIndex={selectedPartIndex}
          setSelectedPartIndex={setSelectedPartIndex}
          placeExpanded={placeExpanded}
          setPlaceExpanded={setPlaceExpanded}
          toolsExpanded={toolsExpanded}
          setToolsExpanded={setToolsExpanded}
          sortLibsAlpha={sortLibsAlpha}
          setSortLibsAlpha={setSortLibsAlpha}
          searchCompQuery={searchCompQuery}
          setSearchCompQuery={setSearchCompQuery}
          displayedLibComps={displayedLibComps}
          previewComponentDef={previewComponentDef}
          previewPatternDef={previewPatternDef}
          netPortStyle={netPortStyle}
          setNetPortStyle={setNetPortStyle}
          netPortLabel={netPortLabel}
          setNetPortLabel={setNetPortLabel}
          autoPowerCheck={autoPowerCheck}
          setAutoPowerCheck={setAutoPowerCheck}
          setTool={setTool}
          setStatusMessage={setStatusMessage}
        />

        <div className="dt-center-col">
          <div className="dt-canvas-wrap" ref={canvasWrapRef}>
            <canvas
              ref={canvasRef}
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                cursor: tool === 'select' ? 'default' : 'crosshair'
              }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onDoubleClick={handleCanvasDoubleClick}
              onWheel={handleCanvasWheel}
              onContextMenu={handleContextMenu}
            />
          </div>
          <SchematicSheetBar
            project={project}
            activeSheet={activeSheet}
            commitProject={commitProject}
          />
        </div>

        <SchematicRightSidebar
          project={project}
          activeSheet={activeSheet}
          userPatterns={userPatterns}
          selectedPlacedComp={selectedPlacedComp}
          inspectorCompDef={inspectorCompDef}
          selectedPartIndex={selectedPartIndex}
          selectedWireId={selectedWireId}
          selectedPortId={selectedPortId}
          selectedCompIds={selectedCompIds}
          setSelectedCompIds={setSelectedCompIds}
          managerTab={managerTab}
          setManagerTab={setManagerTab}
          schematicNets={schematicNets}
          highlightedNet={highlightedNet}
          setHighlightedNet={setHighlightedNet}
          ercErrors={ercErrors}
          setShowTitleDialog={setShowTitleDialog}
          onCenterWorldPt={centerOnWorldPt}
          commitProject={commitProject}
          updateActiveSheet={updateActiveSheet}
        />
      </div>

      <StatusBar
        hint={statusMessage}
        extraCenter={`Лист: ${activeSheet.name} | Элементов: ${activeSheet.components.filter((c) => !c.refDes.startsWith('#')).length} | Цепей: ${schematicNets.length}`}
        gridMm={project.gridSize}
        units={project.units}
        cursorX={cursorMm.x}
        cursorY={cursorMm.y}
        onToggleUnits={() =>
          commitProject(
            (prev) => ({
              ...prev,
              units: prev.units === 'mm' ? 'mil' : prev.units === 'mil' ? 'in' : 'mm'
            }),
            false
          )
        }
      />

      {contextMenu && (
        <SchematicContextMenu
          menu={contextMenu}
          onRotate={rotateSelection}
          onFlipX={() => flipSelection('X')}
          onFlipY={() => flipSelection('Y')}
          onDelete={deleteSelection}
          onClose={() => setContextMenu(null)}
        />
      )}

      {showTitleDialog && (
        <TitleBlockDialog
          format={activeSheet.format}
          titleBlock={activeSheet.titleBlock}
          onApply={(fmt, tb) => {
            updateActiveSheet((s) => ({ ...s, format: fmt, titleBlock: tb }));
            setShowTitleDialog(false);
          }}
          onClose={() => setShowTitleDialog(false)}
        />
      )}

      {showBomDialog && (
        <GostBomDialog
          project={project}
          entries={bomEntries}
          onSaveFile={(fn, content, ext) => handleExportTextFile(fn, content, ext)}
          onInsertAsTable={(entries) => {
            const tbl = buildBomTableShape(entries, activeSheet.format, activeSheet.titleBlock);
            updateActiveSheet((s) => ({ ...s, shapes: [...s.shapes, tbl] }));
            setShowBomDialog(false);
            setStatusMessage('Таблица Перечня элементов (ПЭ3) вставлена на лист схемы.');
          }}
          onClose={() => setShowBomDialog(false)}
        />
      )}

      {spiceResult && (
        <SpiceSimDialog
          result={spiceResult}
          onExportNetlist={(txt) => handleExportTextFile(`${project.projectName}.cir`, txt, 'cir', 'SPICE Netlist')}
          onRunMode={(m, stopMs) => {
            const res = runBuiltInSpiceSimulation(project, m, stopMs);
            setSpiceResult(res);
          }}
          onClose={() => setSpiceResult(null)}
        />
      )}

      {showFindDialog && (
        <SchFindDialog
          components={activeSheet.components}
          nets={schematicNets}
          onSelectComp={(id, x, y) => {
            setSelectedCompIds([id]);
            setHighlightedNet(null);
            centerOnWorldPt(x, y);
            setStatusMessage('Компонент выделен.');
          }}
          onSelectNet={(netName) => {
            setHighlightedNet(netName);
            setSelectedCompIds([]);
            setManagerTab('nets');
            setStatusMessage(`Выделена цепь «${netName}».`);
          }}
          onClose={() => setShowFindDialog(false)}
        />
      )}

      {showNetClassesDialog && (
        <SchNetClassesDialog
          netClasses={project.netClasses}
          onClose={() => setShowNetClassesDialog(false)}
        />
      )}

      {showColorDialog && (
        <ColorSettingsDialog
          scheme={settings.colorScheme}
          onApply={(scheme) => {
            setSettings((prev) => {
              const next = { ...prev, colorScheme: scheme };
              saveSettings(next);
              return next;
            });
          }}
          onClose={() => setShowColorDialog(false)}
        />
      )}

      {showErcSettingsDialog && (
        <SchErcSettingsDialog
          ercSettings={ercSettings}
          setErcSettings={setErcSettings}
          onRunNow={handleRunErc}
          onClose={() => setShowErcSettingsDialog(false)}
        />
      )}

      {showHotkeysDialog && (
        <HotkeySettingsDialog
          hotkeys={hotkeys}
          onSave={(next) => {
            setHotkeys(next);
            saveHotkeys(next);
          }}
          onClose={() => setShowHotkeysDialog(false)}
        />
      )}

      {showNewProjectDialog && (
        <NewProjectDialog
          initialMode="schematic_and_pcb"
          onCreate={handleCreateProjectFromDialog}
          onClose={() => setShowNewProjectDialog(false)}
        />
      )}

      {conversionReport && (
        <GostConversionDialog report={conversionReport} onClose={() => setConversionReport(null)} />
      )}
    </div>
  );
};
