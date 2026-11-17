import {
  GostAccuracyClass,
  PcbProject,
  SchematicProject,
  SheetFormatId,
  Units
} from '../models';
import { createGostDesignRules } from '../../gost/gostRules';
import { createDefaultGostTitleBlock } from '../../gost/gostTitleBlock';
import {
  createDemoMcuGostSchematic,
  createDemoRs485GostSchematic,
  createDemoRs485Pcb
} from '../../gost/demoProjects';
import {
  importCadPcb,
  importCadSchematic,
  importExternalCadLibrary
} from '../../engines/importers';
import { convertSchematicToPcb, createDefaultPcbLayers } from '../../engines/netlist';
import { buildBoardOutlinePolygon } from '../../ui/modules/pcb/services/pcbActionsService';
import { clearSavedFileHandle, PickedCadFile } from '../utils/fileIo';
import { utf8Decode } from '../utils/zipArchive';
import { broadcastEdaEvent } from './eventBus';
import { registerImportedLibraryBundle } from './libraryStore';
import { loadActivePcb, loadActiveSchematic, saveActivePcb, saveActiveSchematic } from './projectStore';
import { loadSettings, recordRecentProject } from './settingsStore';
import { STORAGE_KEYS } from './storageKeys';

export type NewProjectMode = 'schematic_and_pcb' | 'schematic_only' | 'pcb_only' | 'demo_rs485' | 'demo_mcu';

export interface NewProjectOptions {
  mode: NewProjectMode;
  projectName: string;
  titleName: string;
  designation: string;
  sheetFormat: SheetFormatId;
  boardWidthMm: number;
  boardHeightMm: number;
  boardCornerRadiusMm: number;
  boardIsCircle: boolean;
  boardLayers: 2 | 4;
  accuracyClass: GostAccuracyClass;
  units: Units;
  developer: string;
  checker: string;
  normControl: string;
  organization: string;
}

export interface CreatedProjectResult {
  targetModule: 'schematic' | 'pcb';
  schematic?: SchematicProject;
  pcb: PcbProject;
  statusMessage: string;
}

export interface OpenedProjectFileResult {
  targetModule: 'schematic' | 'pcb' | 'componentEditor' | 'patternEditor';
  detectedFormat: string;
  report?: import('../../engines/importers').GostConversionReport;
  statusMessage: string;
}

