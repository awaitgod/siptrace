import { useCallback, useEffect, useRef, useState } from 'react';
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

  const pcbRef = useRef<PcbProject>(pcb);
  const historyRef = useRef<PcbProject[]>(history);
  const redoRef = useRef<PcbProject[]>(redoStack);
  pcbRef.current = pcb;
  historyRef.current = history;
  redoRef.current = redoStack;

  const commitPcb = useCallback((updater: (prev: PcbProject) => PcbProject, pushUndo = true) => {
    const prev = pcbRef.current;
    const next = updater(prev);
    if (next === prev) return;
    if (pushUndo) {
      const nextHist = [...historyRef.current.slice(-29), prev];
      historyRef.current = nextHist;
      redoRef.current = [];
      setHistory(nextHist);
      setRedoStack([]);
      setIsDirty(true);
    }
    pcbRef.current = next;
    setPcb(next);
    saveActivePcb(next);
  }, []);

  const replacePcb = useCallback((next: PcbProject) => {
    historyRef.current = [];
    redoRef.current = [];
    pcbRef.current = next;
    setHistory([]);
    setRedoStack([]);
    setIsDirty(false);
    setPcb(next);
    saveActivePcb(next);
  }, []);

  const pushUndoSnapshot = useCallback((snapshot: PcbProject) => {
    const nextHist = [...historyRef.current.slice(-29), snapshot];
    historyRef.current = nextHist;
    redoRef.current = [];
    setHistory(nextHist);
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
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current[historyRef.current.length - 1];
    const nextHist = historyRef.current.slice(0, -1);
    const nextRedo = [...redoRef.current, pcbRef.current];
    historyRef.current = nextHist;
    redoRef.current = nextRedo;
    pcbRef.current = prev;
    setHistory(nextHist);
    setRedoStack(nextRedo);
    setPcb(prev);
    saveActivePcb(prev);
  }, []);

  const handleRedo = useCallback(() => {
    if (redoRef.current.length === 0) return;
    const next = redoRef.current[redoRef.current.length - 1];
    const nextRedo = redoRef.current.slice(0, -1);
    const nextHist = [...historyRef.current, pcbRef.current];
    historyRef.current = nextHist;
    redoRef.current = nextRedo;
    pcbRef.current = next;
    setRedoStack(nextRedo);
    setHistory(nextHist);
    setPcb(next);
    saveActivePcb(next);
  }, []);

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
