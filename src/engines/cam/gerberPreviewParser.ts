import { Point2D } from '../../core/types';

export interface ParsedGerberEntity {
  kind: 'flash' | 'line' | 'region';
  pts: Point2D[];
  width: number;
  shape?: 'C' | 'R' | 'O';
  w?: number;
  h?: number;
  angleDeg?: number;
}

/** Parses Gerber RS-274X/X2 command streams into visualizable flashes, lines, arcs, and regions. */
export function parseGerberPreview(gerberText: string): ParsedGerberEntity[] {
  const entities: ParsedGerberEntity[] = [];
  const apertures = new Map<number, { shape: 'C' | 'R' | 'O'; w: number; h: number; angleDeg?: number }>();
  let curAper: { shape: 'C' | 'R' | 'O'; w: number; h: number; angleDeg?: number } = { shape: 'C', w: 0.2, h: 0.2 };
  let curX = 0;
  let curY = 0;
  let inRegion = false;
  let regionPts: Point2D[] = [];
  let divX = 10000;
  let divY = 10000;
  let intX = 3;
  let decX = 4;
  let intY = 3;
  let decY = 4;
  let zeroMode: 'L' | 'T' = 'L';
  let unitMul = 1.0;
  let modalOp: '1' | '2' | '3' = '1';

  const parseGerberCoord = (raw: string, intDig: number, decDig: number, div: number): number => {
    if (raw.includes('.')) return parseFloat(raw) * unitMul;
    if (zeroMode === 'T') {
      const sign = raw.startsWith('-') ? -1 : 1;
      const digits = raw.replace(/^[+-]/, '').padEnd(intDig + decDig, '0');
      return (sign * parseInt(digits, 10) / div) * unitMul;
    }
    return (parseInt(raw, 10) / div) * unitMul;
  };

  const commands = gerberText.match(/%[^%]*%|[^%*]+\*/g) ?? [];
  for (const rawCommand of commands) {
    const line = rawCommand.replace(/[\r\n]/g, '').trim();
    if (!line || line.startsWith('G04')) continue;
    const fsm = /^%FS([LT])(?:A|I)X(\d)(\d)Y(\d)(\d)\*%$/.exec(line);
    if (fsm) {
      zeroMode = fsm[1] as 'L' | 'T';
      intX = parseInt(fsm[2], 10) || 3;
      decX = parseInt(fsm[3], 10) || 4;
      intY = parseInt(fsm[4], 10) || 3;
      decY = parseInt(fsm[5], 10) || 4;
      divX = Math.pow(10, decX);
      divY = Math.pow(10, decY);
      continue;
    }
    if (line === '%MOIN*%') { unitMul = 25.4; continue; }
    if (line === '%MOMM*%') { unitMul = 1.0; continue; }
    const am = /^%ADD(\d+)([CRO]),([\d.]+)(?:X([\d.]+))?\*%$/.exec(line);
    if (am) {
      const code = parseInt(am[1], 10);
      const shape = am[2] as 'C' | 'R' | 'O';
      const w = parseFloat(am[3]) * unitMul;
      const h = (am[4] ? parseFloat(am[4]) : parseFloat(am[3])) * unitMul;
      apertures.set(code, { shape, w, h });
      continue;
    }
    const rrm = /^%ADD(\d+)ROTRECT,([\d.]+)X([\d.]+)X([\d.-]+)\*%$/.exec(line);
    if (rrm) {
      apertures.set(parseInt(rrm[1], 10), {
        shape: 'R',
        w: parseFloat(rrm[2]) * unitMul,
        h: parseFloat(rrm[3]) * unitMul,
        angleDeg: parseFloat(rrm[4])
      });
      continue;
    }
    const dm = /^(?:G54)?D(\d+)\*$/.exec(line);
    if (dm) {
      const code = parseInt(dm[1], 10);
      if (code >= 10 && apertures.has(code)) curAper = apertures.get(code)!;
      else if (code === 1 || code === 2 || code === 3) modalOp = String(code) as '1' | '2' | '3';
      continue;
    }
    if (line === 'G36*') {
      inRegion = true;
      regionPts = [];
      continue;
    }
    if (line === 'G37*') {
      if (regionPts.length >= 3) {
        entities.push({ kind: 'region', pts: regionPts, width: 0 });
      }
      inRegion = false;
      continue;
    }
    const cleanLine = line.replace(/^G0?[123]/i, '');
    const cm = /^(?:X(-?\d+(?:\.\d+)?))?(?:Y(-?\d+(?:\.\d+)?))?(?:I(-?\d+(?:\.\d+)?))?(?:J(-?\d+(?:\.\d+)?))?(?:D0?([123]))?\*$/.exec(cleanLine);
    if (cm && (cm[1] !== undefined || cm[2] !== undefined || cm[5] !== undefined)) {
      const nx = cm[1] !== undefined ? parseGerberCoord(cm[1], intX, decX, divX) : curX;
      const ny = cm[2] !== undefined ? parseGerberCoord(cm[2], intY, decY, divY) : curY;
      const op = (cm[5] ?? modalOp) as '1' | '2' | '3';
      if (cm[5]) modalOp = op;
      if (inRegion) {
        regionPts.push({ x: nx, y: ny });
      } else if (op === '1') {
        entities.push({ kind: 'line', pts: [{ x: curX, y: curY }, { x: nx, y: ny }], width: curAper.w });
      } else if (op === '3') {
        entities.push({ kind: 'flash', pts: [{ x: nx, y: ny }], width: curAper.w, shape: curAper.shape, w: curAper.w, h: curAper.h, angleDeg: curAper.angleDeg });
      }
      curX = nx;
      curY = ny;
    }
  }
  return entities;
}
