import { describe, expect, it } from 'vitest';
import { importCadPcb, importCadSchematic } from '../../src/engines/importers/universalImporter';
import { exportDipTraceAsciiPcb, exportDipTraceAsciiSchematic } from '../../src/engines/importers/diptrace/asciiExporter';
import { serializePcb, serializeSchematic } from '../../src/engines/importers/jsonSerializer';
import { exportGerberZipBytes } from '../../src/engines/camBundle';
import { exportExcellonDrill } from '../../src/engines/cam/excellonAndAssemblyExporter';
import { exportPcbDxf } from '../../src/engines/cam/dxfAndSvgExporter';
import { exportSpiceNetlist } from '../../src/engines/spice/spiceNetlistExporter';
import { createLabCamReadyPcb, createLabServoSchematic } from '../../src/gost/demo/labDemos';

describe('Export -> re-import round trips', () => {
  const sch = createLabServoSchematic();
  const pcb = createLabCamReadyPcb();

  it('.gostsch keeps components', async () => {
    const rt = await importCadSchematic(serializeSchematic(sch), 'rt.gostsch');
    expect(rt.project.sheets[0].components.length).toBe(sch.sheets[0].components.length);
  });

  it('DipTrace ASCII schematic re-imports', async () => {
    const rt = await importCadSchematic(exportDipTraceAsciiSchematic(sch), 'rt.asc');
    expect(rt.project.sheets[0].components.length).toBeGreaterThan(0);
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
