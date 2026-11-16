import { SchematicProject } from '../../core/types';
import { loadUserComponents } from '../../core/store';
import { findComponentById } from '../../gost/libraries/gostComponents';
import { extractSchematicNets } from '../erc';

/** Extracted logical net with connected component pads. */
export interface NetlistItem {
  netName: string;
  nodes: { refDes: string; padNumber: string }[];
}

/** Extracts PCB pad-level netlist from multi-sheet schematic connectivity. */
export function extractSchematicNetlist(sch: SchematicProject): NetlistItem[] {
  const graph = extractSchematicNets(sch);
  const compById = new Map<string, { refDes: string; defId: string }>();
  for (const sheet of sch.sheets) {
    for (const c of sheet.components) {
      compById.set(c.id, { refDes: c.refDes, defId: c.componentDefId });
    }
  }

  return graph
    .map((net) => {
      const nodes: { refDes: string; padNumber: string }[] = [];
      for (const p of net.pins) {
        if (!p.refDes || p.refDes.startsWith('#')) continue;
        const compInfo = compById.get(p.compId);
        const def = compInfo
          ? (findComponentById(compInfo.defId, sch.customComponentDefs) ??
            loadUserComponents().find((uc) => uc.id === compInfo.defId))
          : undefined;
        const part = def?.parts.find((pt) => pt.pins.some((sp) => sp.number === p.pinNumber));
        const pinDef = part?.pins.find((sp) => sp.number === p.pinNumber);
        const padNum = pinDef?.padMapping || p.pinNumber;
        nodes.push({ refDes: p.refDes, padNumber: padNum });
      }
      return { netName: net.netName, nodes };
    })
    .filter((n) => n.nodes.length > 0);
}
