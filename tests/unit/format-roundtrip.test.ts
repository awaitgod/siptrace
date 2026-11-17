import { describe, expect, it } from 'vitest';
import { importCadPcb, importCadSchematic } from '../../src/engines/importers/universalImporter';
import { exportDipTraceAsciiPcb, exportDipTraceAsciiSchematic } from '../../src/engines/importers/diptrace/asciiExporter';
import { serializePcb, serializeSchematic } from '../../src/engines/importers/jsonSerializer';
import { exportGerberZipBytes } from '../../src/engines/camBundle';
import { exportExcellonDrill } from '../../src/engines/cam/excellonAndAssemblyExporter';
import { exportPcbDxf } from '../../src/engines/cam/dxfAndSvgExporter';
import { exportSpiceNetlist } from '../../src/engines/spice/spiceNetlistExporter';
import { createLabCamReadyPcb, createLabServoSchematic } from '../../src/gost/demo/labDemos';
import { extractSchematicNets, getComponentWorldPins } from '../../src/engines/erc';
import { parseSExpressions, sxFind, sxFindAll, sxNum, sxStr } from '../../src/engines/importers/sexprParser';
import { encodeDipTraceSchematicAscii } from '../../src/engines/importers/diptrace/asciiEncoding';
import { buildGostFrameAndStampGeometry, SHEET_FORMATS } from '../../src/gost/gostTitleBlock';

