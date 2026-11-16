import { PcbProject, SchematicProject } from '../../core/types';
import { extractSchematicNetlist } from './netlistExtractor';

/** Comparison summary between a schematic netlist and a PCB layout. */
export interface CompareReport {
  addedOnSchematic: string[];
  removedFromSchematic: string[];
  changedNets: string[];
  inSync: boolean;
}

/** Compares components and pad-level net assignments between schematic and PCB. */
export function comparePcbToSchematic(sch: SchematicProject, pcb: PcbProject): CompareReport {
  const schRefs = new Set<string>();
  const schCompByRef = new Map<string, { value: string; patternId: string }>();
  for (const s of sch.sheets) {
    for (const c of s.components) {
      if (c.refDes && !c.refDes.startsWith('#') && !c.doNotMount) {
        schRefs.add(c.refDes);
        if (!schCompByRef.has(c.refDes)) {
          schCompByRef.set(c.refDes, { value: c.value, patternId: c.patternId });
        }
      }
    }
  }
  const pcbRefs = new Set(pcb.components.map((c) => c.refDes));

  const addedOnSchematic = Array.from(schRefs).filter((r) => !pcbRefs.has(r));
  const removedFromSchematic = Array.from(pcbRefs).filter((r) => !schRefs.has(r));

  const netlist = extractSchematicNetlist(sch);
  const schPinToNet = new Map<string, string>();
  for (const n of netlist) {
    for (const nd of n.nodes) schPinToNet.set(`${nd.refDes}:${nd.padNumber}`, n.netName);
  }

  const changedNets: string[] = [];
  for (const comp of pcb.components) {
    const schInfo = schCompByRef.get(comp.refDes);
    if (schInfo) {
      if (schInfo.value && comp.value && schInfo.value !== comp.value) {
        changedNets.push(`${comp.refDes}: номинал схема «${schInfo.value}» ≠ плата «${comp.value}»`);
      }
      if (schInfo.patternId && comp.patternId && schInfo.patternId !== comp.patternId) {
        changedNets.push(`${comp.refDes}: корпус схема «${schInfo.patternId}» ≠ плата «${comp.patternId}»`);
      }
    }
    for (const pad of comp.pads) {
      const expected = schPinToNet.get(`${comp.refDes}:${pad.number}`) ?? '';
      const actual = comp.padNets[pad.number] ?? '';
      if (expected !== actual) {
        changedNets.push(`${comp.refDes}.${pad.number}: схема «${expected || 'NC'}» ≠ плата «${actual || 'NC'}»`);
      }
    }
  }

  return {
    addedOnSchematic,
    removedFromSchematic,
    changedNets,
    inSync: addedOnSchematic.length === 0 && removedFromSchematic.length === 0 && changedNets.length === 0
  };
}

/** Back-annotates component values from PCB back into Schematic. */
export function backAnnotateSchematic(sch: SchematicProject, pcb: PcbProject): SchematicProject {
  const next = structuredClone(sch);
  const pcbByPatternAndPos = new Map(pcb.components.map((c) => [c.refDes, c]));
  for (const sheet of next.sheets) {
    for (const c of sheet.components) {
      const match = pcbByPatternAndPos.get(c.refDes);
      if (match) {
        c.value = match.value;
      }
    }
  }
  return next;
}
