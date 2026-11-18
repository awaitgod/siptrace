import { describe, expect, it } from 'vitest';
import { createAgentWorkspace } from '../../src/ui/modules/launcher/agent/workspace';

describe('agent schematic and PCB acceptance', () => {
  it('edits values and renames an existing inter-sheet net in place on both documents', () => {
    const agent = createAgentWorkspace({ documents: {}, plan: '' }, 'light');
    agent.execute('create_schematic', { name: 'Revision' });
    const second = agent.execute('add_sheet', { name: 'Output' }) as { sheet: string };
    const sides = [
      { sheet: 'sheet_1', ref: 'R1', pin: '2', port: 'OffPageOut', x: 130 },
      { sheet: second.sheet, ref: 'R2', pin: '1', port: 'OffPageIn', x: 50 }
    ] as const;
    for (const { sheet, ref, pin, port, x } of sides) {
      agent.execute('place_component', { sheet, component: 'COMP_R_R1_12_0805', ref, x: 95, y: 60 });
      agent.execute('connect_net', { sheet, net: 'N3', terminals: [{ref, pin}], port, portPosition: {x, y: 60} });
    }
    agent.execute('create_board', { width: 60, height: 45 });
    agent.execute('route_between_pads', {
      from: {ref:'R1',pin:'2'}, to: {ref:'R2',pin:'1'}, net:'N3', layer:'TopCopper', width:.3
    });
    const initial = structuredClone(agent.draft.documents);
    expect(() => agent.execute('set_component_values', { values: { R1: '22 кОм', R99: '1 кОм' } })).toThrow();
    expect(agent.draft.documents).toEqual(initial);
    agent.execute('set_component_values', { values: { R1: '22 кОм' } });
    agent.execute('rename_net', { from: 'N3', to: 'MID' });
    for (const oldSheet of initial.schematic!.sheets) {
      const newSheet = agent.draft.documents.schematic!.sheets.find(item => item.id === oldSheet.id);
      expect(newSheet?.wires).toEqual(oldSheet.wires.map(wire => ({...wire, netName:'MID'})));
      expect(newSheet?.netPorts).toEqual(oldSheet.netPorts.map(port => ({...port, netName:'MID'})));
      expect(newSheet?.components).toEqual(oldSheet.components.map(part =>
        part.refDes === 'R1' ? {...part, value:'22 кОм'} : part));
    }
    const pcb = agent.draft.documents.pcb!;
    expect(pcb.traces).toEqual(initial.pcb!.traces.map(trace => ({...trace, netName:'MID'})));
    expect(pcb.components[0]).toMatchObject({ id:initial.pcb!.components[0].id, value:'22 кОм', padNets:{'2':'MID'} });
    expect(agent.execute('check', {})).toMatchObject({ comparison:{inSync:true}, unrouted:0 });
    const revised = structuredClone(agent.draft.documents);
    expect(() => agent.execute('rename_net', { from: 'MID', to: 'Net_1' })).toThrow('занято');
    expect(agent.draft.documents).toEqual(revised);
  });

  it('syncs a new schematic stage without replacing PCB placement, geometry or old copper', () => {
    const agent = createAgentWorkspace({ documents: {}, plan: '' }, 'light');
    const place = (ref: string, x: number) => agent.execute('place_component', {
      sheet:'sheet_1', component:'COMP_R_R1_12_0805', ref, x, y:60
    });
    const connect = (net: string, left: string, right: string) => agent.execute('connect_net', {
      sheet:'sheet_1', net, terminals:[{ref:left,pin:'2'}, {ref:right,pin:'1'}]
    });
    agent.execute('create_schematic', { name:'Existing' });
    place('R1',60);
    place('R2',140);
    connect('A','R1','R2');
    agent.execute('create_board', { width:60, height:45 });
    agent.execute('route_between_pads', {
      net:'A', from:{ref:'R1',pin:'2'}, to:{ref:'R2',pin:'1'}, layer:'TopCopper', width:.3
    });
    const prior = structuredClone(agent.draft.documents.pcb!);
    agent.execute('set_targets', { documents:'both', board:{width:60,height:45,layers:2,positions:[{ref:'R3',x:24,y:24}]} });
    agent.execute('delete_schematic', { sheet:'sheet_1', ids:[agent.draft.documents.schematic!.sheets[0].wires[0].id] });
    place('R3',100);
    connect('A','R1','R3');
    connect('B','R3','R2');
    expect(agent.execute('sync_board_from_schematic', {})).toMatchObject({
      added:['R3'], removed:[],
      affectedNets:expect.arrayContaining([{net:'A',traces:[prior.traces[0].id],vias:[]},{net:'B',traces:[],vias:[]}])
    });
    const pcb = agent.draft.documents.pcb!;
    expect(pcb.boardOutline).toEqual(prior.boardOutline);
    expect(pcb.traces).toEqual(prior.traces);
    expect(pcb.components).toEqual([
      prior.components[0], {...prior.components[1], padNets:{'1':'B'}},
      expect.objectContaining({ refDes:'R3', x:24, y:24, padNets:{'1':'A','2':'B'} })
    ]);
  });

  it('configures sheets and validates mechanical and document requirements', () => {
    const agent = createAgentWorkspace({ documents: {}, plan: '' }, 'light');
    agent.execute('create_schematic', { name: 'Requirements' });
    agent.execute('set_targets', {
      documents: 'both', designation: 'ТЕСТ.000001 Э3', sheets: [{ name: 'Источник', format: 'A4_L', form: 'Form1' }],
      values: { R1: '1 кОм' }, board: { width: 50, height: 40, layers: 2 }
    });
    agent.execute('place_component', { sheet: 'sheet_1', component: 'COMP_R_R1_12_0805', ref: 'R1', x: 60, y: 60, value: '1 кОм' });
    agent.execute('create_board', { width: 50, height: 40 });
    expect(agent.execute('compare_requirements', {})).toMatchObject({
      requirements: expect.arrayContaining([expect.objectContaining({ requirement: 'Обозначение листа 1', pass: false })])
    });
    agent.execute('configure_document', { designation: 'ТЕСТ.000001', sheets: [{ sheet: 'sheet_1', name: 'Источник', format: 'A4_L' }] });
    const checked = agent.execute('compare_requirements', {}) as { requirements: { pass: boolean }[] };
    expect(checked.requirements.every(row => row.pass)).toBe(true);
    const revision = agent.draft.checks?.revision;
    agent.execute('set_frame', { sheet: 'sheet_1', format: 'A4_L' });
    expect(agent.draft.checks?.revision).toBe(revision);
    agent.execute('set_targets', structuredClone(agent.draft.targets!));
    expect(agent.draft.checks?.revision).toBe(revision);
  });

  it('connects terminals atomically and routes between computed pad centres', () => {
    const agent = createAgentWorkspace({ documents: {}, plan: '' }, 'light');
    agent.execute('create_schematic', { name: 'Connections' });
    for (const [ref, x] of [['R1', 60], ['R2', 110]] as const) {
      agent.execute('place_component', { sheet: 'sheet_1', component: 'COMP_R_R1_12_0805', ref, x, y: 60 });
    }
    agent.execute('connect_net', { sheet: 'sheet_1', net: 'A', terminals: [{ref:'R1',pin:'1'},{ref:'R2',pin:'1'}] });
    agent.execute('create_board', { width: 60, height: 45 });
    agent.execute('route_between_pads', {
      from: {ref:'R1',pin:'1'}, to: {ref:'R2',pin:'1'}, net: 'A', layer:'TopCopper', width:.3,
      waypoints: [{x:15.05,y:12},{x:31.05,y:12}]
    });
    expect(agent.draft.documents.pcb!.traces[0].points).toEqual([
      {x:15.05,y:16},{x:15.05,y:12},{x:31.05,y:12},{x:31.05,y:16}
    ]);
    const before = structuredClone(agent.draft.documents);
    expect(() => agent.execute('route_between_pads', {
      from:{ref:'R1',pin:'2'},to:{ref:'R2',pin:'1'},net:'A',layer:'TopCopper',width:.3
    })).toThrow('другой цепи');
    expect(agent.draft.documents).toEqual(before);
  });

  it('places readable labels outside rotated symbols and repairs old overlapping labels without changing wiring', () => {
    const agent = createAgentWorkspace({ documents: {}, plan: '' }, 'light');
    agent.execute('create_schematic', { name: 'Labels' });
    agent.execute('set_targets', { documents: 'schematic' });
    for (const [index, angle] of ([0, 90, 180, 270] as const).entries()) {
      agent.execute('place_component', {
        sheet: 'sheet_1', component: 'COMP_R_R1_12_0805', ref: 'R' + (index + 1),
        x: 60 + index * 45, y: 70, angle
      });
    }
    expect(agent.execute('check', {})).toMatchObject({ labelIssues: [] });
    agent.execute('wire', { sheet: 'sheet_1', from: { ref: 'R1', pin: '2' }, to: { ref: 'R2', pin: '1' }, net: 'SIGNAL' });
    const wires = structuredClone(agent.draft.documents.schematic!.sheets[0].wires);
    const components = agent.draft.documents.schematic!.sheets[0].components;
    const originalCoordinates = components.map(({ x, y, angle }) => ({ x, y, angle }));
    agent.execute('set_component_labels', {
      sheet: 'sheet_1', ref: 'R1', refDesOffset: { x: 0, y: 0 }, valueOffset: { x: 0, y: 0 }
    });
    expect(agent.execute('check', {})).toMatchObject({
      labelIssues: expect.arrayContaining([expect.objectContaining({ ref: 'R1' })]),
      blockers: expect.arrayContaining(['Есть наложения подписей компонентов. Исправьте через set_component_labels.'])
    });
    agent.execute('set_component_labels', { sheet: 'sheet_1', ref: 'R1', auto: true });
    expect(agent.execute('check', {})).toMatchObject({ labelIssues: [] });
    expect(agent.draft.documents.schematic!.sheets[0].wires).toEqual(wires);
    expect(agent.draft.documents.schematic!.sheets[0].components.map(({ x, y, angle }) => ({ x, y, angle }))).toEqual(originalCoordinates);
  });

  it('rejects merging two named nets and preserves the draft on failure', () => {
    const agent = createAgentWorkspace({ documents: {}, plan: '' }, 'light');
    agent.execute('create_schematic', { name: 'Net separation' });
    for (const [ref, x] of [['R1', 60], ['R2', 100], ['R3', 140]] as const) {
      agent.execute('place_component', { sheet: 'sheet_1', component: 'COMP_R_R1_12_0805', ref, x, y: 60 });
    }
    const from = { ref: 'R1', pin: '2' };
    agent.execute('wire', { sheet: 'sheet_1', from, to: { ref: 'R2', pin: '1' }, net: 'KEY' });
    const before = structuredClone(agent.draft.documents);
    expect(() => agent.execute('wire', { sheet: 'sheet_1', from, to: { ref: 'R3', pin: '1' }, net: 'GND' }))
      .toThrow('Маршрут объединяет провода разных цепей');
    expect(agent.draft.documents).toEqual(before);
    const wire = before.schematic!.sheets[0].wires[0];
    expect(() => agent.execute('delete_schematic', { sheet: 'sheet_1', ids: [wire.id], only: 'graphics' }))
      .toThrow('запрещает удаление');
    expect(agent.draft.documents).toEqual(before);
  });

  it('allows a valid PCB route and restores the verified revision when a required component is deleted', () => {
    const agent = createAgentWorkspace({ documents: {}, plan: '' }, 'light');
    agent.execute('set_targets', { documents: 'pcb', boardRefs: ['R1', 'R2'], boardNets: {
      A: [{ ref: 'R1', pin: '1' }, { ref: 'R2', pin: '1' }]
    } });
    agent.execute('create_board', { name: 'PCB', fromSchematic: false });
    agent.execute('place_footprint', { pattern: 'PAT_CHIP_2012M', ref: 'R1', x: 24, y: 25, nets: { '1': 'A' } });
    const component = agent.execute('place_footprint', {
      pattern: 'PAT_CHIP_2012M', ref: 'R2', x: 42, y: 25, nets: { '1': 'A' }
    }) as { id: string };
    agent.execute('route_trace', {
      net: 'A', layer: 'TopCopper', width: 0.3,
      points: [{ x: 23.05, y: 25 }, { x: 23.05, y: 22 }, { x: 41.05, y: 22 }, { x: 41.05, y: 25 }]
    });
    expect(agent.execute('check', {})).toMatchObject({ blockers: [], unrouted: 0 });
    agent.execute('delete_board', { ids: [component.id] });
    expect(agent.execute('check', {})).toMatchObject({
      unrouted: 0, targetIssues: expect.arrayContaining(['Плата: отсутствует R2'])
    });
    agent.execute('restore_verified', {});
    expect(agent.execute('check', {})).toMatchObject({ blockers: [], unrouted: 0 });
    expect(agent.draft.documents.pcb!.components.map(item => item.refDes)).toEqual(['R1', 'R2']);
  });
});
