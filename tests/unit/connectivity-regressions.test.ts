import { describe, expect, it } from 'vitest';
import { createDemoRs485GostSchematic, createDemoRs485Pcb } from '../../src/gost/demoProjects';
import { DEFAULT_ERC_SETTINGS, extractSchematicNets, runSchematicErc } from '../../src/engines/erc';
import { runPcbDrc } from '../../src/engines/drc';

describe('connectivity and keepout regression checks', () => {
  it('connects a wire endpoint to a segment without joining a plain crossing', () => {
    const project = createDemoRs485GostSchematic();
    const sheet = project.sheets[0];
    sheet.components = [];
    sheet.netPorts = [];
    sheet.junctions = [];
    sheet.wires = [
      { id: 'horizontal', netName: '', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
      { id: 'vertical', netName: '', points: [{ x: 5, y: 0 }, { x: 5, y: 5 }] }
    ];
    expect(extractSchematicNets(project).map((n) => n.wireIds.length)).toEqual([2]);

    sheet.wires[1].points = [{ x: 5, y: -5 }, { x: 5, y: 5 }];
    expect(extractSchematicNets(project).map((n) => n.wireIds.length)).toEqual([1, 1]);
    sheet.junctions = [{ id: 'junction', x: 5, y: 0, netName: '' }];
    expect(extractSchematicNets(project).map((n) => n.wireIds.length)).toEqual([2]);
  });

  it('checks unconnected pins independently from floating inputs', () => {
    const project = createDemoRs485GostSchematic();
    const sheet = project.sheets[0];
    sheet.components = [sheet.components.find((c) => c.componentDefId === 'COMP_R_R1_12_0805')!];
    expect(sheet.components[0]).toBeDefined();
    sheet.wires = [];
    sheet.netPorts = [];
    sheet.junctions = [];
    const errors = runSchematicErc(project, {
      ...DEFAULT_ERC_SETTINGS,
      checkFloatingInputs: false,
      checkUnconnectedPins: true
    });
    expect(errors.filter((e) => e.code === 'ERC-UNCON')).toHaveLength(2);
  });

  it('reports a trace crossing a route keepout even when its endpoints are outside', () => {
    const pcb = createDemoRs485Pcb();
    pcb.components = [];
    pcb.vias = [];
    pcb.copperPours = [];
    pcb.boardOutline = [];
    pcb.diffPairs = [];
    pcb.traces = [{ id: 'trace', netName: 'N', layer: 'TopCopper', width: 0.5, points: [{ x: 0, y: 5 }, { x: 10, y: 5 }] }];
    pcb.keepouts = [{ id: 'keepout', kind: 'RouteKeepout', layer: 'AllCopper', points: [{ x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }, { x: 4, y: 6 }] }];
    expect(runPcbDrc(pcb).some((e) => e.code === 'DRC-KEEPOUT')).toBe(true);
    // The axis is outside, but the 0.5 mm wide copper touches the boundary.
    pcb.traces[0].points = [{ x: 0, y: 3.75 }, { x: 10, y: 3.75 }];
    expect(runPcbDrc(pcb).some((e) => e.code === 'DRC-KEEPOUT')).toBe(true);
    pcb.traces[0].points = [{ x: 0, y: 3.74 }, { x: 10, y: 3.74 }];
    expect(runPcbDrc(pcb).some((e) => e.code === 'DRC-KEEPOUT')).toBe(false);
  });

  it('checks via clearances only on overlapping copper layers and different nets', () => {
    const pcb = createDemoRs485Pcb();
    const component = pcb.components[0];
    const pad = { ...component.pads[0], id: 'pad', number: '1', type: 'SMD' as const,
      shape: 'Rect' as const, x: 0, y: 0, width: 4, height: 1, angle: 0 };
    pcb.components = [{ ...component, id: 'component', x: 0, y: 0, angle: 0, side: 'Top', pads: [pad], padNets: { '1': 'PAD' } }];
    pcb.traces = [];
    pcb.copperPours = [];
    pcb.boardOutline = [];
    pcb.keepouts = [];
    pcb.diffPairs = [];
    pcb.vias = [
      { id: 'a', x: 0, y: 0, netName: 'A', outerDiameter: 1, holeDiameter: 0.4, startLayer: 'TopCopper', endLayer: 'Inner1', viaStyle: 'Blind' },
      { id: 'b', x: 0.2, y: 0, netName: 'B', outerDiameter: 1, holeDiameter: 0.4, startLayer: 'TopCopper', endLayer: 'BottomCopper', viaStyle: 'Through' }
    ];
    let errors = runPcbDrc(pcb);
    expect(errors.some((e) => e.code === 'DRC-VIA-VIA')).toBe(true);
    expect(errors.filter((e) => e.code === 'DRC-VIA-PAD')).toHaveLength(2);

    pcb.vias[1].startLayer = 'Inner2';
    errors = runPcbDrc(pcb);
    expect(errors.some((e) => e.code === 'DRC-VIA-VIA')).toBe(false);
    expect(errors.filter((e) => e.code === 'DRC-VIA-PAD')).toHaveLength(1);

    pcb.vias[0].netName = 'PAD';
    expect(runPcbDrc(pcb).some((e) => e.code === 'DRC-VIA-PAD')).toBe(false);
    pcb.vias[0].netName = 'A';
    pcb.vias[0].y = 1.5; // Outside the narrow edge of the rectangular pad.
    expect(runPcbDrc(pcb).some((e) => e.code === 'DRC-VIA-PAD')).toBe(false);
  });
});
