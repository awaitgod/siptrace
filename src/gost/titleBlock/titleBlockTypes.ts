/** Physical dimensions and display label for a GOST drawing sheet format. */
export interface SheetDimensions {
  widthMm: number;
  heightMm: number;
  label: string;
}

/** Inner drawing border rectangle in millimeters per GOST 2.301-68. */
export interface FrameRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Line primitive for rendering sheet frames and GOST title block grids. */
export interface TitleBlockLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thick: boolean;
}

/** Positioned text label for rendering GOST frame zones and stamp fields. */
export interface TitleBlockText {
  x: number;
  y: number;
  text: string;
  sizeMm: number;
  align: 'left' | 'center' | 'right';
  italic?: boolean;
  bold?: boolean;
  maxWidthMm?: number;
  rotateDeg?: number;
}

/** Combined line and text primitives describing a complete GOST sheet frame and stamp. */
export interface TitleBlockGeometry {
  lines: TitleBlockLine[];
  texts: TitleBlockText[];
}
