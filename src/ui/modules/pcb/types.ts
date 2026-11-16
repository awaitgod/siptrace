import { PcbCopperPour, PcbProject, Point2D } from '../../../core/types';

/** Active interactive tool modes supported in the PCB Layout Editor. */
export type PcbToolId =
  | 'select'
  | 'placePattern'
  | 'routeManual'
  | 'via'
  | 'copperPour'
  | 'boardOutline'
  | 'cutout'
  | 'keepout'
  | 'meander'
  | 'measure'
  | 'shapeLine'
  | 'shapeText';

/** Signal/plane copper layers available for routing selection. */
export type CopperLayerId = 'TopCopper' | 'Inner1' | 'Inner2' | 'BottomCopper';

/** Screen-to-world canvas viewport camera transform. */
export interface PcbViewport {
  ox: number;
  oy: number;
  pxPerMm: number;
}

/** Mutable pointer drag tracking state across canvas mouse interactions. */
export interface PcbDragState {
  mode: 'none' | 'pan' | 'moveComp' | 'measure';
  startScreenX: number;
  startScreenY: number;
  startWorldX: number;
  startWorldY: number;
  compStartX: number;
  compStartY: number;
  preDragPcb?: PcbProject;
  lastOx: number;
  lastOy: number;
}

/** Draft state for creating new copper pours via dialog. */
export interface CopperPourDraftOptions {
  netName: string;
  layer: 'TopCopper' | 'BottomCopper';
  fillType: PcbCopperPour['fillType'];
}

/** Active distance measurement endpoints in world millimeters. */
export interface MeasureRulerState {
  start: Point2D;
  end: Point2D;
}
