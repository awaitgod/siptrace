import { Dispatch, SetStateAction, useEffect, useRef } from 'react';
import { SchematicProject } from '../../../../core/types';
import { broadcastEdaEvent, subscribeEdaEvents } from '../../../../core/store';

interface Params {
    project: SchematicProject;
    selectedIds: string[];
    setSelectedIds: Dispatch<SetStateAction<string[]>>;
    commitProject: (updater: (p: SchematicProject) => SchematicProject, undo?: boolean) => void;
}
/** A received cross-probe is never broadcast back; local input cancels queued remote selection. */
export function useSchematicCrossprobe(p: Params): void {
    const latest = useRef(p); latest.current = p;
    const remoteSelection = useRef<string | null>(null);
    const lastSent = useRef<string | null>(null);
    const inputRevision = useRef(0);
    const lastInput = useRef(-Infinity);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        const localInput = () => {
            inputRevision.current++;
            lastInput.current = performance.now();
            if (timer.current !== null) clearTimeout(timer.current);
            timer.current = null;
        };
        window.addEventListener('pointerdown', localInput, true);
        window.addEventListener('keydown', localInput, true);
        const unsubscribe = subscribeEdaEvents((channel, payload: any) => {
            if (channel !== 'crossprobe:refdes' || !payload?.refDes || payload.source === 'schematic' || payload.target === 'pcb') return;
            if (document.hasFocus() && performance.now() - lastInput.current < 1000) return;
            const current = latest.current;
            const sheet = current.project.sheets.find(s => s.components.some(c => c.refDes === payload.refDes));
            const component = sheet?.components.find(c => c.refDes === payload.refDes);
            if (!sheet || !component || (sheet.id === current.project.activeSheetId && current.selectedIds.length === 1 && current.selectedIds[0] === component.id)) return;
            if (timer.current !== null) clearTimeout(timer.current);
            const revision = inputRevision.current;
            if (sheet.id !== current.project.activeSheetId) current.commitProject(p => ({ ...p, activeSheetId: sheet.id }), false);
            timer.current = setTimeout(() => {
                timer.current = null;
                if (inputRevision.current !== revision || !latest.current.project.sheets.some(s => s.id === sheet.id && s.components.some(c => c.id === component.id))) return;
                remoteSelection.current = component.id;
                latest.current.setSelectedIds([component.id]);
                window.dispatchEvent(new CustomEvent('siptrace:crossprobe', { detail: { x: component.x, y: component.y } }));
            }, 0);
        });
        return () => {
            unsubscribe();
            window.removeEventListener('pointerdown', localInput, true);
            window.removeEventListener('keydown', localInput, true);
            if (timer.current !== null) clearTimeout(timer.current);
        };
    }, []);
    useEffect(() => {
        const sheet = p.project.sheets.find(s => s.id === p.project.activeSheetId);
        const component = p.selectedIds.length === 1 ? sheet?.components.find(c => c.id === p.selectedIds[0]) : undefined;
        const key = component ? `${sheet!.id}:${component.id}:${component.refDes}` : null;
        if (remoteSelection.current === component?.id) {
            remoteSelection.current = null;
            lastSent.current = key;
            return;
        }
        remoteSelection.current = null;
        if (key === lastSent.current) return;
        lastSent.current = key;
        if (component) broadcastEdaEvent('crossprobe:refdes', { refDes: component.refDes, source: 'schematic', target: 'pcb' });
    }, [p.selectedIds, p.project]);
}
