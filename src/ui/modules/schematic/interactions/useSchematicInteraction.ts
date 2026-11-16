import { useCallback, useEffect, useRef, useState } from 'react';
import { ComponentDef, Point2D, SchematicProject, SchematicSheet, SchNetPort, PlacedComponent } from '../../../../core/types';
import { dist, pointToSegmentDist, uid, transformPoint } from '../../../../core/geometry';
import { snapPoint } from '../../../../core/units';
import { getComponentWorldPins } from '../../../../engines/erc';
import { SHEET_FORMATS } from '../../../../gost/gostTitleBlock';
import { allIds, commitWire, entityBounds, findEntity, labelId, mergeFragment, normalizeSheet, onWire, selectionBounds, transformEntities } from '../../../../core/schematic/editing';
import { allocateNextRefDes,computeSymbolLocalBounds } from '../services/schematicActionsService';
import { SchContextMenu, SchMarqueeBox, SchToolId, SchViewport } from '../types';
const cameras = new Map<string, SchViewport>();
interface Drag {
    mode: 'pan' | 'move' | 'marquee' | 'zoom' | 'vertex' | 'segment';
    point: Point2D;
    screen: Point2D;
    viewport: SchViewport;
    project: SchematicProject;
    ids: string[];
    wireId?: string;
    index?: number;
    detach?: boolean;
}
export interface UseSchematicInteractionParams {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    canvasWrapRef: React.RefObject<HTMLDivElement | null>;
    project: SchematicProject;
    activeSheet: SchematicSheet;
    customCompMap: Record<string, ComponentDef>;
    tool: SchToolId;
    setTool: React.Dispatch<React.SetStateAction<SchToolId>>;
    previewComponentDef: ComponentDef | null;
    selectedPartIndex: number;
    placeAngle: 0 | 90 | 180 | 270;
    placeFlipX: boolean;
    placeFlipY: boolean;
    autoPowerCheck: boolean;
    netPortStyle: SchNetPort['style'];
    netPortLabel: string;
    elbowFlip: boolean;
    wireDraftPts: Point2D[];
    setWireDraftPts: React.Dispatch<React.SetStateAction<Point2D[]>>;
    shapeStartPt: Point2D | null;
    setShapeStartPt: React.Dispatch<React.SetStateAction<Point2D | null>>;
    marqueeBox: SchMarqueeBox | null;
    setMarqueeBox: React.Dispatch<React.SetStateAction<SchMarqueeBox | null>>;
    selectedIds: string[];
    setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
    setContextMenu: React.Dispatch<React.SetStateAction<SchContextMenu | null>>;
    setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
    commitProject: (updater: (prev: SchematicProject) => SchematicProject, undo?: boolean) => void;
    pushUndoSnapshot: (snapshot: SchematicProject) => void;
    updateActiveSheet: (updater: (s: SchematicSheet) => SchematicSheet, undo?: boolean) => void;
    openProperties: (ids: string[]) => void;
    pasteDefinitions: {
        components: SchematicProject['customComponentDefs'];
        patterns: SchematicProject['customPatternDefs'];
    };
    pasteDraft: SchematicSheet | null;
    setPasteDraft: React.Dispatch<React.SetStateAction<SchematicSheet | null>>;
}
export function useSchematicInteraction(p: UseSchematicInteractionParams) {
    const cameraKey = `${p.project.projectName}:${p.activeSheet.id}`;
    const [viewport, setViewport] = useState<SchViewport>(cameras.get(cameraKey) ?? { ox: 45, oy: 25, pxPerMm: 3.1 });
    const [cursorMm, setCursorMm] = useState<Point2D>({ x: 0, y: 0 });
    const [hoverTarget, setHoverTarget] = useState<{
        point: Point2D;
        label: string;
    } | null>(null);
    const [dragPreview, setDragPreview] = useState<SchematicSheet | null>(null);
    const previewRef = useRef<SchematicSheet | null>(null);
    const preview = (sheet: SchematicSheet) => { previewRef.current = sheet; setDragPreview(sheet); };
    const drag = useRef<Drag | null>(null), suppressContext = useRef(false), latest = useRef(p);
    latest.current = p;
    const rawCursor = useRef<Point2D>({ x: 0, y: 0 });
    const initialFitPending = useRef(false);
    const zoomToFit = useCallback(() => {
        const wrap = p.canvasWrapRef.current, dim = SHEET_FORMATS[p.activeSheet.format];
        if (!wrap || wrap.clientWidth < 300 || wrap.clientHeight < 200)
            return;
        initialFitPending.current = false;
        const scale = Math.max(.4, Math.min((wrap.clientWidth - 36) / dim.widthMm, (wrap.clientHeight - 28) / dim.heightMm));
        setViewport({ ox: (wrap.clientWidth - dim.widthMm * scale) / 2, oy: (wrap.clientHeight - dim.heightMm * scale) / 2, pxPerMm: scale });
    }, [p.activeSheet.format, p.canvasWrapRef]);
    useEffect(() => {
        const existing = cameras.get(cameraKey);
        if (existing)
            setViewport(existing);
        else {
            initialFitPending.current = true;
            zoomToFit();
        }
        if (!existing)
            p.setSelectedIds([]);
        p.setWireDraftPts([]);
        p.setShapeStartPt(null);
        p.setPasteDraft(null);
        p.setTool('select');
        p.setContextMenu(null);
        // Tauri expands the launcher window asynchronously after mounting the editor.
        // Fit once when the actual canvas becomes usable; later resizes retain the camera.
        const observer = new ResizeObserver(() => {
            if (initialFitPending.current) zoomToFit();
        });
        if (p.canvasWrapRef.current) observer.observe(p.canvasWrapRef.current);
        return () => observer.disconnect();
    }, [cameraKey]);
    useEffect(() => { const timer = setTimeout(() => { if (!initialFitPending.current) cameras.set(cameraKey, viewport); }, 0); return () => clearTimeout(timer); }, [cameraKey, viewport]);
    const zoomPercent = Math.round(viewport.pxPerMm / 3.1 * 165);
    const setZoomByPercent = (pct: number) => {
        const w = p.canvasWrapRef.current;
        if (!w)
            return;
        setViewport(v => { const scale = Math.max(.4, Math.min(25, pct / 165 * 3.1)); return { pxPerMm: scale, ox: w.clientWidth / 2 - (w.clientWidth / 2 - v.ox) / v.pxPerMm * scale, oy: w.clientHeight / 2 - (w.clientHeight / 2 - v.oy) / v.pxPerMm * scale }; });
    };
    const centerOnWorldPt = useCallback((x: number, y: number) => { const w = p.canvasWrapRef.current; if (w)
        setViewport(v => ({ ...v, ox: w.clientWidth / 2 - x * v.pxPerMm, oy: w.clientHeight / 2 - y * v.pxPerMm })); }, [p.canvasWrapRef]);
    useEffect(()=>{const center=(e:Event)=>{const p=(e as CustomEvent<Point2D>).detail;centerOnWorldPt(p.x,p.y);};window.addEventListener('siptrace:crossprobe',center);return()=>window.removeEventListener('siptrace:crossprobe',center);},[centerOnWorldPt]);
    const world = (x: number, y: number): Point2D => { const r = p.canvasRef.current!.getBoundingClientRect(); return { x: (x - r.left - viewport.ox) / viewport.pxPerMm, y: (y - r.top - viewport.oy) / viewport.pxPerMm }; };
    const targetAt = (pt: Point2D) => {
        const targets: {
            point: Point2D;
            label: string;
            kind?: string;
        }[] = [];
        for (const c of p.activeSheet.components)
            for (const pin of getComponentWorldPins(c, p.customCompMap))
                targets.push({ point: pin, kind: 'pin', label: `${c.refDes}.${pin.pinNumber} ${pin.pinName}` });
        for (const block of p.activeSheet.hierarchyBlocks)
            for (const pin of block.pins)
                targets.push({ point: transformPoint(pin.side === 'right' ? block.w : 0, pin.offset, block.x, block.y, block.angle ?? 0, block.flipX, block.flipY), label: `${block.name}.${pin.name}`, kind: 'pin' });
        for (const port of p.activeSheet.netPorts)
            targets.push({ point: port, kind: 'port', label: port.netName });
        for (const j of p.activeSheet.junctions)
            targets.push({ point: j, label: 'Узел соединения' });
        for (const wire of p.activeSheet.wires)
            for (let i = 0; i < wire.points.length; i++) {
                targets.push({ point: wire.points[i], label: wire.netName || 'Контакт проводника' });
                if (i) {
                    const a = wire.points[i - 1], b = wire.points[i], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
                    targets.push({ point: { x: a.x + t * dx, y: a.y + t * dy }, label: wire.netName || 'Проводник' });
                }
            }
        return targets.filter(t => dist(t.point, pt) * viewport.pxPerMm <= 8).sort((a, b) => dist(a.point, pt) - dist(b.point, pt))[0] ?? null;
    };
    const snapWorldSmart = (pt: Point2D): Point2D => targetAt(pt)?.point ?? snapPoint(pt, p.project.gridSize);
    const cancelOperation = useCallback(() => {
        const cur = latest.current;
        if (drag.current) {
            drag.current = null;
        }
        previewRef.current = null;
        setDragPreview(null);
        cur.setWireDraftPts([]);
        cur.setShapeStartPt(null);
        cur.setMarqueeBox(null);
        cur.setPasteDraft(null);
        cur.setContextMenu(null);
        cur.setTool('select');
    }, []);
    useEffect(() => {
        const onCancel = () => cancelOperation();
        window.addEventListener('siptrace:cancel', onCancel);
        window.addEventListener('blur', onCancel);
        const finish = () => { const d = drag.current; if (d) {
            if (previewRef.current) {
                const result = previewRef.current;
                latest.current.updateActiveSheet(() => result);
                previewRef.current = null;
                setDragPreview(null);
            }
            drag.current = null;
            latest.current.setMarqueeBox(null);
        } };
        window.addEventListener('pointerup', finish);
        return () => { window.removeEventListener('siptrace:cancel', onCancel); window.removeEventListener('blur', onCancel); window.removeEventListener('pointerup', finish); };
    }, [cancelOperation]);
    useEffect(() => { if (!['wire', 'bus'].includes(p.tool))
        p.setWireDraftPts([]); if (!['shapeLine', 'shapeRect', 'shapeCircle'].includes(p.tool))
        p.setShapeStartPt(null); if (p.tool !== 'paste')
        p.setPasteDraft(null); }, [p.tool]);
    const hitAt = (pt: Point2D): string | null => {
        const r = 6 / viewport.pxPerMm;
        for (const c of [...p.activeSheet.components].reverse())
            for (const field of ['refDes', 'value'] as const) {
                if (!(field === 'refDes' ? c.showRefDes : c.showValue))
                    continue;
                const id = labelId(c.id, field), b = entityBounds(p.activeSheet, id, p.customCompMap);
                if (pt.x >= b.minX && pt.x <= b.maxX && pt.y >= b.minY && pt.y <= b.maxY)
                    return id;
            }
        const ordered = [...p.activeSheet.netPorts.map(o => o.id), ...p.activeSheet.junctions.map(o => o.id), ...allIds(p.activeSheet).reverse().filter(id => !p.activeSheet.netPorts.some(o => o.id === id) && !p.activeSheet.junctions.some(o => o.id === id))];
        for (const id of ordered) {
            const item = findEntity(p.activeSheet, id)!;
            if (item.object.points) {
                if (item.object.points.some((q: Point2D, i: number) => i && pointToSegmentDist(pt, item.object.points[i - 1], q) <= r))
                    return id;
            }
            else {
                const b = entityBounds(p.activeSheet, id, p.customCompMap);
                if (pt.x >= b.minX - r && pt.x <= b.maxX + r && pt.y >= b.minY - r && pt.y <= b.maxY + r)
                    return id;
            }
        }
        return null;
    };
    const handleCanvasMouseDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const pt = world(e.clientX, e.clientY);
        rawCursor.current = pt;
        p.setContextMenu(null);
        if (e.button === 2) {
            e.preventDefault();
            if (p.tool !== 'select' || drag.current) {
                suppressContext.current = true;
                cancelOperation();
            }
            return;
        }
        if (e.button !== 0 && e.button !== 1)
            return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const base: Drag = { mode: 'move', point: pt, screen: { x: e.clientX, y: e.clientY }, viewport, project: p.project, ids: p.selectedIds, detach: e.altKey };
        if (e.button === 1) {
            e.preventDefault();
            drag.current = { ...base, mode: 'pan' };
            return;
        }
        if (p.tool === 'paste' && p.pasteDraft) {
            const ids = allIds(p.pasteDraft), fragment = p.pasteDraft;
            p.commitProject(prev => ({ ...prev, customComponentDefs: { ...prev.customComponentDefs, ...p.pasteDefinitions.components }, customPatternDefs: { ...prev.customPatternDefs, ...p.pasteDefinitions.patterns }, sheets: prev.sheets.map(s => s.id === prev.activeSheetId ? mergeFragment(s, fragment) : s) }));
            p.setSelectedIds(ids);
            p.setPasteDraft(null);
            p.setTool('select');
            return;
        }
        if (p.tool === 'placeComp' && p.previewComponentDef) {
            const def = p.previewComponentDef, pos = snapPoint(pt, p.project.gridSize);
            const availablePackage = p.project.sheets.flatMap(s => s.components).find(c => c.componentDefId === def.id && !p.project.sheets.some(s => s.components.some(q => q.refDes === c.refDes && q.partIndex === p.selectedPartIndex)));
            const shared = def.parts.length > 1 ? availablePackage : undefined;
            const refDes = shared?.refDes ?? allocateNextRefDes(p.project, def.refDesPrefix);
            const symbolBounds=computeSymbolLocalBounds(def,p.selectedPartIndex);
            const c: PlacedComponent = { id: uid('comp'), componentDefId: def.id, libraryId: def.library, refDes, instanceId: shared?.instanceId ?? shared?.id ?? uid('package'), value: def.defaultValue, typeName: def.name, partIndex: p.selectedPartIndex, ...pos, angle: p.placeAngle, flipX: p.placeFlipX, flipY: p.placeFlipY, patternId: def.patternId, refDesOffset: transformPoint(0,symbolBounds.minY-3,0,0,p.placeAngle,p.placeFlipX,p.placeFlipY), valueOffset: transformPoint(0,symbolBounds.maxY+3,0,0,p.placeAngle,p.placeFlipX,p.placeFlipY),labelAngle:p.placeAngle, showRefDes: !def.isNetPort, showValue: !def.isNetPort, autoPower: p.autoPowerCheck, gostStandard: def.gostStandard };
            p.commitProject(prev => ({ ...prev, customComponentDefs: { ...prev.customComponentDefs, [def.id]: def }, sheets: prev.sheets.map(s => s.id === prev.activeSheetId ? { ...s, components: [...s.components.map(old => shared && old.componentDefId === shared.componentDefId && old.refDes === shared.refDes ? { ...old, instanceId: c.instanceId } : old), c] } : s) }));
            p.setSelectedIds([]);
            p.setStatusMessage(`Размещён ${refDes}. R/X/Y — преобразование превью; ПКМ/Esc — выбор.`);
            return;
        }
        const target = targetAt(pt), snapped = target?.point ?? snapPoint(pt, p.project.gridSize);
        if (p.tool === 'wire' || p.tool === 'bus' || (p.tool === 'select' && target && ['pin', 'port'].includes(target.kind ?? '') && !e.shiftKey && !e.altKey && !p.selectedIds.length)) {
            if (p.tool === 'select') {
                p.setTool('wire');
                p.setWireDraftPts([snapped]);
                return;
            }
            if (!p.wireDraftPts.length)
                p.setWireDraftPts([snapped]);
            else {
                const last = p.wireDraftPts.at(-1)!;
                if (dist(last, snapped) < .001)
                    return;
                const mid = p.elbowFlip ? { x: last.x, y: snapped.y } : { x: snapped.x, y: last.y };
                const pts = [...p.wireDraftPts, mid, snapped];
                if (target && p.tool === 'wire') {
                    p.updateActiveSheet(s => commitWire(s, pts));
                    p.setWireDraftPts([]);
                    p.setTool('select');
                }
                else
                    p.setWireDraftPts(pts);
            }
            return;
        }
        if (p.tool === 'netPort' || p.tool === 'pinLabel') {
            const port: SchNetPort = { id: uid('port'), ...snapped, angle: p.placeAngle, netName: p.netPortLabel || 'SIG', style: p.tool === 'pinLabel' ? 'PortLeft' : p.netPortStyle };
            p.updateActiveSheet(s => ({ ...s, netPorts: [...s.netPorts, port] }));
            return;
        }
        if (p.tool === 'junction') {
            p.updateActiveSheet(s => normalizeSheet({ ...s, junctions: [...s.junctions, { id: uid('junc'), ...snapped, netName: '' }] }));
            return;
        }
        if (p.tool === 'noConnect') {
            p.updateActiveSheet(s => ({ ...s, shapes: [...s.shapes, { id: uid('nc'), type: 'text', ...snapped, text: '× NC', size: 2.5 }] }));
            return;
        }
        if (p.tool === 'busTap') {
            const bus = p.activeSheet.buses.find(b => b.points.some((q, i) => i && pointToSegmentDist(pt, b.points[i - 1], q) <= 10 / viewport.pxPerMm));
            const wire = p.activeSheet.wires.map(w => ({ w, d: Math.min(...w.points.map(q => dist(q, pt))) })).sort((a, b) => a.d - b.d)[0]?.w;
            if (!bus || !wire) {
                p.setStatusMessage('Выберите точку шины рядом с концом сигнального провода.');
                return;
            }
            const name = window.prompt('Имя сигнала шины:', wire.netName || 'D0');
            if (name)
                p.updateActiveSheet(s => ({ ...s, busTaps: [...s.busTaps, { id: uid('tap'), ...snapped, busId: bus.id, wireId: wire.id, signalName: name }] }));
            return;
        }
        if (p.tool === 'origin') {
            p.commitProject(s => ({ ...s, origin: snapped }));
            p.setTool('select');
            return;
        }
        if (p.tool === 'shapeText' || p.tool === 'table' || p.tool === 'diffPair') {
            const id = uid('object');
            if (p.tool === 'shapeText')
                p.updateActiveSheet(s => ({ ...s, shapes: [...s.shapes, { id, type: 'text', ...snapped, text: 'Текст', size: 3.5 }] }));
            if (p.tool === 'table')
                p.updateActiveSheet(s => ({ ...s, shapes: [...s.shapes, { id, type: 'table', ...snapped, colWidths: [20, 70, 15], rowHeight: 6, rows: [['Поз.', 'Наименование', 'Кол.'], ['', '', '']] }] }));
            if (p.tool === 'diffPair')
                p.updateActiveSheet(s => ({ ...s, diffPairs: [...s.diffPairs, { id, ...snapped, pairName: 'PAIR', posNet: '', negNet: '' }] }));
            p.setSelectedIds([id]);
            p.setTool('select');
            p.openProperties([id]);
            return;
        }
        if (p.tool === 'hierarchy') {
            const id = uid('hierarchy'), childId = uid('sheet');
            const child: SchematicSheet = { ...structuredClone(p.activeSheet), id: childId, name: `Блок ${p.project.sheets.length}`, components: [], wires: [], buses: [], busTaps: [], junctions: [], netPorts: [], diffPairs: [], hierarchyBlocks: [], shapes: [], isHierarchicalSheet: true };
            p.commitProject(prev => ({ ...prev, sheets: [...prev.sheets.map(s => s.id === prev.activeSheetId ? { ...s, hierarchyBlocks: [...s.hierarchyBlocks, { id, ...snapped, w: 35, h: 20, name: child.name, targetSheetId: childId, pins: [] }] } : s), child].map((s, i, arr) => ({ ...s, titleBlock: { ...s.titleBlock, sheetNumber: i + 1, totalSheets: arr.length } })) }));
            p.setSelectedIds([id]);
            p.setTool('select');
            p.openProperties([id]);
            return;
        }
        if (['shapeLine', 'shapeRect', 'shapeCircle'].includes(p.tool)) {
            if (!p.shapeStartPt)
                p.setShapeStartPt(snapped);
            else {
                const a = p.shapeStartPt, id = uid('shape');
                const shape = p.tool === 'shapeLine' ? { id, type: 'line' as const, x1: a.x, y1: a.y, x2: snapped.x, y2: snapped.y, width: .35 } : p.tool === 'shapeCircle' ? { id, type: 'circle' as const, cx: a.x, cy: a.y, r: dist(a, snapped), width: .35 } : { id, type: 'rect' as const, x: Math.min(a.x, snapped.x), y: Math.min(a.y, snapped.y), w: Math.abs(a.x - snapped.x), h: Math.abs(a.y - snapped.y), width: .35 };
                p.updateActiveSheet(s => ({ ...s, shapes: [...s.shapes, shape] }));
                p.setShapeStartPt(null);
            }
            return;
        }
        if (p.tool === 'zoomBox') {
            drag.current = { ...base, mode: 'zoom' };
            p.setMarqueeBox({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
            return;
        }
        const hit = hitAt(pt);
        if (!hit) {
            if (!e.shiftKey)
                p.setSelectedIds([]);
            drag.current = { ...base, mode: 'marquee', ids: e.shiftKey ? p.selectedIds : [] };
            return;
        }
        const ids = e.shiftKey ? p.selectedIds.includes(hit) ? p.selectedIds.filter(id => id !== hit) : [...p.selectedIds, hit] : p.selectedIds.includes(hit) ? p.selectedIds : [hit];
        p.setSelectedIds(ids);
        if (!ids.includes(hit))
            return;
        const entity = findEntity(p.activeSheet, hit);
        if (entity?.kind === 'wires' && ids.length === 1) {
            const w = entity.object as SchematicSheet['wires'][number];
            const vertex = w.points.findIndex(q => dist(q, pt) * viewport.pxPerMm < 6);
            if (vertex >= 0) {
                drag.current = { ...base, mode: 'vertex', ids, wireId: hit, index: vertex };
                return;
            }
            const seg = w.points.findIndex((q, i) => i > 0 && pointToSegmentDist(pt, w.points[i - 1], q) * viewport.pxPerMm < 6);
            if (seg > 0) {
                drag.current = { ...base, mode: 'segment', ids, wireId: hit, index: seg };
                return;
            }
        }
        drag.current = { ...base, ids };
    };
    const handleCanvasMouseMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const pt = world(e.clientX, e.clientY);
        rawCursor.current = pt;
        const target = targetAt(pt);
        setHoverTarget(target);
        setCursorMm(target?.point ?? snapPoint(pt, p.project.gridSize));
        if (p.tool === 'paste' && p.pasteDraft) {
            const b = selectionBounds(p.pasteDraft, allIds(p.pasteDraft), p.customCompMap), q = snapPoint(pt, p.project.gridSize);
            p.setPasteDraft(s => s ? transformEntities(s, allIds(s), { dx: q.x - b.minX, dy: q.y - b.minY, preserveConnections: false }, p.customCompMap) : s);
        }
        const d = drag.current;
        if (!d)
            return;
        if (!e.buttons) {
            handleCanvasMouseUp(e);
            return;
        }
        if (d.mode === 'pan') {
            setViewport({ ...d.viewport, ox: d.viewport.ox + e.clientX - d.screen.x, oy: d.viewport.oy + e.clientY - d.screen.y });
            return;
        }
        if (d.mode === 'marquee' || d.mode === 'zoom') {
            p.setMarqueeBox({ x1: d.point.x, y1: d.point.y, x2: pt.x, y2: pt.y });
            return;
        }
        if (Math.hypot(e.clientX - d.screen.x, e.clientY - d.screen.y) < 3)
            return;
        const delta = snapPoint({ x: pt.x - d.point.x, y: pt.y - d.point.y }, p.project.gridSize), base = d.project.sheets.find(s => s.id === p.activeSheet.id)!;
        if (d.mode === 'move')
            preview(transformEntities(base, d.ids, { dx: delta.x, dy: delta.y, preserveConnections: !d.detach }, p.customCompMap));
        else {
            preview(normalizeSheet({ ...base, wires: base.wires.map(w => {
                    if (w.id !== d.wireId)
                        return w;
                    const points = w.points.map(q => ({ ...q })), i = d.index!;
                    if (d.mode === 'vertex') {
                        const old = points[i], next = snapWorldSmart(pt);
                        points[i] = next;
                        if (i > 0) {
                            if (Math.abs(points[i - 1].x - old.x) < .01)
                                points[i - 1].x = next.x;
                            else
                                points[i - 1].y = next.y;
                        }
                        if (i < points.length - 1) {
                            if (Math.abs(points[i + 1].x - old.x) < .01)
                                points[i + 1].x = next.x;
                            else
                                points[i + 1].y = next.y;
                        }
                    }
                    else {
                        const horizontal = Math.abs(points[i].y - points[i - 1].y) < .01;
                        if (horizontal) {
                            points[i].y += delta.y;
                            points[i - 1].y += delta.y;
                        }
                        else {
                            points[i].x += delta.x;
                            points[i - 1].x += delta.x;
                        }
                    }
                    return { ...w, points };
                }) }));
        }
    };
    const handleCanvasMouseUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const d = drag.current;
        if (!d)
            return;
        if (d.mode === 'marquee' || d.mode === 'zoom') {
            const pt = world(e.clientX, e.clientY), minX = Math.min(pt.x, d.point.x), maxX = Math.max(pt.x, d.point.x), minY = Math.min(pt.y, d.point.y), maxY = Math.max(pt.y, d.point.y);
            if (d.mode === 'marquee' && maxX - minX > .5 && maxY - minY > .5) {
                const crossing = pt.x < d.point.x;
                const ids = allIds(p.activeSheet).filter(id => { const b = entityBounds(p.activeSheet, id, p.customCompMap); return crossing ? b.maxX >= minX && b.minX <= maxX && b.maxY >= minY && b.minY <= maxY : b.minX >= minX && b.maxX <= maxX && b.minY >= minY && b.maxY <= maxY; });
                p.setSelectedIds([...new Set([...d.ids, ...ids])]);
            }
            else if (d.mode === 'zoom' && maxX - minX > .5 && maxY - minY > .5) {
                const wrap = p.canvasWrapRef.current!, z = Math.max(.4, Math.min(25, Math.min((wrap.clientWidth - 20) / (maxX - minX), (wrap.clientHeight - 20) / (maxY - minY))));
                setViewport({ pxPerMm: z, ox: wrap.clientWidth / 2 - (minX + maxX) / 2 * z, oy: wrap.clientHeight / 2 - (minY + maxY) / 2 * z });
                p.setTool('select');
            }
        }
        else if (d.mode !== 'pan' && previewRef.current) {
            const result = previewRef.current;
            p.updateActiveSheet(() => result);
        }
        drag.current = null;
        previewRef.current = null;
        setDragPreview(null);
        p.setMarqueeBox(null);
        if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
    };
    const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if ((p.tool === 'wire' || p.tool === 'bus') && p.wireDraftPts.length > 1) {
            p.updateActiveSheet(s => commitWire(s, p.wireDraftPts, p.tool === 'bus'));
            p.setWireDraftPts([]);
            p.setTool('select');
            return;
        }
        const id = hitAt(world(e.clientX, e.clientY));
        if (id) {
            const entity = findEntity(p.activeSheet, id);
            if (entity?.kind === 'hierarchyBlocks') {
                p.commitProject(s => ({ ...s, activeSheetId: entity.object.targetSheetId }), false);
                return;
            }
            p.setSelectedIds([id]);
            p.openProperties([id]);
        }
    };
    const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        const r = p.canvasRef.current!.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        setViewport(v => { const z = Math.max(.4, Math.min(25, v.pxPerMm * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); return { pxPerMm: z, ox: x - (x - v.ox) / v.pxPerMm * z, oy: y - (y - v.oy) / v.pxPerMm * z }; });
    };
    const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        if (suppressContext.current) {
            suppressContext.current = false;
            return;
        }
        const id = hitAt(world(e.clientX, e.clientY));
        if (id && !p.selectedIds.includes(id))
            p.setSelectedIds([id]);
        const hit = id ? findEntity(p.activeSheet, id) : null;
        p.setContextMenu({ x: e.clientX, y: e.clientY, ids: id ? (p.selectedIds.includes(id) ? p.selectedIds : [id]) : [], compId: hit?.kind === 'components' ? id! : undefined, wireId: hit?.kind === 'wires' ? id! : undefined });
    };
    return { displaySheet: dragPreview ?? p.activeSheet, viewport, cursorMm, zoomPercent, setZoomByPercent, zoomToFit, centerOnWorldPt, snapWorldSmart, hoverTarget, cancelOperation, handleCanvasMouseDown, handleCanvasMouseMove, handleCanvasMouseUp, handleCanvasDoubleClick, handleCanvasWheel, handleContextMenu };
}
