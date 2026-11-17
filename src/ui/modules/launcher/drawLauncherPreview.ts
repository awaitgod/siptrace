import type { ColorSchemeId } from '../../../core/types';
import type { RecentProjectSnapshot } from '../../../core/store';
import { SHEET_FORMATS } from '../../../gost/gostTitleBlock';
import { renderSchematicCanvas } from '../schematic/canvas/renderSchematicCanvas';
import { renderPcbCanvas } from '../pcb/canvas/renderPcbCanvas';

export function drawLauncherPreview(
  surface: HTMLCanvasElement,
  frame: HTMLDivElement,
  documents: RecentProjectSnapshot,
  board: boolean,
  theme: ColorSchemeId,
  sheetId?: string,
  focus?: { minX: number; minY: number; maxX: number; maxY: number },
  camera = { zoom: 1, x: 0, y: 0 }
): void {
  const schematic = board ? undefined : documents.schematic;
  const sheet = schematic?.sheets.find(item => item.id === (sheetId ?? schematic.activeSheetId)) ?? schematic?.sheets[0];
  const pcb = board ? documents.pcb : undefined;
  const w = frame.clientWidth;
  const h = frame.clientHeight;
  if (!w || !h) return;
  const points = pcb?.boardOutline.length ? pcb.boardOutline : [
    ...(pcb?.components ?? []), ...(pcb?.vias ?? []), ...(pcb?.traces.flatMap(trace => trace.points) ?? [])
  ];
  const dimensions = sheet && SHEET_FORMATS[sheet.format];
  let minX = 0, minY = 0, maxX = dimensions?.widthMm ?? 100, maxY = dimensions?.heightMm ?? 70;
  if (pcb && points.length) {
    minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  if (focus) ({ minX, minY, maxX, maxY } = focus);
  const pxPerMm = Math.min(w / Math.max(10, maxX - minX), h / Math.max(10, maxY - minY)) * .88 * camera.zoom;
  const viewport = { pxPerMm, ox: w / 2 + camera.x - (minX + maxX) / 2 * pxPerMm, oy: h / 2 + camera.y - (minY + maxY) / 2 * pxPerMm };
  const common = { canvas: surface, container: frame, viewport, showGrid: false, highlightedNet: null, tool: 'select' as const, cursorMm: { x: 0, y: 0 } };
  if (schematic && sheet) {
    renderSchematicCanvas({
      ...common, activeSheet: sheet, origin: schematic.origin, gridSize: schematic.gridSize,
      colorScheme: theme, customCompMap: schematic.customComponentDefs, selectedCompIds: [],
      selectedWireId: null, selectedPortId: null, previewComponentDef: null, selectedPartIndex: 0,
      placeAngle: 0, placeFlipX: false, placeFlipY: false, wireDraftPts: [], elbowFlip: false,
      shapeStartPt: null, marqueeBox: null, ercErrors: [], snapWorldSmart: point => point
    });
  }
  if (pcb) {
    renderPcbCanvas({
      ...common, pcb, showRatlines: false, ratlines: [], selectedCompId: null, selectedTraceId: null,
      activeLayer: 'TopCopper', routeDraftPts: [], polyDraftPts: [], routeElbowFlip: false,
      measurePts: null, drcErrors: []
    });
  }
}
