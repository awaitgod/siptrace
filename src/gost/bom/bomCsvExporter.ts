import { BomEntry } from '../../core/types';

export interface BomCsvExportOptions {
  format?: 'standard' | '1c_erp';
}

/** Exports a GOST BOM list as semicolon-delimited UTF-8 BOM CSV. */
export function exportGostBomToCsv(entries: BomEntry[], options?: BomCsvExportOptions): string {
  if (options?.format === '1c_erp') {
    const header = 'Позиция;Наименование;Количество;Единица;Примечание;Группа;Корпус;Стандарт_ГОСТ\n';
    const rows = entries.map(
      (e) =>
        `"${e.refDesList}";"${e.name.replace(/"/g, '""')}";${e.quantity};"шт.";"${e.note.replace(/"/g, '""')}";"${e.groupTitle}";"${e.pattern ?? ''}";"${e.gostStandard ?? ''}"`
    );
    return '\uFEFF' + header + rows.join('\n');
  }

  const header = 'Поз. обозначение;Наименование;Кол.;Примечание;Группа;Корпус\n';
  const rows = entries.map(
    (e) =>
      `"${e.refDesList}";"${e.name.replace(/"/g, '""')}";${e.quantity};"${e.note.replace(/"/g, '""')}";"${e.groupTitle}";"${e.pattern ?? ''}"`
  );
  return '\uFEFF' + header + rows.join('\n');
}
