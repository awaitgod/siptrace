import { Point2D, Units } from './common.types';
import { Model3DRef, PadDef, PatternGraphic } from './pattern.types';
import { NetClassDef } from './schematic.types';

export type PcbLayerId =
  | 'TopCopper'
  | 'Inner1'
  | 'Inner2'
  | 'BottomCopper'
  | 'TopSilk'
  | 'BottomSilk'
  | 'TopMask'
  | 'BottomMask'
  | 'TopPaste'
  | 'BottomPaste'
  | 'TopAssembly'
  | 'BottomAssembly'
  | 'Courtyard'
  | 'BoardOutline'
  | 'Keepout';

export interface PcbLayerConfig {
  id: PcbLayerId;
  name: string;
  kind: 'Signal' | 'Plane' | 'NonSignal';
  routingDirection: 'Any' | 'Horizontal' | 'Vertical';
  color: string;
  visible: boolean;
  enabled: boolean;
}

export interface PcbPlacedComponent {
  id: string;
  refDes: string;
  value: string;
  typeName: string;
  patternId: string;
  side: 'Top' | 'Bottom';
  x: number; // mm on board
  y: number;
  angle: number; // arbitrary degrees
  locked?: boolean;
  showRefDes: boolean;
  showValue: boolean;
  refDesOffset: Point2D;
  pads: PadDef[]; // instantiated pads in local coords (or transformed helper)
  padNets: Record<string, string>; // padNumber -> netName
  graphics: PatternGraphic[];
  courtyard: { width: number; height: number };
  model3d: Model3DRef;
}

export interface PcbTrace {
  id: string;
  layer: 'TopCopper' | 'Inner1' | 'Inner2' | 'BottomCopper';
  netName: string;
  points: Point2D[];
  width: number; // mm
  locked?: boolean;
  isDiffPair?: boolean;
  diffPairName?: string;
}

export interface PcbVia {
  id: string;
  x: number;
  y: number;
  netName: string;
  outerDiameter: number; // mm
  holeDiameter: number; // mm
  startLayer: 'TopCopper' | 'Inner1' | 'Inner2' | 'BottomCopper';
  endLayer: 'TopCopper' | 'Inner1' | 'Inner2' | 'BottomCopper';
  viaStyle: 'Through' | 'Blind' | 'Buried' | 'Micro';
  locked?: boolean;
}

export type CopperPourFillType = 'Solid' | 'Hatch' | 'Horizontal' | 'Vertical';
export type ThermalReliefType = '4Spoke' | '2Spoke' | 'Direct' | 'None';

export interface PcbCopperPour {
  id: string;
  layer: 'TopCopper' | 'Inner1' | 'Inner2' | 'BottomCopper';
  netName: string;
  outline: Point2D[];
  dependOnBoardOutline: boolean;
  boardClearance: number; // mm
  clearance: number; // mm
  fillType: CopperPourFillType;
  lineWidth: number;
  lineSpacing: number;
  thermalType: ThermalReliefType;
  thermalSpokeWidth: number;
  thermalGap: number;
  removeIslands: boolean;
  isolateMountingHoles?: boolean;
  mountingHoleClearance?: number;
  priority: number;
  poured: boolean;
  unpouredReason?: string;
  // Computed clipped fill primitives (outer polygon + holes + thermals)
  computedIslands?: { outer: Point2D[]; holes: Point2D[][] }[];
}

export interface PcbBoardCutout {
  id: string;
  points: Point2D[];
}

export interface PcbKeepoutZone {
  id: string;
  layer: PcbLayerId | 'AllCopper';
  kind: 'RouteKeepout' | 'PlaceKeepout' | 'PourKeepout';
  points: Point2D[];
}

export interface PcbShape {
  id: string;
  layer: PcbLayerId;
  type: 'line' | 'rect' | 'circle' | 'text' | 'dimension' | 'qrcode';
  x1: number;
  y1: number;
  x2?: number;
  y2?: number;
  w?: number;
  h?: number;
  r?: number;
  width: number;
  text?: string;
  size?: number;
}

export type GostAccuracyClass = 1 | 2 | 3 | 4 | 5;

export interface PcbDesignRules {
  gostAccuracyClass: GostAccuracyClass;
  clearanceTraceToTrace: number;
  clearanceTraceToPad: number;
  clearancePadToPad: number;
  clearanceViaToAny: number;
  clearanceHoleToHole?: number;
  clearanceCopperToBoard: number;
  minTraceWidth: number;
  defaultTraceWidth: number;
  maxTraceWidth: number;
  minViaOuter: number;
  minViaHole: number;
  minAnnularRing: number;
  minSilkWidth: number;
  silkToPadClearance: number;
  diffPairMaxLengthMismatch: number;
  realTimeDrc: boolean;
  checkUnroutedNets: boolean;
  checkSilkOverPads: boolean;
}

export interface PcbDiffPair {
  id: string;
  name: string;
  posNet: string;
  negNet: string;
  targetWidth: number;
  targetGap: number;
  maxMismatch: number;
}

export interface PcbProject {
  version: string;
  filePath: string;
  linkedSchematicPath?: string;
  projectName: string;
  units: Units;
  gridSize: number; // mm
  boardThickness: number; // mm (1.6)
  soldermaskColor: string;
  silkscreenColor: string;
  surfaceFinish: 'HASL' | 'ENIG' | 'ImmersionSilver' | 'OSP';
  layerCount: 2 | 4;
  origin: Point2D;
  boardOutline: Point2D[];
  cutouts: PcbBoardCutout[];
  keepouts: PcbKeepoutZone[];
  layers: PcbLayerConfig[];
  components: PcbPlacedComponent[];
  traces: PcbTrace[];
  vias: PcbVia[];
  copperPours: PcbCopperPour[];
  shapes: PcbShape[];
  netClasses: NetClassDef[];
  netClassAssignments: Record<string, string>;
  diffPairs: PcbDiffPair[];
  designRules: PcbDesignRules;
  drcWaivers?: Record<string, string>;
  teardropsEnabled?: boolean;
}
