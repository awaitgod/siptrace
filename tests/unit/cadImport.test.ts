import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importCadPcbSync, importCadSchematicSync } from '../../src/engines/importers';
import { extractSchematicNets } from '../../src/engines/erc';

describe('KiCad import integrity', () => {
  it('preserves distinct supply and ground net names in the symbols and connectivity', () => {
    const schematic = `(kicad_sch
      (symbol (lib_id "power:VCC") (at 10 10) (property "Reference" "#PWR01") (property "Value" "VCC"))
      (symbol (lib_id "power:GND") (at 30 10) (property "Reference" "#PWR02") (property "Value" "GND"))
      (symbol (lib_id "power:VSS") (at 50 10) (property "Reference" "#PWR03") (property "Value" "VSS")))`;
    const result = importCadSchematicSync(schematic, 'power.kicad_sch');
    expect(result.project.sheets[0].components.map((c) => c.value)).toEqual(['VCC', 'GND', 'VSS']);
    const defs = result.project.customComponentDefs;
    expect(result.project.sheets[0].components.map((c) => defs[c.componentDefId]?.portNetName)).toEqual(['VCC', 'GND', 'VSS']);
    expect(extractSchematicNets(result.project).map((net) => net.netName)).toEqual(expect.arrayContaining(['VCC', 'GND', 'VSS']));
  });

  it('orders unordered Edge.Cuts segments and warns about omitted zones', () => {
    const board = `(kicad_pcb
      (gr_line (start 0 0) (end 10 0) (layer "Edge.Cuts"))
      (gr_line (start 0 10) (end 0 0) (layer "Edge.Cuts"))
      (gr_line (start 10 10) (end 0 10) (layer "Edge.Cuts"))
      (gr_line (start 10 0) (end 10 10) (layer "Edge.Cuts"))
      (zone (net 1) (layer "F.Cu")))`;
    const { pcb, report } = importCadPcbSync(board, 'board.kicad_pcb');
    expect(pcb.boardOutline).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
    expect(report.warnings?.join(' ')).toContain('Зоны меди');
  });

  it('keeps the official pic_programmer board outline ordered and preserves VCC', () => {
    const base = 'tests/fixtures/external/kicad-pic-programmer/';
    const sch = importCadSchematicSync(readFileSync(base + 'pic_programmer.kicad_sch', 'utf8'), 'demo.kicad_sch');
    const power = sch.report.items.filter((item) => item.originalValue === 'VCC');
    expect(power.length).toBeGreaterThan(0);
    expect(power.every((item) => item.gostValue === 'VCC')).toBe(true);
    const board = importCadPcbSync(readFileSync(base + 'pic_programmer.kicad_pcb', 'utf8'), 'demo.kicad_pcb');
    expect(board.pcb.boardOutline).toEqual([
      { x: 73.66, y: 40.64 }, { x: 173.99, y: 40.64 }, { x: 233.68, y: 40.64 },
      { x: 233.68, y: 139.7 }, { x: 73.66, y: 139.7 }
    ]);
    expect(board.report.warnings?.join(' ')).toContain('Зоны меди');
  });

  it('warns instead of inventing an outline when arcs cannot be imported', () => {
    const board = `(kicad_pcb (gr_arc (start 0 0) (mid 5 5) (end 10 0) (layer "Edge.Cuts")))`;
    const { pcb, report } = importCadPcbSync(board, 'arc.kicad_pcb');
    expect(pcb.boardOutline).toEqual([]);
    expect(report.warnings?.join(' ')).toContain('Контур Edge.Cuts');
  });
});
