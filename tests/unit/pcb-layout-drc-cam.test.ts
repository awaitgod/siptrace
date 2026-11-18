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
import { applyMeanderToTrace } from '../../src/engines/autorouter';
import { updateAllCopperPours, copperPourTotalAreaMm2, updateCopperPour } from '../../src/engines/copperPour';
import { exportGerberSet, parseGerberPreview } from '../../src/engines/camExport';
import { exportExcellonDrill } from '../../src/engines/cam/excellonAndAssemblyExporter';
import { generatePcbGCode } from '../../src/engines/gcodeGenerator';

describe('PCB Layout, DRC, Copper Pour & CAM Fabrication Verification', () => {

  describe('1. DRC Clearance Formulas & Geometry Precision', () => {
    it('calculates exact bounding radius for rotated rectangular pads without underestimation', () => {
      const pcb = createImportedPcbProject({
        filePath: 'test_rect.gostpcb',
        projectName: 'RectPadTest',
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
            angle: 45,
            padNets: { '1': 'NET1' },
            pads: [
              {
                id: 'p1',
                number: '1',
                type: 'SMD',
                shape: 'Rect',
                x: 0,
                y: 0,
                width: 2.0,
                height: 2.0,
                layer: 'TopCopper'
              }
            ],
            graphics: []
          }
        ]
      });

      const wp = getWorldPads(pcb)[0];
      // For a 2.0 x 2.0 square pad, semi-axes are rx=1.0, ry=1.0.
      // Maximum distance from center to corner is sqrt(1^2 + 1^2) = ~1.414 mm.
      // Under old code, Math.max(1.0, 1.0) = 1.0 mm, underestimating radius by 29.3%!
      expect(wp.radius).toBeGreaterThanOrEqual(1.41);
    });

    it('detects Pad-to-Pad clearance violation between rotated pads near corners', () => {
      const pcb = createImportedPcbProject({
        filePath: 'test_p2p.gostpcb',
        projectName: 'PadToPadTest',
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
            angle: 45,
            padNets: { '1': 'NET1' },
            pads: [
              { id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: 0, y: 0, width: 2.0, height: 2.0, layer: 'TopCopper' }
            ],
            graphics: []
          },
          {
            id: 'c2',
            refDes: 'R2',
            typeName: 'RES',
            value: '10k',
            patternId: '0805',
            side: 'Top',
            x: 22.9,
            y: 20,
            angle: 45,
            padNets: { '1': 'NET2' },
            pads: [
              { id: 'p2', number: '1', type: 'SMD', shape: 'Rect', x: 0, y: 0, width: 2.0, height: 2.0, layer: 'TopCopper' }
            ],
            graphics: []
          }
        ]
      });
      pcb.designRules.clearancePadToPad = 0.5;

      const errors = runPcbDrc(pcb);
      const p2p = errors.filter((e) => e.code === 'DRC-PAD-PAD');
      expect(p2p.length).toBeGreaterThan(0);
    });

    it('detects Trace-to-Pad clearance violation for trace passing near pad corner', () => {
      const pcb = createImportedPcbProject({
        filePath: 'test_t2p.gostpcb',
        projectName: 'TraceToPadTest',
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
            padNets: { '1': 'NET1' },
            pads: [
              { id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: 0, y: 0, width: 2.0, height: 2.0, layer: 'TopCopper' }
            ],
            graphics: []
          }
        ]
      });
      pcb.designRules.clearanceTraceToPad = 0.4;
      // Pad corner is at (21, 21). Diagonal distance is sqrt(2)=1.414 from center.
      // A trace passing diagonally at (21.2, 21.2) is 0.28 mm from corner < 0.4 mm clearance.
      pcb.traces.push({
        id: 'tr1',
        layer: 'TopCopper',
        netName: 'OTHER_NET',
        width: 0.2,
        points: [{ x: 20, y: 22.2 }, { x: 22.2, y: 20 }]
      });

      const errors = runPcbDrc(pcb);
      const t2p = errors.filter((e) => e.code === 'DRC-TR-PAD');
      expect(t2p.length).toBeGreaterThan(0);
    });

    it('only checks blind/buried via clearances on shared copper layers', () => {
      const pcb = createImportedPcbProject({
        filePath: 'test_vias.gostpcb',
        projectName: 'ViaLayersTest',
        components: []
      });
      pcb.layerCount = 4;
      pcb.designRules.clearanceViaToAny = 0.3;

      // Via 1 on TopCopper -> Inner1 (span 0-1)
      pcb.vias.push({
        id: 'v1',
        x: 10,
        y: 10,
        netName: 'NET_A',
        outerDiameter: 0.8,
        holeDiameter: 0.4,
        startLayer: 'TopCopper',
        endLayer: 'Inner1',
        viaStyle: 'Blind'
      });

      // Via 2 on Inner2 -> BottomCopper (span 2-3) at same X,Y (no layer overlap)
      pcb.vias.push({
        id: 'v2',
        x: 10.2,
        y: 10,
        netName: 'NET_B',
        outerDiameter: 0.8,
        holeDiameter: 0.4,
        startLayer: 'Inner2',
        endLayer: 'BottomCopper',
        viaStyle: 'Buried'
      });

      let errs = runPcbDrc(pcb);
      expect(errs.filter((e) => e.code === 'DRC-VIA-VIA')).toHaveLength(0);

      // Now change Via 2 to span Inner1 -> BottomCopper (overlaps Inner1!)
      pcb.vias[1].startLayer = 'Inner1';
      errs = runPcbDrc(pcb);
      expect(errs.filter((e) => e.code === 'DRC-VIA-VIA')).toHaveLength(1);
    });

    it('detects Hole-to-Hole (Drill-to-Drill) clearance violations per GOST 23751', () => {
      const pcb = createImportedPcbProject({
        filePath: 'test_h2h.gostpcb',
        projectName: 'HoleToHoleTest',
        components: []
      });
      pcb.vias.push(
        { id: 'v1', x: 10, y: 10, netName: 'GND', outerDiameter: 0.8, holeDiameter: 0.5, startLayer: 'TopCopper', endLayer: 'BottomCopper', viaStyle: 'Through' },
        { id: 'v2', x: 10.4, y: 10, netName: 'GND', outerDiameter: 0.8, holeDiameter: 0.5, startLayer: 'TopCopper', endLayer: 'BottomCopper', viaStyle: 'Through' }
      );
      // Holes are 0.4 mm center-to-center. Hole diameter is 0.5 mm -> Holes intersect!
      const errs = runPcbDrc(pcb);
      expect(errs.some((e) => e.code === 'DRC-HOLE-HOLE')).toBe(true);
    });

    it('detects acid trap acute angles (< 45 degrees)', () => {
      const pcb = createImportedPcbProject({
        filePath: 'test_acid.gostpcb',
        projectName: 'AcidTrapTest',
        components: []
      });
      // Acute 30-degree bend
      pcb.traces.push({
        id: 't_acute',
        layer: 'TopCopper',
        netName: 'SIG',
        width: 0.25,
        points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 1, y: 3 }]
      });
      const errs = runPcbDrc(pcb);
      expect(errs.some((e) => e.code === 'DRC-ACID-TRAP')).toBe(true);
    });
  });

  describe('2. Copper Pour Generation & Thermal Reliefs', () => {
    it('generates thermal relief spokes on same-net pads with correct clearance to foreign pads', () => {
      const pcb = createImportedPcbProject({
        filePath: 'test_pour.gostpcb',
        projectName: 'PourTest',
        components: [
          {
            id: 'c1',
            refDes: 'R1',
            typeName: 'RES',
            value: '10k',
            patternId: '0805',
            side: 'Top',
            x: 25,
            y: 25,
            angle: 0,
            padNets: { '1': 'GND', '2': 'VCC' },
            pads: [
              { id: 'p1', number: '1', type: 'THT', shape: 'Round', x: -5, y: 0, width: 2, height: 2, holeDiameter: 1, layer: 'TopCopper' },
              { id: 'p2', number: '2', type: 'THT', shape: 'Round', x: 5, y: 0, width: 2, height: 2, holeDiameter: 1, layer: 'TopCopper' }
            ],
            graphics: []
          }
        ]
      });
      pcb.boardOutline = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }];
      pcb.copperPours.push({
        id: 'pour_gnd',
        layer: 'TopCopper',
        netName: 'GND',
        outline: [{ x: 5, y: 5 }, { x: 45, y: 5 }, { x: 45, y: 45 }, { x: 5, y: 45 }],
        dependOnBoardOutline: false,
        boardClearance: 0.5,
        clearance: 0.5,
        fillType: 'Solid',
        lineWidth: 0.25,
        lineSpacing: 0.5,
        thermalType: '4Spoke',
        thermalSpokeWidth: 0.4,
        thermalGap: 0.4,
        removeIslands: true,
        priority: 1,
        poured: false
      });

      const updated = updateAllCopperPours(pcb);
      const pour = updated.copperPours[0];
      expect(pour.poured).toBe(true);
      expect(pour.computedIslands!.length).toBeGreaterThan(0);
      expect(copperPourTotalAreaMm2(pour)).toBeGreaterThan(100);

      // Verify DRC on the poured board does not report false clearance violations against same-net thermal pad
      const errs = runPcbDrc(updated);
      const gndPadClearanceErr = errs.filter((e) => e.code === 'DRC-POUR-CLEARANCE' && e.message.includes('R1.1'));
      expect(gndPadClearanceErr).toHaveLength(0);
    });

    it('supports Direct thermal relief connecting pad seamlessly', () => {
      const pcb = createImportedPcbProject({
        filePath: 'test_direct.gostpcb',
        projectName: 'DirectPourTest',
        components: [
          {
            id: 'c1',
            refDes: 'PAD1',
            typeName: 'PAD',
            value: '',
            patternId: 'PAD',
            side: 'Top',
            x: 25,
            y: 25,
            angle: 0,
            padNets: { '1': 'GND' },
            pads: [{ id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: 0, y: 0, width: 4, height: 4, layer: 'TopCopper' }],
            graphics: []
          }
        ]
      });
      pcb.boardOutline = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }];
      pcb.copperPours.push({
        id: 'pour_direct',
        layer: 'TopCopper',
        netName: 'GND',
        outline: [{ x: 5, y: 5 }, { x: 45, y: 5 }, { x: 45, y: 45 }, { x: 5, y: 45 }],
        dependOnBoardOutline: false,
        boardClearance: 0.5,
        clearance: 0.5,
        fillType: 'Solid',
        lineWidth: 0.25,
        lineSpacing: 0.5,
        thermalType: 'Direct',
        thermalSpokeWidth: 0.4,
        thermalGap: 0.4,
        removeIslands: true,
        priority: 1,
        poured: false
      });

      const updated = updateAllCopperPours(pcb);
      expect(updated.copperPours[0].poured).toBe(true);
      expect(copperPourTotalAreaMm2(updated.copperPours[0])).toBeGreaterThan(200);
    });
  });

  describe('3. CAM Export (Gerber RS-274X, Excellon, G-Code)', () => {
    it('generates standard compliant Gerber with G01, aperture macros and flashed pads', () => {
      const pcb = createImportedPcbProject({
        filePath: 'test_cam.gostpcb',
        projectName: 'CamBoard',
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
            angle: 30, // Rotated angle requiring macro
            padNets: { '1': 'NET1', '2': 'NET2' },
            pads: [
              { id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: -1, y: 0, width: 1, height: 1.2, layer: 'TopCopper' },
              { id: 'p2', number: '2', type: 'SMD', shape: 'Rect', x: 1, y: 0, width: 1, height: 1.2, layer: 'TopCopper' }
            ],
            graphics: []
          }
        ]
      });
      pcb.boardOutline = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }];
      pcb.traces.push({
        id: 't1',
        layer: 'TopCopper',
        netName: 'NET1',
        width: 0.3,
        points: [{ x: 10, y: 10 }, { x: 19, y: 20 }]
      });

      const cam = exportGerberSet(pcb, true);
      const topCopper = cam.files['CamBoard.GTL'];
      expect(topCopper).toBeDefined();

      // Check Header standards
      expect(topCopper).toContain('%FSLAX34Y34*%');
      expect(topCopper).toContain('%MOMM*%');
      expect(topCopper).toContain('%LPD*%');
      expect(topCopper).toContain('G01*');

      // Check ROTRECT aperture macro declaration for 30 deg pad
      expect(topCopper).toContain('%AMROTRECT*21,1,$1,$2,0,0,$3*%');
      expect(topCopper).toContain('ROTRECT');

      // Check Pad flash D03 and trace draw D01
      expect(topCopper).toContain('D03*');
      expect(topCopper).toContain('D01*');
      expect(topCopper).toContain('M02*');

      // Preview parser should successfully parse pads and traces
      const parsed = parseGerberPreview(topCopper);
      expect(parsed.length).toBeGreaterThan(2);
    });

    it('generates Excellon drill file with T-tools and G90 coordinates', () => {
      const pcb = createImportedPcbProject({
        filePath: 'test_drl.gostpcb',
        projectName: 'DrillBoard',
        components: [
          {
            id: 'c1',
            refDes: 'XP1',
            typeName: 'CONN',
            value: '',
            patternId: 'CONN3',
            side: 'Top',
            x: 10,
            y: 10,
            angle: 0,
            padNets: {},
            pads: [
              { id: 'p1', number: '1', type: 'THT', shape: 'Round', x: 0, y: 0, width: 1.8, height: 1.8, holeDiameter: 1.0, layer: 'TopCopper' },
              { id: 'p2', number: '2', type: 'THT', shape: 'Round', x: 2.54, y: 0, width: 1.8, height: 1.8, holeDiameter: 1.0, layer: 'TopCopper' }
            ],
            graphics: []
          }
        ]
      });
      pcb.vias.push({
        id: 'v1',
        x: 20,
        y: 20,
        netName: 'GND',
        outerDiameter: 0.8,
        holeDiameter: 0.4,
        startLayer: 'TopCopper',
        endLayer: 'BottomCopper',
        viaStyle: 'Through'
      });

      const drl = exportExcellonDrill(pcb);
      expect(drl).toContain('M48');
      expect(drl).toContain('METRIC,TZ');
      expect(drl).toContain('T01C1.000');
      expect(drl).toContain('T02C0.400');
      expect(drl).toContain('G90');
      expect(drl).toContain('M30');
    });

    it('generates CNC G-code with spindle commands, plunge depths and isolation paths', () => {
      const pcb = createImportedPcbProject({
        filePath: 'test_gcode.gostpcb',
        projectName: 'GCodeBoard',
        components: []
      });
      pcb.boardOutline = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }];
      pcb.traces.push({
        id: 'tr1',
        layer: 'TopCopper',
        netName: 'NET1',
        width: 0.4,
        points: [{ x: 10, y: 10 }, { x: 40, y: 10 }]
      });

      const res = generatePcbGCode(pcb, {
        postprocessor: 'GRBL',
        spindleRpm: 10000,
        engraveDepth: 0.08,
        cutDepth: 1.6,
        toolDiameterMm: 0.2
      });

      expect(res.gcode).toContain('G21');
      expect(res.gcode).toContain('G90');
      expect(res.gcode).toContain('M03 S10000');
      expect(res.gcode).toContain('Z-0.080'); // Engrave depth
      expect(res.stats.isolationLoops).toBeGreaterThan(0);
      expect(res.stats.lineCount).toBeGreaterThan(15);
    });
  });

  describe('4. Meander Differential Pair & Length Tuning Accuracy', () => {
    it('applies meander with accurate additional length without severe overshooting', () => {
      const pcb = createImportedPcbProject({
        filePath: 'test_meander.gostpcb',
        projectName: 'MeanderBoard',
        components: []
      });
      pcb.boardOutline = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
      const tr = {
        id: 'tr_long',
        layer: 'TopCopper' as const,
        netName: 'DIFF_P',
        width: 0.3,
        points: [{ x: 10, y: 25 }, { x: 90, y: 25 }] // 80 mm straight segment
      };
      pcb.traces.push(tr);

      const targetAdd = 1.0; // Add 1.0 mm
      const meandered = applyMeanderToTrace(tr, targetAdd, 1.5, 2.0, pcb);
      
      const computeLength = (pts: { x: number; y: number }[]) =>
        pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);

      const origLen = computeLength(tr.points);
      const newLen = computeLength(meandered.points);
      const added = newLen - origLen;

      expect(newLen).toBeGreaterThan(origLen);
      // Added length should be close to target (e.g. within 50% rather than 400% overshoot)
      expect(added).toBeGreaterThanOrEqual(targetAdd * 0.7);
      expect(added).toBeLessThanOrEqual(targetAdd * 1.8);
    });
  });
});
