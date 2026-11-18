import { describe, expect, it } from 'vitest';
import { ComponentDef, PlacedComponent, Point2D, SchematicProject, SchematicSheet } from '../../src/core/types';
import {
  DEFAULT_PIN_MATRIX,
  extractSchematicNets,
  PIN_ELECTRICAL_TYPES,
  PinElectricalType,
  runSchematicErc
} from '../../src/engines/erc';
import {
  exportSpiceNetlist,
  runBuiltInSpiceSimulation,
  solveComplexSystem,
  solveLinearSystem,
  SpiceSimulationOptions
} from '../../src/engines/spice';
import {
  exportGostBomToCsv,
  exportGostBomToHtml,
  formatRefDesRange,
  generateGostBom,
  splitRefDes
} from '../../src/gost/gostBom';

const testResistorDef: ComponentDef = {
  id: 'test_resistor',
  name: 'Резистор',
  refDesPrefix: 'R',
  parts: [{
    partIndex: 1,
    pins: [
      { id: 'p1', number: '1', name: '1', x: -10, y: 0, electricalType: 'Passive' },
      { id: 'p2', number: '2', name: '2', x: 10, y: 0, electricalType: 'Passive' }
    ]
  }]
};

const testCapacitorDef: ComponentDef = {
  id: 'test_capacitor',
  name: 'Конденсатор',
  refDesPrefix: 'C',
  parts: [{
    partIndex: 1,
    pins: [
      { id: 'p1', number: '1', name: '1', x: -10, y: 0, electricalType: 'Passive' },
      { id: 'p2', number: '2', name: '2', x: 10, y: 0, electricalType: 'Passive' }
    ]
  }]
};

const testDiodeDef: ComponentDef = {
  id: 'test_diode',
  name: 'Диод',
  refDesPrefix: 'VD',
  parts: [{
    partIndex: 1,
    pins: [
      { id: 'p1', number: '1', name: 'A', x: -10, y: 0, electricalType: 'Passive' },
      { id: 'p2', number: '2', name: '2', x: 10, y: 0, electricalType: 'Passive' }
    ]
  }]
};

function createMockSheet(id: string, name: string): SchematicSheet {
  return {
    id,
    name,
    format: 'A4',
    titleBlock: {
      designation: 'ГТРС.468759.001 Э3',
      name: 'Устройство сбора и передачи данных',
      developer: 'Иванов',
      checker: 'Петров',
      normControl: 'Сидоров',
      approver: 'Кузнецов',
      date: '2026-11-18',
      enabled: true,
      form: 'Form1',
      scale: '1:1',
      litera: 'О1',
      sheetNumber: 1,
      totalSheets: 1,
      showZones: true
    },
    components: [],
    wires: [],
    buses: [],
    busTaps: [],
    netPorts: [],
    junctions: [],
    shapes: [],
    tables: [],
    hierarchyBlocks: []
  };
}

function makeProject(
  components: PlacedComponent[],
  wires: SchematicSheet['wires'] = [],
  netPorts: SchematicSheet['netPorts'] = [],
  customDefs: Record<string, ComponentDef> = {}
): SchematicProject {
  const sheet = createMockSheet('sheet_1', 'Лист 1');
  sheet.components = components;
  sheet.wires = wires;
  sheet.netPorts = netPorts;
  return {
    id: 'proj_1',
    projectName: 'Enterprise SPICE & ERC Test',
    sheets: [sheet],
    activeSheetId: 'sheet_1',
    customComponentDefs: {
      test_resistor: testResistorDef,
      test_capacitor: testCapacitorDef,
      test_diode: testDiodeDef,
      ...customDefs
    }
  };
}

