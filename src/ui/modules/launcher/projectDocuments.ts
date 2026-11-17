import type { RecentProjectItem, RecentProjectSnapshot } from '../../../core/store';
import { loadRecentProjectSnapshot } from '../../../core/store';
import { createDemoMcuGostSchematic, createDemoRs485GostSchematic, createDemoRs485Pcb } from '../../../gost/demo';

import { convertSchematicToPcb } from '../../../engines/netlist/schematicToPcbConverter';

export function getProjectDocuments(project: RecentProjectItem): RecentProjectSnapshot {
  const saved = loadRecentProjectSnapshot(project.id);
  if (saved) return saved;
  if (project.demoKey === 'rs485') {
    return { schematic: createDemoRs485GostSchematic(), pcb: createDemoRs485Pcb() };
  }
  if (project.demoKey === 'mcu') {
    const schematic = createDemoMcuGostSchematic();
    return project.module === 'schematic' ? { schematic } : { schematic, pcb: convertSchematicToPcb(schematic) };
  }
  return {};
}

export function formatProjectDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}
