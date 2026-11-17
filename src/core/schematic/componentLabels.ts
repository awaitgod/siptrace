import type { ComponentDef, PlacedComponent, SchematicSheet } from '../models';
import { transformPoint } from '../geometry';
import { entityBounds, type Bounds } from './editing';

export function labelBounds(component: PlacedComponent, field: 'refDes' | 'value', definition?: ComponentDef): Bounds {
  const offset = field === 'refDes' ? component.refDesOffset : component.valueOffset;
  const suffix = field === 'refDes' && definition && definition.parts.length > 1 ? '.' + component.partIndex : '';
  const text = component[field] + suffix + (field === 'value' && component.doNotMount ? ' (Н/М)' : '');
  const size = field === 'refDes' ? 3 : 2.6;
  const halfWidth = Math.max(1, text.length) * size * .34;
  const halfHeight = size * .65;
  const corners = [
    { x: -halfWidth, y: -halfHeight }, { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight }, { x: -halfWidth, y: halfHeight }
  ].map(point => transformPoint(point.x, point.y, component.x + offset.x, component.y + offset.y, component.labelAngle ?? 0));
  return {
    minX: Math.min(...corners.map(point => point.x)), maxX: Math.max(...corners.map(point => point.x)),
    minY: Math.min(...corners.map(point => point.y)), maxY: Math.max(...corners.map(point => point.y))
  };
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

export function defaultComponentLabels(component: PlacedComponent, definition: ComponentDef) {
  const sheet = { components: [component] } as SchematicSheet;
  const bounds = entityBounds(sheet, component.id, { [definition.id]: definition });
  const x = (bounds.minX + bounds.maxX) / 2 - component.x;
  return {
    refDesOffset: { x, y: bounds.minY - component.y - 4 },
    valueOffset: { x, y: bounds.maxY - component.y + 4 },
    labelAngle: 0
  };
}

/** Conservative text boxes match the font sizes and world-space offsets used by the renderer. */
export function findLabelOverlaps(sheet: SchematicSheet, definitions: Record<string, ComponentDef>) {
  const labels = sheet.components.flatMap(component =>
    (['refDes', 'value'] as const).filter(field =>
      field === 'refDes' ? component.showRefDes && component.refDes && !component.refDes.startsWith('#') : component.showValue && component.value
    ).map(field => ({ id: field + '@' + component.id, ref: component.refDes, field,
      bounds: labelBounds(component, field, definitions[component.componentDefId]) })));
  const issues: { label: string; ref: string; obstacle: string }[] = [];
  for (let index = 0; index < labels.length; index++) {
    const label = labels[index];
    for (const other of labels.slice(index + 1)) {
      if (overlaps(label.bounds, other.bounds)) issues.push({ label: label.id, ref: label.ref, obstacle: other.id });
    }
    for (const component of sheet.components) {
      if (overlaps(label.bounds, entityBounds(sheet, component.id, definitions))) {
        issues.push({ label: label.id, ref: label.ref, obstacle: component.id });
      }
    }
  }
  return issues;
}
