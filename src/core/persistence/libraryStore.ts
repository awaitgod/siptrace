import { ComponentDef, PatternDef } from '../models';
import { readStorageJson, writeStorageJson } from './jsonStorage';
import { STORAGE_KEYS } from './storageKeys';

/**
 * Loads user-defined schematic component definitions.
 */
export function loadUserComponents(): ComponentDef[] {
  return readStorageJson<ComponentDef[]>(STORAGE_KEYS.USER_COMPONENTS) ?? [];
}

/**
 * Saves user-defined schematic component definitions.
 */
export function saveUserComponents(comps: ComponentDef[]): void {
  writeStorageJson(STORAGE_KEYS.USER_COMPONENTS, comps);
}

/**
 * Loads user-defined PCB footprint patterns.
 */
export function loadUserPatterns(): PatternDef[] {
  return readStorageJson<PatternDef[]>(STORAGE_KEYS.USER_PATTERNS) ?? [];
}

/**
 * Saves user-defined PCB footprint patterns.
 */
export function saveUserPatterns(pats: PatternDef[]): void {
  writeStorageJson(STORAGE_KEYS.USER_PATTERNS, pats);
}
