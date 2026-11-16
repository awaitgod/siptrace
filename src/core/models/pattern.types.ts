import { Point2D } from './common.types';

export type PadType = 'SMD' | 'THT' | 'MountingHole';
export type PadShape = 'Rect' | 'Round' | 'Oval' | 'RoundedRect' | 'Polygon';

export interface PadDef {
  id: string;
  number: string;
  type: PadType;
  shape: PadShape;
  x: number; // mm
  y: number; // mm
  width: number; // mm
  height: number; // mm
  cornerRadius?: number; // mm for RoundedRect
  holeDiameter?: number; // mm for THT / MountingHole
  angle?: number;
  layer: 'Top' | 'Bottom' | 'All';
  thermalMode?: 'Inherited' | '4Spoke' | '2Spoke' | 'Direct' | 'None';
  solderMaskExpansion?: number;
  pasteMaskExpansion?: number;
  polygonPoints?: Point2D[];
  netId?: string;
}

export type PatternLayer =
  | 'TopSilk'
  | 'BottomSilk'
  | 'TopAssembly'
  | 'BottomAssembly'
  | 'Courtyard'
  | 'TopCopper'
  | 'BottomCopper'
  | 'Keepout';

export type PatternGraphic =
  | { type: 'line'; layer: PatternLayer; x1: number; y1: number; x2: number; y2: number; width: number }
  | { type: 'rect'; layer: PatternLayer; x: number; y: number; w: number; h: number; width: number; fill?: boolean }
  | { type: 'circle'; layer: PatternLayer; cx: number; cy: number; r: number; width: number; fill?: boolean }
  | { type: 'arc'; layer: PatternLayer; cx: number; cy: number; r: number; startAngle: number; endAngle: number; width: number }
  | { type: 'polyline'; layer: PatternLayer; points: Point2D[]; width: number; closed?: boolean }
  | { type: 'text'; layer: PatternLayer; x: number; y: number; text: string; size: number };

export type Model3DShapeType =
  | 'ChipSMD'
  | 'AxialResistor'
  | 'RadialCap'
  | 'Cylinder'
  | 'DIP'
  | 'SOIC'
  | 'QFP'
  | 'QFN'
  | 'SOT23'
  | 'TO92'
  | 'TO220'
  | 'Header'
  | 'SwitchTact'
  | 'Crystal'
  | 'Relay'
  | 'Inductor'
  | 'Box';

export interface Model3DRef {
  shape: Model3DShapeType;
  bodyWidth: number;
  bodyLength: number;
  bodyHeight: number;
  color: string;
  pinCount?: number;
  pitch?: number;
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
  rotZ?: number;
  customObjText?: string;
}

export interface PatternDef {
  id: string;
  name: string; // e.g., "ЧИП_0805 (2012М)", "DIP-8", "КТ-26 (TO-92)"
  library: string;
  gostName?: string;
  ipcName?: string;
  description: string;
  pads: PadDef[];
  graphics: PatternGraphic[];
  courtyard: { width: number; height: number };
  model3d: Model3DRef;
}

export interface PatternLibrary {
  id: string;
  name: string;
  description: string;
  isUserLibrary?: boolean;
  patterns: PatternDef[];
}
