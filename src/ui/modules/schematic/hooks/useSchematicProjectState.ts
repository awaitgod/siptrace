import { useCallback, useEffect, useMemo, useState } from 'react';
import { ComponentDef, PatternDef, SchematicProject, SchematicSheet } from '../../../../core/types';
import {
  AppSettings,
  loadActiveSchematic,
  loadHotkeys,
  loadSettings,
  loadUserComponents,
  loadUserPatterns,
  saveActiveSchematic,
  subscribeEdaEvents
} from '../../../../core/store';
import { backAnnotateSchematic } from '../../../../engines/netlist';

export interface UseSchematicProjectStateParams {
  setSelectedCompIds: React.Dispatch<React.SetStateAction<string[]>>;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
}

/** Manages schematic project state, undo/redo stacks, dirty flag, document title sync, and cross-tab events. */
export function useSchematicProjectState({
  setSelectedCompIds,
  setStatusMessage
}: UseSchematicProjectStateParams) {
  const [project, setProject] = useState<SchematicProject>(() => loadActiveSchematic());
  const [history, setHistory] = useState<SchematicProject[]>([]);
  const [redoStack, setRedoStack] = useState<SchematicProject[]>([]);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [hotkeys, setHotkeys] = useState(() => loadHotkeys());
  const [userComponents, setUserComponents] = useState<ComponentDef[]>(() => loadUserComponents());
  const [userPatterns, setUserPatterns] = useState<PatternDef[]>(() => loadUserPatterns());

  const activeSheet = useMemo(
    () => project.sheets.find((s) => s.id === project.activeSheetId) ?? project.sheets[0],
    [project]
  );

  const customCompMap = useMemo(() => {
    const map: Record<string, ComponentDef> = { ...(project.customComponentDefs ?? {}) };
    for (const c of userComponents) map[c.id] = c;
    return map;
  }, [project.customComponentDefs, userComponents]);

  const commitProject = useCallback(
    (updater: (prev: SchematicProject) => SchematicProject, pushUndo = true) => {
      setProject((prev) => {
        if (pushUndo) {
          setHistory((h) => [...h.slice(-29), prev]);
          setRedoStack([]);
          setIsDirty(true);
        }
        const next = updater(prev);
        saveActiveSchematic(next);
        return next;
      });
    },
    []
  );

  const replaceProject = useCallback((next: SchematicProject) => {
    setHistory([]);
    setRedoStack([]);
    setIsDirty(false);
    setProject(next);
    saveActiveSchematic(next);
  }, []);

  const pushUndoSnapshot = useCallback((snapshot: SchematicProject) => {
    setHistory((h) => [...h.slice(-29), snapshot]);
    setRedoStack([]);
    setIsDirty(true);
  }, []);

  const markProjectSaved = useCallback(() => {
    setIsDirty(false);
  }, []);

  const updateActiveSheet = useCallback(
    (sheetUpdater: (s: SchematicSheet) => SchematicSheet, pushUndo = true) => {
      commitProject((prev) => {
        const sheets = prev.sheets.map((s) => (s.id === prev.activeSheetId ? sheetUpdater(s) : s));
        return { ...prev, sheets };
      }, pushUndo);
    },
    [commitProject]
  );

  useEffect(() => {
    const tb = activeSheet.titleBlock;
    const dirtyMark = isDirty ? ' *' : '';
    document.title = `Схемотехника - [${tb.designation ? tb.designation + ' ' : ''}${project.projectName}${dirtyMark}] — SIPTrace`;
  }, [project.projectName, activeSheet.titleBlock, isDirty]);

  useEffect(() => {
    saveActiveSchematic(project);
  }, [project]);

  useEffect(() => {
    return subscribeEdaEvents((channel, payload: any) => {
      if (channel === 'libraries:updated') {
        setUserComponents(loadUserComponents());
        setUserPatterns(loadUserPatterns());
      } else if (channel === 'pcb:backannotate' && payload) {
        commitProject((prev) => backAnnotateSchematic(prev, payload));
        setStatusMessage('Обратная аннотация из платы применена.');
      } else if (channel === 'crossprobe:refdes' && payload?.refDes) {
        const comp = activeSheet.components.find((c) => c.refDes === payload.refDes);
        if (comp) {
          setSelectedCompIds([comp.id]);
          setStatusMessage(`Перекрёстный выбор с платы: ${comp.refDes}`);
        }
      }
    });
  }, [activeSheet.components, commitProject, setSelectedCompIds, setStatusMessage]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setRedoStack((r) => [...r, project]);
    setProject(prev);
    saveActiveSchematic(prev);
    setStatusMessage('Отмена последнего действия.');
  }, [history, project, setStatusMessage]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setHistory((h) => [...h, project]);
    setProject(next);
    saveActiveSchematic(next);
    setStatusMessage('Повтор действия.');
  }, [redoStack, project, setStatusMessage]);

  return {
    project,
    history,
    redoStack,
    isDirty,
    settings,
    setSettings,
    hotkeys,
    setHotkeys,
    userComponents,
    userPatterns,
    activeSheet,
    customCompMap,
    commitProject,
    pushUndoSnapshot,
    replaceProject,
    markProjectSaved,
    updateActiveSheet,
    handleUndo,
    handleRedo
  };
}
