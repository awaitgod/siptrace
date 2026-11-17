import { ComponentDef, SchematicProject, SchematicSheet } from '../../../../core/types';
import { SvgCanvas, xmlEscape } from '../../../../core/utils/svgCanvas';
import { SHEET_FORMATS } from '../../../../gost/gostTitleBlock';
import { drawSchGridAndFrame } from '../canvas/drawSchGridAndFrame';
import { drawSchNetsAndShapes } from '../canvas/drawSchNetsAndShapes';
import { drawSchComponentsAndOverlays } from '../canvas/drawSchComponentsAndOverlays';
import { resolveSchematicPalette } from '../theme/schematicTheme';
import gostFontData from '../../../theme/fonts/OpenGostTypeB-inline.json';
export function renderSchematicSvg(sheet: SchematicSheet, defs: Record<string, ComponentDef>): string {
    const recorder = new SvgCanvas(), ctx = recorder as unknown as CanvasRenderingContext2D, dim = SHEET_FORMATS[sheet.format];
    const viewport = { ox: 0, oy: 0, pxPerMm: 10 }, palette = resolveSchematicPalette('gost-bw');
    drawSchGridAndFrame(ctx, sheet, { x: -100, y: -100 }, 2.5, viewport, dim.widthMm * 10, dim.heightMm * 10, false, palette);
    drawSchNetsAndShapes(ctx, sheet, viewport, palette, null, null, null, []);
    drawSchComponentsAndOverlays({ ctx, sheet, gridSize: 2.5, viewport, palette, customCompMap: defs, selectedCompIds: [], tool: 'select', previewComponentDef: null, selectedPartIndex: 1, cursorMm: { x: 0, y: 0 }, placeAngle: 0, placeFlipX: false, placeFlipY: false, wireDraftPts: [], elbowFlip: false, shapeStartPt: null, marqueeBox: null, ercErrors: [], snapWorldSmart: p => p });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim.widthMm}mm" height="${dim.heightMm}mm" viewBox="0 0 ${dim.widthMm} ${dim.heightMm}"><defs><style>@font-face{font-family:OpenGost;src:url('${gostFontData}') format('truetype');font-weight:400;font-style:normal}</style></defs><rect width="100%" height="100%" fill="white"/>${recorder.elements.join('')}</svg>`;
}
export function printSchematicProject(project: SchematicProject, defs: Record<string, ComponentDef>): void {
    const old = document.querySelector('#siptrace-print');
    old?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'siptrace-print';
    frame.title = 'Печать схемы';
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;';
    document.body.append(frame);
    const doc = frame.contentDocument;
    if (!doc)
        return;
    const styles = project.sheets.map((s, i) => { const d = SHEET_FORMATS[s.format]; return `@page sheet${i}{size:${d.widthMm}mm ${d.heightMm}mm;margin:0}.sheet${i}{page:sheet${i};width:${d.widthMm}mm;height:${d.heightMm}mm}`; }).join('');
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${xmlEscape(project.projectName)}</title><style>html,body{margin:0;padding:0}section{break-after:page}section:last-child{break-after:auto}svg{display:block;width:100%;height:100%}*{print-color-adjust:exact}${styles}</style></head><body>${project.sheets.map((s, i) => `<section class="sheet${i}">${renderSchematicSvg(s, defs)}</section>`).join('')}</body></html>`);
    doc.close();
    frame.contentWindow?.focus();
    if (doc.fonts) {
        void doc.fonts.load('12px OpenGost', 'Схема').then(() => frame.contentWindow?.print(), () => frame.contentWindow?.print());
    } else {
        setTimeout(() => frame.contentWindow?.print(), 200);
    }
}
