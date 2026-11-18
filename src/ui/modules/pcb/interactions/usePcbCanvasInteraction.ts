import { useCallback, useEffect, useRef, useState } from 'react';
import { PatternDef, PcbProject, Point2D } from '../../../../core/types';
import { dist, pointInPolygon, pointToSegmentDist, polygonBounds, uid } from '../../../../core/geometry';
import { broadcastEdaEvent } from '../../../../core/store';
import { snapPoint, snapToGrid } from '../../../../core/units';
import { applyMeanderToTrace } from '../../../../engines/autorouter';
import { updateAllCopperPours } from '../../../../engines/copperPour';
import { WorldPad } from '../../../../engines/drc';
import { INITIAL_DRAG_STATE } from '../constants';
import {
  buildDefaultPcbVia,
  buildPcbCopperPour,
  buildPlacedPcbComponent,
  PcbCopperPourSettings
} from '../services/pcbActionsService';
import {
  CopperLayerId,
  MeasureRulerState,
  PcbContextMenuState,
  PcbDragState,
  PcbExtraSelection,
  PcbToolId,
  PcbViewport,
  RoutingAngleMode
} from '../types';
import { computeRouteDraftPoints } from '../services/pcbRouteGeometry';

export interface UsePcbCanvasInteractionParams {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasWrapRef: React.RefObject<HTMLDivElement | null>;
  pcb: PcbProject;
  worldPads: WorldPad[];
  tool: PcbToolId;
  setTool: React.Dispatch<React.SetStateAction<PcbToolId>>;
  activeLayer: CopperLayerId;
  previewPatternDef: PatternDef | null;
  highlightedNet: string | null;
  setHighlightedNet: React.Dispatch<React.SetStateAction<string | null>>;
  selectedCompId: string | null;
  setSelectedCompId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedTraceId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedViaId?: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedExtraObj?: React.Dispatch<React.SetStateAction<PcbExtraSelection | null>>;
  routeNetName: string;
  setRouteNetName: React.Dispatch<React.SetStateAction<string>>;
  routeDraftPts: Point2D[];
  setRouteDraftPts: React.Dispatch<React.SetStateAction<Point2D[]>>;
  polyDraftPts: Point2D[];
  setPolyDraftPts: React.Dispatch<React.SetStateAction<Point2D[]>>;
  routeElbowFlip: boolean;
  routeAngleMode?: RoutingAngleMode;
  setContextMenu?: React.Dispatch<React.SetStateAction<PcbContextMenuState | null>>;
  lineStartPt: Point2D | null;
  setLineStartPt: React.Dispatch<React.SetStateAction<Point2D | null>>;
  pourDraft: PcbCopperPourSettings | null;
  setMeasurePts: React.Dispatch<React.SetStateAction<MeasureRulerState | null>>;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  commitPcb: (updater: (prev: PcbProject) => PcbProject, pushUndo?: boolean) => void;
  pushUndoSnapshot: (snapshot: PcbProject) => void;
}

