import { ComponentDef, Point2D, SchematicSheet, SchematicProject, SchWire, PlacedComponent } from '../types';
import { dist, pointToSegmentDist, transformPoint, uid } from '../geometry';
import { getComponentWorldPins } from '../../engines/erc';
import { findComponentById } from '../../gost/libraries/gostComponents';
export const collections = ['components', 'wires', 'buses', 'busTaps', 'junctions', 'netPorts', 'diffPairs', 'hierarchyBlocks', 'shapes'] as const;
export type EntityCollection = typeof collections[number];
export interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}
export const labelId = (id: string, field: 'refDes' | 'value') => `${field}@${id}`;
export function allIds(sheet: SchematicSheet): string[] { return collections.flatMap(k => sheet[k].map(o => o.id)); }
export function findEntity(sheet: SchematicSheet, id: string): {
    kind: EntityCollection;
    object: any;
} | null {
    for (const kind of collections) {
        const object = sheet[kind].find(o => o.id === id);
        if (object)
            return { kind, object };
    }
    return null;
}
function pointsBounds(points: Point2D[]): Bounds {
    return { minX: Math.min(...points.map(p => p.x)), minY: Math.min(...points.map(p => p.y)), maxX: Math.max(...points.map(p => p.x)), maxY: Math.max(...points.map(p => p.y)) };
}
export function entityBounds(sheet: SchematicSheet, id: string, defs: Record<string, ComponentDef> = {}): Bounds {
    const label = /^(refDes|value)@(.+)$/.exec(id);
    if (label) {
        const c = sheet.components.find(c => c.id === label[2]);
        if (c) {
            const offset = label[1] === 'refDes' ? c.refDesOffset : c.valueOffset;
            const text = String(c[label[1] as 'refDes' | 'value']);
            return { minX: c.x + offset.x - text.length, maxX: c.x + offset.x + text.length, minY: c.y + offset.y - 1.8, maxY: c.y + offset.y + 1.8 };
        }
    }
    const hit = findEntity(sheet, id);
    if (!hit)
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const o = hit.object;
    if (o.points)
        return pointsBounds(o.points.length ? o.points : [{ x: 0, y: 0 }]);
    if (hit.kind === 'components') {
        const def = findComponentById(o.componentDefId, defs), part = def?.parts.find(p => p.partIndex === o.partIndex) ?? def?.parts[0];
        const pts: Point2D[] = [];
        for (const p of part?.primitives ?? []) {
            if (p.type === 'rect')
                pts.push({ x: p.x, y: p.y }, { x: p.x + p.w, y: p.y + p.h });
            if (p.type === 'line')
                pts.push({ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 });
            if (p.type === 'polyline')
                pts.push(...p.points);
            if (p.type === 'circle' || p.type === 'arc')
                pts.push({ x: p.cx - p.r, y: p.cy - p.r }, { x: p.cx + p.r, y: p.cy + p.r });
        }
        pts.push(...(part?.pins ?? []));
        const b = pts.length ? pointsBounds(pts) : { minX: -5, minY: -5, maxX: 5, maxY: 5 };
        return pointsBounds([{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.minX, y: b.maxY }, { x: b.maxX, y: b.maxY }].map(p => transformPoint(p.x, p.y, o.x, o.y, o.angle, o.flipX, o.flipY)));
    }
    if (o.type === 'line')
        return pointsBounds([{ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }]);
    if (o.type === 'circle')
        return { minX: o.cx - o.r, maxX: o.cx + o.r, minY: o.cy - o.r, maxY: o.cy + o.r };
    const w = o.w ?? (o.type === 'table' ? o.colWidths.reduce((a: number, b: number) => a + b, 0) : o.type === 'text' ? Math.max(3, o.text.length * o.size * 0.6) : 3);
    const h = o.h ?? (o.type === 'table' ? o.rows.length * o.rowHeight : o.type === 'text' ? o.size * 1.3 : 3);
    return pointsBounds([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }].map(p => transformPoint(p.x, p.y, o.x, o.y, o.angle ?? 0, o.flipX, o.flipY)));
}
export function selectionBounds(sheet: SchematicSheet, ids: string[], defs: Record<string, ComponentDef> = {}): Bounds {
    const bs = ids.map(id => entityBounds(sheet, id, defs));
    return bs.length ? { minX: Math.min(...bs.map(b => b.minX)), maxX: Math.max(...bs.map(b => b.maxX)), minY: Math.min(...bs.map(b => b.minY)), maxY: Math.max(...bs.map(b => b.maxY)) } : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}
