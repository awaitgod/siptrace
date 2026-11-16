import { SchematicSheet } from '../../../../core/types';
import { SchThemePalette, SchViewport } from '../types';
/** Renders schematic buses, wires, junctions, net ports, hierarchy blocks, diff pairs, and free shapes. */
export function drawSchNetsAndShapes(ctx: CanvasRenderingContext2D, sheet: SchematicSheet, viewport: SchViewport, palette: SchThemePalette, selectedWireId: string | null, selectedPortId: string | null, highlightedNet: string | null, selectedIds: string[] = []): void {
    // Buses & Bus Taps
    for (const bus of sheet.buses) {
        if (bus.points.length < 2)
            continue;
        ctx.strokeStyle = selectedIds.includes(bus.id) ? '#0088CC' : palette.busColor;
        ctx.lineWidth = Math.max(2 / viewport.pxPerMm, 0.85);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bus.points[0].x, bus.points[0].y);
        for (let i = 1; i < bus.points.length; i++)
            ctx.lineTo(bus.points[i].x, bus.points[i].y);
        ctx.stroke();
        ctx.fillStyle = palette.busColor;
        ctx.font = `bold 3px "Segoe UI", Arial`;
        ctx.fillText(bus.busName, bus.points[0].x + 1.5, bus.points[0].y - 1.8);
    }
    for (const tap of sheet.busTaps) {
        ctx.save();
        ctx.translate(tap.x, tap.y);
        ctx.rotate((tap.angle ?? 0) * Math.PI / 180);
        ctx.translate(-tap.x, -tap.y);
        ctx.strokeStyle = palette.wireColor;
        ctx.lineWidth = Math.max(1 / viewport.pxPerMm, 0.3);
        ctx.beginPath();
        ctx.moveTo(tap.x, tap.y);
        ctx.lineTo(tap.x + 2.5, tap.y + 2.5);
        ctx.stroke();
        ctx.fillStyle = palette.wireColor;
        ctx.font = `2.3px "Segoe UI", Arial`;
        ctx.fillText(tap.signalName, tap.x + 2.8, tap.y + 2.5);
        ctx.restore();
    }
    // Wires
    for (const wItem of sheet.wires) {
        if (wItem.points.length < 2)
            continue;
        const isSel = selectedIds.includes(wItem.id) || wItem.id === selectedWireId || (highlightedNet && wItem.netName === highlightedNet);
        ctx.strokeStyle = isSel ? '#FFFF44' : wItem.color ?? palette.wireColor;
        ctx.lineWidth = Math.max((isSel ? 2.2 : 1.2) / viewport.pxPerMm, wItem.width ?? 0.35);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(wItem.points[0].x, wItem.points[0].y);
        for (let i = 1; i < wItem.points.length; i++) {
            ctx.lineTo(wItem.points[i].x, wItem.points[i].y);
        }
        ctx.stroke();
    }
    // Junctions
    ctx.fillStyle = palette.wireColor;
    for (const j of sheet.junctions) {
        ctx.beginPath();
        ctx.arc(j.x, j.y, 0.85, 0, Math.PI * 2);
        ctx.fill();
    }
    // Net Ports
    for (const np of sheet.netPorts) {
        const isSel = np.id === selectedPortId || (highlightedNet && np.netName === highlightedNet);
        ctx.strokeStyle = isSel ? '#FFFF44' : palette.portColor;
        ctx.fillStyle = isSel ? '#FFFF44' : palette.portColor;
        ctx.lineWidth = Math.max(1.1 / viewport.pxPerMm, 0.35);
        ctx.save();
        ctx.translate(np.x, np.y);
        ctx.rotate(np.angle * Math.PI / 180);
        ctx.translate(-np.x, -np.y);
        ctx.beginPath();
        if (np.style === 'Ground') {
            ctx.moveTo(np.x, np.y);
            ctx.lineTo(np.x, np.y + 3);
            ctx.moveTo(np.x - 2.6, np.y + 3);
            ctx.lineTo(np.x + 2.6, np.y + 3);
            ctx.moveTo(np.x - 1.6, np.y + 4.2);
            ctx.lineTo(np.x + 1.6, np.y + 4.2);
            ctx.moveTo(np.x - 0.7, np.y + 5.4);
            ctx.lineTo(np.x + 0.7, np.y + 5.4);
            ctx.stroke();
        }
        else if (np.style === 'Power') {
            ctx.moveTo(np.x, np.y);
            ctx.lineTo(np.x, np.y - 3.5);
            ctx.moveTo(np.x - 2.4, np.y - 3.5);
            ctx.lineTo(np.x + 2.4, np.y - 3.5);
            ctx.stroke();
            ctx.font = `bold 2.8px "Segoe UI", Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(np.netName, np.x, np.y - 4.2);
        }
        else {
            const dir = np.style === 'PortLeft' || np.style === 'OffPageIn' ? -1 : 1;
            ctx.moveTo(np.x, np.y);
            ctx.lineTo(np.x + dir * 2.5, np.y - 1.5);
            ctx.lineTo(np.x + dir * 8.5, np.y - 1.5);
            ctx.lineTo(np.x + dir * 8.5, np.y + 1.5);
            ctx.lineTo(np.x + dir * 2.5, np.y + 1.5);
            ctx.closePath();
            ctx.stroke();
            ctx.font = `2.6px "Segoe UI", Arial`;
            ctx.textAlign = dir > 0 ? 'left' : 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(np.netName, np.x + dir * 9.5, np.y);
        }
        ctx.restore();
    }
    // Hierarchy Blocks
    for (const hb of sheet.hierarchyBlocks) {
        ctx.save();
        ctx.translate(hb.x, hb.y);
        ctx.rotate((hb.angle ?? 0) * Math.PI / 180);
        ctx.scale(hb.flipX ? -1 : 1, hb.flipY ? -1 : 1);
        ctx.translate(-hb.x, -hb.y);
        ctx.strokeStyle = palette.scheme === 'gost-bw' ? palette.frameColor : '#66CCFF';
        ctx.fillStyle = palette.scheme === 'gost-bw' ? 'rgba(0, 0, 0, 0.04)' : 'rgba(0, 120, 215, 0.14)';
        ctx.lineWidth = 0.45;
        ctx.fillRect(hb.x, hb.y, hb.w, hb.h);
        ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
        ctx.fillStyle = palette.textColor;
        ctx.font = `bold 3px "Segoe UI", Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(hb.name, hb.x + hb.w / 2, hb.y + hb.h / 2);
        for (const pin of hb.pins) {
            const x = hb.x + (pin.side === 'right' ? hb.w : 0), y = hb.y + pin.offset;
            ctx.beginPath();
            ctx.arc(x, y, .7, 0, Math.PI * 2);
            ctx.stroke();
            ctx.textAlign = pin.side === 'right' ? 'right' : 'left';
            ctx.fillText(pin.name, x + (pin.side === 'right' ? -2 : 2), y);
        }
        ctx.restore();
    }
    // DiffPair Tags
    for (const dp of sheet.diffPairs) {
        ctx.save();
        ctx.translate(dp.x, dp.y);
        ctx.rotate((dp.angle ?? 0) * Math.PI / 180);
        ctx.translate(-dp.x, -dp.y);
        const dpColor = palette.scheme === 'dark' ? '#FF99FF' : palette.scheme === 'light' ? '#8800AA' : palette.frameColor;
        ctx.strokeStyle = dpColor;
        ctx.lineWidth = 0.35;
        ctx.strokeRect(dp.x - 4, dp.y - 2, 18, 4);
        ctx.fillStyle = dpColor;
        ctx.font = `2.4px "Segoe UI", Arial`;
        ctx.textAlign = 'left';
        ctx.fillText(`Diff: ${dp.pairName}`, dp.x - 3, dp.y);
        ctx.restore();
    }
    // Shapes & Tables
    for (const sh of sheet.shapes) {
        ctx.save();
        if (sh.type !== 'line' && sh.type !== 'circle') {
            ctx.translate(sh.x, sh.y);
            ctx.rotate((sh.angle ?? 0) * Math.PI / 180);
            ctx.scale(sh.flipX ? -1 : 1, sh.flipY ? -1 : 1);
            ctx.translate(-sh.x, -sh.y);
        }
        ctx.strokeStyle = palette.scheme === 'gost-bw' ? palette.frameColor : sh.color ?? palette.frameColor;
        ctx.fillStyle = palette.scheme === 'gost-bw' ? palette.frameColor : sh.color ?? palette.frameColor;
        if (sh.type === 'line') {
            ctx.lineWidth = sh.width;
            ctx.beginPath();
            ctx.moveTo(sh.x1, sh.y1);
            ctx.lineTo(sh.x2, sh.y2);
            ctx.stroke();
        }
        else if (sh.type === 'rect') {
            ctx.lineWidth = sh.width;
            if (sh.fill)
                ctx.fillRect(sh.x, sh.y, sh.w, sh.h);
            else
                ctx.strokeRect(sh.x, sh.y, sh.w, sh.h);
        }
        else if (sh.type === 'circle') {
            ctx.lineWidth = sh.width;
            ctx.beginPath();
            ctx.arc(sh.cx, sh.cy, sh.r, 0, Math.PI * 2);
            if (sh.fill)
                ctx.fill();
            else
                ctx.stroke();
        }
        else if (sh.type === 'text') {
            ctx.font = `${sh.italic ? 'italic ' : ''}${sh.bold ? 'bold ' : ''}${sh.size}px "Segoe UI", Arial`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(sh.text, sh.x, sh.y);
        }
        else if (sh.type === 'table') {
            ctx.lineWidth = 0.25;
            let cy = sh.y;
            for (let r = 0; r < sh.rows.length; r++) {
                let cx = sh.x;
                for (let cIdx = 0; cIdx < sh.colWidths.length; cIdx++) {
                    const cw = sh.colWidths[cIdx];
                    ctx.strokeRect(cx, cy, cw, sh.rowHeight);
                    ctx.font = `${r === 0 ? 'bold ' : ''}2.5px "Segoe UI", Arial`;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(sh.rows[r][cIdx] ?? '', cx + 1.2, cy + sh.rowHeight / 2, cw - 2);
                    cx += cw;
                }
                cy += sh.rowHeight;
            }
        }
        ctx.restore();
    }
}
