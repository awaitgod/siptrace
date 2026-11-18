import { describe, expect, it } from 'vitest';
import { createDemoRs485Pcb, createDemoRs485GostSchematic } from '../../src/gost/demoProjects';
import { createGostDesignRules } from '../../src/gost/gostRules';
import { runPcbDrc, computeUnroutedRatlines } from '../../src/engines/drc';
import { runAutorouter, DEFAULT_AUTOROUTER_SETTINGS, applyMeanderToTrace } from '../../src/engines/autorouter';
import { runAutoplacer } from '../../src/engines/autoplacer';
import { updateAllCopperPours } from '../../src/engines/copperPour';
import {
  exportGerberSet,
  exportExcellonDrill,
  exportPickAndPlaceCsv,
  exportIpcD356,
  exportPcbDxf,
  exportPcbSvg1to1,
  parseGerberPreview
} from '../../src/engines/camExport';
import { getGerberExportEntries, exportGerberZipBytes, inspectGerberProjectOrBytes } from '../../src/engines/camBundle';
import { generatePcbGCode } from '../../src/engines/gcodeGenerator';
import { convertSchematicToPcb, comparePcbToSchematic, backAnnotateSchematic } from '../../src/engines/netlist';
import { applyConfigurablePanelization } from '../../src/ui/modules/pcb/services/pcbActionsService';
import { PcbProject } from '../../src/core/types';

function makeMinimalPcb(): PcbProject {
  const base = createDemoRs485Pcb();
  return {
    ...base,
    traces: [],
    vias: [],
    copperPours: [],
    cutouts: [],
    keepouts: [],
    shapes: [],
    drcWaivers: {}
  };
}

