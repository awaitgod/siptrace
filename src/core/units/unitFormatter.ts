import { Units } from '../models';

/**
 * Formats a coordinate in millimeters into the active display units using localized decimal comma.
 */
export function formatCoord(mm: number, units: Units, decimals?: number): string {
  if (units === 'mm') {
    const d = decimals ?? 2;
    return `${mm.toFixed(d).replace('.', ',')} мм`;
  }
  if (units === 'in') {
    const d = decimals ?? 3;
    return `${(mm / 25.4).toFixed(d).replace('.', ',')} in`;
  }
  const d = decimals ?? 1;
  return `${(mm / 0.0254).toFixed(d).replace('.', ',')} mil`;
}

/**
 * Formats a grid pitch value in millimeters into display units.
 */
export function formatGridValue(mm: number, units: Units): string {
  if (units === 'mm') {
    return `${Number(mm.toFixed(3)).toString().replace('.', ',')} мм`;
  }
  if (units === 'in') {
    return `${Number((mm / 25.4).toFixed(4)).toString().replace('.', ',')} in`;
  }
  return `${Number((mm / 0.0254).toFixed(2)).toString().replace('.', ',')} mil`;
}
