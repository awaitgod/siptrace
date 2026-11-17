import { PcbPlacedComponent, PcbProject, PcbShape, PcbTrace, PcbVia, Point2D } from '../../../core/types';
import { uid } from '../../../core/geometry';
import { convertImportedPcbToGost, GostConversionReport } from '../gostConverter';
import { makeEcadPcbProject, makePcbShapeLine } from '../ecad/ecadFactories';
import { chainSegmentsToOutline, Segment2D, tessellateArcCenter } from '../outlineChain';

export interface ParsedDrillHole {
  x: number;
  y: number;
  diameter: number;
}

function parseExcellonCoord(raw: string, isMetric: boolean, isTrailingZero: boolean): number {
  const unitMul = isMetric ? 1 : 25.4;
  if (raw.includes('.')) return (parseFloat(raw) || 0) * unitMul;
  const sign = raw.startsWith('-') ? -1 : 1;
  const digits = raw.replace(/[+-]/g, '');
  if (isTrailingZero) {
    const intDigits = isMetric ? 3 : 2, decDigits = isMetric ? 3 : 4;
    const padded = digits.length >= intDigits + decDigits ? digits : digits.padStart(intDigits + decDigits, '0');
    return sign * parseFloat(`${padded.slice(0, intDigits)}.${padded.slice(intDigits)}`) * unitMul;
  }
  return sign * (parseInt(digits || '0', 10) / Math.pow(10, isMetric ? 3 : 4)) * unitMul;
}

/**
 * Shared Excellon NC Drill (.drl / .xln) parser supporting METRIC/INCH, TZ/LZ,
 * feed/speed tool definitions (T01F...S...C0.8), and modal X/Y coordinates.
 */
export function parseExcellonPreview(drlText: string): ParsedDrillHole[] {
  const tools = new Map<string, number>();
  let currentDia = 0.8, isMetric = true, isTrailingZero = true, lastX = 0, lastY = 0;
  const holes: ParsedDrillHole[] = [];

  for (const raw of drlText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    if (line.startsWith('INCH')) { isMetric = false; if (line.includes('LZ')) isTrailingZero = false; if (line.includes('TZ')) isTrailingZero = true; continue; }
    if (line.startsWith('METRIC')) { isMetric = true; if (line.includes('LZ')) isTrailingZero = false; if (line.includes('TZ')) isTrailingZero = true; continue; }

    const toolDef = /^(T\d+)\b.*?C([\d.]+)/i.exec(line);
    if (toolDef) { tools.set(toolDef[1].toUpperCase(), (parseFloat(toolDef[2]) || 0.8) * (isMetric ? 1 : 25.4)); continue; }

    const toolSel = /^(T\d+)$/i.exec(line);
    if (toolSel) { const key = toolSel[1].toUpperCase(); if (tools.has(key)) currentDia = tools.get(key)!; continue; }

    if (line.startsWith('X') || line.startsWith('Y')) {
      const xm = /X([+-]?[\d.]+)/i.exec(line), ym = /Y([+-]?[\d.]+)/i.exec(line);
      if (xm || ym) {
        if (xm) lastX = parseExcellonCoord(xm[1], isMetric, isTrailingZero);
        if (ym) lastY = parseExcellonCoord(ym[1], isMetric, isTrailingZero);
        holes.push({ x: Math.round(lastX * 1000) / 1000, y: Math.round(lastY * 1000) / 1000, diameter: Math.round(currentDia * 1000) / 1000 });
      }
    }
  }
  return holes;
}

