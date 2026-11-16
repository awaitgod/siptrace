import { useEffect } from 'react';
import { HotkeyMap, PcbProject, Point2D } from '../../../../core/types';
import { matchesHotkey } from '../../../../core/store';
import { CopperLayerId, MeasureRulerState, PcbExtraSelection, PcbToolId } from '../types';
import { updateAllCopperPours } from '../../../../engines/copperPour';

export interface UsePcbHotkeysParams {
  hotkeys: HotkeyMap;
  layerCount: number;
  tool: PcbToolId;
  activeLayer: CopperLayerId;
  selectedCompId: string | null;
  selectedTraceId: string | null;
  selectedViaId?: string | null;
  selectedExtraObj?: PcbExtraSelection | null;
  routeDraftPtsLength: number;
  zoomPercent: number;
  setZoomPercent: (pct: number) => void;
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
  setMeasurePts: React.Dispatch<React.SetStateAction<MeasureRulerState | null>>;
  handleUndo: () => void;
  handleRedo: () => void;
  switchCopperLayer: (layer: CopperLayerId) => void;
  setRouteElbowFlip: React.Dispatch<React.SetStateAction<boolean>>;
  setRouteDraftPts: React.Dispatch<React.SetStateAction<Point2D[]>>;
  setPolyDraftPts: React.Dispatch<React.SetStateAction<Point2D[]>>;
  setLineStartPt: React.Dispatch<React.SetStateAction<Point2D | null>>;
  setTool: React.Dispatch<React.SetStateAction<PcbToolId>>;
  setSelectedTraceId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedCompId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedViaId?: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedExtraObj?: React.Dispatch<React.SetStateAction<PcbExtraSelection | null>>;
  commitPcb: (updater: (prev: PcbProject) => PcbProject, pushUndo?: boolean) => void;
  handleNewProject: () => void;
  handleOpenPcbFile: () => void;
  handleSavePcbFile: () => void;
  handleRunDrc: () => void;
  zoomToFit: () => void;
  onFind?: () => void;
}