export function normalizePoints(points: Point2D[]): Point2D[] {
    const out: Point2D[] = [];
    for (const p of points) {
        const q = { x: Math.round(p.x * 1e6) / 1e6, y: Math.round(p.y * 1e6) / 1e6 };
        if (out.length && dist(out[out.length - 1], q) < 1e-5)
            continue;
        if (out.length > 1 && pointToSegmentDist(out[out.length - 1], out[out.length - 2], q) < 1e-5)
            out.pop();
        out.push(q);
    }
    return out;
}
export function onWire(p: Point2D, wire: SchWire, eps = 0.01): boolean { return wire.points.some((q, i) => i > 0 && pointToSegmentDist(p, wire.points[i - 1], q) < eps); }
/** Preserve explicit crossings; remove dangling dots; derive T junctions from real endpoints. */
export function normalizeSheet(sheet: SchematicSheet): SchematicSheet {
    const keys = new Set<string>();
    const wires = sheet.wires.map(w => ({ ...w, points: normalizePoints(w.points) })).filter(w => {
        if (w.points.length < 2)
            return false;
        const a = JSON.stringify(w.points), b = JSON.stringify([...w.points].reverse());
        const key = `${w.netName}|${w.netClassId ?? ''}|${a < b ? a : b}`;
        if (keys.has(key))
            return false;
        keys.add(key);
        return true;
    });
    const candidates = [...sheet.junctions, ...wires.flatMap(w => [w.points[0], w.points[w.points.length - 1]].map(p => ({ ...p, id: uid('junc'), netName: w.netName })))];
    const junctions: SchematicSheet['junctions'] = [];
    for (const j of candidates) {
        const touching = wires.filter(w => onWire(j, w));
        const arms = touching.reduce((n, w) => n + (dist(j, w.points[0]) < .01 || dist(j, w.points[w.points.length - 1]) < .01 ? 1 : 2), 0);
        if (touching.length >= 2 && arms >= 3 && !junctions.some(q => dist(q, j) < .01))
            junctions.push(j);
    }
    return { ...sheet, wires, junctions, busTaps: sheet.busTaps.filter(t => wires.some(w => w.id === t.wireId) && sheet.buses.some(b => b.id === t.busId)) };
}
export function commitWire(sheet: SchematicSheet, points: Point2D[], bus = false, netName = ''): SchematicSheet {
    const pts = normalizePoints(points);
    if (pts.length < 2)
        return sheet;
    if (bus)
        return { ...sheet, buses: [...sheet.buses, { id: uid('bus'), points: pts, busName: netName || 'D[0..7]' }] };
    const connected = sheet.wires.find(w => onWire(pts[0], w) || onWire(pts[pts.length - 1], w));
    return normalizeSheet({ ...sheet, wires: [...sheet.wires, { id: uid('wire'), points: pts, netName: netName || connected?.netName || '' }] });
}
export function deleteEntities(sheet: SchematicSheet, ids: string[]): SchematicSheet {
    const next = { ...sheet };
    for (const k of collections)
        (next as any)[k] = sheet[k].filter(o => !ids.includes(o.id));
    next.components = next.components.map(c => ({ ...c, showRefDes: ids.includes(labelId(c.id, 'refDes')) ? false : c.showRefDes, showValue: ids.includes(labelId(c.id, 'value')) ? false : c.showValue }));
    return normalizeSheet(next);
}
export type EditTransform = {
    dx?: number;
    dy?: number;
    rotate?: number;
    flip?: 'X' | 'Y';
    origin?: Point2D;
    preserveConnections?: boolean;
};
export function transformEntities(sheet: SchematicSheet, ids: string[], op: EditTransform, defs: Record<string, ComponentDef> = {}): SchematicSheet {
    const b = selectionBounds(sheet, ids, defs), center = op.origin ?? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    const tr = (p: Point2D): Point2D => { const q = transformPoint(p.x - center.x, p.y - center.y, center.x, center.y, op.rotate ?? 0, op.flip === 'X', op.flip === 'Y'); return { x: q.x + (op.dx ?? 0), y: q.y + (op.dy ?? 0) }; };
    const vector = (p: Point2D) => transformPoint(p.x, p.y, 0, 0, op.rotate ?? 0, op.flip === 'X', op.flip === 'Y');
    const selected = new Set(ids), anchors: Point2D[] = [];
    for (const c of sheet.components)
        if (selected.has(c.id))
            anchors.push(...getComponentWorldPins(c, defs));
    for (const p of [...sheet.netPorts, ...sheet.junctions])
        if (selected.has(p.id))
            anchors.push(p);
    const near = (p: Point2D) => anchors.some(a => dist(a, p) < .01);
    const wholeWires = new Set(sheet.wires.filter(w => selected.has(w.id) || (op.preserveConnections !== false && near(w.points[0]) && near(w.points[w.points.length - 1]))).map(w => w.id));
    for (const w of sheet.wires)
        if (wholeWires.has(w.id))
            anchors.push(...w.points);
    for (const j of sheet.junctions)
        if (sheet.wires.some(w => wholeWires.has(w.id) && onWire(j, w)))
            anchors.push(j);
    const components = sheet.components.map(c => {
        if (!selected.has(c.id)) {
            const next = { ...c };
            for (const field of ['refDes', 'value'] as const)
                if (selected.has(labelId(c.id, field))) {
                    const key = field === 'refDes' ? 'refDesOffset' : 'valueOffset', p = tr({ x: c.x + c[key].x, y: c.y + c[key].y });
                    next[key] = { x: p.x - c.x, y: p.y - c.y };
                }
            return next;
        }
        const pos = tr(c), axis = vector(transformPoint(1, 0, 0, 0, c.angle));
        const angle = ((Math.round(Math.atan2(axis.y, axis.x) * 180 / Math.PI) + 360) % 360) as PlacedComponent['angle'];
        return { ...c, ...pos, angle, flipY: op.flip ? !c.flipY : c.flipY, refDesOffset: vector(c.refDesOffset), valueOffset: vector(c.valueOffset), labelAngle: ((c.labelAngle ?? 0) + (op.rotate ?? 0)) % 360 };
    });
    const wires = sheet.wires.map(w => {
        if (wholeWires.has(w.id))
            return { ...w, points: w.points.map(tr) };
        if (op.preserveConnections === false)
            return w;
        // Insert moved electrical anchors on segment interiors before stretching.
        const electricalPoints = [...anchors, ...sheet.junctions, ...sheet.netPorts, ...sheet.components.flatMap(c => getComponentWorldPins(c, defs)), ...sheet.wires.flatMap(w => [w.points[0], w.points.at(-1)!])];
        const expanded: Point2D[] = [];
        for (let i = 0; i < w.points.length; i++) {
            if (i)
                expanded.push(...electricalPoints.filter(a => dist(a, w.points[i - 1]) > .01 && dist(a, w.points[i]) > .01 && pointToSegmentDist(a, w.points[i - 1], w.points[i]) < .01).sort((a, b) => dist(a, w.points[i - 1]) - dist(b, w.points[i - 1])));
            expanded.push(w.points[i]);
        }
        const points: Point2D[] = [];
        for (let i = 0; i < expanded.length; i++) {
            const p = expanded[i], moved = near(p), q = moved ? tr(p) : p;
            if (i) {
                const prev = expanded[i - 1], prevMoved = near(prev), a = points[points.length - 1];
                if (moved !== prevMoved && Math.abs(q.x - a.x) > 1e-5 && Math.abs(q.y - a.y) > 1e-5) {
                    const horizontal = Math.abs(prev.y - p.y) < .01;
                    points.push(horizontal ? { x: moved ? a.x : q.x, y: moved ? q.y : a.y } : { x: moved ? q.x : a.x, y: moved ? a.y : q.y });
                }
            }
            points.push(q);
        }
        return { ...w, points };
    });
    // A 180° turn must not route a stretched lead through the component's other pin.
    const oldPins = sheet.components.flatMap(c => getComponentWorldPins(c, defs));
    const newPins = components.flatMap(c => getComponentWorldPins(c, defs));
    const safeWires = wires.map(w => {
        const original = sheet.wires.find(o => o.id === w.id)!;
        const blocked = newPins.filter(pin => { const old = oldPins.find(p => p.compId === pin.compId && p.pinNumber === pin.pinNumber); return old && !onWire(old, original); });
        const points: Point2D[] = [w.points[0]];
        for (let i = 1; i < w.points.length; i++) {
            const a = w.points[i - 1], b = w.points[i];
            if (blocked.some(p => pointToSegmentDist(p, a, b) < .25 && dist(p, a) > .25 && dist(p, b) > .25)) {
                for (let attempt = 1; attempt <= 12; attempt++) {
                    const offset = Math.ceil(attempt / 2) * 2.5 * (attempt % 2 ? 1 : -1), horizontal = Math.abs(a.y - b.y) < .01;
                    const c = horizontal ? { x: a.x, y: a.y + offset } : { x: a.x + offset, y: a.y }, d = horizontal ? { x: b.x, y: b.y + offset } : { x: b.x + offset, y: b.y };
                    if (!blocked.some(p => pointToSegmentDist(p, a, c) < .25 || pointToSegmentDist(p, c, d) < .25 || pointToSegmentDist(p, d, b) < .25)) {
                        points.push(c, d);
                        break;
                    }
                }
            }
            points.push(b);
        }
        return { ...w, points };
    });
    const next: SchematicSheet = { ...sheet, components, wires: safeWires,
        junctions: sheet.junctions.map(j => selected.has(j.id) || (op.preserveConnections !== false && near(j)) ? { ...j, ...tr(j) } : j),
        netPorts: sheet.netPorts.map(p => selected.has(p.id) ? { ...p, ...tr(p), angle: (((p.angle + (op.rotate ?? 0)) % 360 + 360) % 360) as typeof p.angle } : p),
        buses: sheet.buses.map(b => selected.has(b.id) ? { ...b, points: b.points.map(tr) } : b),
        busTaps: sheet.busTaps.map(o => selected.has(o.id) ? { ...o, ...tr(o), angle: (o.angle ?? 0) + (op.rotate ?? 0) } : o),
        diffPairs: sheet.diffPairs.map(o => selected.has(o.id) ? { ...o, ...tr(o), angle: (o.angle ?? 0) + (op.rotate ?? 0) } : o),
        hierarchyBlocks: sheet.hierarchyBlocks.map(o => { if (!selected.has(o.id))
            return o; const axis = vector(transformPoint(1, 0, 0, 0, o.angle ?? 0)); return { ...o, ...tr(o), angle: Math.atan2(axis.y, axis.x) * 180 / Math.PI, flipY: op.flip ? !o.flipY : o.flipY }; }),
        shapes: sheet.shapes.map(o => {
            if (!selected.has(o.id))
                return o;
            if (o.type === 'line') {
                const a = tr({ x: o.x1, y: o.y1 }), b = tr({ x: o.x2, y: o.y2 });
                return { ...o, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
            }
            if (o.type === 'circle') {
                const p = tr({ x: o.cx, y: o.cy });
                return { ...o, cx: p.x, cy: p.y };
            }
            const axis = vector(transformPoint(1, 0, 0, 0, o.angle ?? 0));
            return { ...o, ...tr(o), angle: Math.atan2(axis.y, axis.x) * 180 / Math.PI, flipY: op.flip ? !o.flipY : o.flipY };
        }) };
    return normalizeSheet(next);
}
export interface SchematicClipboard {
    sheet: SchematicSheet;
    componentDefs: SchematicProject['customComponentDefs'];
    patternDefs: SchematicProject['customPatternDefs'];
}
let clipboard: SchematicClipboard | null = null;
export function copyFragment(project: SchematicProject, sheet: SchematicSheet, ids: string[]): SchematicClipboard {
    const fragment = structuredClone(sheet);
    for (const k of collections)
        (fragment as any)[k] = fragment[k].filter(o => ids.includes(o.id));
    for (const id of ids) {
        const match = /^(refDes|value)@(.+)$/.exec(id);
        if (match && !ids.includes(match[2])) {
            const c = sheet.components.find(c => c.id === match[2]);
            if (c) {
                const offset = match[1] === 'refDes' ? c.refDesOffset : c.valueOffset;
                fragment.shapes.push({ id: uid('label'), type: 'text', x: c.x + offset.x, y: c.y + offset.y, text: c[match[1] as 'refDes' | 'value'], size: 3, angle: c.labelAngle ?? 0 });
            }
        }
    }
    clipboard = { sheet: fragment, componentDefs: structuredClone(project.customComponentDefs), patternDefs: structuredClone(project.customPatternDefs) };
    return clipboard;
}
export function getClipboard(): SchematicClipboard | null { return clipboard; }
export function pasteFragment(project: SchematicProject, source: SchematicClipboard, point: Point2D, defs: Record<string, ComponentDef>): {
    sheet: SchematicSheet;
    ids: string[];
    componentDefs: SchematicProject['customComponentDefs'];
    patternDefs: SchematicProject['customPatternDefs'];
} {
    const sheet = structuredClone(source.sheet);
    const componentDefs = structuredClone(source.componentDefs), patternDefs = structuredClone(source.patternDefs);
    for (const [id, def] of Object.entries(componentDefs))
        if (project.customComponentDefs[id] && JSON.stringify(project.customComponentDefs[id]) !== JSON.stringify(def)) {
            const nextId = uid('symbol');
            componentDefs[nextId] = { ...def, id: nextId };
            delete componentDefs[id];
            for (const c of sheet.components)
                if (c.componentDefId === id)
                    c.componentDefId = nextId;
        }
    for (const [id, def] of Object.entries(patternDefs))
        if (project.customPatternDefs[id] && JSON.stringify(project.customPatternDefs[id]) !== JSON.stringify(def)) {
            const nextId = uid('pattern');
            patternDefs[nextId] = { ...def, id: nextId };
            delete patternDefs[id];
            for (const c of sheet.components)
                if (c.patternId === id)
                    c.patternId = nextId;
        }
    const idMap = new Map<string, string>(), refs = new Map<string, string>();
    const used = new Set(project.sheets.flatMap(s => s.components.map(c => c.refDes)));
    for (const k of collections)
        for (const o of sheet[k]) {
            idMap.set(o.id, uid(k));
            o.id = idMap.get(o.id)!;
        }
    for (const c of sheet.components) {
        const key = c.instanceId ?? `${c.componentDefId}:${c.refDes}`;
        if (!refs.has(key)) {
            const prefix = c.refDes.replace(/\d+$/, '') || 'DD';
            let n = 1;
            while (used.has(prefix + n))
                n++;
            refs.set(key, c.refDes.startsWith('#') ? c.refDes : prefix + n);
            used.add(refs.get(key)!);
        }
        c.refDes = refs.get(key)!;
        c.instanceId = idMap.get(key) ?? `package_${c.refDes}`;
    }
    for (const t of sheet.busTaps) {
        t.busId = idMap.get(t.busId) ?? '';
        t.wireId = idMap.get(t.wireId) ?? '';
    }
    const mergedDefs = { ...defs, ...componentDefs };
    const ids = allIds(sheet), b = selectionBounds(sheet, ids, mergedDefs);
    return { sheet: transformEntities(sheet, ids, { dx: point.x - b.minX, dy: point.y - b.minY, preserveConnections: false }, mergedDefs), ids, componentDefs, patternDefs };
}
export function mergeFragment(sheet: SchematicSheet, fragment: SchematicSheet): SchematicSheet {
    const next = { ...sheet };
    for (const k of collections)
        (next as any)[k] = [...sheet[k], ...fragment[k]];
    return normalizeSheet(next);
}
export function editWire(sheet: SchematicSheet, id: string, point: Point2D, action: 'split' | 'merge' | 'trim'): SchematicSheet {
    const wire = sheet.wires.find(w => w.id === id);
    if (!wire)
        return sheet;
    if (action === 'merge') {
        let points = [...wire.points], remaining = sheet.wires.filter(w => w.id !== id), merged = true;
        while (merged) {
            merged = false;
            for (const w of remaining) {
                if (w.netName !== wire.netName || w.netClassId !== wire.netClassId)
                    continue;
                let append: Point2D[] | null = null, prepend = false;
                if (dist(points.at(-1)!, w.points[0]) < .01)
                    append = w.points.slice(1);
                else if (dist(points.at(-1)!, w.points.at(-1)!) < .01)
                    append = [...w.points].reverse().slice(1);
                else if (dist(points[0], w.points.at(-1)!) < .01) {
                    append = w.points.slice(0, -1);
                    prepend = true;
                }
                else if (dist(points[0], w.points[0]) < .01) {
                    append = [...w.points].reverse().slice(0, -1);
                    prepend = true;
                }
                if (append) {
                    points = prepend ? [...append, ...points] : [...points, ...append];
                    remaining = remaining.filter(q => q.id !== w.id);
                    merged = true;
                    break;
                }
            }
        }
        return normalizeSheet({ ...sheet, wires: [...remaining, { ...wire, points }] });
    }
    const index = wire.points.map((p, i) => ({ i, d: i ? pointToSegmentDist(point, wire.points[i - 1], p) : Infinity })).sort((a, b) => a.d - b.d)[0].i;
    if (!index)
        return sheet;
    const a = wire.points[index - 1], b = wire.points[index], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1))), q = { x: a.x + t * dx, y: a.y + t * dy };
    const parts = action === 'split' ? [wire.points.slice(0, index).concat(q), [q, ...wire.points.slice(index)]] : [wire.points.slice(0, index), wire.points.slice(index)];
    return normalizeSheet({ ...sheet, wires: [...sheet.wires.filter(w => w.id !== id), ...parts.filter(pts => normalizePoints(pts).length > 1).map((points, i) => ({ ...wire, id: i ? uid('wire') : wire.id, points }))] });
}