describe('Combine Agent 3: PCB Engine, DRC, Copper Pour, CAM & G-Code Audit', () => {
  it('1. Gerber RS-274X/X2 export drops silkscreen text shapes, rect shapes, and copper pour inner holes', () => {
    const pcb = makeMinimalPcb();
    pcb.shapes.push(
      { id: 'txt1', layer: 'TopSilk', type: 'text', x1: 20, y1: 20, width: 0.2, text: 'REV_A', size: 2.0 },
      { id: 'rect1', layer: 'TopSilk', type: 'rect', x1: 25, y1: 25, w: 5, h: 4, width: 0.2 }
    );
    // Add a pour with an explicit inner hole island
    pcb.copperPours.push({
      id: 'pour_hole',
      layer: 'TopCopper',
      netName: 'GND',
      outline: [{ x: 5, y: 5 }, { x: 40, y: 5 }, { x: 40, y: 40 }, { x: 5, y: 40 }],
      dependOnBoardOutline: false,
      boardClearance: 0.3,
      clearance: 0.3,
      fillType: 'Hatch',
      lineWidth: 0.25,
      lineSpacing: 0.5,
      thermalType: '4Spoke',
      thermalSpokeWidth: 0.4,
      thermalGap: 0.35,
      removeIslands: true,
      priority: 1,
      poured: true,
      computedIslands: [
        {
          outer: [{ x: 5, y: 5 }, { x: 40, y: 5 }, { x: 40, y: 40 }, { x: 5, y: 40 }],
          holes: [[{ x: 15, y: 15 }, { x: 25, y: 15 }, { x: 25, y: 25 }, { x: 15, y: 25 }]]
        }
      ]
    });

    const { files } = exportGerberSet(pcb, true);
    const gto = Object.entries(files).find(([k]) => k.endsWith('.GTO'))![1];
    const gtl = Object.entries(files).find(([k]) => k.endsWith('.GTL'))![1];

    expect(gto).toContain('%FSLAX34Y34*%');
    expect(gto).toContain('%TF.FileFunction,Legend,Top*%');
    // Verified bug: shapeText & rect shapes on TopSilk are never emitted to .GTO
    const gtoWithNoRefs = (() => {
      const pcbNoRefs = { ...pcb, components: [] };
      return Object.entries(exportGerberSet(pcbNoRefs, true).files).find(([k]) => k.endsWith('.GTO'))![1];
    })();
    expect(gtoWithNoRefs).not.toContain('D01*');
    expect(gtoWithNoRefs).not.toContain('D02*');

    // Verified bug: Gerber copper pour omits %LPC*% clear polarity and isl.holes; also exports Hatch as Solid G36/G37
    expect(gtl).not.toContain('%LPC*%');
    expect(gtl).not.toContain('X150000Y150000');
  });

  it('2. Gerber RefDes orientation mismatch vs Canvas & missing Cyrillic/punctuation glyphs', () => {
    const pcb = makeMinimalPcb();
    pcb.components = [
      {
        ...pcb.components[0],
        refDes: 'VT-1',
        angle: 90,
        side: 'Bottom',
        x: 30,
        y: 20,
        refDesOffset: { x: 0, y: -5 },
        graphics: []
      }
    ];
    const { files } = exportGerberSet(pcb, false);
    const gbo = Object.entries(files).find(([k]) => k.endsWith('.GBO'))![1];
    const entities = parseGerberPreview(gbo);
    // In gerberExporter, refDesOffset is rotated+mirrored around comp center (x=30 + 5 = 35, y=20),
    // whereas drawPcbComponents renders at (comp.x + refDesOffset.x, comp.y + refDesOffset.y) = (30, 15).
    const avgX = entities.reduce((s, e) => s + e.pts[0].x, 0) / entities.length;
    expect(avgX).toBeGreaterThan(33);
    // '-' character in 'VT-1' is not in SILK_GLYPHS so only V, T, 1 are stroked
    expect(entities.length).toBeGreaterThan(0);
  });

  it('3. CAM Bundle excludes Pick&Place CSV and IPC-D-356 from ZIP/UI; Pick&Place uses semicolon delimiter', () => {
    const pcb = createDemoRs485Pcb();
    const { files } = exportGerberSet(pcb, true);
    const bundleEntries = getGerberExportEntries(pcb, true, true);

    expect(Object.keys(files).some((k) => k.endsWith('_PickAndPlace.csv'))).toBe(true);
    expect(Object.keys(files).some((k) => k.endsWith('_IPC-D-356.ipc'))).toBe(true);
    // Verified gap: getGerberExportEntries strips PickAndPlace and IPC-D-356
    expect(Object.keys(bundleEntries).some((k) => k.endsWith('_PickAndPlace.csv'))).toBe(false);
    expect(Object.keys(bundleEntries).some((k) => k.endsWith('_IPC-D-356.ipc'))).toBe(false);

    const pnp = exportPickAndPlaceCsv(pcb);
    expect(pnp.startsWith('\uFEFFRefDes;Value;Pattern;Side;X(mm);Y(mm);Rotation(deg)')).toBe(true);

    const drl = exportExcellonDrill(pcb);
    expect(drl).toContain('M48\nMETRIC,TZ');
    // Verified quirk: declares METRIC,TZ yet writes explicit decimal points (X..000Y..000)
    expect(drl).toMatch(/X\d+\.\d{3}Y\d+\.\d{3}/);

    const ipc = exportIpcD356(pcb);
    expect(ipc).toContain('317');
    expect(ipc).toContain('999');

    const zipBytes = exportGerberZipBytes(pcb, true, true);
    expect(zipBytes.length).toBeGreaterThan(200);
  });

  it('4. DXF export has inconsistent layer names & omits component silkscreen and rectangular pad shapes', () => {
    const pcb = createDemoRs485Pcb();
    const dxfDefault = exportPcbDxf(pcb);
    const dxfWithOpts = exportPcbDxf(pcb, {
      units: 'mm',
      scale: 1,
      layers: { outline: true, cutouts: true, drills: true, topCopper: true, bottomCopper: true, topSilk: true, bottomSilk: true }
    });
    expect(dxfDefault).toContain('$INSUNITS\n70\n4');
    // Verified inconsistency: cutout layer name differs depending on options presence
    if (pcb.cutouts.length > 0) {
      expect(dxfDefault).toContain('BOARD_CUTOUT');
      expect(dxfWithOpts).toContain('CUTOUTS');
    }
    // Verified gap: TopSilk in DXF ignores component graphics/RefDes
    expect(dxfWithOpts).not.toContain('TEXT');
  });

  it('5. G-Code isolation milling startCap typo (normals[0].x used for Y) and ignored drillDiameterMm', () => {
    const pcb = makeMinimalPcb();
    pcb.components = [];
    // Vertical trace pointing +Y (dir = (0, 1), normal = (-1, 0)):
    // normals[0].x = -1, normals[0].y = 0 -> bug subtracts normals[0].x from Y!
    pcb.traces.push({
      id: 't_vert',
      layer: 'TopCopper',
      netName: '',
      width: 0.4,
      points: [{ x: 20, y: 20 }, { x: 20, y: 30 }]
    });
    const res = generatePcbGCode(pcb, { toolDiameterMm: 0.4, millTopIsolation: true, drillHoles: false, cutOutline: false });
    // off = 0.4/2 + 0.4/2 = 0.4.
    // Expected startCap[0]: x = 20 - 0 - (-1)*0.4 = 20.4, y = 20 - 1*0.4 - 0 = 19.6.
    // Buggy line 294 produces y = 20 - 1*0.4 - (-1)*0.4 = 20.000!
    expect(res.gcode).toContain('X20.400 Y20.000');
  });

  it('6. DRC checks vs missing commercial fab checks (THT annular ring, maxTraceWidth, minSilkWidth, RefDes silk-over-pad)', () => {
    const pcb = makeMinimalPcb();
    pcb.designRules = { ...createGostDesignRules(3), maxTraceWidth: 2.0, minSilkWidth: 0.15, checkSilkOverPads: true };
    // Create a THT pad with 0.01 mm annular ring (width 1.02, hole 1.00, minAnnularRing = 0.10)
    // and place silkscreen text shape + wide trace
    pcb.components = [
      {
        ...pcb.components[0],
        refDes: 'R1',
        x: 30,
        y: 30,
        angle: 0,
        side: 'Top',
        pads: [{ id: 'p1', number: '1', type: 'THT', shape: 'Round', x: 0, y: 0, width: 1.02, height: 1.02, holeDiameter: 1.0 }],
        padNets: { '1': 'NET1' },
        graphics: [{ type: 'line', layer: 'TopSilk', x1: -2, y1: 0, x2: 2, y2: 0, width: 0.05 }]
      }
    ];
    pcb.traces.push({ id: 'tr_wide', layer: 'TopCopper', netName: 'NET1', width: 5.0, points: [{ x: 30, y: 30 }, { x: 40, y: 30 }] });
    pcb.shapes.push({ id: 'stxt', layer: 'TopSilk', type: 'text', x1: 30, y: 30, width: 0.05, text: 'OVERPAD', size: 2.0 });

    const issues = runPcbDrc(pcb);
    const codes = new Set(issues.map((i) => i.code));
    // Silk line over pad IS detected
    expect(codes.has('DRC-SILK-PAD')).toBe(true);
    // Verified gaps: THT pad annular ring, maxTraceWidth, and minSilkWidth are NOT checked in DRC
    expect(issues.some((i) => i.code === 'DRC-RING')).toBe(false);
    expect(issues.some((i) => i.message.includes('5.00'))).toBe(false);
  });

  it('7. Copper pour thermal reliefs, island removal, and dependOnBoardOutline outline mutation', () => {
    const pcb = makeMinimalPcb();
    const origOutline = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 50 }, { x: 0, y: 50 }];
    pcb.boardOutline = origOutline;
    pcb.components = [
      {
        ...pcb.components[0],
        refDes: 'U1',
        x: 30,
        y: 25,
        angle: 0,
        side: 'Top',
        pads: [{ id: 'p1', number: '1', type: 'THT', shape: 'Round', x: 0, y: 0, width: 2.0, height: 2.0, holeDiameter: 0.9 }],
        padNets: { '1': 'GND' },
        graphics: []
      }
    ];
    pcb.copperPours.push({
      id: 'pour1',
      layer: 'TopCopper',
      netName: 'GND',
      outline: [...origOutline],
      dependOnBoardOutline: true,
      boardClearance: 0.5,
      clearance: 0.3,
      fillType: 'Solid',
      lineWidth: 0.25,
      lineSpacing: 0.5,
      thermalType: '4Spoke',
      thermalSpokeWidth: 0.4,
      thermalGap: 0.35,
      removeIslands: true,
      priority: 1,
      poured: true
    });

    const poured = updateAllCopperPours(pcb);
    expect(poured.copperPours[0].poured).toBe(true);
    expect(poured.copperPours[0].computedIslands!.length).toBeGreaterThan(0);
    // Verified bug: updateCopperPour overwrites pour.outline with the inset board outline
    expect(poured.copperPours[0].outline[0].x).toBeCloseTo(0.5, 2);
  });

  it('8. Panelization leaves dependOnBoardOutline=true on tile (0,0) pours; updateAllCopperPours expands tile-0 pour over all tiles', () => {
    const pcb = makeMinimalPcb();
    pcb.boardOutline = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }];
    pcb.copperPours.push({
      id: 'p0',
      layer: 'BottomCopper',
      netName: 'GND',
      outline: [...pcb.boardOutline],
      dependOnBoardOutline: true,
      boardClearance: 0.3,
      clearance: 0.3,
      fillType: 'Solid',
      lineWidth: 0.25,
      lineSpacing: 0.5,
      thermalType: '4Spoke',
      thermalSpokeWidth: 0.4,
      thermalGap: 0.35,
      removeIslands: false,
      priority: 1,
      poured: true
    });
    const panel = applyConfigurablePanelization(pcb, 2, 2, 4);
    expect(panel.components.length).toBe(pcb.components.length * 4);
    expect(panel.copperPours.length).toBe(4);
    // Tile (0,0) pour still has dependOnBoardOutline=true while cloned tiles set it to false!
    const tile0Pour = panel.copperPours.find((p) => p.netName === 'GND')!;
    expect(tile0Pour.dependOnBoardOutline).toBe(true);
    const repoured = updateAllCopperPours(panel);
    const repouredTile0 = repoured.copperPours.find((p) => p.netName === 'GND')!;
    // After repour, tile 0 pour outline expands to the full 84x64mm panel!
    const maxX = Math.max(...repouredTile0.outline.map((pt) => pt.x));
    expect(maxX).toBeGreaterThan(80);
  });

  it('9. Autorouter, Autoplacer, Meander & Schematic-to-PCB Sync verification', async () => {
    const sch = createDemoRs485GostSchematic();
    const pcb = convertSchematicToPcb(sch);
    expect(pcb.components.length).toBeGreaterThan(0);

    const compareBefore = comparePcbToSchematic(sch, pcb);
    expect(compareBefore.inSync).toBe(true);

    const placed = runAutoplacer(pcb);
    expect(placed.components.length).toBe(pcb.components.length);

    const beforeRats = computeUnroutedRatlines(placed).length;
    expect(beforeRats).toBeGreaterThan(0);

    const { pcb: routed, report } = runAutorouter(placed, DEFAULT_AUTOROUTER_SETTINGS);
    expect(report.routedConnections).toBeGreaterThan(0);
    expect(routed.traces.length).toBeGreaterThan(0);

    if (routed.traces.length > 0) {
      const m = applyMeanderToTrace(routed.traces[0], 4.0, 1.2, 1.2, routed);
      expect(m.points.length).toBeGreaterThanOrEqual(routed.traces[0].points.length);
    }

    // Back-annotate checks value only
    const editedPcb: PcbProject = {
      ...pcb,
      components: pcb.components.map((c, idx) => (idx === 0 ? { ...c, value: '999k', patternId: 'PAT_CUSTOM_MOD' } : c))
    };
    const backSch = backAnnotateSchematic(sch, editedPcb);
    const cmpAfter = comparePcbToSchematic(backSch, editedPcb);
    // Value is synced, patternId is not back-annotated
    expect(cmpAfter.changedNets.some((s) => s.includes('номинал'))).toBe(false);
    expect(cmpAfter.changedNets.some((s) => s.includes('корпус'))).toBe(true);

    const inspect = await inspectGerberProjectOrBytes(routed, true);
    expect(inspect.layers.length).toBeGreaterThanOrEqual(7);
    const svg = exportPcbSvg1to1(routed, 'TopCopper', false);
    expect(svg).toContain('<svg');
  });
});
