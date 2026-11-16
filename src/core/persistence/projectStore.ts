import { PcbProject, SchematicProject } from '../models';
import { createDemoRs485GostSchematic, createDemoRs485Pcb } from '../../gost/demoProjects';
import { readStorageJson, writeStorageJson } from './jsonStorage';
import { STORAGE_KEYS } from './storageKeys';

/**
 * Loads the active schematic from storage or returns the default RS-485 demo schematic.
 */
export function loadActiveSchematic(): SchematicProject {
  const parsed = readStorageJson<SchematicProject>(STORAGE_KEYS.ACTIVE_SCHEMATIC);
  if (parsed && Array.isArray(parsed.sheets) && parsed.sheets.length > 0) {
    return parsed;
  }
  return createDemoRs485GostSchematic();
}

/**
 * Persists the active schematic project.
 */
export function saveActiveSchematic(sch: SchematicProject): void {
  writeStorageJson(STORAGE_KEYS.ACTIVE_SCHEMATIC, sch);
}

/**
 * Loads the active PCB project from storage or returns the default RS-485 demo board.
 */
export function loadActivePcb(): PcbProject {
  const parsed = readStorageJson<PcbProject>(STORAGE_KEYS.ACTIVE_PCB);
  if (parsed && Array.isArray(parsed.components)) {
    return parsed;
  }
  return createDemoRs485Pcb();
}

/**
 * Persists the active PCB project.
 */
export function saveActivePcb(pcb: PcbProject): void {
  writeStorageJson(STORAGE_KEYS.ACTIVE_PCB, pcb);
}
