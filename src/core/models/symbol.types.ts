import { Point2D } from './common.types';

export type PinElectricalType =
  | 'Passive'
  | 'Input'
  | 'Output'
  | 'Bidirectional'
  | 'Power'
  | 'OpenCollector'
  | 'TriState'
  | 'NotConnected';

export type PinGraphicStyle =
  | 'Line'
  | 'Inverted'
  | 'Clock'
  | 'InvertedClock'
  | 'OpenCollector'
  | 'TriState'
  | 'Schmitt'
  | 'Bidirectional';

export type PinOrientation = 0 | 90 | 180 | 270;

export interface SymbolPin {
  id: string;
  number: string;
  name: string;
  x: number; // connection point in mm relative to symbol origin
  y: number;
  length: number; // mm, typically 5 or 2.5
  orientation: PinOrientation; // angle pointing FROM connection point INTO symbol body (0=right, 180=left, 90=down, 270=up)
  electricalType: PinElectricalType;
  style: PinGraphicStyle;
  showName: boolean;
  showNumber: boolean;
  isHiddenPower?: boolean;
  padMapping?: string; // pad number in attached pattern
}

export type SymbolPrimitive =
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; width?: number; dashed?: boolean }
  | { type: 'polyline'; points: Point2D[]; closed?: boolean; fill?: boolean; width?: number }
  | { type: 'rect'; x: number; y: number; w: number; h: number; fill?: boolean; width?: number }
  | { type: 'circle'; cx: number; cy: number; r: number; fill?: boolean; width?: number }
  | { type: 'arc'; cx: number; cy: number; r: number; startAngle: number; endAngle: number; width?: number }
  | { type: 'text'; x: number; y: number; text: string; size?: number; align?: 'left' | 'center' | 'right'; bold?: boolean; italic?: boolean };

export interface ComponentPartDef {
  partIndex: number;
  name: string;
  primitives: SymbolPrimitive[];
  pins: SymbolPin[];
}

export interface ComponentDef {
  id: string;
  name: string; // e.g., "МЛТ-0.25", "К155ЛА3", "КТ315Б"
  library: string;
  refDesPrefix: string; // GOST: R, C, L, VD, VT, DA, DD, XS, XP, XT, SA, SB, K, T, F, BQ, HL, U
  defaultValue: string;
  gostStandard: string; // e.g., "ГОСТ 2.728-74", "ОСТ 11 073..."
  description: string;
  manufacturer?: string;
  patternId: string; // attached pattern ID
  parts: ComponentPartDef[];
  spiceModel?: {
    prefix: 'R' | 'C' | 'L' | 'D' | 'Q' | 'M' | 'X' | 'V' | 'I' | 'U';
    modelName?: string;
    params?: Record<string, string | number>;
    subckt?: string;
  };
  attributes?: Record<string, string>;
  isNetPort?: boolean;
  portNetName?: string;
  isNetTie?: boolean;
}

export interface ComponentLibrary {
  id: string;
  name: string;
  category: string;
  description: string;
  isUserLibrary?: boolean;
  components: ComponentDef[];
}
