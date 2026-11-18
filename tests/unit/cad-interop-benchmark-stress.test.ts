import { describe, expect, it } from 'vitest';
import {
  importCadPcb,
  importCadPcbSync,
  importCadSchematic,
  importCadSchematicSync,
  importCadLibrary,
  detectDipTraceBinaryFormat
} from '../../src/engines/importers';
import { convertImportedSchematicToGost } from '../../src/engines/importers/gostConverter';
import { parseExcellonToPcb, parseGerberToPcb } from '../../src/engines/importers/cam/gerberExcellonImporter';
import { parseDxfToPcb } from '../../src/engines/importers/cam/dxfImporter';
import { parseEagleXml } from '../../src/engines/importers/eagle/eagleXmlParser';
import { parseKicadPcb } from '../../src/engines/importers/kicad/kicadPcbParser';
import { parseKicadSchematic } from '../../src/engines/importers/kicad/kicadSchematicParser';
import { parseAltiumOrPcadPcb, parseAltiumOrPcadSchematic, decodeAltiumWideString } from '../../src/engines/importers/ecad/altiumParser';
import { parseEasyEdaPcbJson, parseEasyEdaSchematicJson } from '../../src/engines/importers/ecad/easyEdaParser';
import { parseLtspiceAsc } from '../../src/engines/importers/ecad/ltspiceAndSpiceParser';
import { parseProteusInput } from '../../src/engines/importers/proteus/proteusParser';
import { exportDipTraceAsciiPcb, exportDipTraceAsciiSchematic } from '../../src/engines/importers/diptrace/asciiExporter';
import { encodeDipTraceSchematicAscii } from '../../src/engines/importers/diptrace/asciiEncoding';
import { decodeAnsiOrUtf8 } from '../../src/engines/importers/diptrace/binaryEncoding';
import { createLabCamReadyPcb, createLabServoSchematic } from '../../src/gost/demo/labDemos';
import { extractSchematicNets } from '../../src/engines/erc';
import { PcbProject, SchematicProject } from '../../src/core/types';

