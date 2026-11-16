import { ComponentDef, ComponentLibrary, PatternDef, PatternLibrary } from '../models';
import { broadcastEdaEvent } from './eventBus';
import { readStorageJson, writeStorageJson } from './jsonStorage';
import { STORAGE_KEYS } from './storageKeys';

export interface CadLibraryBundle {
  id: string;
  name: string;
  sourceFormat: string;
  sourceFile: string;
  category: string;
  gostAdapted: boolean;
  importedAt: string;
  componentIds: string[];
  patternIds: string[];
}

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

/**
 * Loads metadata for imported external CAD library bundles (.eli, .lib, .kicad_sym, .kicad_mod, .lbr, EasyEDA, etc.).
 */
export function loadImportedLibraryBundles(): CadLibraryBundle[] {
  return readStorageJson<CadLibraryBundle[]>(STORAGE_KEYS.IMPORTED_LIBRARY_BUNDLES) ?? [];
}

/**
 * Saves metadata for imported external CAD library bundles.
 */
export function saveImportedLibraryBundles(bundles: CadLibraryBundle[]): void {
  writeStorageJson(STORAGE_KEYS.IMPORTED_LIBRARY_BUNDLES, bundles);
}

/**
 * Persists an imported external CAD library bundle (components + patterns + metadata)
 * into persistent storage and broadcasts `libraries:updated`.
 */
export function registerImportedLibraryBundle(opts: {
  name: string;
  sourceFormat: string;
  sourceFile: string;
  category?: string;
  gostAdapted: boolean;
  components: ComponentDef[];
  patterns: PatternDef[];
}): CadLibraryBundle {
  const libName = opts.name.trim() || opts.sourceFile.replace(/\.[^.]+$/, '') || 'Импорт_CAD';
  const bundleId = `cadlib_${libName.replace(/[^A-Za-z0-9А-Яа-я_-]/g, '_').slice(0, 40)}`;

  const existingComps = [...loadUserComponents()];
  const existingPats = [...loadUserPatterns()];
  const compIds: string[] = [];
  const patIds: string[] = [];

  for (const p of opts.patterns) {
    const tagged: PatternDef = { ...p, library: libName };
    const idx = existingPats.findIndex((x) => x.id === tagged.id);
    if (idx >= 0) existingPats[idx] = tagged;
    else existingPats.push(tagged);
    patIds.push(tagged.id);
  }

  for (const c of opts.components) {
    const tagged: ComponentDef = { ...c, library: libName };
    const idx = existingComps.findIndex((x) => x.id === tagged.id);
    if (idx >= 0) existingComps[idx] = tagged;
    else existingComps.push(tagged);
    compIds.push(tagged.id);
  }

  saveUserPatterns(existingPats);
  saveUserComponents(existingComps);

  const bundles = [...loadImportedLibraryBundles()];
  const bundle: CadLibraryBundle = {
    id: bundleId,
    name: libName,
    sourceFormat: opts.sourceFormat,
    sourceFile: opts.sourceFile,
    category: opts.category || 'Импорт CAD',
    gostAdapted: opts.gostAdapted,
    importedAt: new Date().toISOString(),
    componentIds: Array.from(new Set(compIds)),
    patternIds: Array.from(new Set(patIds))
  };

  const bIdx = bundles.findIndex((b) => b.id === bundle.id || b.name === bundle.name);
  if (bIdx >= 0) {
    const prev = bundles[bIdx];
    bundles[bIdx] = {
      ...bundle,
      componentIds: Array.from(new Set([...prev.componentIds, ...bundle.componentIds])),
      patternIds: Array.from(new Set([...prev.patternIds, ...bundle.patternIds]))
    };
  } else {
    bundles.push(bundle);
  }
  saveImportedLibraryBundles(bundles);
  broadcastEdaEvent('libraries:updated', { kind: 'all', bundleId: bundle.id });
  return bundle;
}

/**
 * Deletes an imported CAD library bundle and all components/patterns exclusively belonging to it.
 */
