import { BomEntry, SchematicProject } from '../../core/types';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Exports a GOST 2.701-2008 / 2.106-96 ПЭ3 printable HTML sheet. */
export function exportGostBomToHtml(project: SchematicProject, entries: BomEntry[]): string {
  const tb = project.sheets[0]?.titleBlock;
  const grouped = new Map<string, BomEntry[]>();
  for (const e of entries) {
    if (!grouped.has(e.groupTitle)) grouped.set(e.groupTitle, []);
    grouped.get(e.groupTitle)!.push(e);
  }

  let rowsHtml = '';
  let groupIdx = 0;
  for (const [group, list] of grouped) {
    if (groupIdx > 0) {
      rowsHtml += `<tr><td></td><td></td><td></td><td></td></tr>`;
    }
    groupIdx++;
    rowsHtml += `<tr class="group-row"><td></td><td style="text-align:center;text-decoration:underline;font-weight:600">${escapeHtml(group)}</td><td></td><td></td></tr>`;
    for (const e of list) {
      rowsHtml += `<tr>
        <td style="text-align:center">${escapeHtml(e.refDesList)}</td>
        <td>${escapeHtml(e.name)}</td>
        <td style="text-align:center">${e.quantity}</td>
        <td>${escapeHtml(e.note)}</td>
      </tr>`;
    }
  }
  rowsHtml += `<tr><td></td><td></td><td></td><td></td></tr>`;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<title>Перечень элементов — ${escapeHtml(tb?.designation ?? project.projectName)}</title>
<style>
  body { font-family: "GOST type B", "ISOCPEUR", "Segoe UI", Arial, sans-serif; margin: 20px; color: #000; }
  .sheet { width: 185mm; margin: auto; border: 2px solid #000; padding: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #000; padding: 3px 6px; height: 8mm; }
  th { font-weight: 600; text-align: center; background: #f8f8f8; }
  .stamp { border-top: 2px solid #000; padding: 6px 10px; display: flex; justify-content: space-between; font-size: 12px; }
</style>
</head>
<body>
<div class="sheet">
  <table>
    <thead>
      <tr>
        <th style="width:20mm">Поз. обозначение</th>
        <th style="width:110mm">Наименование</th>
        <th style="width:10mm">Кол.</th>
        <th style="width:45mm">Примечание</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <div class="stamp">
    <div><b>${escapeHtml(tb?.name ?? project.projectName)}</b> — Перечень элементов (ГОСТ 2.701-2008 / 2.106-96)</div>
    <div><b>${escapeHtml((tb?.designation ?? '').replace('Э3', 'ПЭ3'))}</b></div>
  </div>
</div>
</body>
</html>`;
}