/** Handles PCB canvas viewport pan/zoom and tool-specific mouse interactions. */
export function usePcbCanvasInteraction(p: UsePcbCanvasInteractionParams) {
  const [viewport, setViewport] = useState<PcbViewport>({ ox: 110, oy: 90, pxPerMm: 6.2 });
  const [cursorMm, setCursorMm] = useState<Point2D>({ x: 0, y: 0 });
  const dragRef = useRef<PcbDragState>({ ...INITIAL_DRAG_STATE });
  const rmbStartRef = useRef<{ x: number; y: number } | null>(null);

  const zoomToFit = useCallback(() => {
    const wrap = p.canvasWrapRef.current;
    if (!wrap) return;
    const w = wrap.clientWidth || 800;
    const h = wrap.clientHeight || 520;
    const b =
      p.pcb.boardOutline.length >= 3
        ? polygonBounds(p.pcb.boardOutline)
        : { minX: 0, minY: 0, maxX: 90, maxY: 60 };
    const bw = Math.max(20, b.maxX - b.minX);
    const bh = Math.max(20, b.maxY - b.minY);
    const scale = Math.max(1, Math.min((w - 60) / bw, (h - 50) / bh));
    setViewport({
      pxPerMm: scale,
      ox: (w - bw * scale) / 2 - b.minX * scale,
      oy: (h - bh * scale) / 2 - b.minY * scale
    });
  }, [p.canvasWrapRef, p.pcb.boardOutline]);

  useEffect(() => {
    const t = setTimeout(zoomToFit, 60);
    window.addEventListener('resize', zoomToFit);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', zoomToFit);
    };
  }, [zoomToFit]);

  const screenToWorld = useCallback(
    (clientX: number, clientY: number): Point2D => {
      const rect = p.canvasRef.current?.getBoundingClientRect();
      return {
        x: (clientX - (rect?.left ?? 0) - viewport.ox) / viewport.pxPerMm,
        y: (clientY - (rect?.top ?? 0) - viewport.oy) / viewport.pxPerMm
      };
    },
    [p.canvasRef, viewport]
  );

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

  const zoomPercent = Math.round((viewport.pxPerMm / 3.1) * 100);
  const setZoomPercent = (pct: number) => {
    const wrap = p.canvasWrapRef.current;
    const cx = (wrap?.clientWidth ?? 800) / 2;
    const cy = (wrap?.clientHeight ?? 500) / 2;
    const ns = Math.max(0.8, Math.min(40, (pct / 100) * 3.1));
    setViewport((v) => {
      const wx = (cx - v.ox) / v.pxPerMm;
      const wy = (cy - v.oy) / v.pxPerMm;
      return { pxPerMm: ns, ox: cx - wx * ns, oy: cy - wy * ns };
    });
  };

  const finalizeRightClickDrafts = () => {
    if (p.tool === 'routeManual' && p.routeDraftPts.length >= 2) {
      p.commitPcb((prev) => ({
        ...prev,
        traces: [
          ...prev.traces,
          {
            id: uid('tr'),
            layer: p.activeLayer,
            netName: p.routeNetName,
            points: p.routeDraftPts,
            width: prev.designRules.defaultTraceWidth
          }
        ]
      }));
    }
    p.setRouteDraftPts([]);

    if (p.polyDraftPts.length >= 3) {
      if (p.tool === 'boardOutline') {
        p.commitPcb((prev) => updateAllCopperPours({ ...prev, boardOutline: p.polyDraftPts }));
      } else if (p.tool === 'cutout') {
        p.commitPcb((prev) =>
          updateAllCopperPours({ ...prev, cutouts: [...prev.cutouts, { id: uid('cut'), points: p.polyDraftPts }] })
        );
      } else if (p.tool === 'keepout') {
        p.commitPcb((prev) =>
          updateAllCopperPours({
            ...prev,
            keepouts: [...prev.keepouts, { id: uid('ko'), layer: 'AllCopper', kind: 'RouteKeepout', points: p.polyDraftPts }]
          })
        );
      } else if (p.tool === 'copperPour' && p.pourDraft) {
        const newPour = buildPcbCopperPour({
          pcb: p.pcb,
          outline: p.polyDraftPts,
          dependOnBoardOutline: false,
          settings: p.pourDraft
        });
        p.commitPcb((prev) => updateAllCopperPours({ ...prev, copperPours: [...prev.copperPours, newPour] }));
        p.setTool('select');
        p.setStatusMessage(`Полигон «${newPour.netName}» добавлен на слой ${newPour.layer}.`);
      }
    }
    p.setPolyDraftPts([]);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const worldPt = screenToWorld(e.clientX, e.clientY);

    if (e.button === 1 || (e.button === 2 && p.routeDraftPts.length === 0 && p.polyDraftPts.length === 0)) {
      if (e.button === 1) e.preventDefault();
      if (e.button === 2) rmbStartRef.current = { x: e.clientX, y: e.clientY };
      dragRef.current = {
        mode: 'pan',
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        startWorldX: worldPt.x,
        startWorldY: worldPt.y,
        compStartX: 0,
        compStartY: 0,
        lastOx: viewport.ox,
        lastOy: viewport.oy
      };
      return;
    }

    if (e.button === 2) {
      rmbStartRef.current = null;
      finalizeRightClickDrafts();
      return;
    }

    if (e.button !== 0) return;

    const snapped = snapPoint(worldPt, p.pcb.gridSize);

    if (p.tool === 'placePattern' && p.previewPatternDef) {
      const newComp = buildPlacedPcbComponent(p.previewPatternDef, snapped, p.pcb.components.length + 1, p.pcb.components);
      p.commitPcb((prev) => ({ ...prev, components: [...prev.components, newComp] }));
      p.setSelectedCompId(newComp.id);
      return;
    }

    if (p.tool === 'via') {
      const via = buildDefaultPcbVia(p.pcb, snapped, p.highlightedNet ?? 'GND');
      p.commitPcb((prev) => ({ ...prev, vias: [...prev.vias, via] }));
      return;
    }

    if (p.tool === 'routeManual') {
      let nearestPad: WorldPad | undefined;
      let bestPadDist = Infinity;
      for (const wp of p.worldPads) {
        const d = dist(worldPt, wp);
        if (d <= Math.max(0.8, wp.radius) && d < bestPadDist) {
          bestPadDist = d;
          nearestPad = wp;
        }
      }
      const clickPt = nearestPad ? { x: nearestPad.x, y: nearestPad.y } : snapped;
      if (p.routeDraftPts.length === 0) {
        p.setRouteNetName(nearestPad?.netName ?? '');
        p.setRouteDraftPts([clickPt]);
        const angleLabel = (p.routeAngleMode ?? '45') === '45' ? '45°' : (p.routeAngleMode === '90' ? '90°' : (p.routeAngleMode === 'arc' ? 'дуги' : 'свободный'));
        p.setStatusMessage(
          `Трассировка цепи «${nearestPad?.netName || 'без цепи'}». Угол: ${angleLabel} (Shift+Пробел или / — сменить угол, Пробел — инверсия колена). V или 1/2/B/T — переходной слой. ПКМ/Enter — завершить.`
        );
      } else {
        const last = p.routeDraftPts[p.routeDraftPts.length - 1];
        const segPts = computeRouteDraftPoints(last, clickPt, p.routeAngleMode ?? '45', p.routeElbowFlip);
        const pts = [
          ...p.routeDraftPts,
          ...segPts
        ];
        const hitSameNetVia = p.pcb.vias.find(
          (v) => v.netName && v.netName === p.routeNetName && dist(v, clickPt) <= v.outerDiameter / 2 + 0.5
        );
        const hitSameNetTrace = p.pcb.traces.find(
          (tr) =>
            tr.layer === p.activeLayer &&
            tr.netName &&
            tr.netName === p.routeNetName &&
            tr.points.some((pt, idx) => idx > 0 && pointToSegmentDist(clickPt, tr.points[idx - 1], pt) <= tr.width / 2 + 0.5)
        );
        const shouldFinish = (nearestPad && nearestPad.netName && nearestPad.netName === p.routeNetName) || hitSameNetVia || hitSameNetTrace;

        if (shouldFinish) {
          p.commitPcb((prev) => {
            const ncId = prev.netClassAssignments?.[p.routeNetName];
            const netClass = prev.netClasses?.find((nc) => nc.id === ncId);
            const traceWidth = netClass?.traceWidth ?? prev.designRules.defaultTraceWidth;
            return {
              ...prev,
              traces: [
                ...prev.traces,
                {
                  id: uid('tr'),
                  layer: p.activeLayer,
                  netName: p.routeNetName,
                  points: pts,
                  width: traceWidth
                }
              ]
            };
          });
          p.setRouteDraftPts([]);
          p.setStatusMessage(`Соединение цепи «${p.routeNetName}» завершено.`);
        } else {
          p.setRouteDraftPts(pts);
        }
      }
      return;
    }

    if (p.tool === 'boardOutline' || p.tool === 'cutout' || p.tool === 'keepout' || p.tool === 'copperPour') {
      p.setPolyDraftPts((prev) => [...prev, snapped]);
      return;
    }

    if (p.tool === 'meander') {
      const hitTr = p.pcb.traces.find((tr) => {
        for (let i = 1; i < tr.points.length; i++) {
          if (pointToSegmentDist(worldPt, tr.points[i - 1], tr.points[i]) <= 1.2) return true;
        }
        return false;
      });
      if (hitTr) {
        p.commitPcb((prev) => ({
          ...prev,
          traces: prev.traces.map((tr) => (tr.id === hitTr.id ? applyMeanderToTrace(tr, 4.0, 1.2, 1.2, prev) : tr))
        }));
        p.setStatusMessage(`Применена змейка (выравнивание длины) к проводнику цепи «${hitTr.netName}».`);
      }
      return;
    }

    if (p.tool === 'measure') {
      p.setMeasurePts({ start: snapped, end: snapped });
      dragRef.current = {
        mode: 'measure',
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        startWorldX: snapped.x,
        startWorldY: snapped.y,
        compStartX: 0,
        compStartY: 0,
        lastOx: 0,
        lastOy: 0
      };
      return;
    }

    if (p.tool === 'shapeText') {
      const txt = window.prompt('Введите текст маркировки (шелкография):', 'SIPTrace');
      if (txt && txt.trim()) {
        p.commitPcb((prev) => ({
          ...prev,
          shapes: [
            ...prev.shapes,
            { id: uid('txt'), layer: 'TopSilk', type: 'text', x1: snapped.x, y1: snapped.y, width: 0.2, text: txt.trim(), size: 2.0 }
          ]
        }));
      }
      p.setTool('select');
      return;
    }

    if (p.tool === 'shapeLine') {
      if (!p.lineStartPt) p.setLineStartPt(snapped);
      else {
        const startPt = p.lineStartPt;
        p.commitPcb((prev) => ({
          ...prev,
          shapes: [
            ...prev.shapes,
            { id: uid('ln'), layer: 'TopSilk', type: 'line', x1: startPt.x, y1: startPt.y, x2: snapped.x, y2: snapped.y, width: 0.2 }
          ]
        }));
        p.setLineStartPt(null);
      }
      return;
    }

    // Hit-test traces & vias first so traces near large components remain clickable
    const hitVia = p.pcb.vias.find((v) => dist(worldPt, v) <= Math.max(0.6, v.outerDiameter * 0.65));
    if (hitVia) {
      p.setSelectedViaId?.(hitVia.id);
      p.setSelectedTraceId(null);
      p.setSelectedCompId(null);
      p.setSelectedExtraObj?.(null);
      p.setHighlightedNet(hitVia.netName || null);
      p.setStatusMessage(`Выбрано переходное отверстие (${hitVia.netName || 'без цепи'}). Del — удалить.`);
      return;
    }

    const hitTrace = p.pcb.traces.find((tr) => {
      for (let i = 1; i < tr.points.length; i++) {
        if (pointToSegmentDist(worldPt, tr.points[i - 1], tr.points[i]) <= Math.max(0.45, tr.width * 0.8)) return true;
      }
      return false;
    });
    if (hitTrace) {
      p.setSelectedTraceId(hitTrace.id);
      p.setSelectedViaId?.(null);
      p.setSelectedCompId(null);
      p.setSelectedExtraObj?.(null);
      p.setHighlightedNet(hitTrace.netName || null);
      return;
    }

    // Rectangular rotated courtyard hit-test (supports wide connectors XP/XT accurately; pick smallest if nested)
    const hitComp = [...p.pcb.components]
      .filter((c) => {
        const rad = (-c.angle * Math.PI) / 180;
        const dx = worldPt.x - c.x;
        const dy = worldPt.y - c.y;
        const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
        const hw = Math.max(1.5, c.courtyard.width * 0.5);
        const hh = Math.max(1.5, c.courtyard.height * 0.5);
        return Math.abs(lx) <= hw && Math.abs(ly) <= hh;
      })
      .sort((a, b) => a.courtyard.width * a.courtyard.height - b.courtyard.width * b.courtyard.height)[0];
    if (hitComp) {
      p.setSelectedCompId(hitComp.id);
      p.setSelectedTraceId(null);
      p.setSelectedViaId?.(null);
      p.setSelectedExtraObj?.(null);
      broadcastEdaEvent('crossprobe:refdes', { refDes: hitComp.refDes, source: 'pcb', target: 'schematic' });
      dragRef.current = {
        mode: 'moveComp',
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        startWorldX: worldPt.x,
        startWorldY: worldPt.y,
        compStartX: hitComp.x,
        compStartY: hitComp.y,
        preDragPcb: p.pcb,
        lastOx: viewport.ox,
        lastOy: viewport.oy
      };
      return;
    }

    // Hit-test shapes (lines, text, rects, circles), cutouts, keepouts, and copper pours
    const hitShape = p.pcb.shapes.find((sh) => {
      if ((sh.type === 'line' || sh.type === 'dimension') && sh.x2 !== undefined && sh.y2 !== undefined) {
        return pointToSegmentDist(worldPt, { x: sh.x1, y: sh.y1 }, { x: sh.x2, y: sh.y2 }) <= 1.2;
      }
      if (sh.type === 'rect' && sh.w !== undefined && sh.h !== undefined) {
        return worldPt.x >= sh.x1 && worldPt.x <= sh.x1 + sh.w && worldPt.y >= sh.y1 && worldPt.y <= sh.y1 + sh.h;
      }
      if (sh.type === 'circle' && sh.r !== undefined) {
        return Math.abs(dist(worldPt, { x: sh.x1, y: sh.y1 }) - sh.r) <= 1.2;
      }
      if (sh.type === 'text') {
        const wApprox = Math.max(4, (sh.text?.length ?? 4) * (sh.size ?? 2) * 0.65);
        const hApprox = Math.max(2.5, (sh.size ?? 2) * 1.4);
        return worldPt.x >= sh.x1 - 1 && worldPt.x <= sh.x1 + wApprox && worldPt.y >= sh.y1 - hApprox && worldPt.y <= sh.y1 + 1.5;
      }
      return false;
    });
    if (hitShape) {
      p.setSelectedCompId(null);
      p.setSelectedTraceId(null);
      p.setSelectedViaId?.(null);
      p.setSelectedExtraObj?.({ kind: 'shape', id: hitShape.id });
      p.setStatusMessage(`Выбран графический объект (${hitShape.type}). Del — удалить.`);
      return;
    }

    const hitCutout = p.pcb.cutouts.find((cut) => cut.points.length >= 3 && pointInPolygon(worldPt, cut.points));
    if (hitCutout) {
      p.setSelectedCompId(null);
      p.setSelectedTraceId(null);
      p.setSelectedViaId?.(null);
      p.setSelectedExtraObj?.({ kind: 'cutout', id: hitCutout.id });
      p.setStatusMessage('Выбран вырез платы. Del — удалить.');
      return;
    }

    const hitKeepout = p.pcb.keepouts.find((ko) => ko.points.length >= 3 && pointInPolygon(worldPt, ko.points));
    if (hitKeepout) {
      p.setSelectedCompId(null);
      p.setSelectedTraceId(null);
      p.setSelectedViaId?.(null);
      p.setSelectedExtraObj?.({ kind: 'keepout', id: hitKeepout.id });
      p.setStatusMessage(`Выбрана зона запрета (${hitKeepout.kind}). Del — удалить.`);
      return;
    }

    const hitPour = p.pcb.copperPours.find((cp) => cp.outline.length >= 3 && pointInPolygon(worldPt, cp.outline));
    if (hitPour) {
      p.setSelectedCompId(null);
      p.setSelectedTraceId(null);
      p.setSelectedViaId?.(null);
      p.setSelectedExtraObj?.({ kind: 'pour', id: hitPour.id });
      p.setStatusMessage(`Выбран полигон заливки «${hitPour.netName}». Del — удалить.`);
      return;
    }

    p.setSelectedCompId(null);
    p.setSelectedTraceId(null);
    p.setSelectedViaId?.(null);
    p.setSelectedExtraObj?.(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const worldPt = screenToWorld(e.clientX, e.clientY);
    const snapped = snapPoint(worldPt, p.pcb.gridSize);
    setCursorMm(snapped);

    const st = dragRef.current;
    if (st.mode === 'pan') {
      setViewport((v) => ({
        ...v,
        ox: st.lastOx + (e.clientX - st.startScreenX),
        oy: st.lastOy + (e.clientY - st.startScreenY)
      }));
    } else if (st.mode === 'moveComp' && p.selectedCompId) {
      const dx = snapToGrid(worldPt.x - st.startWorldX, p.pcb.gridSize);
      const dy = snapToGrid(worldPt.y - st.startWorldY, p.pcb.gridSize);
      p.commitPcb(
        (prev) => ({
          ...prev,
          components: prev.components.map((c) =>
            c.id === p.selectedCompId && !c.locked ? { ...c, x: st.compStartX + dx, y: st.compStartY + dy } : c
          )
        }),
        false
      );
    } else if (st.mode === 'measure') {
      p.setMeasurePts({ start: { x: st.startWorldX, y: st.startWorldY }, end: snapped });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 2 && rmbStartRef.current) {
      const moved = Math.hypot(e.clientX - rmbStartRef.current.x, e.clientY - rmbStartRef.current.y);
      rmbStartRef.current = null;
      if (moved <= 4 && p.tool !== 'select') {
        p.setTool('select');
        p.setLineStartPt(null);
        p.setMeasurePts(null);
        p.setStatusMessage('Активный инструмент отменён.');
      }
    }
    if (
      dragRef.current.mode === 'moveComp' &&
      Math.hypot(e.clientX - dragRef.current.startScreenX, e.clientY - dragRef.current.startScreenY) > 3 &&
      dragRef.current.preDragPcb
    ) {
      const movedComp = p.pcb.components.find((c) => c.id === p.selectedCompId);
      if (!movedComp?.locked) {
        p.pushUndoSnapshot(dragRef.current.preDragPcb);
      }
    }
    dragRef.current.mode = 'none';
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = p.canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setViewport((v) => {
      const ns = Math.max(0.8, Math.min(40, v.pxPerMm * factor));
      const wx = (sx - v.ox) / v.pxPerMm;
      const wy = (sy - v.oy) / v.pxPerMm;
      return { pxPerMm: ns, ox: sx - wx * ns, oy: sy - wy * ns };
    });
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (dragRef.current.mode === 'pan') return;

    if (p.tool === 'routeManual' && p.routeDraftPts.length > 0) {
      finalizeRightClickDrafts();
      return;
    }

    if (p.tool !== 'select') {
      p.setTool('select');
      p.setLineStartPt(null);
      p.setMeasurePts(null);
      return;
    }

    const worldPt = screenToWorld(e.clientX, e.clientY);

    // Hit test component
    const hitComp = [...p.pcb.components]
      .filter((c) => {
        const rad = (-c.angle * Math.PI) / 180;
        const dx = worldPt.x - c.x;
        const dy = worldPt.y - c.y;
        const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
        const hw = Math.max(1.5, c.courtyard.width * 0.5);
        const hh = Math.max(1.5, c.courtyard.height * 0.5);
        return Math.abs(lx) <= hw && Math.abs(ly) <= hh;
      })
      .sort((a, b) => a.courtyard.width * a.courtyard.height - b.courtyard.width * b.courtyard.height)[0];

    if (hitComp) {
      p.setSelectedCompId(hitComp.id);
      p.setSelectedTraceId(null);
      p.setSelectedViaId?.(null);
      p.setSelectedExtraObj?.(null);
      p.setContextMenu?.({
        x: e.clientX,
        y: e.clientY,
        target: { kind: 'component', compId: hitComp.id }
      });
      return;
    }

    // Hit test via
    const hitVia = p.pcb.vias.find((v) => dist(worldPt, v) <= Math.max(0.6, v.outerDiameter * 0.65));
    if (hitVia) {
      p.setSelectedViaId?.(hitVia.id);
      p.setSelectedTraceId(null);
      p.setSelectedCompId(null);
      p.setSelectedExtraObj?.(null);
      p.setHighlightedNet(hitVia.netName || null);
      p.setContextMenu?.({
        x: e.clientX,
        y: e.clientY,
        target: { kind: 'via', viaId: hitVia.id }
      });
      return;
    }

    // Hit test trace
    const hitTrace = p.pcb.traces.find((tr) => {
      for (let i = 1; i < tr.points.length; i++) {
        if (pointToSegmentDist(worldPt, tr.points[i - 1], tr.points[i]) <= Math.max(0.45, tr.width * 0.8)) return true;
      }
      return false;
    });
    if (hitTrace) {
      p.setSelectedTraceId(hitTrace.id);
      p.setSelectedViaId?.(null);
      p.setSelectedCompId(null);
      p.setSelectedExtraObj?.(null);
      p.setHighlightedNet(hitTrace.netName || null);
      p.setContextMenu?.({
        x: e.clientX,
        y: e.clientY,
        target: { kind: 'trace', traceId: hitTrace.id }
      });
      return;
    }

    // Hit test pour
    const hitPour = p.pcb.copperPours.find((cp) => cp.outline.length >= 3 && pointInPolygon(worldPt, cp.outline));
    if (hitPour) {
      p.setSelectedCompId(null);
      p.setSelectedTraceId(null);
      p.setSelectedViaId?.(null);
      p.setSelectedExtraObj?.({ kind: 'pour', id: hitPour.id });
      p.setContextMenu?.({
        x: e.clientX,
        y: e.clientY,
        target: { kind: 'pour', pourId: hitPour.id }
      });
      return;
    }

    // Canvas empty space
    p.setContextMenu?.({
      x: e.clientX,
      y: e.clientY,
      target: { kind: 'canvas', worldPt }
    });
  };

  return {
    viewport,
    cursorMm,
    zoomPercent,
    setZoomPercent,
    zoomToFit,
    centerOnWorldPt,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleContextMenu,
    finalizeDrafts: finalizeRightClickDrafts
  };
}
