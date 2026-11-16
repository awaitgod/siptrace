import { GostTitleBlockData, SheetFormatId } from '../../core/types';
import { getGostFrameRect } from './sheetFormats';
import { appendOuterSheetBorder, appendInnerFrameAndZones } from './frameGeometry';
import { appendForm2aStamp } from './stampForm2a';
import { appendForm1Or2Stamp } from './stampForm1And2';
import { TitleBlockGeometry, TitleBlockLine, TitleBlockText } from './titleBlockTypes';

export type {
  SheetDimensions,
  FrameRect,
  TitleBlockLine,
  TitleBlockText,
  TitleBlockGeometry
} from './titleBlockTypes';
export { SHEET_FORMATS, getGostFrameRect } from './sheetFormats';
export { createDefaultGostTitleBlock } from './titleBlockDefaults';

/** Builds exact GOST 2.104-2006 Form 1 (185x55), Form 2 (185x40), Form 2a (185x15), and Corner Stamp 26 (70x14). */
export function buildGostFrameAndStampGeometry(
  format: SheetFormatId,
  tb: GostTitleBlockData
): TitleBlockGeometry {
  const frame = getGostFrameRect(format);
  const lines: TitleBlockLine[] = [];
  const texts: TitleBlockText[] = [];

  appendOuterSheetBorder(format, lines);

  if (!tb.enabled) {
    return { lines, texts };
  }

  appendInnerFrameAndZones(format, frame, tb, lines, texts);

  if (tb.form === 'None') {
    return { lines, texts };
  }

  if (tb.form === 'Form2a') {
    appendForm2aStamp(frame, tb, lines, texts);
    return { lines, texts };
  }

  appendForm1Or2Stamp(frame, tb, lines, texts);
  return { lines, texts };
}
