import { ComponentDef, PinElectricalType, PinGraphicStyle, PinOrientation, SymbolPin } from '../../../core/types';
import { uid } from '../../../core/geometry';

export interface RangePinParams {
  rangeExpr: string;
  electricalType: PinElectricalType;
  style: PinGraphicStyle;
  orientation: PinOrientation;
  startNumber?: number;
  startX?: number;
  startY?: number;
  stepY?: number;
}

/**
 * Parses pin range expressions like 'D0..D7', 'D[0..7]', 'A0-A15', 'GPIO0..GPIO3'.
 * Returns an array of pin names.
 */
export function parsePinRange(expr: string): string[] {
  const trimmed = expr.trim();
  if (!trimmed) return [];

  // Format: Name[0..7] or Name[0:7]
  const bracketMatch = trimmed.match(/^([A-Za-z0-9_]+)\[(\d+)(?:\.\.|\:|-)(\d+)\]$/);
  if (bracketMatch) {
    const prefix = bracketMatch[1];
    const start = parseInt(bracketMatch[2], 10);
    const end = parseInt(bracketMatch[3], 10);
    return generateNames(prefix, start, end);
  }

  // Format: D0..D7 or DATA0..DATA15 or D0-D7
  const dotMatch = trimmed.match(/^([A-Za-z_]+)(\d+)(?:\.\.|\.\.\.|\-)([A-Za-z_]*)(\d+)$/);
  if (dotMatch) {
    const prefix = dotMatch[1];
    const start = parseInt(dotMatch[2], 10);
    const end = parseInt(dotMatch[4], 10);
    return generateNames(prefix, start, end);
  }

  // Format: Comma separated list like D0, D1, D2
  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Single pin name
  return [trimmed];
}

function generateNames(prefix: string, start: number, end: number): string[] {
  const names: string[] = [];
  const step = start <= end ? 1 : -1;
  const count = Math.abs(end - start) + 1;
  const safeCount = Math.min(count, 256); // Prevent excessive loops

  let cur = start;
  for (let i = 0; i < safeCount; i++) {
    names.push(`${prefix}${cur}`);
    cur += step;
  }
  return names;
}

/**
 * Sorts pins by number (natural numeric), name, or Y coordinate.
 */
export function sortPins(pins: SymbolPin[], criterion: 'number' | 'name' | 'y'): SymbolPin[] {
  const copy = [...pins];
  if (criterion === 'number') {
    return copy.sort((a, b) => {
      const numA = parseInt(a.number, 10);
      const numB = parseInt(b.number, 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        if (numA !== numB) return numA - numB;
      }
      return a.number.localeCompare(b.number, undefined, { numeric: true, sensitivity: 'base' });
    });
  } else if (criterion === 'name') {
    return copy.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
  } else {
    // Sort by Y coordinate (top to bottom)
    return copy.sort((a, b) => a.y - b.y || a.x - b.x);
  }
}

/**
 * Renumbers an array of pins sequentially starting from startNumber.
 */
export function renumberPins(pins: SymbolPin[], startNumber = 1): SymbolPin[] {
  return pins.map((pin, index) => {
    const num = String(startNumber + index);
    return {
      ...pin,
      number: num,
      padMapping: num
    };
  });
}

/**
 * Finds all pin numbers that are duplicated across the component's parts.
 */
export function findDuplicatePinNumbers(component: ComponentDef): Set<string> {
  const counts = new Map<string, number>();
  for (const part of component.parts) {
    for (const pin of part.pins) {
      const n = pin.number.trim();
      if (!n) continue;
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
  }

  const duplicates = new Set<string>();
  for (const [num, count] of counts.entries()) {
    if (count > 1) duplicates.add(num);
  }
  return duplicates;
}

/**
 * Generates an array of SymbolPins from range parameters, snapped to 2.5mm grid.
 */
export function generateRangePins(params: RangePinParams): SymbolPin[] {
  const names = parsePinRange(params.rangeExpr);
  if (names.length === 0) return [];

  const startNum = params.startNumber ?? 1;
  const startX = params.startX ?? (params.orientation === 0 ? -12.5 : 12.5);
  const startY = params.startY ?? -Math.floor(names.length / 2) * 5;
  const stepY = params.stepY ?? 5.0; // 5 mm step per GOST 2.743-91

  const snap25 = (v: number) => Math.round(v / 2.5) * 2.5;

  return names.map((name, i) => {
    const num = String(startNum + i);
    const py = snap25(startY + i * stepY);
    const px = snap25(startX);
    return {
      id: uid('pin_rng'),
      number: num,
      name,
      x: px,
      y: py,
      length: 5,
      orientation: params.orientation,
      electricalType: params.electricalType,
      style: params.style,
      showName: true,
      showNumber: true,
      padMapping: num
    };
  });
}