/** Parses Excellon NC Drill (.drl / .xln) files into a PcbProject with accurate modal drill vias. */
export function parseExcellonToPcb(drlText: string, name = 'Excellon_Drill'): {
  pcb: PcbProject;
  report: GostConversionReport;
} {
  const vias: PcbVia[] = parseExcellonPreview(drlText).map((h) => ({
    id: uid('exv'), x: h.x, y: h.y, netName: '',
    outerDiameter: Math.round((h.diameter + 0.5) * 1000) / 1000,
    holeDiameter: h.diameter, startLayer: 'TopCopper', endLayer: 'BottomCopper', viaStyle: 'Through'
  }));
  const maxX = Math.max(80, ...vias.map((v) => v.x + 10)), maxY = Math.max(60, ...vias.map((v) => v.y + 10));
  return convertImportedPcbToGost(makeEcadPcbProject({
    name, vias, boardOutline: [{ x: 0, y: 0 }, { x: maxX, y: 0 }, { x: maxX, y: maxY }, { x: 0, y: maxY }, { x: 0, y: 0 }]
  }), 'Excellon NC Drill');
}

function parseGerberNumber(raw: string, intDig: number, decDig: number, trailingZero: boolean, mul: number): number {
  const sign = raw.startsWith('-') ? -1 : 1;
  const digits = raw.replace(/[+-]/g, '');
  if (digits.includes('.')) return sign * (parseFloat(digits) || 0) * mul;
  if (trailingZero) {
    const padded = digits.padStart(intDig + decDig, '0');
    return sign * parseFloat(`${padded.slice(0, intDig)}.${padded.slice(intDig)}`) * mul;
  }
  return sign * (parseInt(digits || '0', 10) / Math.pow(10, decDig)) * mul;
}

function detectLayerFromFilename(filename: string): { target: 'outline' | 'topCopper' | 'bottomCopper' | 'topSilk' | 'bottomSilk'; isCopper: boolean } {
  const low = filename.toLowerCase();
  if (/\.(gko|gm1)$|outline|edge|profile|keepout/.test(low)) return { target: 'outline', isCopper: false };
  if (/\.(gbl)$|bottom.*cu|b_cu|copper_bottom/.test(low)) return { target: 'bottomCopper', isCopper: true };
  if (/\.(gto|gbo|gbs|gts)$|silk|legend|mask/.test(low)) return { target: low.includes('gbo') || low.includes('bottom') ? 'bottomSilk' : 'topSilk', isCopper: false };
  return { target: 'topCopper', isCopper: true };
}

