import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeUnroutedRatlines, runPcbDrc } from '../../src/engines/drc';
import { runAgent } from '../../src/ui/modules/launcher/agent/client';
import { createAgentWorkspace } from '../../src/ui/modules/launcher/agent/workspace';

const rectangle = (left: number, top: number, right: number, bottom: number) => [
  { x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }
];
const terminal = (ref: string, pin = '1') => ({ ref, pin });
const pattern = 'PAT_CHIP_2012M';

function boardAgent(bottom = false) {
  const agent = createAgentWorkspace({ documents: {}, plan: '' }, 'light');
  agent.execute('create_board', { fromSchematic: false, width: 62, height: 42, outline: rectangle(0, 0, 62, 42) });
  agent.execute('place_footprints', { items: [
    { ref: 'R1', pattern, x: 8, y: 20, nets: {'1': 'A', '2': 'GND'}, locked: true },
    { ref: 'R2', pattern, x: 54, y: 20, nets: {'1': 'A', '2': 'GND'}, side: bottom ? 'Bottom' : 'Top', angle: bottom ? 90 : 0, locked: true }
  ] });
  return agent;
}

describe('PCB stress regressions', () => {
  it('rolls back a multi-net reroute if a later net fails', () => {
    const agent = boardAgent();
    const before = structuredClone(agent.draft.documents.pcb!);
    const revision = agent.revision;
    expect(() => agent.execute('route_nets', { nets: [{net:'A'}, {net:'NO_NET'}] })).toThrow('Цепь отсутствует');
    expect(agent.draft.documents.pcb).toEqual(before);
    expect(agent.revision).toBe(revision);
    expect(agent.execute('route_nets', { nets: [{net:'A'}, {net:'GND'}] })).toMatchObject([
      {net:'A', applied:true, remaining:[]}, {net:'GND', applied:true, remaining:[]}
    ]);
    expect(computeUnroutedRatlines(agent.draft.documents.pcb!)).toEqual([]);
    expect(agent.revision).toBe(revision + 1);
  });
  it('requires the specified via-in-pad process and scopes PCB inspection to the selected net', () => {
    const agent = boardAgent();
    const targets = { documents:'pcb', boardRefs:['R1','R2'],
      boardNets:{ A:[terminal('R1'),terminal('R2')], GND:[terminal('R1','2'),terminal('R2','2')] },
      board:{width:62,height:42,layers:2} };
    agent.setUserTargets(targets);
    const via = { x:7.05, y:20, net:'A', diameter:.6, hole:.3, viaInPad:true };
    expect(() => agent.execute('add_via', via)).toThrow('разрешение');
    expect(() => agent.execute('set_targets', { ...targets, board:{...targets.board,allowViaInPad:true} })).toThrow('зафиксировано');
    agent.setUserTargets({ ...targets, board:{...targets.board,allowViaInPad:true} });
    agent.execute('add_via', via);
    expect(agent.execute('inspect', {pcbNet:'A'})).toMatchObject({pads:[{pin:'1'},{pin:'1'}], vias:[{viaInPad:true}]});
    expect(agent.execute('inspect', {pcbNet:'GND'})).toMatchObject({pads:[{pin:'2'},{pin:'2'}], vias:[]});
  });
  it('places and routes a standalone board from the exact contracts for pads and traces', () => {
    const agent = createAgentWorkspace({ documents: {}, plan: '' }, 'light');
    agent.setUserTargets({
      documents: 'pcb', boardRefs: ['R1', 'R2', 'R3', 'R4'],
      boardNets: { A: [terminal('R1','2'), terminal('R2')], B: [terminal('R3'), terminal('R4','2')] },
      board: { width: 42, height: 36, layers: 2, positions: [
        { ref:'R1', x: 14, y: 17, locked: true }, { ref:'R2', x: 42, y: 17, locked: true },
        { ref:'R3', x: 14, y: 31, side:'Bottom' }, { ref:'R4', x: 42, y: 31, side:'Bottom' }
      ], routes: { A: { width: .6, allowedLayers:['TopCopper'] }, B: { width: .45, allowedLayers:['BottomCopper'] } } }
    });
    agent.execute('create_board', {});
    agent.execute('place_footprint', { ref:'R1', pattern, x:14, y:17, locked:true, nets:{ '2':'A', '1':'EXTRA' } });
    expect(agent.execute('place_target_footprints', { patterns:{}, defaultPattern:pattern })).toEqual({ added:3 });
    expect(agent.execute('sync_target_pad_nets', {})).toMatchObject({ changes:[{ref:'R1',pin:'1',previous:'EXTRA'}] });
    const routed = agent.execute('route_remaining', {});
    expect(routed, JSON.stringify(routed)).toMatchObject({ closed: 2, remaining: 0 });
    const pcb = agent.draft.documents.pcb!;
    expect(pcb.components.map(item => item.padNets)).toEqual([{'2':'A'}, {'1':'A'}, {'1':'B'}, {'2':'B'}]);
    expect(pcb.traces).toEqual([
      expect.objectContaining({ netName:'A', width:.6, layer:'TopCopper' }),
      expect.objectContaining({ netName:'B', width:.45, layer:'BottomCopper' })
    ]);
    const revision = agent.revision;
    expect(agent.execute('route_remaining', {})).toMatchObject({ closed:0, remaining:0 });
    expect(agent.revision).toBe(revision);
    expect(agent.execute('check', {})).toMatchObject({ blockers: [] });
  });

  it('preserves intentional open terminals when converting a schematic to PCB', () => {
    const agent = createAgentWorkspace({ documents: {}, plan: '' }, 'light');
    const nets = { A: [terminal('R1','2'), terminal('R2')] };
    agent.setUserTargets({ documents:'both', schematicRefs:['R1','R2'], boardRefs:['R1','R2'],
      schematicNets:nets, boardNets:nets, board:{width:80,height:60,layers:2} });
    agent.execute('create_schematic', { name:'Open terminals' });
    for (const [ref, x] of [['R1', 70], ['R2', 110]] as const) {
      agent.execute('place_component', { sheet:'sheet_1', component:'COMP_R_R1_12_0805', ref, x, y:75 });
    }
    agent.execute('connect_net', { sheet:'sheet_1', net:'A', terminals:nets.A });
    agent.execute('mark_no_connect', { sheet:'sheet_1', pin:terminal('R1') });
    agent.execute('mark_no_connect', { sheet:'sheet_1', pin:terminal('R2','2') });
    agent.execute('create_board', { fromSchematic:true });
    expect(agent.draft.documents.pcb!.components.map(item => item.padNets)).toEqual([{'2':'A'}, {'1':'A'}]);
    expect(agent.execute('check', {})).toMatchObject({ comparison:{inSync:true}, targetIssues:[] });
  });

  it('rolls back a trace crossing a cutout and a via intersecting a same-net SMD pad', () => {
    const agent = boardAgent();
    agent.execute('add_cutout', { points: rectangle(20, 12, 34, 30) });
    expect(() => agent.execute('route_between_pads', {
      from: terminal('R1'), to: terminal('R2'), net: 'A', layer: 'TopCopper', width: 0.3
    })).toThrow('края платы или выреза');
    expect(() => agent.execute('add_via', { x: 7.05, y: 20, net: 'A', diameter: 0.6, hole: 0.3 })).toThrow('Отверстие пересекает');
    expect(agent.draft.documents.pcb).toMatchObject({ traces: [], vias: [] });
  });

  it('previews a two-sided route, rejects a stale preview and commits checked copper', () => {
    const agent = boardAgent(true);
    agent.execute('add_keepout', { kind: 'RouteKeepout', layer: 'AllCopper', points: rectangle(20, 4, 25, 28) });
    const options = { net: 'A', pair: [terminal('R1'), terminal('R2')], layers: ['TopCopper', 'BottomCopper'], preview: true };
    const first = agent.execute('route_net', options) as { previewId: string; traces: unknown[] };
    expect(first.traces).toHaveLength(2);
    expect(agent.draft.documents.pcb!.traces).toHaveLength(0);
    agent.execute('board_rules', { clearance: 0.3 });
    expect(() => agent.execute('commit_route', { previewId: first.previewId })).toThrow('устарел');
    const second = agent.execute('route_net', options) as { previewId: string };
    agent.execute('commit_route', { previewId: second.previewId });
    const pcb = agent.draft.documents.pcb!;
    expect(computeUnroutedRatlines(pcb).map(connection => connection.netName)).toEqual(['GND']);
    expect(runPcbDrc(pcb).filter(issue => issue.severity === 'Error' || issue.code === 'DRC-EDGE')).toEqual([]);
    expect(pcb.vias).toHaveLength(1);
  });

  it('preserves the original geometric contract and reports unlocked or misplaced footprints', () => {
    const agent = boardAgent(true);
    agent.setUserTargets({
      documents: 'pcb', boardRefs: ['R1', 'R2'], boardNets: {A: [terminal('R1'), terminal('R2')], GND: [terminal('R1', '2'), terminal('R2', '2')]},
      board: { width: 62, height: 42, layers: 2, outline: rectangle(0, 0, 62, 42),
        positions: [{ref: 'R2', x: 54, y: 20, side: 'Bottom', angle: 90, locked: true}],
        routes: { A: { width: 0.8, allowedLayers: ['TopCopper', 'BottomCopper'], minVias: 1 } } }
    });
    expect(() => agent.execute('set_targets', { documents: 'pcb', board: { width: 63, height: 42, layers: 2 } })).toThrow('зафиксировано');
    agent.execute('move_footprint', { ref: 'R2', x: 54, y: 20, angle: 0, locked: false });
    const report = agent.execute('check', {}) as { requirements: { requirement: string; pass: boolean }[] };
    expect(report.requirements.filter(row => !row.pass).map(row => row.requirement)).toEqual(
      ['Угол R2', 'Фиксация R2', 'Ширина A', 'Разрешённые слои A', 'Число via A']);
  });

  it('refills at the requested clearance and rejects faulty saved polygons', () => {
    const agent = boardAgent();
    agent.execute('board_rules', { clearance: 0.3 });
    agent.execute('add_copper_pour', { layer: 'TopCopper', net: 'GND', clearance: 0.3, outline: rectangle(1, 1, 61, 41) });
    agent.execute('refill_copper', {});
    const pcb = agent.draft.documents.pcb!;
    const pour = pcb.copperPours[0];
    expect(pour).toMatchObject({ poured: true, clearance: 0.3 });
    expect(runPcbDrc(pcb).some(issue => issue.code === 'DRC-POUR-CLEARANCE')).toBe(false);
    expect(computeUnroutedRatlines(pcb).map(rat => rat.netName)).toEqual(['A']);
    const invalid = { ...pcb, copperPours: [{ ...pour, computedIslands: [{ outer: rectangle(6.8, 19.8, 7.3, 20.2), holes: [] }] }] };
    expect(runPcbDrc(invalid)).toContainEqual(expect.objectContaining({ code: 'DRC-POUR-CLEARANCE', severity: 'Error' }));
    expect(computeUnroutedRatlines(invalid).map(rat => rat.netName).sort()).toEqual(['A', 'GND']);
  });

  it('detects stamp collisions and rejects ports that extend beyond the working frame', () => {
    const agent = createAgentWorkspace({ documents: {}, plan: '' }, 'light');
    agent.execute('create_schematic', { name: 'Layout' });
    agent.execute('configure_document', { designation: 'ТЕСТ.000001', sheets: [{sheet:'sheet_1', name:'Лист'}] });
    for (const [ref, x, y] of [['R1', 58, 60], ['R2', 180, 180]] as const) {
      agent.execute('place_component', { sheet:'sheet_1', component:'COMP_R_R1_12_0805', ref, x, y });
    }
    expect(() => agent.execute('wire', { sheet: 'sheet_1', from: terminal('R1'), points:[{x:20,y:60}], net:'IN', port:'OffPageIn' }))
      .toThrow('за рабочей рамкой');
    expect(agent.execute('check', {})).toMatchObject({ layout: expect.arrayContaining([
      expect.objectContaining({ issue: 'Объект занимает зарезервированную область: основная надпись' })
    ]) });
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('agent recovery protocol', () => {
  it('narrows a truncated routing turn to the next connection and checkpoints it', async () => {
    const agent = boardAgent();
    agent.execute('set_targets', { documents: 'pcb' });
    const stop = new AbortController();
    const provider = vi.fn()
      .mockResolvedValueOnce(Response.json({ choices: [{ finish_reason: 'length', message: { content: null } }] }))
      .mockImplementationOnce((_url, options) => {
        const body = JSON.parse(options.body);
        expect(body.tools.map((tool: {function:{name:string}}) => tool.function.name)).toContain('route_net');
        expect(body.tools.length).toBeLessThan(10);
        expect(body.messages[1].content).toContain('R1.1');
        return Response.json({ choices: [{message: { tool_calls: [
          { id: '1', type: 'function', function: { name: 'route_net', arguments: '{"net":"A"}' } }
        ] }}] });
      });
    vi.stubGlobal('fetch', provider);
    await expect(runAgent(agent, { key:'test', model:'test', task:'Плата', signal:stop.signal }, () => {}, () => {
      if (agent.draft.documents.pcb!.traces.length) stop.abort();
    })).rejects.toMatchObject({ name:'AbortError' });
    expect(provider).toHaveBeenCalledTimes(2);
    expect(agent.draft.progress?.recent.at(-1)).toMatchObject({ name:'route_net', ok:true });
  });

  it('classifies malformed JSON and skips an identical repeat before invoking Decisions', async () => {
    const agent = createAgentWorkspace({ documents: {}, plan: '' }, 'light');
    const stop = new AbortController();
    const output: string[] = [];
    const provider = vi.fn(async (url: string) => {
      expect(url).toContain('/chat/completions');
      return Response.json({ choices: [{ message: { tool_calls: [
        { id:'malformed',type:'function',function:{ name:'delete_board', arguments:'{"ids":["R1"]' } }
      ] } }] });
    });
    vi.stubGlobal('fetch', provider);
    await expect(runAgent(agent, { key:'test', model:'test', task:'Плата', signal:stop.signal,
      onEvent:event => { if (event.kind==='tool') output.push((event.output as {code:string}).code); }
    }, () => {}, () => { if (output.length === 2) stop.abort(); })).rejects.toMatchObject({name:'AbortError'});
    expect(output).toEqual(['INVALID_TOOL_JSON','REPEATED_TOOL_FAILURE']);
    expect(provider).toHaveBeenCalledTimes(2);
  });
});
