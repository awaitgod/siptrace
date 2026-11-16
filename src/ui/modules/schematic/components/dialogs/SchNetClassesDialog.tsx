import React, { useState } from 'react';
import { NetClassDef } from '../../../../../core/types';
export const SchNetClassesDialog: React.FC<{
    netClasses: NetClassDef[];
    onSave: (classes: NetClassDef[]) => void;
    onClose: () => void;
}> = ({ netClasses, onSave, onClose }) => {
    const [classes, setClasses] = useState(structuredClone(netClasses)), [error, setError] = useState('');
    const keys = ['name', 'traceWidth', 'clearance', 'viaOuterDiameter', 'viaHoleDiameter'] as const;
    return <div className="dt-modal-backdrop" onClick={onClose}><div className="dt-modal" style={{ width: 760 }} onClick={e => e.stopPropagation()}><div className="dt-modal-title"><span>Классы цепей (Net Classes)</span><button className="dt-btn" onClick={onClose}>×</button></div><div className="dt-modal-body"><table className="dt-table"><thead><tr>{['Название', 'Ширина, мм', 'Зазор, мм', 'Диаметр перехода, мм', 'Сверло, мм', ''].map((t, idx) => <th key={idx} style={idx === 0 ? { minWidth: 210 } : undefined}>{t}</th>)}</tr></thead><tbody>{classes.map((nc, i) => <tr key={nc.id}>{keys.map(k => <td key={k}><input aria-label={`${nc.name}: ${k}`} className="dt-input" style={{ width: '100%' }} type={k === 'name' ? 'text' : 'number'} step="any" value={nc[k]} onChange={e => setClasses(c => c.map((r, j) => i === j ? { ...r, [k]: k === 'name' ? e.target.value : Number(e.target.value) } : r))}/></td>)}<td><button className="dt-btn" title="Удалить класс" disabled={i === 0 || classes.length <= 1} style={{ minWidth: 24, padding: '0 4px' }} onClick={() => setClasses(c => c.filter((_, j) => j !== i))}>×</button></td></tr>)}</tbody></table><button className="dt-btn" onClick={() => setClasses(c => [...c, { id: crypto.randomUUID(), name: `Класс ${c.length + 1}`, traceWidth: .25, minWidth: .15, maxWidth: 5, clearance: .2, viaOuterDiameter: .7, viaHoleDiameter: .35 }])}>Добавить класс</button>{error && <p role="alert">{error}</p>}</div><div className="dt-modal-footer"><button className="dt-btn primary" onClick={() => { if (classes.some(n => !n.name.trim() || ![n.traceWidth, n.clearance, n.viaOuterDiameter, n.viaHoleDiameter].every(v => Number.isFinite(v) && v > 0) || n.viaHoleDiameter >= n.viaOuterDiameter)) {
        setError('Проверьте имена и размеры: сверло должно быть меньше диаметра перехода.');
        return;
    } onSave(classes); }}>Сохранить</button><button className="dt-btn" onClick={onClose}>Закрыть</button></div></div></div>;
};
