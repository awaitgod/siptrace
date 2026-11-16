import { BomEntry } from '../../core/types';

/** Exports a GOST BOM list as semicolon-delimited UTF-8 BOM CSV. */
export function exportGostBomToCsv(entries: BomEntry[]): string {
  const header = 'Поз. обозначение;Наименование;Кол.;Примечание;Группа;Корпус\n';
  const rows = entries.map(
    (e) =>
      `"${e.refDesList}";"${e.name.replace(/"/g, '""')}";${e.quantity};"${e.note.replace(/"/g, '""')}";"${e.groupTitle}";"${e.pattern ?? ''}"`
  );
  return '\uFEFF' + header + rows.join('\n');
}
