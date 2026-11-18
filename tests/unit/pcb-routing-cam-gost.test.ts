import { describe, expect, it } from 'vitest';
import { PcbProject, PcbPlacedComponent } from '../../src/core/types';
import { createImportedPcbProject } from '../../src/engines/importers/projectShells';
import { runPcbDrc } from '../../src/engines/drc';
import { createGostDesignRules, GOST_ACCURACY_CLASS_PRESETS } from '../../src/gost/rules/accuracyClassPresets';
import { exportGerberSet, isViaOnCamLayer } from '../../src/engines/camExport';
import { exportExcellonDrill } from '../../src/engines/cam/excellonAndAssemblyExporter';
import { exportPcbSvg1to1 } from '../../src/engines/cam/dxfAndSvgExporter';
import { generatePcbGCode } from '../../src/engines/gcodeGenerator';
import { computeRouteDraftPoints, computeWalkaroundDetour } from '../../src/ui/modules/pcb/services/pcbRouteGeometry';

describe('PCB Layout, Routing, DRC, Copper Pour & CAM Fabrication Enterprise Suite', () => {

  describe('1. GOST 23751-86 Accuracy Classes 1–5 DRC Compliance', () => {
    it('accurately configures all GOST 23751-86 presets for classes 1 through 5', () => {
      for (const cls of [1, 2, 3, 4, 5] as const) {
        const rules = createGostDesignRules(cls);
        const preset = GOST_ACCURACY_CLASS_PRESETS[cls];
        expect(rules.gostAccuracyClass).toBe(cls);
        expect(rules.minTraceWidth).toBe(preset.minTraceWidth);
        expect(rules.clearanceTraceToTrace).toBe(preset.clearanceTraceToTrace);
        expect(rules.clearanceTraceToPad).toBe(preset.clearanceTraceToPad);
        expect(rules.clearancePadToPad).toBe(preset.clearancePadToPad);
        expect(rules.clearanceViaToAny).toBe(preset.clearanceViaToAny);
        expect(rules.clearanceHoleToHole).toBe(preset.clearanceHoleToHole);
        expect(rules.clearanceCopperToBoard).toBe(preset.clearanceCopperToBoard);
        expect(rules.minAnnularRing).toBe(preset.minAnnularRing);
      }
    });

    it('validates trace width thresholds against GOST accuracy class rules', () => {
      const pcb = createImportedPcbProject({
        filePath: 'gost_rules_board.gostpcb',
        projectName: 'GostRulesBoard',
        components: []
      });
      // 0.20 mm trace:
      // Valid for Class 4 (min 0.15 mm) and Class 5 (min 0.10 mm)
      // Violation for Class 3 (min 0.25 mm), Class 2 (min 0.45 mm), Class 1 (min 0.75 mm)
      pcb.traces.push({
        id: 'tr_test',
        layer: 'TopCopper',
        netName: 'SIG_020',
        width: 0.20,
        points: [{ x: 10, y: 10 }, { x: 30, y: 10 }]
      });

      // Test Class 4 -> No violation
      pcb.designRules = createGostDesignRules(4);
      let errors = runPcbDrc(pcb);
      expect(errors.filter((e) => e.code === 'DRC-WIDTH')).toHaveLength(0);

      // Test Class 3 -> Violation detected
      pcb.designRules = createGostDesignRules(3);
      errors = runPcbDrc(pcb);
      const widthErrsClass3 = errors.filter((e) => e.code === 'DRC-WIDTH');
      expect(widthErrsClass3).toHaveLength(1);
      expect(widthErrsClass3[0].message).toContain('класс 3');

      // Test Class 5 -> No violation
      pcb.designRules = createGostDesignRules(5);
      errors = runPcbDrc(pcb);
      expect(errors.filter((e) => e.code === 'DRC-WIDTH')).toHaveLength(0);
    });

    it('detects Annular Ring violations per GOST 23751 minAnnularRing rules', () => {
      const pcb = createImportedPcbProject({
        filePath: 'annular_board.gostpcb',
        projectName: 'AnnularBoard',
        components: []
      });
      // Via outer 0.6 mm, hole 0.4 mm -> annular ring = (0.6 - 0.4) / 2 = 0.10 mm
      pcb.vias.push({
        id: 'v_annular',
        x: 15,
        y: 15,
        netName: 'GND',
        outerDiameter: 0.6,
        holeDiameter: 0.4,
        startLayer: 'TopCopper',
        endLayer: 'BottomCopper',
        viaStyle: 'Through'
      });

      // Class 3 requires minAnnularRing 0.10 mm -> passes
      pcb.designRules = createGostDesignRules(3);
      let errs = runPcbDrc(pcb);
      expect(errs.filter((e) => e.code === 'DRC-RING')).toHaveLength(0);

      // Class 2 requires minAnnularRing 0.20 mm -> violation!
      pcb.designRules = createGostDesignRules(2);
      errs = runPcbDrc(pcb);
      expect(errs.filter((e) => e.code === 'DRC-RING')).toHaveLength(1);
    });
  });

  describe('2. Routing Ergonomics: Angle Modes & Shove / Walkaround Detour', () => {
    it('computes 45-degree routing segments with elbow flip correctly', () => {
      const last = { x: 10, y: 10 };
      const cur = { x: 25, y: 15 }; // dx = 15, dy = 5 -> minD = 5

      // Elbow flip false: midPt = cur - sign*minD = (25 - 5, 15 - 5) = (20, 10)
      const ptsNormal = computeRouteDraftPoints(last, cur, '45', false);
      expect(ptsNormal).toHaveLength(2);
      expect(ptsNormal[0]).toEqual({ x: 20, y: 10 });
      expect(ptsNormal[1]).toEqual(cur);

      // Elbow flip true: midPt = last + sign*minD = (10 + 5, 10 + 5) = (15, 15)
      const ptsFlipped = computeRouteDraftPoints(last, cur, '45', true);
      expect(ptsFlipped).toHaveLength(2);
      expect(ptsFlipped[0]).toEqual({ x: 15, y: 15 });
      expect(ptsFlipped[1]).toEqual(cur);
    });

    it('computes 90-degree orthogonal routing segments correctly', () => {
      const last = { x: 10, y: 10 };
      const cur = { x: 30, y: 40 };

      // Elbow flip false: horizontal first (cur.x, last.y) = (30, 10)
      const ptsNormal = computeRouteDraftPoints(last, cur, '90', false);
      expect(ptsNormal).toHaveLength(2);
      expect(ptsNormal[0]).toEqual({ x: 30, y: 10 });
      expect(ptsNormal[1]).toEqual(cur);

      // Elbow flip true: vertical first (last.x, cur.y) = (10, 40)
      const ptsFlipped = computeRouteDraftPoints(last, cur, '90', true);
      expect(ptsFlipped).toHaveLength(2);
      expect(ptsFlipped[0]).toEqual({ x: 10, y: 40 });
      expect(ptsFlipped[1]).toEqual(cur);
    });

    it('computes free angle / direct routing without intermediate elbow', () => {
      const last = { x: 10, y: 10 };
      const cur = { x: 32.7, y: 18.4 };
      const ptsFree = computeRouteDraftPoints(last, cur, 'free', false);
      expect(ptsFree).toHaveLength(1);
      expect(ptsFree[0]).toEqual(cur);
    });

    it('calculates walkaround detour when routing near a foreign obstacle pad', () => {
      const pcb = createImportedPcbProject({
        filePath: 'walkaround_board.gostpcb',
        projectName: 'WalkaroundBoard',
        components: [
          {
            id: 'c1',
            refDes: 'U1',
            typeName: 'IC',
            value: '',
            patternId: 'SO8',
            side: 'Top',
            x: 20,
            y: 10, // Obstacle pad directly on path (0,10) -> (40,10)
            angle: 0,
            padNets: { '1': 'OBSTACLE_NET' },
            pads: [
              { id: 'p1', number: '1', type: 'SMD', shape: 'Round', x: 0, y: 0, width: 2, height: 2, layer: 'TopCopper' }
            ],
            graphics: []
          }
        ]
      });
      pcb.designRules.clearanceTraceToPad = 0.5;

      const p1 = { x: 0, y: 10 };
      const p2 = { x: 40, y: 10 };

      // WorldPad for obstacle
      const worldPads = [{
        compId: 'c1',
        refDes: 'U1',
        pad: pcb.components[0].pads[0],
        x: 20,
        y: 10,
        padAngleDeg: 0,
        radius: 1.0,
        effectiveLayer: 'TopCopper' as const,
        netName: 'OBSTACLE_NET'
      }];

      const detour = computeWalkaroundDetour(p1, p2, 'CURRENT_NET', 'TopCopper', pcb, worldPads);
      expect(detour).not.toBeNull();
      // Detour should deflect in Y away from y=10
      expect(Math.abs(detour!.y - 10)).toBeGreaterThanOrEqual(1.5);
    });
  });

  describe('3. CAM Multilayer Gerber & 1:1 SVG Filtering (Blind & Buried Vias)', () => {
    it('accurately identifies whether blind/buried vias exist on specific CAM layers', () => {
      // 4-layer board: TopCopper (0), Inner1 (1), Inner2 (2), BottomCopper (3)
      const buriedVia = {
        id: 'v_buried',
        x: 10,
        y: 10,
        netName: 'GND',
        outerDiameter: 0.8,
        holeDiameter: 0.4,
        startLayer: 'Inner1' as const,
        endLayer: 'Inner2' as const,
        viaStyle: 'Buried' as const
      };

      expect(isViaOnCamLayer(buriedVia, 'TopCopper', 4)).toBe(false);
      expect(isViaOnCamLayer(buriedVia, 'TopMask', 4)).toBe(false);
      expect(isViaOnCamLayer(buriedVia, 'Inner1', 4)).toBe(true);
      expect(isViaOnCamLayer(buriedVia, 'Inner2', 4)).toBe(true);
      expect(isViaOnCamLayer(buriedVia, 'BottomCopper', 4)).toBe(false);
      expect(isViaOnCamLayer(buriedVia, 'BottomMask', 4)).toBe(false);

      const blindVia = {
        id: 'v_blind',
        x: 10,
        y: 10,
        netName: 'SIG',
        outerDiameter: 0.8,
        holeDiameter: 0.4,
        startLayer: 'TopCopper' as const,
        endLayer: 'Inner1' as const,
        viaStyle: 'Blind' as const
      };

      expect(isViaOnCamLayer(blindVia, 'TopCopper', 4)).toBe(true);
      expect(isViaOnCamLayer(blindVia, 'TopMask', 4)).toBe(true);
      expect(isViaOnCamLayer(blindVia, 'Inner1', 4)).toBe(true);
      expect(isViaOnCamLayer(blindVia, 'Inner2', 4)).toBe(false);
      expect(isViaOnCamLayer(blindVia, 'BottomCopper', 4)).toBe(false);
      expect(isViaOnCamLayer(blindVia, 'BottomMask', 4)).toBe(false);
    });

    it('ensures Gerber set omits buried vias from Top and Bottom copper & solder masks', () => {
      const pcb = createImportedPcbProject({
        filePath: 'cam_4layer.gostpcb',
        projectName: 'Cam4Layer',
        components: []
      });
      pcb.layerCount = 4;
      pcb.boardOutline = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }];

      pcb.vias.push({
        id: 'v_inner_only',
        x: 25,
        y: 25,
        netName: 'INT_NET',
        outerDiameter: 0.8,
        holeDiameter: 0.4,
        startLayer: 'Inner1',
        endLayer: 'Inner2',
        viaStyle: 'Buried'
      });

      const cam = exportGerberSet(pcb, true);
      const topCopper = cam.files['Cam4Layer.GTL'];
      const bottomCopper = cam.files['Cam4Layer.GBL'];
      const topMask = cam.files['Cam4Layer.GTS'];
      const bottomMask = cam.files['Cam4Layer.GBS'];
      const inner1 = cam.files['Cam4Layer.G2L'];
      const inner2 = cam.files['Cam4Layer.G3L'];

      // Coordinate for x=25, y=25 is X250000Y250000
      expect(topCopper).not.toContain('X250000Y250000D03*');
      expect(bottomCopper).not.toContain('X250000Y250000D03*');
      expect(topMask).not.toContain('X250000Y250000D03*');
      expect(bottomMask).not.toContain('X250000Y250000D03*');

      // But inner layers MUST contain the via flash!
      expect(inner1).toContain('X250000Y250000D03*');
      expect(inner2).toContain('X250000Y250000D03*');
    });

    it('filters buried vias from 1:1 SVG photomasks', () => {
      const pcb = createImportedPcbProject({
        filePath: 'svg_mask.gostpcb',
        projectName: 'SvgMask',
        components: []
      });
      pcb.layerCount = 4;
      pcb.boardOutline = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }];

      pcb.vias.push({
        id: 'v_buried',
        x: 25,
        y: 25,
        netName: 'NET_INNER',
        outerDiameter: 0.8,
        holeDiameter: 0.4,
        startLayer: 'Inner1',
        endLayer: 'Inner2',
        viaStyle: 'Buried'
      });

      const topSvg = exportPcbSvg1to1(pcb, 'TopCopper', false);
      // Top SVG should NOT contain circle at (25, 25)
      expect(topSvg).not.toContain('cx="25" cy="25"');
    });
  });

  describe('4. CNC G-Code Trace Isolation: Non-Severing Verification', () => {
    it('isolates multi-segment trace along boundary without cross-cutting intermediate joints', () => {
      const pcb = createImportedPcbProject({
        filePath: 'gcode_trace.gostpcb',
        projectName: 'GCodeTrace',
        components: []
      });
      pcb.boardOutline = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }];

      // L-shaped trace: (10, 10) -> (30, 10) -> (30, 40)
      pcb.traces.push({
        id: 'tr_l',
        layer: 'TopCopper',
        netName: 'NET_L',
        width: 0.4,
        points: [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 40 }]
      });

      const res = generatePcbGCode(pcb, {
        toolDiameterMm: 0.2,
        engraveDepth: 0.1,
        cutOutline: false,
        drillHoles: false
      });

      // Verify that isolation segments NEVER cross the centerline of either segment:
      // Segment 1 centerline: y = 10, x from 10 to 30.
      // Segment 2 centerline: x = 30, y from 10 to 40.
      // Any motion across x=30 from y<10 to y>10 or across y=10 from x<30 to x>30 would be a fatal cross-cut!
      for (const seg of res.segments) {
        if (seg.kind !== 'isolation') continue;
        // Check if segment crosses between inner and outer of the trace
        // At intermediate vertex (30, 10):
        // Horizontal cut crossing x=30 at y=10:
        if ((seg.p1.x < 30 && seg.p2.x > 30) || (seg.p1.x > 30 && seg.p2.x < 30)) {
          // If crossing x=30, y must NOT be within trace copper [10 - 0.2, 10 + 0.2]
          const midY = (seg.p1.y + seg.p2.y) / 2;
          expect(midY < 9.8 || midY > 10.2).toBe(true);
        }
      }
    });

    it('preserves electrical connection when trace connects to same-net pad', () => {
      const pcb = createImportedPcbProject({
        filePath: 'gcode_conn.gostpcb',
        projectName: 'GCodeConn',
        components: [
          {
            id: 'c1',
            refDes: 'R1',
            typeName: 'RES',
            value: '',
            patternId: '0805',
            side: 'Top',
            x: 10,
            y: 10,
            angle: 0,
            padNets: { '1': 'NET_PAD' },
            pads: [{ id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: 0, y: 0, width: 2, height: 2, layer: 'TopCopper' }],
            graphics: []
          },
          {
            id: 'c2',
            refDes: 'R2',
            typeName: 'RES',
            value: '',
            patternId: '0805',
            side: 'Top',
            x: 30,
            y: 10,
            angle: 0,
            padNets: { '1': 'NET_PAD' },
            pads: [{ id: 'p2', number: '1', type: 'SMD', shape: 'Rect', x: 0, y: 0, width: 2, height: 2, layer: 'TopCopper' }],
            graphics: []
          }
        ]
      });
      pcb.boardOutline = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }];

      // Connected trace directly joining R1 pad 1 and R2 pad 1
      pcb.traces.push({
        id: 'tr_conn',
        layer: 'TopCopper',
        netName: 'NET_PAD',
        width: 0.5,
        points: [{ x: 10, y: 10 }, { x: 30, y: 10 }]
      });

      const res = generatePcbGCode(pcb, {
        toolDiameterMm: 0.2,
        engraveDepth: 0.1,
        cutOutline: false,
        drillHoles: false
      });

      // Isolation loops should have 2 open paths (top side and bottom side) rather than a closed cross-cutting cap!
      expect(res.stats.isolationLoops).toBeGreaterThanOrEqual(2);

      // Verify that NO isolation segment cuts vertically across the trace centerline between y=9.7 and y=10.3 at the endpoints
      for (const seg of res.segments) {
        if (seg.kind !== 'isolation') continue;
        const isVerticalCutAcrossEnd =
          (Math.abs(seg.p1.x - 10) < 0.5 && Math.abs(seg.p2.x - 10) < 0.5 && seg.p1.y < 10 && seg.p2.y > 10) ||
          (Math.abs(seg.p1.x - 30) < 0.5 && Math.abs(seg.p2.x - 30) < 0.5 && seg.p1.y < 10 && seg.p2.y > 10);
        expect(isVerticalCutAcrossEnd).toBe(false);
      }
    });
  });

});
