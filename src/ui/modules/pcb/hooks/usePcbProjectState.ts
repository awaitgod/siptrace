import { useCallback, useEffect, useState } from 'react';
import { HotkeyMap, PatternDef, PcbProject } from '../../../../core/types';
import {
  AppSettings,
  loadActivePcb,
  loadHotkeys,
  loadSettings,
  loadUserPatterns,
  saveActivePcb,
  subscribeEdaEvents
} from '../../../../core/store';

export interface PcbProjectStateHandle {
  pcb: PcbProject;
  history: PcbProject[];
  redoStack: PcbProject[];
  isDirty: boolean;
  settings: AppSettings;
  hotkeys: HotkeyMap;
  setHotkeys: React.Dispatch<React.SetStateAction<HotkeyMap>>;
  userPatterns: PatternDef[];
  commitPcb: (updater: (prev: PcbProject) => PcbProject, pushUndo?: boolean) => void;
  pushUndoSnapshot: (snapshot: PcbProject) => void;
  replacePcb: (next: PcbProject) => void;
  markPcbSaved: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
}

/** Manages PCB document state, undo/redo stacks, dirty flag, document title sync, and cross-tab events. */
export function usePcbProjectState(
  onExternalUpdateStatus: (msg: string) => void,
  onCrossprobeRefDes?: (refDes: string) => void
): PcbProjectStateHandle {
  const [pcb, setPcb] = useState<PcbProject>(() => loadActivePcb());
  const [history, setHistory] = useState<PcbProject[]>([]);
  const [redoStack, setRedoStack] = useState<PcbProject[]>([]);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [settings] = useState<AppSettings>(() => loadSettings());
  const [hotkeys, setHotkeys] = useState<HotkeyMap>(() => loadHotkeys());
  const [userPatterns, setUserPatterns] = useState<PatternDef[]>(() => loadUserPatterns());

  const commitPcb = useCallback((updater: (prev: PcbProject) => PcbProject, pushUndo = true) => {
    setPcb((prev) => {
      if (pushUndo) {
        setHistory((h) => [...h.slice(-29), prev]);
        setRedoStack([]);
        setIsDirty(true);
      }
      const next = updater(prev);
      saveActivePcb(next);
      return next;
    });
  }, []);

  const replacePcb = useCallback((next: PcbProject) => {
    setHistory([]);
    setRedoStack([]);
    setIsDirty(false);
    setPcb(next);
    saveActivePcb(next);
  }, []);

  const pushUndoSnapshot = useCallback((snapshot: PcbProject) => {
    setHistory((h) => [...h.slice(-29), snapshot]);
    setRedoStack([]);
    setIsDirty(true);
  }, []);

  const markPcbSaved = useCallback(() => {
    setIsDirty(false);
  }, []);

  useEffect(() => {
    const dirtyMark = isDirty ? ' *' : '';
    document.title = `Плата (PCB Layout) - [${pcb.projectName}${dirtyMark}] — SIPTrace`;
    saveActivePcb(pcb);
  }, [pcb, isDirty]);

  useEffect(() => {
    return subscribeEdaEvents((channel, payload: unknown) => {
      if (channel === 'pcb:updated' && payload) {
        replacePcb(payload as PcbProject);
        onExternalUpdateStatus('Плата синхронизирована со схемой.');
      } else if (channel === 'libraries:updated') {
        setUserPatterns(loadUserPatterns());
      } else if (channel === 'crossprobe:refdes' && (payload as { refDes?: string })?.refDes) {
        onCrossprobeRefDes?.((payload as { refDes: string }).refDes);
      }
    });
  }, [replacePcb, onExternalUpdateStatus, onCrossprobeRefDes]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setRedoStack((r) => [...r, pcb]);
    setPcb(prev);
    saveActivePcb(prev);
  }, [history, pcb]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setHistory((h) => [...h, pcb]);
    setPcb(next);
    saveActivePcb(next);
  }, [redoStack, pcb]);

  return {
    pcb,
    history,
    redoStack,
    isDirty,
    settings,
    hotkeys,
    setHotkeys,
    userPatterns,
    commitPcb,
    pushUndoSnapshot,
    replacePcb,
    markPcbSaved,
    handleUndo,
    handleRedo
  };
}
