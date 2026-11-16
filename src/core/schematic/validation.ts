import { SchematicProject } from '../types';
const arrays = ['components', 'wires', 'buses', 'busTaps', 'junctions', 'netPorts', 'diffPairs', 'hierarchyBlocks', 'shapes'];
/** Validate structural input before it reaches Canvas or electrical engines. */
export function validateSchematic(value: unknown): SchematicProject {
    const p = structuredClone(value) as SchematicProject;
    if (!p || !Array.isArray(p.sheets) || !p.sheets.length)
        throw new Error('Схема должна содержать хотя бы один лист.');
    const ids = new Set<string>();
    for (const s of p.sheets) {
        if (!s || typeof s.id !== 'string' || ids.has(s.id) || !s.titleBlock || !['A4_P', 'A4_L', 'A3_L', 'A2_L', 'A1_L', 'A0_L'].includes(s.format))
            throw new Error('Некорректные данные листа схемы.');
        ids.add(s.id);
        for (const k of arrays) {
            if ((s as any)[k] == null)
                (s as any)[k] = [];
            if (!Array.isArray((s as any)[k]))
                throw new Error(`Некорректная коллекция ${k}.`);
        }
        for (const k of arrays)
            for (const o of (s as any)[k]) {
                if (!o || typeof o.id !== 'string' || ids.has(o.id))
                    throw new Error('Повторяющийся или отсутствующий идентификатор объекта.');
                ids.add(o.id);
                for (const coord of ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'w', 'h', 'r', 'size'])
                    if (coord in o && !Number.isFinite(o[coord]))
                        throw new Error('Координаты и размеры должны быть конечными числами.');
                if (o.points && (!Array.isArray(o.points) || o.points.some((pt: any) => !pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y))))
                    throw new Error('Некорректные точки проводника.');
            }
        for (const c of s.components) {
            if (typeof c.refDes !== 'string' || typeof c.componentDefId !== 'string' || !Number.isFinite(c.x) || !Number.isFinite(c.y))
                throw new Error('Некорректный компонент.');
            c.refDesOffset ??= { x: 0, y: -7 };
            c.valueOffset ??= { x: 0, y: 7 };
            c.angle ??= 0;
            c.flipX ??= false;
            c.flipY ??= false;
            c.value ??= '';
            c.partIndex ??= 1;
            c.typeName ??= '';
            c.patternId ??= '';
        }
        for (const port of s.netPorts) {
            const legacy = { Input: 'PortLeft', Output: 'PortRight', Bidir: 'PortRight' } as Record<string, typeof port.style>;
            port.style = legacy[port.style] ?? port.style;
            if (!['Ground', 'Power', 'PortLeft', 'PortRight', 'OffPageIn', 'OffPageOut'].includes(port.style))
                throw new Error('Неизвестный стиль порта.');
        }
    }
    p.activeSheetId = p.sheets.some(s => s.id === p.activeSheetId) ? p.activeSheetId : p.sheets[0].id;
    p.customComponentDefs ??= {};
    p.customPatternDefs ??= {};
    for(const def of Object.values(p.customComponentDefs)) {
        if(!def||!Array.isArray(def.parts)||!def.parts.length)throw new Error('Некорректное определение символа.');
        for(const part of def.parts){if(!Array.isArray(part.primitives)||!Array.isArray(part.pins))throw new Error('Некорректная секция символа.');for(const pin of part.pins)if(!Number.isFinite(pin.x)||!Number.isFinite(pin.y)||!Number.isFinite(pin.length)||typeof pin.number!=='string')throw new Error('Некорректные выводы символа.');}
    }
    for(const s of p.sheets){
        for(const sh of s.shapes){if(!['line','rect','circle','text','table'].includes(sh.type))throw new Error('Неизвестная графика схемы.');if(sh.type==='table'&&(!Array.isArray(sh.rows)||!Array.isArray(sh.colWidths)||sh.colWidths.some(w=>!Number.isFinite(w)||w<=0)))throw new Error('Некорректная таблица.');}
        for(const hb of s.hierarchyBlocks)if(!Array.isArray(hb.pins)||!p.sheets.some(sh=>sh.id===hb.targetSheetId)||hb.targetSheetId===s.id)throw new Error('Некорректная ссылка иерархического блока.');
    }
    const checked=new Set<string>(),visiting=new Set<string>();
    const visit=(id:string)=>{if(visiting.has(id))throw new Error('Циклическая иерархия листов.');if(checked.has(id))return;visiting.add(id);for(const b of p.sheets.find(s=>s.id===id)?.hierarchyBlocks??[])visit(b.targetSheetId);visiting.delete(id);checked.add(id);};
    for(const s of p.sheets)visit(s.id);
    p.netClasses ??= [];
    p.netClassAssignments ??= {};
    p.projectName ??= 'Проект';
    p.origin ??= { x: 0, y: 0 };
    p.units ??= 'mm';
    p.gridSize = Number.isFinite(p.gridSize) && p.gridSize > 0 ? p.gridSize : 2.5;
    return p;
}
