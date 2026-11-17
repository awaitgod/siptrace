import type { ComponentDef, SchematicSheet, SchNetPort } from '../../../../core/models';
import { allIds, entityBounds, findEntity, type Bounds } from '../../../../core/schematic/editing';
import { labelBounds } from '../../../../core/schematic/componentLabels';
import { getGostFrameRect } from '../../../../gost/gostTitleBlock';

export function sheetWorkspace(sheet: SchematicSheet) {
  const frame = getGostFrameRect(sheet.format);
  const { titleBlock } = sheet;
  const reserved: { name: string; bounds: Bounds }[] = [];
  if (titleBlock.enabled && titleBlock.form !== 'None') {
    const height = { Form1: 55, Form2: 40, Form2a: 15 }[titleBlock.form];
    reserved.push({ name: 'основная надпись', bounds: {
      minX: frame.right - 185, maxX: frame.right, minY: frame.bottom - height, maxY: frame.bottom
    } });
  }
  if (titleBlock.enabled && titleBlock.showCornerStamp26) {
    reserved.push({ name: 'угловая графа', bounds: {
      minX: frame.left, maxX: frame.left + 70, minY: frame.top, maxY: frame.top + 14
    } });
  }
  return { frame, reserved };
}

export function portBounds(port: SchNetPort): Bounds {
  const { x, y, style } = port;
  const textWidth = port.netName.length * 1.55;
  if (style === 'Ground') return { minX: x - 2.6, maxX: x + (port.netName === 'GND' ? 2.6 : 3.4 + textWidth), minY: y, maxY: y + 5.7 };
  if (style === 'Power') return { minX: x - Math.max(2.4, textWidth / 2), maxX: x + Math.max(2.4, textWidth / 2), minY: y - 7.2, maxY: y };
  const extent = 9.5 + textWidth;
  const left = style === 'PortLeft' || style === 'OffPageIn';
  return { minX: left ? x - extent : x, maxX: left ? x : x + extent, minY: y - 1.8, maxY: y + 1.8 };
}

export function layoutIssue(bounds: Bounds, workspace: ReturnType<typeof sheetWorkspace>) {
  const { frame, reserved } = workspace;
  if (bounds.minX < frame.left || bounds.minY < frame.top || bounds.maxX > frame.right || bounds.maxY > frame.bottom) {
    return 'Объект за рабочей рамкой';
  }
  const collision = reserved.find(({bounds: area}) =>
    bounds.minX < area.maxX && bounds.maxX > area.minX && bounds.minY < area.maxY && bounds.maxY > area.minY);
  return collision && 'Объект занимает зарезервированную область: ' + collision.name;
}

export function checkSheetLayout(sheet: SchematicSheet, definitions: Record<string, ComponentDef>) {
  const workspace = sheetWorkspace(sheet);
  const objects = allIds(sheet).flatMap(id => {
    const hit = findEntity(sheet, id);
    if (hit?.kind === 'netPorts') return [{ id, bounds: portBounds(hit.object) }];
    if (hit?.kind === 'wires' || hit?.kind === 'buses') {
      const points: {x:number; y:number}[] = hit.object.points;
      return points.slice(1).map((point, index) => ({ id, bounds: {
        minX: Math.min(point.x, points[index].x), minY: Math.min(point.y, points[index].y),
        maxX: Math.max(point.x, points[index].x), maxY: Math.max(point.y, points[index].y)
      } }));
    }
    return [{ id, bounds: entityBounds(sheet, id, definitions) }];
  });
  for (const component of sheet.components) {
    const definition = definitions[component.componentDefId];
    if (component.showRefDes && !component.refDes.startsWith('#')) {
      objects.push({ id: 'refDes@' + component.id, bounds: labelBounds(component, 'refDes', definition) });
    }
    if (component.showValue) objects.push({ id: 'value@' + component.id, bounds: labelBounds(component, 'value', definition) });
  }
  const issues = new Map<string, string>();
  for (const {id, bounds} of objects) {
    const issue = layoutIssue(bounds, workspace);
    if (issue) issues.set(id, issue);
  }
  return [...issues].map(([id, issue]) => ({ sheet: sheet.id, id, issue }));
}
