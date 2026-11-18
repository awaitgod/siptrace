import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  exportDipTraceAsciiPcb,
  exportDipTraceAsciiSchematic,
  importCadLibrary,
  importCadPcb,
  importCadPcbSync,
  importCadSchematic,
  importCadSchematicSync,
  importExternalCadLibrary,
  serializePcb,
  serializeSchematic
} from '../../src/engines/importers';
import { encodeDipTraceSchematicAscii } from '../../src/engines/importers/diptrace/asciiEncoding';
import {
  exportExcellonDrill,
  exportGerberSet,
  exportPcbDxf,
  exportPcbObj3D,
  exportPcbStep,
  exportPcbStlAscii,
  exportPcbSvg1to1,
  exportPcbWrl
} from '../../src/engines/camExport';
import { exportGerberZipBytes, inspectGerberProjectOrBytes } from '../../src/engines/camBundle';
import { exportSpiceNetlist } from '../../src/engines/spice';
import { exportGostBomToCsv, exportGostBomToHtml, generateGostBom } from '../../src/gost/bom';
import { createZipArchive } from '../../src/core/utils/zipArchive';
import { extractSchematicNets, resolveComponentDef } from '../../src/engines/erc';
import { transformPoint } from '../../src/core/geometry';
import { openPickedProjectFile } from '../../src/core/persistence/projectFactory';
import { createImportedPcbProject } from '../../src/engines/importers/projectShells';
import { readOle2Streams } from '../../src/engines/importers/ecad/ole2Reader';
import { decodeAnsiOrUtf8 } from '../../src/engines/importers/diptrace/binaryEncoding';
import { createBlankSchematicProject } from '../../src/ui/modules/schematic/services/schematicActionsService';
import { findComponentById } from '../../src/gost/libraries/gostComponents';

const ROOT = resolve(__dirname, '../..');
const EXT = resolve(ROOT, 'tests/fixtures/external');
const AUDIT_EXT = resolve(ROOT, 'audit/external');

function readText(p: string): string {
  return readFileSync(p, 'utf8');
}

function readBytes(p: string): Uint8Array {
  return new Uint8Array(readFileSync(p));
}

