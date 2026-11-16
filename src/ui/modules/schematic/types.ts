import { ColorSchemeId, Point2D, SchWire, SchematicProject } from '../../../core/types';

/** Interactive editing tools in Schematic Capture. */
export type SchToolId =
  | 'select'
  | 'placeComp'
  | 'wire'
  | 'bus'
  | 'busTap'
  | 'netPort'
  | 'pinLabel'
  | 'shapeLine'
  | 'shapeRect'
  | 'shapeCircle'
  | 'shapeText'
  | 'table'
  | 'hierarchy'
  | 'diffPair'
  | 'zoomBox'
  | 'origin';

/** Canvas right-click context menu anchor and target entity IDs. */
export interface SchContextMenu {
  x: number;
  y: number;
  compId?: string;
  wireId?: string;
}

/** Screen-to-world viewport camera mapping for schematic sheets. */
export interface SchViewport {
  ox: number;
  oy: number;
  pxPerMm: number;
}

/** Mutable pointer drag tracking state. */
export interface SchDragState {
  mode: 'none' | 'pan' | 'moveComp' | 'movePort' | 'marquee' | 'zoomBox';
  startScreenX: number;
  startScreenY: number;
  startWorldX: number;
  startWorldY: number;
  compStartPos: Record<string, Point2D>;
  preDragProject?: SchematicProject;
  preDragWires?: SchWire[];
  movedPinStarts?: Point2D[];
  portStartPos?: Point2D;
  movingPortId?: string;
  lastOx: number;
  lastOy: number;
  pannedDistance?: number;
}

/** Rubber-band box selection rectangle in world coordinates. */
export interface SchMarqueeBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Resolved color palette derived from active color scheme. */
export interface SchThemePalette {
  scheme: ColorSchemeId;
  bgColor: string;
  frameColor: string;
  compColor: string;
  pinColor: string;
  textColor: string;
  valColor: string;
  wireColor: string;
  busColor: string;
  portColor: string;
  gridColor: string;
}
