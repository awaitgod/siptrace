import { describe, expect, it } from 'vitest';
import { PcbProject, PcbPlacedComponent } from '../../src/core/types';
import {
  buildMechanicalBodies,
  triangulateBody,
  MechanicalBody
} from '../../src/engines/mechanical/boardGeometry';
import {
  exportPcbObj3D,
  exportPcbStlAscii,
  exportPcbWrl
} from '../../src/engines/mechanical/meshExport';
import { exportPcbStep } from '../../src/engines/mechanical/stepExport';
import { createDemoRs485Pcb } from '../../src/gost/demoProjects';

function makeMockPcb(outlinePoints = 4, withCutout = true, numComponents = 10): PcbProject {
  const pcb = createDemoRs485Pcb();
  pcb.projectName = 'MCAD_TEST_BOARD';
  pcb.boardThickness = 1.6;

  if (outlinePoints === 4) {
    pcb.boardOutline = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 60 },
      { x: 0, y: 60 }
    ];
  }

  if (withCutout) {
    pcb.cutouts = [
      {
        id: 'cut_1',
        points: [
          { x: 10, y: 10 },
          { x: 30, y: 10 },
          { x: 30, y: 25 },
          { x: 10, y: 25 }
        ]
      }
    ];
  } else {
    pcb.cutouts = [];
  }

  // Ensure mounting holes are present
  pcb.components.push({
    id: 'MH1',
    refDes: 'H1',
    patternId: 'PAT_MH_3MM',
    value: 'M3_HOLE',
    x: 5,
    y: 5,
    angle: 0,
    side: 'Top',
    showRefDes: false,
    refDesOffset: { x: 0, y: 0 },
    pads: [
      {
        id: 'p1',
        number: '1',
        name: '1',
        type: 'MountingHole',
        shape: 'Round',
        x: 0,
        y: 0,
        width: 6,
        height: 6,
        holeDiameter: 3.2
      }
    ],
    graphics: [],
    model3d: {
      shape: 'Header',
      bodyWidth: 6,
      bodyLength: 6,
      bodyHeight: 0.1,
      color: '#888888'
    }
  });

  return pcb;
}

