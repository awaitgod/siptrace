import { printSchematicProject } from './services/printSchematic';
import { useEditorSession } from './hooks/useEditorSession';
import { allIds, copyFragment, getClipboard, pasteFragment, deleteEntities, transformEntities, selectionBounds, findEntity, collections, editWire } from '../../../core/schematic/editing';
import { SchematicObjectDialog } from './components/dialogs/SchematicObjectDialog';
import { SchematicProject, SchematicSheet } from '../../../core/types';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppModuleId, ComponentLibrary, ErcError, PlacedComponent, Point2D, SchNetPort, SpiceSimResult } from '../../../core/types';
import { broadcastEdaEvent, consumePendingConversionReport, createProjectFromOptions, loadActivePcb, NewProjectOptions, openAppModule, recordRecentProject, saveActivePcb, saveHotkeys, saveSettings } from '../../../core/store';
import { DEFAULT_ERC_SETTINGS, ErcSettings, extractSchematicNets, runSchematicErc } from '../../../engines/erc';
import { GostConversionReport, importCadSchematic, serializeSchematic } from '../../../engines/importers';
import { clearSavedFileHandle, pickCadFile, saveTextFile } from '../../../core/utils/fileIo';
import { GostConversionDialog } from '../../components/GostConversionDialog';
import { NewProjectDialog } from '../../components/NewProjectDialog';
import { convertSchematicToPcb } from '../../../engines/netlist';
import { runBuiltInSpiceSimulation } from '../../../engines/spice';
import { generateGostBom } from '../../../gost/gostBom';
import { GOST_COMPONENT_LIBRARIES, findComponentById } from '../../../gost/libraries/gostComponents';
import { findPatternById } from '../../../gost/libraries/gostPatterns';
import { ColorSettingsDialog, GostBomDialog, HotkeySettingsDialog, SpiceSimDialog, TitleBlockDialog } from '../../components/CommonDialogs';
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
import { buildBomTableShape, createBlankSchematicProject, exportTextFileViaNativeOrBrowser } from './services/schematicActionsService';
import { SchContextMenu, SchMarqueeBox, SchToolId } from './types';
export interface SchematicModuleProps {
    onSwitchModule?: (m: AppModuleId) => void;
}
/** Main Schematic Capture CAD coordinator composing toolbars, library browser, 2D canvas, inspector, and modals. */
export const SchematicModule: React.FC<SchematicModuleProps> = ({ onSwitchModule }) => {
    const [selectedIds, setSelectedIds] = useEditorSession<string[]>('schematic-selection', []);
    const setSelectedCompIds = setSelectedIds;
    const [statusMessage, setStatusMessage] = useState('Готов к работе. Выберите компонент слева или нажмите W для проводника.');
    const { project, history, redoStack, isDirty, autosaveStatus, settings, setSettings, hotkeys, setHotkeys, userComponents, userPatterns, activeSheet, customCompMap, commitProject, pushUndoSnapshot, replaceProject, markProjectSaved, updateActiveSheet, handleUndo, handleRedo } = useSchematicProjectState({ setSelectedCompIds, setStatusMessage });
    // Tool & library browser state
    const [tool, setTool] = useState<SchToolId>('select');
    const [selectedLibId, setSelectedLibId] = useState<string>(GOST_COMPONENT_LIBRARIES[0]?.id ?? 'gost_general');
    const [selectedLibCompId, setSelectedLibCompId] = useState<string>(GOST_COMPONENT_LIBRARIES[0]?.components[0]?.id ?? '');
    const [selectedPartIndex, setSelectedPartIndex] = useState<number>(1);
    const [placeExpanded, setPlaceExpanded] = useState<boolean>(true);
    const [toolsExpanded, setToolsExpanded] = useState<boolean>(false);
    const [sortLibsAlpha, setSortLibsAlpha] = useState<boolean>(false);
    const [searchCompQuery, setSearchCompQuery] = useState<string>('');
    // Selection, highlight, ERC, and canvas draft states
    const selectedCompIds = selectedIds.filter(id => activeSheet.components.some(c => c.id === id));
    const selectedWireId = activeSheet.wires.find(w => selectedIds.includes(w.id))?.id ?? null;
    const selectedPortId = activeSheet.netPorts.find(w => selectedIds.includes(w.id))?.id ?? null;
    const setSelectedWireId = (id: string | null) => { if (id)
        setSelectedIds([id]); };
    const setSelectedPortId = (id: string | null) => { if (id)
        setSelectedIds([id]); };
    const [propertiesIds, setPropertiesIds] = useState<string[] | null>(null);
    const [pasteDraft, setPasteDraft] = useState<SchematicSheet | null>(null);
    const [pasteDefinitions, setPasteDefinitions] = useState<{
        components: SchematicProject['customComponentDefs'];
        patterns: SchematicProject['customPatternDefs'];
    }>({ components: {}, patterns: {} });
    const drawingDefinitions = useMemo(() => ({ ...customCompMap, ...(tool === 'paste' ? pasteDefinitions.components : {}) }), [customCompMap, tool, pasteDefinitions]);
    const [clipboardVersion, setClipboardVersion] = useState(0);
    const openProperties = useCallback((ids: string[]) => setPropertiesIds(ids), []);
    const [highlightedNet, setHighlightedNet] = useState<string | null>(null);
    const [managerTab, setManagerTab] = useState<'components' | 'nets' | 'erc'>('components');
    const [ercRevision, setErcRevision] = useState<SchematicProject | null>(null);
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
    const [panelWidths, setPanelWidths] = useEditorSession('schematic-panels', { left: 195, right: 240 });
    const resizePanel = (side: 'left' | 'right', e: React.PointerEvent) => {
        const start = e.clientX, width = panelWidths[side];
        e.currentTarget.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => setPanelWidths(p => ({ ...p, [side]: Math.max(150, Math.min(500, width + (ev.clientX - start) * (side === 'left' ? 1 : -1))) }));
        const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
    };
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
    const activeLibrary = useMemo(() => allLibraries.find((l) => l.id === selectedLibId) ?? allLibraries[0], [allLibraries, selectedLibId]);
    const displayedLibComps = useMemo(() => {
        const q = searchCompQuery.trim().toLowerCase();
        const comps = q ? allLibraries.flatMap((lib) => lib.components) : activeLibrary?.components ?? [];
        const filtered = q
            ? comps.filter((c) => c.name.toLowerCase().includes(q) ||
                c.gostStandard.toLowerCase().includes(q) ||
                c.refDesPrefix.toLowerCase().includes(q) ||
                c.defaultValue.toLowerCase().includes(q))
            : comps;
        return sortLibsAlpha ? [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'ru')) : filtered;
    }, [activeLibrary, allLibraries, searchCompQuery, sortLibsAlpha]);
    const previewComponentDef = useMemo(() => findComponentById(selectedLibCompId, customCompMap) ?? displayedLibComps[0] ?? null, [selectedLibCompId, customCompMap, displayedLibComps]);
    const previewPatternDef = useMemo(() => {
        if (!previewComponentDef?.patternId)
            return null;
        const customPatMap = Object.fromEntries(userPatterns.map((p) => [p.id, p]));
        return findPatternById(previewComponentDef.patternId, {
            ...project.customPatternDefs,
            ...customPatMap
        }) ?? null;
    }, [previewComponentDef, project.customPatternDefs, userPatterns]);
    const selectedPlacedComp = useMemo(() => selectedCompIds.length > 0
        ? activeSheet.components.find((c) => c.id === selectedCompIds[0]) ?? null
        : null, [activeSheet.components, selectedCompIds]);
    const inspectorCompDef = useMemo(() => {
        if (selectedPlacedComp) {
            return findComponentById(selectedPlacedComp.componentDefId, customCompMap) ?? null;
        }
        return previewComponentDef;
    }, [selectedPlacedComp, customCompMap, previewComponentDef]);
    const schematicNets = useMemo(() => extractSchematicNets(project), [project]);
    const confirmDiscardIfDirty = useCallback(() => {
        if (!isDirty)
            return true;
        return window.confirm('Текущий проект схемы изменён. Продолжить без сохранения?');
    }, [isDirty]);
    // Domain actions
    const handleNewProject = useCallback(() => {
        if (!confirmDiscardIfDirty())
            return;
        setShowNewProjectDialog(true);
    }, [confirmDiscardIfDirty]);
    const handleCreateProjectFromDialog = useCallback((opts: NewProjectOptions) => {
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
    }, [onSwitchModule, replaceProject]);
    const handleOpenFile = useCallback(async () => {
        if (!confirmDiscardIfDirty())
            return;
        const picked = await pickCadFile('.gostsch,.dch,.dchxml,.asc,.xml,.pdsprj,.sec,.sdf,.kicad_sch,.sch,.json,.esch,.schdoc,.edf,.cir,.dxf,.zip', [
            {
                name: 'Все поддерживаемые САПР (SIPTrace / DipTrace / Proteus / KiCad / Eagle / EasyEDA / Altium / ZIP)',
                extensions: ['gostsch', 'dch', 'dchxml', 'asc', 'xml', 'pdsprj', 'sec', 'sdf', 'kicad_sch', 'sch', 'json', 'esch', 'schdoc', 'edf', 'cir', 'dxf', 'zip']
            }
        ]);
        if (!picked)
            return;
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
            setStatusMessage(`Открыто (${res.detectedFormat}): ${picked.name} — элементов: ${res.project.sheets[0]?.components.length ?? 0}`);
            if (res.report.items.length > 0 || res.report.convertedComponents > 0 || (res.report.warnings?.length ?? 0) > 0) {
                setConversionReport(res.report);
            }
        }
        catch (err) {
            setStatusMessage(`Ошибка импорта файла: ${(err as Error).message}`);
        }
    }, [confirmDiscardIfDirty, replaceProject]);
    const handleExportTextFile = useCallback(async (filename: string, content: string, ext: string, desc = 'Файл SIPTrace') => {
        const msg = await exportTextFileViaNativeOrBrowser(filename, content, ext, desc);
        if (msg)
            setStatusMessage(msg);
    }, []);
    const handleSaveFile = useCallback(async (saveAs = false) => {
        const json = serializeSchematic(project);
        const savedName = await saveTextFile(project.filePath || `${project.projectName}.gostsch`, json, [{ name: 'Схема SIPTrace', extensions: ['gostsch', 'json'] }], { saveKey: 'schematic', saveAs });
        if (!savedName)
            return;
        commitProject((prev) => ({ ...prev, filePath: savedName }), false);
        markProjectSaved();
        recordRecentProject({
            id: `proj_sch_${project.projectName}`,
            name: project.projectName,
            designation: activeSheet.titleBlock.designation || savedName,
            module: 'schematic'
        }, { schematic: project, pcb: loadActivePcb() });
        setStatusMessage(`Схема сохранена: ${savedName}`);
    }, [project, activeSheet.titleBlock.designation, commitProject, markProjectSaved]);
    const handleRunErc = useCallback(() => {
        const errs = runSchematicErc(project, ercSettings);
        setErcRevision(project);
        setErcErrors(errs);
        setManagerTab('erc');
        const eCnt = errs.filter((e) => e.severity === 'Error').length;
        const wCnt = errs.filter((e) => e.severity === 'Warning').length;
        setStatusMessage(errs.length === 0
            ? 'Проверка ERC: Нарушений не обнаружено!'
            : `Проверка ERC: ошибок ${eCnt}, предупреждений ${wCnt}.`);
    }, [project, ercSettings]);
    const handleConvertToPcb = useCallback(() => {
        const existing = loadActivePcb();
        let converted;
        try {
            converted = convertSchematicToPcb(project, existing);
        }
        catch (error) {
            setStatusMessage(String(error));
            return;
        }
        saveActivePcb(converted);
        broadcastEdaEvent('pcb:updated', converted);
        setStatusMessage(`Преобразовано в печатную плату: ${converted.components.length} компонентов, ${converted.netClasses.length} классов цепей.`);
        openAppModule('pcb', (m) => onSwitchModule?.(m));
    }, [project, onSwitchModule]);
    const handleUpdatePcbFromSchematic = useCallback(() => {
        const existing = loadActivePcb();
        let updated;
        try {
            updated = convertSchematicToPcb(project, existing);
        }
        catch (error) {
            setStatusMessage(String(error));
            return;
        }
        saveActivePcb(updated);
        broadcastEdaEvent('pcb:updated', updated);
        setStatusMessage(`Плата обновлена по схеме (${updated.components.length} корпусов).`);
    }, [project]);
    const handleRunSpice = useCallback((mode: 'DC' | 'Transient' | 'AC' = 'Transient') => {
        const res = runBuiltInSpiceSimulation(project, mode);
        setSpiceResult(res);
        setStatusMessage(res.message);
    }, [project]);
    // Every editing command uses the same typed selection and topology transform.
    const deleteSelection = useCallback(() => {
        if (!selectedIds.length)
            return;
        updateActiveSheet(s => deleteEntities(s, selectedIds));
        setSelectedIds([]);
        setContextMenu(null);
        setStatusMessage('Выделенные объекты удалены.');
    }, [selectedIds, updateActiveSheet]);
    const rotateSelection = useCallback(() => {
        if (tool === 'placeComp' || tool === 'netPort') {
            setPlaceAngle(a => ((a + 90) % 360) as typeof a);
            return;
        }
        if (tool === 'paste' && pasteDraft) {
            setPasteDraft(s => s ? transformEntities(s, allIds(s), { rotate: 90 }, customCompMap) : s);
            return;
        }
        if (selectedIds.length)
            updateActiveSheet(s => transformEntities(s, selectedIds, { rotate: 90 }, customCompMap));
    }, [tool, pasteDraft, selectedIds, updateActiveSheet, customCompMap]);
    const flipSelection = useCallback((axis: 'X' | 'Y') => {
        if (tool === 'placeComp') {
            if (axis === 'X')
                setPlaceFlipX(v => !v);
            else
                setPlaceFlipY(v => !v);
            return;
        }
        if (tool === 'paste' && pasteDraft) {
            setPasteDraft(s => s ? transformEntities(s, allIds(s), { flip: axis }, customCompMap) : s);
            return;
        }
        if (selectedIds.length)
            updateActiveSheet(s => transformEntities(s, selectedIds, { flip: axis }, customCompMap));
    }, [tool, pasteDraft, selectedIds, updateActiveSheet, customCompMap]);
    const handleAlignSelection = useCallback((axis: 'x' | 'y') => {
        if (selectedIds.length < 2) {
            setStatusMessage('Выделите минимум два объекта.');
            return;
        }
        updateActiveSheet(s => {
            const anchor = selectionBounds(s, [selectedIds[0]], customCompMap);
            let next = s;
            for (const id of selectedIds.slice(1)) {
                const b = selectionBounds(next, [id], customCompMap);
                next = transformEntities(next, [id], { dx: axis === 'x' ? (anchor.minX + anchor.maxX - b.minX - b.maxX) / 2 : 0, dy: axis === 'y' ? (anchor.minY + anchor.maxY - b.minY - b.maxY) / 2 : 0 }, customCompMap);
            }
            return next;
        });
    }, [selectedIds, updateActiveSheet, customCompMap]);
    const onCopy = useCallback(() => {
        if (!selectedIds.length)
            return;
        copyFragment(project, activeSheet, selectedIds);
        setClipboardComps(activeSheet.components.filter(c => selectedCompIds.includes(c.id)));
        setClipboardVersion(v => v + 1);
        setStatusMessage(`Скопировано объектов: ${selectedIds.length}.`);
    }, [project, activeSheet, selectedIds]);
    useEffect(() => {
        if (selectedCompIds.length !== 1)
            return;
        const comp = activeSheet.components.find((c) => c.id === selectedCompIds[0]);
        if (comp)
            broadcastEdaEvent('crossprobe:refdes', { refDes: comp.refDes });
    }, [selectedCompIds, activeSheet.components]);
    // Canvas interactions & viewport
    const { viewport, displaySheet, cursorMm, zoomPercent, setZoomByPercent, zoomToFit, centerOnWorldPt, snapWorldSmart, hoverTarget, handleCanvasMouseDown, handleCanvasMouseMove, handleCanvasMouseUp, handleCanvasDoubleClick, handleCanvasWheel, handleContextMenu } = useSchematicInteraction({
        canvasRef,
        canvasWrapRef,
        project,
        activeSheet,
        customCompMap: drawingDefinitions,
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
        selectedIds,
        setSelectedIds,
        openProperties,
        pasteDefinitions,
        pasteDraft,
        setPasteDraft,
        setContextMenu,
        setStatusMessage,
        commitProject,
        pushUndoSnapshot,
        updateActiveSheet
    });
    const onPaste = useCallback(() => {
        const source = getClipboard();
        if (!source)
            return;
        const mergedDefs = { ...source.componentDefs, ...project.customComponentDefs };
        const pasted = pasteFragment(project, source, cursorMm, mergedDefs);
        setPasteDefinitions({ components: pasted.componentDefs, patterns: pasted.patternDefs });
        setPasteDraft(pasted.sheet);
        setSelectedIds([]);
        setTool('paste');
        setStatusMessage('Вставка: ЛКМ — установить, R/X/Y — преобразовать, ПКМ/Esc — отменить.');
    }, [project, cursorMm]);
    const onCut = useCallback(() => { onCopy(); deleteSelection(); }, [onCopy, deleteSelection]);
    const onDuplicate = useCallback(() => { onCopy(); onPaste(); }, [onCopy, onPaste]);
    const onNudge = useCallback((x: number, y: number) => updateActiveSheet(s => transformEntities(s, selectedIds, { dx: x * project.gridSize, dy: y * project.gridSize }, customCompMap)), [selectedIds, project.gridSize, customCompMap, updateActiveSheet]);
    useSchematicHotkeys({ hotkeys, tool, wireDraftPts, setWireDraftPts, setTool, setElbowFlip, updateActiveSheet,
        handleNewProject, handleOpenFile, handleUndo, handleRedo, handleSaveFile: () => handleSaveFile(false), handleSaveAs: () => handleSaveFile(true),
        handleConvertToPcb, deleteSelection, rotateSelection, flipSelection, zoomToFit, handleRunErc,
        onPrint: () => printSchematicProject(project, customCompMap), onCopy, onPaste, onCut, onDuplicate, onSelectAll: () => setSelectedIds(allIds(activeSheet)), onProperties: () => openProperties(selectedIds), onNudge,
        onFind: () => setShowFindDialog(true), onGrid: () => setShowGrid(v => !v), onZoom: (factor) => setZoomByPercent(zoomPercent * factor) });
    useEffect(() => { setErcErrors([]); }, [project]);
    // Canvas render loop
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = canvasWrapRef.current;
        if (!canvas || !container)
            return;
        renderSchematicCanvas({
            canvas,
            container,
            activeSheet: displaySheet,
            origin: project.origin,
            gridSize: project.gridSize,
            viewport,
            colorScheme: settings.colorScheme,
            showGrid,
            customCompMap: drawingDefinitions,
            selectedCompIds,
            selectedWireId,
            selectedPortId,
            selectedIds,
            hoverTarget,
            pasteDraft,
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
        activeSheet, displaySheet,
        selectedIds, hoverTarget, pasteDraft,
        project.origin,
        project.gridSize,
        viewport,
        settings.colorScheme,
        showGrid,
        customCompMap, drawingDefinitions,
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
    const topMenus = useMemo(() => createSchematicTopMenus({
        project,
        activeSheet,
        customCompMap,
        historyLength: history.length,
        redoLength: redoStack.length,
        selectedCompIds,
        clipboardComps,
        setClipboardComps,
        onCopy, onPaste, onCut, onDuplicate, canPaste: !!getClipboard(), selectedIds, hotkeys, onProperties: () => openProperties(selectedIds),
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
    }), [
        project,
        activeSheet,
        customCompMap,
        history.length,
        redoStack.length,
        selectedCompIds,
        clipboardComps, clipboardVersion, selectedIds, onCopy, onPaste, onCut, onDuplicate,
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
    ]);
    const bomEntries = useMemo(() => (showBomDialog ? generateGostBom(project) : []), [showBomDialog, project]);
    return (<div className="dt-schematic" style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#f0f0f0', '--sch-left': `${panelWidths.left}px`, '--sch-right': `${panelWidths.right}px` } as React.CSSProperties}>
      <MenuBar menus={topMenus} onBrandClick={() => openAppModule('launcher', (m) => onSwitchModule?.(m))}/>

      <SchematicToolbar onCopy={onCopy} onPaste={onPaste} canPaste={!!getClipboard()} selectionCount={selectedIds.length} hotkeys={hotkeys} project={project} activeSheet={activeSheet} historyLength={history.length} redoLength={redoStack.length} selectedCompIds={selectedCompIds} clipboardComps={clipboardComps} setClipboardComps={setClipboardComps} zoomPercent={zoomPercent} setZoomByPercent={setZoomByPercent} tool={tool} setTool={setTool} setWireDraftPts={setWireDraftPts} setShapeStartPt={setShapeStartPt} commitProject={commitProject} updateActiveSheet={updateActiveSheet} handleNewProject={handleNewProject} handleOpenFile={handleOpenFile} handleSaveFile={() => handleSaveFile(false)} setShowTitleDialog={setShowTitleDialog} setShowBomDialog={setShowBomDialog} handleUndo={handleUndo} handleRedo={handleRedo} zoomToFit={zoomToFit} setShowFindDialog={setShowFindDialog} handleRunErc={handleRunErc} handleRunSpice={() => handleRunSpice('Transient')} handleConvertToPcb={handleConvertToPcb}/>

      <div className="dt-workspace">
        <SchematicLeftSidebar allLibraries={allLibraries} selectedLibId={selectedLibId} setSelectedLibId={setSelectedLibId} selectedLibCompId={selectedLibCompId} setSelectedLibCompId={setSelectedLibCompId} selectedPartIndex={selectedPartIndex} setSelectedPartIndex={setSelectedPartIndex} placeExpanded={placeExpanded} setPlaceExpanded={setPlaceExpanded} toolsExpanded={toolsExpanded} setToolsExpanded={setToolsExpanded} sortLibsAlpha={sortLibsAlpha} setSortLibsAlpha={setSortLibsAlpha} searchCompQuery={searchCompQuery} setSearchCompQuery={setSearchCompQuery} displayedLibComps={displayedLibComps} previewComponentDef={previewComponentDef} previewPatternDef={previewPatternDef} netPortStyle={netPortStyle} setNetPortStyle={setNetPortStyle} netPortLabel={netPortLabel} setNetPortLabel={setNetPortLabel} autoPowerCheck={autoPowerCheck} setAutoPowerCheck={setAutoPowerCheck} setTool={setTool} setStatusMessage={setStatusMessage}/>

        <div className="dt-splitter" role="separator" aria-label="Ширина библиотеки" tabIndex={0} onPointerDown={e => resizePanel('left', e)} onKeyDown={e => { if (e.key.startsWith('Arrow'))
        setPanelWidths(p => ({ ...p, left: Math.max(150, Math.min(500, p.left + (e.key === 'ArrowRight' ? 10 : -10))) })); }}/>
        <div className="dt-center-col">
          <div className="dt-canvas-wrap" ref={canvasWrapRef}>
            <canvas ref={canvasRef} style={{
            display: 'block',
            width: '100%',
            height: '100%',
            cursor: tool === 'select' ? (hoverTarget ? 'crosshair' : 'default') : 'crosshair', touchAction: 'none'
        }} tabIndex={0} aria-label="Редактор электрической схемы" onPointerDown={handleCanvasMouseDown} onPointerMove={handleCanvasMouseMove} onPointerUp={handleCanvasMouseUp} onDoubleClick={handleCanvasDoubleClick} onWheel={handleCanvasWheel} onContextMenu={handleContextMenu}/>
          </div>
          <SchematicSheetBar project={project} activeSheet={activeSheet} commitProject={commitProject}/>
        </div>

        <div className="dt-splitter" role="separator" aria-label="Ширина свойств" tabIndex={0} onPointerDown={e => resizePanel('right', e)}/>
        <SchematicRightSidebar selectedIds={selectedIds} onProperties={() => openProperties(selectedIds)} ercStale={ercRevision !== project} project={project} activeSheet={activeSheet} userPatterns={userPatterns} selectedPlacedComp={selectedPlacedComp} inspectorCompDef={inspectorCompDef} selectedPartIndex={selectedPartIndex} selectedWireId={selectedWireId} selectedPortId={selectedPortId} selectedCompIds={selectedCompIds} setSelectedCompIds={setSelectedCompIds} managerTab={managerTab} setManagerTab={setManagerTab} schematicNets={schematicNets} highlightedNet={highlightedNet} setHighlightedNet={setHighlightedNet} ercErrors={ercErrors} setShowTitleDialog={setShowTitleDialog} onCenterWorldPt={centerOnWorldPt} commitProject={commitProject} updateActiveSheet={updateActiveSheet}/>
      </div>

      <StatusBar hint={`${statusMessage} | ${autosaveStatus}${isDirty ? " | Изменения не записаны в файл" : ""}`} extraCenter={`Лист: ${activeSheet.name} | Элементов: ${activeSheet.components.filter((c) => !c.refDes.startsWith('#')).length} | Цепей: ${schematicNets.length}`} gridMm={project.gridSize} units={project.units} cursorX={cursorMm.x} cursorY={cursorMm.y} onToggleUnits={() => commitProject((prev) => ({
            ...prev,
            units: prev.units === 'mm' ? 'mil' : prev.units === 'mil' ? 'in' : 'mm'
        }), false)}/>

      {propertiesIds && <SchematicObjectDialog project={project} sheet={activeSheet} ids={propertiesIds} defs={customCompMap} onApply={(next) => { updateActiveSheet(() => next); setPropertiesIds(null); }} onClose={() => setPropertiesIds(null)}/>}
      {contextMenu && (<SchematicContextMenu menu={contextMenu} onProperties={() => openProperties(contextMenu.ids ?? selectedIds)} onCopy={onCopy} onPaste={onPaste} hotkeys={hotkeys} onWireAction={(action) => { if (contextMenu.wireId)
            updateActiveSheet(s => editWire(s, contextMenu.wireId!, cursorMm, action)); }} onRotate={rotateSelection} onFlipX={() => flipSelection('X')} onFlipY={() => flipSelection('Y')} onDelete={deleteSelection} onClose={() => setContextMenu(null)}/>)}

      {showTitleDialog && (<TitleBlockDialog format={activeSheet.format} titleBlock={activeSheet.titleBlock} onApply={(fmt, tb) => {
                updateActiveSheet((s) => ({ ...s, format: fmt, titleBlock: tb }));
                setShowTitleDialog(false);
            }} onClose={() => setShowTitleDialog(false)}/>)}

      {showBomDialog && (<GostBomDialog project={project} entries={bomEntries} onSaveFile={(fn, content, ext) => handleExportTextFile(fn, content, ext)} onInsertAsTable={(entries) => {
                const tbl = buildBomTableShape(entries, activeSheet.format, activeSheet.titleBlock);
                updateActiveSheet((s) => ({ ...s, shapes: [...s.shapes.filter(sh => sh.source !== 'bom'), tbl] }));
                setShowBomDialog(false);
                setStatusMessage('Таблица Перечня элементов (ПЭ3) вставлена на лист схемы.');
            }} onClose={() => setShowBomDialog(false)}/>)}

      {spiceResult && (<SpiceSimDialog result={spiceResult} onExportNetlist={(txt) => handleExportTextFile(`${project.projectName}.cir`, txt, 'cir', 'SPICE Netlist')} onRunMode={(m, stopMs) => {
                const res = runBuiltInSpiceSimulation(project, m, stopMs);
                setSpiceResult(res);
            }} onClose={() => setSpiceResult(null)}/>)}

      {showFindDialog && (<SchFindDialog components={project.sheets.flatMap(s => s.components.map(c => ({ ...c, sheetId: s.id, sheetName: s.name })))} nets={schematicNets} onSelectComp={(id, x, y) => {
                const targetSheet = project.sheets.find(s => s.components.some(c => c.id === id));
                if (targetSheet)
                    commitProject(p => ({ ...p, activeSheetId: targetSheet.id }), false);
                setTimeout(() => { setSelectedIds([id]); centerOnWorldPt(x, y); }, 0);
                setHighlightedNet(null);
                setStatusMessage('Компонент выделен.');
            }} onSelectNet={(netName) => {
                setHighlightedNet(netName);
                setSelectedCompIds([]);
                setManagerTab('nets');
                setStatusMessage(`Выделена цепь «${netName}».`);
            }} onClose={() => setShowFindDialog(false)}/>)}

      {showNetClassesDialog && (<SchNetClassesDialog netClasses={project.netClasses} onSave={(netClasses) => { commitProject(p => ({ ...p, netClasses })); setShowNetClassesDialog(false); }} onClose={() => setShowNetClassesDialog(false)}/>)}

      {showColorDialog && (<ColorSettingsDialog scheme={settings.colorScheme} onApply={(scheme) => {
                setSettings((prev) => {
                    const next = { ...prev, colorScheme: scheme };
                    saveSettings(next);
                    return next;
                });
            }} onClose={() => setShowColorDialog(false)}/>)}

      {showErcSettingsDialog && (<SchErcSettingsDialog ercSettings={ercSettings} setErcSettings={setErcSettings} onRunNow={handleRunErc} onClose={() => setShowErcSettingsDialog(false)}/>)}

      {showHotkeysDialog && (<HotkeySettingsDialog hotkeys={hotkeys} onSave={(next) => {
                setHotkeys(next);
                saveHotkeys(next);
            }} onClose={() => setShowHotkeysDialog(false)}/>)}

      {showNewProjectDialog && (<NewProjectDialog initialMode="schematic_and_pcb" onCreate={handleCreateProjectFromDialog} onClose={() => setShowNewProjectDialog(false)}/>)}

      {conversionReport && (<GostConversionDialog report={conversionReport} onClose={() => setConversionReport(null)}/>)}
    </div>);
};
