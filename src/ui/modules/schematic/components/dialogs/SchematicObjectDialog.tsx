import { generateGostBom } from '../../../../../gost/gostBom';
import React, { useState } from 'react';
import { ComponentDef, SchematicProject, SchematicSheet } from '../../../../../core/types';
import { findEntity, transformEntities } from '../../../../../core/schematic/editing';
import { ALL_GOST_PATTERNS } from '../../../../../gost/libraries/gostPatterns';
interface Props {
    project: SchematicProject;
    sheet: SchematicSheet;
    ids: string[];
    defs: Record<string, ComponentDef>;
    onApply: (sheet: SchematicSheet) => void;
    onClose: () => void;
}
const names: Record<string, string> = { x: 'X, мм', y: 'Y, мм', x1: 'X начала, мм', y1: 'Y начала, мм', x2: 'X конца, мм', y2: 'Y конца, мм', cx: 'Центр X, мм', cy: 'Центр Y, мм', w: 'Ширина, мм', h: 'Высота, мм', r: 'Радиус, мм', size: 'Размер текста, мм', width: 'Толщина линии, мм', angle: 'Угол, °', refDes: 'Позиционное обозначение', value: 'Номинал', typeName: 'Тип / модель', patternId: 'Посадочное место', showRefDes: 'Показывать обозначение', showValue: 'Показывать номинал', labelAngle: 'Угол подписей, °', autoPower: 'Подключать выводы питания автоматически', doNotMount: 'Не устанавливать', netName: 'Имя цепи', netClassId: 'Класс цепи', style: 'Вид порта', busName: 'Имя шины', signalName: 'Сигнал шины', pairName: 'Имя диффпары', posNet: 'Положительная цепь', negNet: 'Отрицательная цепь', name: 'Название блока', targetSheetId: 'Дочерний лист', text: 'Текст', rowHeight: 'Высота строки, мм', bold: 'Полужирный', italic: 'Курсив', fill: 'Заливка', color: 'Цвет' };
export const SchematicObjectDialog: React.FC<Props> = ({ project, sheet, ids, defs, onApply, onClose }) => {
    const entities = ids.map(id => findEntity(sheet, id)).filter(Boolean);
    const label = ids.length === 1 ? /^(refDes|value)@(.+)$/.exec(ids[0]) : null;
    const labelComp = label ? sheet.components.find(c => c.id === label[2]) : null;
    const first = entities[0];
    const [draft, setDraft] = useState<Record<string, any>>(() => labelComp ? { [label![1]]: labelComp[label![1] as 'refDes' | 'value'], labelAngle: labelComp.labelAngle ?? 0, x: labelComp.x + (label![1] === 'refDes' ? labelComp.refDesOffset : labelComp.valueOffset).x, y: labelComp.y + (label![1] === 'refDes' ? labelComp.refDesOffset : labelComp.valueOffset).y } : { ...(first?.object as Record<string, any>), ...(first?.kind === 'components' ? { labelAngle: (first.object as any).labelAngle ?? 0 } : {}) });
    const [changed, setChanged] = useState<Set<string>>(new Set());
    const [error, setError] = useState('');
    const set = (key: string, value: any) => { setDraft(d => ({ ...d, [key]: value })); setChanged(c => new Set([...c, key])); };
    const fields = labelComp ? Object.keys(draft) : Object.keys(names).filter(k => {
        if (entities.length > 1 && k === 'refDes') return false;
        const hasKey = (ent: NonNullable<typeof first>) =>
            k in ent.object
            || (ent.kind === 'components' && ['showRefDes', 'showValue', 'labelAngle', 'autoPower', 'doNotMount'].includes(k))
            || (ent.kind === 'wires' && k === 'netClassId');
        return entities.length > 0 && entities.every((e) => e && hasKey(e));
    });
    const save = () => {
        try {
            if (changed.has('refDes') && (!/^#?[A-Za-zА-Яа-я_]+\d*$/.test(draft.refDes) || project.sheets.some(s => s.components.some(c => !ids.includes(c.id) && c.refDes === draft.refDes && (c.componentDefId !== draft.componentDefId || c.partIndex === draft.partIndex)))))
                throw new Error('Недопустимое или занятое позиционное обозначение.');
            for (const key of changed)
                if (typeof draft[key] === 'number' && !Number.isFinite(draft[key]))
                    throw new Error('Введите конечное числовое значение.');
            for (const key of ['size', 'width', 'w', 'h', 'r', 'rowHeight'])
                if (changed.has(key) && draft[key] <= 0)
                    throw new Error('Размеры должны быть больше нуля.');
            if (draft.targetSheetId === sheet.id)
                throw new Error('Блок должен ссылаться на другой лист.');
            if (first?.kind === 'hierarchyBlocks' && draft.targetSheetId) {
                const visited = new Set<string>();
                const reaches = (id: string): boolean => { if (id === sheet.id)
                    return true; if (visited.has(id))
                    return false; visited.add(id); return project.sheets.find(s => s.id === id)?.hierarchyBlocks.some(b => reaches(b.targetSheetId)) ?? false; };
                if (reaches(draft.targetSheetId))
                    throw new Error('Циклическая иерархия листов.');
            }
            if (draft.rows && (!draft.rows.length || !draft.colWidths.length || draft.colWidths.some((n: number) => !Number.isFinite(n) || n <= 0)))
                throw new Error('Задайте строки и положительные ширины колонок.');
            let next = structuredClone(sheet);
            if (labelComp) {
                const key = label![1] === 'refDes' ? 'refDesOffset' : 'valueOffset';
                next = { ...sheet, components: sheet.components.map(c => c.id === labelComp.id ? { ...c, [label![1]]: draft[label![1]], labelAngle: draft.labelAngle, [key]: { x: draft.x - c.x, y: draft.y - c.y } } : c) };
            }
            else {
                for (const { kind, object } of entities as NonNullable<typeof first>[]) {
                    if (kind === 'components' || kind === 'netPorts') {
                        const dx = changed.has('x') ? Number(draft.x) - object.x : 0, dy = changed.has('y') ? Number(draft.y) - object.y : 0;
                        const angle = changed.has('angle') ? Number(draft.angle) - object.angle : 0;
                        next = transformEntities(next, [object.id], { dx, dy, rotate: angle, origin: { x: object.x, y: object.y } }, defs);
                    }
                    (next as any)[kind] = (next as any)[kind].map((o: any) => o.id === object.id ? { ...o, ...Object.fromEntries([...changed].filter(k => !(kind === 'components' || kind === 'netPorts') || !['x', 'y', 'angle'].includes(k)).map(k => [k, draft[k]])) } : o);
                }
            }
            onApply(next);
        }
        catch (e) {
            setError((e as Error).message);
        }
    };
    const nets = [...new Set(sheet.wires.map(w => w.netName).filter(Boolean))];
    if (!first && !labelComp) return null;
    return <div className="dt-modal-backdrop"><div className="dt-modal" role="dialog" aria-modal="true" aria-label="Свойства объектов" style={{ width: 550 }}>
    <div className="dt-modal-title"><span>Свойства {ids.length > 1 ? `выделения (${ids.length})` : labelComp ? 'подписи' : 'объекта'}</span><button className="dt-btn" onClick={onClose}>×</button></div>
    <div className="dt-modal-body" style={{ maxHeight: '65vh', overflow: 'auto' }}>
      {ids.length > 1 && <p>Изменяются только отредактированные поля. Координаты задаются для каждого объекта.</p>}
      {fields.map(key => <label key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 6 }}>{names[key] ?? key}
        {typeof draft[key] === 'boolean' || ['showRefDes', 'showValue', 'autoPower', 'doNotMount', 'bold', 'italic', 'fill'].includes(key) ? <input type="checkbox" checked={!!draft[key]} onChange={e => set(key, e.target.checked)}/> :
                ['style', 'targetSheetId', 'patternId', 'netClassId'].includes(key) ? <select className="dt-select" value={draft[key] ?? ''} onChange={e => set(key, e.target.value)}>
          {key === 'style' && [
            ['Ground', 'Земля (GND)'],
            ['Power', 'Питание (+5V / +3V3)'],
            ['PortLeft', 'Входной порт (Input)'],
            ['PortRight', 'Выходной порт (Output)'],
            ['OffPageIn', 'Межлистовой вход (Off-Page In)'],
            ['OffPageOut', 'Межлистовой выход (Off-Page Out)']
          ].map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
          {key === 'targetSheetId' && project.sheets.filter(s => s.id !== sheet.id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          {key === 'patternId' && [...ALL_GOST_PATTERNS, ...Object.values(project.customPatternDefs)].map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          {key === 'netClassId' && <><option value="">По умолчанию</option>{project.netClasses.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</>}
        </select> : <input className="dt-input" type={typeof draft[key] === 'number' || key === 'labelAngle' ? 'number' : 'text'} step="any" list={['posNet', 'negNet', 'netName'].includes(key) ? 'schematic-nets' : undefined} value={draft[key] ?? ''} onChange={e => set(key, typeof draft[key] === 'number' || key === 'labelAngle' ? Number(e.target.value) : e.target.value)}/>}
      </label>)}
      <datalist id="schematic-nets">{nets.map(n => <option key={n} value={n}/>)}</datalist>
      {draft.type === 'table' && <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>{draft.source === 'bom' && <button className="dt-btn" onClick={() => { set('rows', [['Поз. обозн.', 'Наименование', 'Кол.', 'Примечание'], ...generateGostBom(project).map(e => [e.refDesList, e.name, String(e.quantity), e.note])]); }}>Обновить ПЭ3 из схемы</button>}<label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>Ширины колонок, мм<input className="dt-input" value={draft.colWidths.join('; ')} onChange={e => set('colWidths', e.target.value.split(';').map(Number))}/></label><label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>Строки таблицы (колонки разделяются табуляцией)<textarea className="dt-input" style={{ width: '100%', minHeight: 150 }} value={draft.rows.map((r: string[]) => r.join('\t')).join('\n')} onChange={e => set('rows', e.target.value.split('\n').map(r => r.split('\t')))}/></label></div>}
      {first?.kind === 'hierarchyBlocks' && <fieldset><legend>Выводы блока</legend>{(draft.pins ?? []).map((pin: any, i: number) => <div key={pin.id} style={{ display: 'flex', gap: 4 }}><input aria-label="Имя вывода" value={pin.name} onChange={e => set('pins', draft.pins.map((p: any, j: number) => j === i ? { ...p, name: e.target.value } : p))}/><select aria-label="Сторона вывода" value={pin.side} onChange={e => set('pins', draft.pins.map((p: any, j: number) => j === i ? { ...p, side: e.target.value } : p))}><option value="left">Слева</option><option value="right">Справа</option></select><input aria-label="Отступ вывода" type="number" value={pin.offset} onChange={e => set('pins', draft.pins.map((p: any, j: number) => j === i ? { ...p, offset: Number(e.target.value) } : p))}/><button onClick={() => set('pins', draft.pins.filter((_: any, j: number) => j !== i))}>−</button></div>)}<button className="dt-btn" onClick={() => set('pins', [...(draft.pins ?? []), { id: crypto.randomUUID(), name: 'SIG', side: 'left', offset: 5 + (draft.pins?.length ?? 0) * 5 }])}>Добавить вывод</button></fieldset>}
      {error && <p role="alert" style={{ color: '#b00' }}>{error}</p>}
    </div><div className="dt-modal-footer"><button className="dt-btn primary" onClick={save}>Применить</button><button className="dt-btn" onClick={onClose}>Отмена</button></div>
  </div></div>;
};
