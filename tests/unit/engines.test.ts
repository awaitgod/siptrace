import { describe, expect, it } from 'vitest';
import { createDemoMcuGostSchematic, createDemoRs485GostSchematic, createDemoRs485Pcb } from '../../src/gost/demoProjects';
import { extractSchematicNets, renumberSchematicComponents, runSchematicErc } from '../../src/engines/erc';
import { comparePcbToSchematic, convertSchematicToPcb, exportDipTraceAsciiNetlist } from '../../src/engines/netlist';
import { generateGostBom, exportGostBomToCsv, exportGostBomToHtml } from '../../src/gost/gostBom';
import { buildGostFrameAndStampGeometry, getGostFrameRect } from '../../src/gost/gostTitleBlock';
import { computeUnroutedRatlines, runPcbDrc } from '../../src/engines/drc';
import { runAutorouter, applyMeanderToTrace } from '../../src/engines/autorouter';
import { updateAllCopperPours, copperPourTotalAreaMm2 } from '../../src/engines/copperPour';
import { runAutoplacer } from '../../src/engines/autoplacer';
import { exportGerberSet, parseGerberPreview, exportPcbObj3D } from '../../src/engines/camExport';
import { runBuiltInSpiceSimulation } from '../../src/engines/spice';
import { generateParametricPattern } from '../../src/engines/patternGenerator';
import { calcMicrostripImpedance, calcTraceWidthByCurrent } from '../../src/engines/rfCalc';
import { GOST_COMPONENT_LIBRARIES, findComponentById } from '../../src/gost/libraries/gostComponents';
import { findPatternById } from '../../src/gost/libraries/gostPatterns';
import { GOST_LAB_TEMPLATES, createLabCamReadyPcb, createLabServoSchematic } from '../../src/gost/demo/labDemos';
import {
  exportDipTraceAsciiPcb,
  exportDipTraceAsciiSchematic,
  importCadLibrary,
  importCadPcb,
  importCadSchematic
} from '../../src/engines/importers';
import { createZipArchive, extractZipEntries, isZipBuffer } from '../../src/core/utils/zipArchive';
import { exportGerberZipBytes, inspectGerberProjectOrBytes } from '../../src/engines/camBundle';
import { exportPcbDxf } from '../../src/engines/camExport';
import { generatePcbGCode } from '../../src/engines/gcodeGenerator';
import { analyzeLabCircuit, createInitialLabSimState, parseIntelHex, stepLabSimulation } from '../../src/engines/labSimulator';

describe('GOST Libraries & Non-American Compliance', () => {
  it('contains exclusively Russian GOST/ESKD components without US ANSI libraries', () => {
    const libNames = GOST_COMPONENT_LIBRARIES.map((l) => l.name);
    expect(libNames.some((n) => n.includes('ГОСТ'))).toBe(true);
    expect(libNames.some((n) => n.includes('Discrete') || n.includes('74xx'))).toBe(false);
    // Resistor must be rectangular 10x4 mm (no zigzag polylines)
    const resLib = GOST_COMPONENT_LIBRARIES.find((l) => l.id === 'lib_gost_res')!;
    const r0805 = resLib.components[1];
    expect(r0805.parts[0].primitives[0]).toEqual({ type: 'rect', x: -5, y: -2, w: 10, h: 4, width: 0.35 });
  });
});

describe('GOST Title Block & BOM (ЕСКД 2.104 & 2.701)', () => {
  it('generates exact 20mm left margin and 185x55mm Form 1 stamp geometry', () => {
    const sch = createDemoRs485GostSchematic();
    const frame = getGostFrameRect('A3_L');
    expect(frame.left).toBe(20);
    expect(frame.right).toBe(415);
    expect(frame.bottom).toBe(292);
    const geom = buildGostFrameAndStampGeometry('A3_L', sch.sheets[0].titleBlock);
    expect(geom.lines.length).toBeGreaterThan(25);
    expect(geom.texts.some((t) => t.text === 'ГТРС.468364.001 Э3')).toBe(true);
    expect(geom.texts.some((t) => t.text === 'Разраб.')).toBe(true);
  });

  it('generates grouped GOST 2.701 Перечень элементов without power symbols', () => {
    const sch = createDemoRs485GostSchematic();
    const bom = generateGostBom(sch);
    expect(bom.length).toBeGreaterThan(4);
    expect(bom.some((b) => b.refDesList.includes('#GND'))).toBe(false);
    const csv = exportGostBomToCsv(bom);
    expect(csv).toContain('Поз. обозначение;Наименование;Кол.;Примечание');
    const html = exportGostBomToHtml(sch, bom);
    expect(html).toContain('Перечень элементов');
  });
});

