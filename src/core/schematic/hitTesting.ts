import { ComponentDef, Point2D, SchematicSheet } from '../types';
import { dist, pointToSegmentDist, transformPoint } from '../geometry';
import { entityBounds, findEntity } from './editing';
import { findComponentById } from '../../gost/libraries/gostComponents';

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
    if (item.kind === 'components') {
        const def = defs[o.componentDefId] ?? findComponentById(o.componentDefId);
        const part = def?.parts?.find((p: any) => p.partIndex === (o.partIndex ?? 1)) ?? def?.parts?.[0];
        if (part) {
            let local = transformPoint(point.x - o.x, point.y - o.y, 0, 0, -(o.angle ?? 0));
            if (o.flipX) local.x = -local.x;
            if (o.flipY) local.y = -local.y;
            const r = tolerance + 0.35;

            // Check pins
            for (const pin of part.pins ?? []) {
                const len = pin.length ?? 5;
                const rad = ((pin.orientation ?? 0) * Math.PI) / 180;
                const p2 = { x: pin.x + Math.cos(rad) * len, y: pin.y + Math.sin(rad) * len };
                if (pointToSegmentDist(local, { x: pin.x, y: pin.y }, p2) <= r) return true;
                if (dist(local, { x: pin.x, y: pin.y }) <= r + 0.5) return true;
            }

            // Check primitives
            for (const prim of part.primitives ?? []) {
                if (prim.type === 'line') {
                    if (pointToSegmentDist(local, { x: prim.x1, y: prim.y1 }, { x: prim.x2, y: prim.y2 }) <= r) return true;
                } else if (prim.type === 'circle') {
                    const d = dist(local, { x: prim.cx, y: prim.cy });
                    if (prim.fill ? d <= prim.r + r : Math.abs(d - prim.r) <= r) return true;
                } else if (prim.type === 'rect') {
                    if (prim.fill) {
                        if (local.x >= prim.x - r && local.x <= prim.x + prim.w + r && local.y >= prim.y - r && local.y <= prim.y + prim.h + r) return true;
                    } else {
                        const corners = [
                            { x: prim.x, y: prim.y },
                            { x: prim.x + prim.w, y: prim.y },
                            { x: prim.x + prim.w, y: prim.y + prim.h },
                            { x: prim.x, y: prim.y + prim.h }
                        ];
                        if (corners.some((p, i) => pointToSegmentDist(local, p, corners[(i + 1) % 4]) <= r)) return true;
                    }
                } else if (prim.type === 'polyline' && prim.points) {
                    for (let i = 1; i < prim.points.length; i++) {
                        if (pointToSegmentDist(local, prim.points[i - 1], prim.points[i]) <= r) return true;
                    }
                } else if (prim.type === 'text') {
                    const tw = (prim.text?.length ?? 1) * (prim.size ?? 2.5) * 0.6;
                    const th = (prim.size ?? 2.5) * 1.2;
                    if (Math.abs(local.x - prim.x) <= tw / 2 + r && Math.abs(local.y - prim.y) <= th / 2 + r) return true;
                }
            }
            return false;
        }
    }
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
