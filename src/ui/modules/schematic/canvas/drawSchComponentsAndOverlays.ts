import { ComponentDef, ErcError, Point2D, SchematicSheet } from '../../../../core/types';
import { snapPoint } from '../../../../core/units';
import { findComponentById } from '../../../../gost/libraries/gostComponents';
import { drawSymbolPrimitives } from '../../../components/CadPreviewCanvas';
import { SchMarqueeBox, SchThemePalette, SchToolId, SchViewport } from '../types';
export interface DrawSchComponentsParams {
    ctx: CanvasRenderingContext2D;
    sheet: SchematicSheet;
    gridSize: number;
    viewport: SchViewport;
    palette: SchThemePalette;
    customCompMap: Record<string, ComponentDef>;
    selectedCompIds: string[];
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
/** Renders GOST symbol instances, placement ghost preview, wire/shape drafts, marquee, and ERC markers. */
export function drawSchComponentsAndOverlays(p: DrawSchComponentsParams): void {
    const { ctx, sheet, viewport, palette } = p;
    // Placed GOST Components
    for (const comp of sheet.components) {
        const def = findComponentById(comp.componentDefId, p.customCompMap);
        if (!def) {
            ctx.save();
            ctx.strokeStyle = '#CC0000';
            ctx.fillStyle = '#CC0000';
            ctx.lineWidth = .5;
            ctx.strokeRect(comp.x - 5, comp.y - 4, 10, 8);
            ctx.font = '2.5px OpenGost';
            ctx.fillText(`? ${comp.refDes}: ${comp.componentDefId}`, comp.x - 5, comp.y - 5);
            ctx.restore();
            continue;
        }
        const part = def.parts.find((pt) => pt.partIndex === comp.partIndex) ?? def.parts[0];
        if (!part)
            continue;
        const isSelected = p.selectedCompIds.includes(comp.id);
        drawSymbolPrimitives(ctx, part.primitives, part.pins, comp.x, comp.y, comp.angle, comp.flipX, comp.flipY, viewport.pxPerMm, isSelected ? '#33BBFF' : palette.compColor, isSelected ? '#FFFF66' : def.isNetPort ? palette.portColor : palette.pinColor, isSelected ? '#FFFF99' : palette.valColor, 1.0, palette.bgColor);
        if (comp.showRefDes && comp.refDes && !comp.refDes.startsWith('#')) {
            ctx.save();
            ctx.fillStyle = isSelected ? (palette.scheme==='dark'?'#FFFF66':'#005BBB') : palette.textColor;
            ctx.font = `3px "OpenGost", Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const suffix = def.parts.length > 1 ? `.${comp.partIndex}` : '';
            ctx.translate(comp.x + comp.refDesOffset.x, comp.y + comp.refDesOffset.y);
            ctx.rotate((comp.labelAngle ?? 0) * Math.PI / 180);
            ctx.fillText(`${comp.refDes}${suffix}`, 0, 0);
            ctx.restore();
        }
        if (comp.showValue && comp.value) {
            ctx.save();
            ctx.fillStyle = comp.doNotMount ? '#FF5555' : palette.valColor;
            ctx.font = `2.6px "OpenGost", Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.translate(comp.x + comp.valueOffset.x, comp.y + comp.valueOffset.y);
            ctx.rotate((comp.labelAngle ?? 0) * Math.PI / 180);
            ctx.fillText(comp.doNotMount ? `${comp.value} (Н/М)` : comp.value, 0, 0);
            ctx.restore();
        }
    }
    // Ghost Component Preview when placing from library
    if (p.tool === 'placeComp' && p.previewComponentDef) {
        const part = p.previewComponentDef.parts.find((pt) => pt.partIndex === p.selectedPartIndex) ??
            p.previewComponentDef.parts[0];
        if (part) {
            const snapped = snapPoint(p.cursorMm, p.gridSize);
            ctx.save();
            ctx.globalAlpha = 0.72;
            drawSymbolPrimitives(ctx, part.primitives, part.pins, snapped.x, snapped.y, p.placeAngle, p.placeFlipX, p.placeFlipY, viewport.pxPerMm, '#66CCFF', '#FFAA44', '#CCCCCC', 1.0, palette.bgColor);
            ctx.restore();
        }
    }
    // Interactive Wire / Bus draft preview
    if ((p.tool === 'wire' || p.tool === 'bus') && p.wireDraftPts.length > 0) {
        const last = p.wireDraftPts[p.wireDraftPts.length - 1];
        const cur = p.snapWorldSmart(p.cursorMm);
        const mid = p.elbowFlip ? { x: last.x, y: cur.y } : { x: cur.x, y: last.y };
        ctx.strokeStyle = p.tool === 'bus' ? palette.busColor : (palette.scheme === 'dark' ? '#FFFF66' : palette.wireColor);
        ctx.lineWidth = Math.max(1.5 / viewport.pxPerMm, p.tool === 'bus' ? 0.85 : 0.35);
        ctx.beginPath();
        ctx.moveTo(p.wireDraftPts[0].x, p.wireDraftPts[0].y);
        for (let i = 1; i < p.wireDraftPts.length; i++)
            ctx.lineTo(p.wireDraftPts[i].x, p.wireDraftPts[i].y);
        ctx.lineTo(mid.x, mid.y);
        ctx.lineTo(cur.x, cur.y);
        ctx.stroke();
    }
    // Shape / ZoomBox draft preview
    if (p.shapeStartPt && (p.tool === 'shapeLine' || p.tool === 'shapeRect' || p.tool === 'shapeCircle' || p.tool === 'zoomBox')) {
        const cur = snapPoint(p.cursorMm, p.gridSize);
        ctx.strokeStyle = p.tool === 'zoomBox' ? '#00AAFF' : (palette.scheme === 'dark' ? '#FFFF66' : palette.compColor);
        ctx.lineWidth = 1.2 / viewport.pxPerMm;
        ctx.setLineDash([2, 2]);
        if (p.tool === 'shapeLine') {
            ctx.beginPath();
            ctx.moveTo(p.shapeStartPt.x, p.shapeStartPt.y);
            ctx.lineTo(cur.x, cur.y);
            ctx.stroke();
        }
        else if (p.tool === 'shapeCircle') {
            ctx.beginPath();
            ctx.arc(p.shapeStartPt.x, p.shapeStartPt.y, Math.hypot(cur.x - p.shapeStartPt.x, cur.y - p.shapeStartPt.y), 0, Math.PI * 2);
            ctx.stroke();
        }
        else {
            ctx.strokeRect(Math.min(p.shapeStartPt.x, cur.x), Math.min(p.shapeStartPt.y, cur.y), Math.abs(cur.x - p.shapeStartPt.x), Math.abs(cur.y - p.shapeStartPt.y));
        }
        ctx.setLineDash([]);
    }
    // Marquee Selection (solid blue for L->R Window, dashed green for R->L Crossing)
    if (p.marqueeBox) {
        const isCrossing = p.marqueeBox.x2 < p.marqueeBox.x1;
        ctx.save();
        ctx.strokeStyle = isCrossing ? '#10B981' : '#3399FF';
        ctx.fillStyle = isCrossing ? 'rgba(16, 185, 129, 0.14)' : 'rgba(0, 120, 215, 0.16)';
        ctx.lineWidth = 1 / viewport.pxPerMm;
        if (isCrossing)
            ctx.setLineDash([4 / viewport.pxPerMm, 3 / viewport.pxPerMm]);
        const mx = Math.min(p.marqueeBox.x1, p.marqueeBox.x2);
        const my = Math.min(p.marqueeBox.y1, p.marqueeBox.y2);
        const mw = Math.abs(p.marqueeBox.x2 - p.marqueeBox.x1);
        const mh = Math.abs(p.marqueeBox.y2 - p.marqueeBox.y1);
        ctx.fillRect(mx, my, mw, mh);
        ctx.strokeRect(mx, my, mw, mh);
        ctx.restore();
    }
    // ERC Error Markers
    for (const err of p.ercErrors) {
        if (err.sheetId !== sheet.id)
            continue;
        ctx.strokeStyle = err.severity === 'Error' ? '#FF2222' : '#FFAA00';
        ctx.lineWidth = Math.max(1.5 / viewport.pxPerMm, 0.45);
        ctx.beginPath();
        ctx.arc(err.x, err.y, 2.8, 0, Math.PI * 2);
        ctx.stroke();
    }
}