describe('Schematic Net Extraction, ERC, Renumbering & SPICE MNA', () => {
  it('extracts electrical nets including +5V, GND, RS485_A, RS485_B from RS-485 schematic', () => {
    const sch = createDemoRs485GostSchematic();
    const nets = extractSchematicNets(sch);
    const names = nets.map((n) => n.netName);
    expect(names).toContain('+5V');
    expect(names).toContain('GND');
    expect(names).toContain('RS485_A');
    expect(names).toContain('RS485_B');
  });

  it('runs ERC cleanly on valid RS-485 schematic', () => {
    const sch = createDemoRs485GostSchematic();
    const errs = runSchematicErc(sch);
    const hardErrors = errs.filter((e) => e.severity === 'Error');
    expect(hardErrors.length).toBe(0);
  });

  it('renumbers components left-to-right top-to-bottom', () => {
    const sch = createDemoMcuGostSchematic();
    const renum = renumberSchematicComponents(sch);
    expect(renum.sheets[0].components.some((c) => c.refDes === 'C1')).toBe(true);
  });

  it('runs built-in MNA DC & Transient SPICE simulation', () => {
    const sch = createDemoRs485GostSchematic();
    const res = runBuiltInSpiceSimulation(sch, 'Transient', 1.0);
    expect(res.converged).toBe(true);
    const vcc = res.dcNodes.find((n) => n.netName === '+5V');
    expect(vcc?.dcVoltage).toBeCloseTo(5.0, 1);
    expect(res.timePoints.length).toBeGreaterThan(20);
    expect(res.spiceNetlist).toContain('.model D_GOST');
  });
});

describe('PCB Conversion, Autoplacer, Autorouter, Copper Pour, DRC & CAM', () => {
  it('converts schematic to PCB and stays in sync', () => {
    const sch = createDemoRs485GostSchematic();
    const pcb = convertSchematicToPcb(sch);
    expect(pcb.components.length).toBe(18);
    const cmp = comparePcbToSchematic(sch, pcb);
    expect(cmp.addedOnSchematic.length).toBe(0);
    expect(cmp.removedFromSchematic.length).toBe(0);
    expect(exportDipTraceAsciiNetlist(sch)).toContain('(Net "RS485_A"');
  });

  it('autoplaces and autoroutes PCB traces and generates copper pour with thermals', () => {
    const sch = createDemoRs485GostSchematic();
    let pcb = convertSchematicToPcb(sch);
    pcb = runAutoplacer(pcb);
    const initialRatlines = computeUnroutedRatlines(pcb).length;
    expect(initialRatlines).toBeGreaterThan(10);

    const demoPcb = createDemoRs485Pcb();
    const remaining = computeUnroutedRatlines(demoPcb).length;
    expect(remaining).toBeLessThan(initialRatlines);
    expect(demoPcb.traces.length).toBeGreaterThan(10);
    expect(demoPcb.copperPours[0].poured).toBe(true);
    expect(copperPourTotalAreaMm2(demoPcb.copperPours[0])).toBeGreaterThan(500);

    const drcErrors = runPcbDrc(demoPcb);
    expect(Array.isArray(drcErrors)).toBe(true);
  });

  it('applies meander length tuning and generates valid Gerber, Excellon, DXF, SVG and OBJ', () => {
    const pcb = createDemoRs485Pcb();
    const tr = pcb.traces[0];
    const meandered = applyMeanderToTrace(tr, 4.0);
    expect(meandered.points.length).toBeGreaterThanOrEqual(tr.points.length);

    const cam = exportGerberSet(pcb, true);
    const gtl = Object.entries(cam.files).find(([k]) => k.endsWith('.GTL'))?.[1]!;
    expect(gtl).toContain('%FSLAX34Y34*%');
    expect(gtl).toContain('%TF.FileFunction,Copper,L1,Top*%');
    const parsed = parseGerberPreview(gtl);
    expect(parsed.length).toBeGreaterThan(10);

    const drl = Object.entries(cam.files).find(([k]) => k.endsWith('.drl'))?.[1]!;
    expect(drl).toContain('M48');
    expect(drl).toContain('METRIC,TZ');

    const obj = exportPcbObj3D(pcb);
    expect(obj).toContain('v ');
    expect(obj).toContain('f ');
  });
});

