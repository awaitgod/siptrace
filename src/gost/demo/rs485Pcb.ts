import { PcbProject } from '../../core/types';
import { createDemoRs485GostSchematic } from './rs485Schematic';
import { convertSchematicToPcb } from '../../engines/netlist';
import { runAutorouter } from '../../engines/autorouter';
import { updateAllCopperPours } from '../../engines/copperPour';
import { uid } from '../../core/geometry';

let cachedDemoRs485Pcb: PcbProject | null = null;

export function createDemoRs485Pcb(): PcbProject {
  if (cachedDemoRs485Pcb) {
    return structuredClone(cachedDemoRs485Pcb);
  }
  const sch = createDemoRs485GostSchematic();
  let pcb = convertSchematicToPcb(sch);
  pcb.boardOutline = [
    { x: 0, y: 0 },
    { x: 90, y: 0 },
    { x: 90, y: 55 },
    { x: 0, y: 55 }
  ];

  // Clean ergonomic manual layout matching real PCB design
  const layoutPositions: Record<string, { x: number; y: number; angle: number }> = {
    XP1: { x: 10, y: 27.5, angle: 0 },
    R1: { x: 24, y: 12, angle: 90 },
    U1: { x: 34, y: 15, angle: 0 },
    R2: { x: 45, y: 12, angle: 90 },
    VT1: { x: 47, y: 24, angle: 0 },
    R3: { x: 54, y: 24, angle: 0 },
    R4: { x: 24, y: 30, angle: 0 },
    U2: { x: 34, y: 31, angle: 0 },
    R5: { x: 47, y: 35, angle: 90 },
    R6: { x: 24, y: 44, angle: 0 },
    U3: { x: 34, y: 45, angle: 0 },
    R7: { x: 47, y: 46, angle: 90 },
    C1: { x: 60, y: 14, angle: 90 },
    DA1: { x: 63, y: 28, angle: 0 },
    R8: { x: 74, y: 15, angle: 90 },
    R10: { x: 74, y: 28, angle: 90 },
    R9: { x: 74, y: 41, angle: 90 },
    XT1: { x: 83, y: 28, angle: 0 }
  };

  for (const c of pcb.components) {
    const pos = layoutPositions[c.refDes];
    if (pos) {
      c.x = pos.x;
      c.y = pos.y;
      c.angle = pos.angle;
    }
    if (c.refDes === 'VT1') c.refDesOffset = { x: 0, y: -4.8 };
    if (c.refDes === 'R10') c.refDesOffset = { x: -4.2, y: 0 };
    if (c.refDes === 'C1') c.refDesOffset = { x: 0, y: -3.2 };
  }
  if (pcb.diffPairs.length > 0) {
    pcb.diffPairs[0].maxMismatch = 2.0;
  }

  // Autoroute + Copper Pour GND on Bottom Layer for immediate rich PCB preview!
  const routed = runAutorouter(pcb);
  pcb = routed.pcb;

  pcb.copperPours.push({
    id: uid('pour'),
    layer: 'BottomCopper',
    netName: 'GND',
    outline: [
      { x: 0.4, y: 0.4 },
      { x: 89.6, y: 0.4 },
      { x: 89.6, y: 54.6 },
      { x: 0.4, y: 54.6 }
    ],
    dependOnBoardOutline: true,
    boardClearance: 0.4,
    clearance: 0.3,
    fillType: 'Solid',
    lineWidth: 0.25,
    lineSpacing: 0.5,
    thermalType: '4Spoke',
    thermalSpokeWidth: 0.35,
    thermalGap: 0.25,
    removeIslands: true,
    priority: 1,
    poured: false
  });
  pcb = updateAllCopperPours(pcb);
  cachedDemoRs485Pcb = structuredClone(pcb);

  return pcb;
}
