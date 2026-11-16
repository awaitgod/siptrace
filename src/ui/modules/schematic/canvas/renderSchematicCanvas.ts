import { entityBounds, allIds } from '../../../../core/schematic/editing';
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
    selectedIds?: string[];
    hoverTarget?: {
        point: Point2D;
        label: string;
    } | null;
    pasteDraft?: SchematicSheet | null;
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
    if (!ctx)
        return;
    const palette = resolveSchematicPalette(p.colorScheme);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.bgColor;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(viewport.ox, viewport.oy);
    ctx.scale(viewport.pxPerMm, viewport.pxPerMm);
    drawSchGridAndFrame(ctx, p.activeSheet, p.origin, p.gridSize, viewport, w, h, p.showGrid, palette);
    drawSchNetsAndShapes(ctx, p.activeSheet, viewport, palette, p.selectedWireId, p.selectedPortId, p.highlightedNet, p.selectedIds);
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
    if (p.pasteDraft) {
        ctx.save();
        ctx.globalAlpha = .6;
        drawSchNetsAndShapes(ctx, p.pasteDraft, viewport, palette, null, null, null);
        drawSchComponentsAndOverlays({ ...p, ctx, sheet: p.pasteDraft, palette, selectedCompIds: [], tool: 'select' });
        ctx.restore();
    }
    for (const id of p.selectedIds ?? []) {
        const b = entityBounds(p.activeSheet, id, p.customCompMap);
        ctx.strokeStyle = '#0088CC';
        ctx.lineWidth = 1 / viewport.pxPerMm;
        ctx.setLineDash([2 / viewport.pxPerMm, 2 / viewport.pxPerMm]);
        ctx.strokeRect(b.minX - 1, b.minY - 1, b.maxX - b.minX + 2, b.maxY - b.minY + 2);
        ctx.setLineDash([]);
    }
    if (p.selectedWireId) {
        const wire = p.activeSheet.wires.find(w => w.id === p.selectedWireId);
        ctx.fillStyle = '#00BBFF';
        for (const q of wire?.points ?? [])
            ctx.fillRect(q.x - 2 / viewport.pxPerMm, q.y - 2 / viewport.pxPerMm, 4 / viewport.pxPerMm, 4 / viewport.pxPerMm);
    }
    if (p.hoverTarget && ['select', 'wire', 'bus'].includes(p.tool)) {
        const q = p.hoverTarget.point;
        ctx.strokeStyle = '#00CC66';
        ctx.lineWidth = 2 / viewport.pxPerMm;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 5 / viewport.pxPerMm, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = palette.textColor;
        ctx.font = `${12 / viewport.pxPerMm}px Arial`;
        ctx.textAlign = 'left';
        ctx.fillText(p.hoverTarget.label, q.x + 8 / viewport.pxPerMm, q.y - 8 / viewport.pxPerMm);
    }
    ctx.restore();
}
