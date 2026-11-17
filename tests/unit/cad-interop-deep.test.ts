import { describe, expect, it } from 'vitest';
import {
  importCadPcbSync,
  importCadSchematicSync,
  importCadLibrary,
  detectDipTraceBinaryFormat
} from '../../src/engines/importers';
import { parseExcellonToPcb, parseDxfToPcb, parseKicadSchematic } from '../../src/engines/importers/ecadFormatsImporter';
import { exportGerberSet, parseGerberPreview } from '../../src/engines/camExport';
import { generatePcbGCode } from '../../src/engines/gcodeGenerator';
import { PcbProject } from '../../src/core/types';
import { createImportedPcbProject } from '../../src/engines/importers/projectShells';
import fs from 'node:fs';

describe('Deep CAD Interoperability & Audit Tests', () => {

  describe('Bug 1: Eagle / Multi-ECAD Zero-Coordinate Bug (parseFloat(x || default) || default)', () => {
    it('corrupts component position when x or y is exactly 0 in Eagle XML board', () => {
      const eagleBrd = `<?xml version="1.0" encoding="utf-8"?>
<eagle version="7.7.0">
  <drawing>
    <board>
      <libraries>
        <library name="test">
          <packages>
            <package name="0805">
              <smd name="1" x="-1" y="0" dx="1" dy="1"/>
              <smd name="2" x="1" y="0" dx="1" dy="1"/>
            </package>
          </packages>
        </library>
      </libraries>
      <elements>
        <element name="R_ZERO" library="test" package="0805" x="0" y="0"/>
        <element name="R_NONZERO" library="test" package="0805" x="15" y="25"/>
      </elements>
      <signals/>
    </board>
  </drawing>
</eagle>`;
      const res = importCadPcbSync(eagleBrd, 'test_zero.brd');
      console.log('All components:', res.pcb.components.map((c) => ({ ref: c.refDes, x: c.x, y: c.y })));
      const rZero = res.pcb.components.find((c) => c.refDes === 'R1' || c.refDes === 'R_ZERO');
      const rNonZero = res.pcb.components.find((c) => c.refDes === 'R2' || c.refDes === 'R_NONZERO');
      
      expect(rNonZero).toBeDefined();
      expect(rNonZero!.x).toBe(15);
      expect(rNonZero!.y).toBe(25);

      expect(rZero).toBeDefined();
      // Notice: Actual behavior is rZero.x === 20 and rZero.y === 20 due to (parseFloat('0') || 20)!
      console.log('rZero position:', rZero!.x, rZero!.y);
    });

    it('corrupts component position when x or y is exactly 0 in Eagle XML schematic', () => {
      const eagleSch = `<?xml version="1.0" encoding="utf-8"?>
<eagle version="7.7.0">
  <drawing>
    <schematic>
      <libraries>
        <library name="test">
          <devicesets>
            <deviceset name="RES">
              <gates><gate name="G$1" symbol="R" x="0" y="0"/></gates>
            </deviceset>
          </devicesets>
        </library>
      </libraries>
      <parts>
        <part name="R1" library="test" deviceset="RES"/>
      </parts>
      <sheets>
        <sheet>
          <instances>
            <instance part="R1" gate="G$1" x="0" y="0"/>
          </instances>
        </sheet>
      </sheets>
    </schematic>
  </drawing>
</eagle>`;
      const res = importCadSchematicSync(eagleSch, 'test_zero.sch');
      const r1 = res.project.sheets[0].components[0];
      expect(r1).toBeDefined();
      // Actual: r1.x === 80 and r1.y === 80 due to (parseFloat('0') || 80)!
      console.log('Eagle schematic r1 position:', r1.x, r1.y);
    });
  });

  describe('Bug 2: Excellon Drill Parser Modal Coordinates & Tool Formats', () => {
    it('drops drill holes when X or Y is omitted in modal NC drill output', () => {
      const modalDrl = `M48
METRIC,LZ
T01C0.8
T02C1.2
%
T01
X10.0Y10.0
Y20.0
Y30.0
X20.0
T02
X30.0Y30.0
M30
`;
      const res = parseExcellonToPcb(modalDrl, 'modal.drl');
      console.log('Modal drill vias count:', res.pcb.vias.length);
      // Expected: 5 holes. Actual: only 2 holes parsed (lines with both X and Y)!
    });

    it('fails to parse tool definitions with spaces or feed/speed codes', () => {
      const altiumDrl = `M48
;FILE_FORMAT=2:4
INCH,TZ
T1 C0.0394
T2F00S00C0.0312
%
T1
X010000Y010000
T2
X020000Y020000
M30
`;
      const res = parseExcellonToPcb(altiumDrl, 'altium.drl');
      console.log('Altium drill vias count:', res.pcb.vias.length);
    });
  });

  describe('Bug 3: KiCad Schematic Multi-Pin Symbol Parsing from embedded lib_symbols', () => {
    it('loses pin definitions of ICs from real KiCad schematic', () => {
      const samplePath = 'tests/fixtures/external/kicad-pic-programmer/pic_programmer.kicad_sch';
      if (fs.existsSync(samplePath)) {
        const text = fs.readFileSync(samplePath, 'utf8');
        const res = parseKicadSchematic(text, 'pic_programmer');
        const comps = res.project.sheets[0].components;
        const u1 = comps.find((c) => c.value === '74LS125' || c.refDes === 'U1');
        const u2 = comps.find((c) => c.value.includes('16F84') || c.refDes === 'U2');
        const defU1 = u1 ? res.project.customComponentDefs[u1.componentDefId] : undefined;
        const defU2 = u2 ? res.project.customComponentDefs[u2.componentDefId] : undefined;
        console.log('U1 (74LS125) pins:', defU1?.parts[0]?.pins?.length);
        console.log('U2 (PIC16F84) pins:', defU2?.parts[0]?.pins?.length);
        expect(defU1).toBeDefined();
        expect(defU1!.parts[0].pins.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Bug 4: CAM Gerber Generation Layer Shapes & Silkscreen filtering', () => {
    it('omits copper-layer shapes from Gerber output', () => {
      const pcb = createImportedPcbProject({
        filePath: 'test.gostpcb',
        projectName: 'TestBoard',
        components: []
      });
      pcb.boardOutline = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }];
      // Add a line shape on TopCopper (e.g. RF antenna trace or copper text)
      pcb.shapes.push({
        id: 'copper_shape_1',
        layer: 'TopCopper',
        type: 'line',
        x1: 10,
        y1: 10,
        x2: 40,
        y2: 10,
        width: 0.5
      });
      const gbrSet = exportGerberSet(pcb);
      const topCopperGbr = gbrSet.files['TestBoard.GTL'];
      expect(topCopperGbr).toBeDefined();
      // Does top copper Gerber contain the line coordinates (10, 10) to (40, 10)?
      // 10 mm * 10000 = 100000; 40 mm * 10000 = 400000.
      const hasShapeInGTL = topCopperGbr.includes('100000') && topCopperGbr.includes('400000');
      console.log('Top Copper Gerber contains copper shape:', hasShapeInGTL);
    });
  });

  describe('Bug 5: CAM G-Code Isolation Routing Pad-Trace Severing and Rotation', () => {
    it('isolates pads with axis-aligned boxes ignoring pad angle and cuts through connecting trace', () => {
      const pcb = createImportedPcbProject({
        filePath: 'gcode.gostpcb',
        projectName: 'GCodeTest',
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
            angle: 45, // 45 degree rotation
            padNets: { '1': 'NET1', '2': 'GND' },
            pads: [
              { id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: -1, y: 0, width: 1, height: 1.2, layer: 'TopCopper' },
              { id: 'p2', number: '2', type: 'SMD', shape: 'Rect', x: 1, y: 0, width: 1, height: 1.2, layer: 'TopCopper' }
            ],
            graphics: []
          }
        ]
      });
      pcb.boardOutline = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }];
      // Add trace connected to pad 1
      pcb.traces.push({
        id: 't1',
        layer: 'TopCopper',
        netName: 'NET1',
        width: 0.3,
        points: [{ x: 19, y: 19 }, { x: 10, y: 10 }]
      });

      const res = generatePcbGCode(pcb, { millTopIsolation: true, toolDiameterMm: 0.2 });
      expect(res.stats.isolationLoops).toBeGreaterThan(0);
      console.log('GCode isolation loops:', res.stats.isolationLoops);
    });
  });

  describe('Bug 6: DXF Board Outline Import with Arbitrary Edge Order & Negative Coordinates', () => {
    it('scrambles board outline when DXF edges are unordered or reversed', () => {
      // 4 edges of a 50x50 mm square provided in random order and reverse direction
      const dxfText = `0
SECTION
2
ENTITIES
0
LINE
8
BOARD_OUTLINE
10
50.0
20
50.0
11
0.0
21
50.0
0
LINE
8
BOARD_OUTLINE
10
0.0
20
0.0
11
50.0
21
0.0
0
LINE
8
BOARD_OUTLINE
10
0.0
20
50.0
11
0.0
21
0.0
0
LINE
8
BOARD_OUTLINE
10
50.0
20
0.0
11
50.0
21
50.0
0
ENDSEC
0
EOF
`;
      const res = parseDxfToPcb(dxfText, 'unordered_dxf');
      console.log('DXF parsed board outline points:', res.pcb.boardOutline);
      // Notice: y coordinates are negative (-50, 0), and outline sequence is not contiguous!
    });
  });

  describe('Bug 7: Gerber Preview Parser Modal D-Codes and G01 Prefixes', () => {
    it('fails to parse coordinates with G01 prefix or modal D-codes', () => {
      const gbrWithG01 = `G04 Gerber with G01 and modal commands*
%FSLAX34Y34*%
%MOMM*%
%ADD10C,0.2*%
D10*
G01X100000Y100000D02*
G01X200000Y100000D01*
X300000Y100000*
M02*
`;
      const entities = parseGerberPreview(gbrWithG01);
      console.log('Parsed Gerber entities count:', entities.length);
      // Notice: entities count is 0 because of 'G01' prefix and modal line without D01!
    });
  });
});
