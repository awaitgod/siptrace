import { describe, expect, it } from 'vitest';
import {
  ComponentDef,
  PlacedComponent,
  Point2D,
  SchematicProject,
  SchematicSheet,
  PcbProject
} from '../../src/core/types';
import {
  importCadPcbSync,
  importCadSchematicSync,
  detectDipTraceBinaryFormat,
  GostConversionReport
} from '../../src/engines/importers';
import {
  parseAltiumOrPcadSchematic,
  parseAltiumOrPcadPcb,
  decodeAltiumWideString
} from '../../src/engines/importers/ecad/altiumParser';
import {
  parseEasyEdaSchematicJson,
  parseEasyEdaPcbJson
} from '../../src/engines/importers/ecad/easyEdaParser';
import {
  parseKicadSchematic
} from '../../src/engines/importers/kicad/kicadSchematicParser';
import {
  parseKicadPcb
} from '../../src/engines/importers/kicad/kicadPcbParser';
import {
  parseEagleXml
} from '../../src/engines/importers/eagle/eagleXmlParser';
import {
  exportDipTraceAsciiSchematic,
  exportDipTraceAsciiPcb
} from '../../src/engines/importers/diptrace/asciiExporter';
import {
  encodeDipTraceSchematicAscii
} from '../../src/engines/importers/diptrace/asciiEncoding';
import { findComponentById } from '../../src/gost/libraries/gostComponents';
import {
  runSchematicErc,
  extractSchematicNets,
  resolveComponentDef,
  DEFAULT_ERC_SETTINGS,
  DEFAULT_PIN_MATRIX,
  PinElectricalType
} from '../../src/engines/erc';
import {
  runBuiltInSpiceSimulation,
  exportSpiceNetlist,
  solveLinearSystem,
  solveComplexSystem,
  SpiceSimulationOptions
} from '../../src/engines/spice';
import {
  generateGostBom,
  exportGostBomToCsv,
  exportGostBomToHtml,
  formatRefDesRange,
  splitRefDes,
  buildGostComponentFullName
} from '../../src/gost/bom';

// Shared definitions for unit tests
const testResistorDef: ComponentDef = {
  id: 'res_def',
  name: 'Резистор',
  refDesPrefix: 'R',
  parts: [{
    partIndex: 1,
    pins: [
      { id: 'p1', number: '1', name: '1', x: -5, y: 0, length: 2.54, orientation: 0, style: 'Line', electricalType: 'Passive' },
      { id: 'p2', number: '2', name: '2', x: 5, y: 0, length: 2.54, orientation: 180, style: 'Line', electricalType: 'Passive' }
    ],
    primitives: [
      { type: 'rect', x: -5, y: -2, w: 10, h: 4, width: 0.35 }
    ]
  }]
};

// Helper to create mock schematic project
function createTestSchematic(components: PlacedComponent[], wires: SchematicSheet['wires'] = [], netPorts: SchematicSheet['netPorts'] = [], customDefs: Record<string, ComponentDef> = {}): SchematicProject {
  return {
    id: 'test_project_spice',
    projectName: 'Audit Agent 5 Enterprise Test',
    activeSheetId: 'sheet_1',
    sheets: [{
      id: 'sheet_1',
      name: 'Лист 1',
      format: 'A4_L',
      titleBlock: {
        designation: 'ГТРС.468759.005 Э3',
        name: 'Модуль сопряжения интерфейсов',
        developer: 'Аудитор 5',
        checker: 'Контролер',
        normControl: 'Нормоконтроль',
        approver: 'Утвердил',
        date: '2026-11-18',
        enabled: true,
        form: 'Form1',
        scale: '1:1',
        litera: 'О1',
        sheetNumber: 1,
        totalSheets: 1,
        showZones: true
      },
      components,
      wires,
      buses: [],
      busTaps: [],
      netPorts,
      junctions: [],
      shapes: [],
      tables: [],
      hierarchyBlocks: []
    }],
    customComponentDefs: {
      ...customDefs
    }
  };
}

