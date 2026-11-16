import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ComponentDef,
  PlacedComponent,
  Point2D,
  SchBus,
  SchDiffPairTag,
  SchHierarchyBlock,
  SchJunction,
  SchNetPort,
  SchShape,
  SchWire,
  SchematicProject,
  SchematicSheet
} from '../../../../core/types';
import { dist, pointToSegmentDist, transformPoint, uid } from '../../../../core/geometry';
import { snapPoint, snapToGrid } from '../../../../core/units';
import { getComponentWorldPins } from '../../../../engines/erc';
import { findComponentById } from '../../../../gost/libraries/gostComponents';
import { SHEET_FORMATS } from '../../../../gost/gostTitleBlock';
import { INITIAL_SCH_DRAG_STATE } from '../constants';
import { allocateNextRefDes, computeSymbolLocalBounds } from '../services/schematicActionsService';
import { SchContextMenu, SchDragState, SchMarqueeBox, SchToolId, SchViewport } from '../types';

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
  selectedCompIds: string[];
  setSelectedCompIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedWireId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedPortId: React.Dispatch<React.SetStateAction<string | null>>;
  setContextMenu: React.Dispatch<React.SetStateAction<SchContextMenu | null>>;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  commitProject: (updater: (prev: SchematicProject) => SchematicProject, pushUndo?: boolean) => void;
  pushUndoSnapshot: (snapshot: SchematicProject) => void;
  updateActiveSheet: (sheetUpdater: (s: SchematicSheet) => SchematicSheet, pushUndo?: boolean) => void;
}

