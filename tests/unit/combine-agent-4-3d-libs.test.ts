import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PcbPlacedComponent, PcbProject, PatternDef, ComponentDef } from '../../src/core/types';
import { transformPoint } from '../../src/core/geometry';
import { buildMechanicalBodies, triangulateBody } from '../../src/engines/mechanical/boardGeometry';
import { exportPcbObj3D, exportPcbStlAscii, exportPcbWrl } from '../../src/engines/mechanical/meshExport';
import { exportPcbStep } from '../../src/engines/mechanical/stepExport';
import { buildPcbScene } from '../../src/ui/modules/pcb3d/buildPcbScene';
import { generateParametricPattern } from '../../src/engines/patternGenerator';
import {
  calculateIpc7351LandPattern,
  calculateIpcThroughHolePad
} from '../../src/engines/parametricPattern';
import { validatePattern } from '../../src/ui/modules/patternEditor/patternValidation';
import { changePadType, renumberPads, validatePatternGenerator } from '../../src/ui/modules/patternEditor/patternEditing';
import { validateComponent } from '../../src/ui/modules/componentEditor/componentValidation';
import {
  findDuplicatePinNumbers,
  generateRangePins,
  parsePinRange,
  renumberPins,
  sortPins
} from '../../src/ui/modules/componentEditor/pinManagerHelpers';
import {
  createUserLibrary,
  deleteImportedLibraryBundle,
  deleteUserComponent,
  deleteUserPattern,
  duplicateUserComponent,
  duplicateUserPattern,
  exportLibraryBundleAsGostlib,
  loadImportedLibraryBundles,
  loadUserComponents,
  loadUserPatterns,
  registerImportedLibraryBundle,
  renameUserComponent,
  renameUserPattern
} from '../../src/core/persistence/libraryStore';
import { createDemoRs485Pcb } from '../../src/gost/demoProjects';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; }
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true
  });
  return store;
}

function makeRichTestPcb(): PcbProject {
  const pcb = createDemoRs485Pcb();
  pcb.projectName = 'AUDIT_BOARD_3D';
  pcb.boardThickness = 1.6;
  pcb.boardOutline = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 70 },
    { x: 0, y: 70 }
  ];
  pcb.cutouts = [
    {
      id: 'cut_slot',
      points: [
        { x: 20, y: 15 },
        { x: 35, y: 15 },
        { x: 35, y: 25 },
        { x: 20, y: 25 }
      ]
    }
  ];
  return pcb;
}

