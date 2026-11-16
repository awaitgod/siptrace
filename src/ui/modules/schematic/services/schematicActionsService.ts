import {
  BomEntry,
  ComponentDef,
  GostTitleBlockData,
  NetClassDef,
  PlacedComponent,
  SchShape,
  SchematicProject,
  SchematicSheet,
  SheetFormatId,
  Units
} from '../../../../core/types';
import { transformPoint, uid } from '../../../../core/geometry';
import { saveTextFile } from '../../../../core/utils/fileIo';
import { buildGostFrameAndStampGeometry, createDefaultGostTitleBlock, SHEET_FORMATS } from '../../../../gost/gostTitleBlock';
import { findComponentById } from '../../../../gost/libraries/gostComponents';

/** Creates an empty single-sheet A4_L schematic project seeded with existing net classes. */
export function createBlankSchematicProject(units: Units, netClasses: NetClassDef[]): SchematicProject {
  return {
    version: '1.0',
    filePath: '',
    projectName: 'Новый_проект',
    units,
    gridSize: 2.5,
    origin: { x: 0, y: 0 },
    sheets: [
      {
        id: 'sheet_1',
        name: 'Лист 1',
        format: 'A4_L',
        titleBlock: createDefaultGostTitleBlock({ name: 'Новое устройство', designation: 'АБВГ.000000.001 Э3' }),
        components: [],
        wires: [],
        buses: [],
        busTaps: [],
        junctions: [],
        netPorts: [],
        diffPairs: [],
        hierarchyBlocks: [],
        shapes: []
      }
    ],
    activeSheetId: 'sheet_1',
    netClasses,
    netClassAssignments: {},
    customComponentDefs: {},
    customPatternDefs: {}
  };
}

/** Allocates the next unused sequential GOST reference designator across all sheets. */
export function allocateNextRefDes(project: SchematicProject, prefix: string): string {
  if (!prefix) return '';
  if (prefix === '#PWR' || prefix === '#GND') return '#PWR';
  const used = new Set<number>();
  for (const sh of project.sheets) {
    for (const c of sh.components) {
      const m = new RegExp(`^${prefix}(\\d+)$`).exec(c.refDes);
      if (m) used.add(parseInt(m[1], 10));
    }
  }
  let n = 1;
  while (used.has(n)) n++;
  return `${prefix}${n}`;
}

/** Computes the axis-aligned local bounding box of a symbol part including graphics and pins. */
export function computeSymbolLocalBounds(def: ComponentDef, partIndex = 1): { minX: number; minY: number; maxX: number; maxY: number } {
  const part = def.parts.find((pt) => pt.partIndex === partIndex) ?? def.parts[0];
  if (!part) return { minX: -5, minY: -5, maxX: 5, maxY: 5 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const expand = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const p of part.primitives) {
    if (p.type === 'rect') {
      expand(p.x, p.y);
      expand(p.x + p.w, p.y + p.h);
    } else if (p.type === 'line') {
      expand(p.x1, p.y1);
      expand(p.x2, p.y2);
    } else if (p.type === 'polyline') {
      for (const pt of p.points) expand(pt.x, pt.y);
    } else if (p.type === 'circle' || p.type === 'arc') {
      expand(p.cx - p.r, p.cy - p.r);
      expand(p.cx + p.r, p.cy + p.r);
    }
  }
  for (const pin of part.pins) {
    expand(pin.x, pin.y);
  }
  if (!Number.isFinite(minX)) return { minX: -5, minY: -5, maxX: 5, maxY: 5 };
  return { minX, minY, maxX, maxY };
}

/** Clones clipboard components shifted by +10mm with unique sequential reference designators. */
export function cloneClipboardComponents(project: SchematicProject, clipboard: PlacedComponent[]): PlacedComponent[] {
  const usedByPrefix = new Map<string, Set<number>>();
  for (const sh of project.sheets) {
    for (const c of sh.components) {
      const m = /^([A-Za-zА-Яа-я_]+?)(\d+)$/.exec(c.refDes);
      if (m) {
        if (!usedByPrefix.has(m[1])) usedByPrefix.set(m[1], new Set());
        usedByPrefix.get(m[1])!.add(parseInt(m[2], 10));
      }
    }
  }
  return clipboard.map((c) => {
    const prefix = c.refDes.replace(/\d+$/, '') || 'U';
    let refDes = prefix;
    if (prefix !== '#PWR' && prefix !== '#GND') {
      if (!usedByPrefix.has(prefix)) usedByPrefix.set(prefix, new Set());
      const used = usedByPrefix.get(prefix)!;
      let n = 1;
      while (used.has(n)) n++;
      used.add(n);
      refDes = `${prefix}${n}`;
    }
    return {
      ...structuredClone(c),
      id: uid('comp'),
      refDes,
      x: c.x + 10,
      y: c.y + 10
    };
  });
}

/** Appends a GOST Form 2a continuation sheet matching the active sheet format and stamp. */
export function buildNextSchematicSheet(project: SchematicProject, activeSheet: SchematicSheet): SchematicSheet {
  const num = project.sheets.length + 1;
  return {
    id: uid('sheet'),
    name: `Лист ${num}`,
    format: activeSheet.format,
    titleBlock: {
      ...activeSheet.titleBlock,
      form: 'Form2a',
      sheetNumber: num,
      totalSheets: num
    },
    components: [],
    wires: [],
    buses: [],
    busTaps: [],
    junctions: [],
    netPorts: [],
    diffPairs: [],
    hierarchyBlocks: [],
    shapes: []
  };
}