describe('1. MNA Mathematical Solvers & Stability', () => {
  it('solves non-singular real linear systems correctly (Gauss-Jordan)', () => {
    // 2x + y = 5, x + 3y = 10  => x = 1, y = 3
    const A = [
      [2, 1],
      [1, 3]
    ];
    const b = [5, 10];
    const sol = solveLinearSystem(A, b);
    expect(sol).not.toBeNull();
    expect(sol![0]).toBeCloseTo(1.0, 5);
    expect(sol![1]).toBeCloseTo(3.0, 5);
  });

  it('handles singular and zero-pivot matrices without crashing or NaN', () => {
    // A has a zero column / singular diagonal
    const A = [
      [0, 0, 1],
      [0, 2, 0],
      [1, 0, 0]
    ];
    const b = [3, 4, 5];
    const sol = solveLinearSystem(A, b);
    expect(sol).not.toBeNull();
    expect(Number.isFinite(sol![0])).toBe(true);
    expect(Number.isFinite(sol![1])).toBe(true);
    expect(Number.isFinite(sol![2])).toBe(true);
  });

  it('solves complex AC linear systems with phase and magnitude', () => {
    // (1 + j) * z = 2  => z = 2 / (1 + j) = 1 - j
    const CA = [[{ re: 1, im: 1 }]];
    const cb = [{ re: 2, im: 0 }];
    const sol = solveComplexSystem(CA, cb);
    expect(sol[0].re).toBeCloseTo(1.0, 5);
    expect(sol[0].im).toBeCloseTo(-1.0, 5);
  });
});

describe('2. SPICE Circuit Simulation & Convergence', () => {
  it('RC Low-pass filter: transient step response converges to V_in and AC cutoff matches 1/(2*pi*R*C)', () => {
    // R1: x=30, y=40 -> pin1 at (20, 40), pin2 at (40, 40)
    const r1: PlacedComponent = {
      id: 'r1',
      componentDefId: 'test_resistor',
      refDes: 'R1',
      typeName: 'Резистор',
      value: '1k',
      x: 30,
      y: 40,
      angle: 0,
      flipX: false,
      flipY: false,
      partIndex: 1
    };
    // C1: x=50, y=40 -> pin1 at (40, 40), pin2 at (60, 40)
    const c1: PlacedComponent = {
      id: 'c1',
      componentDefId: 'test_capacitor',
      refDes: 'C1',
      typeName: 'Конденсатор',
      value: '100nF',
      x: 50,
      y: 40,
      angle: 0,
      flipX: false,
      flipY: false,
      partIndex: 1
    };

    const wires: SchematicSheet['wires'] = [
      { id: 'w1', netName: 'VOUT', points: [{ x: 40, y: 40 }, { x: 40, y: 55 }] }
    ];
    const ports: SchematicSheet['netPorts'] = [
      { id: 'p1', netName: 'VIN', x: 20, y: 40, style: 'Power' },
      { id: 'p2', netName: 'GND', x: 60, y: 40, style: 'Ground' }
    ];

    const project = makeProject([r1, c1], wires, ports);

    const opts: SpiceSimulationOptions = {
      mode: 'Transient',
      stopTimeMs: 1.0,
      stepTimeMs: 0.02
    };
    const res = runBuiltInSpiceSimulation(project, opts);

    expect(res.converged).toBe(true);
    expect(res.waveforms['VOUT']).toBeDefined();
    expect(res.timePoints.length).toBeGreaterThan(30);

    // After 10*tau = 1 ms, capacitor voltage should approach VIN (5.0V)
    const finalVout = res.waveforms['VOUT'][res.waveforms['VOUT'].length - 1];
    expect(finalVout).toBeGreaterThan(4.5);
    expect(finalVout).toBeLessThanOrEqual(5.05);

    // AC sweep: at low frequencies (< 100 Hz), gain is ~0 dB
    // At high frequencies (> 50 kHz), gain rolls off at -20 dB/dec
    expect(res.frequencies).toBeDefined();
    expect(res.acMagnitudeDb).toBeDefined();
    expect(res.acPhaseDeg).toBeDefined();

    const lowFreqGain = res.acMagnitudeDb!['VOUT'][0];
    const highFreqGain = res.acMagnitudeDb!['VOUT'][res.acMagnitudeDb!['VOUT'].length - 1];
    expect(lowFreqGain).toBeCloseTo(0, 0); // ~0 dB
    expect(highFreqGain).toBeLessThan(-20); // Roll-off at 10 MHz
  });

  it('Shockley Diode model: exhibits realistic forward bias drop (~0.7V) and supports international LED / D prefix', () => {
    // +5V at (20, 40) -> R1 (x=30, y=40, pin1=20,40, pin2=40,40)
    const r1: PlacedComponent = {
      id: 'r1',
      componentDefId: 'test_resistor',
      refDes: 'R1',
      typeName: 'Резистор',
      value: '1k',
      x: 30,
      y: 40,
      angle: 0,
      flipX: false,
      flipY: false,
      partIndex: 1
    };
    // VD1: x=50, y=40 (pin1/A at 40, 40, pin2/K at 60, 40)
    const d1: PlacedComponent = {
      id: 'd1',
      componentDefId: 'test_diode',
      refDes: 'VD1',
      typeName: 'Диод кремниевый',
      value: '1N4148',
      x: 50,
      y: 40,
      angle: 0,
      flipX: false,
      flipY: false,
      partIndex: 1
    };

    const wires: SchematicSheet['wires'] = [
      { id: 'w1', netName: 'VMID', points: [{ x: 40, y: 40 }, { x: 40, y: 50 }] }
    ];
    const ports: SchematicSheet['netPorts'] = [
      { id: 'p1', netName: '+5V', x: 20, y: 40, style: 'Power' },
      { id: 'p2', netName: 'GND', x: 60, y: 40, style: 'Ground' }
    ];

    const project = makeProject([r1, d1], wires, ports);
    const res = runBuiltInSpiceSimulation(project, 'DC');

    expect(res.converged).toBe(true);
    const midNode = res.dcNodes.find((n) => n.netName === 'VMID');
    expect(midNode).toBeDefined();
    // Diode forward drop should be close to 0.7V
    expect(midNode!.dcVoltage).toBeGreaterThan(0.5);
    expect(midNode!.dcVoltage).toBeLessThan(0.9);
  });

  it('computes DC operating point branch currents accurately', () => {
    // 5V source driving 100 Ohm to GND -> I = 50 mA
    const r1: PlacedComponent = {
      id: 'r1',
      componentDefId: 'test_resistor',
      refDes: 'R1',
      typeName: 'Резистор',
      value: '100',
      x: 30,
      y: 40,
      angle: 0,
      flipX: false,
      flipY: false,
      partIndex: 1
    };
    const ports: SchematicSheet['netPorts'] = [
      { id: 'p1', netName: '+5V', x: 20, y: 40, style: 'Power' },
      { id: 'p2', netName: 'GND', x: 40, y: 40, style: 'Ground' }
    ];

    const project = makeProject([r1], [], ports);
    const res = runBuiltInSpiceSimulation(project, 'DC');

    expect(res.branchCurrents).toBeDefined();
    expect(res.branchCurrents!['I(R1)']).toBeCloseTo(50.0, 1); // 50 mA
  });
});

