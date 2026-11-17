import type { z } from 'zod';
import type { RecentProjectSnapshot } from '../../../../core/store';
import { polygonBounds } from '../../../../core/geometry';
import type { commands } from './commands';

export interface RequirementResult {
  requirement: string;
  expected: unknown;
  actual: unknown;
  pass: boolean;
}

export function evaluateRequirements(targets: z.output<typeof commands.set_targets> | undefined, documents: RecentProjectSnapshot) {
  const rows: RequirementResult[] = [];
  if (!targets) return rows;
  const sch = documents.schematic;
  const pcb = documents.pcb;
  const compare = (requirement: string, expected: unknown, actual: unknown, pass = JSON.stringify(expected) === JSON.stringify(actual)) =>
    rows.push({ requirement, expected, actual: actual ?? null, pass });
  if (targets.designation) {
    for (const [index, sheet] of (sch?.sheets ?? []).entries()) {
      compare('Обозначение листа ' + (index + 1), targets.designation, sheet.titleBlock.designation);
      compare('Номер листа ' + (index + 1), index + 1, sheet.titleBlock.sheetNumber);
      compare('Всего листов', sch!.sheets.length, sheet.titleBlock.totalSheets);
    }
  }
  if (targets.sheets) {
    compare('Число листов', targets.sheets.length, sch?.sheets.length);
    targets.sheets.forEach((expected, index) => {
      const sheet = sch?.sheets[index];
      compare('Название листа ' + (index + 1), expected.name, sheet?.name);
      if (expected.format) compare('Формат листа ' + (index + 1), expected.format, sheet?.format);
      if (expected.form) compare('Форма листа ' + (index + 1), expected.form, sheet?.titleBlock.form);
    });
  }
  for (const [ref, value] of Object.entries(targets.values ?? {})) {
    const parts = sch?.sheets.flatMap(sheet => sheet.components.filter(item => item.refDes === ref)) ?? [];
    compare('Номинал ' + ref, value, parts[0]?.value, parts.length > 0 && parts.every(part => part.value === value));
  }
  if (targets.board) {
    const bounds = pcb?.boardOutline.length ? polygonBounds(pcb.boardOutline) : undefined;
    const width = bounds && bounds.maxX - bounds.minX;
    const height = bounds && bounds.maxY - bounds.minY;
    compare('Ширина платы', targets.board.width, width, width !== undefined && Math.abs(width - targets.board.width) < .001);
    compare('Высота платы', targets.board.height, height, height !== undefined && Math.abs(height - targets.board.height) < .001);
    compare('Слои платы', targets.board.layers, pcb?.layerCount);
    if (targets.board.clearance !== undefined) {
      const clearance = pcb && Math.min(pcb.designRules.clearanceTraceToTrace, pcb.designRules.clearanceTraceToPad,
        pcb.designRules.clearancePadToPad, pcb.designRules.clearanceViaToAny);
      compare('Минимальный зазор', targets.board.clearance, clearance, clearance !== undefined && clearance >= targets.board.clearance);
    }
    const pointKey = (points: { x: number; y: number }[]) => points.map(p => p.x + ',' + p.y).sort().join(';');
    for (const [index, expected] of (targets.board.keepouts ?? []).entries()) {
      const actual = pcb?.keepouts.find(zone => zone.layer === expected.layer && zone.kind === expected.kind && pointKey(zone.points) === pointKey(expected.points));
      compare('Зона запрета ' + (index + 1), expected, actual && { layer: actual.layer, kind: actual.kind, points: actual.points }, Boolean(actual));
    }
    for (const expected of targets.board.pours ?? []) {
      const actual = pcb?.copperPours.find(pour => pour.netName === expected.net && pour.layer === expected.layer);
      compare('Заливка ' + expected.net, expected, actual && { net: actual.netName, layer: actual.layer, clearance: actual.clearance, poured: actual.poured },
        Boolean(actual?.poured && (expected.clearance === undefined || actual.clearance >= expected.clearance)));
    }
    for (const position of targets.board.positions ?? []) {
      const item = pcb?.components.find(item => item.refDes === position.ref);
      const tolerance = position.tolerance ?? .01;
      compare('Положение ' + position.ref, { x: position.x, y: position.y, tolerance },
        item && { x: item.x, y: item.y }, Boolean(item && Math.abs(item.x - position.x) <= tolerance && Math.abs(item.y - position.y) <= tolerance));
    }
  }
  return rows;
}