/** Generates a printable monochrome GOST SVG drawing string from a sheet. */
export function generateSchematicSvg(
  activeSheet: SchematicSheet,
  customCompMap: Record<string, ComponentDef>
): string {
  const dim = SHEET_FORMATS[activeSheet.format];
  const tb = buildGostFrameAndStampGeometry(activeSheet.format, activeSheet.titleBlock);
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dim.widthMm}mm" height="${dim.heightMm}mm" viewBox="0 0 ${dim.widthMm} ${dim.heightMm}">`,
    `<rect x="0" y="0" width="${dim.widthMm}" height="${dim.heightMm}" fill="#ffffff"/>`
  ];
  for (const l of tb.lines) {
    lines.push(`<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#000000" stroke-width="${l.thick ? 0.5 : 0.25}"/>`);
  }
  for (const t of tb.texts) {
    lines.push(`<text x="${t.x}" y="${t.y}" font-family="Arial" font-size="${t.sizeMm}" fill="#000000" text-anchor="${t.align === 'center' ? 'middle' : t.align === 'right' ? 'end' : 'start'}">${t.text.replace(/&/g, '&amp;')}</text>`);
  }
  for (const w of activeSheet.wires) {
    const pts = w.points.map((p) => `${p.x},${p.y}`).join(' ');
    lines.push(`<polyline points="${pts}" fill="none" stroke="#000000" stroke-width="0.35"/>`);
  }
  for (const c of activeSheet.components) {
    const def = findComponentById(c.componentDefId, customCompMap);
    const part = def?.parts.find((pt) => pt.partIndex === c.partIndex) ?? def?.parts[0];
    if (!part) continue;
    for (const p of part.primitives) {
      if (p.type === 'rect') {
        const tl = transformPoint(p.x, p.y, c.x, c.y, c.angle, c.flipX, c.flipY);
        const br = transformPoint(p.x + p.w, p.y + p.h, c.x, c.y, c.angle, c.flipX, c.flipY);
        lines.push(`<rect x="${Math.min(tl.x, br.x)}" y="${Math.min(tl.y, br.y)}" width="${Math.abs(br.x - tl.x)}" height="${Math.abs(br.y - tl.y)}" fill="none" stroke="#000000" stroke-width="0.35"/>`);
      } else if (p.type === 'line') {
        const a = transformPoint(p.x1, p.y1, c.x, c.y, c.angle, c.flipX, c.flipY);
        const b = transformPoint(p.x2, p.y2, c.x, c.y, c.angle, c.flipX, c.flipY);
        lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#000000" stroke-width="0.35"/>`);
      } else if (p.type === 'circle') {
        const cen = transformPoint(p.cx, p.cy, c.x, c.y, c.angle, c.flipX, c.flipY);
        lines.push(`<circle cx="${cen.x}" cy="${cen.y}" r="${p.r}" fill="none" stroke="#000000" stroke-width="0.35"/>`);
      }
    }
    if (c.showRefDes && c.refDes && !c.refDes.startsWith('#')) {
      lines.push(`<text x="${c.x + c.refDesOffset.x}" y="${c.y + c.refDesOffset.y}" font-family="Arial" font-size="3.2" fill="#000000">${c.refDes}</text>`);
    }
  }
  lines.push(`</svg>`);
  return lines.join('\n');
}

/** Exports text content via browser file download. */
export async function exportTextFileViaNativeOrBrowser(
  filename: string,
  content: string,
  ext: string,
  desc = 'Файл SIPTrace'
): Promise<string> {
  await saveTextFile(filename, content, [{ name: desc, extensions: [ext] }]);
  return `Файл ${filename} сформирован для загрузки.`;
}

/** Converts generated GOST BOM entries into an editable schematic table shape positioned clear of Графа 26 & Title Block. */
export function buildBomTableShape(
  entries: BomEntry[],
  format: SheetFormatId = 'A3_L',
  titleBlock?: GostTitleBlockData
): SchShape {
  const dim = SHEET_FORMATS[format] ?? SHEET_FORMATS.A3_L;
  const rows: string[][] = [
    ['Поз. обозн.', 'Наименование', 'Кол.', 'Примечание'],
    ...entries.map((e) => [e.refDesList, `${e.groupTitle}: ${e.name}`, String(e.quantity), e.note])
  ];
  const rowHeight = 5.5;
  const tableH = rows.length * rowHeight;
  const stampH = !titleBlock || titleBlock.form === 'Form1' ? 55 : titleBlock.form === 'Form2' ? 40 : titleBlock.form === 'Form2a' ? 15 : 0;
  const frameRight = dim.widthMm - 5;
  const frameBottom = dim.heightMm - 5;
  const stampTop = frameBottom - stampH;
  // GOST 2.701-2008: 185 mm total width (20 + 110 + 10 + 45) placed >= 12 mm above title block
  const x = Math.max(20, frameRight - 185);
  const y = Math.max(10, stampTop - tableH - 12);
  return {
    id: uid('bomtbl'),
    type: 'table',
    x,
    y,
    colWidths: [20, 110, 10, 45],
    rowHeight,
    rows
  };
}
