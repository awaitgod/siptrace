import { describe, expect, it } from 'vitest';
import { PcbProject, Point2D } from '../../src/core/types';
import {
  buildMechanicalBodies,
  triangulateBody,
  MechanicalBody,
  Point3
} from '../../src/engines/mechanical/boardGeometry';
import { exportPcbStep } from '../../src/engines/mechanical/stepExport';
import { exportPcbDxf } from '../../src/engines/cam/dxfAndSvgExporter';
import {
  calculateIpc7351LandPattern,
  calculateIpcThroughHolePad,
  IPC_7351_FILLET_TABLE,
  IPC_CHIP_PRESETS,
  IPC_GULLWING_PRESETS,
  IPC_QFP_PRESETS,
  IPC_THD_PRESETS
} from '../../src/engines/parametricPattern';
import { generateParametricPattern } from '../../src/engines/patternGenerator';
import { createDemoRs485Pcb } from '../../src/gost/demoProjects';

function crossProduct(a: Point3, b: Point3): Point3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function magnitude(v: Point3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

describe('SUBAGENT 4: 3D MCAD & Library Editors Comprehensive Audit Suite', () => {

  describe('1. Board Geometry Mesh Generation & Manifold Solid Normals', () => {
    it('generates non-degenerate triangulated mesh for board with cutouts and mounting holes', () => {
      const pcb = createDemoRs485Pcb();
      pcb.boardThickness = 1.6;
      pcb.boardOutline = [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 80 },
        { x: 0, y: 80 }
      ];
      pcb.cutouts = [
        {
          id: 'cut1',
          points: [
            { x: 20, y: 20 },
            { x: 40, y: 20 },
            { x: 40, y: 35 },
            { x: 20, y: 35 }
          ]
        }
      ];

      const bodies = buildMechanicalBodies(pcb);
      const boardBody = bodies.find((b) => b.name === 'BOARD_FR4');
      expect(boardBody).toBeDefined();
      expect(boardBody!.bottom).toBe(0);
      expect(boardBody!.top).toBe(1.6);
      expect(boardBody!.openings.length).toBeGreaterThanOrEqual(1);

      const { vertices, triangles } = triangulateBody(boardBody!);
      expect(vertices.length).toBeGreaterThan(0);
      expect(triangles.length).toBeGreaterThan(0);

      // Verify no NaN or infinite coordinates
      for (const [x, y, z] of vertices) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        expect(Number.isFinite(z)).toBe(true);
      }

      // Check all triangles are valid indices and have non-zero area
      for (const [i0, i1, i2] of triangles) {
        expect(i0).toBeGreaterThanOrEqual(0);
        expect(i0).toBeLessThan(vertices.length);
        expect(i1).toBeGreaterThanOrEqual(0);
        expect(i1).toBeLessThan(vertices.length);
        expect(i2).toBeGreaterThanOrEqual(0);
        expect(i2).toBeLessThan(vertices.length);

        const v0 = vertices[i0];
        const v1 = vertices[i1];
        const v2 = vertices[i2];

        const edge1: Point3 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
        const edge2: Point3 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
        const normal = crossProduct(edge1, edge2);
        const area = magnitude(normal) * 0.5;

        // Strict check: No degenerate (zero-area) triangles!
        expect(area).toBeGreaterThan(1e-7);
      }
    });

    it('verifies correct normal vectors for top/bottom caps and side walls', () => {
      const pcb = createDemoRs485Pcb();
      const bodies = buildMechanicalBodies(pcb);
      const boardBody = bodies.find((b) => b.name === 'BOARD_FR4')!;
      const { vertices, triangles } = triangulateBody(boardBody);

      let topCapCount = 0;
      let bottomCapCount = 0;
      let wallCount = 0;

      for (const [i0, i1, i2] of triangles) {
        const v0 = vertices[i0];
        const v1 = vertices[i1];
        const v2 = vertices[i2];

        const edge1: Point3 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
        const edge2: Point3 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
        const n = crossProduct(edge1, edge2);
        const len = magnitude(n);
        const unitN: Point3 = [n[0] / len, n[1] / len, n[2] / len];

        if (Math.abs(v0[2] - boardBody.top) < 1e-4 && Math.abs(v1[2] - boardBody.top) < 1e-4 && Math.abs(v2[2] - boardBody.top) < 1e-4) {
          // Top cap: normal must point straight up (+Z)
          expect(unitN[2]).toBeGreaterThan(0.99);
          topCapCount++;
        } else if (Math.abs(v0[2] - boardBody.bottom) < 1e-4 && Math.abs(v1[2] - boardBody.bottom) < 1e-4 && Math.abs(v2[2] - boardBody.bottom) < 1e-4) {
          // Bottom cap: normal must point straight down (-Z)
          expect(unitN[2]).toBeLessThan(-0.99);
          bottomCapCount++;
        } else {
          // Side walls: vertical extrusion, normal must be horizontal (nz ~= 0)
          expect(Math.abs(unitN[2])).toBeLessThan(1e-4);
          wallCount++;
        }
      }

      expect(topCapCount).toBeGreaterThan(0);
      expect(bottomCapCount).toBeGreaterThan(0);
      expect(wallCount).toBeGreaterThan(0);
    });

    it('creates 3D component solid bodies with correct Z extrusion for Top and Bottom sides', () => {
      const pcb = createDemoRs485Pcb();
      pcb.boardThickness = 2.0;

      // Add top and bottom components
      pcb.components = [
        {
          id: 'U_TOP',
          refDes: 'U1',
          patternId: 'SOIC-8',
          value: 'MAX485',
          x: 30,
          y: 30,
          angle: 0,
          side: 'Top',
          showRefDes: true,
          refDesOffset: { x: 0, y: 0 },
          pads: [{ id: 'p1', number: '1', name: '1', type: 'SMD', shape: 'RoundedRect', x: -2.7, y: -1.9, width: 1.55, height: 0.65 }],
          graphics: [],
          model3d: { shape: 'SOIC', bodyWidth: 3.9, bodyLength: 4.9, bodyHeight: 1.5, color: '#222222' }
        },
        {
          id: 'U_BOT',
          refDes: 'U2',
          patternId: 'SOIC-8',
          value: 'MAX485_BOT',
          x: 60,
          y: 30,
          angle: 90,
          side: 'Bottom',
          showRefDes: true,
          refDesOffset: { x: 0, y: 0 },
          pads: [{ id: 'p1', number: '1', name: '1', type: 'SMD', shape: 'RoundedRect', x: -2.7, y: -1.9, width: 1.55, height: 0.65 }],
          graphics: [],
          model3d: { shape: 'SOIC', bodyWidth: 3.9, bodyLength: 4.9, bodyHeight: 1.5, color: '#222222' }
        }
      ];

      const bodies = buildMechanicalBodies(pcb);
      const uTop = bodies.find((b) => b.name === 'U1');
      const uBot = bodies.find((b) => b.name === 'U2');

      expect(uTop).toBeDefined();
      expect(uBot).toBeDefined();

      // Top component: bottom is at board top (2.0), top is at 2.0 + 1.5 = 3.5
      expect(uTop!.bottom).toBe(2.0);
      expect(uTop!.top).toBe(3.5);

      // Bottom component: bottom is at -1.5, top is at 0.0
      expect(uBot!.bottom).toBe(-1.5);
      expect(uBot!.top).toBe(0.0);
    });
  });

  describe('2. STEP AP214 Model & DXF Export Validation', () => {
    it('produces valid ISO-10303-21 STEP structure with conforming header and entities', () => {
      const pcb = createDemoRs485Pcb();
      const step = exportPcbStep(pcb);

      expect(step).toMatch(/^ISO-10303-21;/);
      expect(step).toContain('HEADER;');
      expect(step).toContain("FILE_DESCRIPTION(('SIPTrace mechanical board model'),'2;1');");
      expect(step).toContain("FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));");
      expect(step).toContain('ENDSEC;');
      expect(step).toContain('DATA;');
      expect(step).toContain('APPLICATION_CONTEXT');
      expect(step).toContain('APPLICATION_PROTOCOL_DEFINITION');
      expect(step).toContain('PRODUCT');
      expect(step).toContain('CLOSED_SHELL');
      expect(step).toContain('FACETED_BREP');
      expect(step).toContain('CARTESIAN_POINT');
      expect(step).toContain('DIRECTION');
      expect(step).toContain('END-ISO-10303-21;');

      // Verify direction vectors in STEP are valid unit vectors
      const dirMatches = Array.from(step.matchAll(/DIRECTION\('',\(([^)]+)\)\)/g));
      expect(dirMatches.length).toBeGreaterThan(10);
      for (const match of dirMatches.slice(0, 30)) {
        const coords = match[1].split(',').map(Number);
        expect(coords.length).toBe(3);
        const len = Math.hypot(coords[0], coords[1], coords[2]);
        expect(Math.abs(len - 1.0)).toBeLessThan(1e-4);
      }
    });

    it('produces valid DXF file structure with BOARD_OUTLINE and PINS layers', () => {
      const pcb = createDemoRs485Pcb();
      const dxf = exportPcbDxf(pcb);

      expect(dxf).toContain('SECTION');
      expect(dxf).toContain('HEADER');
      expect(dxf).toContain('ENTITIES');
      expect(dxf).toContain('BOARD_OUTLINE');
      expect(dxf).toContain('DRILL');
      expect(dxf).toContain('TOPCOPPER');
      expect(dxf).toContain('EOF');
    });
  });

  describe('3. IPC-7351B Land Pattern Mathematics & Fillet Clearances', () => {
    it('calculates land pattern for Gullwing (SOIC) according to IPC-7351B levels A, B, and C', () => {
      const soicComp = {
        leadType: 'Gullwing' as const,
        overallSpanNom: 6.00,
        overallSpanTol: 0.20,
        bodyLengthNom: 4.90,
        bodyLengthTol: 0.15,
        bodyWidthNom: 3.90,
        bodyWidthTol: 0.15,
        bodyHeightNom: 1.50,
        leadContactNom: 0.85,
        leadContactTol: 0.35,
        leadWidthNom: 0.40,
        leadWidthTol: 0.10,
        pitch: 1.27
      };

      const resA = calculateIpc7351LandPattern(soicComp, 'A');
      const resB = calculateIpc7351LandPattern(soicComp, 'B');
      const resC = calculateIpc7351LandPattern(soicComp, 'C');

      // IPC-7351 Rule: Density A (Maximum material) has largest pads and courtyard, Level C has smallest
      expect(resA.padLength).toBeGreaterThan(resB.padLength);
      expect(resB.padLength).toBeGreaterThan(resC.padLength);

      expect(resA.courtyardWidth).toBeGreaterThan(resB.courtyardWidth);
      expect(resB.courtyardWidth).toBeGreaterThan(resC.courtyardWidth);

      // Verify mathematical identity: Y = (Z_max - G_min) / 2
      expect(Math.abs(resB.padLength - (resB.zMax - resB.gMin) / 2)).toBeLessThan(0.005);
      // Verify center-to-center span: C = (Z_max + G_min) / 2
      expect(Math.abs(resB.padCenterSpan - (resB.zMax + resB.gMin) / 2)).toBeLessThan(0.005);

      // Verify solder mask expansions
      expect(resA.solderMaskExpansion).toBe(0.075);
      expect(resB.solderMaskExpansion).toBe(0.05);
      expect(resC.solderMaskExpansion).toBe(0.035);
    });

    it('verifies standard Chip component presets (0805 and 0603)', () => {
      const chip0805 = IPC_CHIP_PRESETS['0805'];
      expect(chip0805).toBeDefined();
      expect(chip0805.metricName).toBe('2012M');
      expect(chip0805.bodyLength).toBe(2.00);
      expect(chip0805.bodyWidth).toBe(1.25);
      expect(chip0805.padWidth).toBe(1.35);
      expect(chip0805.padLength).toBe(1.05);
      expect(chip0805.rowSpacing).toBe(1.90);

      const chip0603 = IPC_CHIP_PRESETS['0603'];
      expect(chip0603).toBeDefined();
      expect(chip0603.metricName).toBe('1608M');
      expect(chip0603.bodyLength).toBe(1.60);
      expect(chip0603.bodyWidth).toBe(0.80);
      expect(chip0603.rowSpacing).toBe(1.55);
    });

    it('verifies standard Gullwing SOIC presets and QFP presets including QFP-32', () => {
      const soic8 = IPC_GULLWING_PRESETS['SOIC-8'];
      expect(soic8).toBeDefined();
      expect(soic8.pinCount).toBe(8);
      expect(soic8.pitch).toBe(1.27);
      expect(soic8.rowSpacing).toBe(5.40);
      expect(soic8.padWidth).toBe(1.55);
      expect(soic8.padHeight).toBe(0.65);

      const qfp32 = IPC_QFP_PRESETS['QFP-32_0.8'];
      expect(qfp32).toBeDefined();
      expect(qfp32.pinCount).toBe(32);
      expect(qfp32.pitch).toBe(0.80);
      expect(qfp32.rowSpacing).toBe(9.00);
      expect(qfp32.padWidth).toBe(1.50);
      expect(qfp32.padHeight).toBe(0.50);
    });

    it('verifies Through-Hole pad calculations per IPC standard', () => {
      // 0.8mm lead
      const thtA = calculateIpcThroughHolePad(0.8, 'A');
      const thtB = calculateIpcThroughHolePad(0.8, 'B');
      const thtC = calculateIpcThroughHolePad(0.8, 'C');

      expect(thtA.holeDiameter).toBe(1.05); // 0.8 + 0.25
      expect(thtB.holeDiameter).toBe(1.00); // 0.8 + 0.20
      expect(thtC.holeDiameter).toBe(0.95); // 0.8 + 0.15

      expect(thtB.padDiameter).toBe(1.40); // 1.00 + 0.40
      expect(thtB.annularRing).toBe(0.20);
    });
  });

  describe('4. Parametric Pattern Generator Execution', () => {
    it('generates fully compliant SOIC-8 pattern with IPC density level B', () => {
      const soic = generateParametricPattern({
        family: 'SOIC',
        name: 'SOIC-8_IPC_TEST',
        pinCount: 8,
        pitch: 1.27,
        rowSpacing: 5.40,
        padWidth: 1.55,
        padHeight: 0.65,
        holeDiameter: 0,
        bodyWidth: 3.90,
        bodyLength: 4.90,
        bodyHeight: 1.50,
        densityLevel: 'B'
      });

      expect(soic.pads.length).toBe(8);
      expect(soic.pads.every((p) => p.type === 'SMD')).toBe(true);
      expect(soic.pads.every((p) => p.width === 1.55 && p.height === 0.65)).toBe(true);

      // Pins 1-4 on left side (x = -2.7), Pins 5-8 on right side (x = +2.7)
      const leftPads = soic.pads.filter((p) => p.x < 0);
      const rightPads = soic.pads.filter((p) => p.x > 0);
      expect(leftPads.length).toBe(4);
      expect(rightPads.length).toBe(4);

      // Pitch between consecutive pins
      const dy = Math.abs(leftPads[1].y - leftPads[0].y);
      expect(Math.abs(dy - 1.27)).toBeLessThan(0.001);

      // Silkscreen pin 1 marker
      const pin1Circle = soic.graphics.find((g) => g.type === 'circle');
      expect(pin1Circle).toBeDefined();
    });

    it('generates 4-sided QFP-32 package with 8 pins per side', () => {
      const qfp = generateParametricPattern({
        family: 'QFP',
        name: 'QFP-32_IPC_TEST',
        pinCount: 32,
        pitch: 0.80,
        rowSpacing: 9.00,
        padWidth: 1.50,
        padHeight: 0.50,
        holeDiameter: 0,
        bodyWidth: 7.00,
        bodyLength: 7.00,
        bodyHeight: 1.40,
        densityLevel: 'B'
      });

      expect(qfp.pads.length).toBe(32);
      expect(qfp.model3d?.shape).toBe('QFP');
      expect(qfp.model3d?.bodyWidth).toBe(7.00);
      expect(qfp.model3d?.bodyLength).toBe(7.00);

      // Check pin 1 position (left side, topmost)
      const pad1 = qfp.pads.find((p) => p.number === '1');
      expect(pad1).toBeDefined();
      expect(pad1!.x).toBe(-4.50);

      // Check 4 sides of 8 pins each
      const leftPads = qfp.pads.filter((p) => p.x === -4.50);
      const rightPads = qfp.pads.filter((p) => p.x === 4.50);
      const bottomPads = qfp.pads.filter((p) => p.y === 4.50);
      const topPads = qfp.pads.filter((p) => p.y === -4.50);

      expect(leftPads.length).toBe(8);
      expect(rightPads.length).toBe(8);
      expect(bottomPads.length).toBe(8);
      expect(topPads.length).toBe(8);

      // Check pitch along left side
      const p1p2Dist = Math.abs(leftPads[1].y - leftPads[0].y);
      expect(Math.abs(p1p2Dist - 0.80)).toBeLessThan(0.001);
    });
  });
});