/** Parses RS-274X Gerber file respecting layer role (copper, silk, outline), modal D01/D02/D03, and circular arcs. */
export function parseGerberToPcb(gerberText: string, name = 'Gerber_Import'): {
  pcb: PcbProject;
  report: GostConversionReport;
} {
  let intDig = 3, decDig = 4, trailingZero = false, isInch = false;
  const apertures = new Map<string, { w: number; h: number; shape: 'Round' | 'Rect' }>();
  let curAperture = 0.25, curShape: 'Round' | 'Rect' = 'Round', curApW = 0.8, curApH = 0.8;
  let lastX = 0, lastY = 0, curDCode = '02', arcMode: '01' | '02' | '03' = '01';

  const role = detectLayerFromFilename(name);
  const traces: PcbTrace[] = [], shapes: PcbShape[] = [], outlineSegs: Segment2D[] = [], vias: PcbVia[] = [];

  // Normalize packed Gerber parameter blocks (%FSLAX...*%MOIN*%ADD...*%) into separate lines
  const normalizedText = gerberText.replace(/%\s*%/g, '%\n%').replace(/\*/g, '*\n');
  for (const rawLine of normalizedText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.includes('%MOIN%')) { isInch = true; continue; }
    if (line.includes('%MOMM%')) { isInch = false; continue; }
    const fsM = /%FS([LT])A[XY](\d)(\d)(\d)(\d)/i.exec(line);
    if (fsM) { trailingZero = fsM[1].toUpperCase() === 'T'; intDig = parseInt(fsM[2], 10) || 3; decDig = parseInt(fsM[3], 10) || 4; continue; }

    const apDef = /^%ADD(\d+)([CRO]),([\d.]+)(?:X([\d.]+))?/.exec(line);
    if (apDef) {
      const mul = isInch ? 25.4 : 1, w = Math.max(0.1, (parseFloat(apDef[3]) || 0.25) * mul);
      apertures.set(apDef[1], { w, h: apDef[4] ? Math.max(0.1, parseFloat(apDef[4]) * mul) : w, shape: apDef[2] === 'R' ? 'Rect' : 'Round' });
      continue;
    }
    if (line.startsWith('%')) continue;

    for (const cmd of line.split('*').map((c) => c.trim()).filter(Boolean)) {
      if (/^G0?1$/i.test(cmd)) { arcMode = '01'; continue; }
      if (/^G0?2$/i.test(cmd)) { arcMode = '02'; continue; }
      if (/^G0?3$/i.test(cmd)) { arcMode = '03'; continue; }
      const dSel = /^(?:G54)?D(\d+)$/.exec(cmd);
      if (dSel && parseInt(dSel[1], 10) >= 10) {
        const ap = apertures.get(dSel[1]);
        if (ap) { curAperture = ap.w; curApW = ap.w; curApH = ap.h; curShape = ap.shape; }
        continue;
      }

      if (cmd.startsWith('G01')) arcMode = '01'; else if (cmd.startsWith('G02')) arcMode = '02'; else if (cmd.startsWith('G03')) arcMode = '03';
      const xm = /X([+-]?[\d.]+)/.exec(cmd), ym = /Y([+-]?[\d.]+)/.exec(cmd), im = /I([+-]?[\d.]+)/.exec(cmd), jm = /J([+-]?[\d.]+)/.exec(cmd);
      const dm = /D(0?[123])$/.exec(cmd);
      if (dm) curDCode = dm[1].padStart(2, '0');
      if (!xm && !ym) continue;

      const mul = isInch ? 25.4 : 1;
      const nx = xm ? parseGerberNumber(xm[1], intDig, decDig, trailingZero, mul) : lastX;
      const ny = ym ? parseGerberNumber(ym[1], intDig, decDig, trailingZero, mul) : lastY;

      if (curDCode === '01') {
        const pts: Point2D[] = (arcMode === '02' || arcMode === '03') && (im || jm)
          ? tessellateArcCenter(lastX + (im ? parseGerberNumber(im[1], intDig, decDig, trailingZero, mul) : 0), lastY + (jm ? parseGerberNumber(jm[1], intDig, decDig, trailingZero, mul) : 0), lastX, lastY, nx, ny, arcMode === '03')
          : [{ x: lastX, y: lastY }, { x: nx, y: ny }];
        if (role.target === 'outline') {
          for (let i = 0; i + 1 < pts.length; i++) outlineSegs.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y });
        } else if (role.target === 'topSilk' || role.target === 'bottomSilk') {
          for (let i = 0; i + 1 < pts.length; i++) shapes.push(makePcbShapeLine(role.target === 'bottomSilk' ? 'BottomSilk' : 'TopSilk', pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, curAperture));
        } else {
          traces.push({ id: uid('gtr'), layer: role.target === 'bottomCopper' ? 'BottomCopper' : 'TopCopper', netName: '', points: pts, width: Math.max(0.1, curAperture) });
        }
      } else if (curDCode === '03' && role.isCopper) {
        vias.push({
          id: uid('gvia'),
          x: Math.round(nx * 1000) / 1000,
          y: Math.round(ny * 1000) / 1000,
          netName: '',
          outerDiameter: Math.max(curApW, curApH),
          holeDiameter: Math.max(0.2, Math.min(curApW, curApH) * 0.45),
          startLayer: 'TopCopper',
          endLayer: 'BottomCopper',
          viaStyle: 'Through'
        });
      }
      lastX = nx; lastY = ny;
    }
  }

  const components: PcbPlacedComponent[] = [];
  const boardOutline = outlineSegs.length > 0 ? chainSegmentsToOutline(outlineSegs, 0.35) : [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }, { x: 0, y: 0 }];
  return convertImportedPcbToGost(makeEcadPcbProject({ name, components, traces, vias, shapes, boardOutline }), 'Gerber RS-274X');
}
