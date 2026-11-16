import { ComponentDef, Point2D, SchematicSheet } from '../types';
import { dist, pointToSegmentDist, transformPoint } from '../geometry';
import { entityBounds, findEntity } from './editing';

/** Bounds are for marquee selection; pointer selection tests the actual visible geometry. */
export function hitTestEntity(sheet: SchematicSheet, id: string, point: Point2D, tolerance: number, defs: Record<string, ComponentDef>): boolean {
    const label = /^(refDes|value)@(.+)$/.exec(id);
    if (label) {
        const c = sheet.components.find(c => c.id === label[2]);
        if (!c || !(label[1] === 'refDes' ? c.showRefDes : c.showValue)) return false;
        const offset = label[1] === 'refDes' ? c.refDesOffset : c.valueOffset;
        const local = transformPoint(point.x - c.x - offset.x, point.y - c.y - offset.y, 0, 0, -(c.labelAngle ?? 0));
        const size = label[1] === 'refDes' ? 3 : 2.6;
        const halfWidth = String(c[label[1] as 'refDes' | 'value']).length * size * .3;
        return Math.abs(local.x) <= halfWidth + tolerance / 2 && Math.abs(local.y) <= size / 2 + tolerance / 2;
    }
    const item = findEntity(sheet, id);
    if (!item) return false;
    const o = item.object;
    if (o.points) return o.points.some((p: Point2D, i: number) => i > 0 && pointToSegmentDist(point, o.points[i - 1], p) <= tolerance + (o.width ?? .35) / 2);
    if (item.kind === 'junctions') return dist(point, o) <= tolerance + .85;
    if (item.kind === 'shapes') {
        const radius = tolerance + (o.width ?? .35) / 2;
        if (o.type === 'line') return pointToSegmentDist(point, { x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }) <= radius;
        if (o.type === 'circle') {
            const distance = dist(point, { x: o.cx, y: o.cy });
            return o.fill ? distance <= o.r + radius : Math.abs(distance - o.r) <= radius;
        }
        const local = transformPoint(point.x - o.x, point.y - o.y, 0, 0, -(o.angle ?? 0));
        if (o.flipX) local.x = -local.x;
        if (o.flipY) local.y = -local.y;
        if (o.type === 'rect' && !o.fill) {
            const corners = [{ x: 0, y: 0 }, { x: o.w, y: 0 }, { x: o.w, y: o.h }, { x: 0, y: o.h }];
            return corners.some((p, i) => pointToSegmentDist(local, p, corners[(i + 1) % 4]) <= radius);
        }
        const width = o.type === 'table' ? o.colWidths.reduce((a: number, b: number) => a + b, 0) : o.type === 'text' ? Math.max(3, o.text.length * o.size * .6) : o.w;
        const height = o.type === 'table' ? o.rows.length * o.rowHeight : o.type === 'text' ? o.size * 1.3 : o.h;
        return local.x >= -tolerance && local.x <= width + tolerance && local.y >= -tolerance && local.y <= height + tolerance;
    }
    const b = entityBounds(sheet, id, defs);
    return point.x >= b.minX - tolerance && point.x <= b.maxX + tolerance && point.y >= b.minY - tolerance && point.y <= b.maxY + tolerance;
}
