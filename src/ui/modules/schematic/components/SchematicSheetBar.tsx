import React, { useLayoutEffect, useRef, useState } from 'react';
import { SchematicProject, SchematicSheet } from '../../../../core/types';
import { SHEET_FORMATS } from '../../../../gost/gostTitleBlock';
import { buildNextSchematicSheet } from '../services/schematicActionsService';
import { SchematicSheetsDialog } from './dialogs/SchematicSheetsDialog';

interface Props {
    project: SchematicProject;
    activeSheet: SchematicSheet;
    commitProject: (fn: (p: SchematicProject) => SchematicProject, undo?: boolean) => void;
}

export const schematicSheetPanelId = 'schematic-sheet-panel';
export const schematicSheetTabId = (id: string) => `schematic-sheet-tab-${id}`;
export const schematicSheetLabel = (name: string) => name.replace(/^Sheet (\d+)$/, 'Лист $1');

export function SchematicSheetBar({ project, activeSheet, commitProject }: Props) {
    const [manager, setManager] = useState(false);
    const tabs = useRef<HTMLDivElement>(null);
    const change = (update: (p: SchematicProject) => SchematicProject) => {
        commitProject(p => {
            const next = update(p);
            return {
                ...next,
                sheets: next.sheets.map((s, i) => ({
                    ...s,
                    titleBlock: { ...s.titleBlock, sheetNumber: i + 1, totalSheets: next.sheets.length }
                }))
            };
        });
    };
    const add = () => {
        const sheet = buildNextSchematicSheet(project, activeSheet);
        change(p => ({ ...p, activeSheetId: sheet.id, sheets: [...p.sheets, sheet] }));
    };
    const select = (id: string) => commitProject(p => ({ ...p, activeSheetId: id }), false);
    useLayoutEffect(() => {
        tabs.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [activeSheet.id]);

    const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
        const count = project.sheets.length;
        const destinations: Record<string, number> = {
            ArrowRight: (index + 1) % count,
            ArrowLeft: (index + count - 1) % count,
            Home: 0,
            End: count - 1
        };
        const destination = destinations[e.key];
        if (typeof destination !== 'number') return;
        e.preventDefault();
        select(project.sheets[destination].id);
        tabs.current?.querySelectorAll('button')[destination]?.focus();
    };

    return (
        <div className="dt-sheet-bar">
            <div className="dt-sheet-tabs" style={{ minWidth: 0 }}>
                <div className="dt-sheet-tabs" ref={tabs} role="tablist" aria-label="Листы схемы"
                    style={{ overflow: 'auto', scrollbarWidth: 'none', alignItems: 'flex-end' }}>
                    {project.sheets.map((sheet, index) => {
                        const active = sheet.id === activeSheet.id;
                        return <button key={sheet.id} id={schematicSheetTabId(sheet.id)}
                            role="tab" aria-selected={active} aria-controls={schematicSheetPanelId}
                            tabIndex={active ? 0 : -1} className={`dt-sheet-tab ${active ? 'active' : ''}`}
                            style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                            onClick={() => select(sheet.id)} onDoubleClick={() => setManager(true)}
                            onKeyDown={e => onTabKeyDown(e, index)}>{schematicSheetLabel(sheet.name)}</button>;
                    })}
                </div>
                <button className="dt-btn" title="Добавить новый лист" aria-label="Добавить новый лист" onClick={add}>+</button>
                <button className="dt-btn" onClick={() => setManager(true)}>Листы...</button>
            </div>
            <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{SHEET_FORMATS[activeSheet.format].label}</span>
            {manager && <SchematicSheetsDialog project={project} activeSheet={activeSheet} onSelect={id => { select(id); setManager(false); }}
                onChange={change} onAdd={add} onClose={() => setManager(false)}/>}
        </div>
    );
}