function formatTodayDate(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function buildDefaultNewProjectOptions(defaultMode: NewProjectMode = 'schematic_and_pcb'): NewProjectOptions {
  const s = loadSettings();
  return {
    mode: defaultMode,
    projectName: 'Новый_проект',
    titleName: 'Новое устройство',
    designation: 'АБВГ.000000.001',
    sheetFormat: 'A4_L',
    boardWidthMm: 100,
    boardHeightMm: 70,
    boardCornerRadiusMm: 2,
    boardIsCircle: false,
    boardLayers: 2,
    accuracyClass: s.defaultAccuracyClass,
    units: s.units,
    developer: s.authorName,
    checker: s.checkerName ?? '',
    normControl: s.normControlName ?? '',
    organization: s.organization
  };
}

/** Creates a blank linked PCB shell inheriting project name, units, layers, and GOST rules. */
export function createBlankPcbProject(opts: {
  projectName: string;
  units: Units;
  accuracyClass: GostAccuracyClass;
  boardWidthMm?: number;
  boardHeightMm?: number;
  boardCornerRadiusMm?: number;
  boardIsCircle?: boolean;
  boardLayers?: 2 | 4;
  linkedSchematicPath?: string;
}): PcbProject {
  const layerCount = opts.boardLayers ?? 2;
  const outline = buildBoardOutlinePolygon(
    opts.boardWidthMm ?? 100,
    opts.boardHeightMm ?? 70,
    opts.boardCornerRadiusMm ?? 2,
    Boolean(opts.boardIsCircle)
  );

  return {
    version: '1.0',
    filePath: '',
    linkedSchematicPath: opts.linkedSchematicPath,
    projectName: opts.projectName,
    units: opts.units,
    gridSize: 1.25,
    boardThickness: 1.6,
    soldermaskColor: '#0d5e2e',
    silkscreenColor: '#ffffff',
    surfaceFinish: 'ENIG',
    layerCount,
    origin: { x: 0, y: 0 },
    boardOutline: outline,
    cutouts: [],
    keepouts: [],
    layers: createDefaultPcbLayers(layerCount),
    components: [],
    traces: [],
    vias: [],
    copperPours: [],
    shapes: [],
    netClasses: [
      {
        id: 'nc_default',
        name: 'Сигнальные',
        traceWidth: 0.25,
        minWidth: 0.15,
        maxWidth: 5,
        clearance: 0.2,
        viaOuterDiameter: 0.7,
        viaHoleDiameter: 0.35
      }
    ],
    netClassAssignments: {},
    diffPairs: [],
    designRules: createGostDesignRules(opts.accuracyClass),
    teardropsEnabled: false
  };
}

/** Creates an editable schematic without changing the active document. */
export function createBlankSchematicProject(opts: NewProjectOptions): SchematicProject {
  const safeName = opts.projectName.trim() || 'Новый_проект';
  const safeTitle = opts.titleName.trim() || safeName;
  const baseDes = opts.designation.trim() || 'АБВГ.000000.001';
  const schDesignation = /\sЭ3$/i.test(baseDes) ? baseDes : `${baseDes} Э3`;
  return {
    version: '1.0',
    filePath: '',
    projectName: safeName,
    units: opts.units,
    gridSize: 2.5,
    origin: { x: 0, y: 0 },
    sheets: [
      {
        id: 'sheet_1',
        name: 'Лист 1',
        format: opts.sheetFormat,
        titleBlock: createDefaultGostTitleBlock({
          name: safeTitle,
          designation: schDesignation,
          developer: opts.developer,
          checker: opts.checker,
          normControl: opts.normControl,
          organization: opts.organization,
          date: formatTodayDate()
        }),
        components: [],
        wires: [],
        buses: [],
        busTaps: [],
        junctions: [],
        netPorts: [],
        diffPairs: [],
        hierarchyBlocks: [],
        shapes: []
      }
    ],
    activeSheetId: 'sheet_1',
    netClasses: [
      {
        id: 'nc_default',
        name: 'Сигнальные',
        traceWidth: 0.25,
        minWidth: 0.15,
        maxWidth: 5,
        clearance: 0.2,
        viaOuterDiameter: 0.7,
        viaHoleDiameter: 0.35
      }
    ],
    netClassAssignments: {},
    customComponentDefs: {},
    customPatternDefs: {}
  };
}

/** Creates and persists a new project (Schematic + PCB, PCB-only, or Demo) and clears old disk save handles. */
export function createProjectFromOptions(
  opts: NewProjectOptions,
  preferredModule?: 'schematic' | 'pcb'
): CreatedProjectResult {
  clearSavedFileHandle('schematic');
  clearSavedFileHandle('pcb');

  const safeName = opts.projectName.trim() || 'Новый_проект';
  const safeTitle = opts.titleName.trim() || safeName;
  const baseDes = opts.designation.trim() || 'АБВГ.000000.001';

  if (opts.mode === 'demo_rs485') {
    const sch = createDemoRs485GostSchematic();
    const pcb = createDemoRs485Pcb();
    sch.units = opts.units;
    pcb.units = opts.units;
    saveActiveSchematic(sch);
    saveActivePcb(pcb);
    broadcastEdaEvent('pcb:updated', pcb);
    const targetModule = preferredModule ?? 'schematic';
    recordRecentProject({
      id: 'rec_rs485_' + targetModule,
      name: sch.projectName,
      designation: sch.sheets[0]?.titleBlock.designation || 'ГТРС.468364.001',
      module: targetModule,
      demoKey: 'rs485'
    }, { schematic: sch, pcb });
    return {
      targetModule,
      schematic: sch,
      pcb,
      statusMessage: 'Открыт демонстрационный проект «Гальваническая развязка RS-485».'
    };
  }

  if (opts.mode === 'demo_mcu') {
    const sch = createDemoMcuGostSchematic();
    const pcb = convertSchematicToPcb(sch);
    sch.units = opts.units;
    pcb.units = opts.units;
    pcb.designRules = createGostDesignRules(opts.accuracyClass);
    saveActiveSchematic(sch);
    saveActivePcb(pcb);
    broadcastEdaEvent('pcb:updated', pcb);
    const targetModule = preferredModule ?? 'schematic';
    recordRecentProject({
      id: 'rec_mcu_' + targetModule,
      name: sch.projectName,
      designation: sch.sheets[0]?.titleBlock.designation || 'ГТРС.468364.005',
      module: targetModule,
      demoKey: 'mcu'
    }, { schematic: sch, pcb });
    return {
      targetModule,
      schematic: sch,
      pcb,
      statusMessage: 'Открыт демонстрационный проект «Контроллер К1986ВЕ92QI».'
    };
  }

  if (opts.mode === 'schematic_only') {
    const schematic = createBlankSchematicProject(opts);
    const schDesignation = schematic.sheets[0].titleBlock.designation;

    saveActiveSchematic(schematic);
    const blankPcb = createBlankPcbProject({
      projectName: safeName,
      units: opts.units,
      accuracyClass: opts.accuracyClass
    });
    recordRecentProject(
      {
        id: `proj_sch_${safeName}`,
        name: safeName,
        designation: schDesignation,
        module: 'schematic'
      },
      { schematic }
    );

    return {
      targetModule: 'schematic',
      schematic,
      pcb: blankPcb,
      statusMessage: `Создана новая схема «${safeName}» (${schDesignation}, ${opts.sheetFormat}).`
    };
  }

  if (opts.mode === 'pcb_only') {
    const pcb = createBlankPcbProject({
      projectName: safeName,
      units: opts.units,
      accuracyClass: opts.accuracyClass,
      boardWidthMm: opts.boardWidthMm,
      boardHeightMm: opts.boardHeightMm,
      boardCornerRadiusMm: opts.boardCornerRadiusMm,
      boardIsCircle: opts.boardIsCircle,
      boardLayers: opts.boardLayers
    });
    saveActivePcb(pcb);
    broadcastEdaEvent('pcb:updated', pcb);
    recordRecentProject(
      {
        id: `proj_pcb_${safeName}`,
        name: safeName,
        designation: baseDes + ' ПП',
        module: 'pcb'
      },
      { pcb }
    );
    return {
      targetModule: 'pcb',
      pcb,
      statusMessage: `Создана новая плата «${safeName}» (${opts.boardWidthMm}×${opts.boardHeightMm} мм, класс ${opts.accuracyClass}).`
    };
  }

  // Default: schematic_and_pcb
  const schDesignation = /\sЭ3$/i.test(baseDes) ? baseDes : `${baseDes} Э3`;
  const schematic: SchematicProject = {
    version: '1.0',
    filePath: '',
    projectName: safeName,
    units: opts.units,
    gridSize: 2.5,
    origin: { x: 0, y: 0 },
    sheets: [
      {
        id: 'sheet_1',
        name: 'Лист 1',
        format: opts.sheetFormat,
        titleBlock: createDefaultGostTitleBlock({
          name: safeTitle,
          designation: schDesignation,
          developer: opts.developer,
          checker: opts.checker,
          normControl: opts.normControl,
          organization: opts.organization,
          date: formatTodayDate()
        }),
        components: [],
        wires: [],
        buses: [],
        busTaps: [],
        junctions: [],
        netPorts: [],
        diffPairs: [],
        hierarchyBlocks: [],
        shapes: []
      }
    ],
    activeSheetId: 'sheet_1',
    netClasses: [
      {
        id: 'nc_default',
        name: 'Сигнальные',
        traceWidth: 0.25,
        minWidth: 0.15,
        maxWidth: 5,
        clearance: 0.2,
        viaOuterDiameter: 0.7,
        viaHoleDiameter: 0.35
      }
    ],
    netClassAssignments: {},
    customComponentDefs: {},
    customPatternDefs: {}
  };

  const pcb = createBlankPcbProject({
    projectName: safeName,
    units: opts.units,
    accuracyClass: opts.accuracyClass,
    boardLayers: opts.boardLayers
  });

  saveActiveSchematic(schematic);
  saveActivePcb(pcb);
  broadcastEdaEvent('pcb:updated', pcb);
  recordRecentProject(
    {
      id: `proj_sch_${safeName}`,
      name: safeName,
      designation: schDesignation,
      module: 'schematic'
    },
    { schematic, pcb }
  );

  return {
    targetModule: 'schematic',
    schematic,
    pcb,
    statusMessage: `Создан новый проект «${safeName}» (${schDesignation}).`
  };
}

function storePendingConversionReport(report?: import('../../engines/importers').GostConversionReport): void {
  if (!report) return;
  if (report.sourceFormat === 'SIPTrace' && report.items.length === 0) return;
  try {
    sessionStorage.setItem(STORAGE_KEYS.PENDING_CONVERSION, JSON.stringify(report));
  } catch {
    // ignore storage limits
  }
}

/** Consumes a one-shot GOST conversion report queued when opening a file from Launcher. */
export function consumePendingConversionReport(): import('../../engines/importers').GostConversionReport | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.PENDING_CONVERSION);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEYS.PENDING_CONVERSION);
    return JSON.parse(raw) as import('../../engines/importers').GostConversionReport;
  } catch {
    return null;
  }
}

