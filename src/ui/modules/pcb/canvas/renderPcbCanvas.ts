import { DrcError, PcbLayerId, PcbProject, Point2D } from '../../../../core/types';
import { RatlineSegment } from '../../../../engines/drc';
import { CopperLayerId, MeasureRulerState, PcbExtraSelection, PcbToolId, PcbViewport } from '../types';
import {
  drawBoardAndKeepouts,
  drawCopperPours,
  drawCopperTraces,
  drawPcbGrid,
  LayerLookup
} from './drawBoardAndKeepouts';
import { drawPcbComponents } from './drawPcbComponents';
import { drawPcbOverlays } from './drawPcbOverlays';

export interface RenderPcbCanvasParams {
  canvas: HTMLCanvasElement;
  container: HTMLDivElement;
  pcb: PcbProject;
  viewport: PcbViewport;
  showGrid: boolean;
  showRatlines: boolean;
  ratlines: RatlineSegment[];
  selectedCompId: string | null;
  selectedTraceId: string | null;
  selectedViaId?: string | null;
  selectedExtraObj?: PcbExtraSelection | null;
  highlightedNet: string | null;
  tool: PcbToolId;
  activeLayer: CopperLayerId;
  routeDraftPts: Point2D[];
  polyDraftPts: Point2D[];
  cursorMm: Point2D;
  routeElbowFlip: boolean;
  measurePts: MeasureRulerState | null;
  drcErrors: DrcError[];
}

/** Renders the complete PCB workspace onto an HTML5 2D canvas. */
export function renderPcbCanvas(params: RenderPcbCanvasParams): void {
  const { canvas, container, pcb, viewport } = params;
  const dpr = window.devicePixelRatio || 1;
  const w = container.clientWidth || 800;
  const h = container.clientHeight || 550;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const layers: LayerLookup = {
    isVisible: (id: PcbLayerId) => pcb.layers.find((l) => l.id === id)?.visible ?? true,
    getColor: (id: PcbLayerId, fallback: string) => pcb.layers.find((l) => l.id === id)?.color ?? fallback
  };

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(viewport.ox, viewport.oy);
  ctx.scale(viewport.pxPerMm, viewport.pxPerMm);

  drawPcbGrid(ctx, pcb, viewport, w, h, params.showGrid);
  drawBoardAndKeepouts(ctx, pcb, viewport, layers);
  drawCopperPours(ctx, pcb, layers);
  drawCopperTraces(ctx, pcb, layers, params.selectedTraceId, params.highlightedNet);
  drawPcbComponents(ctx, pcb, viewport, layers, params.selectedCompId, params.highlightedNet);
  drawPcbOverlays(ctx, {
    pcb,
    viewport,
    layers,
    showRatlines: params.showRatlines,
    ratlines: params.ratlines,
    highlightedNet: params.highlightedNet,
    selectedViaId: params.selectedViaId,
    selectedExtraObj: params.selectedExtraObj,
    tool: params.tool,
    activeLayer: params.activeLayer,
    routeDraftPts: params.routeDraftPts,
    polyDraftPts: params.polyDraftPts,
    cursorMm: params.cursorMm,
    routeElbowFlip: params.routeElbowFlip,
    measurePts: params.measurePts,
    drcErrors: params.drcErrors
  });

  ctx.restore();
}
