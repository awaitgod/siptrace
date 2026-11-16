import { PcbTrace } from '../../../core/types';
import { PcbDragState } from './types';

export const PCB_ZOOM_OPTIONS = [50, 100, 150, 200, 300, 450, 600, 800];

export const PCB_GRID_STEPS = [0.1, 0.25, 0.5, 0.635, 1.0, 1.25, 2.5];

export const COPPER_LAYER_DRAW_ORDER: PcbTrace['layer'][] = [
  'BottomCopper',
  'Inner2',
  'Inner1',
  'TopCopper'
];

export const INITIAL_DRAG_STATE: PcbDragState = {
  mode: 'none',
  startScreenX: 0,
  startScreenY: 0,
  startWorldX: 0,
  startWorldY: 0,
  compStartX: 0,
  compStartY: 0,
  lastOx: 0,
  lastOy: 0
};