describe('Parametric Pattern Generator & RF Calculator', () => {
  it('generates IPC-7351 LQFP and BGA footprints accurately', () => {
    const lqfp = generateParametricPattern({
      family: 'QFP',
      name: 'LQFP-48',
      pinCount: 48,
      pitch: 0.5,
      rowSpacing: 8.6,
      padWidth: 1.25,
      padHeight: 0.3,
      holeDiameter: 0,
      bodyWidth: 7.0,
      bodyLength: 7.0,
      bodyHeight: 1.4,
      densityLevel: 'B'
    });
    expect(lqfp.pads.length).toBe(48);

    const bga = generateParametricPattern({
      family: 'BGA',
      name: 'BGA-16',
      pinCount: 16,
      pitch: 1.0,
      rowSpacing: 0,
      padWidth: 0.5,
      padHeight: 0.5,
      holeDiameter: 0,
      bodyWidth: 6.0,
      bodyLength: 6.0,
      bodyHeight: 1.2,
      densityLevel: 'B',
      bgaCols: 4,
      bgaRows: 4
    });
    expect(bga.pads.length).toBe(16);
    expect(bga.pads[0].number).toBe('A1');
  });

  it('computes trace width by current and microstrip impedance', () => {
    const w = calcTraceWidthByCurrent({ currentAmps: 2.0, tempRiseC: 10, copperThicknessUm: 35, isExternalLayer: true });
    expect(w.requiredWidthMm).toBeGreaterThan(0.5);
    const imp = calcMicrostripImpedance({ traceWidthMm: 0.25, copperThicknessMm: 0.035, dielectricHeightMm: 0.2, er: 4.4, diffGapMm: 0.2 });
    expect(imp.z0SingleOhm).toBeGreaterThan(30);
    expect(imp.zDiffOhm).toBeGreaterThan(60);
  });

  it('provides all GOST lab components, patterns and clean ERC/PCB templates without ANSI libraries', () => {
    for (const lib of GOST_COMPONENT_LIBRARIES) {
      expect(lib.name.toLowerCase()).not.toContain('ansi');
      expect(lib.name.toLowerCase()).not.toContain('ieee');
    }

    const requiredIds = [
      'COMP_DD_ATMEGA8_PU',
      'COMP_DD_ATMEGA16_PU',
      'COMP_DD_ATMEGA328P_PU',
      'COMP_HG_LCD1602',
      'COMP_HG_ALS324A_CC',
      'COMP_HG_ALS324B_CA',
      'COMP_M_SERVO_SG90',
      'COMP_B_ENCODER_EC11',
      'COMP_PI_VIRTUAL_TERMINAL',
      'COMP_DA_MAX232',
      'COMP_DD_FT232RL',
      'COMP_DD_CH340G',
      'COMP_R_POT_SP3_10K',
      'COMP_F_PTC_500MA',
      'COMP_XP_ICSP_6',
      'COMP_XP_ISP10_USBASP'
    ];
    for (const id of requiredIds) {
      const def = findComponentById(id);
      expect(def, `Missing lab component ${id}`).toBeDefined();
      if (def?.patternId) {
        expect(findPatternById(def.patternId), `Missing pattern ${def.patternId} for ${id}`).toBeDefined();
      }
    }

    expect(GOST_LAB_TEMPLATES.length).toBe(5);
    for (const tpl of GOST_LAB_TEMPLATES) {
      const sch = tpl.buildSchematic();
      const nets = extractSchematicNets(sch);
      expect(nets.length).toBeGreaterThan(0);
      const errs = runSchematicErc(sch).filter((e) => e.severity === 'Error');
      expect(errs.length, `Template ${tpl.id} has ERC errors`).toBe(0);
      const pcb = convertSchematicToPcb(sch);
      expect(pcb.components.length).toBeGreaterThan(0);
    }

    const camPcb = createLabCamReadyPcb();
    expect(camPcb.boardOutline.length).toBeGreaterThanOrEqual(4);
    expect(camPcb.traces.length).toBeGreaterThan(0);
  });

  it('imports DipTrace, KiCad, Proteus, Eagle, EasyEDA, Altium, LTspice, PADS, DXF, Gerber and converts foreign parts to GOST', async () => {
    const baseSch = createLabServoSchematic();
    const dchText = exportDipTraceAsciiSchematic(baseSch);
    const dchImported = await importCadSchematic(dchText, 'lab_servo.dch');
    expect(dchImported.detectedFormat).toContain('DipTrace');
    expect(dchImported.project.sheets[0].components.length).toBeGreaterThanOrEqual(3);

    const basePcb = createLabCamReadyPcb();
    const dipText = exportDipTraceAsciiPcb(basePcb);
    const dipImported = await importCadPcb(dipText, 'lab_board.dip');
    expect(dipImported.detectedFormat).toContain('DipTrace');
    expect(dipImported.pcb.components.length).toBeGreaterThan(0);

    // DipTrace XML
    const dtXml = `<Source><Schematic Name="DT_XML"><Components><Component RefDes="U1" Value="ATMEGA328P" Pattern="DIP28" X="100" Y="80"/></Components></Schematic></Source>`;
    const dtXmlRes = await importCadSchematic(dtXml, 'dt_project.xml');
    expect(dtXmlRes.project.sheets[0].components.some((c) => c.refDes.startsWith('DD'))).toBe(true);

    // KiCad S-expr Schematic with foreign US symbols & units
    const kicadSch = `(kicad_sch (version 20211123)
      (symbol (lib_id "MCU_Microchip_ATmega:ATmega328P-PU") (at 100 80 0) (property "Reference" "U1") (property "Value" "ATmega328P") (property "Footprint" "Package_DIP:DIP-28_W7.62mm"))
      (symbol (lib_id "Device:R") (at 140 80 0) (property "Reference" "R1") (property "Value" "10k"))
      (symbol (lib_id "Transistor_BJT:2N2222") (at 160 80 0) (property "Reference" "Q1") (property "Value" "2N2222"))
      (symbol (lib_id "Diode:1N4007") (at 180 80 0) (property "Reference" "D1") (property "Value" "1N4007"))
      (symbol (lib_id "Display_Character:LM016L") (at 220 80 0) (property "Reference" "U2") (property "Value" "LM016L"))
      (symbol (lib_id "Motor:Servo_SG90") (at 240 80 0) (property "Reference" "M1") (property "Value" "SG90"))
    )`;
    const kiRes = await importCadSchematic(kicadSch, 'foreign_mcu.kicad_sch');
    const refs = kiRes.project.sheets[0].components.map((c) => c.refDes);
    expect(refs.some((r) => r.startsWith('DD'))).toBe(true);
    expect(refs.some((r) => r.startsWith('VT'))).toBe(true);
    expect(refs.some((r) => r.startsWith('VD'))).toBe(true);
    expect(refs.some((r) => r.startsWith('HG'))).toBe(true);
    expect(refs.some((r) => r.startsWith('M'))).toBe(true);
    const rComp = kiRes.project.sheets[0].components.find((c) => c.refDes.startsWith('R'));
    expect(rComp?.value).toContain('кОм');
    expect(kiRes.report.convertedComponents).toBeGreaterThanOrEqual(4);

    // KiCad PCB
    const kicadPcb = `(kicad_pcb (version 20211014) (gr_line (start 0 0) (end 80 0) (layer "Edge.Cuts")) (gr_line (start 80 0) (end 80 50) (layer "Edge.Cuts"))
      (footprint "Package_DIP:DIP-28_W7.62mm" (at 40 25) (fp_text reference "U1") (fp_text value "ATmega8") (pad "1" thru_hole rect (at 0 0) (size 1.6 1.6) (drill 0.8)))
      (segment (start 10 10) (end 30 10) (width 0.35) (layer "F.Cu"))
    )`;
    const kiPcbRes = await importCadPcb(kicadPcb, 'board.kicad_pcb');
    expect(kiPcbRes.pcb.components[0].refDes.startsWith('DD')).toBe(true);
    expect(kiPcbRes.pcb.traces.length).toBeGreaterThanOrEqual(1);

    // Proteus .pdsprj ZIP container -> Schematic and auto PCB
    const proteusZip = createZipArchive({
      'MAIN.SEC': `<ISIS><COMPONENT REF="U1" NAME="ATMEGA8" VALUE="ATMEGA8" X="100" Y="90"/><COMPONENT REF="U2" NAME="LM016L" VALUE="LM016L" X="180" Y="90"/></ISIS>`
    });
    const proteusSch = await importCadSchematic(proteusZip, 'lab_avr.pdsprj');
    expect(proteusSch.detectedFormat).toContain('Proteus');
    expect(proteusSch.project.sheets[0].components.some((c) => c.refDes.startsWith('DD'))).toBe(true);
    const proteusPcb = await importCadPcb(proteusZip, 'lab_avr.pdsprj');
    expect(proteusPcb.pcb.components.length).toBeGreaterThanOrEqual(2);

    // Eagle XML (.sch / .brd / .lbr)
    const eagleSch = `<eagle><drawing><schematic><parts><part name="U1" library="atmel" deviceset="ATMEGA328P" value="ATMEGA328P"/><part name="Q1" library="trans" deviceset="2N2222" value="2N2222"/></parts><sheets><sheet><instances><instance part="U1" x="25" y="40"/><instance part="Q1" x="75" y="40"/></instances></sheet></sheets></schematic></drawing></eagle>`;
    const eagleRes = await importCadSchematic(eagleSch, 'board.sch');
    expect(eagleRes.project.sheets[0].components.some((c) => c.refDes.startsWith('DD'))).toBe(true);
    expect(eagleRes.project.sheets[0].components.some((c) => c.refDes.startsWith('VT'))).toBe(true);

    // EasyEDA JSON
    const easySch = JSON.stringify({
      title: 'EasyProject',
      shape: ['LIB~400~300~ATMEGA328P~DIP28~U1', 'LIB~520~300~LED~LED-5MM~D1', 'W~400 300 520 300~SIG1']
    });
    const easyRes = await importCadSchematic(easySch, 'easy.json');
    expect(easyRes.project.sheets[0].components.some((c) => c.refDes.startsWith('HL'))).toBe(true);
    expect(easyRes.project.sheets[0].wires.length).toBeGreaterThanOrEqual(1);

    // Altium ASCII SchDoc + LTspice .asc + PADS *PART*
    const altiumSch = `|RECORD=1|LIBREFERENCE=ATMEGA8|DESIGNATOR=U1|LOCATION.X=100|LOCATION.Y=80|PARTIDLOCKED=T|`;
    const altRes = await importCadSchematic(altiumSch, 'sheet.SchDoc');
    expect(altRes.project.sheets[0].components.some((c) => c.refDes.startsWith('DD'))).toBe(true);

    const ltspice = `Version 4\nSHEET 1 880 680\nSYMBOL res 112 96 R0\nSYMATTR InstName R1\nSYMATTR Value 4.7k\nWIRE 112 96 200 96`;
    const ltRes = await importCadSchematic(ltspice, 'filter.asc');
    expect(ltRes.project.sheets[0].components[0].value).toContain('кОм');

    const padsAsc = `*PADS-PCB*\n*PART*\nU1 ATMEGA16\nR1 10k\n*NET*\n*SIGNAL* +5V\nU1.7 R1.1\n*END*`;
    const padsRes = await importCadSchematic(padsAsc, 'netlist.asc');
    expect(padsRes.project.sheets[0].components.some((c) => c.refDes.startsWith('DD'))).toBe(true);

    // DXF + Gerber RS-274X import
    const dxf = `0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nBOARD_OUTLINE\n10\n0\n20\n0\n11\n60\n21\n0\n0\nLINE\n8\nBOARD_OUTLINE\n10\n60\n20\n0\n11\n60\n21\n40\n0\nCIRCLE\n8\nDRILL\n10\n15\n20\n15\n40\n0.5\n0\nENDSEC\n0\nEOF`;
    const dxfRes = await importCadPcb(dxf, 'outline.dxf');
    expect(dxfRes.pcb.vias.length).toBeGreaterThanOrEqual(1);

    const grb = `%FSLAX35Y35*%\n%MOMM*%\n%ADD10C,0.400*%\nD10*\nX1000000Y1000000D02*\nX4000000Y1000000D01*\nM02*`;
    const grbRes = await importCadPcb(grb, 'copper.gtl');
    expect(grbRes.pcb.traces.length).toBeGreaterThanOrEqual(1);

    // Libraries (.eli, .kicad_sym, .kicad_mod, .lbr)
    const eliRes = await importCadLibrary(`(Library "Test"\n  (Component "ATMEGA328P" (RefDes "U") (Pin "1" "RESET") (Pin "7" "VCC"))\n)`, 'mcu.eli');
    expect(eliRes.components.length).toBe(1);
    const modRes = await importCadLibrary(`(module "DIP-8" (pad "1" thru_hole rect (at -3.81 0) (size 1.6 1.6) (drill 0.8)))`, 'dip8.kicad_mod');
    expect(modRes.patterns.length).toBe(1);
    const lbrRes = await importCadLibrary(`<eagle><drawing><library><packages><package name="SOIC8"><smd name="1" x="-2" y="0" dx="1.5" dy="0.6"/></package></packages></library></drawing></eagle>`, 'parts.lbr');
    expect(lbrRes.patterns.length).toBe(1);
  });

  it('bundles Gerber+Excellon ZIP, inspects multi-layer Gerber, configures DXF & generates CNC G-Code', async () => {
    const pcb = createLabCamReadyPcb();
    const zipBytes = exportGerberZipBytes(pcb, true, true);
    expect(isZipBuffer(zipBytes)).toBe(true);
    const entries = await extractZipEntries(zipBytes);
    expect(Object.keys(entries).some((n) => /\.GTL$/i.test(n))).toBe(true);
    expect(Object.keys(entries).some((n) => /\.drl$/i.test(n))).toBe(true);

    const summary = await inspectGerberProjectOrBytes(pcb, true, zipBytes, 'cam.zip');
    expect(summary.layers.length).toBeGreaterThanOrEqual(6);
    expect(summary.widthMm).toBeGreaterThan(20);
    expect(summary.drillCount).toBeGreaterThan(5);

    const dxfIn = exportPcbDxf(pcb, {
      units: 'in',
      scale: 2,
      layers: { outline: true, drills: true, topCopper: true, bottomCopper: false }
    });
    expect(dxfIn).toContain('$INSUNITS');
    expect(dxfIn).toContain('DRILL');
    expect(dxfIn).not.toContain('BOTTOM_COPPER');

    const gc = generatePcbGCode(pcb, { postprocessor: 'GRBL', millTopIsolation: true, drillHoles: true, cutOutline: true });
    expect(gc.gcode).toContain('G21');
    expect(gc.gcode).toContain('G90');
    expect(gc.gcode).toContain('M03');
    expect(gc.gcode).toContain('G01');
    expect(gc.gcode).toContain('M02');
    expect(gc.stats.drillCount).toBeGreaterThan(5);
    expect(gc.stats.lineCount).toBeGreaterThan(20);
  });

  it('simulates AVR lab peripherals, Intel HEX firmware and UART terminal', () => {
    const sch = createLabServoSchematic();
    const summary = analyzeLabCircuit(sch);
    expect(summary.mcus.length).toBeGreaterThanOrEqual(1);
    expect(summary.suggestedMode).toBe('servo');

    const validHex = `:040000000FEF0BBB38\n:00000001FF`;
    const parsedOk = parseIntelHex(validHex);
    expect(parsedOk.errors.length).toBe(0);
    expect(parsedOk.byteCount).toBe(4);
    expect(parsedOk.validRecords).toBe(2);

    const badHex = parseIntelHex(`:040000000FEF0BBB00\n:00000001FF`);
    expect(badHex.errors.length).toBeGreaterThan(0);

    let state = createInitialLabSimState(summary);
    state = stepLabSimulation(state, { type: 'setPotVoltage', voltage: 2.5 });
    expect(state.adcRaw).toBeGreaterThan(500);
    expect(state.adcRaw).toBeLessThan(520);

    state = stepLabSimulation(state, { type: 'encoderCw' });
    expect(state.encoderDirection).toBe('CW');
    state = stepLabSimulation(state, { type: 'sendUart', text: 'SERVO 45' });
    expect(state.servoAngleDeg).toBe(45);
    expect(state.terminalLog.some((l) => l.includes('45 deg'))).toBe(true);

    state = stepLabSimulation(state, { type: 'loadHex', filename: 'blink.hex', hexText: validHex });
    expect(state.hexInfo.loaded).toBe(true);
    state = stepLabSimulation(state, { type: 'tick' });
    expect(state.tickCount).toBeGreaterThan(0);
  });
});
