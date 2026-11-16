import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ComponentDef, PatternDef, SchematicProject, SchematicSheet } from '../../../../core/types';
import { AppSettings, loadActiveSchematic, loadHotkeys, loadSettings, loadUserComponents, loadUserPatterns, saveActiveSchematic, subscribeEdaEvents, STORAGE_KEYS } from '../../../../core/store';
import { backAnnotateSchematic } from '../../../../engines/netlist';
import { validateSchematic } from '../../../../core/schematic/validation';
interface DocumentState {
    project: SchematicProject;
    history: SchematicProject[];
    redo: SchematicProject[];
    saved: string;
    group?: string;
}
let session: DocumentState | undefined;
const stamp = (p: SchematicProject) => JSON.stringify({ ...p, activeSheetId: '', filePath: '' });
type Action = {
    type: 'commit';
    updater: (p: SchematicProject) => SchematicProject;
    undo: boolean;
    group?: string;
} | {
    type: 'replace';
    project: SchematicProject;
} | {
    type: 'undo' | 'redo' | 'save';
} | {
    type: 'snapshot';
    project: SchematicProject;
};
function reducer(s: DocumentState, a: Action): DocumentState {
    if (a.type === 'replace')
        return { project: a.project, history: [], redo: [], saved: stamp(a.project) };
    if (a.type === 'save')
        return { ...s, saved: stamp(s.project), group: undefined };
    if (a.type === 'snapshot')
        return stamp(a.project) === stamp(s.project) ? s : { ...s, history: [...s.history.slice(-99), a.project], redo: [], group: undefined };
    if (a.type === 'commit') {
        const project = a.updater(s.project);
        if (JSON.stringify(project) === JSON.stringify(s.project))
            return s;
        return { ...s, project, history: a.undo && (!a.group || a.group !== s.group) ? [...s.history.slice(-99), s.project] : s.history, redo: a.undo ? [] : s.redo, group: a.group };
    }
    if (a.type === 'undo' && s.history.length)
        return { ...s, project: s.history.at(-1)!, history: s.history.slice(0, -1), redo: [...s.redo, s.project], group: undefined };
    if (a.type === 'redo' && s.redo.length)
        return { ...s, project: s.redo.at(-1)!, redo: s.redo.slice(0, -1), history: [...s.history, s.project], group: undefined };
    return s;
}
export interface UseSchematicProjectStateParams {
    setSelectedCompIds: React.Dispatch<React.SetStateAction<string[]>>;
    setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
}
export function useSchematicProjectState({ setSelectedCompIds, setStatusMessage }: UseSchematicProjectStateParams) {
    const [state, dispatch] = useReducer(reducer, undefined, () => {
        let project: SchematicProject;
        try {
            project = loadActiveSchematic();
        }
        catch (error) {
            throw new Error(`Не удалось восстановить схему: ${String(error)}`);
        }
        return session && JSON.stringify(session.project) === JSON.stringify(project) ? session : { project, history: [], redo: [], saved: stamp(project) };
    });
    const { project, history, redo: redoStack } = state;
    const isDirty = stamp(project) !== state.saved;
    const editGroup=useRef(0);
    useEffect(()=>{const focus=()=>{editGroup.current++;};window.addEventListener('focusin',focus);return()=>window.removeEventListener('focusin',focus);},[]);
    const stateRef = useRef(state);
    stateRef.current = state;
    const [settings, setSettings] = useState<AppSettings>(loadSettings);
    const [hotkeys, setHotkeys] = useState(loadHotkeys);
    const [userComponents, setUserComponents] = useState<ComponentDef[]>(loadUserComponents);
    const [userPatterns, setUserPatterns] = useState<PatternDef[]>(loadUserPatterns);
    const [autosaveStatus, setAutosaveStatus] = useState('Локальная копия загружена');
    const activeSheet = useMemo(() => project.sheets.find(s => s.id === project.activeSheetId) ?? project.sheets[0], [project]);
    const customCompMap = useMemo(() => ({ ...Object.fromEntries(userComponents.map(c => [c.id, c])), ...project.customComponentDefs }), [userComponents, project.customComponentDefs]);
    const commitProject = useCallback((updater: (p: SchematicProject) => SchematicProject, pushUndo = true) => {
        const el = document.activeElement as HTMLElement | null;
        const group = el?.matches('input,textarea') && el.closest('.dt-right-sidebar') ? `field:${el.closest('.dt-prop-row')?.textContent}:${editGroup.current}` : undefined;
        dispatch({ type: 'commit', updater, undo: pushUndo, group });
    }, []);
    const replaceProject = useCallback((p: SchematicProject) => { dispatch({ type: 'replace', project: validateSchematic(p) }); setSelectedCompIds([]); }, [setSelectedCompIds]);
    const pushUndoSnapshot = useCallback((p: SchematicProject) => dispatch({ type: 'snapshot', project: p }), []);
    const markProjectSaved = useCallback(() => dispatch({ type: 'save' }), []);
    const updateActiveSheet = useCallback((updater: (s: SchematicSheet) => SchematicSheet, undo = true) => commitProject(p => ({ ...p, sheets: p.sheets.map(s => s.id === p.activeSheetId ? updater(s) : s) }), undo), [commitProject]);
    useEffect(() => {
        session = state;
        const timer = window.setTimeout(() => {
            const ok = saveActiveSchematic(state.project);
            setAutosaveStatus(ok ? `Локальная копия: ${new Date().toLocaleTimeString('ru-RU')}` : 'ОШИБКА автосохранения — сохраните схему в файл');
            if (!ok)
                setStatusMessage('Недостаточно места для автосохранения. Сохраните схему в файл (Ctrl+S).');
        }, 250);
        return () => { clearTimeout(timer); };
    }, [state, setStatusMessage]);
    useEffect(() => () => { session = stateRef.current; saveActiveSchematic(stateRef.current.project); }, []);
    useEffect(() => {
        document.title = `Схемотехника - [${activeSheet.titleBlock.designation || ''} ${project.projectName}${isDirty ? ' *' : ''}] — SIPTrace`;
        const beforeUnload = (e: BeforeUnloadEvent) => { saveActiveSchematic(stateRef.current.project); if (stamp(stateRef.current.project) !== stateRef.current.saved) {
            e.preventDefault();
            e.returnValue = '';
        } };
        window.addEventListener('beforeunload', beforeUnload);
        return () => window.removeEventListener('beforeunload', beforeUnload);
    }, [activeSheet.titleBlock, project.projectName, isDirty]);
    useEffect(() => subscribeEdaEvents((channel, payload: any) => {
        if (channel === 'libraries:updated') {
            setUserComponents(loadUserComponents());
            setUserPatterns(loadUserPatterns());
        }
        if (channel === 'pcb:backannotate' && payload) {
            commitProject(p => backAnnotateSchematic(p, payload));
            setStatusMessage('Обратная аннотация применена.');
        }

    }), [commitProject, setSelectedCompIds, setStatusMessage]);
    const handleUndo = useCallback(() => dispatch({ type: 'undo' }), []);
    const handleRedo = useCallback(() => dispatch({ type: 'redo' }), []);
    return { project, history, redoStack, isDirty, settings, setSettings, hotkeys, setHotkeys, userComponents, userPatterns, activeSheet, customCompMap, commitProject, replaceProject, pushUndoSnapshot, markProjectSaved, updateActiveSheet, handleUndo, handleRedo, autosaveStatus };
}