/** Registers global keyboard shortcuts for PCB editing, routing layer switches, and DRC. */
export function usePcbHotkeys(p: UsePcbHotkeysParams): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('.dt-modal-backdrop')) return;
      const t = e.target as HTMLElement | null;
      const inInput = Boolean(t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA'));

      if (matchesHotkey(e, p.hotkeys.save)) {
        e.preventDefault();
        if (inInput) t?.blur();
        p.handleSavePcbFile();
        return;
      }

      if (inInput) return;

      // Preserve standard activation of focused controls while routing.
      if ((e.key === ' ' || e.key === 'Enter') && t?.closest('button, a, [role="button"], [role^="menuitem"]')) return;

      if (e.ctrlKey && (e.key.toLowerCase() === 'n' || e.code === 'KeyN')) {
        e.preventDefault();
        p.handleNewProject();
      } else if (e.ctrlKey && (e.key.toLowerCase() === 'o' || e.code === 'KeyO')) {
        e.preventDefault();
        p.handleOpenPcbFile();
      } else if (matchesHotkey(e, p.hotkeys.undo)) {
        e.preventDefault();
        p.handleUndo();
      } else if (matchesHotkey(e, p.hotkeys.redo)) {
        e.preventDefault();
        p.handleRedo();
      } else if (e.key === '1' && !e.ctrlKey && !e.altKey) {
        p.switchCopperLayer('TopCopper');
      } else if (e.key === '2' && !e.ctrlKey && !e.altKey) {
        p.switchCopperLayer('BottomCopper');
      } else if (e.key === '3' && !e.ctrlKey && !e.altKey && p.layerCount >= 4) {
        p.switchCopperLayer('Inner1');
      } else if (e.key === '4' && !e.ctrlKey && !e.altKey && p.layerCount >= 4) {
        p.switchCopperLayer('Inner2');
      } else if (matchesHotkey(e, p.hotkeys.find)) {
        e.preventDefault();
        p.onFind?.();
      } else if (matchesHotkey(e, p.hotkeys.placeVia) && p.tool === 'routeManual') {
        p.switchCopperLayer(p.activeLayer === 'TopCopper' ? 'BottomCopper' : 'TopCopper');
      } else if (matchesHotkey(e, p.hotkeys.routeManual)) {
        p.setRouteDraftPts([]);
        p.setTool('routeManual');
      } else if (matchesHotkey(e, p.hotkeys.rotate) && p.selectedCompId) {
        p.commitPcb((prev) => ({
          ...prev,
          components: prev.components.map((c) =>
            c.id === p.selectedCompId && !c.locked ? { ...c, angle: (c.angle + 90) % 360 } : c
          )
        }));
      } else if ((e.key.toLowerCase() === 'f' || e.code === 'KeyF') && !e.ctrlKey && !e.altKey && p.selectedCompId) {
        p.commitPcb((prev) => ({
          ...prev,
          components: prev.components.map((c) =>
            c.id === p.selectedCompId && !c.locked ? { ...c, side: c.side === 'Top' ? 'Bottom' : 'Top' } : c
          )
        }));
      } else if (e.key === ' ' || e.code === 'Space') {
        if (p.tool === 'routeManual' && p.routeDraftPtsLength > 0) {
          e.preventDefault();
          p.setRouteElbowFlip((v) => !v);
        }
      } else if (e.key === 'Backspace' && p.tool === 'routeManual' && p.routeDraftPtsLength > 0) {
        e.preventDefault();
        p.setRouteDraftPts((pts) => pts.slice(0, -1));
      } else if (matchesHotkey(e, p.hotkeys.selectTool) || e.key === 'Escape') {
        p.setRouteDraftPts([]);
        p.setPolyDraftPts([]);
        p.setLineStartPt(null);
        p.setMeasurePts(null);
        p.setTool('select');
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (p.selectedViaId) {
          p.commitPcb((prev) => ({
            ...prev,
            vias: prev.vias.filter((v) => v.id !== p.selectedViaId)
          }));
          p.setSelectedViaId?.(null);
        } else if (p.selectedTraceId) {
          p.commitPcb((prev) => ({
            ...prev,
            traces: prev.traces.filter((tr) => tr.id !== p.selectedTraceId)
          }));
          p.setSelectedTraceId(null);
        } else if (p.selectedCompId) {
          const target = p.selectedCompId;
          p.commitPcb((prev) => ({
            ...prev,
            components: prev.components.filter((c) => !(c.id === target && !c.locked))
          }));
          p.setSelectedCompId(null);
        } else if (p.selectedExtraObj) {
          const obj = p.selectedExtraObj;
          p.commitPcb((prev) => {
            if (obj.kind === 'shape') {
              return { ...prev, shapes: prev.shapes.filter((s) => s.id !== obj.id) };
            }
            if (obj.kind === 'cutout') {
              return updateAllCopperPours({ ...prev, cutouts: prev.cutouts.filter((c) => c.id !== obj.id) });
            }
            if (obj.kind === 'keepout') {
              return updateAllCopperPours({ ...prev, keepouts: prev.keepouts.filter((k) => k.id !== obj.id) });
            }
            return { ...prev, copperPours: prev.copperPours.filter((cp) => cp.id !== obj.id) };
          });
          p.setSelectedExtraObj?.(null);
        }
      } else if (matchesHotkey(e, p.hotkeys.runCheck)) {
        e.preventDefault();
        p.handleRunDrc();
      } else if (matchesHotkey(e, p.hotkeys.toggleGrid)) {
        e.preventDefault();
        p.setShowGrid((g) => !g);
      } else if (matchesHotkey(e, p.hotkeys.zoomFit)) {
        p.zoomToFit();
      } else if (matchesHotkey(e, p.hotkeys.zoomIn)) {
        e.preventDefault();
        p.setZoomPercent(Math.min(800, Math.round(p.zoomPercent * 1.15)));
      } else if (matchesHotkey(e, p.hotkeys.zoomOut)) {
        e.preventDefault();
        p.setZoomPercent(Math.max(25, Math.round(p.zoomPercent / 1.15)));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [p]);
}