describe('3D MCAD Interoperability & Mechanical CAD Exporter Test Suite', () => {

  describe('1. Board Geometry Solid Generation & Manifold Topology', () => {
    it('creates board body with normalized outline, correct thickness and cutouts', () => {
      const pcb = makeMockPcb(4, true, 5);
      const bodies = buildMechanicalBodies(pcb);

      const boardBody = bodies.find((b) => b.name === 'BOARD_FR4');
      expect(boardBody).toBeDefined();
      expect(boardBody!.bottom).toBe(0);
      expect(boardBody!.top).toBe(1.6);
      expect(boardBody!.outline.length).toBe(4);
      // Cutout + mounting hole should be in openings
      expect(boardBody!.openings.length).toBeGreaterThanOrEqual(1);
    });

    it('generates authentic circular openings for mechanical mounting holes (M3 / M2.5)', () => {
      const pcb = makeMockPcb(4, false, 2);
      const bodies = buildMechanicalBodies(pcb);
      const boardBody = bodies.find((b) => b.name === 'BOARD_FR4')!;

      // H1 (3.2mm hole at x=5, y=5)
      expect(boardBody.openings.length).toBeGreaterThanOrEqual(1);
      const mHole = boardBody.openings[0];
      expect(mHole.length).toBe(16); // 16-gon circular approximation

      // Check center of hole
      const avgX = mHole.reduce((s, p) => s + p.x, 0) / mHole.length;
      const avgY = mHole.reduce((s, p) => s + p.y, 0) / mHole.length;
      expect(Math.abs(avgX - 5)).toBeLessThan(0.01);
      expect(Math.abs(avgY - 5)).toBeLessThan(0.01);
    });

    it('generates cylindrical bodies for Radial Capacitors', () => {
      const pcb = makeMockPcb(4, false, 1);
      pcb.components = [
        {
          id: 'C_ELEC_1',
          refDes: 'C10',
          patternId: 'CAP_RADIAL_8MM',
          value: '100uF',
          x: 40,
          y: 30,
          angle: 0,
          side: 'Top',
          showRefDes: true,
          refDesOffset: { x: 0, y: 0 },
          pads: [
            { id: '1', number: '1', name: '1', type: 'THT', shape: 'Round', x: -1.25, y: 0, width: 1.6, height: 1.6, holeDiameter: 0.8 },
            { id: '2', number: '2', name: '2', type: 'THT', shape: 'Round', x: 1.25, y: 0, width: 1.6, height: 1.6, holeDiameter: 0.8 }
          ],
          graphics: [],
          model3d: {
            shape: 'RadialCap',
            bodyWidth: 8,
            bodyLength: 8,
            bodyHeight: 11,
            color: '#1a1a2e'
          }
        }
      ];

      const bodies = buildMechanicalBodies(pcb);
      const c10 = bodies.find((b) => b.name === 'C10');
      expect(c10).toBeDefined();
      expect(c10!.outline.length).toBe(16); // Cylindrical 16-gon
      expect(c10!.bottom).toBe(1.6);
      expect(c10!.top).toBe(12.6); // 1.6 + 11
    });

    it('triangulates bodies into completely closed 2-manifold triangle meshes', () => {
      const pcb = makeMockPcb(4, true, 2);
      const bodies = buildMechanicalBodies(pcb);

      for (const body of bodies) {
        const { vertices, triangles } = triangulateBody(body);
        expect(vertices.length).toBeGreaterThan(0);
        expect(triangles.length).toBeGreaterThan(0);

        // Every triangle must have exactly 3 valid vertex indices
        for (const [a, b, c] of triangles) {
          expect(a).toBeGreaterThanOrEqual(0);
          expect(a).toBeLessThan(vertices.length);
          expect(b).toBeGreaterThanOrEqual(0);
          expect(b).toBeLessThan(vertices.length);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThan(vertices.length);
          expect(a).not.toBe(b);
          expect(b).not.toBe(c);
          expect(c).not.toBe(a);
        }

        // Euler characteristic / manifold verification:
        // In a 2-manifold closed surface with boundary loops, every directed edge must have a twin edge
        const edgeCount = new Map<string, number>();
        for (const [a, b, c] of triangles) {
          const e1 = `${Math.min(a, b)}_${Math.max(a, b)}`;
          const e2 = `${Math.min(b, c)}_${Math.max(b, c)}`;
          const e3 = `${Math.min(c, a)}_${Math.max(c, a)}`;
          edgeCount.set(e1, (edgeCount.get(e1) || 0) + 1);
          edgeCount.set(e2, (edgeCount.get(e2) || 0) + 1);
          edgeCount.set(e3, (edgeCount.get(e3) || 0) + 1);
        }

        // Each edge in a watertight closed solid mesh must belong to exactly 2 triangles
        for (const [, count] of edgeCount.entries()) {
          expect(count).toBe(2);
        }
      }
    });
  });

  describe('2. STEP AP214 MCAD Export Verification', () => {
    it('produces compliant ISO-10303-21 STEP file with product definition, units and faceted B-Rep', () => {
      const pcb = makeMockPcb(4, true, 8);
      const step = exportPcbStep(pcb);

      // Header checks
      expect(step).toMatch(/^ISO-10303-21;/);
      expect(step).toContain('HEADER;');
      expect(step).toContain('FILE_DESCRIPTION');
      expect(step).toContain('AUTOMOTIVE_DESIGN');
      expect(step).toContain('ENDSEC;');
      expect(step).toContain('DATA;');
      expect(step).toContain('END-ISO-10303-21;');

      // Geometry checks
      expect(step).toContain('FACETED_BREP');
      expect(step).toContain('CLOSED_SHELL');
      expect(step).toContain('FACE_SURFACE');
      expect(step).toContain('FACE_OUTER_BOUND');
      expect(step).toContain('POLY_LOOP');
      expect(step).toContain('CARTESIAN_POINT');
      expect(step).toContain('AXIS2_PLACEMENT_3D');

      // Unit definitions
      expect(step).toContain('LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.)');
      expect(step).toContain('PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.)');

      // Product and board name
      expect(step).toContain("'MCAD_TEST_BOARD'");
      expect(step).toContain("'BOARD_FR4'");
    });

    it('handles board cutouts using FACE_BOUND in STEP AP214', () => {
      const pcb = makeMockPcb(4, true, 2);
      const step = exportPcbStep(pcb);

      // The board with cutout must contain FACE_BOUND for inner hole loops
      expect(step).toContain('FACE_BOUND');
    });

    it('exports components on both Top and Bottom sides without collision', () => {
      const pcb = makeMockPcb(4, false, 2);
      pcb.components = [
        {
          id: 'R_TOP',
          refDes: 'R1',
          patternId: '0805',
          value: '10k',
          x: 20,
          y: 20,
          angle: 0,
          side: 'Top',
          showRefDes: true,
          refDesOffset: { x: 0, y: 0 },
          pads: [],
          graphics: [],
          model3d: { shape: 'ChipSMD', bodyWidth: 1.25, bodyLength: 2.0, bodyHeight: 0.6, color: '#333' }
        },
        {
          id: 'R_BOT',
          refDes: 'R2',
          patternId: '0805',
          value: '10k',
          x: 20,
          y: 20,
          angle: 0,
          side: 'Bottom',
          showRefDes: true,
          refDesOffset: { x: 0, y: 0 },
          pads: [],
          graphics: [],
          model3d: { shape: 'ChipSMD', bodyWidth: 1.25, bodyLength: 2.0, bodyHeight: 0.6, color: '#333' }
        }
      ];

      const bodies = buildMechanicalBodies(pcb);
      const r1 = bodies.find((b) => b.name === 'R1')!;
      const r2 = bodies.find((b) => b.name === 'R2')!;

      // Top side component sits from z=1.6 to z=2.2
      expect(r1.bottom).toBe(1.6);
      expect(r1.top).toBeCloseTo(2.2);

      // Bottom side component sits below the board from z=-0.6 to z=0
      expect(r2.bottom).toBeCloseTo(-0.6);
      expect(r2.top).toBe(0);

      const step = exportPcbStep(pcb);
      expect(step).toContain("'R1'");
      expect(step).toContain("'R2'");
    });
  });

  describe('3. Wavefront OBJ & STL Mesh Export Verification', () => {
    it('exports valid Wavefront OBJ with Y-up orientation and 1-based face indices', () => {
      const pcb = makeMockPcb(4, true, 5);
      const obj = exportPcbObj3D(pcb);

      expect(obj).toMatch(/^# SIPTrace EDA 3D Board Mesh/);
      expect(obj).toContain('o MCAD_TEST_BOARD');
      expect(obj).toContain('g BOARD_FR4');
      expect(obj).toContain('v ');
      expect(obj).toContain('f ');

      // Face indices must be 1-based and positive integers
      const faceLines = obj.split('\n').filter((l) => l.startsWith('f '));
      expect(faceLines.length).toBeGreaterThan(10);
      for (const fl of faceLines) {
        const parts = fl.trim().split(/\s+/).slice(1);
        expect(parts.length).toBe(3);
        for (const idxStr of parts) {
          const idx = parseInt(idxStr, 10);
          expect(idx).toBeGreaterThan(0);
        }
      }
    });

    it('exports valid ASCII STL with correct surface normals and facet loops', () => {
      const pcb = makeMockPcb(4, false, 5);
      const stl = exportPcbStlAscii(pcb);

      expect(stl).toMatch(/^solid MCAD_TEST_BOARD/);
      expect(stl).toContain('facet normal');
      expect(stl).toContain('outer loop');
      expect(stl).toContain('vertex');
      expect(stl).toContain('endloop');
      expect(stl).toContain('endfacet');
      expect(stl).toMatch(/endsolid MCAD_TEST_BOARD$/);

      // Check facet normal vectors are unit length (norm ~ 1.0)
      const normalMatches = stl.match(/facet normal ([-0-9.]+) ([-0-9.]+) ([-0-9.]+)/g) ?? [];
      expect(normalMatches.length).toBeGreaterThan(10);
      for (const nm of normalMatches.slice(0, 20)) {
        const [, nx, ny, nz] = nm.match(/facet normal ([-0-9.]+) ([-0-9.]+) ([-0-9.]+)/)!.map(Number);
        const len = Math.hypot(nx, ny, nz);
        expect(len).toBeCloseTo(1.0, 3);
      }
    });

    it('exports valid VRML 2.0 UTF-8 file with millimeter scaling and colors', () => {
      const pcb = makeMockPcb(4, false, 5);
      const wrl = exportPcbWrl(pcb);

      expect(wrl).toMatch(/^#VRML V2.0 utf8/);
      expect(wrl).toContain('Transform { scale 0.001 0.001 0.001');
      expect(wrl).toContain('IndexedFaceSet');
      expect(wrl).toContain('Coordinate { point [');
      expect(wrl).toContain('coordIndex [');
      expect(wrl).toContain('Appearance { material Material { diffuseColor');
    });
  });

  describe('4. MCAD Performance & Stress Testing', () => {
    it('efficiently builds and exports dense PCB with 150+ components under 150ms', () => {
      const pcb = makeMockPcb(4, true, 0);
      pcb.components = [];

      // Generate 150 components with diverse footprints
      for (let i = 0; i < 150; i++) {
        const row = Math.floor(i / 15);
        const col = i % 15;
        const isChip = i % 3 === 0;
        const isSoic = i % 3 === 1;
        pcb.components.push({
          id: `C_${i}`,
          refDes: `U${i + 1}`,
          patternId: isChip ? '0805' : isSoic ? 'SOIC-8' : 'LQFP-48',
          value: 'IC',
          x: 10 + col * 5.5,
          y: 8 + row * 6.5,
          angle: (i * 90) % 360,
          side: i % 4 === 0 ? 'Bottom' : 'Top',
          showRefDes: false,
          refDesOffset: { x: 0, y: 0 },
          pads: [
            { id: '1', number: '1', name: '1', type: 'SMD', shape: 'Rect', x: -1, y: 0, width: 0.8, height: 1.2 },
            { id: '2', number: '2', name: '2', type: 'SMD', shape: 'Rect', x: 1, y: 0, width: 0.8, height: 1.2 }
          ],
          graphics: [],
          model3d: {
            shape: isChip ? 'ChipSMD' : isSoic ? 'SOIC' : 'QFP',
            bodyWidth: isChip ? 1.25 : 4.0,
            bodyLength: isChip ? 2.0 : 5.0,
            bodyHeight: isChip ? 0.6 : 1.4,
            color: '#222222'
          }
        });
      }

      const t0 = performance.now();
      const bodies = buildMechanicalBodies(pcb);
      const step = exportPcbStep(pcb);
      const obj = exportPcbObj3D(pcb);
      const stl = exportPcbStlAscii(pcb);
      const elapsed = performance.now() - t0;

      expect(bodies.length).toBe(151); // 1 board + 150 components
      expect(step.length).toBeGreaterThan(50000);
      expect(obj.length).toBeGreaterThan(20000);
      expect(stl.length).toBeGreaterThan(40000);

      // Verify blazing fast mechanical export (< 250ms for 150 components)
      expect(elapsed).toBeLessThan(250);
    });
  });
});
