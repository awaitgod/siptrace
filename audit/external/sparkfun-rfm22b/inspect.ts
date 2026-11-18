import { readFileSync } from 'node:fs';
import { importCadPcbSync, importCadSchematicSync } from '../../../src/engines/importers';

const dir = 'audit/external/sparkfun-rfm22b/';
const board = importCadPcbSync(readFileSync(dir + 'SparkFun_RF_Transceiver-RFM22B.brd', 'utf8'), 'example.brd');
const sch = importCadSchematicSync(readFileSync(dir + 'SparkFun_RF_Transceiver-RFM22B.sch', 'utf8'), 'example.sch');
console.log(JSON.stringify({ pcb: { format: board.detectedFormat, components: board.pcb.components.length, padsWithNet: board.pcb.components.reduce((n, c) => n + Object.values(c.padNets).filter(Boolean).length, 0), traces: board.pcb.traces.length, vias: board.pcb.vias.length, pours: board.pcb.copperPours.length, outline: board.pcb.boardOutline, warnings: board.report.warnings }, schematic: { format: sch.detectedFormat, components: sch.project.sheets[0].components.length, wires: sch.project.sheets[0].wires.length, warnings: sch.report.warnings } }, null, 2));
for (const original of ['RFM22-XXX-S2', 'JP0', 'JP1', 'U$1']) {
  const item = board.report.items.find((i) => i.originalRef === original);
  const component = board.pcb.components.find((c) => c.refDes === item?.gostRef);
  console.log(original, JSON.stringify({ mappedRef: item?.gostRef, x: component?.x, y: component?.y, angle: component?.angle, pads: component?.pads.map(({ number, x, y, width, height, angle, holeDiameter }) => ({ number, x, y, width, height, angle, holeDiameter })) }));
}
