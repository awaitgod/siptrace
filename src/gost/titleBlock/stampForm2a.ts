import { GostTitleBlockData } from '../../core/types';
import { FrameRect, TitleBlockLine, TitleBlockText } from './titleBlockTypes';

/** Appends GOST 2.104-2006 Form 2a (185x15mm) stamp geometry for subsequent sheets. */
export function appendForm2aStamp(
  frame: FrameRect,
  tb: GostTitleBlockData,
  lines: TitleBlockLine[],
  texts: TitleBlockText[]
): void {
  const stampW = 185;
  const x0 = frame.right - stampW;
  const h = 15;
  const y0 = frame.bottom - h;

  lines.push({ x1: x0, y1: y0, x2: frame.right, y2: y0, thick: true });
  lines.push({ x1: x0, y1: y0, x2: x0, y2: frame.bottom, thick: true });

  // Columns: 7 | 10 | 23 | 15 | 10 | 110 | 10 = 185
  const cols = [7, 10, 23, 15, 10, 110];
  let cx = x0;
  for (const cw of cols) {
    cx += cw;
    lines.push({ x1: cx, y1: y0, x2: cx, y2: frame.bottom, thick: true });
  }

  // Left 5 cols horizontal dividers every 5 mm (line above Изм/Лист/Докум/Подп/Дата headers is thick in ГОСТ)
  const leftBlockRight = x0 + 65;
  lines.push({ x1: x0, y1: y0 + 5, x2: leftBlockRight, y2: y0 + 5, thick: false });
  lines.push({ x1: x0, y1: y0 + 10, x2: leftBlockRight, y2: y0 + 10, thick: true });

  // Rightmost Лист cell horizontal divider at y0 + 7
  lines.push({ x1: frame.right - 10, y1: y0 + 7, x2: frame.right, y2: y0 + 7, thick: true });

  texts.push(
    { x: x0 + 3.5, y: y0 + 12.5, text: 'Изм', sizeMm: 2.3, align: 'center', italic: true },
    { x: x0 + 12, y: y0 + 12.5, text: 'Лист', sizeMm: 2.3, align: 'center', italic: true },
    { x: x0 + 28.5, y: y0 + 12.5, text: '№ докум.', sizeMm: 2.3, align: 'center', italic: true },
    { x: x0 + 47.5, y: y0 + 12.5, text: 'Подп.', sizeMm: 2.3, align: 'center', italic: true },
    { x: x0 + 60, y: y0 + 12.5, text: 'Дата', sizeMm: 2.3, align: 'center', italic: true },
    { x: x0 + 120, y: y0 + 7.5, text: tb.designation, sizeMm: 5.0, align: 'center', italic: true, maxWidthMm: 104 },
    { x: frame.right - 5, y: y0 + 3.5, text: 'Лист', sizeMm: 2.3, align: 'center', italic: true },
    { x: frame.right - 5, y: y0 + 11, text: String(tb.sheetNumber), sizeMm: 3.8, align: 'center', italic: true }
  );
}