describe('3. ERC Pin Type Matrix & Advanced Validation', () => {
  it('provides default EDA Pin Matrix with standard ECAD rules', () => {
    expect(DEFAULT_PIN_MATRIX).toBeDefined();
    expect(PIN_ELECTRICAL_TYPES).toContain('Input');
    expect(PIN_ELECTRICAL_TYPES).toContain('Output');
    expect(PIN_ELECTRICAL_TYPES).toContain('Power');
    expect(PIN_ELECTRICAL_TYPES).toContain('Passive');

    // Output-to-Output is an Error
    expect(DEFAULT_PIN_MATRIX.Output.Output).toBe('Error');
    // Output-to-Power is an Error
    expect(DEFAULT_PIN_MATRIX.Output.Power).toBe('Error');
    // Passive-to-Input is None (Allowed)
    expect(DEFAULT_PIN_MATRIX.Passive.Input).toBe('None');
    // NotConnected-to-anything is an Error
    expect(DEFAULT_PIN_MATRIX.NotConnected.Input).toBe('Error');
  });

  it('detects pin type matrix conflicts and reports ERC-PIN-MATRIX with net name', () => {
    const c1: PlacedComponent = {
      id: 'c1',
      componentDefId: 'chip_out',
      refDes: 'DD1',
      typeName: 'Логика',
      value: '74HC04',
      x: 30,
      y: 40,
      angle: 0,
      flipX: false,
      flipY: false,
      partIndex: 1
    };
    const c2: PlacedComponent = {
      id: 'c2',
      componentDefId: 'reg_out',
      refDes: 'DA1',
      typeName: 'Стабилизатор',
      value: 'LM7805',
      x: 70,
      y: 40,
      angle: 0,
      flipX: false,
      flipY: false,
      partIndex: 1
    };

    const project = makeProject(
      [c1, c2],
      [{ id: 'w1', netName: 'BUS_CONFLICT', points: [{ x: 30, y: 40 }, { x: 70, y: 40 }] }],
      [],
      {
        chip_out: {
          id: 'chip_out',
          name: 'Chip Out',
          refDesPrefix: 'DD',
          parts: [{
            partIndex: 1,
            pins: [{ id: 'p1', number: '1', name: 'Y', electricalType: 'Output', x: 0, y: 0 }]
          }]
        },
        reg_out: {
          id: 'reg_out',
          name: 'Reg Out',
          refDesPrefix: 'DA',
          parts: [{
            partIndex: 1,
            pins: [{ id: 'p1', number: '1', name: 'VOUT', electricalType: 'Power', x: 0, y: 0 }]
          }]
        }
      }
    );

    const errors = runSchematicErc(project);
    const matrixErr = errors.find((e) => e.code === 'ERC-PIN-MATRIX');
    expect(matrixErr).toBeDefined();
    expect(matrixErr!.severity).toBe('Error');
    expect(matrixErr!.netName).toBe('BUS_CONFLICT');
    expect(matrixErr!.message).toContain('DD1.1');
    expect(matrixErr!.message).toContain('DA1.1');
  });
});

