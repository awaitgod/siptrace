import type { z } from 'zod';
import type { RecentProjectSnapshot } from '../../../../core/store';
import { dist, polygonBounds } from '../../../../core/geometry';
import type { Point2D } from '../../../../core/models';
import type { commands } from './commands';

export type AgentTargets = z.output<typeof commands.set_targets>;

function samePolygon(actual: Point2D[], expected: Point2D[]): boolean {
  if (expected.length !== actual.length) return false;
  return actual.some((point, start) => dist(point, expected[0]) < 0.001 &&
    [1, -1].some(direction => expected.every((vertex, i) =>
      dist(vertex, actual[(start + direction * i + actual.length) % actual.length]) < 0.001)));
}

export function missingTargetFields(targets?: AgentTargets): string[] {
  if (!targets) return ['set_targets'];
  return [
    ...(targets.documents !== 'pcb' ? ['schematicRefs', 'schematicNets'].filter(
      field => targets[field as 'schematicRefs' | 'schematicNets'] === undefined) : []),
    ...(targets.documents !== 'schematic' ? ['boardRefs', 'boardNets', 'board'].filter(
      field => targets[field as 'boardRefs' | 'boardNets' | 'board'] === undefined) : [])
  ];
}

/** Within a run, adding specificity cannot remove or replace an accepted requirement. */
export function extendTargets(previous: AgentTargets, next: AgentTargets, locked: boolean): AgentTargets {
  function combine(before: unknown, after: unknown, path: string): unknown {
    if (after === undefined) return before;
    if (before === undefined) return after;
    if (before && after && typeof before === 'object' && typeof after === 'object' &&
      !Array.isArray(before) && !Array.isArray(after)) {
      const old = before as Record<string, unknown>;
      const update = after as Record<string, unknown>;
      return Object.fromEntries([...new Set([...Object.keys(old), ...Object.keys(update)])].map(
        key => [key, combine(old[key], update[key], path + '.' + key)]));
    }
    // Lists of sheet/position objects can be supplemented with fields in place.
    if (locked && Array.isArray(before) && Array.isArray(after) && before.length === after.length &&
      (path === 'targets.sheets' || path === 'targets.board.positions')) {
      return before.map((value, i) => combine(value, after[i], path + '[' + i + ']'));
    }
    if (locked && JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error('Требование уже зафиксировано: ' + path + '. Сохраните его или начните новое задание с изменением ТЗ.');
    }
    return after;
  }
  return combine(previous, next, 'targets') as AgentTargets;
}

export interface RequirementResult {
  requirement: string;
  expected: unknown;
  actual: unknown;
  pass: boolean;
}

export function evaluateRequirements(targets: AgentTargets | undefined, documents: RecentProjectSnapshot) {
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
      if (expected.refs) compare('Позиции листа ' + (index + 1), [...expected.refs].sort(),
        sheet?.components.filter(part => !part.refDes.startsWith('#')).map(part => part.refDes).sort());
      for (const port of expected.ports ?? []) {
        const actual = sheet?.netPorts.find(item => item.netName === port.net && (!port.style || item.style === port.style));
        compare('Порт ' + port.net + ' на листе ' + (index + 1), port, actual, Boolean(actual));
      }
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
    if (targets.board.outline) compare('Точный контур', targets.board.outline, pcb?.boardOutline,
      Boolean(pcb && samePolygon(pcb.boardOutline, targets.board.outline)));
    if (targets.board.cutouts) {
      compare('Число вырезов', targets.board.cutouts.length, pcb?.cutouts.length);
      targets.board.cutouts.forEach((points, index) => {
        const actual = pcb?.cutouts.find(cutout => samePolygon(cutout.points, points));
        compare('Вырез ' + (index + 1), points, actual?.points, Boolean(actual));
      });
    }
    if (targets.board.keepouts) compare('Число зон запрета', targets.board.keepouts.length, pcb?.keepouts.length);
    for (const [index, expected] of (targets.board.keepouts ?? []).entries()) {
      const actual = pcb?.keepouts.find(zone => zone.layer === expected.layer && zone.kind === expected.kind && samePolygon(zone.points, expected.points));
      compare('Зона запрета ' + (index + 1), expected, actual && { layer: actual.layer, kind: actual.kind, points: actual.points }, Boolean(actual));
    }
    if (targets.board.pours) compare('Число заливок', targets.board.pours.length, pcb?.copperPours.length);
    for (const expected of targets.board.pours ?? []) {
      const actual = pcb?.copperPours.find(pour => pour.netName === expected.net && pour.layer === expected.layer);
      compare('Заливка ' + expected.net, expected, actual && { net: actual.netName, layer: actual.layer, clearance: actual.clearance, poured: actual.poured },
        Boolean(actual?.poured && actual.computedIslands?.length &&
          (expected.clearance === undefined || actual.clearance >= expected.clearance) &&
          (!expected.outline || samePolygon(actual.outline, expected.outline))));
    }
    for (const position of targets.board.positions ?? []) {
      const item = pcb?.components.find(item => item.refDes === position.ref);
      const tolerance = position.tolerance ?? .01;
      compare('Положение ' + position.ref, { x: position.x, y: position.y, tolerance },
        item && { x: item.x, y: item.y }, Boolean(item && dist(item, position) <= tolerance + 0.000001));
      if (position.side !== undefined) compare('Сторона ' + position.ref, position.side, item?.side);
      if (position.angle !== undefined) compare('Угол ' + position.ref, position.angle, item?.angle,
        Boolean(item && Math.abs(((item.angle - position.angle) % 360 + 540) % 360 - 180) < 0.001));
      if (position.locked !== undefined) compare('Фиксация ' + position.ref, position.locked, item && Boolean(item.locked));
    }
    for (const [net, expected] of Object.entries(targets.board.routes ?? {})) {
      const traces = pcb?.traces.filter(trace => trace.netName === net) ?? [];
      const layers = [...new Set(traces.map(trace => trace.layer))];
      const widths = [...new Set(traces.map(trace => trace.width))];
      if (expected.width !== undefined) compare('Ширина ' + net, expected.width, widths,
        widths.length > 0 && widths.every(width => Math.abs(width - expected.width!) < 0.001));
      if (expected.minWidth !== undefined) compare('Минимальная ширина ' + net, expected.minWidth, widths,
        widths.length > 0 && widths.every(width => width + 0.001 >= expected.minWidth!));
      if (expected.allowedLayers) compare('Разрешённые слои ' + net, expected.allowedLayers, layers,
        layers.length > 0 && layers.every(layer => expected.allowedLayers!.includes(layer)));
      if (expected.requiredLayers) compare('Обязательные слои ' + net, expected.requiredLayers, layers,
        expected.requiredLayers.every(layer => layers.includes(layer)));
      if (expected.minVias !== undefined) {
        const count = pcb?.vias.filter(via => via.netName === net).length ?? 0;
        compare('Число via ' + net, expected.minVias, count, count >= expected.minVias);
      }
      const crossing = expected.crossing;
      if (crossing) {
        const crosses = traces.some(trace => trace.layer === crossing.layer &&
          trace.points.some(point => point[crossing.axis] < crossing.at) &&
          trace.points.some(point => point[crossing.axis] > crossing.at));
        compare('Пересечение ' + net, crossing, crosses, crosses);
      }
    }
  }
  return rows;
}
