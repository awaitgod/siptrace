import { PcbPlacedComponent, PcbProject, PlacedComponent, SchWire, SchematicProject } from '../../core/types';
import { uid } from '../../core/geometry';
import { createDefaultGostTitleBlock } from '../../gost/gostTitleBlock';
import { createGostDesignRules } from '../../gost/gostRules';
import { loadSettings } from '../../core/store';
import { createDefaultPcbLayers } from '../netlist';

/** Builds a clean single-sheet SchematicProject shell for imported schematics. */
export function createImportedSchematicProject(opts: {
  filePath: string;
  projectName: string;
  titleName: string;
  components: PlacedComponent[];
  wires?: SchWire[];
}): SchematicProject {
  return {
    version: '1.0',
    filePath: opts.filePath,
    projectName: opts.projectName,
    units: 'mm',
    gridSize: 2.5,
    origin: { x: 0, y: 0 },
    activeSheetId: 'sheet_1',
    netClasses: [
      { id: 'nc_default', name: 'Сигнальные', traceWidth: 0.25, minWidth: 0.15, maxWidth: 5, clearance: 0.2, viaOuterDiameter: 0.7, viaHoleDiameter: 0.35 }
    ],
    netClassAssignments: {},
    customComponentDefs: {},
    customPatternDefs: {},
    sheets: [
      {
        id: 'sheet_1',
        name: 'Лист 1',
        format: 'A3_L',
        titleBlock: createDefaultGostTitleBlock({ name: opts.titleName }),
        components: opts.components,
        wires: opts.wires ?? [],
        buses: [],
        busTaps: [],
        junctions: [],
        netPorts: [],
        diffPairs: [],
        hierarchyBlocks: [],
        shapes: []
      }
    ]
  };
}

/** Creates a default 2-pad 2012M SMD placeholder footprint for imported PCB components. */
export function createPlaceholderChipComponent(opts: {
  idPrefix: string;
  refDes: string;
  value: string;
  typeName: string;
  x: number;
  y: number;
  emptyPads?: boolean;
}): PcbPlacedComponent {
  return {
    id: uid(opts.idPrefix),
    refDes: opts.refDes,
    value: opts.value,
    typeName: opts.typeName,
    patternId: 'PAT_CHIP_2012M',
    side: 'Top',
    x: opts.x,
    y: opts.y,
    angle: 0,
    showRefDes: true,
    showValue: false,
    refDesOffset: { x: 0, y: -2 },
    pads: opts.emptyPads
      ? []
      : [
          { id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: -0.95, y: 0, width: 1.0, height: 1.3, layer: 'Top' },
          { id: 'p2', number: '2', type: 'SMD', shape: 'Rect', x: 0.95, y: 0, width: 1.0, height: 1.3, layer: 'Top' }
        ],
    padNets: {},
    graphics: [{ type: 'rect', layer: 'TopSilk', x: -1.6, y: -0.9, w: 3.2, h: 1.8, width: 0.15 }],
    courtyard: { width: 4, height: 2.6 },
    model3d: { shape: 'ChipSMD', bodyWidth: 1.25, bodyLength: 2.0, bodyHeight: 0.6, color: '#b88958' }
  };
}

/** Builds a clean default PcbProject shell for imported boards. */
export function createImportedPcbProject(opts: {
  filePath: string;
  projectName: string;
  components: PcbPlacedComponent[];
}): PcbProject {
  return {
    version: '1.0',
    filePath: opts.filePath,
    projectName: opts.projectName,
    units: 'mm',
    gridSize: 1.25,
    boardThickness: 1.6,
    soldermaskColor: '#0d5e2e',
    silkscreenColor: '#ffffff',
    surfaceFinish: 'ENIG',
    layerCount: 2,
    origin: { x: 0, y: 0 },
    boardOutline: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 70 }, { x: 0, y: 70 }],
    cutouts: [],
    keepouts: [],
    layers: createDefaultPcbLayers(2),
    components: opts.components,
    traces: [],
    vias: [],
    copperPours: [],
    shapes: [],
    netClasses: [],
    netClassAssignments: {},
    diffPairs: [],
    designRules: createGostDesignRules(loadSettings().defaultAccuracyClass)
  };
}
