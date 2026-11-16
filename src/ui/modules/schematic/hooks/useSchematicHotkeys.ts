import { useEffect } from 'react';
import { HotkeyMap, PlacedComponent, Point2D, SchBus, SchWire, SchematicProject, SchematicSheet } from '../../../../core/types';
import { uid } from '../../../../core/geometry';
import { matchesHotkey } from '../../../../core/store';
import { cloneClipboardComponents } from '../services/schematicActionsService';
import { SchToolId } from '../types';

export interface UseSchematicHotkeysParams {
  hotkeys: HotkeyMap;
  tool: SchToolId;
  project: SchematicProject;
  activeSheet: SchematicSheet;
  selectedCompIds: string[];
  clipboardComps: PlacedComponent[];
  setClipboardComps: React.Dispatch<React.SetStateAction<PlacedComponent[]>>;
  wireDraftPts: Point2D[];
  setWireDraftPts: React.Dispatch<React.SetStateAction<Point2D[]>>;
  shapeStartPt: Point2D | null;
  setShapeStartPt: React.Dispatch<React.SetStateAction<Point2D | null>>;
  setTool: React.Dispatch<React.SetStateAction<SchToolId>>;
  setElbowFlip: React.Dispatch<React.SetStateAction<boolean>>;
  setShowFindDialog: (v: boolean) => void;
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
  zoomPercent: number;
  setZoomByPercent: (pct: number) => void;
  updateActiveSheet: (sheetUpdater: (s: SchematicSheet) => SchematicSheet, pushUndo?: boolean) => void;
  handleNewProject: () => void;
  handleOpenFile: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleSaveFile: () => void;
  handleConvertToPcb: () => void;
  deleteSelection: () => void;
  rotateSelection: () => void;
  flipSelection: (axis: 'X' | 'Y') => void;
  zoomToFit: () => void;
  handleRunErc: () => void;
}

/** Registers global keyboard shortcuts for Schematic Capture actions using configurable HotkeyMap. */
export function useSchematicHotkeys(p: UseSchematicHotkeysParams): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Do not intercept canvas hotkeys while a modal dialog is open
      if (document.querySelector('.dt-modal-backdrop')) return;

      const target = e.target as HTMLElement | null;
      const inInput = Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'));

      // Allow Ctrl+S / Ctrl+B even while focused inside sidebar properties input
      if (matchesHotkey(e, p.hotkeys.save)) {
        e.preventDefault();
        if (inInput) target?.blur();
        p.handleSaveFile();
        return;
      }
      if (matchesHotkey(e, p.hotkeys.convertToPcb)) {
        e.preventDefault();
        if (inInput) target?.blur();
        p.handleConvertToPcb();
        return;
      }

      if (inInput) return;

      // Space and Enter activate focused controls; canvas shortcuts must not steal them.
      if ((e.key === ' ' || e.key === 'Enter') && target?.closest('button, a, [role="button"], [role^="menuitem"]')) return;

      if (matchesHotkey(e, p.hotkeys.undo)) {
        e.preventDefault();
        p.handleUndo();
      } else if (matchesHotkey(e, p.hotkeys.redo)) {
        e.preventDefault();
        p.handleRedo();
      } else if (e.ctrlKey && (e.key.toLowerCase() === 'n' || e.code === 'KeyN')) {
        e.preventDefault();
        p.handleNewProject();
      } else if (e.ctrlKey && (e.key.toLowerCase() === 'o' || e.code === 'KeyO')) {
        e.preventDefault();
        p.handleOpenFile();
      } else if (matchesHotkey(e, p.hotkeys.find)) {
        e.preventDefault();
        p.setShowFindDialog(true);
      } else if (e.ctrlKey && (e.key.toLowerCase() === 'c' || e.code === 'KeyC')) {
        const comps = p.activeSheet.components.filter((c) => p.selectedCompIds.includes(c.id));
        if (comps.length > 0) p.setClipboardComps(comps);
      } else if (e.ctrlKey && (e.key.toLowerCase() === 'v' || e.code === 'KeyV')) {
        if (p.clipboardComps.length > 0) {
          p.updateActiveSheet((s) => ({
            ...s,
            components: [...s.components, ...cloneClipboardComponents(p.project, p.clipboardComps)]
          }));
        }
      } else if (e.key === 'Enter' && (p.tool === 'wire' || p.tool === 'bus') && p.wireDraftPts.length >= 2) {
        e.preventDefault();
        if (p.tool === 'wire') {
          const wNew: SchWire = { id: uid('wire'), points: p.wireDraftPts, netName: '' };
          p.updateActiveSheet((s) => ({ ...s, wires: [...s.wires, wNew] }));
        } else {
          const bNew: SchBus = { id: uid('bus'), points: p.wireDraftPts, busName: 'D[0..7]' };
          p.updateActiveSheet((s) => ({ ...s, buses: [...s.buses, bNew] }));
        }
        p.setWireDraftPts([]);
      } else if (e.key === 'Backspace' && (p.tool === 'wire' || p.tool === 'bus') && p.wireDraftPts.length > 0) {
        e.preventDefault();
        p.setWireDraftPts((pts) => pts.slice(0, -1));
      } else if (matchesHotkey(e, p.hotkeys.selectTool) || e.key === 'Escape') {
        if (p.wireDraftPts.length > 0) p.setWireDraftPts([]);
        else if (p.shapeStartPt) p.setShapeStartPt(null);
        else p.setTool('select');
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        p.deleteSelection();
      } else if (matchesHotkey(e, p.hotkeys.rotate)) {
        p.rotateSelection();
      } else if (matchesHotkey(e, p.hotkeys.flipX)) {
        p.flipSelection('X');
      } else if (matchesHotkey(e, p.hotkeys.flipY)) {
        p.flipSelection('Y');
      } else if (matchesHotkey(e, p.hotkeys.placeWire)) {
        p.setTool('wire');
      } else if (matchesHotkey(e, p.hotkeys.placeBus)) {
        p.setTool('bus');
      } else if (matchesHotkey(e, p.hotkeys.placePort)) {
        p.setTool('netPort');
      } else if (e.key === ' ' || e.code === 'Space') {
        if (p.wireDraftPts.length > 0) {
          e.preventDefault();
          p.setElbowFlip((v) => !v);
        } else {
          e.preventDefault();
          p.rotateSelection();
        }
      } else if (matchesHotkey(e, p.hotkeys.zoomFit)) {
        p.zoomToFit();
      } else if (matchesHotkey(e, p.hotkeys.zoomIn)) {
        e.preventDefault();
        p.setZoomByPercent(Math.min(800, Math.round(p.zoomPercent * 1.15)));
      } else if (matchesHotkey(e, p.hotkeys.zoomOut)) {
        e.preventDefault();
        p.setZoomByPercent(Math.max(20, Math.round(p.zoomPercent / 1.15)));
      } else if (matchesHotkey(e, p.hotkeys.runCheck)) {
        e.preventDefault();
        p.handleRunErc();
      } else if (matchesHotkey(e, p.hotkeys.toggleGrid)) {
        e.preventDefault();
        p.setShowGrid((g) => !g);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [p]);
}