export function deleteImportedLibraryBundle(bundleId: string): void {
  const bundles = loadImportedLibraryBundles();
  const target = bundles.find((b) => b.id === bundleId);
  if (!target) return;

  const remainingBundles = bundles.filter((b) => b.id !== bundleId);
  const stillReferencedCompIds = new Set(remainingBundles.flatMap((b) => b.componentIds));
  const stillReferencedPatIds = new Set(remainingBundles.flatMap((b) => b.patternIds));

  const nextComps = loadUserComponents().filter(
    (c) => !target.componentIds.includes(c.id) || stillReferencedCompIds.has(c.id)
  );
  const nextPats = loadUserPatterns().filter(
    (p) => !target.patternIds.includes(p.id) || stillReferencedPatIds.has(p.id)
  );

  saveUserComponents(nextComps);
  saveUserPatterns(nextPats);
  saveImportedLibraryBundles(remainingBundles);
  broadcastEdaEvent('libraries:updated', { kind: 'all', deletedBundleId: bundleId });
}

/**
 * Exports a stored bundle as portable `.gostlib` JSON text.
 */
export function exportLibraryBundleAsGostlib(bundleId: string): string {
  const bundle = loadImportedLibraryBundles().find((b) => b.id === bundleId);
  if (!bundle) {
    return JSON.stringify({ components: loadUserComponents(), patterns: loadUserPatterns() }, null, 2);
  }
  const compSet = new Set(bundle.componentIds);
  const patSet = new Set(bundle.patternIds);
  const components = loadUserComponents().filter((c) => compSet.has(c.id));
  const patterns = loadUserPatterns().filter((p) => patSet.has(p.id));
  return JSON.stringify(
    {
      name: bundle.name,
      sourceFormat: bundle.sourceFormat,
      exportedAt: new Date().toISOString(),
      components,
      patterns
    },
    null,
    2
  );
}

/**
 * Groups user/imported schematic components into distinct ComponentLibrary tabs
 * (one per imported CAD library + "Пользовательские (УГО)" for standalone custom parts).
 */
export function getUserComponentLibraries(): ComponentLibrary[] {
  const allComps = loadUserComponents();
  if (allComps.length === 0) return [];
  const bundles = loadImportedLibraryBundles();
  const bundleByName = new Map(bundles.map((b) => [b.name, b]));
  const grouped = new Map<string, ComponentDef[]>();

  for (const c of allComps) {
    const key = c.library && c.library !== 'lib_user' ? c.library : '__user__';
    const arr = grouped.get(key) ?? [];
    arr.push(c);
    grouped.set(key, arr);
  }

  const libs: ComponentLibrary[] = [];
  for (const [key, comps] of grouped.entries()) {
    if (key === '__user__') {
      libs.push({
        id: 'user_gost_ugos',
        name: 'Пользовательские (УГО)',
        category: 'Пользовательские',
        description: 'Пользовательские компоненты УГО',
        isUserLibrary: true,
        components: comps
      });
    } else {
      const b = bundleByName.get(key);
      libs.push({
        id: b?.id ?? `imp_comp_${key.replace(/[^A-Za-z0-9]/g, '_')}`,
        name: `📦 ${key}`,
        category: b?.category ?? 'Импорт CAD',
        description: b ? `${b.sourceFormat} (${b.sourceFile})` : `Импортированная библиотека ${key}`,
        isUserLibrary: true,
        components: comps
      });
    }
  }
  return libs;
}

/**
 * Groups user/imported PCB footprints into distinct PatternLibrary tabs.
 */
export function getUserPatternLibraries(): PatternLibrary[] {
  const allPats = loadUserPatterns();
  if (allPats.length === 0) return [];
  const bundles = loadImportedLibraryBundles();
  const bundleByName = new Map(bundles.map((b) => [b.name, b]));
  const grouped = new Map<string, PatternDef[]>();

  for (const p of allPats) {
    const key = p.library && p.library !== 'patlib_user' ? p.library : '__user__';
    const arr = grouped.get(key) ?? [];
    arr.push(p);
    grouped.set(key, arr);
  }

  const libs: PatternLibrary[] = [];
  for (const [key, pats] of grouped.entries()) {
    if (key === '__user__') {
      libs.push({
        id: 'patlib_user',
        name: 'Пользовательские корпуса',
        description: 'Сохранённые корпуса пользователя',
        isUserLibrary: true,
        patterns: pats
      });
    } else {
      const b = bundleByName.get(key);
      libs.push({
        id: `patlib_${b?.id ?? key.replace(/[^A-Za-z0-9]/g, '_')}`,
        name: `📦 ${key}`,
        description: b ? `${b.sourceFormat} (${b.sourceFile})` : `Импортированные корпуса ${key}`,
        isUserLibrary: true,
        patterns: pats
      });
    }
  }
  return libs;
}
