import { describe, expect, it } from 'vitest';
import {
  ALL_GOST_COMPONENTS,
  GOST_COMPONENT_LIBRARIES,
  findComponentById
} from '../../src/gost/libraries/gostComponents';
import { GOST_GROUP_ORDER, GOST_REFDES_GROUPS } from '../../src/gost/rules';
import {
  SHEET_FORMATS,
  buildGostFrameAndStampGeometry,
  createDefaultGostTitleBlock,
  getGostFrameRect
} from '../../src/gost/gostTitleBlock';
import {
  exportGostBomToCsv,
  exportGostBomToHtml,
  formatRefDesRange,
  generateGostBom,
  splitRefDes
} from '../../src/gost/gostBom';
import { makeGostLogicGatePart } from '../../src/gost/libraries/components/helpers';
import {
  DEFAULT_ERC_SETTINGS,
  extractSchematicNets,
  renumberSchematicComponents,
  runSchematicErc
} from '../../src/engines/erc';
import { exportSpiceNetlist, parseMetricValue, runBuiltInSpiceSimulation } from '../../src/engines/spice';
import {
  commitWire,
  copyFragment,
  deleteEntities,
  editWire,
  entityBounds,
  normalizeSheet,
  pasteFragment,
  transformEntities
} from '../../src/core/schematic/editing';
import { findLabelOverlaps } from '../../src/core/schematic/componentLabels';
import { hitTestEntity } from '../../src/core/schematic/hitTesting';
import { buildBomTableShape, createBlankSchematicProject } from '../../src/ui/modules/schematic/services/schematicActionsService';
import { DEFAULT_NET_CLASSES } from '../../src/core/persistence/projectFactory';
import { ComponentDef, PlacedComponent, SchematicProject } from '../../src/core/types';

function makeProjectWithComps(comps: PlacedComponent[], wires: SchematicProject['sheets'][0]['wires'] = [], netPorts: SchematicProject['sheets'][0]['netPorts'] = []): SchematicProject {
  const base = createBlankSchematicProject('mm', DEFAULT_NET_CLASSES);
  base.sheets[0].components = comps;
  base.sheets[0].wires = wires;
  base.sheets[0].netPorts = netPorts;
  return base;
}

