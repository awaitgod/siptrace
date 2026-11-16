import { PcbProject, SchematicProject } from '../../core/types';
import { importCadPcbSync, importCadSchematicSync } from './universalImporter';

export function serializeSchematic(project: SchematicProject): string {
  return JSON.stringify(
    {
      ...project,
      modifiedAt: new Date().toISOString()
    },
    null,
    2
  );
}

export function deserializeSchematic(content: string, filename?: string): SchematicProject {
  const res = importCadSchematicSync(content, filename);
  if (!res.project || !Array.isArray(res.project.sheets)) {
    throw new Error('Некорректный формат файла схемы ГОСТ-Трейс (.gostsch).');
  }
  return res.project;
}

export function serializePcb(project: PcbProject): string {
  return JSON.stringify(
    {
      ...project,
      modifiedAt: new Date().toISOString()
    },
    null,
    2
  );
}

export function deserializePcb(content: string, filename?: string): PcbProject {
  const res = importCadPcbSync(content, filename);
  if (!res.pcb || !Array.isArray(res.pcb.components)) {
    throw new Error('Некорректный формат файла платы ГОСТ-Трейс (.gostpcb).');
  }
  return res.pcb;
}