describe('Agent 4 Combine: 3D MCAD, STEP/OBJ/STL, Pattern/Component Editors & Library Store', () => {
  describe('1. 3D Scene & Mechanical Geometry Verification', () => {
    it('exports closed manifold meshes in OBJ and STL with matching directed edge pairs for board + cutouts + mounting holes', () => {
      const pcb = makeRichTestPcb();
      pcb.components.push({
        id: 'mh_1',
        refDes: 'H1',
        typeName: 'M3',
        value: 'M3',
        patternId: 'PAT_MTG_M3',
        side: 'Top',
        x: 8,
        y: 8,
        angle: 0,
        showRefDes: false,
        showValue: false,
        refDesOffset: { x: 0, y: 0 },
        pads: [{ id: 'p1', number: '', type: 'MountingHole', shape: 'Round', x: 0, y: 0, width: 5.8, height: 5.8, holeDiameter: 3.2, layer: 'All' }],
        padNets: {},
        graphics: [],
        courtyard: { width: 7.2, height: 7.2 },
        model3d: { shape: 'Cylinder', bodyWidth: 5.8, bodyLength: 5.8, bodyHeight: 0.4, color: '#d4af37' }
      });

      const bodies = buildMechanicalBodies(pcb);
      const board = bodies.find((b) => b.name === 'BOARD_FR4')!;
      expect(board).toBeDefined();
      // Cutout + 3.2mm mounting hole must be present as openings
      expect(board.openings.length).toBeGreaterThanOrEqual(2);

      // Verify watertight manifold edge pairing on every triangulated body
      for (const body of bodies) {
        const { triangles } = triangulateBody(body);
        const edgeCounts = new Map<string, number>();
        for (const [a, b, c] of triangles) {
          for (const [u, v] of [[a, b], [b, c], [c, a]]) {
            const key = `${u}->${v}`;
            edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
          }
        }
        // In a closed manifold mesh, every directed edge u->v has an opposite v->u
        for (const [key] of edgeCounts) {
          const [u, v] = key.split('->');
          expect(edgeCounts.get(`${v}->${u}`)).toBe(1);
        }
      }

      // Verify OBJ structure
      const obj = exportPcbObj3D(pcb);
      const objLines = obj.split('\n');
      const vCount = objLines.filter((l) => l.startsWith('v ')).length;
      const fLines = objLines.filter((l) => l.startsWith('f '));
      expect(vCount).toBeGreaterThan(24);
      expect(fLines.length).toBeGreaterThan(24);
      for (const fl of fLines) {
        const indices = fl.slice(2).trim().split(/\s+/).map(Number);
        expect(indices.length).toBe(3);
        for (const idx of indices) {
          expect(idx).toBeGreaterThanOrEqual(1);
          expect(idx).toBeLessThanOrEqual(vCount);
        }
      }

      // Verify STL structure and unit normals
      const stl = exportPcbStlAscii(pcb);
      expect(stl.startsWith(`solid ${pcb.projectName}`)).toBe(true);
      expect(stl.trim().endsWith(`endsolid ${pcb.projectName}`)).toBe(true);
      const facetNormals = Array.from(stl.matchAll(/facet normal ([^\n]+)/g)).map((m) =>
        m[1].trim().split(/\s+/).map(Number)
      );
      expect(facetNormals.length).toBe(fLines.length);
      for (const [nx, ny, nz] of facetNormals) {
        expect(Math.abs(Math.hypot(nx, ny, nz) - 1)).toBeLessThan(1e-4);
      }

      // Verify VRML97 structure
      const wrl = exportPcbWrl(pcb);
      expect(wrl.startsWith('#VRML V2.0 utf8')).toBe(true);
      expect(wrl).toContain('scale 0.001 0.001 0.001');
      expect(wrl).toContain('IndexedFaceSet');
    });

    it('verifies STEP entity graph integrity (no dangling #id refs, valid CLOSED_SHELL) and flags AP214 gaps (no colors, THT holes < 1.5mm omitted)', () => {
      const pcb = makeRichTestPcb();
      // Add a standard 0.85mm THT DIP pad and a 1.0mm via
      pcb.vias.push({
        id: 'v_small',
        x: 50,
        y: 50,
        netName: 'GND',
        outerDiameter: 1.6,
        holeDiameter: 1.0,
        startLayer: 'TopCopper',
        endLayer: 'BottomCopper',
        viaStyle: 'Through'
      });

      const bodies = buildMechanicalBodies(pcb);
      const board = bodies.find((b) => b.name === 'BOARD_FR4')!;
      // Only cutout is >= 1.5mm in demo RS485 (THT pads < 1.5mm and via < 2.0mm are omitted from MCAD openings)
      expect(board.openings.length).toBe(1);

      const step = exportPcbStep(pcb);
      expect(step).toContain('ISO-10303-21;');
      expect(step).toContain("FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));");
      expect(step).toContain('END-ISO-10303-21;');

      // AP214 styling/color entities are NOT emitted in current stepExport.ts
      expect(step).not.toContain('STYLED_ITEM');
      expect(step).not.toContain('COLOUR_RGB');

      // Validate all #id references in DATA section resolve to defined entities
      const dataSection = step.split('DATA;')[1].split('ENDSEC;')[0];
      const definedIds = new Set<number>();
      const referencedIds = new Set<number>();
      for (const line of dataSection.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const defMatch = trimmed.match(/^#(\d+)=/);
        if (defMatch) {
          definedIds.add(Number(defMatch[1]));
          const rhs = trimmed.slice(defMatch[0].length);
          for (const refMatch of rhs.matchAll(/#(\d+)/g)) {
            referencedIds.add(Number(refMatch[1]));
          }
        }
      }
      expect(definedIds.size).toBeGreaterThan(50);
      for (const refId of referencedIds) {
        expect(definedIds.has(refId)).toBe(true);
      }
    });

    it('detects Bottom-side rotated component alignment mismatch between buildPcbScene (effAngle = -angle) and transformPoint (+angle)', () => {
      const pcb = makeRichTestPcb();
      pcb.cutouts = [];
      pcb.traces = [];
      pcb.vias = [];
      pcb.copperPours = [];
      pcb.shapes = [];

      const botComp: PcbPlacedComponent = {
        id: 'comp_bot',
        refDes: 'U_BOT',
        typeName: 'SOIC8',
        value: 'U_BOT',
        patternId: 'PAT_SOIC8',
        side: 'Bottom',
        x: 50,
        y: 35,
        angle: 90,
        showRefDes: false,
        showValue: false,
        refDesOffset: { x: 0, y: 0 },
        pads: [
          { id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: -3, y: -1, width: 1.5, height: 0.6, layer: 'Top' },
          { id: 'p2', number: '2', type: 'SMD', shape: 'Rect', x: 3, y: 1, width: 1.5, height: 0.6, layer: 'Top' }
        ],
        padNets: {},
        graphics: [],
        courtyard: { width: 8, height: 6 },
        model3d: { shape: 'SOIC', bodyWidth: 4, bodyLength: 5, bodyHeight: 1.5, color: '#222222', offsetX: 2, offsetY: 0 }
      };
      pcb.components = [botComp];

      const group = new THREE.Group();
      const boardCenter = { cx: 50, cy: 35, w: 100 };
      buildPcbScene(group, pcb, boardCenter, {
        maskColor: '#1b6b33',
        finishGold: false,
        showComponents: true,
        showSilk: false,
        showCopper: false,
        showMask: true,
        explodeFactor: 0
      });

      const compGroup = group.children.find((ch) => ch.userData?.refDes === 'U_BOT') as THREE.Group;
      expect(compGroup).toBeDefined();

      // Find first lead child mesh (the last 2 children of compGroup are the 2 SOIC leads)
      compGroup.updateMatrixWorld(true);
      const leadMesh = compGroup.children[compGroup.children.length - 2]; // corresponds to pad 1 (local x=-3, y=-1)
      const leadWorld = new THREE.Vector3();
      leadMesh.getWorldPosition(leadWorld);

      // Actual PCB pad world position via transformPoint(pad.x, pad.y, c.x, c.y, c.angle, mirror=true)
      const padWorld = transformPoint(-3, -1, 50, 35, 90, true, false);
      const expectedThreeX = padWorld.x - boardCenter.cx; // +1
      const expectedThreeZ = padWorld.y - boardCenter.cy; // +3

      // BUG VERIFIED: buildPcbScene sets effAngle = mirror ? -c.angle : c.angle (-90 deg instead of +90 deg),
      // so the 3D lead ends up at (-1, -3) instead of (+1, +3) — 180 degrees opposite!
      expect(expectedThreeX).toBeCloseTo(1, 3);
      expect(expectedThreeZ).toBeCloseTo(3, 3);
      expect(leadWorld.x).toBeCloseTo(-1, 3);
      expect(leadWorld.z).toBeCloseTo(-3, 3);

      // Also verify model3d.offsetX=2 is respected in boardGeometry (STEP/OBJ) but ignored in buildPcbScene
      const bodies = buildMechanicalBodies(pcb);
      const stepBody = bodies.find((b) => b.name === 'U_BOT')!;
      const bodyCenterX = stepBody.outline.reduce((s, p) => s + p.x, 0) / stepBody.outline.length;
      const bodyCenterY = stepBody.outline.reduce((s, p) => s + p.y, 0) / stepBody.outline.length;
      expect(bodyCenterX).toBeCloseTo(50, 3);
      expect(bodyCenterY).toBeCloseTo(33, 3); // transformPoint(offsetX=2, 0, 50, 35, 90, flipX=true) -> (50, 33)
      // Meanwhile in Three.js compGroup is placed directly at (0, ..., 0) ignoring offsetX/Y
      expect(compGroup.position.x).toBeCloseTo(0, 3);
      expect(compGroup.position.z).toBeCloseTo(0, 3);
    });
  });

  describe('2. IPC-7351B Math vs Pattern Generator & Pattern Validation', () => {
    it('demonstrates divergence between real IPC-7351B RSS calculator and generateParametricPattern naive multiplier', () => {
      const ipcB = calculateIpc7351LandPattern({
        leadType: 'Gullwing',
        overallSpanNom: 6.0,
        overallSpanTol: 0.2,
        bodyLengthNom: 4.9,
        bodyLengthTol: 0.15,
        bodyWidthNom: 3.9,
        bodyWidthTol: 0.15,
        bodyHeightNom: 1.5,
        leadContactNom: 0.85,
        leadContactTol: 0.35,
        leadWidthNom: 0.4,
        leadWidthTol: 0.1,
        pitch: 1.27
      }, 'B');
      expect(ipcB.padLength).toBeGreaterThan(1.2);
      expect(ipcB.padWidth).toBeGreaterThan(0.5);

      const genA = generateParametricPattern({
        family: 'SOIC', name: 'SOIC-8-A', pinCount: 8, pitch: 1.27, rowSpacing: 5.4,
        padWidth: 1.55, padHeight: 0.65, holeDiameter: 0, bodyWidth: 3.9, bodyLength: 4.9, bodyHeight: 1.5, densityLevel: 'A'
      });
      const genC = generateParametricPattern({
        family: 'SOIC', name: 'SOIC-8-C', pinCount: 8, pitch: 1.27, rowSpacing: 5.4,
        padWidth: 1.55, padHeight: 0.65, holeDiameter: 0, bodyWidth: 3.9, bodyLength: 4.9, bodyHeight: 1.5, densityLevel: 'C'
      });

      // generateParametricPattern scales pads by 1.15 / 0.88 but keeps courtyard excess fixed (+0.6mm over pads / +1.5mm over body)
      expect(genA.pads[0].width).toBeCloseTo(1.55 * 1.15, 3);
      expect(genC.pads[0].width).toBeCloseTo(1.55 * 0.88, 3);
      // Courtyard height depends only on bodyLength + 1.5 for SOIC-8 (same for A and C!)
      expect(genA.courtyard.height).toBe(genC.courtyard.height);

      // Verify SOT23 ignores pitch/rowSpacing and hardcodes coordinates
      const sot = generateParametricPattern({
        family: 'SOT23', name: 'SOT23_CUSTOM', pinCount: 3, pitch: 1.5, rowSpacing: 4.0,
        padWidth: 1.0, padHeight: 0.6, holeDiameter: 0, bodyWidth: 1.3, bodyLength: 2.9, bodyHeight: 1.0, densityLevel: 'B'
      });
      expect(sot.pads[0].x).toBe(-1.1);
      expect(sot.pads[0].y).toBe(-0.95);
    });

    it('validates pad editing, THT annular ring rules, mask/paste limits, and rotated pad courtyard gap', () => {
      const basePat: PatternDef = {
        id: 'pat_test',
        name: 'TEST_PAT',
        library: 'patlib_user',
        description: 'Test',
        courtyard: { width: 6, height: 6 },
        model3d: { shape: 'Box', bodyWidth: 4, bodyLength: 4, bodyHeight: 1.5, color: '#222' },
        pads: [
          { id: 'p1', number: '1', type: 'THT', shape: 'Round', x: -2, y: 0, width: 1.0, height: 1.0, holeDiameter: 0.85, layer: 'All' },
          { id: 'p2', number: '1', type: 'SMD', shape: 'Rect', x: 2, y: 0, width: 1.5, height: 1.0, layer: 'Top', solderMaskExpansion: -0.02, pasteMaskExpansion: 0.1 }
        ],
        graphics: []
      };

      const issues = validatePattern(basePat);
      expect(issues.some((i) => i.includes('Дубликат номера площадки'))).toBe(true);
      expect(issues.some((i) => i.includes('поясок меди отверстия'))).toBe(true);
      expect(issues.some((i) => i.includes('отрицательный зазор паяльной маски'))).toBe(true);
      expect(issues.some((i) => i.includes('расширение паяльной пасты'))).toBe(true);

      // Rotated pad (90deg) extending outside courtyard along Y: validatePattern uses pad.height without rotation!
      const rotatedPat: PatternDef = {
        ...basePat,
        courtyard: { width: 6, height: 2 },
        pads: [
          { id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: 0, y: 0, width: 3.0, height: 0.8, angle: 90, layer: 'Top' }
        ]
      };
      // Actual rotated pad Y span is [-1.5, +1.5], which exceeds courtyard height 2 ([-1, +1]),
      // yet validatePattern does not account for pad.angle and reports 0 issues!
      expect(validatePattern(rotatedPat)).toEqual([]);

      // Test renumberPads and changePadType
      const renumbered = renumberPads([
        { id: 'a', number: '10', type: 'SMD', shape: 'Rect', x: 0, y: 0, width: 1, height: 1, layer: 'Top' },
        { id: 'b', number: '', type: 'MountingHole', shape: 'Round', x: 5, y: 0, width: 4, height: 4, holeDiameter: 3.2, layer: 'All' },
        { id: 'c', number: '20', type: 'THT', shape: 'Round', x: 10, y: 0, width: 1.8, height: 1.8, holeDiameter: 0.9, layer: 'All' }
      ]);
      expect(renumbered.map((p) => p.number)).toEqual(['1', '', '2']);

      const convertedToTht = changePadType(renumbered[0], 'THT', renumbered);
      expect(convertedToTht.type).toBe('THT');
      expect(convertedToTht.holeDiameter).toBe(0.9);
      expect(convertedToTht.layer).toBe('All');

      expect(validatePatternGenerator({
        family: 'QFP', name: 'BAD_QFP', pinCount: 10, pitch: 0.5, rowSpacing: 8,
        padWidth: 1.2, padHeight: 0.3, holeDiameter: 0, bodyWidth: 7, bodyLength: 7, bodyHeight: 1.4, densityLevel: 'B'
      })).toContain('кратное 4');
    });
  });

  describe('3. Component Editor Helpers, Validation & Library Store Lifecycle', () => {
    beforeEach(() => {
      installMemoryLocalStorage();
    });

    it('parses pin ranges, sorts/renumbers pins, and validates component against attached pattern', () => {
      expect(parsePinRange('D0..D3')).toEqual(['D0', 'D1', 'D2', 'D3']);
      expect(parsePinRange('GPIO[4..7]')).toEqual(['GPIO4', 'GPIO5', 'GPIO6', 'GPIO7']);
      expect(parsePinRange('A3-A0')).toEqual(['A3', 'A2', 'A1', 'A0']);
      expect(parsePinRange('VCC, GND, NC')).toEqual(['VCC', 'GND', 'NC']);

      const pins = generateRangePins({
        rangeExpr: 'D0..D3',
        electricalType: 'Bidirectional',
        style: 'Line',
        orientation: 0,
        startNumber: 10
      });
      expect(pins).toHaveLength(4);
      expect(pins.every((p) => Math.abs(p.x % 2.5) < 1e-6 && Math.abs(p.y % 2.5) < 1e-6)).toBe(true);

      const renumbered = renumberPins(pins, 1);
      expect(renumbered.map((p) => p.number)).toEqual(['1', '2', '3', '4']);
      expect(renumbered.map((p) => p.padMapping)).toEqual(['1', '2', '3', '4']);

      const sortedByName = sortPins([...renumbered].reverse(), 'name');
      expect(sortedByName.map((p) => p.name)).toEqual(['D0', 'D1', 'D2', 'D3']);

      const comp: ComponentDef = {
        id: 'ucomp_1',
        name: 'TEST_IC',
        library: 'lib_user',
        refDesPrefix: 'DD',
        defaultValue: 'TEST_IC',
        gostStandard: 'ГОСТ 2.743-91',
        description: '',
        patternId: 'pat_test',
        parts: [
          {
            partIndex: 1,
            name: 'Part 1',
            primitives: [],
            pins: [
              { id: '1', number: '1', name: 'A', x: -10, y: 0, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true, padMapping: '1' },
              { id: '2', number: '1', name: 'B', x: -11, y: 0, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true, padMapping: '99' }
            ]
          }
        ]
      };
      expect(findDuplicatePinNumbers(comp).has('1')).toBe(true);

      const pat: PatternDef = {
        id: 'pat_test',
        name: 'PAT_2',
        library: 'patlib_user',
        description: '',
        courtyard: { width: 5, height: 5 },
        model3d: { shape: 'Box', bodyWidth: 3, bodyLength: 3, bodyHeight: 1, color: '#222' },
        pads: [{ id: 'pad1', number: '1', type: 'SMD', shape: 'Rect', x: 0, y: 0, width: 1, height: 1, layer: 'Top' }],
        graphics: []
      };
      const issues = validateComponent(comp, pat);
      expect(issues.some((i) => i.includes('дубликат номера'))).toBe(true);
      expect(issues.some((i) => i.includes('площадка «99» отсутствует'))).toBe(true);
      expect(issues.some((i) => i.includes('вне сетки 2,5 мм'))).toBe(true);
    });

    it('creates, duplicates, renames, exports, and deletes user library bundles and items', () => {
      const bundle = createUserLibrary('Мои_датчики', 'Датчики');
      expect(loadImportedLibraryBundles()).toHaveLength(1);

      const pat: PatternDef = {
        id: 'upat_s1',
        name: 'SENSOR_PKG',
        library: bundle.name,
        description: 'Sensor',
        courtyard: { width: 5, height: 5 },
        model3d: { shape: 'QFN', bodyWidth: 3, bodyLength: 3, bodyHeight: 1, color: '#222' },
        pads: [{ id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: 0, y: 0, width: 1, height: 1, layer: 'Top' }],
        graphics: []
      };
      const comp: ComponentDef = {
        id: 'ucomp_s1',
        name: 'BME280',
        library: bundle.name,
        refDesPrefix: 'DD',
        defaultValue: 'BME280',
        gostStandard: 'ГОСТ 2.743-91',
        description: 'Temp/Pressure',
        patternId: 'upat_s1',
        parts: [{ partIndex: 1, name: 'Секция 1', primitives: [], pins: [] }]
      };

      const registered = registerImportedLibraryBundle({
        name: bundle.name,
        sourceFormat: 'SIPTrace',
        sourceFile: 'sensors.gostlib',
        gostAdapted: true,
        components: [comp],
        patterns: [pat]
      });
      expect(registered.componentIds).toContain('ucomp_s1');
      expect(registered.patternIds).toContain('upat_s1');

      const dupComp = duplicateUserComponent('ucomp_s1', 'BME280_MOD');
      const dupPat = duplicateUserPattern('upat_s1', 'SENSOR_PKG_MOD');
      expect(dupComp?.name).toBe('BME280_MOD');
      expect(dupPat?.name).toBe('SENSOR_PKG_MOD');
      expect(loadUserComponents()).toHaveLength(2);
      expect(loadUserPatterns()).toHaveLength(2);

      renameUserComponent(dupComp!.id, 'BME280_V2');
      renameUserPattern(dupPat!.id, 'SENSOR_PKG_V2');
      expect(loadUserComponents().find((c) => c.id === dupComp!.id)?.name).toBe('BME280_V2');
      expect(loadUserPatterns().find((p) => p.id === dupPat!.id)?.name).toBe('SENSOR_PKG_V2');

      const gostlibJson = JSON.parse(exportLibraryBundleAsGostlib(registered.id));
      expect(gostlibJson.components).toHaveLength(2);
      expect(gostlibJson.patterns).toHaveLength(2);

      deleteUserComponent(dupComp!.id);
      deleteUserPattern(dupPat!.id);
      expect(loadUserComponents()).toHaveLength(1);
      expect(loadUserPatterns()).toHaveLength(1);

      deleteImportedLibraryBundle(registered.id);
      expect(loadImportedLibraryBundles()).toHaveLength(0);
      expect(loadUserComponents()).toHaveLength(0);
      expect(loadUserPatterns()).toHaveLength(0);
    });
  });
});