describe('Export -> re-import round trips', () => {
  const sch = createLabServoSchematic();
  const pcb = createLabCamReadyPcb();

  it('.gostsch keeps components', async () => {
    const rt = await importCadSchematic(serializeSchematic(sch), 'rt.gostsch');
    expect(rt.project.sheets[0].components.length).toBe(sch.sheets[0].components.length);
  });

  it('DipTrace ASCII schematic re-imports', async () => {
    const asc = exportDipTraceAsciiSchematic(sch);
    expect(asc).toMatch(/^\(Source "DipTrace-Schematic" 46\)\r\n/);
    expect(asc).not.toMatch(/(?<!\r)\n/);
    const [, , , , , schematic] = parseSExpressions(asc);
    const parts = sxFindAll(sxFind(schematic, 'Components')!, 'Part');
    const nets = sxFindAll(sxFind(schematic, 'Nets')!, 'Net');
    const expected = extractSchematicNets(sch).filter(net => net.wireIds.length || net.pins.length > 1 || net.portNames.length);
    expect(parts.map(p => sxStr(p, 2))).toEqual(sch.sheets[0].components.map(c => c.refDes));
    expect(nets).toHaveLength(expected.length);
    nets.forEach((net, i) => {
      const members = sxFindAll(sxFind(net, 'Parts')!, 'pt').map(row => {
        const part = parts[sxNum(row, 1)];
        const pin = sxFindAll(sxFind(part, 'Pins')!, 'Pin')[sxNum(row, 2)];
        expect(sxNum(sxFind(pin, 'NetNumber'), 1)).toBe(i);
        return sxStr(part, 2) + ':' + sxStr(sxFind(pin, 'StringNumber'), 1);
      });
      expect(members.sort()).toEqual(expected[i].pins.map(pin => pin.refDes + ':' + pin.pinNumber).sort());
    });

    const rt = await importCadSchematic(asc, 'rt.asc');
    const imported = rt.project.sheets[0];
    expect(imported.wires.length).toBeGreaterThanOrEqual(sch.sheets[0].wires.length);
    for (const [i, component] of sch.sheets[0].components.entries()) {
      const restored = imported.components[i];
      expect(restored).toMatchObject({ refDes: component.refDes, value: component.value, x: component.x, y: component.y });
      expect(getComponentWorldPins(restored, rt.project.customComponentDefs).map(({ x, y, pinNumber }) => ({ x, y, pinNumber })))
        .toEqual(getComponentWorldPins(component, sch.customComponentDefs).map(({ x, y, pinNumber }) => ({ x, y, pinNumber })));
    }
    expect(Object.values(rt.project.customPatternDefs).some(pattern => pattern.pads.length === 28)).toBe(true);
  });

  it('writes a net with a tap before its trunk and a separate wire on a second page', async () => {
    const original = sch.sheets[0];
    const resistor = original.components.find(c => c.refDes === 'R1')!;
    const makeComponent = (n: number, x: number, y: number) => ({
      ...resistor, id: 'r' + n, refDes: 'R' + n, x, y, angle: 0 as const
    });
    const components = [makeComponent(1, 80, 60), makeComponent(2, 140, 60), makeComponent(3, 110, 90)];
    const [left, right, tap] = components.map(c =>
      getComponentWorldPins(c, sch.customComponentDefs).find(pin => c.refDes === 'R1' ? pin.x > c.x : pin.x < c.x)!);
    const next = [makeComponent(4, 50, 50), makeComponent(5, 90, 50)];
    const wire = (id: string, ...points: { x: number; y: number }[]) => ({ id, netName: 'SIGNAL', points });
    const project = { ...sch, sheets: [
      { ...original, components, wires: [wire('tap', tap, { x: tap.x, y: left.y }), wire('trunk', left, right)],
        junctions: [], shapes: [], netPorts: [] },
      { ...original, id: 'sheet2', name: 'Второй лист', components: next, junctions: [], shapes: [], netPorts: [],
        wires: [wire('other', ...next.map((c, i) =>
          getComponentWorldPins(c, sch.customComponentDefs).find(pin => i === 0 ? pin.x > c.x : pin.x < c.x)!))] }
    ] };
    const asc = exportDipTraceAsciiSchematic(project);
    const schematic = parseSExpressions(asc).find(root => root[0] === 'Schematic')!;
    const nets = sxFindAll(sxFind(schematic, 'Nets')!, 'Net');
    expect(nets).toHaveLength(2);
    const lines = sxFindAll(sxFind(nets[0], 'Lines')!, 'Line');
    expect(lines).toHaveLength(2);
    expect(sxNum(sxFind(lines[0], 'Connect1'), 1)).toBe(0);
    expect(sxNum(sxFind(lines[0], 'Connect2'), 1)).toBe(1);
    expect(sxNum(sxFind(lines[1], 'ConnectMode2'), 1)).toBe(1);
    expect(sxNum(sxFind(lines[1], 'Connect2'), 1)).toBe(0);
    const rt = await importCadSchematic(asc, 'rt.asc');
    expect(rt.project.sheets.map(sheet => [sheet.components.length, sheet.wires.length])).toEqual([[3, 2], [2, 1]]);
    expect(rt.project.sheets[1].name).toBe('Второй лист');
  });

  it('writes Cyrillic, the GOST stamp and fitted BOM cells to the same ASCII file', async () => {
    const source = sch.sheets[0];
    const name = 'Плата управления';
    const description = 'Конденсатор керамический 0,1 мкФ, 50 В, корпус 0805';
    const sheet = {
      ...source, name, titleBlock: { ...source.titleBlock, enabled: true, form: 'Form1' as const, name },
      shapes: [{ id: 'bom', type: 'table' as const, source: 'bom' as const, x: 50, y: 55, rowHeight: 5.5,
        colWidths: [20, 30, 10], rows: [['Поз. обозн.', 'Наименование', 'Кол.'], ['C1', description, '2']] }]
    };
    const bytes = encodeDipTraceSchematicAscii(exportDipTraceAsciiSchematic({ ...sch, sheets: [sheet] }));
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toThrow();
    const raw = new TextDecoder('windows-1251').decode(bytes);
    const root = parseSExpressions(raw).find(node => node[0] === 'Schematic')!;
    const shapes = sxFindAll(sxFind(root, 'Shapes')!, 'Shape');
    const frame = buildGostFrameAndStampGeometry(sheet.format, sheet.titleBlock);
    const lines = shapes.filter(shape => sxNum(sxFind(shape, 'Type'), 1) === 1);
    expect(lines).toHaveLength(frame.lines.length + 7);
    const text = (name: string) => shapes.find(shape => sxStr(sxFind(shape, 'Name'), 1) === name);
    expect(text(name)).toBeDefined();
    const cell = text(description)!;
    const [topLeft, bottomRight] = sxFindAll(sxFind(cell, 'Points')!, 'pt');
    const { widthMm, heightMm } = SHEET_FORMATS[sheet.format];
    expect(sxNum(topLeft, 1) / 3 + widthMm / 2).toBeCloseTo(71);
    expect(sxNum(bottomRight, 1) / 3 + widthMm / 2).toBeLessThan(100);
    expect(sxNum(topLeft, 2) / 3 + heightMm / 2).toBeGreaterThan(60.5);
    expect(sxNum(bottomRight, 2) / 3 + heightMm / 2).toBeLessThan(66);
    const imported = await importCadSchematic(bytes, 'rt.asc');
    expect(imported.project.sheets[0].name).toBe(name);
    expect(imported.project.sheets[0].shapes.some(shape => shape.type === 'text' && shape.text === description)).toBe(true);
  });

  it('SPICE netlist is produced', () => {
    expect(exportSpiceNetlist(sch).length).toBeGreaterThan(0);
  });

  it('.gostpcb keeps traces', async () => {
    const rt = await importCadPcb(serializePcb(pcb), 'rt.gostpcb');
    expect(rt.pcb.traces.length).toBe(pcb.traces.length);
  });

  it('DipTrace ASCII PCB re-imports', async () => {
    const rt = await importCadPcb(exportDipTraceAsciiPcb(pcb), 'rt.dip');
    expect(rt.pcb.components.length).toBeGreaterThan(0);
    expect(rt.pcb.boardOutline.length).toBeGreaterThanOrEqual(3);
  });

  it('Gerber ZIP re-imports with outline and traces', async () => {
    const rt = await importCadPcb(exportGerberZipBytes(pcb), 'rt.zip');
    expect(rt.pcb.traces.length).toBeGreaterThan(0);
    expect(rt.pcb.boardOutline.length).toBeGreaterThanOrEqual(3);
  });

  it('Excellon re-imports holes', async () => {
    const rt = await importCadPcb(exportExcellonDrill(pcb), 'rt.drl');
    expect(rt.pcb.vias.length).toBeGreaterThan(0);
  });

  it('DXF re-imports outline', async () => {
    const rt = await importCadPcb(exportPcbDxf(pcb), 'rt.dxf');
    expect(rt.pcb.boardOutline.length).toBeGreaterThanOrEqual(3);
  });
});
