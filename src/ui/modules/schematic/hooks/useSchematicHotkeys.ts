import { useEffect } from 'react';
import { HotkeyMap, Point2D, SchematicSheet } from '../../../../core/types';
import { matchesHotkey } from '../../../../core/store';
import { commitWire } from '../../../../core/schematic/editing';
import { SchToolId } from '../types';
interface Params {
    hotkeys: HotkeyMap;
    tool: SchToolId;
    wireDraftPts: Point2D[];
    setWireDraftPts: React.Dispatch<React.SetStateAction<Point2D[]>>;
    setTool: React.Dispatch<React.SetStateAction<SchToolId>>;
    setElbowFlip: React.Dispatch<React.SetStateAction<boolean>>;
    updateActiveSheet: (fn: (s: SchematicSheet) => SchematicSheet, undo?: boolean) => void;
    handleNewProject: () => void;
    handleOpenFile: () => void;
    handleUndo: () => void;
    handleRedo: () => void;
    handleSaveFile: () => void;
    handleSaveAs: () => void;
    handleConvertToPcb: () => void;
    deleteSelection: () => void;
    rotateSelection: () => void;
    flipSelection: (axis: 'X' | 'Y') => void;
    zoomToFit: () => void;
    handleRunErc: () => void;
    onCopy: () => void;
    onCut: () => void;
    onPaste: () => void;
    onDuplicate: () => void;
    onSelectAll: () => void;
    onProperties: () => void;
    onPrint: () => void;
    onFind: () => void;
    onGrid: () => void;
    onZoom: (factor: number) => void;
    onNudge: (x: number, y: number) => void;
}
export function useSchematicHotkeys(p: Params) {
    useEffect(() => {
        const handle = (e: KeyboardEvent) => {
            if (document.querySelector('.dt-modal-backdrop'))
                return;
            const target = e.target as HTMLElement;
            const input = target?.matches('input, textarea, select, [contenteditable="true"]');
            if (input) {
                if (matchesHotkey(e, p.hotkeys.save)) {
                    e.preventDefault();
                    target.blur();
                    p.handleSaveFile();
                }
                else if (matchesHotkey(e, p.hotkeys.saveAs)) {
                    e.preventDefault();
                    target.blur();
                    p.handleSaveAs();
                }
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                window.dispatchEvent(new Event('siptrace:cancel'));
                return;
            }
            if (e.key === 'Enter' && ['wire', 'bus'].includes(p.tool) && p.wireDraftPts.length > 1) {
                e.preventDefault();
                p.updateActiveSheet(s => commitWire(s, p.wireDraftPts, p.tool === 'bus'));
                p.setWireDraftPts([]);
                p.setTool('select');
                return;
            }
            if (e.key === 'Backspace' && p.wireDraftPts.length) {
                e.preventDefault();
                p.setWireDraftPts(v => v.slice(0, -1));
                return;
            }
            if ((e.key === ' ' || e.key === 'Enter') && target?.closest('button,a,[role="button"],[role^="menuitem"]'))
                return;
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                p.deleteSelection();
                return;
            }
            if (e.key === ' ') {
                e.preventDefault();
                if (p.wireDraftPts.length)
                    p.setElbowFlip(v => !v);
                else
                    p.rotateSelection();
                return;
            }
            if (e.key.startsWith('Arrow')) {
                e.preventDefault();
                const step = e.shiftKey ? 10 : 1;
                p.onNudge((e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0) * step, (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0) * step);
                return;
            }
            const commands: Record<string, () => void> = {
                selectTool: () => window.dispatchEvent(new Event('siptrace:cancel')), undo: p.handleUndo, redo: p.handleRedo, save: p.handleSaveFile, saveAs: p.handleSaveAs, print: p.onPrint,
                find: p.onFind, convertToPcb: p.handleConvertToPcb, selectAll: p.onSelectAll, copy: p.onCopy, cut: p.onCut, paste: p.onPaste, duplicate: p.onDuplicate, properties: p.onProperties,
                rotate: p.rotateSelection, flipX: () => p.flipSelection('X'), flipY: () => p.flipSelection('Y'), placeWire: () => p.setTool('wire'), placeBus: () => p.setTool('bus'), placePort: () => p.setTool('netPort'),
                placeComponent: () => p.setTool('placeComp'), placeText: () => p.setTool('shapeText'), placeJunction: () => p.setTool('junction'), placeBusTap: () => p.setTool('busTap'), placeCircle: () => p.setTool('shapeCircle'), noConnect: () => p.setTool('noConnect'),
                zoomFit: p.zoomToFit, zoomIn: () => p.onZoom(1.15), zoomOut: () => p.onZoom(1 / 1.15), runCheck: p.handleRunErc, toggleGrid: p.onGrid
            };
            for (const [id, run] of Object.entries(commands))
                if (matchesHotkey(e, p.hotkeys[id])) {
                    e.preventDefault();
                    if (!e.repeat || ['zoomIn', 'zoomOut'].includes(id))
                        run();
                    return;
                }
            if (e.ctrlKey && e.code === 'KeyN') {
                e.preventDefault();
                p.handleNewProject();
            }
            if (e.ctrlKey && e.code === 'KeyO') {
                e.preventDefault();
                p.handleOpenFile();
            }
        };
        window.addEventListener('keydown', handle);
        return () => window.removeEventListener('keydown', handle);
    }, [p]);
}
