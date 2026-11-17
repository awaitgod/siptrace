import { useState } from 'react';
import { duplicateSchematicSheet } from '../../../../../core/schematic/editing';
import { SchematicProject, SchematicSheet } from '../../../../../core/types';

interface Props {
    project: SchematicProject;
    activeSheet: SchematicSheet;
    onChange: (update: (p: SchematicProject) => SchematicProject) => void;
    onAdd: () => void;
    onSelect: (id: string) => void;
    onClose: () => void;
}

export function SchematicSheetsDialog({ project, activeSheet, onChange, onAdd, onSelect, onClose }: Props) {
    const [error, setError] = useState('');

    const move = (index: number, offset: -1 | 1) => {
        onChange(p => {
            const sheets = [...p.sheets];
            [sheets[index], sheets[index + offset]] = [sheets[index + offset], sheets[index]];
            return { ...p, sheets };
        });
    };
    const duplicate = (sheet: SchematicSheet) => {
        const copy = duplicateSchematicSheet(project, sheet);
        onChange(p => ({ ...p, sheets: [...p.sheets, copy], activeSheetId: copy.id }));
    };
    const remove = (sheet: SchematicSheet) => {
        const references = project.sheets.flatMap(s => s.hierarchyBlocks.filter(b => b.targetSheetId === sheet.id));
        if (references.length) {
            setError('Сначала переназначьте дочерний лист у блоков: ' + references.map(b => b.name).join(', '));
            return;
        }
        setError('');
        onChange(p => {
            const sheets = p.sheets.filter(s => s.id !== sheet.id);
            return { ...p, sheets, activeSheetId: p.activeSheetId === sheet.id ? sheets[0].id : p.activeSheetId };
        });
    };
    const links = project.sheets.flatMap(s => s.hierarchyBlocks
        .map(b => `${s.name} → ${project.sheets.find(sh => sh.id === b.targetSheetId)?.name ?? 'не найден'}`));

    return (
        <div className="dt-modal-backdrop" onClick={onClose}>
            <div className="dt-modal" role="dialog" aria-modal="true" aria-label="Управление листами" style={{ width: 650 }}
                onClick={e => e.stopPropagation()}>
                <div className="dt-modal-title">
                    <span>Управление листами</span>
                    <button className="dt-btn" aria-label="Закрыть окно управления листами" onClick={onClose}>×</button>
                </div>
                <div className="dt-modal-body">
                    {project.sheets.map((sheet, index) => (
                        <div key={sheet.id} style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                            <input aria-label={`Имя листа ${index + 1}`} className="dt-input" value={sheet.name}
                                onChange={e => {
                                    const name = e.target.value;
                                    onChange(p => ({ ...p, sheets: p.sheets.map(s => s.id === sheet.id ? { ...s, name } : s) }));
                                }}/>
                            <button className="dt-btn" disabled={sheet.id === activeSheet.id} aria-label={`Открыть лист ${index + 1}`}
                                onClick={() => onSelect(sheet.id)}>Открыть</button>
                            <button className="dt-btn" disabled={index === 0} aria-label={`Поднять лист ${index + 1}`}
                                onClick={() => move(index, -1)}>↑</button>
                            <button className="dt-btn" disabled={index === project.sheets.length - 1} aria-label={`Опустить лист ${index + 1}`}
                                onClick={() => move(index, 1)}>↓</button>
                            <button className="dt-btn" aria-label={`Дублировать лист ${index + 1}`}
                                onClick={() => duplicate(sheet)}>Дублировать</button>
                            <button className="dt-btn" disabled={project.sheets.length === 1} aria-label={`Удалить лист ${index + 1}`}
                                onClick={() => remove(sheet)}>Удалить</button>
                        </div>
                    ))}
                    {error && <p role="alert">{error}</p>}
                    {links.length > 0 && <p>Связи листов: {links.join('; ')}</p>}
                </div>
                <div className="dt-modal-footer">
                    <button className="dt-btn" onClick={onAdd}>Добавить лист</button>
                    <button className="dt-btn" onClick={onClose}>Закрыть</button>
                </div>
            </div>
        </div>
    );
}