/** Auto-detects file kind (schematic, PCB, or library) from Launcher "Открыть..." and loads it into storage. */
export async function openPickedProjectFile(picked: PickedCadFile): Promise<OpenedProjectFileResult> {
  const lower = picked.name.toLowerCase();

  let looksLikeLibJson = false;
  if (lower.endsWith('.json')) {
    try {
      const parsed = JSON.parse(utf8Decode(picked.bytes)) as {
        boardOutline?: unknown;
        sheets?: unknown;
        components?: unknown;
        patterns?: unknown;
        shape?: unknown;
        packageDetail?: unknown;
        head?: { c_para?: unknown };
      };
      if (!Array.isArray(parsed.sheets) && !Array.isArray(parsed.boardOutline)) {
        looksLikeLibJson =
          Array.isArray(parsed.components) ||
          Array.isArray(parsed.patterns) ||
          Array.isArray(parsed.shape) ||
          Boolean(parsed.packageDetail || parsed.head?.c_para);
      }
    } catch {
      looksLikeLibJson = false;
    }
  }

  // 1. Library files (.gostlib, .eli, .lib, .kicad_sym, .kicad_mod, .lbr, EasyEDA JSON)
  if (/\.(gostlib|eli|lib|kicad_sym|kicad_mod|lbr)$/i.test(lower) || looksLikeLibJson) {
    const res = await importExternalCadLibrary(picked.bytes, picked.name, { adaptToGost: true });
    if (res.components.length === 0 && res.patterns.length === 0) {
      throw new Error(`В файле библиотеки ${picked.name} не найдено компонентов или корпусов.`);
    }
    registerImportedLibraryBundle({
      name: res.libraryName,
      sourceFormat: res.detectedFormat,
      sourceFile: picked.name,
      category: res.categories[0] || 'Импорт CAD',
      gostAdapted: true,
      components: res.components,
      patterns: res.patterns
    });
    if (res.components.length > 0) {
      return {
        targetModule: 'componentEditor',
        detectedFormat: res.detectedFormat,
        report: res.report,
        statusMessage: `Импортировано компонентов: ${res.components.length}${res.patterns.length > 0 ? `, корпусов: ${res.patterns.length}` : ''}`
      };
    }
    return {
      targetModule: 'patternEditor',
      detectedFormat: res.detectedFormat,
      report: res.report,
      statusMessage: `Импортировано корпусов: ${res.patterns.length}`
    };
  }

  // 2. Clearly PCB formats
  const looksLikePcbExt = /\.(gostpcb|dip|kicad_pcb|brd|epcb|pcbdoc|dxf|gbr|gtl|gbl|gko|gm1|drl|xln)$/i.test(lower);
  let looksLikePcbJson = false;
  if (lower.endsWith('.json')) {
    try {
      const parsed = JSON.parse(utf8Decode(picked.bytes)) as { boardOutline?: unknown; sheets?: unknown };
      looksLikePcbJson = Array.isArray(parsed.boardOutline) && !Array.isArray(parsed.sheets);
    } catch {
      looksLikePcbJson = false;
    }
  }

  if (looksLikePcbExt || looksLikePcbJson) {
    const res = await importCadPcb(picked.bytes, picked.name);
    res.pcb.filePath = picked.filePath;
    clearSavedFileHandle('pcb');
    saveActivePcb(res.pcb);
    storePendingConversionReport(res.report);
    recordRecentProject(
      {
        id: `proj_pcb_${res.pcb.projectName}`,
        name: res.pcb.projectName,
        designation: picked.name,
        module: 'pcb'
      },
      { pcb: res.pcb }
    );
    return {
      targetModule: 'pcb',
      detectedFormat: res.detectedFormat,
      report: res.report,
      statusMessage: `Открыта плата (${res.detectedFormat}): ${picked.name}`
    };
  }

  // 3. Clearly Schematic formats (never fall back to misleading PCB error)
  const looksLikeSchExt = /\.(gostsch|dch|dchxml|kicad_sch|sch|schdoc|cir|pdsprj|sec|sdf|esch)$/i.test(lower);
  if (looksLikeSchExt) {
    const res = await importCadSchematic(picked.bytes, picked.name);
    res.project.filePath = picked.filePath;
    clearSavedFileHandle('schematic');
    saveActiveSchematic(res.project);
    storePendingConversionReport(res.report);
    recordRecentProject(
      {
        id: `proj_sch_${res.project.projectName}`,
        name: res.project.projectName,
        designation: res.project.sheets[0]?.titleBlock.designation || picked.name,
        module: 'schematic'
      },
      { schematic: res.project, pcb: loadActivePcb() }
    );
    return {
      targetModule: 'schematic',
      detectedFormat: res.detectedFormat,
      report: res.report,
      statusMessage: `Открыта схема (${res.detectedFormat}): ${picked.name}`
    };
  }

  // 4. Ambiguous containers (.zip, .xml, .asc, .json) -> try schematic first, then PCB
  try {
    const res = await importCadSchematic(picked.bytes, picked.name);
    res.project.filePath = picked.filePath;
    clearSavedFileHandle('schematic');
    saveActiveSchematic(res.project);
    storePendingConversionReport(res.report);
    recordRecentProject(
      {
        id: `proj_sch_${res.project.projectName}`,
        name: res.project.projectName,
        designation: res.project.sheets[0]?.titleBlock.designation || picked.name,
        module: 'schematic'
      },
      { schematic: res.project }
    );
    return {
      targetModule: 'schematic',
      detectedFormat: res.detectedFormat,
      report: res.report,
      statusMessage: `Открыта схема (${res.detectedFormat}): ${picked.name}`
    };
  } catch {
    const res = await importCadPcb(picked.bytes, picked.name);
    res.pcb.filePath = picked.filePath;
    clearSavedFileHandle('pcb');
    saveActivePcb(res.pcb);
    storePendingConversionReport(res.report);
    recordRecentProject(
      {
        id: `proj_pcb_${res.pcb.projectName}`,
        name: res.pcb.projectName,
        designation: picked.name,
        module: 'pcb'
      },
      { pcb: res.pcb }
    );
    return {
      targetModule: 'pcb',
      detectedFormat: res.detectedFormat,
      report: res.report,
      statusMessage: `Открыта плата (${res.detectedFormat}): ${picked.name}`
    };
  }
}