/** Handles schematic viewport pan/zoom, hit testing, smart pin snapping, and tool pointer gestures. */
export function useSchematicInteraction(p: UseSchematicInteractionParams) {
  const [viewport, setViewport] = useState<SchViewport>({ ox: 45, oy: 25, pxPerMm: 3.1 });
  const [cursorMm, setCursorMm] = useState<Point2D>({ x: 0, y: 0 });
  const dragRef = useRef<SchDragState>({ ...INITIAL_SCH_DRAG_STATE });

  const zoomToFit = useCallback(() => {
    const wrap = p.canvasWrapRef.current;
    const dim = SHEET_FORMATS[p.activeSheet.format];
    if (!wrap) return;
    const w = wrap.clientWidth || 800;
    const h = wrap.clientHeight || 520;
    const scaleX = (w - 36) / dim.widthMm;
    const scaleY = (h - 28) / dim.heightMm;
    const pxPerMm = Math.max(0.5, Math.min(scaleX, scaleY));
    const ox = (w - dim.widthMm * pxPerMm) / 2;
    const oy = (h - dim.heightMm * pxPerMm) / 2;
    setViewport({ ox, oy, pxPerMm });
  }, [p.canvasWrapRef, p.activeSheet.format]);

  useEffect(() => {
    const timer = setTimeout(zoomToFit, 50);
    window.addEventListener('resize', zoomToFit);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', zoomToFit);
    };
  }, [zoomToFit]);

  const zoomPercent = Math.round((viewport.pxPerMm / 3.1) * 165);

  const setZoomByPercent = (pct: number) => {
    const wrap = p.canvasWrapRef.current;
    const cx = (wrap?.clientWidth ?? 800) / 2;
    const cy = (wrap?.clientHeight ?? 500) / 2;
    const newPxPerMm = Math.max(0.4, Math.min(25, (pct / 165) * 3.1));
    setViewport((v) => {
      const worldX = (cx - v.ox) / v.pxPerMm;
      const worldY = (cy - v.oy) / v.pxPerMm;
      return {
        pxPerMm: newPxPerMm,
        ox: cx - worldX * newPxPerMm,
        oy: cy - worldY * newPxPerMm
      };
    });
  };

  const screenToWorld = useCallback(
    (clientX: number, clientY: number): Point2D => {
      const rect = p.canvasRef.current?.getBoundingClientRect();
      const sx = clientX - (rect?.left ?? 0);
      const sy = clientY - (rect?.top ?? 0);
      return {
        x: (sx - viewport.ox) / viewport.pxPerMm,
        y: (sy - viewport.oy) / viewport.pxPerMm
      };
    },
    [p.canvasRef, viewport]
  );

  const snapWorldSmart = useCallback(
    (pt: Point2D): Point2D => {
      const snapR = Math.min(2.2, p.project.gridSize * 0.9);
      for (const comp of p.activeSheet.components) {
        const pins = getComponentWorldPins(comp, p.customCompMap);
        for (const pin of pins) {
          if (dist(pt, pin) <= snapR) return { x: pin.x, y: pin.y };
        }
      }
      return snapPoint(pt, p.project.gridSize);
    },
    [p.activeSheet.components, p.customCompMap, p.project.gridSize]
  );

  const getCompWorldBounds = (c: PlacedComponent) => {
    const def = findComponentById(c.componentDefId, p.customCompMap);
    if (!def) {
      return { minX: c.x - 7.5, minY: c.y - 7.5, maxX: c.x + 7.5, maxY: c.y + 7.5 };
    }
    const lb = computeSymbolLocalBounds(def, c.partIndex);
    const corners = [
      transformPoint(lb.minX, lb.minY, c.x, c.y, c.angle, c.flipX, c.flipY),
      transformPoint(lb.maxX, lb.minY, c.x, c.y, c.angle, c.flipX, c.flipY),
      transformPoint(lb.minX, lb.maxY, c.x, c.y, c.angle, c.flipX, c.flipY),
      transformPoint(lb.maxX, lb.maxY, c.x, c.y, c.angle, c.flipX, c.flipY)
    ];
    return {
      minX: Math.min(...corners.map((q) => q.x)),
      minY: Math.min(...corners.map((q) => q.y)),
      maxX: Math.max(...corners.map((q) => q.x)),
      maxY: Math.max(...corners.map((q) => q.y))
    };
  };

  const centerOnWorldPt = useCallback(
    (wx: number, wy: number) => {
      const wrap = p.canvasWrapRef.current;
      if (!wrap) return;
      const w = wrap.clientWidth || 800;
      const h = wrap.clientHeight || 520;
      setViewport((v) => ({
        ...v,
        ox: w / 2 - wx * v.pxPerMm,
        oy: h / 2 - wy * v.pxPerMm
      }));
    },
    [p.canvasWrapRef]
  );

  const findComponentAt = (pt: Point2D): PlacedComponent | null => {
    for (let i = p.activeSheet.components.length - 1; i >= 0; i--) {
      const c = p.activeSheet.components[i];
      const b = getCompWorldBounds(c);
      const pad = 2.2;
      if (pt.x >= b.minX - pad && pt.x <= b.maxX + pad && pt.y >= b.minY - pad && pt.y <= b.maxY + pad) {
        return c;
      }
    }
    return null;
  };

  const findWireAt = (pt: Point2D): SchWire | null => {
    for (const w of p.activeSheet.wires) {
      for (let i = 1; i < w.points.length; i++) {
        if (pointToSegmentDist(pt, w.points[i - 1], w.points[i]) <= 2.2) return w;
      }
    }
    return null;
  };

  // Electrical contact uses the same tolerance as net extraction, not the
  // much wider selection hit target used for the mouse.
  const findConnectableWireAt = (pt: Point2D): SchWire | null =>
    p.activeSheet.wires.find((w) => w.points.some((point, i) =>
      i > 0 && pointToSegmentDist(pt, w.points[i - 1], point) < 0.25
    )) ?? null;

  const findPortAt = (pt: Point2D): SchNetPort | null => {
    for (const np of p.activeSheet.netPorts) {
      if (dist(pt, np) <= 3.5) return np;
    }
    return null;
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    p.setContextMenu(null);
    const worldPt = screenToWorld(e.clientX, e.clientY);

    if (e.button === 1 || (e.button === 2 && p.wireDraftPts.length === 0)) {
      if (e.button === 1) e.preventDefault();
      dragRef.current = {
        mode: 'pan',
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        startWorldX: worldPt.x,
        startWorldY: worldPt.y,
        compStartPos: {},
        lastOx: viewport.ox,
        lastOy: viewport.oy,
        pannedDistance: 0
      };
      return;
    }

    if (e.button === 2 && p.wireDraftPts.length > 0) {
      if (p.wireDraftPts.length >= 2) {
        if (p.tool === 'wire') {
          const wNew: SchWire = { id: uid('wire'), points: p.wireDraftPts, netName: '' };
          p.updateActiveSheet((s) => ({ ...s, wires: [...s.wires, wNew] }));
        } else if (p.tool === 'bus') {
          const bNew: SchBus = { id: uid('bus'), points: p.wireDraftPts, busName: 'D[0..7]' };
          p.updateActiveSheet((s) => ({ ...s, buses: [...s.buses, bNew] }));
        }
      }
      p.setWireDraftPts([]);
      return;
    }

    if (e.button !== 0) return;

    if (p.tool === 'placeComp' && p.previewComponentDef) {
      const snapped = snapPoint(worldPt, p.project.gridSize);
      const refDes = allocateNextRefDes(p.project, p.previewComponentDef.refDesPrefix);
      const def = p.previewComponentDef;
      const lb = computeSymbolLocalBounds(def, p.selectedPartIndex);
      const rotCorners = [
        transformPoint(lb.minX, lb.minY, 0, 0, p.placeAngle, p.placeFlipX, p.placeFlipY),
        transformPoint(lb.maxX, lb.minY, 0, 0, p.placeAngle, p.placeFlipX, p.placeFlipY),
        transformPoint(lb.minX, lb.maxY, 0, 0, p.placeAngle, p.placeFlipX, p.placeFlipY),
        transformPoint(lb.maxX, lb.maxY, 0, 0, p.placeAngle, p.placeFlipX, p.placeFlipY)
      ];
      const relMinY = Math.min(...rotCorners.map((q) => q.y));
      const relMaxY = Math.max(...rotCorners.map((q) => q.y));
      const newComp: PlacedComponent = {
        id: uid('comp'),
        componentDefId: def.id,
        libraryId: def.library,
        refDes,
        value: def.defaultValue,
        typeName: def.name,
        partIndex: p.selectedPartIndex,
        x: snapped.x,
        y: snapped.y,
        angle: p.placeAngle,
        flipX: p.placeFlipX,
        flipY: p.placeFlipY,
        patternId: def.patternId,
        refDesOffset: { x: 0, y: Math.min(-5.5, relMinY - 2.2) },
        valueOffset: { x: 0, y: Math.max(5.5, relMaxY + 3.6) },
        showRefDes: !def.isNetPort,
        showValue: !def.isNetPort,
        autoPower: p.autoPowerCheck,
        gostStandard: def.gostStandard,
        manufacturer: def.manufacturer
      };
      const isBuiltin = Boolean(findComponentById(def.id));
      p.commitProject((prev) => ({
        ...prev,
        ...(isBuiltin ? {} : { customComponentDefs: { ...(prev.customComponentDefs ?? {}), [def.id]: def } }),
        sheets: prev.sheets.map((s) =>
          s.id === prev.activeSheetId ? { ...s, components: [...s.components, newComp] } : s
        )
      }));
      p.setSelectedCompIds([newComp.id]);
      p.setStatusMessage(`Размещён компонент ${refDes} (${def.name}).`);
      return;
    }

    if (p.tool === 'wire' || p.tool === 'bus') {
      const snapped = snapWorldSmart(worldPt);
      if (p.wireDraftPts.length === 0) {
        p.setWireDraftPts([snapped]);
      } else {
        const last = p.wireDraftPts[p.wireDraftPts.length - 1];
        const mid = p.elbowFlip ? { x: last.x, y: snapped.y } : { x: snapped.x, y: last.y };
        const appended = [
          ...p.wireDraftPts,
          ...(dist(mid, last) > 0.1 && dist(mid, snapped) > 0.1 ? [mid] : []),
          snapped
        ];

        const landedOnPin = p.activeSheet.components.some((c) =>
          getComponentWorldPins(c, p.customCompMap).some((pin) => dist(pin, snapped) <= 0.35)
        );
        const landedOnWire = findConnectableWireAt(snapped);

        if (landedOnPin || landedOnWire) {
          if (p.tool === 'wire') {
            const start = appended[0];
            const startedOnWire = findConnectableWireAt(start);
            const newWire: SchWire = { id: uid('wire'), points: appended, netName: landedOnWire?.netName || startedOnWire?.netName || '' };
            const newJuncs: SchJunction[] = [];
            for (const [point, wire] of [[start, startedOnWire], [snapped, landedOnWire]] as const) {
              if (wire && !p.activeSheet.junctions.some((j) => dist(j, point) < 0.25) && !newJuncs.some((j) => dist(j, point) < 0.25)) {
                newJuncs.push({ id: uid('junc'), x: point.x, y: point.y, netName: wire.netName });
              }
            }
            p.updateActiveSheet((s) => ({
              ...s,
              wires: [...s.wires, newWire],
              junctions: [...s.junctions, ...newJuncs]
            }));
          } else {
            const newBus: SchBus = { id: uid('bus'), points: appended, busName: 'D[0..7]' };
            p.updateActiveSheet((s) => ({ ...s, buses: [...s.buses, newBus] }));
          }
          p.setWireDraftPts([]);
        } else {
          p.setWireDraftPts(appended);
        }
      }
      return;
    }

    if (p.tool === 'netPort') {
      const snapped = snapPoint(worldPt, p.project.gridSize);
      const np: SchNetPort = {
        id: uid('port'),
        x: snapped.x,
        y: snapped.y,
        angle: 0,
        netName: p.netPortLabel || (p.netPortStyle === 'Ground' ? 'GND' : '+5V'),
        style: p.netPortStyle
      };
      p.updateActiveSheet((s) => ({ ...s, netPorts: [...s.netPorts, np] }));
      p.setSelectedPortId(np.id);
      return;
    }

    if (p.tool === 'origin') {
      const snapped = snapPoint(worldPt, p.project.gridSize);
      p.commitProject((prev) => ({ ...prev, origin: snapped }));
      p.setTool('select');
      p.setStatusMessage(`Начало координат установлено в (${snapped.x}, ${snapped.y}).`);
      return;
    }

    if (p.tool === 'shapeText') {
      const snapped = snapPoint(worldPt, p.project.gridSize);
      const txt: SchShape = { id: uid('txt'), type: 'text', x: snapped.x, y: snapped.y, text: 'Примечание ГОСТ', size: 3.5 };
      p.updateActiveSheet((s) => ({ ...s, shapes: [...s.shapes, txt] }));
      p.setTool('select');
      return;
    }

    if (p.tool === 'table') {
      const snapped = snapPoint(worldPt, p.project.gridSize);
      const tbl: SchShape = {
        id: uid('tbl'),
        type: 'table',
        x: snapped.x,
        y: snapped.y,
        colWidths: [14, 42, 12],
        rowHeight: 6,
        rows: [
          ['Поз.', 'Наименование', 'Кол.'],
          ['R1..R4', 'Р1-12-0,125', '4']
        ]
      };
      p.updateActiveSheet((s) => ({ ...s, shapes: [...s.shapes, tbl] }));
      p.setTool('select');
      return;
    }

    if (p.tool === 'hierarchy') {
      const snapped = snapPoint(worldPt, p.project.gridSize);
      const hb: SchHierarchyBlock = {
        id: uid('hb'),
        x: snapped.x,
        y: snapped.y,
        w: 35,
        h: 20,
        name: 'Блок питания',
        targetSheetId: p.activeSheet.id,
        pins: []
      };
      p.updateActiveSheet((s) => ({ ...s, hierarchyBlocks: [...s.hierarchyBlocks, hb] }));
      p.setTool('select');
      return;
    }

    if (p.tool === 'diffPair') {
      const snapped = snapPoint(worldPt, p.project.gridSize);
      const dp: SchDiffPairTag = { id: uid('dp'), x: snapped.x, y: snapped.y, pairName: 'RS485_AB', posNet: 'A', negNet: 'B' };
      p.updateActiveSheet((s) => ({ ...s, diffPairs: [...s.diffPairs, dp] }));
      p.setTool('select');
      return;
    }

    if (p.tool === 'zoomBox') {
      dragRef.current = {
        mode: 'zoomBox',
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        startWorldX: worldPt.x,
        startWorldY: worldPt.y,
        compStartPos: {},
        lastOx: viewport.ox,
        lastOy: viewport.oy
      };
      p.setMarqueeBox({ x1: worldPt.x, y1: worldPt.y, x2: worldPt.x, y2: worldPt.y });
      return;
    }

    if (p.tool === 'shapeLine' || p.tool === 'shapeRect') {
      const snapped = snapPoint(worldPt, p.project.gridSize);
      if (!p.shapeStartPt) {
        p.setShapeStartPt(snapped);
      } else {
        const startPt = p.shapeStartPt;
        if (p.tool === 'shapeLine') {
          p.updateActiveSheet((s) => ({
            ...s,
            shapes: [...s.shapes, { id: uid('ln'), type: 'line', x1: startPt.x, y1: startPt.y, x2: snapped.x, y2: snapped.y, width: 0.35 }]
          }));
        } else if (p.tool === 'shapeRect') {
          p.updateActiveSheet((s) => ({
            ...s,
            shapes: [
              ...s.shapes,
              {
                id: uid('rc'),
                type: 'rect',
                x: Math.min(startPt.x, snapped.x),
                y: Math.min(startPt.y, snapped.y),
                w: Math.abs(snapped.x - startPt.x),
                h: Math.abs(snapped.y - startPt.y),
                width: 0.35
              }
            ]
          }));
        }
        p.setShapeStartPt(null);
      }
      return;
    }

    // Select tool
    const hitComp = findComponentAt(worldPt);
    if (hitComp) {
      const nextSel = e.shiftKey
        ? p.selectedCompIds.includes(hitComp.id)
          ? p.selectedCompIds.filter((id) => id !== hitComp.id)
          : [...p.selectedCompIds, hitComp.id]
        : p.selectedCompIds.includes(hitComp.id)
          ? p.selectedCompIds
          : [hitComp.id];
      p.setSelectedCompIds(nextSel);
      p.setSelectedWireId(null);
      p.setSelectedPortId(null);

      const startPositions: Record<string, Point2D> = {};
      const movedPinStarts: Point2D[] = [];
      for (const c of p.activeSheet.components) {
        if (nextSel.includes(c.id)) {
          startPositions[c.id] = { x: c.x, y: c.y };
          for (const pin of getComponentWorldPins(c, p.customCompMap)) {
            movedPinStarts.push({ x: pin.x, y: pin.y });
          }
        }
      }
      dragRef.current = {
        mode: 'moveComp',
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        startWorldX: worldPt.x,
        startWorldY: worldPt.y,
        compStartPos: startPositions,
        preDragProject: p.project,
        preDragWires: p.activeSheet.wires.map((w) => ({ ...w, points: w.points.map((pt) => ({ ...pt })) })),
        movedPinStarts,
        lastOx: viewport.ox,
        lastOy: viewport.oy
      };
      return;
    }

    const hitPort = findPortAt(worldPt);
    if (hitPort) {
      p.setSelectedPortId(hitPort.id);
      p.setSelectedCompIds([]);
      p.setSelectedWireId(null);
      dragRef.current = {
        mode: 'movePort',
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        startWorldX: worldPt.x,
        startWorldY: worldPt.y,
        compStartPos: {},
        preDragProject: p.project,
        portStartPos: { x: hitPort.x, y: hitPort.y },
        movingPortId: hitPort.id,
        lastOx: viewport.ox,
        lastOy: viewport.oy
      };
      return;
    }

    const hitWire = findWireAt(worldPt);
    if (hitWire) {
      p.setSelectedWireId(hitWire.id);
      p.setSelectedCompIds([]);
      p.setSelectedPortId(null);
      return;
    }

    p.setSelectedCompIds([]);
    p.setSelectedWireId(null);
    p.setSelectedPortId(null);
    dragRef.current = {
      mode: 'marquee',
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      startWorldX: worldPt.x,
      startWorldY: worldPt.y,
      compStartPos: {},
      lastOx: viewport.ox,
      lastOy: viewport.oy
    };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const worldPt = screenToWorld(e.clientX, e.clientY);
    setCursorMm(snapPoint(worldPt, p.project.gridSize));

    const st = dragRef.current;
    if (st.mode === 'pan') {
      const dx = e.clientX - st.startScreenX;
      const dy = e.clientY - st.startScreenY;
      st.pannedDistance = Math.hypot(dx, dy);
      setViewport((v) => ({ ...v, ox: st.lastOx + dx, oy: st.lastOy + dy }));
    } else if (st.mode === 'moveComp') {
      const dx = snapToGrid(worldPt.x - st.startWorldX, p.project.gridSize);
      const dy = snapToGrid(worldPt.y - st.startWorldY, p.project.gridSize);
      const pinStarts = st.movedPinStarts ?? [];
      const isMovedPin = (pt: Point2D) => pinStarts.some((mp) => dist(mp, pt) <= 0.45);
      const baseWires = st.preDragWires ?? p.activeSheet.wires;
      const updatedWires = baseWires.map((w) => {
        if (w.points.length < 2) return w;
        const pts = w.points.map((pt) => ({ ...pt }));
        const startHit = isMovedPin(pts[0]);
        const endHit = isMovedPin(pts[pts.length - 1]);
        if (!startHit && !endHit) return w;
        if (startHit && endHit) {
          return { ...w, points: pts.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) };
        }
        if (startHit) {
          const orig0 = { ...pts[0] };
          const orig1 = { ...pts[1] };
          pts[0] = { x: orig0.x + dx, y: orig0.y + dy };
          if (pts.length === 2) {
            if (Math.abs(orig0.y - orig1.y) < 0.1 && Math.abs(dy) > 0.05) {
              pts.splice(1, 0, { x: orig1.x, y: pts[0].y });
            } else if (Math.abs(orig0.x - orig1.x) < 0.1 && Math.abs(dx) > 0.05) {
              pts.splice(1, 0, { x: pts[0].x, y: orig1.y });
            }
          } else {
            if (Math.abs(orig1.x - orig0.x) < 0.1) pts[1] = { x: pts[0].x, y: orig1.y };
            else if (Math.abs(orig1.y - orig0.y) < 0.1) pts[1] = { x: orig1.x, y: pts[0].y };
          }
        }
        if (endHit) {
          const lastIdx = pts.length - 1;
          const prevIdx = lastIdx - 1;
          const origEnd = { ...pts[lastIdx] };
          const origPrev = { ...pts[prevIdx] };
          pts[lastIdx] = { x: origEnd.x + dx, y: origEnd.y + dy };
          if (pts.length === 2) {
            if (Math.abs(origEnd.y - origPrev.y) < 0.1 && Math.abs(dy) > 0.05) {
              pts.splice(1, 0, { x: origPrev.x, y: pts[lastIdx].y });
            } else if (Math.abs(origEnd.x - origPrev.x) < 0.1 && Math.abs(dx) > 0.05) {
              pts.splice(1, 0, { x: pts[lastIdx].x, y: origPrev.y });
            }
          } else {
            if (Math.abs(origPrev.x - origEnd.x) < 0.1) pts[prevIdx] = { x: pts[lastIdx].x, y: origPrev.y };
            else if (Math.abs(origPrev.y - origEnd.y) < 0.1) pts[prevIdx] = { x: origPrev.x, y: pts[lastIdx].y };
          }
        }
        return { ...w, points: pts };
      });
      p.updateActiveSheet(
        (s) => ({
          ...s,
          components: s.components.map((c) => {
            const base = st.compStartPos[c.id];
            if (!base) return c;
            return { ...c, x: base.x + dx, y: base.y + dy };
          }),
          wires: updatedWires
        }),
        false
      );
    } else if (st.mode === 'movePort' && st.movingPortId && st.portStartPos) {
      const dx = snapToGrid(worldPt.x - st.startWorldX, p.project.gridSize);
      const dy = snapToGrid(worldPt.y - st.startWorldY, p.project.gridSize);
      p.updateActiveSheet(
        (s) => ({
          ...s,
          netPorts: s.netPorts.map((np) =>
            np.id === st.movingPortId ? { ...np, x: st.portStartPos!.x + dx, y: st.portStartPos!.y + dy } : np
          )
        }),
        false
      );
    } else if (st.mode === 'marquee' || st.mode === 'zoomBox') {
      p.setMarqueeBox({ x1: st.startWorldX, y1: st.startWorldY, x2: worldPt.x, y2: worldPt.y });
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const st = dragRef.current;
    if (st.mode === 'zoomBox' && p.marqueeBox) {
      const minX = Math.min(p.marqueeBox.x1, p.marqueeBox.x2);
      const maxX = Math.max(p.marqueeBox.x1, p.marqueeBox.x2);
      const minY = Math.min(p.marqueeBox.y1, p.marqueeBox.y2);
      const maxY = Math.max(p.marqueeBox.y1, p.marqueeBox.y2);
      p.setMarqueeBox(null);
      if (maxX - minX > 3 && maxY - minY > 3) {
        const wrap = p.canvasWrapRef.current;
        if (wrap) {
          const bw = maxX - minX;
          const bh = maxY - minY;
          const newScale = Math.max(0.5, Math.min(25, Math.min((wrap.clientWidth - 20) / bw, (wrap.clientHeight - 20) / bh)));
          setViewport({
            pxPerMm: newScale,
            ox: -minX * newScale + (wrap.clientWidth - bw * newScale) / 2,
            oy: -minY * newScale + (wrap.clientHeight - bh * newScale) / 2
          });
        }
        p.setTool('select');
      }
    } else if (st.mode === 'marquee' && p.marqueeBox) {
      const minX = Math.min(p.marqueeBox.x1, p.marqueeBox.x2);
      const maxX = Math.max(p.marqueeBox.x1, p.marqueeBox.x2);
      const minY = Math.min(p.marqueeBox.y1, p.marqueeBox.y2);
      const maxY = Math.max(p.marqueeBox.y1, p.marqueeBox.y2);
      const isRtlCrossing = p.marqueeBox.x2 < p.marqueeBox.x1;
      if (maxX - minX > 2 && maxY - minY > 2) {
        const inside = p.activeSheet.components
          .filter((c) => {
            const b = getCompWorldBounds(c);
            if (isRtlCrossing) {
              return b.maxX >= minX && b.minX <= maxX && b.maxY >= minY && b.minY <= maxY;
            }
            return b.minX >= minX && b.maxX <= maxX && b.minY >= minY && b.maxY <= maxY;
          })
          .map((c) => c.id);
        p.setSelectedCompIds(inside);
      }
      p.setMarqueeBox(null);
    } else if (st.mode === 'moveComp' || st.mode === 'movePort') {
      const dx = e.clientX - st.startScreenX;
      const dy = e.clientY - st.startScreenY;
      if (Math.hypot(dx, dy) > 3 && st.preDragProject) {
        p.pushUndoSnapshot(st.preDragProject);
      }
    }
    dragRef.current.mode = 'none';
  };

  const handleCanvasDoubleClick = () => {
    if ((p.tool === 'wire' || p.tool === 'bus') && p.wireDraftPts.length >= 2) {
      if (p.tool === 'wire') {
        const wNew: SchWire = { id: uid('wire'), points: p.wireDraftPts, netName: '' };
        p.updateActiveSheet((s) => ({ ...s, wires: [...s.wires, wNew] }));
      } else {
        const bNew: SchBus = { id: uid('bus'), points: p.wireDraftPts, busName: 'D[0..7]' };
        p.updateActiveSheet((s) => ({ ...s, buses: [...s.buses, bNew] }));
      }
      p.setWireDraftPts([]);
    }
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = p.canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setViewport((v) => {
      const nextScale = Math.max(0.4, Math.min(25, v.pxPerMm * factor));
      const wx = (sx - v.ox) / v.pxPerMm;
      const wy = (sy - v.oy) / v.pxPerMm;
      return {
        pxPerMm: nextScale,
        ox: sx - wx * nextScale,
        oy: sy - wy * nextScale
      };
    });
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if ((dragRef.current.pannedDistance ?? 0) > 5) return;
    if (p.wireDraftPts.length > 0) return;
    const worldPt = screenToWorld(e.clientX, e.clientY);
    const comp = findComponentAt(worldPt);
    const wire = findWireAt(worldPt);
    if (comp) {
      p.setSelectedCompIds([comp.id]);
      p.setContextMenu({ x: e.clientX, y: e.clientY, compId: comp.id });
    } else if (wire) {
      p.setSelectedWireId(wire.id);
      p.setContextMenu({ x: e.clientX, y: e.clientY, wireId: wire.id });
    }
  };

  return {
    viewport,
    cursorMm,
    zoomPercent,
    setZoomByPercent,
    zoomToFit,
    centerOnWorldPt,
    snapWorldSmart,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleCanvasDoubleClick,
    handleCanvasWheel,
    handleContextMenu
  };
}
