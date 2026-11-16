import { ColorSchemeId, PcbProject, SchematicProject, Units } from '../models';
import { readStorageJson, writeStorageJson } from './jsonStorage';
import { STORAGE_KEYS } from './storageKeys';

export interface RecentProjectSnapshot {
  schematic?: SchematicProject;
  pcb?: PcbProject;
}

export interface RecentProjectItem {
  id: string;
  name: string;
  designation: string;
  module: 'schematic' | 'pcb' | 'pcb3d';
  updatedAt: string;
  demoKey?: 'rs485' | 'mcu';
}

export interface AppSettings {
  colorScheme: ColorSchemeId;
  units: Units;
  gridDots: boolean;
  defaultAccuracyClass: 1 | 2 | 3 | 4 | 5;
  authorName: string;
  checkerName?: string;
  normControlName?: string;
  approverName?: string;
  organization: string;
  recentProjects?: RecentProjectItem[];
}

function createDefaultSettings(): AppSettings {
  return {
    colorScheme: 'dark',
    units: 'mm',
    gridDots: true,
    defaultAccuracyClass: 4,
    authorName: 'Иванов А.С.',
    checkerName: 'Петров В.И.',
    normControlName: 'Сидорова Е.К.',
    approverName: 'Козлов Д.А.',
    organization: 'АО «НИИ Приборостроения»',
    recentProjects: [
      { id: 'rec_rs485_schematic', name: 'Гальваническая развязка RS-485', designation: 'ГТРС.468364.001 Э3', module: 'schematic', updatedAt: 'Сегодня', demoKey: 'rs485' },
      { id: 'rec_rs485_pcb', name: 'Гальваническая развязка RS-485 (ПП 90×55)', designation: 'ГТРС.468364.001 ПП', module: 'pcb', updatedAt: 'Сегодня', demoKey: 'rs485' },
      { id: 'rec_mcu_schematic', name: 'Контроллер К1986ВЕ92QI + КР142ЕН5А', designation: 'ГТРС.468364.005 Э3', module: 'schematic', updatedAt: 'Вчера', demoKey: 'mcu' }
    ]
  };
}

/**
 * Loads persisted application settings merged with defaults.
 */
export function loadSettings(): AppSettings {
  const defaults = createDefaultSettings();
  const parsed = readStorageJson<Partial<AppSettings>>(STORAGE_KEYS.SETTINGS);
  return parsed ? { ...defaults, ...parsed } : defaults;
}

/**
 * Persists application settings to storage.
 */
export function saveSettings(s: AppSettings): void {
  writeStorageJson(STORAGE_KEYS.SETTINGS, s);
}

/** Saves a snapshot for a recent user project and prunes snapshots outside the 8-item recent list. */
export function saveRecentProjectSnapshot(id: string, snapshot: RecentProjectSnapshot, activeIds?: string[]): void {
  try {
    const map = readStorageJson<Record<string, RecentProjectSnapshot>>(STORAGE_KEYS.RECENT_SNAPSHOTS) ?? {};
    map[id] = snapshot;
    const keepIds = new Set(activeIds ?? (loadSettings().recentProjects ?? []).map((r) => r.id));
    keepIds.add(id);
    const pruned: Record<string, RecentProjectSnapshot> = {};
    for (const [k, v] of Object.entries(map)) {
      if (keepIds.has(k)) pruned[k] = v;
    }
    writeStorageJson(STORAGE_KEYS.RECENT_SNAPSHOTS, pruned);
  } catch {
    // Ignore storage quota overflow for large snapshots
  }
}

/** Loads a stored snapshot for a recent user project, if present. */
export function loadRecentProjectSnapshot(id: string): RecentProjectSnapshot | null {
  const map = readStorageJson<Record<string, RecentProjectSnapshot>>(STORAGE_KEYS.RECENT_SNAPSHOTS);
  return map?.[id] ?? null;
}

/**
 * Prepends an entry to the recent projects list (max 8 entries) and optionally stores its snapshot.
 */
export function recordRecentProject(
  item: Omit<RecentProjectItem, 'updatedAt'>,
  snapshot?: RecentProjectSnapshot
): void {
  const s = loadSettings();
  const nextItem: RecentProjectItem = {
    ...item,
    updatedAt: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  };
  const list = [
    nextItem,
    ...(s.recentProjects ?? []).filter((r) => {
      if (r.id === item.id) return false;
      if (item.demoKey && r.demoKey === item.demoKey && r.module === item.module) return false;
      if (!item.demoKey && r.name === item.name && r.module === item.module) return false;
      return true;
    })
  ].slice(0, 8);
  saveSettings({ ...s, recentProjects: list });
  if (snapshot) {
    saveRecentProjectSnapshot(
      item.id,
      snapshot,
      list.map((r) => r.id)
    );
  }
}
