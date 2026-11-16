import { createBlankSchematicProject } from '../../src/ui/modules/schematic/services/schematicActionsService';
import { ComponentDef, PlacedComponent, SchematicProject } from '../../src/core/types';
export function fixture(): SchematicProject {
    const p = createBlankSchematicProject('mm', []);
    p.sheets[0].titleBlock.date = '16.11.2026';
    const def: ComponentDef = { id: 'test', name: 'Test', library: 'test', refDesPrefix: 'R', defaultValue: '1k', gostStandard: '', description: '', patternId: 'PAT_CHIP_2012M', parts: [{ partIndex: 1, name: '1', primitives: [{ type: 'rect', x: -5, y: -2, w: 10, h: 4 }, { type: 'arc', cx: 0, cy: 0, r: 1, startAngle: 0, endAngle: Math.PI }, { type: 'polyline', points: [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }] }, { type: 'text', x: 0, y: 0, text: 'A < B & C' }], pins: [-10, 10].map((x, i) => ({ id: 'pin' + i, number: String(i + 1), name: 'P' + i, x, y: 0, length: 5, orientation: i ? 180 : 0, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true })) }] };
    p.customComponentDefs = { test: def };
    p.sheets[0].components = [75, 125].map((x, i): PlacedComponent => ({ id: 'c' + i, componentDefId: 'test', libraryId: 'test', refDes: 'R' + (i + 1), value: '1k', typeName: 'Test', partIndex: 1, x, y: 75, angle: 0, flipX: false, flipY: false, patternId: def.patternId, refDesOffset: { x: 0, y: -8 }, valueOffset: { x: 0, y: 8 }, showRefDes: true, showValue: true }));
    Object.assign(p.sheets[0], { wires: [{ id: 'w1', points: [{ x: 85, y: 75 }, { x: 115, y: 75 }], netName: '' }, { id: 'w2', points: [{ x: 100, y: 75 }, { x: 100, y: 100 }], netName: '' }], junctions: [{ id: 'j', x: 100, y: 75, netName: '' }], netPorts: [{ id: 'port', x: 100, y: 100, angle: 0, netName: 'GND', style: 'Ground' }], shapes: [{ id: 'text', type: 'text', x: 80, y: 110, text: 'Audit < note & value', size: 3.5 }], buses: [{ id: 'bus', points: [{ x: 60, y: 120 }, { x: 140, y: 120 }], busName: 'D[0..7]' }] });
    return p;
}
