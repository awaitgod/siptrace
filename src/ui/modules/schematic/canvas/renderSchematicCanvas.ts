import { ColorSchemeId, ComponentDef, ErcError, Point2D, SchematicSheet } from '../../../../core/types';
import { resolveSchematicPalette } from '../theme/schematicTheme';
import { SchMarqueeBox, SchToolId, SchViewport } from '../types';
import { drawSchGridAndFrame } from './drawSchGridAndFrame';
import { drawSchNetsAndShapes } from './drawSchNetsAndShapes';
import { drawSchComponentsAndOverlays } from './drawSchComponentsAndOverlays';

export interface RenderSchematicCanvasParams {
  canvas: HTMLCanvasElement;
  container: HTMLDivElement;
  activeSheet: SchematicSheet;
  origin: Point2D;
  gridSize: number;
  viewport: SchViewport;
  colorScheme: ColorSchemeId;
  showGrid: boolean;
  customCompMap: Record<string, ComponentDef>;
  selectedCompIds: string[];
  selectedWireId: string | null;
  selectedPortId: string | null;
  highlightedNet: string | null;
  tool: SchToolId;
  previewComponentDef: ComponentDef | null;
  selectedPartIndex: number;
  cursorMm: Point2D;
  placeAngle: 0 | 90 | 180 | 270;
  placeFlipX: boolean;
  placeFlipY: boolean;
  wireDraftPts: Point2D[];
  elbowFlip: boolean;
  shapeStartPt: Point2D | null;
  marqueeBox: SchMarqueeBox | null;
  ercErrors: ErcError[];
  snapWorldSmart: (pt: Point2D) => Point2D;
}

/** Renders the complete Schematic Capture sheet onto an HTML5 2D canvas. */
export function renderSchematicCanvas(p: RenderSchematicCanvasParams): void {
  const { canvas, container, viewport } = p;
  const dpr = window.devicePixelRatio || 1;
  const w = container.clientWidth || 800;
  const h = container.clientHeight || 550;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const palette = resolveSchematicPalette(p.colorScheme);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = palette.bgColor;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(viewport.ox, viewport.oy);
  ctx.scale(viewport.pxPerMm, viewport.pxPerMm);

  drawSchGridAndFrame(ctx, p.activeSheet, p.origin, p.gridSize, viewport, w, h, p.showGrid, palette);
  drawSchNetsAndShapes(
    ctx,
    p.activeSheet,
    viewport,
    palette,
    p.selectedWireId,
    p.selectedPortId,
    p.highlightedNet
  );
  drawSchComponentsAndOverlays({
    ctx,
    sheet: p.activeSheet,
    gridSize: p.gridSize,
    viewport,
    palette,
    customCompMap: p.customCompMap,
    selectedCompIds: p.selectedCompIds,
    tool: p.tool,
    previewComponentDef: p.previewComponentDef,
    selectedPartIndex: p.selectedPartIndex,
    cursorMm: p.cursorMm,
    placeAngle: p.placeAngle,
    placeFlipX: p.placeFlipX,
    placeFlipY: p.placeFlipY,
    wireDraftPts: p.wireDraftPts,
    elbowFlip: p.elbowFlip,
    shapeStartPt: p.shapeStartPt,
    marqueeBox: p.marqueeBox,
    ercErrors: p.ercErrors,
    snapWorldSmart: p.snapWorldSmart
  });

  ctx.restore();
}
