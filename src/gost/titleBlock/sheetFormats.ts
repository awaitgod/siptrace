import { SheetFormatId } from '../../core/types';
import { FrameRect, SheetDimensions } from './titleBlockTypes';

export const SHEET_FORMATS: Record<SheetFormatId, SheetDimensions> = {
  A4_P: { widthMm: 210, heightMm: 297, label: 'А4 (210 × 297 мм, книжный)' },
  A4_L: { widthMm: 297, heightMm: 210, label: 'А4 (297 × 210 мм, альбомный)' },
  A3_L: { widthMm: 420, heightMm: 297, label: 'А3 (420 × 297 мм, альбомный)' },
  A2_L: { widthMm: 594, heightMm: 420, label: 'А2 (594 × 420 мм, альбомный)' },
  A1_L: { widthMm: 841, heightMm: 594, label: 'А1 (841 × 594 мм, альбомный)' },
  A0_L: { widthMm: 1189, heightMm: 841, label: 'А0 (1189 × 841 мм, альбомный)' }
};

/** Computes inner frame margins per GOST 2.301-68: 20mm left, 5mm other edges. */
export function getGostFrameRect(format: SheetFormatId): FrameRect {
  const dim = SHEET_FORMATS[format];
  const left = 20;
  const top = 5;
  const right = dim.widthMm - 5;
  const bottom = dim.heightMm - 5;
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}
