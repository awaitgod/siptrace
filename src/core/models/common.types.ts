// Core shared primitives for GOSTTrace EDA (ГОСТ-Трейс)

export type AppModuleId =
  | 'launcher'
  | 'schematic'
  | 'pcb'
  | 'componentEditor'
  | 'patternEditor'
  | 'pcb3d';

export type Units = 'mm' | 'mil' | 'in';

export type ColorSchemeId = 'dark' | 'light' | 'gost-bw';

export type Point2D = { x: number; y: number };

export type HotkeyMap = Record<string, string>;