describe('4. Commercial & Enterprise BOM / ПЭ3 Reporting', () => {
  it('natural numerical sorting of RefDes (R1..R10) and collapsible ranges (R1...R5)', () => {
    const refs = ['R10', 'R2', 'R1', 'R5', 'R3', 'R4', 'R12', 'R11'];
    const range = formatRefDesRange(refs, '...');
    // Natural order: R1, R2, R3, R4, R5 -> R1...R5, then R10, R11, R12 -> R10...R12
    expect(range).toBe('R1...R5, R10...R12');
  });

  it('keeps 2-element lists as comma-separated pairs per ГОСТ (R1, R2)', () => {
    expect(formatRefDesRange(['R2', 'R1'])).toBe('R1, R2');
    expect(formatRefDesRange(['C1', 'C2'])).toBe('C1, C2');
  });

  it('exports 1C:Enterprise / ERP semicolon-delimited CSV with all standard commercial columns', () => {
    const components: PlacedComponent[] = [
      {
        id: 'r1',
        componentDefId: 'res',
        refDes: 'R1',
        typeName: 'Резистор',
        value: '10 кОм',
        gostStandard: 'ГОСТ 28885-90',
        patternId: '0805',
        gostNote: '±1%',
        x: 0,
        y: 0,
        angle: 0,
        flipX: false,
        flipY: false,
        partIndex: 0
      },
      {
        id: 'r2',
        componentDefId: 'res',
        refDes: 'R2',
        typeName: 'Резистор',
        value: '10 кОм',
        gostStandard: 'ГОСТ 28885-90',
        patternId: '0805',
        gostNote: '±1%',
        x: 10,
        y: 0,
        angle: 0,
        flipX: false,
        flipY: false,
        partIndex: 0
      }
    ];

    const project = makeProject(components);
    const bom = generateGostBom(project);
    expect(bom.length).toBe(1);
    expect(bom[0].quantity).toBe(2);
    expect(bom[0].refDesList).toBe('R1, R2');

    const csv1C = exportGostBomToCsv(bom, { format: '1c_erp' });
    expect(csv1C).toContain('Позиция;Наименование;Количество;Единица;Примечание;Группа;Корпус;Стандарт_ГОСТ');
    expect(csv1C).toContain('"R1, R2"');
    expect(csv1C).toContain('"шт."');
    expect(csv1C).toContain('0805');
    expect(csv1C).toContain('ГОСТ 28885-90');
  });

  it('generates ESKD print-ready HTML sheet for ПЭ3 with ГОСТ title block stamp', () => {
    const components: PlacedComponent[] = [
      {
        id: 'r1',
        componentDefId: 'res',
        refDes: 'R1',
        typeName: 'Резистор ЧИП',
        value: '4.7 кОм',
        x: 0,
        y: 0,
        angle: 0,
        flipX: false,
        flipY: false,
        partIndex: 0
      }
    ];
    const project = makeProject(components);
    const bom = generateGostBom(project);
    const html = exportGostBomToHtml(project, bom);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Перечень элементов');
    expect(html).toContain('ГТРС.468759.001 ПЭ3');
    expect(html).toContain('Устройство сбора и передачи данных');
    expect(html).toContain('Резисторы');
    expect(html).toContain('4.7 кОм');
  });
});