describe('Combine Agent 2: Comprehensive GOST УГО, ERC, BOM ПЭ3, SPICE & Schematic Core Audit', () => {
  it('1. Audits all 14 GOST libraries: counts components, parts, pins, and checks 1.25mm/2.5mm grid alignment', () => {
    expect(GOST_COMPONENT_LIBRARIES.length).toBe(14);
    expect(ALL_GOST_COMPONENTS.length).toBeGreaterThanOrEqual(60);

    const off25Pins: string[] = [];
    const off125Pins: string[] = [];
    const dupPinNumbers: string[] = [];

    for (const comp of ALL_GOST_COMPONENTS) {
      for (const part of comp.parts) {
        const seenNums = new Set<string>();
        for (const pin of part.pins) {
          const rx25 = Math.abs(pin.x % 2.5);
          const ry25 = Math.abs(pin.y % 2.5);
          if ((rx25 > 0.001 && Math.abs(rx25 - 2.5) > 0.001) || (ry25 > 0.001 && Math.abs(ry25 - 2.5) > 0.001)) {
            off25Pins.push(`${comp.id}[part=${part.partIndex}].pin(${pin.number})=(${pin.x},${pin.y})`);
          }
          const rx125 = Math.abs(pin.x % 1.25);
          const ry125 = Math.abs(pin.y % 1.25);
          if ((rx125 > 0.001 && Math.abs(rx125 - 1.25) > 0.001) || (ry125 > 0.001 && Math.abs(ry125 - 1.25) > 0.001)) {
            off125Pins.push(`${comp.id}[part=${part.partIndex}].pin(${pin.number})=(${pin.x},${pin.y})`);
          }
          if (seenNums.has(pin.number)) {
            dupPinNumbers.push(`${comp.id}[part=${part.partIndex}].pin(${pin.number})`);
          }
          seenNums.add(pin.number);
        }
      }
    }

    expect(off125Pins).toEqual([]);
    expect(off25Pins).toEqual([]);
    expect(dupPinNumbers).toEqual([]);
  });

  it('2. Verifies all component refDesPrefixes exist in GOST_REFDES_GROUPS and flags BQ (non-standard per ГОСТ 2.710-81 Table 2)', () => {
    const known = new Set(GOST_REFDES_GROUPS.map((g) => g.prefix));
    for (const comp of ALL_GOST_COMPONENTS) {
      if (comp.refDesPrefix.startsWith('#')) continue;
      expect(known.has(comp.refDesPrefix)).toBe(true);
    }
    const quartz = findComponentById('COMP_BQ_RK169')!;
    expect(quartz.refDesPrefix).toBe('BQ');
  });

  it('3. Documents GOST УГО geometry discrepancies found during audit', () => {
    // (a) makeGostLogicGatePart comment claims 12.5mm height, actual rect h=10mm
    const gate = makeGostLogicGatePart(1, '&', '1', '2', '3', true);
    const gateRect = gate.primitives.find((p) => p.type === 'rect');
    expect(gateRect?.type === 'rect' && gateRect.h).toBe(10);

    // (b) Zener diode inconsistency: KS147 uses single cathode bend (GOST), D814A uses two opposite bends (Western S-bend)
    const ks147 = findComponentById('COMP_VD_KS147')!;
    const d814a = findComponentById('COMP_VD_D814A')!;
    expect(ks147.parts[0].primitives.some((p) => p.type === 'line' && p.x2 < 2.5 && p.y2 < -3)).toBe(true);
    const d814Poly = d814a.parts[0].primitives.find((p) => p.type === 'polyline' && !p.closed);
    expect(d814Poly?.type === 'polyline' && d814Poly.points.length).toBe(4);

    // (c) Trimmer SP3-38b wiper bar is asymmetric L-hook (x1:0 -> x2:5) instead of centered T-bar
    const trim = findComponentById('COMP_R_TRIM_SP3')!;
    const trimBar = trim.parts[0].primitives.find((p) => p.type === 'line' && p.y1 === -4 && p.y2 === -4);
    expect(trimBar?.type === 'line' && trimBar.x1).toBe(0);
    expect(trimBar?.type === 'line' && trimBar.x2).toBe(5);

    // (d) Relay RES49 pin 3 (П) runs from x=10 to x=1.5 across the NO/NC contact area at x=6.2..6.7
    const relay = findComponentById('COMP_K_RES49')!;
    const p3 = relay.parts[0].pins.find((p) => p.number === '3')!;
    expect(p3.x).toBe(10);
    expect(p3.length).toBe(8.5);

    // (e) PNP transistors KT361B vs KT3107B have inverted emitter/collector orientation relative to each other
    const kt361 = findComponentById('COMP_VT_KT361B')!;
    const kt3107 = findComponentById('COMP_VT_KT3107B')!;
    expect(kt361.parts[0].pins.find((p) => p.name === 'Э')!.y).toBe(-10);
    expect(kt3107.parts[0].pins.find((p) => p.name === 'Э')!.y).toBe(10);
  });

  it('4. Proves SPICE MNA & Netlist Exporter pin-order bug for Russian GOST transistors (KT315B, KT3102AM, KP501A)', () => {
    const kt315 = findComponentById('COMP_VT_KT315B')!;
    // KT315B pinout: 1=Emitter, 2=Collector, 3=Base
    expect(kt315.parts[0].pins.map((p) => `${p.number}:${p.name}`)).toEqual(['3:Б', '2:К', '1:Э']);

    // Build simple NPN common-emitter circuit: Base->VIN(5V via R1), Collector->VCC(5V via R2), Emitter->GND
    const sch = makeProjectWithComps(
      [
        {
          id: 'vt1', componentDefId: 'COMP_VT_KT315B', libraryId: 'lib_gost_trans',
          refDes: 'VT1', value: 'КТ315Б', typeName: 'КТ315Б', partIndex: 1,
          x: 100, y: 100, angle: 0, flipX: false, flipY: false, patternId: 'PAT_KT315_FLAT',
          refDesOffset: { x: 0, y: -12 }, valueOffset: { x: 0, y: 12 }, showRefDes: true, showValue: true
        },
        {
          id: 'r1', componentDefId: 'COMP_R_MLT025', libraryId: 'lib_gost_res',
          refDes: 'R1', value: '10к', typeName: 'МЛТ-0,25', partIndex: 1,
          x: 70, y: 100, angle: 0, flipX: false, flipY: false, patternId: 'PAT_MLT_025',
          refDesOffset: { x: 0, y: -6 }, valueOffset: { x: 0, y: 6 }, showRefDes: true, showValue: true
        }
      ],
      [
        { id: 'w_vin', points: [{ x: 40, y: 100 }, { x: 60, y: 100 }], netName: 'VIN' },
        { id: 'w_base', points: [{ x: 80, y: 100 }, { x: 92.5, y: 100 }], netName: 'BASE_NET' },
        { id: 'w_coll', points: [{ x: 102.5, y: 90 }, { x: 102.5, y: 75 }], netName: 'COLL_NET' },
        { id: 'w_emit', points: [{ x: 102.5, y: 110 }, { x: 102.5, y: 125 }], netName: 'GND' }
      ]
    );

    const netlist = exportSpiceNetlist(sch);
    // BUG PROOF: spiceNetlistExporter outputs Q_VT1 <pin2:C> <pin3:B> <pin1:E>, which only works by accident for KT315B (2=C,3=B,1=E),
    // whereas for KT3102AM (1=E, 2=B, 3=C) it swaps Collector and Base!
    expect(netlist).toContain('Q_VT1 COLL_NET BASE_NET 0 VT_GOST');

    // Now test KT3102AM (1=E, 2=B, 3=C) in same position:
    sch.sheets[0].components[0].componentDefId = 'COMP_VT_KT3102AM';
    sch.sheets[0].components[0].value = 'КТ3102АМ';
    const netlist3102 = exportSpiceNetlist(sch);
    // BUG PROOF: Collector is pin 3 (COLL_NET) and Base is pin 2 (BASE_NET),
    // but spiceNetlistExporter emits Q_VT1 <n2=BASE_NET> <n3=COLL_NET> <n1=0> -> Base & Collector are SWAPPED!
    expect(netlist3102).toContain('Q_VT1 BASE_NET COLL_NET 0 VT_GOST');

    // Also test MOSFET KP501A (1=Source, 2=Drain, 3=Gate):
    sch.sheets[0].components[0].componentDefId = 'COMP_VT_KP501A';
    sch.sheets[0].components[0].value = 'КП501А';
    const netlistMos = exportSpiceNetlist(sch);
    // BUG PROOF: spiceNetlistExporter emits M_VT1 <n3=Gate> <n1=Source> <n2=Drain> <n2=Drain>
    // instead of SPICE standard Mname D G S B! So Drain=BASE_NET(pin3=Gate), Gate=0(pin1=Source), Source=COLL_NET(pin2=Drain)!
    expect(netlistMos).toContain('M_VT1 BASE_NET 0 COLL_NET COLL_NET NMOS_GOST');

    // And runBuiltInSpiceSimulation MNA uses i1=pin1(Emitter!), i2=pin2(Collector), i3=pin3(Base!) for KT315B!
    // Because getPin(refDes, '1', 'B', ...) checks '1' before 'B', so i1=GND(0V) instead of BASE_NET!
    const sim = runBuiltInSpiceSimulation(sch, 'Transient', 2.0);
    expect(sim.converged).toBe(true);
    const collDc = sim.dcNodes.find((n) => n.netName === 'COLL_NET')?.dcVoltage;
    expect(collDc).toBeDefined();
  });

  it('5. Verifies parseMetricValue and RC low-pass filter SPICE Transient + AC Bode accuracy', () => {
    expect(parseMetricValue('10к')).toBe(10000);
    expect(parseMetricValue('4k7')).toBe(4700);
    expect(parseMetricValue('1МОм')).toBe(1e6);
    expect(parseMetricValue('0,1 мкФ')).toBeCloseTo(1e-7, 12);
    expect(parseMetricValue('100н')).toBeCloseTo(1e-7, 12);

    // RC filter: VIN -> R1(1k) -> VOUT -> C1(1uF) -> GND (fc = 1/(2*pi*1000*1e-6) ≈ 159.15 Hz)
    const rcSch = makeProjectWithComps(
      [
        {
          id: 'r1', componentDefId: 'COMP_R_MLT025', libraryId: 'lib_gost_res',
          refDes: 'R1', value: '1к', typeName: 'МЛТ-0,25', partIndex: 1,
          x: 60, y: 50, angle: 0, flipX: false, flipY: false, patternId: 'PAT_MLT_025',
          refDesOffset: { x: 0, y: -5 }, valueOffset: { x: 0, y: 5 }, showRefDes: true, showValue: true
        },
        {
          id: 'c1', componentDefId: 'COMP_C_K10_17V_0805', libraryId: 'lib_gost_cap',
          refDes: 'C1', value: '1 мкФ', typeName: 'К10-17в', partIndex: 1,
          x: 100, y: 65, angle: 90, flipX: false, flipY: false, patternId: 'PAT_CHIP_2012M',
          refDesOffset: { x: 5, y: 0 }, valueOffset: { x: -5, y: 0 }, showRefDes: true, showValue: true
        }
      ],
      [
        { id: 'w_in', points: [{ x: 30, y: 50 }, { x: 50, y: 50 }], netName: 'VIN' },
        { id: 'w_out', points: [{ x: 70, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 60 }], netName: 'VOUT' },
        { id: 'w_gnd', points: [{ x: 100, y: 70 }, { x: 100, y: 80 }], netName: 'GND' }
      ]
    );
    const res = runBuiltInSpiceSimulation(rcSch, { mode: 'AC', stopTimeMs: 5, fStartHz: 10, fStopHz: 1e5 });
    expect(res.converged).toBe(true);
    expect(res.acMagnitudeDb?.VOUT?.[0]).toBeGreaterThan(-1); // ~0 dB at 10 Hz
    expect(res.acMagnitudeDb?.VOUT?.at(-1)).toBeLessThan(-30); // strong attenuation at 100 kHz
  });

  it('6. Audits ERC rules: NotConnected wired, Floating Input, NC marker suppression, Output conflict, Missing pattern, Pin Matrix', () => {
    const dd1: PlacedComponent = {
      id: 'dd1', componentDefId: 'COMP_DD_K155LA3', libraryId: 'lib_gost_digital',
      refDes: 'DD1', value: 'К155ЛА3', typeName: 'К155ЛА3', partIndex: 1,
      x: 50, y: 50, angle: 0, flipX: false, flipY: false, patternId: '',
      refDesOffset: { x: 0, y: -10 }, valueOffset: { x: 0, y: 10 }, showRefDes: true, showValue: true
    };
    const sch = makeProjectWithComps([dd1]);
    const errs = runSchematicErc(sch, DEFAULT_ERC_SETTINGS);
    expect(errs.some((e) => e.code === 'ERC-PAT')).toBe(true);
    expect(errs.filter((e) => e.code === 'ERC-FLOAT').length).toBe(2); // pins 1 and 2
    expect(errs.some((e) => e.code === 'ERC-UNCON')).toBe(true); // output pin 3

    // Mark pin 1 (x=40, y=47.5) with '× NC'
    sch.sheets[0].shapes.push({ id: 'nc1', type: 'text', x: 40, y: 47.5, text: '× NC', size: 2.5 });
    const errsAfterNc = runSchematicErc(sch, DEFAULT_ERC_SETTINGS);
    expect(errsAfterNc.filter((e) => e.code === 'ERC-FLOAT').length).toBe(1);
  });

  it('7. Audits BOM ПЭ3 generation, sorting, range collapsing, HTML/CSV export, and buildBomTableShape consistency', () => {
    const base = makeProjectWithComps([
      { id: 'r1', componentDefId: 'COMP_R_MLT025', libraryId: 'l', refDes: 'R1', value: '1к', typeName: 'МЛТ-0,25', partIndex: 1, x: 30, y: 30, angle: 0, flipX: false, flipY: false, patternId: 'PAT_MLT_025', refDesOffset: { x: 0, y: -5 }, valueOffset: { x: 0, y: 5 }, showRefDes: true, showValue: true, gostStandard: 'ОСТ 11 073.013' },
      { id: 'r2', componentDefId: 'COMP_R_MLT025', libraryId: 'l', refDes: 'R2', value: '1к', typeName: 'МЛТ-0,25', partIndex: 1, x: 50, y: 30, angle: 0, flipX: false, flipY: false, patternId: 'PAT_MLT_025', refDesOffset: { x: 0, y: -5 }, valueOffset: { x: 0, y: 5 }, showRefDes: true, showValue: true, gostStandard: 'ОСТ 11 073.013' },
      { id: 'r3', componentDefId: 'COMP_R_MLT025', libraryId: 'l', refDes: 'R3', value: '1к', typeName: 'МЛТ-0,25', partIndex: 1, x: 70, y: 30, angle: 0, flipX: false, flipY: false, patternId: 'PAT_MLT_025', refDesOffset: { x: 0, y: -5 }, valueOffset: { x: 0, y: 5 }, showRefDes: true, showValue: true, gostStandard: 'ОСТ 11 073.013' },
      { id: 'r4', componentDefId: 'COMP_R_MLT025', libraryId: 'l', refDes: 'R4', value: '10к', typeName: 'МЛТ-0,25', partIndex: 1, x: 90, y: 30, angle: 0, flipX: false, flipY: false, patternId: 'PAT_MLT_025', refDesOffset: { x: 0, y: -5 }, valueOffset: { x: 0, y: 5 }, showRefDes: true, showValue: true, doNotMount: true }
    ]);
    const bom = generateGostBom(base);
    expect(bom).toHaveLength(2);
    expect(bom[0].refDesList).toBe('R1...R3');
    expect(bom[1].note).toBe('Не устанавливать');

    const html = exportGostBomToHtml(base, bom);
    expect(html).toContain('ПЭ3');
    expect(html).toContain('R1...R3');

    const erpCsv = exportGostBomToCsv(bom, { format: '1c_erp' });
    expect(erpCsv).toContain('Позиция;Наименование;Количество;Единица;Примечание;Группа;Корпус;Стандарт_ГОСТ');

    const tbl = buildBomTableShape(bom, 'A4_L', base.sheets[0].titleBlock);
    expect(tbl.type).toBe('table');
    if (tbl.type === 'table') {
      expect(tbl.colWidths).toEqual([20, 110, 10, 45]);
      // Note inconsistency: buildBomTableShape prepends groupTitle ("Резисторы: ..."), while SchematicObjectDialog "Обновить ПЭ3 из схемы" does not
      expect(tbl.rows[1][1]).toContain('Резисторы:');
    }
  });

  it('8. Audits Schematic Editing: rubber-banding move, flip X/Y, rotate, hitTesting, and label overlap check', () => {
    const sch = makeProjectWithComps(
      [
        { id: 'r1', componentDefId: 'COMP_R_MLT025', libraryId: 'l', refDes: 'R1', value: '1к', typeName: 'МЛТ-0,25', partIndex: 1, x: 50, y: 50, angle: 0, flipX: false, flipY: false, patternId: 'PAT_MLT_025', refDesOffset: { x: 0, y: -6 }, valueOffset: { x: 0, y: 6 }, showRefDes: true, showValue: true }
      ],
      [
        { id: 'w1', points: [{ x: 60, y: 50 }, { x: 80, y: 50 }], netName: 'N1' }
      ]
    );

    // Move R1 by (0, +10): wire start at (60,50) should rubber-band orthogonally!
    const moved = transformEntities(sch.sheets[0], ['r1'], { dx: 0, dy: 10 }, {});
    expect(moved.components[0].y).toBe(60);
    expect(moved.wires[0].points[0]).toEqual({ x: 60, y: 60 });
    expect(moved.wires[0].points.at(-1)).toEqual({ x: 80, y: 50 });
    expect(moved.wires[0].points.length).toBeGreaterThanOrEqual(3);

    // Flip X on R1: transforms via angle=180 + flipY=true while keeping flipX=false
    const flippedX = transformEntities(sch.sheets[0], ['r1'], { flip: 'X' }, {});
    expect(flippedX.components[0].angle).toBe(180);
    expect(flippedX.components[0].flipY).toBe(true);
    expect(flippedX.components[0].flipX).toBe(false);

    // Hit testing on R1 body and label
    expect(hitTestEntity(sch.sheets[0], 'r1', { x: 50, y: 50 }, 1.5, {})).toBe(true);
    expect(hitTestEntity(sch.sheets[0], 'refDes@r1', { x: 50, y: 44 }, 1.5, {})).toBe(true);
    expect(findLabelOverlaps(sch.sheets[0], {})).toEqual([]);

    // Copy/Paste allocates new RefDes
    const frag = copyFragment(sch, sch.sheets[0], ['r1']);
    const pasted = pasteFragment(sch, frag, { x: 100, y: 100 }, {});
    expect(pasted.sheet.components[0].refDes).toBe('R2');
  });
});
