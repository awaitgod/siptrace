import React, { useState } from 'react';
import { SchematicProject, SchematicSheet } from '../../../../core/types';
import { uid } from '../../../../core/geometry';
import { allIds, copyFragment, pasteFragment, selectionBounds, transformEntities } from '../../../../core/schematic/editing';
import { SHEET_FORMATS } from '../../../../gost/gostTitleBlock';
import { buildNextSchematicSheet } from '../services/schematicActionsService';
interface Props {
    project: SchematicProject;
    activeSheet: SchematicSheet;
    commitProject: (fn: (p: SchematicProject) => SchematicProject, undo?: boolean) => void;
}
export const SchematicSheetBar: React.FC<Props> = ({ project, activeSheet, commitProject }) => {
    const [manager, setManager] = useState(false), [error, setError] = useState('');
    const change = (fn: (p: SchematicProject) => SchematicProject) => commitProject(p => { const next = fn(p); return { ...next, sheets: next.sheets.map((s, i) => ({ ...s, titleBlock: { ...s.titleBlock, sheetNumber: i + 1, totalSheets: next.sheets.length } })) }; });
    const add = () => { const sheet = buildNextSchematicSheet(project, activeSheet); change(p => ({ ...p, activeSheetId: sheet.id, sheets: [...p.sheets, sheet] })); };
    return <div className="dt-sheet-bar"><div className="dt-sheet-tabs" role="tablist" aria-label="Листы схемы">{project.sheets.map(s => <button key={s.id} role="tab" aria-selected={s.id === activeSheet.id} className={`dt-sheet-tab ${s.id === activeSheet.id ? 'active' : ''}`} onClick={() => commitProject(p => ({ ...p, activeSheetId: s.id }), false)} onDoubleClick={() => setManager(true)} onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const i = project.sheets.findIndex(sh => sh.id === s.id), next = project.sheets[(i + (e.key === 'ArrowRight' ? 1 : project.sheets.length - 1)) % project.sheets.length];
        commitProject(p => ({ ...p, activeSheetId: next.id }), false);
    } }}>{s.name}</button>)}<button className="dt-btn" title="Добавить новый лист" onClick={add}>+</button><button className="dt-btn" onClick={() => setManager(true)}>Листы...</button></div><span>{SHEET_FORMATS[activeSheet.format].label}</span>
 {manager && <div className="dt-modal-backdrop" onClick={() => setManager(false)}><div className="dt-modal" style={{ width: 650 }} onClick={e => e.stopPropagation()}><div className="dt-modal-title"><span>Управление листами</span><button className="dt-btn" onClick={() => setManager(false)}>×</button></div><div className="dt-modal-body">{project.sheets.map((s, i) => <div key={s.id} style={{ display: 'flex', gap: 5, marginBottom: 6 }}><input aria-label={`Имя ${s.name}`} className="dt-input" value={s.name} onChange={e => change(p => ({ ...p, sheets: p.sheets.map(sh => sh.id === s.id ? { ...sh, name: e.target.value } : sh) }))}/><button className="dt-btn" disabled={!i} onClick={() => change(p => { const sheets = [...p.sheets]; [sheets[i - 1], sheets[i]] = [sheets[i], sheets[i - 1]]; return { ...p, sheets }; })}>↑</button><button className="dt-btn" disabled={i === project.sheets.length - 1} onClick={() => change(p => { const sheets = [...p.sheets]; [sheets[i + 1], sheets[i]] = [sheets[i], sheets[i + 1]]; return { ...p, sheets }; })}>↓</button><button className="dt-btn" onClick={() => { const source = copyFragment(project, s, allIds(s)); const fragment = pasteFragment(project, source, { x: 0, y: 0 }, project.customComponentDefs); const copy = { ...fragment.sheet, id: uid('sheet'), name: s.name + ' — копия' }; const b = selectionBounds(s, allIds(s), project.customComponentDefs); Object.assign(copy, transformEntities(copy, allIds(copy), { dx: b.minX, dy: b.minY, preserveConnections: false }, project.customComponentDefs)); change(p => ({ ...p, sheets: [...p.sheets, copy], activeSheetId: copy.id })); }}>Дублировать</button><button className="dt-btn" disabled={project.sheets.length === 1} onClick={() => { const refs = project.sheets.flatMap(sh => sh.hierarchyBlocks.filter(b => b.targetSheetId === s.id)); if (refs.length) {
        setError('Сначала переназначьте дочерний лист у блоков: ' + refs.map(b => b.name).join(', '));
        return;
    } change(p => ({ ...p, sheets: p.sheets.filter(sh => sh.id !== s.id), activeSheetId: p.activeSheetId === s.id ? p.sheets.find(sh => sh.id !== s.id)!.id : p.activeSheetId })); }}>Удалить</button></div>)}{error && <p role="alert">{error}</p>}<p>Связи листов: {project.sheets.flatMap(s => s.hierarchyBlocks.map(b => `${s.name} → ${project.sheets.find(sh => sh.id === b.targetSheetId)?.name ?? 'не найден'}`)).join('; ') || 'нет иерархических блоков'}</p></div><div className="dt-modal-footer"><button className="dt-btn" onClick={add}>Добавить лист</button><button className="dt-btn" onClick={() => setManager(false)}>Закрыть</button></div></div></div>}
 </div>;
};
