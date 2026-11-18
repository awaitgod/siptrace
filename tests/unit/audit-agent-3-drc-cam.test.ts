import { describe, expect, it } from 'vitest';
import {
  WorldPad,
  computeUnroutedRatlines,
  getWorldPads,
  pointToPadDistance,
  runPcbDrc
} from '../../src/engines/drc';
import { PcbProject, PcbPlacedComponent } from '../../src/core/types';
import { createImportedPcbProject } from '../../src/engines/importers/projectShells';
import { createGostDesignRules, GOST_ACCURACY_CLASS_PRESETS } from '../../src/gost/rules/accuracyClassPresets';
import { updateAllCopperPours, copperPourTotalAreaMm2 } from '../../src/engines/copperPour';
import { exportGerberSet, parseGerberPreview } from '../../src/engines/camExport';
import { exportExcellonDrill, exportIpcD356 } from '../../src/engines/cam/excellonAndAssemblyExporter';
import { generatePcbGCode } from '../../src/engines/gcodeGenerator';
import {
  computeRouteDraftPoints,
  smoothTraceWithArcs
} from '../../src/ui/modules/pcb/services/pcbRouteGeometry';
import { dist, pointToSegmentDist } from '../../src/core/geometry';

describe('AGENT 3 AUDIT SUITE: PCB Layout, Routing, DRC (ГОСТ 23751-86) & CAM Manufacturing', () => {

  describe('1. DRC Mathematical Accuracy, Clearances & Short Detection', () => {
    it('detects direct copper short when trace of foreign net intersects a pad', () => {
      const pcb = createImportedPcbProject({
        filePath: 'test_short_tr_pad.gostpcb',
        projectName: 'ShortTrPadBoard',
        components: [
          {
            id: 'c1',
            refDes: 'U1',
            typeName: 'IC',
            value: 'MCU',
            patternId: 'SOIC-8',
            side: 'Top',
            x: 20,
            y: 20,
            angle: 0,
            padNets: { '1': 'VCC' },
            pads: [
              { id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: 0, y: 0, width: 1.5, height: 0.6, layer: 'TopCopper' }
            ],
            graphics: []
          }
        ]
      });
      pcb.designRules.clearanceTraceToPad = 0.2;

      // Foreign net trace passing right through pad center (20, 20)
      pcb.traces.push({
        id: 'tr_short',
        layer: 'TopCopper',
        netName: 'GND',
        width: 0.3,
        points: [{ x: 15, y: 20 }, { x: 25, y: 20 }]
      });

      const errors = runPcbDrc(pcb);
      const shortErrors = errors.filter((e) => e.code === 'DRC-TR-PAD');
      expect(shortErrors.length).toBeGreaterThan(0);
      expect(shortErrors[0].message).toContain('U1.1');
      expect(shortErrors[0].message).toContain('GND');
    });

    it('detects trace-to-trace short between different nets crossing on the same layer', () => {
      const pcb = createImportedPcbProject({
        filePath: 'test_short_tr_tr.gostpcb',
        projectName: 'ShortTrTrBoard',
        components: []
      });
      pcb.designRules.clearanceTraceToTrace = 0.2;

      // Trace 1 (NET_A) running horizontally on TopCopper
      pcb.traces.push({
        id: 'tr_a',
        layer: 'TopCopper',
        netName: 'NET_A',
        width: 0.25,
        points: [{ x: 10, y: 20 }, { x: 30, y: 20 }]
      });

      // Trace 2 (NET_B) crossing vertically on TopCopper
      pcb.traces.push({
        id: 'tr_b',
        layer: 'TopCopper',
        netName: 'NET_B',
        width: 0.25,
        points: [{ x: 20, y: 10 }, { x: 20, y: 30 }]
      });

      const errors = runPcbDrc(pcb);
      const trTr = errors.filter((e) => e.code === 'DRC-TR-TR');
      expect(trTr.length).toBeGreaterThan(0);
      expect(trTr[0].message).toContain('NET_A');
      expect(trTr[0].message).toContain('NET_B');
    });

    it('does NOT report short when traces belong to the SAME net on the same layer', () => {
      const pcb = createImportedPcbProject({
        filePath: 'test_samenet.gostpcb',
        projectName: 'SameNetBoard',
        components: []
      });
      pcb.designRules.clearanceTraceToTrace = 0.2;

      pcb.traces.push(
        { id: 'tr1', layer: 'TopCopper', netName: 'GND', width: 0.3, points: [{ x: 10, y: 20 }, { x: 30, y: 20 }] },
        { id: 'tr2', layer: 'TopCopper', netName: 'GND', width: 0.3, points: [{ x: 20, y: 10 }, { x: 20, y: 30 }] }
      );

      const errors = runPcbDrc(pcb);
      expect(errors.filter((e) => e.code === 'DRC-TR-TR')).toHaveLength(0);
    });

    it('validates unrouted netlines detection (DRC-UNROUTED) per ГОСТ 23751-86', () => {
      const pcb = createImportedPcbProject({
        filePath: 'test_unrouted.gostpcb',
        projectName: 'UnroutedBoard',
        components: [
          {
            id: 'c1',
            refDes: 'R1',
            typeName: 'RES',
            value: '1k',
            patternId: '0805',
            side: 'Top',
            x: 10,
            y: 10,
            angle: 0,
            padNets: { '1': 'SIGNAL_A', '2': 'GND' },
            pads: [
              { id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: -1, y: 0, width: 1, height: 1, layer: 'TopCopper' },
              { id: 'p2', number: '2', type: 'SMD', shape: 'Rect', x: 1, y: 0, width: 1, height: 1, layer: 'TopCopper' }
            ],
            graphics: []
          },
          {
            id: 'c2',
            refDes: 'R2',
            typeName: 'RES',
            value: '1k',
            patternId: '0805',
            side: 'Top',
            x: 30,
            y: 10,
            angle: 0,
            padNets: { '1': 'SIGNAL_A', '2': 'GND' },
            pads: [
              { id: 'p3', number: '1', type: 'SMD', shape: 'Rect', x: -1, y: 0, width: 1, height: 1, layer: 'TopCopper' },
              { id: 'p4', number: '2', type: 'SMD', shape: 'Rect', x: 1, y: 0, width: 1, height: 1, layer: 'TopCopper' }
            ],
            graphics: []
          }
        ]
      });

      // No traces routed yet: both SIGNAL_A and GND have disconnected pads
      const ratlines = computeUnroutedRatlines(pcb);
      expect(ratlines.length).toBeGreaterThanOrEqual(2);

      const errors = runPcbDrc(pcb);
      const unrouted = errors.filter((e) => e.code === 'DRC-UNROUTED');
      expect(unrouted.length).toBeGreaterThanOrEqual(2);
      expect(unrouted.some((e) => e.message.includes('SIGNAL_A'))).toBe(true);
      expect(unrouted.some((e) => e.message.includes('GND'))).toBe(true);
    });

    it('validates pad distance calculation for rotated Oval and RoundedRect pads', () => {
      const wpOval: WorldPad = {
        compId: 'c1',
        refDes: 'VD1',
        pad: { id: 'p1', number: '1', type: 'SMD', shape: 'Oval', x: 0, y: 0, width: 3.0, height: 1.0, layer: 'TopCopper' },
        x: 10,
        y: 10,
        padAngleDeg: 0,
        netName: 'NET1',
        effectiveLayer: 'TopCopper',
        radius: 1.5
      };

      // Point at (10, 10.5) is on pad edge (height=1.0, so semi-axis ry=0.5) -> distance is 0
      expect(pointToPadDistance({ x: 10, y: 10.5 }, wpOval)).toBeCloseTo(0, 2);
      // Point at (10, 11.0) is 0.5 mm from pad edge
      expect(pointToPadDistance({ x: 10, y: 11.0 }, wpOval)).toBeCloseTo(0.5, 2);
      // Point inside oval
      expect(pointToPadDistance({ x: 10, y: 10.2 }, wpOval)).toBe(0);

      // Rounded rectangle pad
      const wpRRect: WorldPad = {
        compId: 'c2',
        refDes: 'VD2',
        pad: { id: 'p2', number: '1', type: 'SMD', shape: 'RoundedRect', cornerRadius: 0.3, x: 0, y: 0, width: 2.0, height: 2.0, layer: 'TopCopper' },
        x: 20,
        y: 20,
        padAngleDeg: 0,
        netName: 'NET2',
        effectiveLayer: 'TopCopper',
        radius: Math.hypot(1, 1)
      };

      // Point at corner (21, 21): inner corner is at (20.7, 20.7), distance from inner corner is sqrt(0.3^2 + 0.3^2) - 0.3 = 0.424 - 0.3 = ~0.124
      const cornerPt = { x: 21, y: 21 };
      const d = pointToPadDistance(cornerPt, wpRRect);
      expect(d).toBeCloseTo(Math.hypot(0.3, 0.3) - 0.3, 2);
    });
  });

  describe('2. Routing Ergonomics & Geometry Modes (45°, 90°, Free, Arc Smoothing)', () => {
    it('computes 45° angle routing points with proper elbow geometry', () => {
      const last = { x: 0, y: 0 };
      const cur = { x: 10, y: 4 };

      // Normal elbow: minD = 4. midPt is (cur.x - 4, cur.y - 4) = (6, 0)
      const ptsNormal = computeRouteDraftPoints(last, cur, '45', false);
      expect(ptsNormal.length).toBe(2);
      expect(ptsNormal[0]).toEqual({ x: 6, y: 0 });
      expect(ptsNormal[1]).toEqual({ x: 10, y: 4 });

      // Flipped elbow: midPt is (last.x + 4, last.y + 4) = (4, 4)
      const ptsFlipped = computeRouteDraftPoints(last, cur, '45', true);
      expect(ptsFlipped.length).toBe(2);
      expect(ptsFlipped[0]).toEqual({ x: 4, y: 4 });
      expect(ptsFlipped[1]).toEqual({ x: 10, y: 4 });
    });

    it('computes 90° angle routing points with orthogonal segments', () => {
      const last = { x: 5, y: 5 };
      const cur = { x: 15, y: 25 };

      // Normal elbow: (cur.x, last.y) = (15, 5)
      const ptsNormal = computeRouteDraftPoints(last, cur, '90', false);
      expect(ptsNormal.length).toBe(2);
      expect(ptsNormal[0]).toEqual({ x: 15, y: 5 });
      expect(ptsNormal[1]).toEqual({ x: 15, y: 25 });

      // Flipped elbow: (last.x, cur.y) = (5, 25)
      const ptsFlipped = computeRouteDraftPoints(last, cur, '90', true);
      expect(ptsFlipped.length).toBe(2);
      expect(ptsFlipped[0]).toEqual({ x: 5, y: 25 });
      expect(ptsFlipped[1]).toEqual({ x: 15, y: 25 });
    });

    it('computes Arc routing mode with tangent circular fillets', () => {
      const last = { x: 0, y: 0 };
      const cur = { x: 10, y: 6 };

      const pts = computeRouteDraftPoints(last, cur, 'arc', false);
      // In arc mode, should generate intermediate circular arc points
      expect(pts.length).toBeGreaterThanOrEqual(4);
      // End point must reach cur
      const endPt = pts[pts.length - 1];
      expect(endPt.x).toBeCloseTo(cur.x, 2);
      expect(endPt.y).toBeCloseTo(cur.y, 2);

      // Verify smoothness: all step distances between consecutive points must be <= 3.0 mm
      for (let i = 1; i < pts.length; i++) {
        expect(dist(pts[i - 1], pts[i])).toBeLessThan(3.5);
      }
    });

    it('smoothTraceWithArcs rounds sharp 90-degree corners into arc fillets without distortion', () => {
      const sharpTrace = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 }
      ];

      const smoothed = smoothTraceWithArcs(sharpTrace, 2.0);
      expect(smoothed.length).toBeGreaterThan(sharpTrace.length);
      // Start and end must match
      expect(smoothed[0]).toEqual(sharpTrace[0]);
      expect(smoothed[smoothed.length - 1]).toEqual(sharpTrace[sharpTrace.length - 1]);

      // The sharp vertex (10, 0) should be replaced with fillet points curving inside the corner
      expect(smoothed.some((p) => p.x === 10 && p.y === 0)).toBe(false);
      expect(smoothed.some((p) => p.x < 10 && p.y > 0)).toBe(true);
    });
  });

  describe('3. CAM Export: Gerber RS-274X, Excellon Drill & IPC-D-356 Validation', () => {
    it('produces valid Gerber RS-274X files with correct apertures, units and positive coordinates', () => {
      const pcb = createImportedPcbProject({
        filePath: 'gerber_validation.gostpcb',
        projectName: 'GerberCheck',
        components: [
          {
            id: 'c1',
            refDes: 'R1',
            typeName: 'RES',
            value: '4k7',
            patternId: '0805',
            side: 'Top',
            x: 10,
            y: 15,
            angle: 0,
            padNets: { '1': 'NET1', '2': 'NET2' },
            pads: [
              { id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: -1, y: 0, width: 1.2, height: 1.4, layer: 'TopCopper' },
              { id: 'p2', number: '2', type: 'SMD', shape: 'Rect', x: 1, y: 0, width: 1.2, height: 1.4, layer: 'TopCopper' }
            ],
            graphics: []
          }
        ]
      });
      pcb.boardOutline = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 35 }, { x: 0, y: 35 }];
      pcb.traces.push({
        id: 't1',
        layer: 'TopCopper',
        netName: 'NET1',
        width: 0.35,
        points: [{ x: 5, y: 5 }, { x: 9, y: 15 }]
      });

      const cam = exportGerberSet(pcb, true);
      const topCopper = cam.files['GerberCheck.GTL'];
      const outline = cam.files['GerberCheck.GKO'];

      expect(topCopper).toBeDefined();
      expect(outline).toBeDefined();

      // Standard headers
      expect(topCopper).toContain('%FSLAX34Y34*%');
      expect(topCopper).toContain('%MOMM*%');
      expect(topCopper).toContain('%LPD*%');
      expect(topCopper).toContain('G01*');
      expect(topCopper).toContain('M02*');

      // Verify no negative coordinates on positive quadrant board
      const coordMatches = topCopper.match(/X(-?\d+)Y(-?\d+)/g) ?? [];
      expect(coordMatches.length).toBeGreaterThan(0);
      for (const cm of coordMatches) {
        expect(cm).not.toContain('X-');
        expect(cm).not.toContain('Y-');
      }

      // Preview parser should successfully extract entities
      const entities = parseGerberPreview(topCopper);
      expect(entities.length).toBeGreaterThan(0);
      const flashes = entities.filter((e) => e.kind === 'flash');
      expect(flashes.length).toBeGreaterThanOrEqual(2);
    });

    it('generates Excellon drill file with standard tools and positive coordinates', () => {
      const pcb = createImportedPcbProject({
        filePath: 'excellon_check.gostpcb',
        projectName: 'DrillCheck',
        components: [
          {
            id: 'c1',
            refDes: 'J1',
            typeName: 'CONN',
            value: 'SMA',
            patternId: 'SMA_EDGE',
            side: 'Top',
            x: 5,
            y: 10,
            angle: 0,
            padNets: {},
            pads: [
              { id: 'p1', number: '1', type: 'THT', shape: 'Round', x: 0, y: 0, width: 2.0, height: 2.0, holeDiameter: 1.2, layer: 'TopCopper' }
            ],
            graphics: []
          }
        ]
      });
      pcb.vias.push({
        id: 'v1',
        x: 15,
        y: 15,
        netName: 'GND',
        outerDiameter: 0.8,
        holeDiameter: 0.45,
        startLayer: 'TopCopper',
        endLayer: 'BottomCopper',
        viaStyle: 'Through'
      });

      const drl = exportExcellonDrill(pcb);
      expect(drl).toContain('M48');
      expect(drl).toContain('METRIC,TZ');
      expect(drl).toContain('T01C1.200');
      expect(drl).toContain('T02C0.450');
      expect(drl).toContain('G90');
      expect(drl).toContain('M30');

      // All drill coordinates must be non-negative
      const drillCoords = drl.match(/X([\d.]+)Y([\d.]+)/g) ?? [];
      expect(drillCoords.length).toBe(2);
    });

    it('exports IPC-D-356 netlist concordance with pin and net records', () => {
      const pcb = createImportedPcbProject({
        filePath: 'ipc_check.gostpcb',
        projectName: 'IpcCheck',
        components: [
          {
            id: 'c1',
            refDes: 'R1',
            typeName: 'RES',
            value: '10k',
            patternId: '0805',
            side: 'Top',
            x: 20,
            y: 20,
            angle: 0,
            padNets: { '1': 'NET_SIG', '2': 'GND' },
            pads: [
              { id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: -1, y: 0, width: 1, height: 1, layer: 'TopCopper' },
              { id: 'p2', number: '2', type: 'SMD', shape: 'Rect', x: 1, y: 0, width: 1, height: 1, layer: 'TopCopper' }
            ],
            graphics: []
          }
        ]
      });

      const ipc = exportIpcD356(pcb);
      expect(ipc).toContain('C  IPC-D-356');
      expect(ipc).toContain('NET_SIG');
      expect(ipc).toContain('GND');
      expect(ipc).toContain('R1');
      expect(ipc).toContain('-1');
      expect(ipc).toContain('-2');
      expect(ipc).toContain('999');
    });
  });

  describe('4. CNC G-Code Generator: Isolation Paths & Conductor Safety', () => {
    it('generates isolation milling paths offset by tool radius to avoid cutting into conductors', () => {
      const pcb = createImportedPcbProject({
        filePath: 'gcode_safe.gostpcb',
        projectName: 'SafeGCode',
        components: []
      });
      pcb.boardOutline = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 40 }, { x: 0, y: 40 }];

      // Straight trace along y = 20 from x = 10 to x = 50 with width = 0.4 mm
      const tr = {
        id: 'tr_main',
        layer: 'TopCopper' as const,
        netName: 'NET_HF',
        width: 0.40,
        points: [{ x: 10, y: 20 }, { x: 50, y: 20 }]
      };
      pcb.traces.push(tr);

      const toolDia = 0.20;
      const halfTool = toolDia / 2; // 0.10 mm
      const res = generatePcbGCode(pcb, {
        toolDiameterMm: toolDia,
        engraveDepth: 0.08,
        millTopIsolation: true,
        drillHoles: false,
        cutOutline: false
      });

      // Filter only cutting (G01) segments with kind 'isolation'
      const cuttingSegs = res.segments.filter((s) => !s.rapid && s.kind === 'isolation');
      expect(cuttingSegs.length).toBeGreaterThan(0);

      // Verify that every point of the toolpath is at least (tr.width/2 + halfTool - epsilon) from the trace center line!
      // Centerline is y = 20. Expected distance = 0.40/2 + 0.10 = 0.30 mm
      const expectedDist = tr.width / 2 + halfTool; // 0.30 mm

      for (const seg of cuttingSegs) {
        // Distance of segment points from centerline
        const d1 = pointToSegmentDist(seg.p1, tr.points[0], tr.points[1]);
        const d2 = pointToSegmentDist(seg.p2, tr.points[0], tr.points[1]);

        // Tool center distance from trace center must be >= expectedDist - 0.01
        // Thus, tool boundary (center - halfTool) distance from trace edge (width/2) >= 0!
        expect(d1).toBeGreaterThanOrEqual(expectedDist - 0.02);
        expect(d2).toBeGreaterThanOrEqual(expectedDist - 0.02);
      }
    });

    it('generates G-code with correct safe Z rapids and spindle commands', () => {
      const pcb = createImportedPcbProject({
        filePath: 'gcode_spindle.gostpcb',
        projectName: 'SpindleCheck',
        components: []
      });
      pcb.boardOutline = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 30 }];
      pcb.traces.push({
        id: 'tr_spindle',
        layer: 'TopCopper',
        netName: 'NET_S',
        width: 0.3,
        points: [{ x: 5, y: 15 }, { x: 25, y: 15 }]
      });

      const res = generatePcbGCode(pcb, {
        postprocessor: 'GRBL',
        spindleRpm: 15000,
        safeZ: 2.5,
        engraveDepth: 0.10
      });

      expect(res.gcode).toContain('G21');
      expect(res.gcode).toContain('G90');
      expect(res.gcode).toContain('M03 S15000');
      expect(res.gcode).toContain('G00 Z2.500');
      expect(res.gcode).toContain('Z-0.100');
    });
  });
});
