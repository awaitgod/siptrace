import { GostTitleBlockData } from '../../core/types';
import { FrameRect, TitleBlockLine, TitleBlockText } from './titleBlockTypes';

/** Appends GOST 2.104-2006 Form 1 (185x55mm) or Form 2 (185x40mm) title block geometry. */
export function appendForm1Or2Stamp(
  frame: FrameRect,
  tb: GostTitleBlockData,
  lines: TitleBlockLine[],
  texts: TitleBlockText[]
): void {
  const stampW = 185;
  const x0 = frame.right - stampW;
  const stampH = tb.form === 'Form2' ? 40 : 55;
  const y0 = frame.bottom - stampH;

  // Outer stamp top & left border
  lines.push(
    { x1: x0, y1: y0, x2: frame.right, y2: y0, thick: true },
    { x1: x0, y1: y0, x2: x0, y2: frame.bottom, thick: true }
  );

  const x65 = x0 + 65;
  const x135 = x0 + 135; // 70mm right of x65

  // Vertical divider between left 65mm block and right 120mm block
  lines.push({ x1: x65, y1: y0, x2: x65, y2: frame.bottom, thick: true });

  // Horizontal divider separating Изм block from Разраб block
  const izmsRows = tb.form === 'Form2' ? 3 : 5;
  const devRows = tb.form === 'Form2' ? 5 : 6;
  const ySplitLeft = y0 + izmsRows * 5;

  lines.push({ x1: x0, y1: ySplitLeft, x2: x65, y2: ySplitLeft, thick: true });

  // Left top block columns: 7, 10, 23, 15, 10
  const topLeftCols = [7, 10, 23, 15];
  let lx = x0;
  for (const w of topLeftCols) {
    lx += w;
    lines.push({ x1: lx, y1: y0, x2: lx, y2: ySplitLeft, thick: true });
  }
  for (let r = 1; r < izmsRows; r++) {
    lines.push({
      x1: x0,
      y1: y0 + r * 5,
      x2: x65,
      y2: y0 + r * 5,
      thick: r === izmsRows - 1 // line above headers is thick in ГОСТ
    });
  }

  // Left bottom block columns: 17, 23, 15, 10
  const botLeftCols = [17, 23, 15];
  lx = x0;
  for (const w of botLeftCols) {
    lx += w;
    lines.push({ x1: lx, y1: ySplitLeft, x2: lx, y2: frame.bottom, thick: true });
  }
  for (let r = 1; r < devRows; r++) {
    lines.push({
      x1: x0,
      y1: ySplitLeft + r * 5,
      x2: x65,
      y2: ySplitLeft + r * 5,
      thick: false
    });
  }

  // Right 120mm block
  const yRightTop = y0 + 15;
  lines.push({ x1: x65, y1: yRightTop, x2: frame.right, y2: yRightTop, thick: true });
  lines.push({ x1: x135, y1: yRightTop, x2: x135, y2: frame.bottom, thick: true });

  const isForm2 = tb.form === 'Form2';
  // Inside right 50mm block (Form 1: Lit/Mass/Scale 17mm + Sheet 8mm + Org 15mm; Form 2: Lit/Sheet/Sheets 15mm + Org 10mm)
  const yLitHead = yRightTop + 5;
  const yLitBot = isForm2 ? frame.bottom - 10 : yRightTop + 17;
  const ySheetBot = isForm2 ? yLitBot : frame.bottom - 15;
  lines.push(
    { x1: x135, y1: yLitHead, x2: frame.right, y2: yLitHead, thick: true },
    { x1: x135, y1: yLitBot, x2: frame.right, y2: yLitBot, thick: true }
  );
  if (!isForm2) {
    lines.push({ x1: x135, y1: ySheetBot, x2: frame.right, y2: ySheetBot, thick: true });
  }

  // Right small column verticals
  if (isForm2) {
    // Form 2 (185x40): Лит. (15) | Лист (15) | Листов (20)
    lines.push(
      { x1: x135 + 15, y1: yRightTop, x2: x135 + 15, y2: yLitBot, thick: true },
      { x1: x135 + 30, y1: yRightTop, x2: x135 + 30, y2: yLitBot, thick: true },
      { x1: x135 + 5, y1: yLitHead, x2: x135 + 5, y2: yLitBot, thick: false },
      { x1: x135 + 10, y1: yLitHead, x2: x135 + 10, y2: yLitBot, thick: false }
    );
  } else {
    // Form 1 (185x55): Лит. (15) | Масса (17) | Масштаб (18) + Лист (20) | Листов (30)
    lines.push(
      { x1: x135 + 15, y1: yRightTop, x2: x135 + 15, y2: yLitBot, thick: true },
      { x1: x135 + 32, y1: yRightTop, x2: x135 + 32, y2: yLitBot, thick: true },
      { x1: x135 + 5, y1: yLitHead, x2: x135 + 5, y2: yLitBot, thick: false },
      { x1: x135 + 10, y1: yLitHead, x2: x135 + 10, y2: yLitBot, thick: false },
      { x1: x135 + 20, y1: yLitBot, x2: x135 + 20, y2: ySheetBot, thick: true }
    );
  }

  // Texts for left top headers
  const yHdr = ySplitLeft - 2.5;
  texts.push(
    { x: x0 + 3.5, y: yHdr, text: 'Изм', sizeMm: 2.3, align: 'center', italic: true },
    { x: x0 + 12, y: yHdr, text: 'Лист', sizeMm: 2.3, align: 'center', italic: true },
    { x: x0 + 28.5, y: yHdr, text: '№ докум.', sizeMm: 2.3, align: 'center', italic: true },
    { x: x0 + 47.5, y: yHdr, text: 'Подп.', sizeMm: 2.3, align: 'center', italic: true },
    { x: x0 + 60, y: yHdr, text: 'Дата', sizeMm: 2.3, align: 'center', italic: true }
  );

  // Role rows
  const roles: [string, string][] =
    tb.form === 'Form2'
      ? [
          ['Разраб.', tb.developer],
          ['Пров.', tb.checker],
          ['', ''],
          ['Н. контр.', tb.normControl],
          ['Утв.', tb.approver]
        ]
      : [
          ['Разраб.', tb.developer],
          ['Пров.', tb.checker],
          ['Т. контр.', tb.techControl],
          ['', ''],
          ['Н. контр.', tb.normControl],
          ['Утв.', tb.approver]
        ];

  roles.forEach(([role, person], idx) => {
    const ry = ySplitLeft + idx * 5 + 2.5;
    if (role) {
      texts.push({ x: x0 + 1.2, y: ry, text: role, sizeMm: 2.4, align: 'left', italic: true });
    }
    if (person) {
      texts.push({ x: x0 + 18.2, y: ry, text: person, sizeMm: 2.4, align: 'left', italic: true, maxWidthMm: 21 });
    }
    if (idx === 0 && tb.date) {
      texts.push({ x: x0 + 60, y: ry, text: tb.date, sizeMm: 2.0, align: 'center', italic: true, maxWidthMm: 9.5 });
    }
  });

  // Designation (Графа 2)
  texts.push({
    x: x65 + 60,
    y: y0 + 7.5,
    text: tb.designation,
    sizeMm: 5.5,
    align: 'center',
    italic: true,
    bold: true,
    maxWidthMm: 114
  });

  // Name & SubName (Графа 1)
  const nameCenterY = (yRightTop + frame.bottom) / 2;
  if (tb.subName) {
    texts.push({
      x: x65 + 35,
      y: nameCenterY - 4.5,
      text: tb.name,
      sizeMm: 4.5,
      align: 'center',
      italic: true,
      maxWidthMm: 66
    });
    texts.push({
      x: x65 + 35,
      y: nameCenterY + 5.5,
      text: tb.subName,
      sizeMm: 3.4,
      align: 'center',
      italic: true,
      maxWidthMm: 66
    });
  } else {
    texts.push({
      x: x65 + 35,
      y: nameCenterY,
      text: tb.name,
      sizeMm: 4.8,
      align: 'center',
      italic: true,
      maxWidthMm: 66
    });
  }

  // Right small blocks
  if (isForm2) {
    texts.push(
      { x: x135 + 7.5, y: yRightTop + 2.5, text: 'Лит.', sizeMm: 2.3, align: 'center', italic: true },
      { x: x135 + 22.5, y: yRightTop + 2.5, text: 'Лист', sizeMm: 2.3, align: 'center', italic: true },
      { x: x135 + 40, y: yRightTop + 2.5, text: 'Листов', sizeMm: 2.3, align: 'center', italic: true },
      { x: x135 + 2.5, y: (yLitHead + yLitBot) / 2, text: tb.litera, sizeMm: 3.2, align: 'center', italic: true },
      ...(tb.totalSheets > 1
        ? [{ x: x135 + 22.5, y: (yLitHead + yLitBot) / 2, text: String(tb.sheetNumber), sizeMm: 3.0, align: 'center' as const, italic: true }]
        : []),
      { x: x135 + 40, y: (yLitHead + yLitBot) / 2, text: String(tb.totalSheets), sizeMm: 3.0, align: 'center', italic: true },
      {
        x: x135 + 25,
        y: (yLitBot + frame.bottom) / 2,
        text: tb.organization,
        sizeMm: 3.2,
        align: 'center',
        italic: true,
        maxWidthMm: 46
      }
    );
  } else {
    texts.push(
      { x: x135 + 7.5, y: yRightTop + 2.5, text: 'Лит.', sizeMm: 2.3, align: 'center', italic: true },
      { x: x135 + 23.5, y: yRightTop + 2.5, text: 'Масса', sizeMm: 2.3, align: 'center', italic: true },
      { x: x135 + 41, y: yRightTop + 2.5, text: 'Масштаб', sizeMm: 2.3, align: 'center', italic: true },
      { x: x135 + 2.5, y: (yLitHead + yLitBot) / 2, text: tb.litera, sizeMm: 3.2, align: 'center', italic: true },
      { x: x135 + 23.5, y: (yLitHead + yLitBot) / 2, text: tb.mass, sizeMm: 3.0, align: 'center', italic: true },
      { x: x135 + 41, y: (yLitHead + yLitBot) / 2, text: tb.scale, sizeMm: 3.0, align: 'center', italic: true },
      ...(tb.totalSheets > 1
        ? [{
            x: x135 + 10,
            y: (yLitBot + ySheetBot) / 2,
            text: `Лист ${tb.sheetNumber}`,
            sizeMm: 2.6,
            align: 'center' as const,
            italic: true
          }]
        : [{
            x: x135 + 10,
            y: (yLitBot + ySheetBot) / 2,
            text: 'Лист',
            sizeMm: 2.4,
            align: 'center' as const,
            italic: true
          }]),
      {
        x: x135 + 35,
        y: (yLitBot + ySheetBot) / 2,
        text: `Листов ${tb.totalSheets}`,
        sizeMm: 2.6,
        align: 'center',
        italic: true
      },
      {
        x: x135 + 25,
        y: (ySheetBot + frame.bottom) / 2,
        text: tb.organization,
        sizeMm: 3.2,
        align: 'center',
        italic: true,
        maxWidthMm: 46
      }
    );
  }
}