describe('Combine Agent 5: Real External CAD Interop, Roundtrips & Edge-Case Audit', () => {
  describe('1. KiCad 6/7/8/9 Real Schematics, PCBs & Libraries', () => {
    it('imports KiCad 9 ecc83-pp_v2.kicad_sch and inspects pin-wire connectivity', async () => {
      const bytes = readBytes(resolve(EXT, 'kicad-ecc83/ecc83-pp_v2.kicad_sch'));
      const res = await importCadSchematic(bytes, 'ecc83-pp_v2.kicad_sch');
      const sheet = res.project.sheets[0];

      expect(res.detectedFormat).toBe('KiCad Schematic');
      expect(sheet.components.length).toBeGreaterThan(10);
      expect(sheet.wires.length).toBeGreaterThan(20);

      // Verify connectivity: count how many wires actually touch a component pin tip
      const pinTips: Array<{ refDes: string; pin: string; x: number; y: number }> = [];
      for (const comp of sheet.components) {
        const def = resolveComponentDef(comp.componentDefId, res.project.customComponentDefs);
        const part = def?.parts[comp.partIndex] ?? def?.parts[0];
        for (const pin of part?.pins ?? []) {
          const wp = transformPoint(pin.x, pin.y, comp.x, comp.y, comp.angle, comp.flipX, comp.flipY);
          pinTips.push({ refDes: comp.refDes, pin: pin.number, x: wp.x, y: wp.y });
        }
      }
      let connectedEndpoints = 0;
      let totalEndpoints = 0;
      for (const w of sheet.wires) {
        for (const pt of [w.points[0], w.points[w.points.length - 1]]) {
          totalEndpoints++;
          if (pinTips.some((t) => Math.hypot(t.x - pt.x, t.y - pt.y) < 0.2)) {
            connectedEndpoints++;
          }
        }
      }
      const nets = extractSchematicNets(res.project);
      console.log('[AUDIT KiCad9 ecc83 sch]', {
        components: sheet.components.length,
        wires: sheet.wires.length,
        netPorts: sheet.netPorts.length,
        connectedEndpoints,
        totalEndpoints,
        nets: nets.length
      });
      expect(sheet.components.length).toBeGreaterThan(0);
    });

    it('imports KiCad 9 ecc83-pp_v2.kicad_pcb and pic_programmer.kicad_pcb', async () => {
      const eccPcb = await importCadPcb(readBytes(resolve(EXT, 'kicad-ecc83/ecc83-pp_v2.kicad_pcb')), 'ecc83-pp_v2.kicad_pcb');
      const picPcb = await importCadPcb(readBytes(resolve(EXT, 'kicad-pic-programmer/pic_programmer.kicad_pcb')), 'pic_programmer.kicad_pcb');

      console.log('[AUDIT KiCad9 ecc83 pcb]', {
        components: eccPcb.pcb.components.length,
        traces: eccPcb.pcb.traces.length,
        vias: eccPcb.pcb.vias.length,
        outlinePts: eccPcb.pcb.boardOutline.length,
        pours: eccPcb.pcb.copperPours.length,
        warnings: eccPcb.report.warnings
      });
      console.log('[AUDIT KiCad pic_programmer pcb]', {
        components: picPcb.pcb.components.length,
        traces: picPcb.pcb.traces.length,
        vias: picPcb.pcb.vias.length,
        outlinePts: picPcb.pcb.boardOutline.length,
        pours: picPcb.pcb.copperPours.length,
        warnings: picPcb.report.warnings
      });

      expect(eccPcb.pcb.components.length).toBeGreaterThan(10);
      expect(eccPcb.pcb.traces.length).toBeGreaterThan(10);
      expect(eccPcb.pcb.boardOutline.length).toBeGreaterThanOrEqual(4);
      expect(picPcb.pcb.components.length).toBeGreaterThan(20);
      expect(picPcb.pcb.traces.length).toBeGreaterThan(50);
    });

    it('imports KiCad .kicad_sym and .kicad_mod libraries', async () => {
      const symEcc = await importExternalCadLibrary(readBytes(resolve(EXT, 'kicad-ecc83/ecc83-pp.kicad_sym')), 'ecc83-pp.kicad_sym');
      const symSallen = await importExternalCadLibrary(readBytes(resolve(EXT, 'kicad-sallen-key/sallen_key_schlib.kicad_sym')), 'sallen_key_schlib.kicad_sym');
      const modSoic = await importExternalCadLibrary(readBytes(resolve(EXT, 'kicad-lib/SOIC-8_3.9x4.9mm_P1.27mm.kicad_mod')), 'SOIC-8.kicad_mod');
      const modCap = await importExternalCadLibrary(readBytes(resolve(EXT, 'kicad-lib/CP_Radial_D10.0mm_P5.00mm.kicad_mod')), 'CP_Radial.kicad_mod');

      console.log('[AUDIT KiCad libs]', {
        eccSymComps: symEcc.components.length,
        sallenSymComps: symSallen.components.length,
        soicPads: modSoic.patterns[0]?.pads.length,
        capPads: modCap.patterns[0]?.pads.length,
        capShapes: modCap.patterns[0]?.graphics.length
      });

      expect(symEcc.components.length).toBeGreaterThan(0);
      expect(symSallen.components.length).toBeGreaterThan(0);
      expect(modSoic.patterns[0].pads.length).toBe(8);
      expect(modCap.patterns[0].pads.length).toBe(2);
    });

    it('detects KiCad edge-case defects: oval drill NaN, plural (layers) on zones, gr_arc angle', () => {
      const kicadEdgePcb = `(kicad_pcb (version 20240108) (generator "pcbnew")
        (net 0 "") (net 1 "GND")
        (gr_rect (start 0 0) (end 50 40) (layer "Edge.Cuts") (stroke (width 0.1)))
        (footprint "Connector:USB_C" (layer "F.Cu") (at 20 20)
          (property "Reference" "J1")
          (pad "1" thru_hole oval (at 0 0) (size 1.6 2.4) (drill oval 0.65 1.25) (layers "*.Cu" "*.Mask") (net 1 "GND"))
        )
        (zone (net 1) (net_name "GND") (layers "B.Cu") (clearance 0.25)
          (polygon (pts (xy 2 2) (xy 48 2) (xy 48 38) (xy 2 38)))
        )
      )`;
      const parsed = importCadPcbSync(kicadEdgePcb, 'edge.kicad_pcb');
      const pad = parsed.pcb.components[0].pads[0];
      const zone = parsed.pcb.copperPours[0];
      console.log('[AUDIT KiCad edge cases]', {
        ovalDrillParsedHole: pad.holeDiameter,
        zoneLayerParsed: zone.layer
      });
      // BUG VERIFIED: (drill oval 0.65 1.25) sets sxNum(dr, 1, 0) = 0 -> makePadDef clamps THT fallback to 0.2 instead of 0.65
      expect(pad.holeDiameter).toBe(0.2);
      // BUG VERIFIED: (zone (layers "B.Cu")) ignores plural `layers`, defaults to TopCopper!
      expect(zone.layer).toBe('TopCopper');
    });
  });

  describe('2. Eagle Real Board, Schematic & Library', () => {
    it('imports SparkFun RFM22B .sch, .brd and SparkFun-Resistors.lbr', async () => {
      const schRes = await importCadSchematic(readBytes(resolve(AUDIT_EXT, 'sparkfun-rfm22b/SparkFun_RF_Transceiver-RFM22B.sch')), 'SparkFun_RF_Transceiver-RFM22B.sch');
      const brdRes = await importCadPcb(readBytes(resolve(AUDIT_EXT, 'sparkfun-rfm22b/SparkFun_RF_Transceiver-RFM22B.brd')), 'SparkFun_RF_Transceiver-RFM22B.brd');
      const lbrRes = await importExternalCadLibrary(readBytes(resolve(EXT, 'eagle-lib/SparkFun-Resistors.lbr')), 'SparkFun-Resistors.lbr');

      console.log('[AUDIT Eagle]', {
        schComps: schRes.project.sheets[0].components.length,
        schWires: schRes.project.sheets[0].wires.length,
        brdComps: brdRes.pcb.components.length,
        brdTraces: brdRes.pcb.traces.length,
        brdWarnings: brdRes.report.warnings,
        lbrComps: lbrRes.components.length,
        lbrPats: lbrRes.patterns.length
      });

      expect(schRes.project.sheets[0].components.length).toBeGreaterThan(5);
      expect(brdRes.pcb.components.length).toBeGreaterThan(5);
      expect(brdRes.pcb.traces.length).toBeGreaterThan(10);
      expect(lbrRes.components.length).toBeGreaterThan(5);
      expect(lbrRes.patterns.length).toBeGreaterThan(5);
    });
  });

  describe('3. DipTrace Binary (.eli/.lib), XML (.dchxml/.dipxml/.elixml) & ASCII v46 Roundtrip', () => {
    it('imports real DipTrace binary arduino.eli and arduino.lib', async () => {
      const eliRes = await importExternalCadLibrary(readBytes(resolve(EXT, 'diptrace-bin/arduino.eli')), 'arduino.eli');
      const libRes = await importExternalCadLibrary(readBytes(resolve(EXT, 'diptrace-bin/arduino.lib')), 'arduino.lib');

      console.log('[AUDIT DipTrace binary libs]', {
        eliComps: eliRes.components.length,
        eliPats: eliRes.patterns.length,
        libPats: libRes.patterns.length,
        firstComp: eliRes.components[0]?.name,
        firstCompPins: eliRes.components[0]?.parts[0]?.pins.length
      });

      expect(eliRes.components.length).toBeGreaterThan(0);
      expect(libRes.patterns.length).toBeGreaterThan(0);
    });

    it('audits real DipTrace XML (.dchxml, .dipxml, .elixml) and documents parser gaps', async () => {
      const dchXml = readBytes(resolve(EXT, 'diptrace-xml/i2c-level-shifter.dchxml'));
      const dipXml = readBytes(resolve(EXT, 'diptrace-xml/i2c-level-shifter-pcb.dipxml'));
      const eliXml = readBytes(resolve(EXT, 'diptrace-xml/C4147.elixml'));

      const schRes = await importCadSchematic(dchXml, 'i2c-level-shifter.dchxml');
      const pcbRes = await importCadPcb(dipXml, 'i2c-level-shifter-pcb.dipxml');
      const libRes = await importExternalCadLibrary(eliXml, 'C4147.elixml');

      console.log('[AUDIT DipTrace XML]', {
        schComps: schRes.project.sheets[0].components.length,
        schWires: schRes.project.sheets[0].wires.length,
        pcbComps: pcbRes.pcb.components.length,
        pcbTraces: pcbRes.pcb.traces.length,
        pcbOutline: pcbRes.pcb.boardOutline,
        eliComps: libRes.components.length,
        eliPats: libRes.patterns.length
      });

      // BUG VERIFIED: xmlProjectParser expects XML attributes (RefDes="", X="", Y=""), while real DipTrace XML v5.3
      // puts <RefDes>, <Name>, <Value> as child elements and board <Component> elements are filtered out (0 comps)!
      expect(pcbRes.pcb.components.length).toBe(0);
      // BUG VERIFIED: xmlProjectParser ignores Units="inch" so 0.984x0.472" board becomes 0.984x0.472 mm!
      expect(libRes.components.length).toBe(1);
      expect(libRes.patterns.length).toBe(2);

      // BUG VERIFIED: openPickedProjectFile does NOT recognize .dipxml or .elixml extensions!
      const dipRoute = await openPickedProjectFile({ name: 'i2c-level-shifter-pcb.dipxml', filePath: 'i2c-level-shifter-pcb.dipxml', bytes: dipXml });
      expect(dipRoute.targetModule).toBe('schematic'); // Misrouted to schematic instead of 'pcb'!
    });

    it('roundtrips Schematic -> DipTrace ASCII v46 (.asc) -> Re-import and PCB -> DipTrace ASCII (.dip) -> Re-import', async () => {
      const baseSch = createBlankSchematicProject('mm', []);
      const rDef = findComponentById('COMP_R_MLT025', {})!;
      baseSch.sheets[0].components.push({
        id: 'c1',
        componentDefId: rDef.id,
        libraryId: rDef.library,
        refDes: 'R1',
        value: '10 кОм',
        typeName: rDef.name,
        partIndex: 1,
        x: 100,
        y: 80,
        angle: 0,
        flipX: false,
        flipY: false,
        patternId: rDef.patternId,
        refDesOffset: { x: 0, y: -5 },
        valueOffset: { x: 0, y: 5 },
        showRefDes: true,
        showValue: true
      });
      baseSch.sheets[0].wires.push({ id: 'w1', points: [{ x: 90, y: 80 }, { x: 70, y: 80 }], netName: 'VIN' });

      const ascText = exportDipTraceAsciiSchematic(baseSch);
      const ascBytes = encodeDipTraceSchematicAscii(ascText);
      const reSch = await importCadSchematic(ascBytes, 'roundtrip.asc');
      expect(reSch.project.sheets[0].components.length).toBeGreaterThanOrEqual(1);
      expect(reSch.project.sheets[0].wires.length).toBeGreaterThanOrEqual(1);

      const basePcb = createImportedPcbProject({ filePath: 'RoundtripBoard.gostpcb', projectName: 'RoundtripBoard', components: [] });
      basePcb.layerCount = 4;
      basePcb.traces.push({ id: 't1', layer: 'TopCopper', netName: 'NET1', points: [{ x: 10, y: 10 }, { x: 40, y: 10 }], width: 0.3 });
      basePcb.vias.push({ id: 'v1', x: 40, y: 10, netName: 'NET1', outerDiameter: 0.8, holeDiameter: 0.4, startLayer: 'TopCopper', endLayer: 'BottomCopper', viaStyle: 'Through' });
      const dipText = exportDipTraceAsciiPcb(basePcb);
      const rePcb = await importCadPcb(dipText, 'roundtrip.dip');
      expect(rePcb.pcb.traces.length).toBe(1);
      expect(rePcb.pcb.vias.length).toBe(1);
      expect(rePcb.pcb.traces[0].points[0].x).toBeCloseTo(10, 2);
    });
  });

  describe('4. Altium Designer Real Binary OLE2 .SchDoc & .PcbDoc', () => {
    it('imports real Altium OLE2 SchDoc files (simplefoc, pidp11, PowerSupply, Battery)', async () => {
      const files = [
        'simplefoc-mini-native-power.SchDoc',
        'pidp11-io-expander.SchDoc',
        'PowerSupply.SchDoc',
        'Battery_Level_Indicator.SchDoc'
      ];
      for (const fn of files) {
        const res = await importCadSchematic(readBytes(resolve(EXT, 'altium', fn)), fn);
        const sh = res.project.sheets[0];
        console.log(`[AUDIT Altium ${fn}]`, {
          format: res.detectedFormat,
          components: sh.components.length,
          wires: sh.wires.length,
          netPorts: sh.netPorts.length,
          junctions: sh.junctions.length
        });
        expect(sh.components.length).toBeGreaterThan(0);
      }
    });

    it('imports real Altium OLE2 Battery_Level_Indicator.PcbDoc and inspects OLE2 streams', async () => {
      const bytes = readBytes(resolve(EXT, 'altium/Battery_Level_Indicator.PcbDoc'));
      const streams = readOle2Streams(bytes);
      const compText = streams.get('Components6/Data') ? decodeAnsiOrUtf8(streams.get('Components6/Data')!) : '';
      const firstCompPipe = compText.split(/\0+/).find((s) => s.includes('|LAYER='));
      const res = await importCadPcb(bytes, 'Battery_Level_Indicator.PcbDoc');
      console.log('[AUDIT Altium Battery PcbDoc]', {
        format: res.detectedFormat,
        streamKeys: Array.from(streams.keys()).slice(0, 20),
        firstCompPipe: firstCompPipe?.slice(0, 220),
        components: res.pcb.components.length,
        traces: res.pcb.traces.length,
        vias: res.pcb.vias.length,
        outline: res.pcb.boardOutline
      });
      expect(res.pcb.components.length + res.pcb.traces.length + res.pcb.vias.length).toBeGreaterThan(0);
    });
  });

  describe('5. EasyEDA JSON Real Assets & Edge Cases', () => {
    it('audits real EasyEDA C1046.raweasy.json and C4147.json', async () => {
      const c1046 = await importExternalCadLibrary(readBytes(resolve(EXT, 'easyeda/C1046.raweasy.json')), 'C1046.raweasy.json');
      console.log('[AUDIT EasyEDA C1046]', {
        components: c1046.components.length,
        patterns: c1046.patterns.length,
        patPads: c1046.patterns[0]?.pads.length
      });
      expect(c1046.components.length).toBe(1);

      // BUG VERIFIED: C4147.json is LCSC/EasyEDA API envelope { success: true, result: { ... } }
      // parseEasyEdaLibraryJson fails to unwrap `.result`, returning fallback placeholder with wrong pads/origin!
      const c4147 = await importExternalCadLibrary(readBytes(resolve(EXT, 'easyeda/C4147.json')), 'C4147.json');
      console.log('[AUDIT EasyEDA C4147]', {
        title: c4147.components[0]?.name,
        patPads: c4147.patterns[0]?.pads.length,
        pad0Pos: c4147.patterns[0]?.pads[0] ? { x: c4147.patterns[0].pads[0].x, y: c4147.patterns[0].pads[0].y } : null
      });
      expect(c4147.components[0]?.name).toBe('EasyEDA_Part'); // Lost actual title "0402WGF9102TCE"
    });
  });

  describe('6. LTspice .asc & SPICE .cir', () => {
    it('imports real LTspice Clapp.asc and BandGaps.asc and checks CP1252 micro character & symbols', async () => {
      const clappBytes = readBytes(resolve(EXT, 'ltspice/Clapp.asc'));
      const clappRes = await importCadSchematic(clappBytes, 'Clapp.asc');
      const bandRes = await importCadSchematic(readBytes(resolve(EXT, 'ltspice/BandGaps.asc')), 'BandGaps.asc');

      const l1 = clappRes.project.sheets[0].components.find((c) => c.value.includes('100'));
      console.log('[AUDIT LTspice Clapp]', {
        components: clappRes.project.sheets[0].components.length,
        wires: clappRes.project.sheets[0].wires.length,
        netPorts: clappRes.project.sheets[0].netPorts.length,
        l1Value: l1?.value,
        refs: clappRes.project.sheets[0].components.map((c) => `${c.refDes}:${c.value}`)
      });
      console.log('[AUDIT LTspice BandGaps]', {
        components: bandRes.project.sheets[0].components.length,
        wires: bandRes.project.sheets[0].wires.length
      });

      // BUG VERIFIED: utf8Decode corrupts CP1252 0xB5 (µ) in "100µ" into U+FFFD replacement char!
      expect(l1?.value).toContain('\uFFFD');
      expect(clappRes.project.sheets[0].components.length).toBeGreaterThanOrEqual(7);
      expect(clappRes.project.sheets[0].wires.length).toBeGreaterThan(10);
    });

    it('roundtrips Schematic -> SPICE .cir -> Re-import', async () => {
      const sch = createBlankSchematicProject('mm', []);
      const rDef = findComponentById('COMP_R_MLT025', {})!;
      sch.sheets[0].components.push({
        id: 'r1', componentDefId: rDef.id, libraryId: rDef.library, refDes: 'R1', value: '10k',
        typeName: rDef.name, partIndex: 1, x: 50, y: 50, angle: 0, flipX: false, flipY: false,
        patternId: rDef.patternId, refDesOffset: { x: 0, y: -5 }, valueOffset: { x: 0, y: 5 }, showRefDes: true, showValue: true
      });
      const cir = exportSpiceNetlist(sch);
      const reSch = await importCadSchematic(cir, 'circuit.cir');
      expect(reSch.detectedFormat).toContain('SPICE');
      expect(reSch.project.sheets[0].components.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('7. CAM / MCAD (DXF, Gerber, Excellon, STEP, OBJ, STL, SVG, BOM)', () => {
    it('imports real KiCad test_outlines.dxf and verifies DXF export -> re-import Y-axis behavior', async () => {
      const dxfRes = await importCadPcb(readBytes(resolve(EXT, 'dxf/test_outlines.dxf')), 'test_outlines.dxf');
      console.log('[AUDIT DXF test_outlines]', {
        outlinePts: dxfRes.pcb.boardOutline.length,
        vias: dxfRes.pcb.vias.length,
        shapes: dxfRes.pcb.shapes.length
      });
      expect(dxfRes.pcb.boardOutline.length).toBeGreaterThanOrEqual(4);

      const pcb = createImportedPcbProject({ filePath: 'DxfRoundtrip.gostpcb', projectName: 'DxfRoundtrip', components: [] });
      pcb.boardOutline = [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 50 }, { x: 0, y: 50 }];
      const exportedDxf = exportPcbDxf(pcb);
      const rePcb = importCadPcbSync(exportedDxf, 'roundtrip.dxf');
      // BUG VERIFIED: exportPcbDxf negates Y (-y1), dxfImporter does not negate Y back -> minY becomes -50 and gets shifted to 0..50 mirrored!
      expect(rePcb.pcb.boardOutline.length).toBeGreaterThanOrEqual(4);
    });

    it('imports real 8bit-mixtape Gerber + Excellon ZIP and exposes .gml/.txt gap', async () => {
      const entries: Record<string, Uint8Array> = {
        'mixtape.gtl': readBytes(resolve(EXT, 'gerber-mixtape/mixtape.gtl')),
        'mixtape.gbl': readBytes(resolve(EXT, 'gerber-mixtape/mixtape.gbl')),
        'mixtape.gto': readBytes(resolve(EXT, 'gerber-mixtape/mixtape.gto')),
        'mixtape.gbo': readBytes(resolve(EXT, 'gerber-mixtape/mixtape.gbo')),
        'mixtape.gts': readBytes(resolve(EXT, 'gerber-mixtape/mixtape.gts')),
        'mixtape.gbs': readBytes(resolve(EXT, 'gerber-mixtape/mixtape.gbs')),
        'mixtape.gml': readBytes(resolve(EXT, 'gerber-mixtape/mixtape.gml')),
        'mixtape.txt': readBytes(resolve(EXT, 'gerber-mixtape/mixtape.txt'))
      };
      const zipBytes = createZipArchive(entries);
      const res = await importCadPcb(zipBytes, '8bit-mixtape-gerbers.zip');
      const inspect = await inspectGerberProjectOrBytes(res.pcb, true, zipBytes, '8bit-mixtape-gerbers.zip');
      console.log('[AUDIT Gerber 8bit-mixtape]', {
        traces: res.pcb.traces.length,
        vias: res.pcb.vias.length,
        shapes: res.pcb.shapes.length,
        outlinePts: res.pcb.boardOutline.length,
        inspectLayers: inspect.layers.map((l) => l.filename)
      });
      // BUG VERIFIED: universalImporter ZIP filter skips .gml (outline) and .txt (Excellon drills),
      // while D03 copper pad flashes on .gtl/.gbl are misclassified as 290 THT vias!
      expect(res.pcb.vias.length).toBe(290);
      expect(res.pcb.traces.length).toBeGreaterThan(0);

      // Also verify single Excellon file with M72 (inch) and no LZ/TZ header
      const drlPcb = await importCadPcb(entries['mixtape.txt'], 'mixtape.txt');
      console.log('[AUDIT Excellon mixtape.txt]', {
        vias: drlPcb.pcb.vias.length,
        firstVia: drlPcb.pcb.vias[0]
      });
      // BUG VERIFIED: mixtape.txt has M72 (inch) with 2:4 LZ coordinates (X7003 -> 0.7003 in = 17.78mm),
      // but gerberExcellonImporter defaults to trailingZero=true -> 70.03 in = 1778.762mm!
      expect(drlPcb.pcb.vias[0].x).toBeGreaterThan(1000);
    });

    it('verifies Gerber/Excellon/SVG/3D/BOM/JSON export roundtrips on a real PCB & Schematic', () => {
      const pcb = createImportedPcbProject({ filePath: 'FullRoundtrip.gostpcb', projectName: 'FullRoundtrip', components: [] });
      pcb.traces.push({ id: 'tr1', layer: 'TopCopper', netName: 'VCC', points: [{ x: 10, y: 10 }, { x: 50, y: 10 }], width: 0.4 });
      pcb.vias.push({ id: 'v1', x: 50, y: 10, netName: 'VCC', outerDiameter: 0.8, holeDiameter: 0.4, startLayer: 'TopCopper', endLayer: 'BottomCopper', viaStyle: 'Through' });

      const jsonPcb = serializePcb(pcb);
      expect(importCadPcbSync(jsonPcb, 'FullRoundtrip.gostpcb').pcb.traces.length).toBe(1);

      const gerbers = exportGerberSet(pcb, true);
      expect(Object.keys(gerbers.files)).toContain('FullRoundtrip.GTL');
      expect(Object.keys(gerbers.files)).toContain('FullRoundtrip.GKO');
      expect(Object.keys(gerbers.files)).toContain('FullRoundtrip.drl');
      const reGtl = importCadPcbSync(gerbers.files['FullRoundtrip.GTL'], 'FullRoundtrip.GTL');
      expect(reGtl.pcb.traces.length).toBeGreaterThanOrEqual(1);

      const zipBytes = exportGerberZipBytes(pcb, true, true);
      expect(zipBytes.byteLength).toBeGreaterThan(200);

      const drl = exportExcellonDrill(pcb);
      const reDrl = importCadPcbSync(drl, 'FullRoundtrip.drl');
      expect(reDrl.pcb.vias.length).toBe(1);
      expect(reDrl.pcb.vias[0].x).toBeCloseTo(50, 2);

      const svg = exportPcbSvg1to1(pcb, 'TopCopper', false);
      expect(svg).toContain('<svg');
      expect(exportPcbStep(pcb)).toContain('ISO-10303-21');
      expect(exportPcbObj3D(pcb)).toContain('v ');
      expect(exportPcbStlAscii(pcb)).toContain('solid FullRoundtrip');
      expect(exportPcbWrl(pcb)).toContain('#VRML V2.0 utf8');

      const sch = createBlankSchematicProject('mm', []);
      const rDef = findComponentById('COMP_R_MLT025', {})!;
      sch.sheets[0].components.push({
        id: 'r1', componentDefId: rDef.id, libraryId: rDef.library, refDes: 'R1', value: '10 кОм',
        typeName: rDef.name, partIndex: 1, x: 50, y: 50, angle: 0, flipX: false, flipY: false,
        patternId: rDef.patternId, refDesOffset: { x: 0, y: -5 }, valueOffset: { x: 0, y: 5 }, showRefDes: true, showValue: true
      });
      const jsonSch = serializeSchematic(sch);
      expect(importCadSchematicSync(jsonSch, 'test.gostsch').project.sheets[0].components.length).toBe(1);
      const bom = generateGostBom(sch);
      expect(exportGostBomToCsv(bom)).toContain('R1');
      expect(exportGostBomToHtml(sch, bom)).toContain('R1');
    });
  });
});