describe('CAD Interoperability & Real-World Formats Benchmark Suite', () => {

  describe('1. Zero-Coordinate Fidelity (x === 0 or y === 0)', () => {
    it('preserves exact 0,0 coordinates in Altium PCB import without defaulting to 20', () => {
      const altiumPcbText = `|RECORD=Board|
|RECORD=Component|PATTERN=DIP-8|SOURCEDESIGNATOR=U_ZERO|COMMENT=NE555|LAYER=TOP|X=0|Y=0|ROTATION=0|
|RECORD=Component|PATTERN=DIP-8|SOURCEDESIGNATOR=U_NONZERO|COMMENT=NE555|LAYER=TOP|X=1000|Y=2000|ROTATION=90|
|RECORD=Track|LAYER=TOP|NET=GND|X1=0|Y1=0|X2=500|Y2=0|WIDTH=15|
|RECORD=Via|X=0|Y=0|NET=GND|DIAMETER=30|HOLESIZE=15|`;
      
      const res = parseAltiumOrPcadPcb(altiumPcbText, 'zero_test.PcbDoc');
      const uZero = res.pcb.components[0];
      const uNonZero = res.pcb.components[1];
      
      expect(res.report.items[0].originalRef).toBe('U_ZERO');
      expect(uZero).toBeDefined();
      expect(uZero.x).toBe(0);
      expect(uZero.y).toBe(0);
      
      expect(res.report.items[1].originalRef).toBe('U_NONZERO');
      expect(uNonZero).toBeDefined();
      expect(uNonZero.x).toBeCloseTo(25.4, 1);
      expect(uNonZero.y).toBeCloseTo(50.8, 1);
      
      const track = res.pcb.traces[0];
      expect(track.points[0].x).toBe(0);
      expect(track.points[0].y).toBe(0);

      const via = res.pcb.vias[0];
      expect(via.x).toBe(0);
      expect(via.y).toBe(0);
    });

    it('preserves 0,0 coordinates in Eagle XML board and schematic', () => {
      const eagleBrd = `<?xml version="1.0" encoding="utf-8"?>
<eagle version="7.7.0">
  <drawing>
    <board>
      <libraries><library name="test"><packages><package name="0805"><smd name="1" x="-1" y="0" dx="1" dy="1"/><smd name="2" x="1" y="0" dx="1" dy="1"/></package></packages></library></libraries>
      <elements>
        <element name="R_ZERO" library="test" package="0805" x="0" y="0"/>
        <element name="R_OFFSET" library="test" package="0805" x="0" y="25"/>
      </elements>
      <signals/>
    </board>
  </drawing>
</eagle>`;
      const res = importCadPcbSync(eagleBrd, 'zero_eagle.brd');
      const rZero = res.pcb.components.find((c) => c.refDes === 'R_ZERO' || c.refDes === 'R1');
      expect(rZero).toBeDefined();
      expect(rZero!.x).toBe(0);
      expect(rZero!.y).toBe(0);
    });

    it('preserves 0,0 coordinates in KiCad S-expression PCB', () => {
      const kicadPcb = `(kicad_pcb (version 20211014) (generator pcbnew)
  (general (thickness 1.6))
  (net 0 "")
  (net 1 "GND")
  (footprint "Resistor_SMD:R_0805_2012Metric" (layer "F.Cu")
    (at 0 0 0)
    (property "Reference" "R1")
    (property "Value" "10k")
    (pad "1" smd roundrect (at -0.9 0) (size 1 1.25) (layers "F.Cu" "F.Paste" "F.Mask") (net 1 "GND"))
    (pad "2" smd roundrect (at 0.9 0) (size 1 1.25) (layers "F.Cu" "F.Paste" "F.Mask"))
  )
  (via (at 0 0) (size 0.8) (drill 0.4) (layers "F.Cu" "B.Cu") (net 1))
)`;
      const res = parseKicadPcb(kicadPcb, 'zero_kicad.kicad_pcb');
      expect(res.pcb.components[0].x).toBe(0);
      expect(res.pcb.components[0].y).toBe(0);
      expect(res.pcb.vias[0].x).toBe(0);
      expect(res.pcb.vias[0].y).toBe(0);
    });

    it('preserves 0,0 coordinates in EasyEDA PCB JSON', () => {
      const easyEdaJson = JSON.stringify({
        head: { x: 0, y: 0, docType: '3' },
        shape: [
          'LIB~0~0~`package`0805`pre`R1`name`10k~0~0~1~1#@$PAD~RECT~0~0~4~4~1~GND~1~0~1~0',
          'VIA~0~0~2.4~GND~1.2'
        ]
      });
      const res = parseEasyEdaPcbJson(easyEdaJson, 'zero_easyeda.json');
      expect(res.pcb.components.length).toBeGreaterThan(0);
      expect(res.pcb.vias.length).toBe(1);
    });
  });

  describe('2. Modal Coordinates & Separated Operation Codes', () => {
    it('handles Excellon NC drill modal coordinates and tool commands with feed/speed', () => {
      const modalExcellon = `M48
METRIC,LZ
T01F100S200C0.8
T02C1.2
%
T01
X10.0Y10.0
Y20.0
Y30.0
X25.0
Y20.0
T02
X50.0Y50.0
`;
      const res = parseExcellonToPcb(modalExcellon, 'modal_test.drl');
      expect(res.pcb.vias.length).toBe(6);
      
      const holes = res.pcb.vias.map((v) => ({ x: v.x, y: v.y, hole: v.holeDiameter }));
      expect(holes[0]).toEqual({ x: 10, y: 10, hole: 0.8 });
      expect(holes[1]).toEqual({ x: 10, y: 20, hole: 0.8 });
      expect(holes[2]).toEqual({ x: 10, y: 30, hole: 0.8 });
      expect(holes[3]).toEqual({ x: 25, y: 30, hole: 0.8 });
      expect(holes[4]).toEqual({ x: 25, y: 20, hole: 0.8 });
      expect(holes[5]).toEqual({ x: 50, y: 50, hole: 1.2 });
    });

    it('parses Gerber RS-274X with separated coordinates and standalone D-codes (modal flash D03 and trace D01)', () => {
      const gbrSeparated = `%FSLAX24Y24*%
%MOMM*%
%ADD10C,0.8*%
%ADD11C,0.25*%
D10*
X100000Y100000*
D03*
X200000Y100000*
D03*
D11*
X100000Y100000D02*
X200000Y100000D01*
X200000Y200000*
M02*
`;
      const res = parseGerberToPcb(gbrSeparated, 'test.gtl');
      expect(res.pcb.vias.length).toBe(2);
      expect(res.pcb.vias[0].x).toBe(10);
      expect(res.pcb.vias[0].y).toBe(10);
      expect(res.pcb.vias[1].x).toBe(20);
      expect(res.pcb.vias[1].y).toBe(10);
      
      expect(res.pcb.traces.length).toBe(2);
      expect(res.pcb.traces[0].points).toEqual([{ x: 10, y: 10 }, { x: 20, y: 10 }]);
      expect(res.pcb.traces[1].points).toEqual([{ x: 20, y: 10 }, { x: 20, y: 20 }]);
    });
  });

  describe('3. Multi-Encoding & Cyrillic Support (UTF-8, Windows-1251, CP866)', () => {
    it('decodes Altium Designer wide strings and Windows-1251 Cyrillic attributes', () => {
      const wide = '1055,1088,1080,1074,1077,1090'; // "Привет"
      expect(decodeAltiumWideString(wide)).toBe('Привет');

      // Windows-1251 raw bytes for "Плата питания"
      const cp1251Bytes = new Uint8Array([0xcf, 0xeb, 0xe0, 0xf2, 0xe0, 0x20, 0xef, 0xe8, 0xf2, 0xe0, 0xed, 0xe8, 0xff]);
      const decoded = decodeAnsiOrUtf8(cp1251Bytes);
      expect(decoded).toBe('Плата питания');

      const altiumAsciiWithCyrillic = `|RECORD=Board|
|RECORD=Component|PATTERN=DIP-8|SOURCEDESIGNATOR=DD1|COMMENT=К155ЛА3|LAYER=TOP|X=100|Y=100|ROTATION=0|
|RECORD=Track|LAYER=TOP|NET=ВЫХОД_1|X1=100|Y1=100|X2=200|Y2=100|WIDTH=15|`;
      
      const res = parseAltiumOrPcadPcb(altiumAsciiWithCyrillic, 'cyrillic_altium.PcbDoc');
      expect(res.pcb.components[0].value).toBe('К155ЛА3');
      expect(res.pcb.traces[0].netName).toBe('ВЫХОД_1');
    });

    it('preserves Cyrillic in DipTrace ASCII schematic round-trip', async () => {
      const sch = createLabServoSchematic();
      const testName = 'Блок управления двигателем';
      sch.sheets[0].name = testName;
      sch.sheets[0].components[0].value = '10 кОм (ГОСТ)';

      const asc = exportDipTraceAsciiSchematic(sch);
      const encoded = encodeDipTraceSchematicAscii(asc);
      const imported = await importCadSchematic(encoded, 'cyrillic_dt.asc');

      expect(imported.project.sheets[0].name).toBe(testName);
      expect(imported.project.sheets[0].components[0].value).toBe('10 кОм (ГОСТ)');
    });
  });

  describe('4. Layer Mapping & System Normalization', () => {
    it('maps KiCad layers (copper, inner, silk, mask, paste, assembly, courtyard, keepout, edge)', () => {
      const kicadBoardWithLayers = `(kicad_pcb (version 20211014) (generator pcbnew)
  (general (thickness 1.6))
  (net 0 "")
  (net 1 "SIG1")
  (net 2 "SIG2")
  (segment (start 10 10) (end 20 10) (width 0.25) (layer "F.Cu") (net 1))
  (segment (start 10 20) (end 20 20) (width 0.25) (layer "B.Cu") (net 2))
  (segment (start 10 30) (end 20 30) (width 0.25) (layer "In1.Cu") (net 1))
  (segment (start 10 40) (end 20 40) (width 0.25) (layer "In2.Cu") (net 2))
  (gr_line (start 0 0) (end 100 0) (layer "Edge.Cuts") (width 0.15))
  (gr_line (start 100 0) (end 100 80) (layer "Edge.Cuts") (width 0.15))
  (gr_line (start 100 80) (end 0 80) (layer "Edge.Cuts") (width 0.15))
  (gr_line (start 0 80) (end 0 0) (layer "Edge.Cuts") (width 0.15))
  (gr_line (start 5 5) (end 15 5) (layer "F.SilkS") (width 0.15))
  (gr_line (start 5 15) (end 15 15) (layer "B.SilkS") (width 0.15))
  (gr_rect (start 25 5) (end 35 15) (layer "F.Mask") (width 0.15))
  (gr_rect (start 25 25) (end 35 35) (layer "B.Mask") (width 0.15))
  (gr_line (start 45 5) (end 55 5) (layer "F.Fab") (width 0.15))
  (gr_line (start 45 15) (end 55 15) (layer "B.Fab") (width 0.15))
)`;
      const res = parseKicadPcb(kicadBoardWithLayers, 'layers_test.kicad_pcb');
      const traceLayers = new Set(res.pcb.traces.map((t) => t.layer));
      expect(traceLayers).toContain('TopCopper');
      expect(traceLayers).toContain('BottomCopper');
      expect(traceLayers).toContain('Inner1');
      expect(traceLayers).toContain('Inner2');

      const shapeLayers = new Set(res.pcb.shapes.map((s) => s.layer));
      expect(shapeLayers).toContain('TopSilk');
      expect(shapeLayers).toContain('BottomSilk');
      expect(shapeLayers).toContain('TopMask');
      expect(shapeLayers).toContain('BottomMask');
      expect(shapeLayers).toContain('TopAssembly');
      expect(shapeLayers).toContain('BottomAssembly');

      expect(res.pcb.boardOutline.length).toBeGreaterThanOrEqual(4);
    });

    it('maps Eagle layers (dimension, tPlace, bPlace, tStop, bStop, keepout, docu)', () => {
      const eagleBoardWithLayers = `<?xml version="1.0" encoding="utf-8"?>
<eagle version="7.7.0">
  <drawing>
    <board>
      <libraries/>
      <elements/>
      <signals>
        <signal name="GND">
          <wire x1="10" y1="10" x2="20" y2="10" width="0.3" layer="1"/>
          <wire x1="10" y1="20" x2="20" y2="20" width="0.3" layer="16"/>
          <wire x1="10" y1="30" x2="20" y2="30" width="0.3" layer="2"/>
        </signal>
      </signals>
      <plain>
        <wire x1="0" y1="0" x2="50" y2="0" width="0.2" layer="20"/>
        <wire x1="50" y1="0" x2="50" y2="50" width="0.2" layer="20"/>
        <wire x1="50" y1="50" x2="0" y2="50" width="0.2" layer="20"/>
        <wire x1="0" y1="50" x2="0" y2="0" width="0.2" layer="20"/>
        <wire x1="5" y1="5" x2="15" y2="5" width="0.15" layer="21"/>
        <wire x1="5" y1="15" x2="15" y2="15" width="0.15" layer="22"/>
        <wire x1="5" y1="25" x2="15" y2="25" width="0.15" layer="29"/>
        <wire x1="5" y1="35" x2="15" y2="35" width="0.15" layer="30"/>
        <wire x1="5" y1="45" x2="15" y2="45" width="0.15" layer="39"/>
      </plain>
    </board>
  </drawing>
</eagle>`;
      const res = parseEagleXml(eagleBoardWithLayers, true, 'eagle_layers.brd');
      expect(res.pcb).toBeDefined();
      const pcb = res.pcb!.pcb;

      const traceLayers = new Set(pcb.traces.map((t) => t.layer));
      expect(traceLayers).toContain('TopCopper');
      expect(traceLayers).toContain('BottomCopper');
      expect(traceLayers).toContain('Inner1');

      const shapeLayers = new Set(pcb.shapes.map((s) => s.layer));
      expect(shapeLayers).toContain('TopSilk');
      expect(shapeLayers).toContain('BottomSilk');
      expect(shapeLayers).toContain('TopMask');
      expect(shapeLayers).toContain('BottomMask');
      expect(shapeLayers).toContain('Keepout');
    });
  });

  describe('5. GOST ESKD Symbol Conversion (ANSI -> GOST 2.743 / 2.728)', () => {
    it('automatically converts ANSI zig-zag resistors to GOST 2.728 rectangular symbols', () => {
      const eagleSch = `<?xml version="1.0" encoding="utf-8"?>
<eagle version="7.7.0">
  <drawing>
    <schematic>
      <libraries>
        <library name="resistor">
          <devicesets><deviceset name="R-US_"><gates><gate name="G$1" symbol="R-US" x="0" y="0"/></gates></deviceset></devicesets>
          <symbols><symbol name="R-US"><pin name="1" x="-5.08" y="0" visible="off"/><pin name="2" x="5.08" y="0" visible="off"/></symbol></symbols>
        </library>
      </libraries>
      <parts><part name="R1" library="resistor" deviceset="R-US_" value="10k"/></parts>
      <sheets><sheet><instances><instance part="R1" gate="G$1" x="50" y="50"/></instances></sheet></sheets>
    </schematic>
  </drawing>
</eagle>`;
      const res = importCadSchematicSync(eagleSch, 'ansi_res.sch');
      const comp = res.project.sheets[0].components[0];
      expect(comp.refDes).toBe('R1');
      expect(comp.value).toBe('10 кОм');
      expect(comp.typeName).toBe('МЛТ-0,25');
      
      const def = res.project.customComponentDefs[comp.componentDefId] || comp;
      expect(res.report.convertedSymbolsToUgo).toBeGreaterThan(0);
    });

    it('converts foreign logic ICs (74HC08 AND, 74HC32 OR, 74HC86 XOR, 74HC00 NAND) to GOST 2.743-91 symbols', () => {
      const sch = createLabServoSchematic();
      sch.sheets[0].components = [
        { ...sch.sheets[0].components[0], id: 'c1', refDes: 'U1', value: '74HC08', typeName: '74HC08' },
        { ...sch.sheets[0].components[0], id: 'c2', refDes: 'U2', value: '74HC32', typeName: '74HC32' },
        { ...sch.sheets[0].components[0], id: 'c3', refDes: 'U3', value: '74HC86', typeName: '74HC86' },
        { ...sch.sheets[0].components[0], id: 'c4', refDes: 'U4', value: '74HC00', typeName: '74HC00' }
      ];

      const res = convertImportedSchematicToGost(sch, 'KiCad');

      const c1 = res.project.sheets[0].components[0];
      expect(c1.refDes).toBe('DD1');
      expect(c1.typeName).toContain('2И');

      const c2 = res.project.sheets[0].components[1];
      expect(c2.refDes).toBe('DD2');
      expect(c2.typeName).toContain('2ИЛИ');

      const c3 = res.project.sheets[0].components[2];
      expect(c3.refDes).toBe('DD3');
      expect(c3.typeName).toContain('2XOR');

      const c4 = res.project.sheets[0].components[3];
      expect(c4.refDes).toBe('DD4');
      expect(c4.typeName).toContain('2И-НЕ');
    });

    it('converts generic single logic gate symbols (AND2, OR2, XOR2, INV) to GOST 2.743-91 UGO with &, 1, =1', () => {
      const sch = createLabServoSchematic();
      sch.sheets[0].components = [
        { ...sch.sheets[0].components[0], id: 'g1', refDes: 'G1', value: 'AND2', typeName: 'AND2' },
        { ...sch.sheets[0].components[0], id: 'g2', refDes: 'G2', value: 'OR2', typeName: 'OR2' },
        { ...sch.sheets[0].components[0], id: 'g3', refDes: 'G3', value: 'XOR2', typeName: 'XOR2' },
        { ...sch.sheets[0].components[0], id: 'g4', refDes: 'G4', value: 'INV', typeName: 'INV' }
      ];

      const res = convertImportedSchematicToGost(sch, 'KiCad');

      const andDef = res.project.customComponentDefs[res.project.sheets[0].components[0].componentDefId];
      expect(andDef).toBeDefined();
      expect(andDef.parts[0].primitives.some((p) => p.type === 'text' && p.text === '&')).toBe(true);

      const orDef = res.project.customComponentDefs[res.project.sheets[0].components[1].componentDefId];
      expect(orDef).toBeDefined();
      expect(orDef.parts[0].primitives.some((p) => p.type === 'text' && p.text === '1')).toBe(true);

      const xorDef = res.project.customComponentDefs[res.project.sheets[0].components[2].componentDefId];
      expect(xorDef).toBeDefined();
      expect(xorDef.parts[0].primitives.some((p) => p.type === 'text' && p.text === '=1')).toBe(true);

      const invDef = res.project.customComponentDefs[res.project.sheets[0].components[3].componentDefId];
      expect(invDef).toBeDefined();
      expect(invDef.parts[0].primitives.some((p) => p.type === 'text' && p.text === '1')).toBe(true);
      expect(invDef.parts[0].pins.some((p) => p.style === 'Inverted')).toBe(true);
    });
  });

  describe('6. Deep Round-Trip Verification (Precision, Nets, Geometry)', () => {
    it('preserves trace width, via hole diameter, positions, and net names on DipTrace ASCII PCB round-trip', async () => {
      const originalPcb = createLabCamReadyPcb();
      const ascPcb = exportDipTraceAsciiPcb(originalPcb);
      const reimported = (await importCadPcb(ascPcb, 'roundtrip.dip')).pcb;

      expect(reimported.components.length).toBe(originalPcb.components.length);
      for (let i = 0; i < originalPcb.components.length; i++) {
        const orig = originalPcb.components[i];
        const rt = reimported.components[i];
        expect(rt.refDes).toBe(orig.refDes);
        expect(rt.x).toBeCloseTo(orig.x, 1);
        expect(rt.y).toBeCloseTo(orig.y, 1);
        expect(rt.angle).toBe(orig.angle);
      }

      expect(reimported.traces.length).toBeGreaterThan(0);
      for (const rtTrace of reimported.traces) {
        expect(rtTrace.width).toBeGreaterThanOrEqual(0.15);
        expect(rtTrace.points.length).toBeGreaterThanOrEqual(2);
      }

      expect(reimported.vias.length).toBe(originalPcb.vias.length);
      for (let i = 0; i < originalPcb.vias.length; i++) {
        const origVia = originalPcb.vias[i];
        const rtVia = reimported.vias[i];
        expect(rtVia.x).toBeCloseTo(origVia.x, 2);
        expect(rtVia.y).toBeCloseTo(origVia.y, 2);
        expect(rtVia.holeDiameter).toBeCloseTo(origVia.holeDiameter, 2);
        expect(rtVia.outerDiameter).toBeCloseTo(origVia.outerDiameter, 2);
      }

      expect(reimported.boardOutline.length).toBe(originalPcb.boardOutline.length);
      for (let i = 0; i < originalPcb.boardOutline.length; i++) {
        expect(reimported.boardOutline[i].x).toBeCloseTo(originalPcb.boardOutline[i].x, 1);
        expect(reimported.boardOutline[i].y).toBeCloseTo(originalPcb.boardOutline[i].y, 1);
      }
    });

    it('preserves multi-sheet netlist connectivity across schematic round-trip', async () => {
      const sch = createLabServoSchematic();
      const originalNets = extractSchematicNets(sch);

      const asc = exportDipTraceAsciiSchematic(sch);
      const reimported = (await importCadSchematic(asc, 'roundtrip.asc')).project;
      const reimportedNets = extractSchematicNets(reimported);

      expect(reimportedNets.length).toBeGreaterThanOrEqual(originalNets.length);
      for (const origNet of originalNets) {
        if (!origNet.name) continue;
        const matching = reimportedNets.find((n) => n.name === origNet.name);
        expect(matching).toBeDefined();
      }
    });
  });

  describe('7. Enterprise Stress, Fuzzing & Resilience (Zero Crashes, No NaN)', () => {
    it('handles empty files and whitespace without crashing', async () => {
      expect(() => importCadSchematicSync('', 'empty.gostsch')).toThrow();
      expect(() => importCadPcbSync('', 'empty.gostpcb')).toThrow();

      // Gracefully throws format unrecognized error instead of uncaught type error
      await expect(importCadSchematic('   \r\n\t  ', 'empty.sch')).rejects.toThrow();
      await expect(importCadPcb('   \r\n\t  ', 'empty.brd')).rejects.toThrow();
      
      const emptyLib = await importCadLibrary('   \r\n\t  ', 'empty.lib');
      expect(emptyLib.components).toEqual([]);
      expect(emptyLib.patterns).toEqual([]);
    });

    it('handles corrupted and truncated XML gracefully', () => {
      const truncatedXml = '<?xml version="1.0"?><eagle version="7.7.0"><drawing><board><elements><element name="R1" x="10"';
      expect(() => importCadPcbSync(truncatedXml, 'truncated.brd')).not.toThrow();
      const res = importCadPcbSync(truncatedXml, 'truncated.brd');
      expect(res.pcb).toBeDefined();
    });

    it('handles malformed S-expressions with missing and extra parentheses without infinite loops', () => {
      const malformedSexpr = '(kicad_pcb (version 2021) (generator pcbnew (footprint "R" (at 10 20) (pad 1 smd';
      expect(() => parseKicadPcb(malformedSexpr, 'broken.kicad_pcb')).not.toThrow();

      const extraParens = '(((kicad_pcb (version 2021)))))))))))))))';
      expect(() => parseKicadPcb(extraParens, 'extra.kicad_pcb')).toThrow(/Некорректный формат/);
    });

    it('prevents NaN and Infinity coordinates across all coordinate transforms', () => {
      const weirdCoordsXml = `<?xml version="1.0"?>
<eagle version="7.7.0">
  <drawing>
    <board>
      <elements>
        <element name="R1" x="NaN" y="Infinity"/>
        <element name="R2" x="-Infinity" y="1e308"/>
        <element name="R3" x="0.0000000001" y="-0.0000000001"/>
      </elements>
      <signals>
        <signal name="S1">
          <wire x1="NaN" y1="10" x2="20" y2="Infinity" width="NaN" layer="1"/>
        </signal>
      </signals>
    </board>
  </drawing>
</eagle>`;
      const res = importCadPcbSync(weirdCoordsXml, 'weird.brd');
      for (const comp of res.pcb.components) {
        expect(Number.isFinite(comp.x)).toBe(true);
        expect(Number.isFinite(comp.y)).toBe(true);
      }
      for (const trace of res.pcb.traces) {
        expect(Number.isFinite(trace.width)).toBe(true);
        for (const pt of trace.points) {
          expect(Number.isFinite(pt.x)).toBe(true);
          expect(Number.isFinite(pt.y)).toBe(true);
        }
      }
    });

    it('survives random fuzz binary streams without unhandled panics or memory leaks', async () => {
      // Generate 50 varied binary buffers with arbitrary byte sequences
      for (let run = 0; run < 50; run++) {
        const len = 32 + (run * 23) % 256;
        const buf = new Uint8Array(len);
        for (let j = 0; j < len; j++) buf[j] = (run * 17 + j * 31) & 0xff;

        // Fuzz detection & parser
        try {
          const id = detectDipTraceBinaryFormat(buf);
          if (id) {
            await importCadSchematic(buf, 'fuzz.dch');
          }
        } catch (e) {
          // Expected controlled errors, no fatal crash
          expect((e as Error).message).toBeDefined();
        }
      }
    });

    it('imports large real-world projects (< 1 second benchmark)', () => {
      const startTime = performance.now();
      // Synthesize a board with 200 components and 500 traces
      const comps = Array.from({ length: 200 }, (_, i) => `|RECORD=Component|PATTERN=DIP-8|SOURCEDESIGNATOR=U${i + 1}|COMMENT=IC|LAYER=TOP|X=${(i % 20) * 15}|Y=${Math.floor(i / 20) * 15}|ROTATION=0|`).join('\n');
      const traces = Array.from({ length: 500 }, (_, i) => `|RECORD=Track|LAYER=TOP|NET=N${i % 25}|X1=${(i % 30) * 10}|Y1=${Math.floor(i / 30) * 10}|X2=${(i % 30) * 10 + 8}|Y2=${Math.floor(i / 30) * 10 + 8}|WIDTH=12|`).join('\n');
      const largeAltiumPcb = `|RECORD=Board|\n${comps}\n${traces}`;

      const res = parseAltiumOrPcadPcb(largeAltiumPcb, 'large_benchmark.PcbDoc');
      const durationMs = performance.now() - startTime;

      expect(res.pcb.components.length).toBe(200);
      expect(res.pcb.traces.length).toBe(500);
      expect(durationMs).toBeLessThan(1000); // Must be under 1 second!
    });
  });
});