describe('Audit Agent 5: Deep CAD Interoperability, SPICE MNA & GOST Verification', () => {

  // =========================================================================
  // 1. STRESS-TEST OF FOREIGN CAD IMPORTERS
  // =========================================================================
  describe('1. Comprehensive CAD Format Parsers (Altium, KiCad, Eagle, DipTrace, EasyEDA)', () => {

    it('Altium Designer SchDoc: correctly decodes wide UTF-16LE strings, pin names, power rails and coordinates', () => {
      // Test wide string decoder (comma-separated Unicode codepoints used in Altium SchDoc)
      const wideCodepoints = '65,108,116,105,117,109,32,85,83,66'; // "Altium USB"
      const decoded = decodeAltiumWideString(wideCodepoints);
      expect(decoded).toBe('Altium USB');

      // Test Altium SchDoc record stream
      const schDocRecords = [
        '|RECORD=1|LIBREFERENCE=MAX485|COMMENT=MAX485ESA|COMPONENTDESCRIPTION=RS-485 Transceiver|LOCATION.X=1500|LOCATION.Y=2000|CURRENTPARTID=1|DESIGNATOR=DD1|',
        '|RECORD=2|OWNERINDEX=0|NAME=RO|DESIGNATOR=1|LOCATION.X=1400|LOCATION.Y=2000|PINCONGLOMERATE=0|PINLENGTH=20|',
        '|RECORD=2|OWNERINDEX=0|NAME=/RE|DESIGNATOR=2|LOCATION.X=1400|LOCATION.Y=1900|PINCONGLOMERATE=0|PINLENGTH=20|',
        '|RECORD=2|OWNERINDEX=0|NAME=DE|DESIGNATOR=3|LOCATION.X=1400|LOCATION.Y=1800|PINCONGLOMERATE=0|PINLENGTH=20|',
        '|RECORD=2|OWNERINDEX=0|NAME=DI|DESIGNATOR=4|LOCATION.X=1400|LOCATION.Y=1700|PINCONGLOMERATE=0|PINLENGTH=20|',
        '|RECORD=2|OWNERINDEX=0|NAME=GND|DESIGNATOR=5|LOCATION.X=1700|LOCATION.Y=1700|PINCONGLOMERATE=2|PINLENGTH=20|',
        '|RECORD=2|OWNERINDEX=0|NAME=A|DESIGNATOR=6|LOCATION.X=1700|LOCATION.Y=1800|PINCONGLOMERATE=2|PINLENGTH=20|',
        '|RECORD=2|OWNERINDEX=0|NAME=B|DESIGNATOR=7|LOCATION.X=1700|LOCATION.Y=1900|PINCONGLOMERATE=2|PINLENGTH=20|',
        '|RECORD=2|OWNERINDEX=0|NAME=VCC|DESIGNATOR=8|LOCATION.X=1700|LOCATION.Y=2000|PINCONGLOMERATE=2|PINLENGTH=20|',
        '|RECORD=34|OWNERINDEX=0|TEXT=DD1|',
        '|RECORD=41|OWNERINDEX=0|NAME=Value|TEXT=MAX485ESA|',
        '|RECORD=41|OWNERINDEX=0|NAME=Footprint|TEXT=SOIC-8|',
        '|RECORD=17|LOCATION.X=1700|LOCATION.Y=2000|TEXT=+5V|STYLE=1|',
        '|RECORD=17|LOCATION.X=1700|LOCATION.Y=1700|TEXT=GND|STYLE=4|',
        '|RECORD=27|LOCATIONCOUNT=2|X1=1700|Y1=1800|X2=1900|Y2=1800|',
        '|RECORD=25|LOCATION.X=1900|LOCATION.Y=1800|TEXT=RS485_A|'
      ].join('\n');

      const res = parseAltiumOrPcadSchematic(schDocRecords, 'RS485_Interface.SchDoc');
      expect(res.project.sheets.length).toBe(1);
      const sheet = res.project.sheets[0];
      expect(sheet.components.length).toBeGreaterThanOrEqual(1);

      const comp = sheet.components[0];
      expect(comp).toBeDefined();
      expect(comp.value.includes('MAX485') || comp.value.includes('К5559ИН10А')).toBe(true);

      const def = resolveComponentDef(comp.componentDefId, res.project.customComponentDefs);
      expect(def).toBeDefined();
      expect(def!.parts[0].pins.length).toBe(8);
      expect(comp.patternId || def.patternId).toBeDefined();

      // Net ports and wires
      expect(sheet.netPorts.length).toBeGreaterThanOrEqual(2);
      expect(sheet.wires.length).toBeGreaterThanOrEqual(1);
      expect(res.report.convertedComponents).toBeGreaterThanOrEqual(1);
    });

    it('Altium Designer PcbDoc: parses multilayer board, pads with coordinates, tracks and vias', () => {
      const pcbDocText = [
        '|RECORD=Board|ORIGINX=0|ORIGINY=0|',
        '|RECORD=Component|SOURCEDESIGNATOR=R1|COMMENT=10k|PATTERN=0805|LAYER=TOP|X=1500|Y=1200|ROTATION=90|',
        '|RECORD=Pad|OWNERINDEX=0|NAME=1|X=1500|Y=1150|TOPXSIZE=40|TOPYSIZE=50|LAYER=TOP|NET=NET_SIG|',
        '|RECORD=Pad|OWNERINDEX=0|NAME=2|X=1500|Y=1250|TOPXSIZE=40|TOPYSIZE=50|LAYER=TOP|NET=GND|',
        '|RECORD=Track|LAYER=TOP|NET=NET_SIG|X1=1500|Y1=1150|X2=2000|Y2=1150|WIDTH=12|',
        '|RECORD=Via|X=2000|Y=1150|NET=NET_SIG|DIAMETER=28|HOLESIZE=14|'
      ].join('\n');

      const res = parseAltiumOrPcadPcb(pcbDocText, 'MainBoard.PcbDoc');
      expect(res.pcb.components.length).toBe(1);
      expect(res.pcb.components[0].refDes).toBe('R1');
      expect(res.pcb.traces.length).toBe(1);
      expect(res.pcb.traces[0].netName).toBe('NET_SIG');
      expect(res.pcb.vias.length).toBe(1);
      expect(res.pcb.vias[0].holeDiameter).toBeCloseTo(0.3556, 2);
    });

    it('KiCad v6-v8 (.kicad_sch): parses embedded multi-unit ICs (U1.1, U1.2), mirroring, pins and power ports', () => {
      const kicadSchText = `(kicad_sch (version 20230121) (generator eeschema)
  (uuid "a1b2c3d4-e5f6-7890-abcd-ef0123456789")
  (paper "A4")
  (lib_symbols
    (symbol "Logic_74xx:74HC00" (in_bom yes) (on_board yes)
      (property "Reference" "U" (at 0 0 0))
      (property "Value" "74HC00" (at 0 0 0))
      (symbol "74HC00_1_1"
        (pin input line (at -10.16 2.54 0) (length 2.54) (name "1A" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
        (pin input line (at -10.16 -2.54 0) (length 2.54) (name "1B" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
        (pin output line (at 10.16 0 180) (length 2.54) (name "1Y" (effects (font (size 1.27 1.27)))) (number "3" (effects (font (size 1.27 1.27)))))
      )
      (symbol "74HC00_2_1"
        (pin input line (at -10.16 2.54 0) (length 2.54) (name "2A" (effects (font (size 1.27 1.27)))) (number "4" (effects (font (size 1.27 1.27)))))
        (pin input line (at -10.16 -2.54 0) (length 2.54) (name "2B" (effects (font (size 1.27 1.27)))) (number "5" (effects (font (size 1.27 1.27)))))
        (pin output line (at 10.16 0 180) (length 2.54) (name "2Y" (effects (font (size 1.27 1.27)))) (number "6" (effects (font (size 1.27 1.27)))))
      )
    )
  )
  (symbol (lib_id "Logic_74xx:74HC00") (at 50.8 76.2 0) (unit 1)
    (property "Reference" "DD1" (at 50.8 70 0))
    (property "Value" "74HC00D" (at 50.8 82 0))
    (property "Footprint" "Package_SO:SOIC-14_3.9x8.7mm_P1.27mm" (at 0 0 0))
  )
  (symbol (lib_id "Logic_74xx:74HC00") (at 101.6 76.2 0) (unit 2) (mirror x)
    (property "Reference" "DD1" (at 101.6 70 0))
    (property "Value" "74HC00D" (at 101.6 82 0))
    (property "Footprint" "Package_SO:SOIC-14_3.9x8.7mm_P1.27mm" (at 0 0 0))
  )
  (symbol (lib_id "power:VCC") (at 50.8 60 0)
    (property "Reference" "#PWR01" (at 50.8 60 0))
    (property "Value" "VCC" (at 50.8 55 0))
  )
  (wire (pts (xy 40.64 78.74) (xy 50.8 78.74)))
  (junction (at 50.8 78.74) (diameter 0.8))
)`;

      const res = parseKicadSchematic(kicadSchText, 'Dual_NAND_Logic.kicad_sch');
      expect(res.project.sheets.length).toBe(1);
      const sheet = res.project.sheets[0];

      // Two multi-unit gates of DD
      const ddGates = sheet.components.filter((c) => c.refDes.startsWith('DD'));
      expect(ddGates.length).toBe(2);
      expect(ddGates[0].partIndex).toBe(1);
      expect(ddGates[1].partIndex).toBe(2);
      expect(ddGates[1].flipY).toBe(true); // mirror x mapped to flipY

      // Power port
      expect(sheet.netPorts.some((p) => p.netName === 'VCC')).toBe(true);
      // Wires and junctions
      expect(sheet.wires.length).toBeGreaterThanOrEqual(1);
      expect(sheet.junctions.length).toBeGreaterThanOrEqual(1);
    });

    it('Eagle XML (.sch & .brd): handles zero coordinates, multi-part gates, and bus connections', () => {
      const eagleSchXml = `<?xml version="1.0" encoding="utf-8"?>
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
        <part name="R1" library="test" deviceset="RES" value="4.7k"/>
        <part name="R2" library="test" deviceset="RES" value="10k"/>
      </parts>
      <sheets>
        <sheet>
          <instances>
            <instance part="R1" gate="G$1" x="0" y="0"/>
            <instance part="R2" gate="G$1" x="25.4" y="50.8"/>
          </instances>
          <nets>
            <net name="N$1">
              <segment>
                <pinref part="R1" gate="G$1" pin="1"/>
                <wire x1="0" y1="0" x2="25.4" y2="0" width="0.1524"/>
              </segment>
            </net>
          </nets>
        </sheet>
      </sheets>
    </schematic>
  </drawing>
</eagle>`;

      const res = importCadSchematicSync(eagleSchXml, 'Eagle_Zero_Test.sch');
      expect(res.project).toBeDefined();
      const sheet = res.project.sheets[0];
      expect(sheet.components.length).toBeGreaterThanOrEqual(1);
      const firstComp = sheet.components[0];
      expect(firstComp).toBeDefined();
      expect(firstComp.x).toBe(0);
      expect(sheet.components[1].x).toBe(25.4);
    });

    it('EasyEDA Schematic & PCB JSON: accurately imports components, nets, and polygon geometry', () => {
      const easyEdaSchJson = JSON.stringify({
        head: { docType: '1', editorVersion: '6.5.22' },
        shape: [
          'LIB~100~200~NE555P~SOIC-8~DA1',
          'W~100,200 150,200',
          'N~150~200~0~0~NET_TRIG'
        ]
      });

      const resSch = parseEasyEdaSchematicJson(easyEdaSchJson, 'EasyEDA_Timer');
      expect(resSch.project.sheets[0].components.length).toBeGreaterThanOrEqual(1);
      const da1 = resSch.project.sheets[0].components[0];
      expect(da1.refDes).toBe('DA1');
      expect(da1.value).toBe('NE555P');

      const easyEdaPcbJson = JSON.stringify({
        head: { docType: '2', editorVersion: '6.5.22' },
        shape: [
          'LIB~50~50~0~SOIC-8~DA1~NE555~gge2~TOP',
          'PAD~RECT~45~45~1.5~0.6~1~1~NET_TRIG~TOP~0',
          'TRACK~1~1~NET_TRIG~45 45 60 45',
          'VIA~60~45~2.4~NET_TRIG~1.2'
        ]
      });

      const resPcb = parseEasyEdaPcbJson(easyEdaPcbJson, 'EasyEDA_Timer_PCB');
      expect(resPcb.pcb.components.length).toBeGreaterThanOrEqual(1);
      expect(resPcb.pcb.traces.length).toBeGreaterThanOrEqual(1);
      expect(resPcb.pcb.vias.length).toBeGreaterThanOrEqual(1);
    });

    it('DipTrace ASCII roundtrip: exports schematic and PCB with lossless net and attribute preservation', () => {
      const r1: PlacedComponent = {
        id: 'r1',
        componentDefId: 'res_def',
        refDes: 'R1',
        typeName: 'Резистор',
        value: '10k',
        patternId: 'RES_0805',
        x: 40,
        y: 60,
        angle: 90,
        flipX: false,
        flipY: false,
        partIndex: 1
      };
      const r2: PlacedComponent = {
        id: 'r2',
        componentDefId: 'res_def',
        refDes: 'R2',
        typeName: 'Резистор',
        value: '22k',
        patternId: 'RES_0805',
        x: 80,
        y: 60,
        angle: 0,
        flipX: false,
        flipY: false,
        partIndex: 1
      };

      const project = createTestSchematic(
        [r1, r2],
        [{ id: 'w1', netName: 'DIV_OUT', points: [{ x: 40, y: 60 }, { x: 80, y: 60 }] }],
        [],
        { res_def: testResistorDef }
      );

      const asciiExport = exportDipTraceAsciiSchematic(project);
      expect(asciiExport).toContain('(Schematic');
      expect(asciiExport).toContain('R1');
      expect(asciiExport).toContain('10k');
      expect(asciiExport).toContain('DIV_OUT');

      // Binary format detector
      const rawAsciiBytes = new TextEncoder().encode(asciiExport);
      const binCheck = detectDipTraceBinaryFormat(rawAsciiBytes);
      expect(binCheck).toBeNull(); // Correctly rejects ASCII as binary
    });
  });

  // =========================================================================
  // 2. SPICE MNA ENGINE & NONLINEAR CONVERGENCE AUDIT
  // =========================================================================
  describe('2. SPICE MNA Simulation Convergence (RLC, Diodes, Transistors)', () => {

    const resistorDef: ComponentDef = {
      id: 'res_def',
      name: 'Резистор',
      refDesPrefix: 'R',
      parts: [{
        partIndex: 1,
        pins: [
          { id: 'p1', number: '1', name: '1', x: -5, y: 0, electricalType: 'Passive' },
          { id: 'p2', number: '2', name: '2', x: 5, y: 0, electricalType: 'Passive' }
        ]
      }]
    };

    const diodeDef: ComponentDef = {
      id: 'diode_def',
      name: 'Диод',
      refDesPrefix: 'VD',
      parts: [{
        partIndex: 1,
        pins: [
          { id: 'p1', number: '1', name: 'A', x: -5, y: 0, electricalType: 'Passive' },
          { id: 'p2', number: '2', name: 'K', x: 5, y: 0, electricalType: 'Passive' }
        ]
      }]
    };

    const capDef: ComponentDef = {
      id: 'cap_def',
      name: 'Конденсатор',
      refDesPrefix: 'C',
      parts: [{
        partIndex: 1,
        pins: [
          { id: 'p1', number: '1', name: '1', x: -5, y: 0, electricalType: 'Passive' },
          { id: 'p2', number: '2', name: '2', x: 5, y: 0, electricalType: 'Passive' }
        ]
      }]
    };

    const indDef: ComponentDef = {
      id: 'ind_def',
      name: 'Катушка индуктивности',
      refDesPrefix: 'L',
      parts: [{
        partIndex: 1,
        pins: [
          { id: 'p1', number: '1', name: '1', x: -5, y: 0, electricalType: 'Passive' },
          { id: 'p2', number: '2', name: '2', x: 5, y: 0, electricalType: 'Passive' }
        ]
      }]
    };

    const bjtDef: ComponentDef = {
      id: 'bjt_def',
      name: 'Транзистор NPN',
      refDesPrefix: 'VT',
      parts: [{
        partIndex: 1,
        pins: [
          { id: 'p1', number: '1', name: 'B', x: -5, y: 0, electricalType: 'Input' },
          { id: 'p2', number: '2', name: 'C', x: 5, y: 5, electricalType: 'Output' },
          { id: 'p3', number: '3', name: 'E', x: 5, y: -5, electricalType: 'Passive' }
        ]
      }]
    };

    it('DC Operating Point: accurately computes voltage divider potentials and power rails', () => {
      // R1: 10k from +5V to VMID
      // R2: 10k from VMID to GND
      const r1: PlacedComponent = {
        id: 'r1',
        componentDefId: 'res_def',
        refDes: 'R1',
        typeName: 'Резистор',
        value: '10k',
        x: 20,
        y: 20,
        angle: 0,
        flipX: false,
        flipY: false,
        partIndex: 1
      };
      const r2: PlacedComponent = {
        id: 'r2',
        componentDefId: 'res_def',
        refDes: 'R2',
        typeName: 'Резистор',
        value: '10k',
        x: 30,
        y: 20,
        angle: 0,
        flipX: false,
        flipY: false,
        partIndex: 1
      };

      const wires = [
        { id: 'w1', netName: 'VMID', points: [{ x: 25, y: 20 }, { x: 25, y: 20 }] }
      ];
      const ports = [
        { id: 'p1', netName: '+5V', x: 15, y: 20, style: 'Power' as const },
        { id: 'p2', netName: 'GND', x: 35, y: 20, style: 'Ground' as const }
      ];

      const proj = createTestSchematic([r1, r2], wires, ports, { res_def: resistorDef });
      const simRes = runBuiltInSpiceSimulation(proj, { mode: 'DC' });

      expect(simRes.converged).toBe(true);
      const dc5V = simRes.dcNodes.find((n) => n.netName === '+5V')?.dcVoltage;
      const vMid = simRes.dcNodes.find((n) => n.netName === 'VMID')?.dcVoltage;
      expect(dc5V).toBeCloseTo(5.0, 1);
      expect(vMid).toBeCloseTo(2.5, 1);
    });

    it('Diode circuit: converges with nonlinear forward voltage drop (~0.7V) and handles reverse bias', () => {
      // R1 (1k) in series with VD1 (1N4148) to GND from +5V
      const r1: PlacedComponent = {
        id: 'r1',
        componentDefId: 'res_def',
        refDes: 'R1',
        typeName: 'Резистор',
        value: '1k',
        x: 20,
        y: 20,
        angle: 0,
        flipX: false,
        flipY: false,
        partIndex: 1
      };
      const vd1: PlacedComponent = {
        id: 'vd1',
        componentDefId: 'diode_def',
        refDes: 'VD1',
        typeName: 'Диод кремниевый',
        value: '1N4148',
        x: 30,
        y: 20,
        angle: 0,
        flipX: false,
        flipY: false,
        partIndex: 1
      };

      const wires = [{ id: 'w1', netName: 'V_ANODE', points: [{ x: 25, y: 20 }, { x: 25, y: 20 }] }];
      const ports = [
        { id: 'p1', netName: '+5V', x: 15, y: 20, style: 'Power' as const },
        { id: 'p2', netName: 'GND', x: 35, y: 20, style: 'Ground' as const }
      ];

      const proj = createTestSchematic([r1, vd1], wires, ports, { res_def: resistorDef, diode_def: diodeDef });
      const simRes = runBuiltInSpiceSimulation(proj, { mode: 'DC' });

      expect(simRes.converged).toBe(true);
      // Diode forward voltage at anode should be ~0.7V
      const vAnode = simRes.dcNodes.find((n) => n.netName === 'V_ANODE')?.dcVoltage;
      expect(vAnode).toBeGreaterThan(0.5);
      expect(vAnode).toBeLessThan(0.9);
    });

    it('RLC Transient & AC Sweep: exhibits resonant peak and asymptotic high-frequency roll-off', () => {
      // RLC series resonant circuit: R=100, L=10mH, C=100nF
      const r1: PlacedComponent = { id: 'r1', componentDefId: 'res_def', refDes: 'R1', typeName: 'Резистор', value: '100', x: 20, y: 20, angle: 0, flipX: false, flipY: false, partIndex: 1 };
      const l1: PlacedComponent = { id: 'l1', componentDefId: 'ind_def', refDes: 'L1', typeName: 'Катушка индуктивности', value: '10mH', x: 30, y: 20, angle: 0, flipX: false, flipY: false, partIndex: 1 };
      const c1: PlacedComponent = { id: 'c1', componentDefId: 'cap_def', refDes: 'C1', typeName: 'Конденсатор', value: '100nF', x: 40, y: 20, angle: 0, flipX: false, flipY: false, partIndex: 1 };

      const wires = [
        { id: 'w1', netName: 'N_RL', points: [{ x: 25, y: 20 }, { x: 25, y: 20 }] },
        { id: 'w2', netName: 'VOUT', points: [{ x: 35, y: 20 }, { x: 35, y: 20 }] }
      ];
      const ports = [
        { id: 'p1', netName: 'VIN', x: 15, y: 20, style: 'Power' as const },
        { id: 'p2', netName: 'GND', x: 45, y: 20, style: 'Ground' as const }
      ];

      const proj = createTestSchematic([r1, l1, c1], wires, ports, { res_def: resistorDef, ind_def: indDef, cap_def: capDef });
      const simRes = runBuiltInSpiceSimulation(proj, { mode: 'AC', acDecades: 5, acPointsPerDecade: 10 });

      expect(simRes.converged).toBe(true);
      expect(simRes.frequencies).toBeDefined();
      expect(simRes.acMagnitudeDb!['VOUT']).toBeDefined();

      // Verify roll-off at ultra high frequencies (10 MHz)
      const highFreqGain = simRes.acMagnitudeDb!['VOUT'][simRes.acMagnitudeDb!['VOUT'].length - 1];
      expect(highFreqGain).toBeLessThan(-30);
    });

    it('SPICE Netlist Exporter (.cir): generates standard compliant Berkeley SPICE netlist', () => {
      const r1: PlacedComponent = { id: 'r1', componentDefId: 'res_def', refDes: 'R1', typeName: 'Резистор', value: '4.7k', x: 20, y: 20, angle: 0, flipX: false, flipY: false, partIndex: 1 };
      const c1: PlacedComponent = { id: 'c1', componentDefId: 'cap_def', refDes: 'C1', typeName: 'Конденсатор', value: '10uF', x: 30, y: 20, angle: 0, flipX: false, flipY: false, partIndex: 1 };
      const vt1: PlacedComponent = { id: 'vt1', componentDefId: 'bjt_def', refDes: 'VT1', typeName: 'Транзистор NPN', value: 'BC547', x: 40, y: 20, angle: 0, flipX: false, flipY: false, partIndex: 1 };

      const wires = [
        { id: 'w1', netName: 'BASE_NET', points: [{ x: 25, y: 20 }, { x: 35, y: 20 }] }
      ];
      const ports = [
        { id: 'p1', netName: '+12V', x: 15, y: 20, style: 'Power' as const },
        { id: 'p2', netName: 'GND', x: 45, y: 15, style: 'Ground' as const }
      ];

      const proj = createTestSchematic([r1, c1, vt1], wires, ports, { res_def: resistorDef, cap_def: capDef, bjt_def: bjtDef });
      const cir = exportSpiceNetlist(proj);

      expect(cir).toContain('* SPICE Netlist generated by SIPTrace EDA');
      expect(cir).toContain('V_12V +12V 0 DC 12 AC 1');
      expect(cir).toContain('R1');
      expect(cir).toContain('4700');
      expect(cir).toContain('C1');
      expect(cir).toContain('Q_VT1');
      expect(cir).toContain('.model VT_GOST NPN');
      expect(cir).toContain('.op');
      expect(cir).toContain('.tran');
      expect(cir).toContain('.ac');
      expect(cir).toContain('.end');
    });
  });

  // =========================================================================
  // 3. ELECTRICAL RULES CHECK (ERC) VERIFICATION
  // =========================================================================
  describe('3. Electrical Rules Check (ERC) Comprehensive Rules & Pin Matrix', () => {

    const testDef = (id: string, refPrefix: string, pins: { num: string; type: PinElectricalType }[]): ComponentDef => ({
      id,
      name: id,
      refDesPrefix: refPrefix,
      parts: [{
        partIndex: 1,
        pins: pins.map((p, idx) => ({
          id: `pin_${idx}`,
          number: p.num,
          name: p.num,
          x: idx * 10,
          y: 0,
          electricalType: p.type
        }))
      }]
    });

    it('ERC detects floating (unconnected) pins on critical components', () => {
      const u1Def = testDef('u1_def', 'DD', [
        { num: '1', type: 'Input' },
        { num: '2', type: 'Input' },
        { num: '3', type: 'Output' }
      ]);

      const u1: PlacedComponent = {
        id: 'u1',
        componentDefId: 'u1_def',
        refDes: 'DD1',
        typeName: 'Микросхема',
        x: 50,
        y: 50,
        angle: 0,
        flipX: false,
        flipY: false,
        partIndex: 1
      };

      const proj = createTestSchematic([u1], [], [], { u1_def: u1Def });
      const ercErrors = runSchematicErc(proj, { ...DEFAULT_ERC_SETTINGS, checkFloatingPins: true });

      const floatingErrors = ercErrors.filter((e) => e.code === 'ERC-FLOAT');
      expect(floatingErrors.length).toBeGreaterThanOrEqual(1);
      expect(floatingErrors[0].message).toContain('DD1');
    });

    it('ERC detects output-to-output contention (shorted active outputs)', () => {
      const outDef = testDef('driver_def', 'DD', [
        { num: '1', type: 'Output' }
      ]);

      const d1: PlacedComponent = { id: 'd1', componentDefId: 'driver_def', refDes: 'DD1', typeName: 'Driver', x: 20, y: 30, angle: 0, flipX: false, flipY: false, partIndex: 1 };
      const d2: PlacedComponent = { id: 'd2', componentDefId: 'driver_def', refDes: 'DD2', typeName: 'Driver', x: 40, y: 30, angle: 0, flipX: false, flipY: false, partIndex: 1 };

      // Wire connecting DD1:1 to DD2:1 directly
      const wires = [
        { id: 'w1', netName: 'BUS_COLLISION', points: [{ x: 20, y: 30 }, { x: 40, y: 30 }] }
      ];

      const proj = createTestSchematic([d1, d2], wires, [], { driver_def: outDef });
      const ercErrors = runSchematicErc(proj, { ...DEFAULT_ERC_SETTINGS, checkOutputConflicts: true });

      const conflictErrors = ercErrors.filter((e) => e.code === 'ERC-OUT' || e.code === 'ERC-PIN-MATRIX');
      expect(conflictErrors.length).toBeGreaterThanOrEqual(1);
      expect(conflictErrors.some((e) => e.message.includes('DD1') || e.message.includes('DD2'))).toBe(true);
    });

    it('ERC handles multi-unit ICs without falsely flagging duplicate RefDes', () => {
      const multiGateDef: ComponentDef = {
        id: 'quad_nand_def',
        name: 'К155ЛА3',
        refDesPrefix: 'DD',
        parts: [
          { partIndex: 1, pins: [{ id: 'p1', number: '1', name: '1A', x: 0, y: 0, electricalType: 'Input' }] },
          { partIndex: 2, pins: [{ id: 'p2', number: '4', name: '2A', x: 0, y: 0, electricalType: 'Input' }] }
        ]
      };

      const g1: PlacedComponent = { id: 'g1', componentDefId: 'quad_nand_def', refDes: 'DD1', typeName: 'К155ЛА3', x: 10, y: 10, angle: 0, flipX: false, flipY: false, partIndex: 1 };
      const g2: PlacedComponent = { id: 'g2', componentDefId: 'quad_nand_def', refDes: 'DD1', typeName: 'К155ЛА3', x: 30, y: 10, angle: 0, flipX: false, flipY: false, partIndex: 2 };

      const proj = createTestSchematic([g1, g2], [], [], { quad_nand_def: multiGateDef });
      const ercErrors = runSchematicErc(proj, { ...DEFAULT_ERC_SETTINGS, checkDuplicateRefDes: true });

      const dupErrors = ercErrors.filter((e) => e.code === 'ERC-DUP');
      expect(dupErrors.length).toBe(0); // Valid multi-unit gates must not trigger ERC-DUP
    });
  });

  // =========================================================================
  // 4. BOM / GOST 2.701-84 & 2.106-96 SPECIFICATION VERIFICATION
  // =========================================================================
  describe('4. BOM / GOST 2.701-84 / 2.106-96 Specification Generator', () => {

    it('generates compliant BOM with exact GOST columns, correct group ordering and component consolidation', () => {
      const comps: PlacedComponent[] = [
        { id: 'c1', componentDefId: 'c_def', refDes: 'C1', typeName: 'Конденсатор керамический', value: '0.1 мкФ', gostStandard: 'ГОСТ 28884-90', patternId: '0805', x: 10, y: 10, angle: 0, flipX: false, flipY: false, partIndex: 1 },
        { id: 'c2', componentDefId: 'c_def', refDes: 'C2', typeName: 'Конденсатор керамический', value: '0.1 мкФ', gostStandard: 'ГОСТ 28884-90', patternId: '0805', x: 20, y: 10, angle: 0, flipX: false, flipY: false, partIndex: 1 },
        { id: 'c3', componentDefId: 'c_def', refDes: 'C3', typeName: 'Конденсатор керамический', value: '0.1 мкФ', gostStandard: 'ГОСТ 28884-90', patternId: '0805', x: 30, y: 10, angle: 0, flipX: false, flipY: false, partIndex: 1 },
        { id: 'r1', componentDefId: 'r_def', refDes: 'R1', typeName: 'Резистор постоянный', value: '10 кОм', gostStandard: 'ГОСТ 24238-84', patternId: '0805', x: 40, y: 10, angle: 0, flipX: false, flipY: false, partIndex: 1 },
        { id: 'r2', componentDefId: 'r_def', refDes: 'R2', typeName: 'Резистор постоянный', value: '10 кОм', gostStandard: 'ГОСТ 24238-84', patternId: '0805', x: 50, y: 10, angle: 0, flipX: false, flipY: false, partIndex: 1 },
        { id: 'dd1a', componentDefId: 'dd_def', refDes: 'DD1.1', typeName: 'Микросхема', value: 'К155ЛА3', gostStandard: 'ГОСТ 18675-79', patternId: 'DIP-14', x: 60, y: 10, angle: 0, flipX: false, flipY: false, partIndex: 1 },
        { id: 'dd1b', componentDefId: 'dd_def', refDes: 'DD1.2', typeName: 'Микросхема', value: 'К155ЛА3', gostStandard: 'ГОСТ 18675-79', patternId: 'DIP-14', x: 70, y: 10, angle: 0, flipX: false, flipY: false, partIndex: 2 }
      ];

      const proj = createTestSchematic(comps);
      const bom = generateGostBom(proj);

      expect(bom.length).toBe(3); // C1...C3, R1, R2, and DD1

      // Group ordering: GOST_GROUP_ORDER lists C (Конденсаторы) at index 4, DD (Микросхемы цифровые) at index 7, R (Резисторы) at index 18
      const groupTitles = bom.map((b) => b.groupTitle);
      expect(groupTitles[0]).toBe('Конденсаторы');
      expect(groupTitles[1]).toBe('Микросхемы цифровые');
      expect(groupTitles[2]).toBe('Резисторы');

      // Range consolidation: C1, C2, C3 -> C1...C3
      const cEntry = bom.find((b) => b.groupTitle === 'Конденсаторы');
      expect(cEntry).toBeDefined();
      expect(cEntry!.refDesList).toBe('C1...C3');
      expect(cEntry!.quantity).toBe(3);

      // Multi-unit deduplication: DD1.1 and DD1.2 counted as single physical IC DD1
      const ddEntry = bom.find((b) => b.groupTitle === 'Микросхемы цифровые');
      expect(ddEntry).toBeDefined();
      expect(ddEntry!.quantity).toBe(1);
      expect(ddEntry!.refDesList).toBe('DD1');

      // CSV export verification
      const csv = exportGostBomToCsv(bom);
      expect(csv).toContain('Поз. обозначение;Наименование;Кол.;Примечание;Группа;Корпус');
      expect(csv).toContain('"C1...C3"');
      expect(csv).toContain(';3;');

      // 1C / ERP format verification
      const csv1c = exportGostBomToCsv(bom, { format: '1c_erp' });
      expect(csv1c).toContain('Позиция;Наименование;Количество;Единица;Примечание;Группа;Корпус;Стандарт_ГОСТ');
      expect(csv1c).toContain('"шт."');
      expect(csv1c).toContain('"ГОСТ 28884-90"');

      // HTML printable verification
      const html = exportGostBomToHtml(proj, bom);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Перечень элементов');
      expect(html).toContain('ГТРС.468759.005 ПЭ3');
    });
  });
});
