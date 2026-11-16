import { GostTitleBlockData, SheetFormatId } from '../../core/types';
import { SHEET_FORMATS } from './sheetFormats';
import { FrameRect, TitleBlockLine, TitleBlockText } from './titleBlockTypes';

/** Appends outer sheet border geometry. */
export function appendOuterSheetBorder(format: SheetFormatId, lines: TitleBlockLine[]): void {
  const dim = SHEET_FORMATS[format];
  lines.push(
    { x1: 0, y1: 0, x2: dim.widthMm, y2: 0, thick: false },
    { x1: dim.widthMm, y1: 0, x2: dim.widthMm, y2: dim.heightMm, thick: false },
    { x1: dim.widthMm, y1: dim.heightMm, x2: 0, y2: dim.heightMm, thick: false },
    { x1: 0, y1: dim.heightMm, x2: 0, y2: 0, thick: false }
  );
}

/** Appends main inner frame and optional GOST 2.301-68 coordinate zones along margins. */
export function appendInnerFrameAndZones(
  format: SheetFormatId,
  frame: FrameRect,
  tb: GostTitleBlockData,
  lines: TitleBlockLine[],
  texts: TitleBlockText[]
): void {
  const dim = SHEET_FORMATS[format];

  // Main inner frame (thick, 20mm left, 5mm other sides)
  lines.push(
    { x1: frame.left, y1: frame.top, x2: frame.right, y2: frame.top, thick: true },
    { x1: frame.right, y1: frame.top, x2: frame.right, y2: frame.bottom, thick: true },
    { x1: frame.right, y1: frame.bottom, x2: frame.left, y2: frame.bottom, thick: true },
    { x1: frame.left, y1: frame.bottom, x2: frame.left, y2: frame.top, thick: true }
  );

  // Optional coordinate zones along margins (ГОСТ 2.104-2006 п. 5.4: Latin letters bottom-to-top, digits right-to-left)
  if (tb.showZones) {
    const colCount = format === 'A4_P' ? 4 : format === 'A4_L' || format === 'A3_L' ? 8 : 12;
    const rowCount = format === 'A4_P' ? 6 : 4;
    const colW = frame.width / colCount;
    const rowH = frame.height / rowCount;
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M'];
    const leftZoneX = frame.left - 5;
    // Close outer boundary of left coordinate zone strip
    lines.push({ x1: leftZoneX, y1: 0, x2: leftZoneX, y2: dim.heightMm, thick: false });
    lines.push({ x1: leftZoneX, y1: frame.top, x2: frame.left, y2: frame.top, thick: false });
    lines.push({ x1: leftZoneX, y1: frame.bottom, x2: frame.left, y2: frame.bottom, thick: false });

    for (let i = 1; i < colCount; i++) {
      const zx = frame.left + i * colW;
      lines.push({ x1: zx, y1: 0, x2: zx, y2: frame.top, thick: false });
      lines.push({ x1: zx, y1: frame.bottom, x2: zx, y2: dim.heightMm, thick: false });
    }
    for (let i = 0; i < colCount; i++) {
      const cx = frame.left + (i + 0.5) * colW;
      const colLabel = String(colCount - i);
      texts.push({ x: cx, y: 2.6, text: colLabel, sizeMm: 2.8, align: 'center', italic: true });
      texts.push({ x: cx, y: dim.heightMm - 2.4, text: colLabel, sizeMm: 2.8, align: 'center', italic: true });
    }
    for (let j = 1; j < rowCount; j++) {
      const zy = frame.top + j * rowH;
      lines.push({ x1: leftZoneX, y1: zy, x2: frame.left, y2: zy, thick: false });
      lines.push({ x1: frame.right, y1: zy, x2: dim.widthMm, y2: zy, thick: false });
    }
    for (let j = 0; j < rowCount; j++) {
      const cy = frame.top + (j + 0.5) * rowH;
      const lbl = letters[rowCount - 1 - j] ?? String(rowCount - j);
      texts.push({ x: leftZoneX + 2.5, y: cy, text: lbl, sizeMm: 2.8, align: 'center', italic: true });
      texts.push({ x: dim.widthMm - 2.5, y: cy, text: lbl, sizeMm: 2.8, align: 'center', italic: true });
    }
  }

  // Графа 26 (70 x 14 mm in top-left corner of frame, rotated 180 deg per ГОСТ 2.104-2006 п. 6.3)
  if (tb.showCornerStamp26) {
    const gx = frame.left;
    const gy = frame.top;
    lines.push(
      { x1: gx, y1: gy + 14, x2: gx + 70, y2: gy + 14, thick: true },
      { x1: gx + 70, y1: gy, x2: gx + 70, y2: gy + 14, thick: true }
    );
    texts.push({
      x: gx + 35,
      y: gy + 7,
      text: tb.designation,
      sizeMm: 4.5,
      align: 'center',
      italic: true,
      rotateDeg: 180,
      maxWidthMm: 66
    });
  }
}
