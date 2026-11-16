import { SchDragState } from './types';

export const SCHEMATIC_ZOOM_OPTIONS = [25, 50, 75, 100, 125, 150, 165, 200, 300, 400];

export const INITIAL_SCH_DRAG_STATE: SchDragState = {
  mode: 'none',
  startScreenX: 0,
  startScreenY: 0,
  startWorldX: 0,
  startWorldY: 0,
  compStartPos: {},
  lastOx: 0,
  lastOy: 0
};
