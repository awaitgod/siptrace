import {
  ComponentDef,
  ComponentPartDef,
  PadDef,
  PadShape,
  PatternDef,
  PatternGraphic,
  PatternLayer,
  PcbBoardCutout,
  PcbCopperPour,
  PcbKeepoutZone,
  PcbLayerId,
  PcbPlacedComponent,
  PcbProject,
  PcbShape,
  PcbTrace,
  PcbVia,
  PinElectricalType,
  PinGraphicStyle,
  PinOrientation,
  PlacedComponent,
  Point2D,
  SchBus,
  SchNetPort,
  SchShape,
  SchWire,
  SchematicProject,
  SchematicSheet,
  SheetFormatId,
  SymbolPin,
  SymbolPrimitive
} from '../../core/types';
import { dist, transformPoint, uid } from '../../core/geometry';
import { findComponentById } from '../../gost/libraries/gostComponents';
import { findPatternById } from '../../gost/libraries/gostPatterns';
import { createGostDesignRules } from '../../gost/gostRules';
import { createDefaultGostTitleBlock } from '../../gost/gostTitleBlock';
import { getGostFrameRect, SHEET_FORMATS } from '../../gost/titleBlock/sheetFormats';
import { createImportedPcbProject, createImportedSchematicProject, createPlaceholderChipComponent } from './projectShells';
import {
  convertImportedPcbToGost,
  convertValueToGost,
  GostConversionItem,
  GostConversionReport,
  mapForeignPatternToGost,
  mapForeignPrefixToGost,
  resolveOrBuildGostComponent
} from './gostConverter';

export type DipTraceBinaryFamily = 'schematic' | 'pcb' | 'component' | 'pattern';

export interface DipTraceBinaryIdentity {
  family: DipTraceBinaryFamily;
  signature: string;
  version: number;
  bodyOffset: number;
  unicodeText: boolean;
  anglesInDegrees: boolean;
  ansiLengthBytes: 1 | 3;
}

const LEGACY_SCH_SIGS: Record<string, number> = {
  'DTSCHEM2.2': 27,
  'DTSCHEM2.21': 28,
  'DTSCHEM2.22': 29
};

const LEGACY_PCB_SIGS: Record<string, number> = {
  'DTBOARD2.2': 31,
  'DTBOARD2.21': 32,
  'DTBOARD2.22': 33
};

// Windows-1252 high-byte table (0x80..0x9F) for ANSI DipTrace files
const CP1252_HIGH: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
  0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018,
  0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc,
  0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178
};

function decodeCp1252(raw: Uint8Array): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i];
    out += String.fromCharCode(b >= 0x80 && b <= 0x9f ? (CP1252_HIGH[b] ?? b) : b);
  }
  return out;
}

function decodeUtf16Be(raw: Uint8Array): string {
  const units = Math.floor(raw.length / 2);
  const chars: string[] = [];
  for (let i = 0; i < units; i++) {
    const code = (raw[i * 2] << 8) | raw[i * 2 + 1];
    chars.push(String.fromCharCode(code));
  }
  return chars.join('');
}

function readBiasedInt24(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2]) - 1_000_000;
}

/** Detects whether a byte buffer is a native DipTrace binary file (.dch, .dip, .eli, .lib). */
export function detectDipTraceBinaryFormat(bytes: Uint8Array): DipTraceBinaryIdentity | null {
  if (!bytes || bytes.length < 4) return null;
  const sigLen = bytes[0];
  if (sigLen < 5 || sigLen > 24 || 1 + sigLen > bytes.length) return null;
  let signature = '';
  for (let i = 0; i < sigLen; i++) {
    const c = bytes[1 + i];
    if (c < 0x20 || c > 0x7e) return null;
    signature += String.fromCharCode(c);
  }
  let bodyOffset = 1 + sigLen;

  if (signature === 'DTSCHEM') {
    if (bytes.length < bodyOffset + 3) return null;
    const version = readBiasedInt24(bytes, bodyOffset);
    bodyOffset += 3;
    return {
      family: 'schematic',
      signature,
      version,
      bodyOffset,
      unicodeText: version >= 32,
      anglesInDegrees: version < 40,
      ansiLengthBytes: 3
    };
  }
  if (signature in LEGACY_SCH_SIGS) {
    const version = LEGACY_SCH_SIGS[signature];
    return {
      family: 'schematic',
      signature,
      version,
      bodyOffset,
      unicodeText: false,
      anglesInDegrees: true,
      ansiLengthBytes: 3
    };
  }
  if (signature === 'DTBOARD') {
    if (bytes.length < bodyOffset + 3) return null;
    const version = readBiasedInt24(bytes, bodyOffset);
    bodyOffset += 3;
    return {
      family: 'pcb',
      signature,
      version,
      bodyOffset,
      unicodeText: version >= 38,
      anglesInDegrees: false,
      ansiLengthBytes: 3
    };
  }
  if (signature in LEGACY_PCB_SIGS) {
    const version = LEGACY_PCB_SIGS[signature];
    return {
      family: 'pcb',
      signature,
      version,
      bodyOffset,
      unicodeText: false,
      anglesInDegrees: false,
      ansiLengthBytes: 3
    };
  }
  if (signature === 'DTELIB') {
    if (bytes.length < bodyOffset + 3) return null;
    const version = readBiasedInt24(bytes, bodyOffset);
    bodyOffset += 3;
    return {
      family: 'component',
      signature,
      version,
      bodyOffset,
      unicodeText: version >= 24,
      anglesInDegrees: false,
      ansiLengthBytes: 1
    };
  }
  const legacyEliM = /^DTELIB(\d+)$/.exec(signature);
  if (legacyEliM) {
    const version = parseInt(legacyEliM[1], 10);
    return {
      family: 'component',
      signature,
      version,
      bodyOffset,
      unicodeText: false,
      anglesInDegrees: false,
      ansiLengthBytes: 1
    };
  }
  if (signature === 'DTCLIB') {
    if (bytes.length < bodyOffset + 3) return null;
    const version = readBiasedInt24(bytes, bodyOffset);
    bodyOffset += 3;
    return {
      family: 'pattern',
      signature,
      version,
      bodyOffset,
      unicodeText: version >= 18,
      anglesInDegrees: false,
      ansiLengthBytes: 1
    };
  }
  const legacyLibM = /^DTCLIB(\d+)$/.exec(signature);
  if (legacyLibM) {
    const version = parseInt(legacyLibM[1], 10);
    return {
      family: 'pattern',
      signature,
      version,
      bodyOffset,
      unicodeText: false,
      anglesInDegrees: false,
      ansiLengthBytes: 1
    };
  }
  return null;
}

/** Sequential cursor for DipTrace's big-endian biased binary scalar stream. */
class DipBinaryReader {
  public pos: number;
  public unicodeText: boolean;
  public ansiLengthBytes: 1 | 3;
  private readonly view: DataView;

  constructor(
    public readonly data: Uint8Array,
    public readonly identity: DipTraceBinaryIdentity
  ) {
    this.pos = identity.bodyOffset;
    this.unicodeText = identity.unicodeText;
    this.ansiLengthBytes = identity.ansiLengthBytes;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  get remaining(): number {
    return this.data.length - this.pos;
  }

  take(length: number): Uint8Array {
    if (length < 0 || this.pos + length > this.data.length) {
      throw new Error(`DipTrace binary truncated at 0x${this.pos.toString(16)}: need ${length}, have ${this.remaining}`);
    }
    const slice = this.data.subarray(this.pos, this.pos + length);
    this.pos += length;
    return slice;
  }

  byte(): number {
    if (this.pos >= this.data.length) {
      throw new Error(`DipTrace binary EOF at 0x${this.pos.toString(16)}`);
    }
    return this.data[this.pos++];
  }

  integer(): number {
    if (this.pos + 3 > this.data.length) {
      throw new Error(`DipTrace binary truncated integer at 0x${this.pos.toString(16)}`);
    }
    const val = readBiasedInt24(this.data, this.pos);
    this.pos += 3;
    return val;
  }

  /** Decodes 4-byte BE biased fixed-point number (1e-4 precision). */
  number(): number {
    if (this.pos + 4 > this.data.length) {
      throw new Error(`DipTrace binary truncated number at 0x${this.pos.toString(16)}`);
    }
    const raw = this.view.getUint32(this.pos, false);
    this.pos += 4;
    return (raw - 1_000_000_000) / 10_000;
  }

  /** Decodes shared length (3 DipTrace shared units = 1 mm) into millimetres. */
  mm(): number {
    return this.number() / 3;
  }

  boolean(): boolean {
    const b = this.byte();
    if (b !== 0 && b !== 1) {
      throw new Error(`Invalid DipTrace boolean ${b} at 0x${(this.pos - 1).toString(16)}`);
    }
    return b === 1;
  }

  color(): number {
    const raw = this.take(3);
    return raw[0] | (raw[1] << 8) | (raw[2] << 16);
  }

  text(forceLongAnsi = false): string {
    if (this.unicodeText) {
      const lenBytes = this.take(2);
      const len = (lenBytes[0] << 8) | lenBytes[1];
      return decodeUtf16Be(this.take(len * 2));
    }
    const len = (forceLongAnsi || this.ansiLengthBytes === 3) ? this.integer() : this.byte();
    if (len < 0 || len > this.remaining) {
      throw new Error(`Invalid DipTrace ANSI string length ${len} at 0x${this.pos.toString(16)}`);
    }
    return decodeCp1252(this.take(len));
  }

  count(label = 'items'): number {
    const start = this.pos;
    const v = this.integer();
    if (v < 0 || v > this.remaining) {
      throw new Error(`Invalid DipTrace ${label} count ${v} at 0x${start.toString(16)}`);
    }
    return v;
  }

  pointsMm(count: number): Point2D[] {
    const pts: Point2D[] = [];
    for (let i = 0; i < count; i++) {
      pts.push({ x: this.mm(), y: this.mm() });
    }
    return pts;
  }
}

// ---------- Shared internal DipTrace structures ----------

interface DipShape {
  enabled: boolean;
  orientation: number;
  type: number;
  fontSize: number;
  fontColor: number;
  fontType: number;
  fontName: string;
  textLines: string[];
  penWidthMm: number;
  pointsMm: Point2D[];
  controlsRaw: number[];
  layer: number;
  layId: number;
  allLayers: boolean;
  textAngle: number;
  textShow: number;
  padId: number;
  markingGenerated: boolean;
  showPart: boolean;
}

interface DipPin {
  enabled: boolean;
  type: number;
  orientation: number; // 0=Left, 1=Up, 2=Right, 3=Down (from body)
  number: number; // pad index (or -1)
  netNumber: number;
  xMm: number; // body-side anchor in mm
  yMm: number;
  lengthMm: number;
  name: string;
  stringNumber: string;
  fConnect: boolean;
  showName: boolean;
  electricType: number;
  hidden: boolean;
  modelSig: string;
  noConnect: boolean;
}

interface DipPad {
  number: number;
  netNumber: number;
  xMm: number;
  yMm: number;
  stringNumber: string;
  name: string;
  widthMm: number;
  heightMm: number;
  holeMm: number;
  holeHMm: number;
  holeType: number;
  surfacePad: boolean;
  shapeCode: number; // 0 ellipse, 1 obround, 2 rect, 3 polygon, 4 D-shape, 20 fiducial
  standard: boolean;
  contourMm: Point2D[];
  sided: boolean;
  padAngleRad: number;
  padCorner: number;
}

interface DipPattern {
  type: number;
  number1: number;
  number2: number;
  widthMm: number;
  heightMm: number;
  padWidthMm: number;
  padHeightMm: number;
  padShape: number;
  surfacePad: boolean;
  padHoleMm: number;
  name: string;
  originXMm: number;
  originYMm: number;
  pads: DipPad[];
  shapes: DipShape[];
  holes: { enabled: boolean; xMm: number; yMm: number; diamMm: number; holeDiamMm: number }[];
  model3dFile: string;
  model3dAutoHeightMm: number;
  refDes: string;
  value: string;
  description: string;
  manufacturer: string;
  categoryName: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function mapDipElectricType(code: number): PinElectricalType {
  switch (code) {
    case 2: return 'Input';
    case 3: return 'Output';
    case 4: return 'Bidirectional';
    case 5:
    case 6: return 'OpenCollector';
    case 9: return 'TriState';
    case 10: return 'Power';
    default: return 'Passive';
  }
}

function mapDipPinStyle(code: number): PinGraphicStyle {
  switch (code) {
    case 1: return 'Inverted';
    case 5:
    case 6:
    case 7: return 'OpenCollector';
    case 8: return 'TriState';
    case 13: return 'Clock';
    default: return 'Line';
  }
}

function mapDipPinToSip(pin: DipPin, idx: number, defPadCount: number): SymbolPin {
  // DipTrace Pin (x, y) is at body side; wire tip is away from body by length along dipOrientation:
  // 0=Left (-x), 1=Up (-y), 2=Right (+x), 3=Down (+y)
  // SIPTrace Pin (x, y) is the wire connection tip, and orientation points INTO the body:
  // 0=Right, 90=Down, 180=Left, 270=Up.
  let tipX = pin.xMm;
  let tipY = pin.yMm;
  let sipOrient: PinOrientation = 0;
  const len = Math.max(0.5, round2(pin.lengthMm || 2.54));
  switch (pin.orientation & 3) {
    case 0: // extends left from body -> tip is at x - len, points right (0) into body
      tipX = pin.xMm - len;
      sipOrient = 0;
      break;
    case 1: // extends up from body -> tip is at y - len, points down (90) into body
      tipY = pin.yMm - len;
      sipOrient = 90;
      break;
    case 2: // extends right from body -> tip is at x + len, points left (180) into body
      tipX = pin.xMm + len;
      sipOrient = 180;
      break;
    case 3: // extends down from body -> tip is at y + len, points up (270) into body
      tipY = pin.yMm + len;
      sipOrient = 270;
      break;
  }
  const numStr = (pin.stringNumber || (pin.number > 0 ? String(pin.number) : String(idx + 1))).trim();
  const padNum = pin.number > 0 && pin.number <= Math.max(defPadCount, 999) ? String(pin.number) : numStr;
  return {
    id: `dp_${idx + 1}`,
    number: numStr,
    name: pin.name || numStr,
    x: round3(tipX),
    y: round3(tipY),
    length: len,
    orientation: sipOrient,
    electricalType: mapDipElectricType(pin.electricType),
    style: mapDipPinStyle(pin.type),
    showName: pin.showName && Boolean(pin.name) && pin.name !== numStr,
    showNumber: !pin.hidden,
    isHiddenPower: pin.hidden && pin.electricType === 10,
    padMapping: padNum
  };
}

function mapDipPadShape(code: number): PadShape {
  switch (code) {
    case 0: return 'Round';
    case 1: return 'Oval';
    case 2: return 'Rect';
    case 3: return 'Polygon';
    case 4: return 'RoundedRect';
    default: return 'Rect';
  }
}

function mapDipPad(pad: DipPad, idx: number, patternDefaults: { widthMm: number; heightMm: number; holeMm: number; surface: boolean; shape: number }, side: 'Top' | 'Bottom' = 'Top'): PadDef {
  const w = Math.max(0.2, round3(pad.widthMm > 0 ? pad.widthMm : (patternDefaults.widthMm > 0 ? patternDefaults.widthMm : 1.2)));
  const h = Math.max(0.2, round3(pad.heightMm > 0 ? pad.heightMm : (patternDefaults.heightMm > 0 ? patternDefaults.heightMm : 1.2)));
  const hole = round3(Math.max(0, pad.holeMm > 0 ? pad.holeMm : (!pad.surfacePad && patternDefaults.holeMm > 0 ? patternDefaults.holeMm : 0)));
  const isTht = !pad.surfacePad && hole > 0;
  const shapeCode = pad.standard && patternDefaults.shape >= 0 ? patternDefaults.shape : pad.shapeCode;
  const shape = mapDipPadShape(shapeCode);
  const angleDeg = pad.padAngleRad ? ((Math.round((-pad.padAngleRad * 180) / Math.PI) % 360) + 360) % 360 : 0;
  return {
    id: uid('dpad'),
    number: (pad.stringNumber || (pad.number > 0 ? String(pad.number) : String(idx + 1))).trim(),
    type: isTht ? 'THT' : 'SMD',
    shape,
    x: round3(pad.xMm),
    y: round3(pad.yMm),
    width: w,
    height: h,
    holeDiameter: isTht ? hole : undefined,
    angle: angleDeg || undefined,
    layer: isTht ? 'All' : (pad.sided ? (side === 'Top' ? 'Bottom' : 'Top') : side),
    polygonPoints: shape === 'Polygon' && pad.contourMm.length >= 3 ? pad.contourMm.map((p) => ({ x: round3(p.x), y: round3(p.y) })) : undefined
  };
}

function circleFrom3Pts(p0: Point2D, p1: Point2D, p2: Point2D): { cx: number; cy: number; r: number; a0: number; a2: number } | null {
  const ax = p0.x, ay = p0.y;
  const bx = p1.x, by = p1.y;
  const cx = p2.x, cy = p2.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-6) return null;
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  if (!Number.isFinite(r) || r <= 0 || r > 500) return null;
  return {
    cx: ux,
    cy: uy,
    r,
    a0: Math.atan2(ay - uy, ax - ux),
    a2: Math.atan2(cy - uy, cx - ux)
  };
}

function convertDipSymbolShapes(shapes: DipShape[]): SymbolPrimitive[] {
  const out: SymbolPrimitive[] = [];
  for (const sh of shapes) {
    if (!sh.enabled || sh.markingGenerated) continue;
    const pts = sh.pointsMm;
    const w = Math.max(0.15, Math.abs(sh.penWidthMm) > 0.01 && sh.penWidthMm > 0 ? sh.penWidthMm : 0.35);
    // Symbol drawing types: 1=Line, 2=Arc, 3=Arrow, 4=Rectangle, 5=FillRect, 6=Obround, 7=FillObround, 8=Polyline, 9=Polygon, 10=Text
    if ((sh.type === 1 || sh.type === 3) && pts.length >= 2) {
      for (let i = 1; i < pts.length; i++) {
        out.push({ type: 'line', x1: round3(pts[i - 1].x), y1: round3(pts[i - 1].y), x2: round3(pts[i].x), y2: round3(pts[i].y), width: w });
      }
    } else if (sh.type === 2 && pts.length >= 3) {
      const arc = circleFrom3Pts(pts[0], pts[1], pts[2]);
      if (arc) {
        out.push({ type: 'arc', cx: round3(arc.cx), cy: round3(arc.cy), r: round3(arc.r), startAngle: arc.a0, endAngle: arc.a2, width: w });
      } else {
        out.push({ type: 'polyline', points: pts.map((p) => ({ x: round3(p.x), y: round3(p.y) })), width: w });
      }
    } else if ((sh.type === 4 || sh.type === 5) && pts.length >= 2) {
      const x1 = Math.min(pts[0].x, pts[1].x);
      const y1 = Math.min(pts[0].y, pts[1].y);
      const x2 = Math.max(pts[0].x, pts[1].x);
      const y2 = Math.max(pts[0].y, pts[1].y);
      out.push({ type: 'rect', x: round3(x1), y: round3(y1), w: round3(x2 - x1), h: round3(y2 - y1), fill: sh.type === 5, width: w });
    } else if ((sh.type === 6 || sh.type === 7) && pts.length >= 2) {
      const rx = Math.abs(pts[1].x - pts[0].x) / 2;
      const ry = Math.abs(pts[1].y - pts[0].y) / 2;
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      if (Math.abs(rx - ry) <= 0.3) {
        out.push({ type: 'circle', cx: round3(cx), cy: round3(cy), r: round3((rx + ry) / 2), fill: sh.type === 7, width: w });
      } else {
        const poly: Point2D[] = [];
        for (let k = 0; k < 24; k++) {
          const a = (k * Math.PI * 2) / 24;
          poly.push({ x: round3(cx + rx * Math.cos(a)), y: round3(cy + ry * Math.sin(a)) });
        }
        out.push({ type: 'polyline', points: poly, closed: true, fill: sh.type === 7, width: w });
      }
    } else if ((sh.type === 8 || sh.type === 9) && pts.length >= 2) {
      out.push({ type: 'polyline', points: pts.map((p) => ({ x: round3(p.x), y: round3(p.y) })), closed: sh.type === 9, fill: sh.type === 9, width: w });
    } else if (sh.type === 10 && pts.length >= 1) {
      const txt = sh.textLines.join(' ').trim();
      if (txt) {
        out.push({ type: 'text', x: round3(pts[0].x), y: round3(pts[0].y), text: txt, size: Math.max(1.8, (sh.fontSize || 5) * 0.45), align: 'center' });
      }
    }
  }
  return out;
}

function mapPatternLayer(layerCode: number): PatternLayer | null {
  switch (layerCode) {
    case 0: return 'TopSilk';
    case 1: return 'TopAssembly';
    case 6: return 'BottomAssembly';
    case 7: return 'BottomSilk';
    case 8: return 'TopCopper';
    case 9:
    case 10: return 'Keepout';
    case 11: return 'BottomCopper';
    case 16:
    case 17: return 'Courtyard';
    default: return 'TopSilk';
  }
}

function convertDipPatternShapes(shapes: DipShape[]): PatternGraphic[] {
  const out: PatternGraphic[] = [];
  for (const sh of shapes) {
    if (sh.type <= 0) continue;
    const layer = mapPatternLayer(sh.layer);
    if (!layer) continue;
    const pts = sh.pointsMm;
    const w = Math.max(0.12, sh.penWidthMm > 0 ? sh.penWidthMm : 0.15);
    // Pattern drawing types: 1=Line, 2=Rectangle, 3=Obround, 4=FillRect, 5=FillObround, 6=Arc, 7=Text, 8=Polyline, 9=Polygon
    if (sh.type === 1 && pts.length >= 2) {
      for (let i = 1; i < pts.length; i++) {
        out.push({ type: 'line', layer, x1: round3(pts[i - 1].x), y1: round3(pts[i - 1].y), x2: round3(pts[i].x), y2: round3(pts[i].y), width: w });
      }
    } else if ((sh.type === 2 || sh.type === 4) && pts.length >= 2) {
      const x1 = Math.min(pts[0].x, pts[1].x);
      const y1 = Math.min(pts[0].y, pts[1].y);
      const x2 = Math.max(pts[0].x, pts[1].x);
      const y2 = Math.max(pts[0].y, pts[1].y);
      out.push({ type: 'rect', layer, x: round3(x1), y: round3(y1), w: round3(x2 - x1), h: round3(y2 - y1), width: w, fill: sh.type === 4 });
    } else if ((sh.type === 3 || sh.type === 5) && pts.length >= 2) {
      const rx = Math.abs(pts[1].x - pts[0].x) / 2;
      const ry = Math.abs(pts[1].y - pts[0].y) / 2;
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      if (Math.abs(rx - ry) <= 0.25) {
        out.push({ type: 'circle', layer, cx: round3(cx), cy: round3(cy), r: round3((rx + ry) / 2), width: w, fill: sh.type === 5 });
      } else {
        const poly: Point2D[] = [];
        for (let k = 0; k < 20; k++) {
          const a = (k * Math.PI * 2) / 20;
          poly.push({ x: round3(cx + rx * Math.cos(a)), y: round3(cy + ry * Math.sin(a)) });
        }
        out.push({ type: 'polyline', layer, points: poly, width: w, closed: true });
      }
    } else if (sh.type === 6 && pts.length >= 3) {
      const arc = circleFrom3Pts(pts[0], pts[1], pts[2]);
      if (arc) {
        out.push({
          type: 'arc',
          layer,
          cx: round3(arc.cx),
          cy: round3(arc.cy),
          r: round3(arc.r),
          startAngle: (arc.a0 * 180) / Math.PI,
          endAngle: (arc.a2 * 180) / Math.PI,
          width: w
        });
      }
    } else if ((sh.type === 8 || sh.type === 9) && pts.length >= 2) {
      out.push({ type: 'polyline', layer, points: pts.map((p) => ({ x: round3(p.x), y: round3(p.y) })), width: w, closed: sh.type === 9 });
    } else if (sh.type === 7 && pts.length >= 1) {
      const txt = sh.textLines.join(' ').trim();
      if (txt && sh.textShow === 0) {
        out.push({ type: 'text', layer, x: round3(pts[0].x), y: round3(pts[0].y), text: txt, size: Math.max(0.8, (sh.fontSize || 4) * 0.3) });
      }
    }
  }
  return out;
}

function buildPatternDefFromDip(dipPat: DipPattern, idPrefix: string, libraryLabel: string): PatternDef {
  const pads: PadDef[] = dipPat.pads.map((p, idx) =>
    mapDipPad(p, idx, {
      widthMm: dipPat.padWidthMm,
      heightMm: dipPat.padHeightMm,
      holeMm: dipPat.padHoleMm,
      surface: dipPat.surfacePad,
      shape: dipPat.padShape
    })
  );
  for (const h of dipPat.holes) {
    if (!h.enabled) continue;
    pads.push({
      id: uid('dhole'),
      number: `MH${pads.length + 1}`,
      type: 'MountingHole',
      shape: 'Round',
      x: round3(h.xMm),
      y: round3(h.yMm),
      width: round3(Math.max(0.5, h.diamMm || h.holeDiamMm + 0.6)),
      height: round3(Math.max(0.5, h.diamMm || h.holeDiamMm + 0.6)),
      holeDiameter: round3(Math.max(0.3, h.holeDiamMm || 1.0)),
      layer: 'All'
    });
  }
  const graphics = convertDipPatternShapes(dipPat.shapes);
  const xs = [...pads.map((p) => p.x - p.width / 2), ...pads.map((p) => p.x + p.width / 2)];
  const ys = [...pads.map((p) => p.y - p.height / 2), ...pads.map((p) => p.y + p.height / 2)];
  const spanX = xs.length ? Math.max(2, Math.max(...xs) - Math.min(...xs)) : Math.max(3, dipPat.widthMm || 6);
  const spanY = ys.length ? Math.max(2, Math.max(...ys) - Math.min(...ys)) : Math.max(3, dipPat.heightMm || 4);
  if (graphics.length === 0) {
    graphics.push({ type: 'rect', layer: 'TopSilk', x: round3(-spanX / 2), y: round3(-spanY / 2), w: round3(spanX), h: round3(spanY), width: 0.15 });
  }
  const hasTht = pads.some((p) => p.type === 'THT');
  const rawName = (dipPat.name || dipPat.refDes || 'DipPattern').trim();
  const safeSlug = rawName.replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 36) || 'Pat';
  return {
    id: `${idPrefix}_${safeSlug}`,
    name: rawName,
    library: libraryLabel,
    gostName: 'ГОСТ / DipTrace',
    description: dipPat.description || `Импортировано из DipTrace: ${rawName}`,
    pads,
    graphics,
    courtyard: { width: round2(spanX + 1.2), height: round2(spanY + 1.2) },
    model3d: {
      shape: pads.length <= 2 ? (hasTht ? 'AxialResistor' : 'ChipSMD') : (hasTht ? 'DIP' : (pads.length >= 24 ? 'QFP' : 'SOIC')),
      bodyWidth: round2(Math.max(1.2, spanX * 0.75)),
      bodyLength: round2(Math.max(1.2, spanY * 0.75)),
      bodyHeight: round2(Math.max(0.8, dipPat.model3dAutoHeightMm || (hasTht ? 3.2 : 1.6))),
      color: '#23252b',
      pinCount: pads.filter((p) => p.type !== 'MountingHole').length
    }
  };
}

// ---------- Shared binary block readers ----------

function readCategories(r: DipBinaryReader): string[] {
  const names: string[] = [];
  const catCount = r.count('library categories');
  for (let i = 0; i < catCount; i++) {
    const catName = r.text();
    r.integer(); // Index
    if (catName) names.push(catName);
    const typeCount = r.count('category types');
    for (let j = 0; j < typeCount; j++) {
      r.text();
      r.integer();
      const subCount = r.count('category subtypes');
      for (let k = 0; k < subCount; k++) {
        r.text();
        r.integer();
      }
    }
  }
  return names;
}

function readCategoryTypes(r: DipBinaryReader): void {
  const cnt = r.count('category types');
  for (let i = 0; i < cnt; i++) {
    r.text();
    r.text();
    r.integer();
    r.integer();
  }
}

function readPossibleNames(r: DipBinaryReader): void {
  const cnt = r.count('possible names');
  for (let i = 0; i < cnt; i++) r.text();
}

function readGroups(r: DipBinaryReader): void {
  const cnt = r.count('groups');
  for (let i = 0; i < cnt; i++) {
    r.boolean();
    r.integer();
    r.mm();
    r.mm();
  }
}

function discardLegacyGroups(r: DipBinaryReader, kindCount: number): void {
  const cnt = r.count('legacy groups');
  for (let i = 0; i < cnt; i++) {
    r.boolean();
    r.integer();
    for (let k = 0; k < kindCount; k++) {
      const m = r.count('group members');
      for (let j = 0; j < m; j++) r.integer();
    }
  }
}

function readMaskSegments(r: DipBinaryReader): void {
  for (let s = 0; s < 2; s++) {
    const cnt = r.count('pad mask segments');
    for (let i = 0; i < cnt; i++) {
      r.number(); r.number(); r.number(); r.number();
    }
  }
}

function readTerminals(r: DipBinaryReader): void {
  const cnt = r.count('pad terminals');
  for (let i = 0; i < cnt; i++) {
    r.integer();
    r.mm(); r.mm();
    r.number(); // angle
    r.mm(); r.mm();
    r.number(); // corner
    const pCnt = r.count('terminal points');
    r.pointsMm(pCnt);
  }
}

function readPadMaskStates(r: DipBinaryReader, extended: boolean): void {
  for (let i = 0; i < 4; i++) {
    if (extended) r.integer();
    else r.boolean();
  }
}

function readPadGeometry(r: DipBinaryReader): {
  widthMm: number; heightMm: number; holeMm: number; holeHMm: number;
  holeType: number; surfacePad: boolean; shapeCode: number; standard: boolean; contourMm: Point2D[];
} {
  const widthMm = r.mm();
  const heightMm = r.mm();
  const holeMm = r.mm();
  const holeHMm = r.mm();
  const holeType = r.integer();
  const surfacePad = r.boolean();
  const shapeCode = r.integer();
  const standard = r.boolean();
  const contourCount = r.count('pad contour points');
  const contourMm = r.pointsMm(contourCount);
  return { widthMm, heightMm, holeMm, holeHMm, holeType, surfacePad, shapeCode, standard, contourMm };
}

function readHoles(r: DipBinaryReader, grouped: boolean): DipPattern['holes'] {
  const out: DipPattern['holes'] = [];
  const cnt = r.count('footprint holes');
  for (let i = 0; i < cnt; i++) {
    const enabled = r.boolean();
    const xMm = r.mm();
    const yMm = r.mm();
    const diamMm = r.mm();
    const holeDiamMm = r.mm();
    r.boolean(); // locked
    if (grouped) r.integer();
    out.push({ enabled, xMm, yMm, diamMm, holeDiamMm });
  }
  return out;
}

function readDimensions(r: DipBinaryReader, withGroup = false): void {
  const cnt = r.count('dimensions');
  for (let i = 0; i < cnt; i++) {
    r.boolean(); r.boolean(); // enabled, locked
    for (let k = 0; k < 10; k++) r.integer();
    for (let k = 0; k < 7; k++) r.number();
    r.integer(); r.boolean(); r.text(); r.integer(); r.number(); r.number(); r.boolean(); r.number();
    r.integer(); r.integer(); r.text();
    if (withGroup) r.integer();
  }
}

function readTitleBlock(r: DipBinaryReader): void {
  r.text(); // name
  r.number(); r.number(); // width, height
  const cols = r.count('title columns');
  const rows = r.count('title rows');
  for (let i = 0; i < cols + rows; i++) r.number();
  for (let i = 0; i < cols * rows; i++) {
    r.integer();
    r.boolean(); r.boolean(); r.boolean(); r.boolean();
  }
  const contents = r.count('title cell contents');
  for (let i = 0; i < contents; i++) {
    r.boolean();
    r.integer(); r.integer(); r.integer();
    r.color();
    r.text(); r.text();
    r.number(); r.number(); r.number(); r.number();
    r.boolean();
    r.number(); r.number();
  }
}

function readPatternParameters(r: DipBinaryReader): {
  type: number; number1: number; number2: number; widthMm: number; heightMm: number;
  padWidthMm: number; padHeightMm: number; padShape: number; surfacePad: boolean;
  padHoleMm: number; name: string; originXMm: number; originYMm: number;
} {
  const type = r.integer();
  for (let i = 0; i < 4; i++) r.boolean();
  const number1 = r.integer();
  const number2 = r.integer();
  r.number(); r.number(); // spacing1, spacing2
  r.boolean(); r.number(); r.boolean();
  r.integer(); // pattern orientation
  const widthMm = r.mm();
  const heightMm = r.mm();
  const padWidthMm = r.mm();
  const padHeightMm = r.mm();
  const padShape = r.integer();
  const surfacePad = r.boolean();
  const padHoleMm = r.mm();
  r.mm(); // padHoleH
  r.integer(); // padHoleType
  const name = r.text();
  const originXMm = r.mm();
  const originYMm = r.mm();
  return { type, number1, number2, widthMm, heightMm, padWidthMm, padHeightMm, padShape, surfacePad, padHoleMm, name, originXMm, originYMm };
}

function readPatternAuthoring(r: DipBinaryReader): { description: string; manufacturer: string } {
  r.boolean(); r.boolean(); // OriginCross, OriginCircle
  r.integer(); r.integer(); // OriginCommon, OriginCourtyard
  const description = r.text();
  r.text(); r.text(); // Name_Unique, RecoveryCode
  r.boolean(); r.boolean();
  const manufacturer = r.text();
  r.number(); r.number(); r.number(); // PadCorner, PadShape_X, PadShape_Y
  readTerminals(r);
  for (let i = 0; i < 4; i++) r.integer(); // mask/paste states
  for (let i = 0; i < 6; i++) r.number(); // CustomSwell..SegmentSide
  readMaskSegments(r);
  return { description, manufacturer };
}

function readPadExtensions(r: DipBinaryReader, pad: DipPad): void {
  pad.padCorner = r.number();
  pad.padAngleRad = r.number();
  r.number(); r.number(); // PadShape_X, PadShape_Y
  readTerminals(r);
  for (let i = 0; i < 4; i++) r.number();
  readMaskSegments(r);
}

function readTextProperties(r: DipBinaryReader, shape: DipShape): void {
  shape.textAngle = r.number();
  r.integer(); r.integer(); r.integer(); // TextHorz, TextVert, TextAlign
  r.number(); // LineSpacing
  const lineCnt = r.count('text lines');
  shape.textLines = [];
  for (let i = 0; i < lineCnt; i++) shape.textLines.push(r.text());
}

function expandNormalizedPatternDrawing(shape: DipShape, patWidthMm: number, patHeightMm: number): void {
  const c = shape.controlsRaw;
  const controls: Point2D[] = [
    { x: (c[0] ?? 0) * patWidthMm, y: (c[1] ?? 0) * patHeightMm },
    { x: (c[2] ?? 0) * patWidthMm, y: (c[3] ?? 0) * patHeightMm },
    { x: (c[4] ?? 0) * patWidthMm, y: (c[5] ?? 0) * patHeightMm }
  ];
  const k = shape.type;
  if (k === 0) {
    shape.pointsMm = [];
  } else if (k === 7) {
    const x0 = controls[0].x, y0 = controls[0].y;
    const x1 = controls[1].x, y1 = controls[1].y;
    const corners: Point2D[] = [{ x: x0, y: y0 }, { x: x0, y: y1 }, { x: x1, y: y1 }, { x: x1, y: y0 }];
    shape.pointsMm = [corners[shape.orientation & 3] ?? corners[0]];
  } else if (k < 8) {
    shape.pointsMm = controls.slice(0, k === 6 ? 3 : 2);
  } else {
    shape.pointsMm = shape.pointsMm.map((p) => ({ x: p.x * 3 * patWidthMm, y: p.y * 3 * patHeightMm }));
  }
}

// =========================================================================
// 1. STANDALONE COMPONENT LIBRARY (.eli)
// =========================================================================

export function parseDipTraceBinaryEli(bytes: Uint8Array, filename = 'library.eli'): {
  libraryName: string;
  hint: string;
  components: ComponentDef[];
  patterns: PatternDef[];
  categories: string[];
  report: GostConversionReport;
} {
  const identity = detectDipTraceBinaryFormat(bytes);
  if (!identity || identity.family !== 'component') {
    throw new Error(`Файл ${filename} не является двоичной библиотекой компонентов DipTrace (.eli).`);
  }
  const r = new DipBinaryReader(bytes, identity);
  const version = identity.version;
  const libraryName = r.text() || filename.replace(/\.[^.]+$/, '');
  const hint = r.text();
  if (version >= 33) r.take(4);
  const categories = version >= 24 ? readCategories(r) : [];
  const subfolderCount = r.count('library subfolders');
  for (let i = 0; i < subfolderCount; i++) r.text();
  const compCount = r.count('library components');

  const components: ComponentDef[] = [];
  const patterns: PatternDef[] = [];
  const patternMap = new Map<string, PatternDef>();
  const items: GostConversionItem[] = [];

  for (let ci = 0; ci < compCount; ci++) {
    const partCount = r.count('component parts');
    const builtParts: ComponentPartDef[] = [];
    let compName = '';
    let compRef = '';
    let compValue = '';
    let compManufacturer = '';
    let compCategory = '';
    let attachedPattern: PatternDef | null = null;

    for (let pi = 0; pi < partCount; pi++) {
      // Symbol parameters
      r.boolean(); // Enabled
      r.integer(); // PartType
      const partName = r.text();
      r.integer(); // ShowNumbers
      r.integer(); // Type
      r.integer(); r.integer(); // Number1, Number2
      r.mm(); r.mm(); // Width, Height
      const pName = r.text();
      const pRef = r.text();
      const pValue = r.text();
      r.boolean(); // LockProperties
      if (pi === 0) {
        compName = pName;
        compRef = pRef;
        compValue = pValue;
      }

      // Attached physical pattern parameters
      const intConCount = r.count('internal pad connections');
      for (let i = 0; i < intConCount; i++) { r.integer(); r.integer(); }
      const patParams = readPatternParameters(r);
      r.mm(); r.mm(); // Origin_X, Origin_Y
      const defPadPts = r.count('default pad points');
      r.pointsMm(defPadPts);
      let patAuth = { description: '', manufacturer: '' };
      if (version >= 27) patAuth = readPatternAuthoring(r);

      // Pattern pads
      const padCount = r.count('attached footprint pads');
      const pads: DipPad[] = [];
      for (let k = 0; k < padCount; k++) {
        const padAngleRad = version < 27 ? (r.boolean() ? Math.PI / 2 : 0) : 0;
        const number = r.integer();
        const xMm = r.mm();
        const yMm = r.mm();
        const stringNumber = r.text();
        const padName = r.text();
        const geom = readPadGeometry(r);
        r.boolean(); // Locked
        const sided = r.boolean();
        readPadMaskStates(r, version >= 26);
        r.number(); r.number(); // CustomSwell, CustomShrink
        const padObj: DipPad = {
          number,
          netNumber: -1,
          xMm,
          yMm,
          stringNumber,
          name: padName,
          widthMm: geom.widthMm,
          heightMm: geom.heightMm,
          holeMm: geom.holeMm,
          holeHMm: geom.holeHMm,
          holeType: geom.holeType,
          surfacePad: geom.surfacePad,
          shapeCode: geom.shapeCode,
          standard: geom.standard,
          contourMm: geom.contourMm,
          sided,
          padAngleRad,
          padCorner: 0
        };
        if (version >= 27) {
          r.integer(); // Group
          readPadExtensions(r, padObj);
        }
        if (number >= 1) pads.push(padObj);
      }

      // Pattern drawings
      const physicalCoords = version >= 27;
      const drawingPadLinks = version >= 32;
      const extendedFonts = version >= 33;
      const patShapeCount = r.count('pattern drawings');
      const patShapes: DipShape[] = [];
      for (let s = 0; s < patShapeCount; s++) {
        const sh: DipShape = {
          enabled: true,
          orientation: 0,
          type: r.integer(),
          fontSize: 5,
          fontColor: 0,
          fontType: 0,
          fontName: '',
          textLines: [],
          penWidthMm: 0.15,
          pointsMm: [],
          controlsRaw: [],
          layer: 0,
          layId: 0,
          allLayers: false,
          textAngle: 0,
          textShow: 0,
          padId: -1,
          markingGenerated: false,
          showPart: false
        };
        if (!physicalCoords) {
          sh.controlsRaw = [r.number() / 3, r.number() / 3, r.number() / 3, r.number() / 3, r.number() / 3, r.number() / 3];
        }
        r.boolean(); // Locked
        sh.layer = r.integer();
        if (!physicalCoords) sh.textLines = [r.text()];
        sh.fontName = r.text();
        r.boolean(); // VectorFont
        sh.fontSize = r.integer();
        r.number(); r.number(); // FontScale, FontWidth
        sh.orientation = physicalCoords ? 0 : r.integer();
        sh.textShow = r.integer();
        sh.penWidthMm = r.mm();
        sh.pointsMm = r.pointsMm(r.count('pattern drawing points'));
        if (physicalCoords) {
          readTextProperties(r, sh);
          sh.allLayers = r.boolean();
          r.integer(); // Group
        } else {
          expandNormalizedPatternDrawing(sh, patParams.widthMm, patParams.heightMm);
        }
        if (drawingPadLinks) r.integer();
        if (extendedFonts) { r.boolean(); r.number(); }
        patShapes.push(sh);
      }
      const holes = readHoles(r, physicalCoords);
      const dimCount = r.count('pattern dimensions');
      for (let d = 0; d < dimCount; d++) {
        r.boolean(); r.boolean();
        for (let k = 0; k < 10; k++) r.integer();
        for (let k = 0; k < 7; k++) r.number();
        r.integer(); r.boolean(); r.text(); r.integer(); r.number(); r.number(); r.boolean(); r.number();
        r.integer(); r.integer(); r.text();
        if (physicalCoords) r.integer();
        if (extendedFonts) { r.boolean(); r.number(); }
      }

      // Physical metadata
      if (version >= 27) readGroups(r);
      else discardLegacyGroups(r, 3);
      const pufCount = r.count('footprint user fields');
      for (let i = 0; i < pufCount; i++) { r.text(); r.text(); r.integer(); }
      const model3dFile = r.text(true);
      for (let i = 0; i < 9; i++) r.number(); // Offset, Rotate, Zoom
      r.boolean(); // Mirror
      if (version >= 31) r.text(); // Model3DFile_Variable
      r.boolean(); // NoSearch
      if (version >= 22) r.integer(); // Units
      let autoHeightMm = 1.6;
      if (version >= 27) {
        r.number(); r.number();
        autoHeightMm = r.mm();
        r.color();
        r.integer();
      }
      if (version >= 29) r.boolean(); // KeepPins
      let patCatName = '';
      if (version >= 24) {
        r.integer(); // Mounting
        patCatName = r.text();
        r.integer();
        readCategoryTypes(r);
        readPossibleNames(r);
      }

      // Symbol pins
      const pinCount = r.count('symbol pins');
      const rawPins: DipPin[] = [];
      for (let k = 0; k < pinCount; k++) {
        const enabled = r.boolean();
        const type = r.integer();
        const orientation = r.integer();
        const number = r.integer();
        const xMm = r.mm();
        const yMm = r.mm();
        const lengthMm = r.mm();
        const name = r.text();
        const stringNumber = r.text();
        const showName = r.boolean();
        r.number(); r.number(); r.number(); r.number(); // shifts
        if (version >= 28) { r.integer(); r.integer(); }
        const electricType = r.integer();
        r.boolean(); // Locked
        const modelSig = r.text();
        r.integer(); r.number(); r.number(); // PIN_FONT
        if (version >= 25) r.number(); // SignalDelay
        if (version >= 27) r.integer(); // Group
        if (version >= 33) { r.boolean(); r.number(); }
        if (enabled) {
          rawPins.push({
            enabled, type, orientation, number, netNumber: -1,
            xMm, yMm, lengthMm, name, stringNumber, fConnect: false, showName,
            electricType, hidden: false, modelSig, noConnect: false
          });
        }
      }

      // Symbol drawings
      const symShapeCount = r.count('symbol drawings');
      const symShapes: DipShape[] = [];
      for (let s = 0; s < symShapeCount; s++) {
        const sh: DipShape = {
          enabled: r.boolean(),
          orientation: version < 27 ? r.integer() : 0,
          type: r.integer(),
          fontSize: r.integer(),
          fontColor: r.color(),
          fontType: r.integer(),
          fontName: r.text(),
          textLines: version < 27 ? [r.text()] : [],
          penWidthMm: r.mm(),
          pointsMm: r.pointsMm(r.count('symbol drawing points')),
          controlsRaw: [],
          layer: 0,
          layId: 0,
          allLayers: false,
          textAngle: 0,
          textShow: 0,
          padId: -1,
          markingGenerated: false,
          showPart: false
        };
        r.boolean(); // Locked
        r.boolean(); // VectorFont
        r.number(); r.number(); // FontWidth, FontScale
        if (version >= 27) {
          readTextProperties(r, sh);
          r.integer(); // Group
        }
        if (version >= 33) {
          r.boolean();
          sh.fontSize = r.number();
        }
        symShapes.push(sh);
      }

      // Symbol metadata
      if (version >= 27) readGroups(r);
      else discardLegacyGroups(r, 2);
      const sufCount = r.count('symbol user fields');
      for (let i = 0; i < sufCount; i++) { r.text(); r.text(); r.integer(); }
      r.integer(); // ModelType
      r.text(true); // ModelString
      const modelLines = r.count('simulation model lines');
      for (let i = 0; i < modelLines; i++) r.text(true);
      r.integer(); // SubfolderIndex
      const verFlags = r.count('verification flags');
      for (let i = 0; i < verFlags; i++) r.boolean();
      r.text(true); // Datasheet
      if (version >= 24) {
        const mfr = r.text();
        const cat = r.text();
        r.integer();
        readCategoryTypes(r);
        if (pi === 0) {
          compManufacturer = mfr || patAuth.manufacturer;
          compCategory = cat || patCatName;
        }
      }
      if (version >= 30) {
        for (let i = 0; i < 5; i++) r.text(); // Suppliers
      }

      if (pi === 0 && (pads.length > 0 || patParams.name)) {
        const builtPat = buildPatternDefFromDip(
          {
            ...patParams,
            pads,
            shapes: patShapes,
            holes,
            model3dFile,
            model3dAutoHeightMm: autoHeightMm,
            refDes: pRef,
            value: pValue,
            description: patAuth.description,
            manufacturer: patAuth.manufacturer,
            categoryName: patCatName
          },
          'PAT_DTELI',
          libraryName
        );
        attachedPattern = builtPat;
        if (!patternMap.has(builtPat.id)) {
          patternMap.set(builtPat.id, builtPat);
          patterns.push(builtPat);
        }
      }

      const sipPins = rawPins.map((pin, idx) => mapDipPinToSip(pin, idx, pads.length));
      const primitives = convertDipSymbolShapes(symShapes);
      builtParts.push({
        partIndex: pi + 1,
        name: partName || `Секция ${pi + 1}`,
        primitives,
        pins: sipPins
      });
    }

    const cleanName = (compName || compValue || `Component_${ci + 1}`).trim();
    const gostPrefix = mapForeignPrefixToGost(compRef || 'U', `${cleanName} ${compValue}`);
    const gostVal = convertValueToGost(compValue || cleanName, gostPrefix);
    const fallbackPatId = mapForeignPatternToGost(attachedPattern?.name || '', builtParts[0]?.pins.length ?? 2, gostPrefix);
    const patId = attachedPattern && attachedPattern.pads.length > 0 ? attachedPattern.id : fallbackPatId;
    const compId = `COMP_DT_${libraryName.replace(/[^A-Za-z0-9]/g, '_').slice(0, 16)}_${cleanName.replace(/[^A-Za-z0-9]/g, '_').slice(0, 28)}_${ci + 1}`;

    components.push({
      id: compId,
      name: cleanName,
      library: libraryName,
      refDesPrefix: gostPrefix,
      defaultValue: gostVal || cleanName,
      gostStandard: `DipTrace ELI → ГОСТ 2.710-81`,
      description: `${cleanName}${compCategory ? ` · ${compCategory}` : ''} (${libraryName})`,
      manufacturer: compManufacturer || 'DipTrace',
      patternId: patId,
      parts: builtParts.length > 0 ? builtParts : [{ partIndex: 1, name: 'Секция 1', primitives: [], pins: [] }]
    });

    items.push({
      originalRef: compRef || '-',
      gostRef: gostPrefix,
      originalValue: compValue || cleanName,
      gostValue: gostVal || cleanName,
      originalPattern: attachedPattern?.name || '-',
      gostPattern: patId,
      action: `Импортирован из ELI v${version}: ${cleanName} (${gostPrefix}, выводов: ${builtParts[0]?.pins.length ?? 0})`
    });
  }

  return {
    libraryName,
    hint,
    components,
    patterns,
    categories,
    report: {
      sourceFormat: `DipTrace Binary Library (.eli v${version})`,
      convertedComponents: components.length,
      convertedSymbolsToUgo: components.length,
      convertedPatterns: patterns.length,
      items
    }
  };
}

// =========================================================================
// 2. STANDALONE PATTERN LIBRARY (.lib)
// =========================================================================

export function parseDipTraceBinaryLib(bytes: Uint8Array, filename = 'patterns.lib'): {
  libraryName: string;
  hint: string;
  patterns: PatternDef[];
  categories: string[];
  report: GostConversionReport;
} {
  const identity = detectDipTraceBinaryFormat(bytes);
  if (!identity || identity.family !== 'pattern') {
    throw new Error(`Файл ${filename} не является двоичной библиотекой корпусов DipTrace (.lib).`);
  }
  const r = new DipBinaryReader(bytes, identity);
  const version = identity.version;
  const entryCount = r.count('library patterns');
  const libraryName = r.text() || filename.replace(/\.[^.]+$/, '');
  const hint = r.text();
  if (version >= 26) r.take(4);
  const categories = version >= 18 ? readCategories(r) : [];

  const patterns: PatternDef[] = [];
  const items: GostConversionItem[] = [];

  for (let pi = 0; pi < entryCount; pi++) {
    // Pattern parameters (standalone .lib order)
    for (let i = 0; i < 4; i++) r.boolean();
    const widthMm = r.mm();
    const heightMm = r.mm();
    r.mm(); r.mm(); // Spacing1, Spacing2
    r.boolean(); r.mm(); r.boolean(); // VarParam5, Spacing3, LockProperties
    r.integer(); // PatternOrientation
    const number1 = r.integer();
    const number2 = r.integer();
    const type = r.integer();
    const padWidthMm = r.mm();
    const padHeightMm = r.mm();
    const padShape = r.integer();
    const surfacePad = r.boolean();
    const padHoleMm = r.mm();
    r.mm(); // PadHoleH
    r.integer(); // PadHoleType
    const defPadPts = r.count('default pad points');
    r.pointsMm(defPadPts);
    if (version >= 20) {
      r.number(); r.number(); r.number();
      readTerminals(r);
      for (let i = 0; i < 4; i++) r.number();
      readMaskSegments(r);
    }
    if (version >= 21) {
      for (let i = 0; i < 4; i++) r.integer();
      r.number(); r.number();
    }

    // Pads
    const padCount = r.count('pattern pads');
    const pads: DipPad[] = [];
    for (let k = 0; k < padCount; k++) {
      const number = r.integer();
      const xMm = r.mm();
      const yMm = r.mm();
      const padAngleRad = version < 20 ? (r.boolean() ? Math.PI / 2 : 0) : 0;
      const stringNumber = r.text();
      const padName = r.text();
      const geom = readPadGeometry(r);
      r.boolean(); // Locked
      const sided = r.boolean();
      readPadMaskStates(r, version >= 19);
      r.number(); r.number();
      const padObj: DipPad = {
        number, netNumber: -1, xMm, yMm, stringNumber, name: padName,
        widthMm: geom.widthMm, heightMm: geom.heightMm, holeMm: geom.holeMm,
        holeHMm: geom.holeHMm, holeType: geom.holeType, surfacePad: geom.surfacePad,
        shapeCode: geom.shapeCode, standard: geom.standard, contourMm: geom.contourMm,
        sided, padAngleRad, padCorner: 0
      };
      if (version >= 20) {
        r.integer();
        readPadExtensions(r, padObj);
      }
      if (number >= 1) pads.push(padObj);
    }

    // Graphics + holes + dimensions
    const physicalCoords = version >= 20;
    const drawingPadLinks = version >= 25;
    const extendedFonts = version >= 26;
    const patShapeCount = r.count('pattern drawings');
    const patShapes: DipShape[] = [];
    for (let s = 0; s < patShapeCount; s++) {
      const sh: DipShape = {
        enabled: true, orientation: 0, type: r.integer(), fontSize: 5, fontColor: 0,
        fontType: 0, fontName: '', textLines: [], penWidthMm: 0.15, pointsMm: [],
        controlsRaw: [], layer: 0, layId: 0, allLayers: false, textAngle: 0,
        textShow: 0, padId: -1, markingGenerated: false, showPart: false
      };
      if (!physicalCoords) {
        sh.controlsRaw = [r.number() / 3, r.number() / 3, r.number() / 3, r.number() / 3, r.number() / 3, r.number() / 3];
      }
      r.boolean();
      sh.layer = r.integer();
      if (!physicalCoords) sh.textLines = [r.text()];
      sh.fontName = r.text();
      r.boolean();
      sh.fontSize = r.integer();
      r.number(); r.number();
      sh.orientation = physicalCoords ? 0 : r.integer();
      sh.textShow = r.integer();
      sh.penWidthMm = r.mm();
      sh.pointsMm = r.pointsMm(r.count('pattern drawing points'));
      if (physicalCoords) {
        readTextProperties(r, sh);
        sh.allLayers = r.boolean();
        r.integer();
      } else {
        expandNormalizedPatternDrawing(sh, widthMm, heightMm);
      }
      if (drawingPadLinks) r.integer();
      if (extendedFonts) { r.boolean(); r.number(); }
      patShapes.push(sh);
    }
    const holes = readHoles(r, physicalCoords);
    const dimCount = r.count('pattern dimensions');
    for (let d = 0; d < dimCount; d++) {
      r.boolean(); r.boolean();
      for (let k = 0; k < 10; k++) r.integer();
      for (let k = 0; k < 7; k++) r.number();
      r.integer(); r.boolean(); r.text(); r.integer(); r.number(); r.number(); r.boolean(); r.number();
      r.integer(); r.integer(); r.text();
      if (physicalCoords) r.integer();
      if (extendedFonts) { r.boolean(); r.number(); }
    }

    // Metadata
    const pName = r.text();
    const pRefDes = r.text();
    const pValue = r.text();
    const originXMm = r.mm();
    const originYMm = r.mm();
    let description = '';
    let manufacturer = '';
    if (version >= 20) {
      r.boolean(); r.boolean(); r.integer(); r.integer();
      description = r.text(); r.text(); r.text();
      r.boolean(); r.boolean();
      manufacturer = r.text();
      readGroups(r);
    } else {
      discardLegacyGroups(r, 4);
    }
    const ufCount = r.count('pattern user fields');
    for (let i = 0; i < ufCount; i++) { r.text(); r.text(); r.integer(); }
    const model3dFile = r.text(true);
    for (let i = 0; i < 9; i++) r.number();
    r.boolean();
    if (version >= 24) r.text();
    r.boolean();
    if (version >= 16) r.integer();
    let autoHeightMm = 1.6;
    if (version >= 20) {
      r.number(); r.number(); autoHeightMm = r.mm(); r.color(); r.integer();
    }
    if (version >= 22) r.boolean();
    let categoryName = '';
    if (version >= 18) {
      r.integer();
      r.text(true); // Datasheet
      categoryName = r.text();
      r.integer();
      readCategoryTypes(r);
      readPossibleNames(r);
    }
    const verFlags = r.count('verification flags');
    for (let i = 0; i < verFlags; i++) r.boolean();
    if (version >= 23) {
      for (let i = 0; i < 5; i++) r.text();
    }

    const builtPat = buildPatternDefFromDip(
      {
        type, number1, number2, widthMm, heightMm, padWidthMm, padHeightMm,
        padShape, surfacePad, padHoleMm, name: pName || `Pattern_${pi + 1}`,
        originXMm, originYMm, pads, shapes: patShapes, holes,
        model3dFile, model3dAutoHeightMm: autoHeightMm,
        refDes: pRefDes, value: pValue, description, manufacturer, categoryName
      },
      `PAT_DTLIB_${pi + 1}`,
      libraryName
    );
    patterns.push(builtPat);
    items.push({
      originalRef: pRefDes || '-',
      gostRef: builtPat.name,
      originalValue: pValue || '-',
      gostValue: `${builtPat.pads.length} падов`,
      originalPattern: pName,
      gostPattern: builtPat.id,
      action: `Корпус из .lib v${version}: ${builtPat.name}`
    });
  }

  return {
    libraryName,
    hint,
    patterns,
    categories,
    report: {
      sourceFormat: `DipTrace Pattern Library (.lib v${version})`,
      convertedComponents: 0,
      convertedSymbolsToUgo: 0,
      convertedPatterns: patterns.length,
      items
    }
  };
}

// =========================================================================
// 3. BINARY SCHEMATIC (.dch) -> GOST SchematicProject
// =========================================================================

interface DipSchComp {
  enabled: boolean;
  partType: number;
  pageIdx: number;
  xMm: number;
  yMm: number;
  angleDeg: number;
  horzFlip: boolean;
  vertFlip: boolean;
  name: string;
  refDes: string;
  value: string;
  partNumber: number;
  partName: string;
  pins: DipPin[];
  shapes: DipShape[];
  pattern: DipPattern;
}

interface DipSchNet {
  enabled: boolean;
  number: number;
  name: string;
  global: boolean;
  parts: { compIdx: number; pinIdx: number }[];
  wires: { pageIdx: number; pointsMm: Point2D[] }[];
}

function chooseGostSheetFormat(widthMm: number, heightMm: number): SheetFormatId {
  const candidates: SheetFormatId[] = ['A4_L', 'A3_L', 'A2_L', 'A1_L', 'A0_L'];
  for (const fmt of candidates) {
    const dim = SHEET_FORMATS[fmt];
    if (widthMm <= dim.widthMm - 60 && heightMm <= dim.heightMm - 80) return fmt;
  }
  return 'A0_L';
}

function computePinTipWorld(comp: DipSchComp, pin: DipPin): Point2D {
  let tipX = pin.xMm;
  let tipY = pin.yMm;
  const len = pin.lengthMm || 2.54;
  switch (pin.orientation & 3) {
    case 0: tipX -= len; break;
    case 1: tipY -= len; break;
    case 2: tipX += len; break;
    case 3: tipY += len; break;
  }
  return { x: comp.xMm + tipX, y: comp.yMm + tipY };
}

function updateAttachedWireEndpoints(
  wires: SchWire[],
  oldTip: Point2D,
  newTip: Point2D,
  netNameHint?: string
): void {
  if (Math.hypot(oldTip.x - newTip.x, oldTip.y - newTip.y) < 0.02) return;
  for (const w of wires) {
    if (netNameHint && w.netName !== netNameHint) continue;
    if (w.points.length < 2) continue;
    const first = w.points[0];
    if (dist(first, oldTip) < 0.25) {
      if (Math.abs(first.x - newTip.x) > 0.05 && Math.abs(first.y - newTip.y) > 0.05) {
        w.points.unshift({ x: round3(newTip.x), y: round3(newTip.y) });
      } else {
        w.points[0] = { x: round3(newTip.x), y: round3(newTip.y) };
      }
    }
    const lastIdx = w.points.length - 1;
    const last = w.points[lastIdx];
    if (dist(last, oldTip) < 0.25) {
      if (Math.abs(last.x - newTip.x) > 0.05 && Math.abs(last.y - newTip.y) > 0.05) {
        w.points.push({ x: round3(newTip.x), y: round3(newTip.y) });
      } else {
        w.points[lastIdx] = { x: round3(newTip.x), y: round3(newTip.y) };
      }
    }
  }
}

export function parseDipTraceBinarySchematic(bytes: Uint8Array, filename = 'schematic.dch'): {
  project: SchematicProject;
  report: GostConversionReport;
} {
  const identity = detectDipTraceBinaryFormat(bytes);
  if (!identity || identity.family !== 'schematic') {
    throw new Error(`Файл ${filename} не является двоичной схемой DipTrace (.dch).`);
  }
  const r = new DipBinaryReader(bytes, identity);
  const version = identity.version;
  const projectName = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || 'Импорт_DipTrace';

  // Preamble
  r.number(); // Scale
  r.integer(); r.integer(); // Xpos, Ypos
  r.integer(); // ActiveSheet
  const pageCount = r.count('pages');
  const pageNames: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    pageNames.push(r.text() || `Лист ${i + 1}`);
    r.integer();
  }
  r.integer(); // legacy pictures
  for (let i = 0; i < 4; i++) r.integer(); // ShowText..TextAlign2
  r.boolean(); r.number(); r.number(); // HidePower, OriginX/Y
  r.text(); r.text(); // FieldName1/2
  r.boolean(); r.number(); r.number(); // PartFont...
  const ncCount = r.count('net classes');
  for (let i = 0; i < ncCount; i++) {
    r.text(); r.integer(); r.number(); r.number(); r.integer();
  }
  const compCount = r.count('components');

  const rawComps: DipSchComp[] = [];
  for (let ci = 0; ci < compCount; ci++) {
    const enabled = r.boolean();
    r.boolean(); // Selected
    r.integer(); r.integer(); r.integer(); // Type, Number1, Number2
    const pageIdx = r.integer();
    r.integer(); r.integer(); r.integer(); // Orientation, Group, Number
    const xMm = r.mm();
    const yMm = r.mm();
    r.mm(); r.mm(); // Width, Height
    const name = r.text();
    const refDes = r.text();
    const value = r.text();
    r.text(); r.text(); // BaseRef, BaseName
    r.integer(); r.integer(); // ShowText, TextAlign
    r.boolean(); // LockProperties
    const partNumber = r.integer();
    const partType = r.integer();
    const partName = r.text();
    r.text(); r.boolean(); // PartDescriptor, AllowParts
    r.integer(); r.integer(); r.integer(); // ShowText2, TextAlign2, ShowNumbers
    for (let k = 0; k < 4; k++) r.number(); // TextPosX..Y2
    r.text(); r.integer(); // PartString, HiddenId
    const ufCount = r.count('component user fields');
    for (let i = 0; i < ufCount; i++) { r.text(); r.text(); r.integer(); }
    r.integer(); r.integer(); // FieldIndex1/2
    r.boolean(); // Locked
    const rawAngle = r.number();
    const angleDeg = identity.anglesInDegrees ? rawAngle : (rawAngle * 180) / Math.PI;
    r.text(); r.integer(); // LibPath, ModelType
    const modelLines = r.count('model text lines');
    for (let i = 0; i < modelLines; i++) r.text();
    r.text(); r.text(); // ModelString, Datasheet
    const horzFlip = r.boolean();
    const vertFlip = r.boolean();

    // Pins
    const pinCount = r.count('pins');
    const pins: DipPin[] = [];
    for (let pi = 0; pi < pinCount; pi++) {
      const pEnabled = r.boolean();
      const type = r.integer();
      const orientation = r.integer();
      const number = r.integer();
      const netNumber = r.integer();
      const pxMm = r.mm();
      const pyMm = r.mm();
      const lengthMm = r.mm();
      const pName = r.text();
      const stringNumber = r.text();
      const fConnect = r.boolean();
      const showName = r.boolean();
      for (let k = 0; k < 4; k++) r.number();
      const electricType = r.integer();
      const hidden = r.boolean();
      r.boolean(); // Locked
      const modelSig = r.text();
      const noConnect = r.boolean();
      r.integer(); r.number(); r.number(); // PIN_FONT
      pins.push({
        enabled: pEnabled, type, orientation, number, netNumber,
        xMm: pxMm, yMm: pyMm, lengthMm, name: pName, stringNumber,
        fConnect, showName, electricType, hidden, modelSig, noConnect
      });
    }

    // Symbol drawings
    const shapeCount = r.count('component shapes');
    const shapes: DipShape[] = [];
    for (let si = 0; si < shapeCount; si++) {
      const shEnabled = r.boolean();
      const shOrient = r.integer();
      const shTypeRaw = r.integer();
      const generated = shTypeRaw === 700;
      const shType = generated ? 10 : shTypeRaw;
      const fontSize = r.integer();
      const fontColor = r.color();
      const fontType = r.integer();
      const fontName = r.text();
      const shName = r.text();
      const penWidthMm = r.mm();
      const ptsMm = r.pointsMm(r.count('shape points'));
      r.boolean(); r.boolean(); // Locked, VectorFont
      r.number(); r.number(); // FontWidth, FontScale
      shapes.push({
        enabled: shEnabled, orientation: shOrient, type: shType,
        fontSize, fontColor, fontType, fontName, textLines: [shName],
        penWidthMm, pointsMm: ptsMm, controlsRaw: [], layer: 0, layId: 0,
        allLayers: false, textAngle: 0, textShow: 0, padId: -1,
        markingGenerated: generated, showPart: false
      });
    }

    // Embedded pattern
    const intConCount = r.count('footprint internal connections');
    for (let i = 0; i < intConCount; i++) { r.integer(); r.integer(); }
    const patParams = readPatternParameters(r);
    r.mm(); r.mm(); r.boolean(); // Origin_X, Origin_Y, ShowOrigin
    const pufCount = r.count('footprint user fields');
    for (let i = 0; i < pufCount; i++) { r.text(); r.text(); r.integer(); }
    r.pointsMm(r.count('footprint default pad points'));
    const padCount = r.count('footprint pads');
    const pads: DipPad[] = [];
    for (let k = 0; k < padCount; k++) {
      const padAngleRad = r.boolean() ? Math.PI / 2 : 0;
      const number = r.integer();
      const px = r.mm();
      const py = r.mm();
      const sNum = r.text();
      const pNam = r.text();
      const geom = readPadGeometry(r);
      r.boolean(); // Locked
      const sided = r.boolean();
      readPadMaskStates(r, false);
      r.number(); r.number();
      if (number >= 1) {
        pads.push({
          number, netNumber: -1, xMm: px, yMm: py, stringNumber: sNum, name: pNam,
          widthMm: geom.widthMm, heightMm: geom.heightMm, holeMm: geom.holeMm,
          holeHMm: geom.holeHMm, holeType: geom.holeType, surfacePad: geom.surfacePad,
          shapeCode: geom.shapeCode, standard: geom.standard, contourMm: geom.contourMm,
          sided, padAngleRad, padCorner: 0
        });
      }
    }
    const patShapeCount = r.count('footprint shapes');
    const patShapes: DipShape[] = [];
    for (let s = 0; s < patShapeCount; s++) {
      const stype = r.integer();
      const controlsRaw = [r.number() / 3, r.number() / 3, r.number() / 3, r.number() / 3, r.number() / 3, r.number() / 3];
      r.boolean(); // Locked
      const layer = r.integer();
      const txt = r.text();
      const fontName = r.text();
      r.boolean();
      const fontSize = r.integer();
      r.number(); r.number();
      const orient = r.integer();
      const textShow = r.integer();
      const penWidthMm = r.mm();
      const ptsMm = r.pointsMm(r.count('footprint shape points'));
      const sh: DipShape = {
        enabled: true, orientation: orient, type: stype, fontSize, fontColor: 0,
        fontType: 0, fontName, textLines: [txt], penWidthMm, pointsMm: ptsMm,
        controlsRaw, layer, layId: 0, allLayers: false, textAngle: 0, textShow,
        padId: -1, markingGenerated: false, showPart: false
      };
      if (version < 40) expandNormalizedPatternDrawing(sh, patParams.widthMm, patParams.heightMm);
      patShapes.push(sh);
    }
    const holes = readHoles(r, false);
    readDimensions(r, false);
    const model3dFile = r.text();
    for (let i = 0; i < 9; i++) r.number();
    r.boolean(); r.boolean();

    rawComps.push({
      enabled, partType, pageIdx, xMm, yMm, angleDeg, horzFlip, vertFlip,
      name, refDes, value, partNumber, partName,
      pins, shapes,
      pattern: {
        ...patParams, pads, shapes: patShapes, holes,
        model3dFile, model3dAutoHeightMm: 1.6, refDes, value,
        description: '', manufacturer: '', categoryName: ''
      }
    });
  }

  // PageConnectors
  const pageConns: { enabled: boolean; xMm: number; yMm: number; pageIdx: number; name: string }[] = [];
  const pcCount = r.count('page connectors');
  for (let i = 0; i < pcCount; i++) {
    const enabled = r.boolean();
    r.boolean(); r.boolean();
    const xMm = r.mm();
    const yMm = r.mm();
    const pageIdx = r.integer();
    r.integer(); r.integer(); r.integer(); r.integer();
    const name = r.text();
    r.boolean();
    pageConns.push({ enabled, xMm, yMm, pageIdx, name });
  }

  // Schematic drawings
  const schDrawings: { enabled: boolean; type: number; pageIdx: number; pointsMm: Point2D[]; text: string; penWidthMm: number; fontSize: number }[] = [];
  const sdCount = r.count('schematic shapes');
  for (let i = 0; i < sdCount; i++) {
    const enabled = r.boolean();
    r.boolean(); r.integer();
    const type = r.integer();
    const fontSize = r.integer();
    r.color(); r.color(); r.color();
    r.integer();
    const pageIdx = r.integer();
    r.integer();
    const penWidthMm = r.mm();
    r.text();
    const text = r.text();
    r.integer();
    const ptsMm = r.pointsMm(r.count('schematic shape points'));
    r.integer(); r.integer(); r.boolean(); r.boolean();
    r.number(); r.number();
    schDrawings.push({ enabled, type, pageIdx, pointsMm: ptsMm, text, penWidthMm, fontSize });
  }

  // Nets & wires
  const rawNets: DipSchNet[] = [];
  const netCount = r.count('nets');
  for (let ni = 0; ni < netCount; ni++) {
    const enabled = r.boolean();
    r.boolean(); r.boolean(); r.boolean();
    r.integer(); r.integer();
    const number = r.integer();
    r.integer();
    const name = r.text() || `NET_${ni + 1}`;
    r.number(); r.number(); r.integer();
    const global = r.boolean();
    const parts: { compIdx: number; pinIdx: number }[] = [];
    const npCount = r.count('net pin references');
    for (let k = 0; k < npCount; k++) {
      parts.push({ compIdx: r.integer(), pinIdx: r.integer() });
    }
    const wires: { pageIdx: number; pointsMm: Point2D[] }[] = [];
    const lineCount = r.count('net lines');
    for (let l = 0; l < lineCount; l++) {
      for (let k = 0; k < 6; k++) r.integer();
      const pageIdx = r.integer();
      for (let k = 0; k < 5; k++) r.integer();
      const hidden = r.boolean();
      const ptCnt = r.count('wire points');
      const pointsMm: Point2D[] = [];
      for (let p = 0; p < ptCnt; p++) {
        const wx = r.mm();
        const wy = r.mm();
        r.integer(); // point style/junction flag
        pointsMm.push({ x: wx, y: wy });
      }
      r.boolean(); r.integer(); r.boolean(); r.integer();
      if (!hidden && pointsMm.length >= 2) {
        wires.push({ pageIdx, pointsMm });
      }
    }
    r.boolean(); r.boolean(); r.color();
    if (enabled) rawNets.push({ enabled, number, name, global, parts, wires });
  }

  // Buses
  const rawBuses: { pageIdx: number; name: string; lines: Point2D[][] }[] = [];
  const busCount = r.count('buses');
  for (let bi = 0; bi < busCount; bi++) {
    const bEnabled = r.boolean();
    r.boolean();
    for (let k = 0; k < 5; k++) r.integer();
    const bName = r.text();
    const bnCount = r.count('bus nets');
    for (let k = 0; k < bnCount; k++) r.integer();
    const blCount = r.count('bus lines');
    const lines: { pageIdx: number; pts: Point2D[] }[] = [];
    for (let l = 0; l < blCount; l++) {
      for (let k = 0; k < 6; k++) r.integer();
      const pageIdx = r.integer();
      for (let k = 0; k < 5; k++) r.integer();
      const ptCnt = r.count('bus wire points');
      const pts: Point2D[] = [];
      for (let p = 0; p < ptCnt; p++) {
        pts.push({ x: r.mm(), y: r.mm() });
        r.integer();
      }
      r.boolean(); r.integer();
      if (pts.length >= 2) lines.push({ pageIdx, pts });
    }
    r.boolean();
    const numCnt = r.count('bus numbers');
    for (let k = 0; k < numCnt; k++) r.integer();
    if (bEnabled) {
      for (const ln of lines) rawBuses.push({ pageIdx: ln.pageIdx, name: bName || 'BUS', lines: [ln.pts] });
    }
  }

  // Try to read extensions for v40+ Pattern physical coordinates / PageHiddenId if intact
  // Note: Groups, PageLayouts, Tables, Settings, Extensions
  const warnings: string[] = [];
  try {
    readGroups(r);
    // Page layouts
    r.integer();
    for (let p = 0; p < pageCount; p++) {
      r.number(); r.number();
      for (let k = 0; k < 4; k++) r.number();
      for (let t = 0; t < 6; t++) readTitleBlock(r);
      r.boolean(); r.integer(); r.integer(); r.integer();
      r.text(); r.integer(); r.boolean(); r.number(); r.number();
      r.integer(); r.integer(); r.number(); r.number(); r.integer();
    }
    // Tables
    const tblCount = r.count('tables');
    for (let t = 0; t < tblCount; t++) {
      r.boolean(); r.boolean();
      for (let k = 0; k < 6; k++) r.integer();
      r.color();
      for (let k = 0; k < 6; k++) r.number();
      r.text(); r.text();
      const cols = r.count('table columns');
      for (let c = 0; c < cols; c++) r.number();
      const rows = r.count('table rows');
      for (let rw = 0; rw < rows; rw++) r.number();
      for (let cell = 0; cell < cols * rows; cell++) {
        r.boolean(); r.integer(); r.integer(); r.integer(); r.color();
        r.text(); r.text();
        r.number(); r.number(); r.number(); r.number();
        r.boolean(); r.number(); r.number();
      }
      r.boolean(); r.boolean(); r.number(); r.number(); r.boolean();
    }
    // Settings
    r.number(); r.boolean(); r.color(); r.integer(); r.integer();
    for (let k = 0; k < 9; k++) r.boolean();
    for (let k = 0; k < 5; k++) r.number();
    for (let k = 0; k < 7; k++) r.boolean();
    r.text(); r.text();
    if (version >= 30) r.boolean();

    // Extensions to 33
    if (version >= 31) {
      for (const c of rawComps) {
        r.integer();
        for (let k = 0; k < c.pins.length; k++) r.text();
      }
    }
    if (version >= 32) {
      for (const c of rawComps) {
        r.integer();
        c.pattern.categoryName = r.text();
        r.integer();
        readCategoryTypes(r);
        readPossibleNames(r);
        c.pattern.manufacturer = r.text();
        r.text(); r.integer();
        readCategoryTypes(r);
      }
    }
    if (version >= 33) {
      for (let p = 0; p < pageCount; p++) r.integer();
      for (const c of rawComps) {
        const hid = r.integer();
        void hid;
      }
    }
  } catch (e) {
    warnings.push(`Часть вспомогательных секций таблицы/настроек .dch v${version} пропущена: ${(e as Error).message}`);
  }

  // Build map from (compIdx, pinIdx) -> netName
  const pinToNet = new Map<string, string>();
  for (const n of rawNets) {
    for (const pt of n.parts) {
      pinToNet.set(`${pt.compIdx}:${pt.pinIdx}`, n.name);
    }
  }

  // Build GOST SchematicSheets (one per DipTrace Page)
  const customComponentDefs: Record<string, ComponentDef> = {};
  const customPatternDefs: Record<string, PatternDef> = {};
  const usedRefs = new Set<string>();
  const items: GostConversionItem[] = [];
  let convertedSymbolsToUgo = 0;

  const allocUniqueRef = (prefix: string, origRef: string): string => {
    const numMatch = /(\d+)$/.exec(origRef);
    let n = numMatch ? parseInt(numMatch[1], 10) : 1;
    while (usedRefs.has(`${prefix}${n}`)) n++;
    const ref = `${prefix}${n}`;
    usedRefs.add(ref);
    return ref;
  };

  const sheets: SchematicSheet[] = [];
  const totalPages = Math.max(1, pageCount);

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageComps = rawComps
      .map((c, idx) => ({ comp: c, origIdx: idx }))
      .filter(({ comp }) => comp.enabled && (comp.pageIdx === pageIdx || (pageIdx === 0 && (comp.pageIdx < 0 || comp.pageIdx >= totalPages))));

    const pageWiresRaw: { netName: string; pts: Point2D[] }[] = [];
    for (const n of rawNets) {
      for (const w of n.wires) {
        if (w.pageIdx === pageIdx || (pageIdx === 0 && (w.pageIdx < 0 || w.pageIdx >= totalPages))) {
          pageWiresRaw.push({ netName: n.name, pts: w.pointsMm.map((p) => ({ ...p })) });
        }
      }
    }
    const pageBusesRaw = rawBuses.filter((b) => b.pageIdx === pageIdx || (pageIdx === 0 && (b.pageIdx < 0 || b.pageIdx >= totalPages)));
    const pageConnsRaw = pageConns.filter((pc) => pc.enabled && (pc.pageIdx === pageIdx || (pageIdx === 0 && (pc.pageIdx < 0 || pc.pageIdx >= totalPages))));
    const pageDrawingsRaw = schDrawings.filter((sd) => sd.enabled && (sd.pageIdx === pageIdx || (pageIdx === 0 && (sd.pageIdx < 0 || sd.pageIdx >= totalPages))));

    // Compute raw bounds to auto-select GOST format & shift smoothly into frame
    const allX: number[] = [];
    const allY: number[] = [];
    for (const { comp } of pageComps) {
      allX.push(comp.xMm);
      allY.push(comp.yMm);
      for (const pin of comp.pins) {
        const tip = computePinTipWorld(comp, pin);
        allX.push(tip.x);
        allY.push(tip.y);
      }
    }
    for (const w of pageWiresRaw) for (const p of w.pts) { allX.push(p.x); allY.push(p.y); }
    for (const pc of pageConnsRaw) { allX.push(pc.xMm); allY.push(pc.yMm); }
    for (const sd of pageDrawingsRaw) for (const p of sd.pointsMm) { allX.push(p.x); allY.push(p.y); }

    const minX = allX.length ? Math.min(...allX) : 0;
    const maxX = allX.length ? Math.max(...allX) : 100;
    const minY = allY.length ? Math.min(...allY) : 0;
    const maxY = allY.length ? Math.max(...allY) : 70;
    const spanW = Math.max(40, maxX - minX);
    const spanH = Math.max(40, maxY - minY);
    const format = chooseGostSheetFormat(spanW, spanH);
    const frame = getGostFrameRect(format);
    // Center in usable area above the 55mm ГОСТ 2.104 title block
    const usableW = frame.width - 20;
    const usableH = frame.height - 65;
    const targetLeft = frame.left + Math.max(15, (usableW - spanW) / 2);
    const targetTop = frame.top + Math.max(15, (usableH - spanH) / 2);
    const shiftX = Math.round((targetLeft - minX) / 2.5) * 2.5;
    const shiftY = Math.round((targetTop - minY) / 2.5) * 2.5;

    const wires: SchWire[] = pageWiresRaw.map((w) => ({
      id: uid('dtw'),
      netName: w.netName,
      points: w.pts.map((p) => ({ x: round3(p.x + shiftX), y: round3(p.y + shiftY) }))
    }));

    const netPorts: SchNetPort[] = pageConnsRaw.map((pc) => ({
      id: uid('dtnp'),
      netName: pc.name || 'NET',
      style: /GND|VSS/i.test(pc.name) ? 'Ground' : /VCC|VDD|\+/i.test(pc.name) ? 'Power' : 'OffPageOut',
      x: round3(pc.xMm + shiftX),
      y: round3(pc.yMm + shiftY),
      angle: 0
    }));

    const buses: SchBus[] = pageBusesRaw.map((b) => ({
      id: uid('dtbus'),
      busName: b.name,
      points: b.lines[0].map((p) => ({ x: round3(p.x + shiftX), y: round3(p.y + shiftY) }))
    }));

    const shapes: SchShape[] = [];
    for (const sd of pageDrawingsRaw) {
      if (sd.pointsMm.length === 0) continue;
      const pts = sd.pointsMm.map((p) => ({ x: round3(p.x + shiftX), y: round3(p.y + shiftY) }));
      const pw = Math.max(0.15, sd.penWidthMm || 0.25);
      if (sd.type === 0 && pts.length >= 2) {
        for (let k = 1; k < pts.length; k++) {
          shapes.push({ id: uid('dts'), type: 'line', x1: pts[k - 1].x, y1: pts[k - 1].y, x2: pts[k].x, y2: pts[k].y, width: pw });
        }
      } else if ((sd.type === 2 || sd.type === 3) && pts.length >= 2) {
        const x = Math.min(pts[0].x, pts[1].x);
        const y = Math.min(pts[0].y, pts[1].y);
        shapes.push({ id: uid('dts'), type: 'rect', x, y, w: round3(Math.abs(pts[1].x - pts[0].x)), h: round3(Math.abs(pts[1].y - pts[0].y)), width: pw, fill: sd.type === 3 });
      } else if (sd.type === 6 && sd.text.trim()) {
        shapes.push({ id: uid('dts'), type: 'text', x: pts[0].x, y: pts[0].y, text: sd.text.trim(), size: Math.max(2.0, (sd.fontSize || 7) * 0.45) });
      }
    }

    const placedComps: PlacedComponent[] = [];
    for (const { comp, origIdx } of pageComps) {
      const compX = round3(comp.xMm + shiftX);
      const compY = round3(comp.yMm + shiftY);
      const activePins = comp.pins.filter((p) => p.enabled);

      // Power / NetPort symbols (PartType 1=Power, 2=NetPort, or 1-pin GND/VCC) -> SchNetPort!
      const hintStr = `${comp.name} ${comp.value} ${comp.refDes}`.trim();
      const isPowerOrPort =
        comp.partType === 1 ||
        comp.partType === 2 ||
        (activePins.length === 1 && /^(GND|VSS|VCC|VDD|\+?\d+V\d*|NetPort\d*)$/i.test(comp.name || comp.refDes));
      if (isPowerOrPort && activePins.length >= 1) {
        const tip = computePinTipWorld(comp, activePins[0]);
        const netName =
          pinToNet.get(`${origIdx}:0`) ||
          (/NetPort/i.test(comp.name) ? activePins[0].name : comp.name) ||
          activePins[0].name ||
          'GND';
        const isGnd = /GND|VSS|0V/i.test(netName) || /GND|VSS/i.test(comp.name);
        const isPwr = !isGnd && (/VCC|VDD|\+|V\d|PWR/i.test(netName) || comp.partType === 1);
        const pOrient = activePins[0].orientation & 3;
        const portAngle: 0 | 90 | 180 | 270 = pOrient === 1 ? 0 : pOrient === 3 ? 180 : pOrient === 0 ? 270 : 90;
        netPorts.push({
          id: uid('dtnp'),
          netName,
          style: isGnd ? 'Ground' : isPwr ? 'Power' : 'OffPageOut',
          x: round3(tip.x + shiftX),
          y: round3(tip.y + shiftY),
          angle: portAngle
        });
        continue;
      }

      // Register embedded DipTrace pattern if it has pads so Schematic->PCB keeps exact pad layout
      let embeddedPatId = '';
      if (comp.pattern.pads.length > 0) {
        const builtPat = buildPatternDefFromDip(comp.pattern, 'PAT_DT_SCH', 'DipTrace Импорт');
        if (!customPatternDefs[builtPat.id]) customPatternDefs[builtPat.id] = builtPat;
        embeddedPatId = builtPat.id;
      }

      const sipPins = activePins.map((p, idx) => mapDipPinToSip(p, idx, comp.pattern.pads.length));
      const gostRes = resolveOrBuildGostComponent({
        rawRef: comp.refDes || 'U1',
        rawName: comp.name || comp.value || comp.refDes,
        rawValue: comp.value || comp.name || '',
        rawPattern: comp.pattern.name || '',
        pins: sipPins.map((p) => ({ number: p.number, name: p.name, x: p.x, y: p.y })),
        customDefs: customComponentDefs
      });

      const gostRef = allocUniqueRef(gostRes.gostRefPrefix, comp.refDes || `${gostRes.gostRefPrefix}1`);
      const gostDef = findComponentById(gostRes.defId, customComponentDefs);

      // If 2-pin passive/diode mapped to a built-in GOST 2-pin UGO (e.g. МЛТ, К10-17, КД522, ДМ),
      // align angle/position to DipTrace pin vector & reconnect wire tips cleanly!
      const isBuiltInTwoPin =
        gostDef &&
        !gostRes.defId.startsWith('CUST_') &&
        gostDef.parts[0]?.pins.length === 2 &&
        sipPins.length === 2;

      if (isBuiltInTwoPin) {
        const oldTip0 = computePinTipWorld(comp, activePins[0]);
        const oldTip1 = computePinTipWorld(comp, activePins[1]);
        const oldWorld0 = { x: oldTip0.x + shiftX, y: oldTip0.y + shiftY };
        const oldWorld1 = { x: oldTip1.x + shiftX, y: oldTip1.y + shiftY };
        const midX = round3((oldWorld0.x + oldWorld1.x) / 2);
        const midY = round3((oldWorld0.y + oldWorld1.y) / 2);
        const dx = oldWorld1.x - oldWorld0.x;
        const dy = oldWorld1.y - oldWorld0.y;
        let angle: 0 | 90 | 180 | 270 = 0;
        if (Math.abs(dx) >= Math.abs(dy)) angle = dx >= 0 ? 0 : 180;
        else angle = dy >= 0 ? 90 : 270;

        const gPin0 = gostDef.parts[0].pins[0];
        const gPin1 = gostDef.parts[0].pins[1];
        const newWorld0 = transformPoint(gPin0.x, gPin0.y, midX, midY, angle, false, false);
        const newWorld1 = transformPoint(gPin1.x, gPin1.y, midX, midY, angle, false, false);
        const net0 = pinToNet.get(`${origIdx}:0`);
        const net1 = pinToNet.get(`${origIdx}:1`);
        updateAttachedWireEndpoints(wires, oldWorld0, newWorld0, net0);
        updateAttachedWireEndpoints(wires, oldWorld1, newWorld1, net1);

        convertedSymbolsToUgo++;
        const patId = embeddedPatId || gostRes.gostPatternId;
        placedComps.push({
          id: uid('dtsch'),
          componentDefId: gostDef.id,
          libraryId: 'lib_gost_import',
          refDes: gostRef,
          value: gostRes.gostValue,
          typeName: gostRes.gostTypeName,
          partIndex: 1,
          x: midX,
          y: midY,
          angle,
          flipX: false,
          flipY: false,
          patternId: patId,
          refDesOffset: angle === 90 || angle === 270 ? { x: 6, y: -2 } : { x: 0, y: -7 },
          valueOffset: angle === 90 || angle === 270 ? { x: 6, y: 3 } : { x: 0, y: 7 },
          showRefDes: true,
          showValue: true
        });
        items.push({
          originalRef: comp.refDes,
          gostRef,
          originalValue: comp.value || comp.name,
          gostValue: gostRes.gostValue,
          originalPattern: comp.pattern.name || '-',
          gostPattern: patId,
          action: `${comp.refDes} → ${gostRef} (УГО ГОСТ + сопряжение цепей)`
        });
        continue;
      }

      // Multi-pin IC / Transistor / Connector / Custom:
      // Preserve exact DipTrace pin coordinates (already rotation-baked!) and symbol primitives
      // inside a GOST-annotated custom ComponentDef so 100% of wires remain connected.
      const primitives = convertDipSymbolShapes(comp.shapes);
      if (primitives.length === 0 && sipPins.length > 0) {
        const xs = sipPins.map((p) => p.x);
        const ys = sipPins.map((p) => p.y);
        const rx = Math.min(...xs) + 2.5;
        const ry = Math.min(...ys) - 2.5;
        const rw = Math.max(10, Math.max(...xs) - Math.min(...xs) - 5);
        const rh = Math.max(10, Math.max(...ys) - Math.min(...ys) + 5);
        primitives.push({ type: 'rect', x: round3(rx), y: round3(ry), w: round3(rw), h: round3(rh), width: 0.4 });
      }
      const exactKey = `CUST_DT_SCH_${(comp.name || gostRef).replace(/[^A-Za-z0-9]/g, '_').slice(0, 20)}_${origIdx}`;
      const patId = embeddedPatId || gostRes.gostPatternId;
      customComponentDefs[exactKey] = {
        id: exactKey,
        name: `${comp.name || gostRes.gostValue} (ГОСТ)`,
        library: 'Импорт DipTrace (ГОСТ)',
        refDesPrefix: gostRes.gostRefPrefix,
        defaultValue: gostRes.gostValue || comp.name || 'ЭРЭ',
        gostStandard: 'ГОСТ 2.743-91 (Импорт DipTrace)',
        description: `${hintStr} · импортировано из .dch v${version}`,
        manufacturer: comp.pattern.manufacturer || 'DipTrace',
        patternId: patId,
        parts: [{
          partIndex: 1,
          name: comp.partName || 'Секция 1',
          primitives,
          pins: sipPins
        }]
      };
      convertedSymbolsToUgo++;
      placedComps.push({
        id: uid('dtsch'),
        componentDefId: exactKey,
        libraryId: 'lib_gost_import',
        refDes: gostRef,
        value: gostRes.gostValue,
        typeName: gostRes.gostTypeName,
        partIndex: 1,
        x: compX,
        y: compY,
        angle: 0, // DipTrace placed pins & shapes already include placed rotation/flip
        flipX: false,
        flipY: false,
        patternId: patId,
        refDesOffset: { x: 0, y: -10 },
        valueOffset: { x: 0, y: 10 },
        showRefDes: true,
        showValue: true
      });
      items.push({
        originalRef: comp.refDes,
        gostRef,
        originalValue: comp.value || comp.name,
        gostValue: gostRes.gostValue,
        originalPattern: comp.pattern.name || '-',
        gostPattern: patId,
        action: `${comp.refDes} → ${gostRef} (${sipPins.length} выв., контуры DipTrace → ГОСТ)`
      });
    }

    sheets.push({
      id: `sheet_${pageIdx + 1}`,
      name: pageNames[pageIdx] || `Лист ${pageIdx + 1}`,
      format,
      titleBlock: createDefaultGostTitleBlock({
        name: projectName,
        form: pageIdx === 0 ? 'Form1' : 'Form2a',
        sheetNumber: pageIdx + 1,
        totalSheets: totalPages
      }),
      components: placedComps,
      wires,
      buses,
      busTaps: [],
      junctions: [],
      netPorts,
      diffPairs: [],
      hierarchyBlocks: [],
      shapes
    });
  }

  const project: SchematicProject = {
    version: '1.0',
    filePath: `${projectName}.gostsch`,
    projectName,
    units: 'mm',
    gridSize: 2.5,
    origin: { x: 0, y: 0 },
    sheets,
    activeSheetId: sheets[0].id,
    netClasses: [
      { id: 'nc_default', name: 'Сигнальные', traceWidth: 0.25, minWidth: 0.15, maxWidth: 5, clearance: 0.2, viaOuterDiameter: 0.7, viaHoleDiameter: 0.35 }
    ],
    netClassAssignments: {},
    customComponentDefs,
    customPatternDefs
  };

  return {
    project,
    report: {
      sourceFormat: `DipTrace Binary Schematic (.dch v${version})`,
      convertedComponents: items.length,
      convertedSymbolsToUgo,
      convertedPatterns: Object.keys(customPatternDefs).length,
      items,
      warnings: warnings.length > 0 ? warnings : undefined
    }
  };
}

// =========================================================================
// 4. BINARY PCB (.dip) -> GOST PcbProject
// =========================================================================

interface DipPcbComp {
  enabled: boolean;
  angleRad: number;
  bottomSide: boolean;
  flipped: boolean;
  horzFlip: boolean;
  xMm: number;
  yMm: number;
  name: string;
  refDes: string;
  value: string;
  pads: DipPad[];
  shapes: DipShape[];
  holes: DipPattern['holes'];
  patParams: ReturnType<typeof readPatternParameters>;
  extraDeg: number;
}

interface DipPcbTracePt {
  xMm: number;
  yMm: number;
  lay: number;
  widthMm: number;
  arc: boolean;
  viaStyle: number;
}

interface DipPcbNet {
  enabled: boolean;
  number: number;
  name: string;
  widthMm: number;
  pads: { compIdx: number; padIdx: number }[];
  traces: DipPcbTracePt[][];
}

interface DipPcbPour {
  enabled: boolean;
  poured: boolean;
  lineWidthMm: number;
  clearanceMm: number;
  lay: number;
  netId: number;
  outlineMm: Point2D[];
  type: number;
  boardClearanceMm: number;
  priority: number;
}

function mapCopperLayer(layIdx: number, copperCount: number): 'TopCopper' | 'Inner1' | 'Inner2' | 'BottomCopper' {
  if (layIdx <= 0) return 'TopCopper';
  if (copperCount > 2) {
    if (layIdx === 1) return 'Inner1';
    if (layIdx === 2 && copperCount >= 4) return 'Inner2';
    if (layIdx < copperCount - 1) return 'Inner1';
  }
  return 'BottomCopper';
}

function mapBoardShapeLayer(layerCode: number): PcbLayerId | null {
  switch (layerCode) {
    case 0: return 'TopAssembly';
    case 1: return 'TopSilk';
    case 2:
    case 11: return 'Keepout';
    case 3: return 'TopCopper';
    case 4: return 'BottomSilk';
    case 5: return 'BottomAssembly';
    case 6: return 'TopMask';
    case 7: return 'TopPaste';
    case 8: return 'BottomPaste';
    case 9: return 'BottomMask';
    case 10: return 'BoardOutline'; // Board Cutout handled separately
    case 16:
    case 17: return 'Courtyard';
    default: return null;
  }
}

export function parseDipTraceBinaryPcb(bytes: Uint8Array, filename = 'board.dip'): {
  pcb: PcbProject;
  report: GostConversionReport;
} {
  const identity = detectDipTraceBinaryFormat(bytes);
  if (!identity || identity.family !== 'pcb') {
    throw new Error(`Файл ${filename} не является двоичной платой DipTrace (.dip).`);
  }
  const r = new DipBinaryReader(bytes, identity);
  const version = identity.version;
  const projectName = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || 'Импорт_DipTrace_Плата';

  // Preamble
  r.number(); r.integer(); r.integer(); // Scale, Xpos, Ypos
  r.text(); // RelSchem
  const outlineEnabled = r.boolean();
  for (let i = 0; i < 4; i++) r.number();
  const outlineCount = r.count('board outline points');
  const outlinePtsRaw: Point2D[] = [];
  for (let i = 0; i < outlineCount; i++) {
    outlinePtsRaw.push({ x: r.mm(), y: r.mm() });
    r.boolean(); // Arc
  }
  r.boolean(); r.integer(); r.integer(); r.number(); r.number();
  if (version > 31) {
    r.boolean();
    for (let i = 0; i < 4; i++) r.number();
  }
  r.boolean(); r.boolean(); r.boolean(); // Locked, Toplock, Bottomlock

  // Copper layers
  const layerCount = r.count('copper layers');
  for (let i = 0; i < layerCount; i++) {
    r.boolean(); r.integer(); r.color(); r.text();
    r.integer(); r.integer(); r.integer(); r.number(); r.boolean();
  }
  r.count('legacy picture companions');
  for (let i = 0; i < 4; i++) r.integer(); // legacy_markings
  r.integer(); r.text(); // CompFontSize, CompFontName
  r.number(); r.number(); // OriginX, OriginY
  r.boolean(); r.number(); r.number(); // PatternFont...
  for (let i = 0; i < 5; i++) r.boolean(); // AssyObj...
  r.text(); r.text(); // UserField1/2
  r.boolean(); // LockNetStructure

  if (version > 32) {
    const nsCount = r.count('non-signal layers');
    for (let i = 0; i < nsCount; i++) { r.text(); r.color(); r.integer(); r.integer(); }
    const hsCount = r.count('hierarchy sheets');
    for (let i = 0; i < hsCount; i++) {
      r.text(); r.integer();
      const bCnt = r.count('hierarchy blocks');
      for (let b = 0; b < bCnt; b++) { r.integer(); r.text(); }
    }
  }

  // ViaStyles & NetClasses
  const viaStyles: { outerMm: number; holeMm: number }[] = [];
  const vsCount = r.count('via styles');
  for (let i = 0; i < vsCount; i++) {
    r.text(); r.boolean();
    const outerMm = r.mm();
    const holeMm = r.mm();
    r.integer(); r.integer();
    viaStyles.push({ outerMm: Math.max(0.4, outerMm), holeMm: Math.max(0.2, holeMm) });
  }
  const ncCount = r.count('net classes');
  const ncLayerCounts: number[] = [];
  for (let i = 0; i < ncCount; i++) {
    r.text(); r.integer();
    for (let k = 0; k < 4; k++) r.boolean();
    const lpCnt = r.count('class layer properties');
    ncLayerCounts.push(lpCnt);
    for (let l = 0; l < lpCnt; l++) {
      for (let k = 0; k < 5; k++) r.number();
      for (let k = 0; k < 20; k++) r.number();
    }
    r.number(); r.number();
    const avCnt = r.count('allowed via styles');
    for (let a = 0; a < avCnt; a++) r.integer();
    for (let k = 0; k < 4; k++) r.boolean();
    r.integer(); r.integer();
    r.number(); r.number(); r.number();
    const rlCnt = r.count('routing layer flags');
    for (let l = 0; l < rlCnt; l++) r.boolean();
    r.integer();
  }
  r.boolean(); // ClassToClass
  const ccRows = r.count('class clearance rows');
  for (let rIdx = 0; rIdx < ccRows; rIdx++) {
    const ccCols = r.count('class clearance columns');
    for (let cIdx = 0; cIdx < ccCols; cIdx++) {
      r.boolean();
      const vCnt = r.count('class clearances');
      for (let v = 0; v < vCnt; v++) r.number();
    }
  }

  // Components
  const compCount = r.count('components');
  const rawComps: (DipPcbComp & { ufCount: number; dimCount: number })[] = [];
  for (let ci = 0; ci < compCount; ci++) {
    const enabled = r.boolean();
    r.boolean(); // Selected
    const patType = r.integer();
    const patNum1 = r.integer();
    const patNum2 = r.integer();
    const orientation = r.integer();
    const angleRad = (orientation * Math.PI) / 2;
    r.integer(); r.integer(); // Group, Number
    const patPadShape = r.integer();
    const patSurfacePad = r.boolean();
    for (let k = 0; k < 4; k++) r.integer();
    for (let k = 0; k < 4; k++) r.number();
    const bottomSide = r.boolean();
    r.integer(); // ConnectedLayer
    const flipped = r.boolean();
    r.integer(); // HiddenId
    const patOrigXMm = r.mm();
    const patOrigYMm = r.mm();
    r.boolean(); // OriginCommon
    const horzFlip = r.boolean();
    const ufCount = r.count('component user fields');
    for (let i = 0; i < ufCount; i++) { r.text(); r.text(); r.integer(); }
    r.integer(); r.integer();
    const extraDeg = r.number();
    r.boolean(); r.text(); r.integer(); // Locked, LibPath, GsType
    r.pointsMm(r.count('default pad contour points'));
    for (let k = 0; k < 4; k++) r.boolean();
    const xMm = r.mm();
    const yMm = r.mm();
    r.number(); r.number(); r.boolean(); r.number(); r.boolean();
    r.boolean(); // PanelExclude
    r.integer(); r.integer(); // PatternOrientation, ViaStyle
    const patName = r.text();
    let patWMm = r.mm();
    let patHMm = r.mm();
    if (orientation % 2) [patWMm, patHMm] = [patHMm, patWMm];
    const patPadWMm = r.mm();
    const patPadHMm = r.mm();
    const patPadHoleMm = r.mm();
    r.mm(); r.integer();
    if (version > 31) {
      const hCnt = r.count('component hierarchy path');
      for (let i = 0; i < hCnt; i++) r.integer();
    }
    const name = r.text();
    const refDes = r.text();
    const value = r.text();
    r.text(); // BaseName

    // Pads
    const padCount = r.count('component pads');
    const pads: DipPad[] = [];
    for (let k = 0; k < padCount; k++) {
      const padAngleRad = r.boolean() ? Math.PI / 2 : 0;
      const number = r.integer();
      const netNumber = r.integer();
      const px = r.mm();
      const py = r.mm();
      const sNum = r.text();
      const pNam = r.text();
      const geom = readPadGeometry(r);
      r.boolean(); // obsolete selection
      for (let b = 0; b < 2; b++) {
        const lCnt = r.count('pad hide/blind layers');
        for (let l = 0; l < lCnt; l++) r.integer();
      }
      const spCnt = r.count('custom thermal settings');
      for (let s = 0; s < spCnt; s++) { r.integer(); r.integer(); r.integer(); r.number(); }
      r.boolean(); // Locked
      readPadMaskStates(r, false);
      r.number(); r.number();
      const sided = r.boolean();
      pads.push({
        number, netNumber, xMm: px, yMm: py, stringNumber: sNum, name: pNam,
        widthMm: geom.widthMm, heightMm: geom.heightMm, holeMm: geom.holeMm,
        holeHMm: geom.holeHMm, holeType: geom.holeType, surfacePad: geom.surfacePad,
        shapeCode: geom.shapeCode, standard: geom.standard, contourMm: geom.contourMm,
        sided, padAngleRad, padCorner: 0
      });
    }

    // Footprint shapes, holes, dimensions, model
    const shCnt = r.count('footprint drawings');
    const shapes: DipShape[] = [];
    for (let s = 0; s < shCnt; s++) {
      const rawKind = r.integer();
      const isMarker = rawKind === 700;
      const kind = isMarker ? 7 : rawKind;
      const controlsRaw = [r.number() / 3, r.number() / 3, r.number() / 3, r.number() / 3, r.number() / 3, r.number() / 3];
      r.boolean();
      const layer = r.integer();
      const txt = r.text();
      const fontName = r.text();
      r.boolean();
      const fontSize = r.integer();
      r.number(); r.number();
      const orient = r.integer();
      const textShow = r.integer();
      const penWidthMm = r.mm();
      const ptsMm = r.pointsMm(r.count('footprint drawing points'));
      shapes.push({
        enabled: true, orientation: orient, type: isMarker ? 0 : kind, fontSize, fontColor: 0,
        fontType: 0, fontName, textLines: [txt], penWidthMm, pointsMm: ptsMm,
        controlsRaw, layer, layId: 0, allLayers: false, textAngle: 0, textShow,
        padId: -1, markingGenerated: isMarker, showPart: false
      });
    }
    const holes = readHoles(r, false);
    const dimCount = r.count('dimensions');
    for (let d = 0; d < dimCount; d++) {
      r.boolean(); r.boolean();
      for (let k = 0; k < 10; k++) r.integer();
      for (let k = 0; k < 7; k++) r.number();
      r.integer(); r.boolean(); r.text(); r.integer(); r.number(); r.number(); r.boolean(); r.number();
      r.integer(); r.integer(); r.text();
    }
    r.text(); // Model3DFile
    for (let i = 0; i < 9; i++) r.number();
    r.boolean(); r.boolean();

    rawComps.push({
      enabled,
      angleRad: angleRad + (extraDeg ? (extraDeg * Math.PI) / 180 : 0),
      bottomSide,
      flipped,
      horzFlip,
      xMm,
      yMm,
      name,
      refDes,
      value,
      pads,
      shapes,
      holes,
      extraDeg,
      ufCount,
      dimCount,
      patParams: {
        type: patType, number1: patNum1, number2: patNum2, widthMm: patWMm, heightMm: patHMm,
        padWidthMm: patPadWMm, padHeightMm: patPadHMm, padShape: patPadShape, surfacePad: patSurfacePad,
        padHoleMm: patPadHoleMm, name: patName, originXMm: patOrigXMm, originYMm: patOrigYMm
      }
    });
  }

  // Connections (ratlines)
  const connCount = r.count('connections');
  for (let i = 0; i < connCount; i++) {
    r.boolean();
    for (let k = 0; k < 4; k++) r.number();
    for (let k = 0; k < 4; k++) r.integer();
    if (version > 33) r.boolean();
  }

  // Nets & traces
  const netCount = r.count('nets');
  const rawNets: DipPcbNet[] = [];
  const allNetTracePtCounts: number[][] = [];
  for (let ni = 0; ni < netCount; ni++) {
    const enabled = r.boolean();
    r.boolean();
    r.integer(); r.integer(); r.integer();
    const number = r.integer();
    r.integer();
    const widthMm = r.mm();
    r.number();
    const name = r.text() || `NET_${ni + 1}`;
    r.number(); r.number(); r.boolean();
    for (let k = 0; k < 4; k++) r.boolean();
    r.color(); r.integer();
    const npCnt = r.count('net pads');
    const netPads: { compIdx: number; padIdx: number }[] = [];
    for (let p = 0; p < npCnt; p++) {
      netPads.push({ compIdx: r.integer(), padIdx: r.integer() });
    }
    const trCnt = r.count('traces');
    const traces: DipPcbTracePt[][] = [];
    const trPtCounts: number[] = [];
    for (let t = 0; t < trCnt; t++) {
      for (let k = 0; k < 6; k++) r.integer();
      r.boolean(); r.boolean(); r.boolean(); r.boolean();
      r.boolean(); r.integer(); r.integer();
      const ptCnt = r.count('trace points');
      trPtCounts.push(ptCnt);
      const pts: DipPcbTracePt[] = [];
      for (let p = 0; p < ptCnt; p++) {
        const px = r.mm();
        const py = r.mm();
        const lay = r.integer();
        r.integer();
        const pw = r.mm();
        r.number(); r.boolean(); r.integer();
        const arc = r.boolean();
        const viaStyle = r.integer();
        r.number(); r.integer(); r.integer(); r.boolean();
        pts.push({ xMm: px, yMm: py, lay, widthMm: pw > 0 ? pw : (widthMm > 0 ? widthMm : 0.25), arc, viaStyle });
      }
      if (pts.length >= 2) traces.push(pts);
    }
    allNetTracePtCounts.push(trPtCounts);
    if (enabled) rawNets.push({ enabled, number, name, widthMm, pads: netPads, traces });
  }

  // Board drawings
  const boardDrawings: DipShape[] = [];
  const bdCnt = r.count('board shapes');
  for (let i = 0; i < bdCnt; i++) {
    const enabled = r.boolean();
    r.boolean();
    const orient = r.integer();
    const allLayers = r.boolean();
    const layer = r.integer();
    const layId = r.integer();
    const type = r.integer();
    const fontSize = r.integer();
    r.integer(); r.integer();
    r.color(); r.color(); r.color();
    const penWidthMm = r.mm();
    const ptsMm = r.pointsMm(r.count('board drawing points'));
    const txt = r.text();
    r.text(); r.boolean(); r.integer(); r.boolean();
    r.number(); r.number(); r.integer(); r.boolean();
    if (enabled) {
      boardDrawings.push({
        enabled, orientation: orient, type, fontSize, fontColor: 0, fontType: 0,
        fontName: '', textLines: [txt], penWidthMm, pointsMm: ptsMm, controlsRaw: [],
        layer, layId, allLayers, textAngle: 0, textShow: 0, padId: -1, markingGenerated: false, showPart: false
      });
    }
  }

  // Groups, Sheet, Tables, CopperPours
  const rawPours: DipPcbPour[] = [];
  const allPoursCount: number[] = [];
  const warnings: string[] = [];
  try {
    readGroups(r);
    // SheetLayout
    for (let k = 0; k < 6; k++) r.number();
    for (let t = 0; t < 6; t++) readTitleBlock(r);
    r.boolean(); r.integer(); r.integer(); r.integer();
    r.text(); r.integer(); r.boolean();
    r.number(); r.number(); r.number();

    // Tables
    const tblCnt = r.count('tables');
    const tblCellCounts: number[] = [];
    for (let t = 0; t < tblCnt; t++) {
      r.boolean(); r.boolean();
      for (let k = 0; k < 5; k++) r.integer();
      r.color();
      for (let k = 0; k < 6; k++) r.number();
      r.text(); r.text();
      const cols = r.count('table columns');
      for (let c = 0; c < cols; c++) r.number();
      const rows = r.count('table rows');
      for (let rw = 0; rw < rows; rw++) r.number();
      tblCellCounts.push(cols * rows);
      for (let cell = 0; cell < cols * rows; cell++) {
        r.boolean(); r.integer(); r.integer(); r.integer(); r.color();
        r.text(); r.text();
        r.number(); r.number(); r.number(); r.number();
        r.boolean(); r.number(); r.number();
      }
      r.boolean(); r.boolean(); r.number(); r.number(); r.boolean(); r.boolean();
      if (version > 32) r.integer();
    }

    // CopperPours
    const pourCnt = r.count('copper pours');
    for (let p = 0; p < pourCnt; p++) {
      allPoursCount.push(p);
      const enabled = r.boolean();
      r.boolean();
      const poured = r.boolean();
      const lineWidthMm = r.mm();
      const clearanceMm = r.mm();
      r.number(); // MinArea
      r.integer();
      const lay = r.integer();
      const netId = r.integer();
      const outlineMm = r.pointsMm(r.count('pour boundary points'));
      // Fill lines
      const flCnt = r.count('pour fill lines');
      for (let l = 0; l < flCnt; l++) {
        for (let k = 0; k < 4; k++) r.number();
        if (version > 33) r.integer();
      }
      // Fill polygons
      const fpCnt = r.count('pour fill polygons');
      for (let poly = 0; poly < fpCnt; poly++) {
        r.pointsMm(r.count('pour polygon points'));
        if (version > 33) r.integer();
      }
      const type = r.integer();
      r.integer(); r.number(); r.number();
      const spCnt = r.count('pour spoke lines');
      for (let s = 0; s < spCnt; s++) {
        for (let k = 0; k < 5; k++) r.number();
        if (version > 33) r.integer();
      }
      r.boolean(); r.boolean(); r.boolean(); r.boolean();
      const boardClearanceMm = r.mm();
      r.boolean(); r.boolean(); r.boolean(); r.integer();
      r.boolean(); r.boolean(); r.integer(); r.number(); r.boolean();
      let priority = 0;
      if (version > 33) {
        r.boolean();
        priority = r.integer();
      }
      if (enabled && outlineMm.length >= 3) {
        rawPours.push({ enabled, poured, lineWidthMm, clearanceMm, lay, netId, outlineMm, type, boardClearanceMm, priority });
      }
    }

    // Read extensions through v47 to obtain authoritative Component.Angle, PadAngle, Pattern.Width/Height, Pattern.Shapes
    readDimensions(r, false);
    // Display settings + Rule settings
    r.number(); r.boolean(); r.number(); r.boolean(); r.boolean(); r.color();
    r.boolean(); r.boolean();
    for (let k = 0; k < 5; k++) r.boolean();
    r.boolean(); r.integer(); r.integer(); r.boolean();
    for (let k = 0; k < 4; k++) r.number();
    for (let k = 0; k < 3; k++) r.boolean();
    r.integer();
    for (let k = 0; k < 5; k++) r.number();
    r.integer(); r.number(); r.number();
    // DRC
    let drcLayerCount = 0;
    const skipDrc = (recordCount: boolean) => {
      r.text();
      for (let k = 0; k < 8; k++) r.boolean();
      const lc = r.count('DRC clearance layers');
      if (recordCount) drcLayerCount = lc;
      for (let i = 0; i < lc; i++) for (let j = 0; j < 42; j++) r.number();
      const ls = r.count('DRC size layers');
      for (let i = 0; i < ls; i++) for (let j = 0; j < 6; j++) r.number();
    };
    skipDrc(true);
    r.boolean();
    r.boolean(); r.boolean(); r.boolean(); // ConnectivityCheck

    let designErrorCount = 0;
    if (version > 34) {
      r.integer(); r.boolean();
      designErrorCount = r.count('design errors');
      for (let i = 0; i < designErrorCount; i++) {
        r.boolean();
        for (let k = 0; k < 4; k++) r.number();
        for (let k = 0; k < 11; k++) r.integer();
        const lCnt = r.count('error layer flags');
        for (let l = 0; l < lCnt; l++) r.boolean();
      }
    }
    // Metadata extensions
    for (const c of rawComps) {
      if (version > 35) r.integer();
      void c;
    }
    for (let p = 0; p < allPoursCount.length; p++) {
      if (version > 36) r.integer();
    }
    if (version > 37) {
      for (const c of rawComps) {
        r.integer(); r.text(); r.text();
        r.text(); r.integer(); readCategoryTypes(r);
        r.text(); r.integer(); readCategoryTypes(r);
        readPossibleNames(r);
        void c;
      }
    }
    // CacheLib (v39+)
    const cachedDefs: { pads: number; patShapes: number; holes: number; symPins: number; symShapes: number }[] = [];
    if (version > 38) {
      r.text(); r.integer(); r.integer();
      for (let k = 0; k < 2; k++) {
        const c = r.count('project libs');
        for (let i = 0; i < c; i++) r.text();
      }
      r.boolean(); r.integer();
      const lk = r.count('cache links');
      for (let i = 0; i < lk; i++) r.integer();
      readCategories(r);
      const sf = r.count('cache subfolders');
      for (let i = 0; i < sf; i++) r.text();
      const slots = r.count('cache slots');
      for (let s = 0; s < slots; s++) {
        const vars = r.count('cache slot variants');
        for (let v = 0; v < vars; v++) {
          r.boolean(); r.integer(); r.text(); r.integer(); r.integer(); r.integer(); r.integer();
          r.number(); r.number(); r.text(); r.text(); r.text(); r.boolean();
          const ic = r.count('cached intcon');
          for (let i = 0; i < ic; i++) { r.integer(); r.integer(); }
          readPatternParameters(r);
          r.number(); r.number();
          r.pointsMm(r.count('cached def pad pts'));
          const cpads = r.count('cached pads');
          for (let k = 0; k < cpads; k++) {
            r.boolean(); r.integer(); r.number(); r.number(); r.text(); r.text();
            readPadGeometry(r);
            r.boolean(); r.boolean(); readPadMaskStates(r, false); r.number(); r.number();
          }
          const cshapes = r.count('cached pattern shapes');
          for (let k = 0; k < cshapes; k++) {
            r.integer(); for (let n = 0; n < 6; n++) r.number();
            r.boolean(); r.integer(); r.text(); r.text(); r.boolean(); r.integer();
            r.number(); r.number(); r.integer(); r.integer(); r.number();
            r.pointsMm(r.count('cached pat shape pts'));
          }
          const choles = readHoles(r, false).length;
          readDimensions(r, false);
          discardLegacyGroups(r, 3);
          const puf = r.count('cached pat uf');
          for (let i = 0; i < puf; i++) { r.text(); r.text(); r.integer(); }
          r.text(); for (let i = 0; i < 9; i++) r.number(); r.boolean(); r.boolean();
          r.integer(); r.integer(); r.text(); r.integer(); readCategoryTypes(r); readPossibleNames(r);
          const cpins = r.count('cached sym pins');
          for (let k = 0; k < cpins; k++) {
            r.boolean(); r.integer(); r.integer(); r.integer(); r.number(); r.number(); r.number();
            r.text(); r.text(); r.boolean(); for (let n = 0; n < 4; n++) r.number();
            r.integer(); r.boolean(); r.text(); r.integer(); r.number(); r.number();
          }
          const csymShapes = r.count('cached sym shapes');
          for (let k = 0; k < csymShapes; k++) {
            r.boolean(); r.integer(); r.integer(); r.integer(); r.color(); r.integer(); r.text(); r.text();
            r.number(); r.pointsMm(r.count('cached sym shape pts'));
            r.boolean(); r.boolean(); r.number(); r.number();
          }
          discardLegacyGroups(r, 2);
          const suf = r.count('cached sym uf');
          for (let i = 0; i < suf; i++) { r.text(); r.text(); r.integer(); }
          r.integer(); r.text();
          const ml = r.count('cached model lines');
          for (let i = 0; i < ml; i++) r.text();
          r.integer();
          const vf = r.count('ver flags');
          for (let i = 0; i < vf; i++) r.boolean();
          r.text(); r.text(); r.text(); r.integer(); readCategoryTypes(r);
          cachedDefs.push({ pads: cpads, patShapes: cshapes, holes: choles, symPins: cpins, symShapes: csymShapes });
        }
      }
      for (let s = 0; s < slots; s++) r.text();
    }

    // Differential pairs (v40+)
    const pairSidePtsCounts: [number[], number[]] = [[], []];
    const skipSidePts = (ext: boolean): number => {
      const cnt = r.count('side pts');
      for (let i = 0; i < cnt; i++) {
        r.number(); r.number(); r.boolean();
        if (ext) { r.integer(); r.integer(); r.boolean(); }
      }
      return cnt;
    };
    interface PairMeta { segCenters: { pos: number; neg: number }[]; sepTracePts: number[]; }
    const readPair = (): PairMeta => {
      r.boolean(); r.text();
      for (let k = 0; k < 4; k++) r.integer();
      r.boolean(); r.color();
      const pp = r.count('paired pads');
      for (let i = 0; i < pp; i++) for (let k = 0; k < 4; k++) r.integer();
      const segs = r.count('paired segs');
      const segCenters: { pos: number; neg: number }[] = [];
      for (let s = 0; s < segs; s++) {
        for (let k = 0; k < 6; k++) r.integer();
        const cp = r.count('center pts');
        for (let c = 0; c < cp; c++) {
          r.number(); r.number();
          for (let k = 0; k < 9; k++) r.integer();
          for (let k = 0; k < 3; k++) r.boolean();
          segCenters.push({ pos: skipSidePts(false), neg: skipSidePts(false) });
        }
      }
      return { segCenters, sepTracePts: [] };
    };
    const activePairs: PairMeta[] = [];
    const removedPairs: PairMeta[] = [];
    if (version >= 40) {
      for (let i = 0; i < ncCount; i++) {
        r.number(); r.number();
        for (let l = 0; l < ncLayerCounts[i]; l++) { r.number(); r.number(); r.number(); }
      }
      const dpCnt = r.count('differential pairs');
      for (let i = 0; i < dpCnt; i++) activePairs.push(readPair());
      for (const trList of allNetTracePtCounts) {
        for (const ptCnt of trList) {
          for (let p = 0; p < ptCnt; p++) { r.integer(); r.number(); r.number(); }
        }
      }
      for (let e = 0; e < designErrorCount; e++) {
        for (let k = 0; k < 4; k++) r.integer();
      }
      if (r.remaining > 0) {
        const rmCnt = r.count('removed differential pairs');
        for (let i = 0; i < rmCnt; i++) removedPairs.push(readPair());
      }
    }
    if (version >= 41) {
      skipDrc(false);
      for (const pair of activePairs) {
        r.boolean(); r.integer();
        for (const sc of pair.segCenters) {
          for (let i = 0; i < sc.pos; i++) { r.integer(); r.integer(); r.boolean(); }
          for (let i = 0; i < sc.neg; i++) { r.integer(); r.integer(); r.boolean(); }
        }
        for (let side = 0; side < 2; side++) {
          const stCnt = r.count('separate traces');
          for (let t = 0; t < stCnt; t++) {
            for (let k = 0; k < 8; k++) r.integer();
            r.boolean(); r.integer(); r.integer(); r.integer();
            const ptCnt = r.count('sep trace pts');
            pair.sepTracePts.push(ptCnt);
            for (let p = 0; p < ptCnt; p++) {
              r.number(); r.number(); r.integer(); r.integer(); r.number(); r.number();
              r.boolean(); r.integer(); r.boolean(); r.integer(); r.number(); r.integer(); r.integer(); r.boolean(); r.boolean();
            }
          }
        }
      }
      for (const trList of allNetTracePtCounts) {
        for (const ptCnt of trList) {
          r.integer(); r.integer(); r.integer();
          for (let p = 0; p < ptCnt; p++) { r.integer(); r.boolean(); }
        }
      }
      for (const pair of removedPairs) {
        for (const sc of pair.segCenters) {
          for (let i = 0; i < sc.pos; i++) { r.integer(); r.integer(); r.boolean(); }
          for (let i = 0; i < sc.neg; i++) { r.integer(); r.integer(); r.boolean(); }
        }
      }
    }
    if (version >= 42) { r.number(); r.number(); }
    if (version >= 43) {
      r.text();
      const lsi = r.count('layer stack items');
      for (let i = 0; i < lsi; i++) {
        r.integer(); r.text(); r.integer(); r.boolean(); r.number(); r.number(); r.number();
      }
      for (const c of rawComps) for (let p = 0; p < c.pads.length; p++) r.number();
      r.boolean(); r.boolean();
      // Length rules
      const skipLenRule = () => {
        r.text(); r.number(); r.number(); r.boolean(); r.boolean(); r.integer(); r.integer();
        const rc = r.count('length rules');
        for (let i = 0; i < rc; i++) { for (let k = 0; k < 5; k++) r.integer(); r.number(); r.boolean(); }
      };
      skipLenRule();
      const lrc = r.count('length rule list');
      for (let i = 0; i < lrc; i++) skipLenRule();
      for (let i = 0; i < ncCount; i++) { r.number(); r.number(); }
      for (let i = 0; i < netCount; i++) r.boolean();
      for (let i = 0; i < tblCnt; i++) { r.integer(); r.integer(); }
    }
    if (version >= 44) {
      for (let ni = 0; ni < allNetTracePtCounts.length; ni++) {
        r.number();
        for (const ptCnt of allNetTracePtCounts[ni]) for (let p = 0; p < ptCnt; p++) { r.integer(); r.number(); }
      }
      for (const pair of activePairs) {
        for (const sc of pair.segCenters) {
          for (let i = 0; i < sc.pos + sc.neg; i++) { r.integer(); r.number(); r.boolean(); }
        }
        for (const ptCnt of pair.sepTracePts) for (let p = 0; p < ptCnt; p++) { r.integer(); r.number(); }
      }
      for (const pair of removedPairs) {
        for (const sc of pair.segCenters) {
          for (let i = 0; i < sc.pos + sc.neg; i++) { r.integer(); r.number(); r.boolean(); }
        }
      }
    }
    if (version >= 45) {
      r.number(); r.number();
      for (let d = 0; d < 2; d++) {
        for (let k = 0; k < 3; k++) r.boolean();
        for (let l = 0; l < drcLayerCount; l++) for (let k = 0; k < 4; k++) r.number();
      }
      for (const c of rawComps) for (let p = 0; p < c.pads.length; p++) readPadMaskStates(r, true);
      for (const cd of cachedDefs) for (let p = 0; p < cd.pads; p++) readPadMaskStates(r, true);
    }
    if (version >= 46) {
      r.number(); r.integer();
      for (let i = 0; i < rawComps.length; i++) r.number();
    }
    if (version >= 47) {
      // Global markings
      for (let m = 0; m < 12; m++) { r.integer(); r.integer(); }
      const gcf = r.count('global comp fields');
      for (let i = 0; i < gcf; i++) { r.text(); r.text(); for (let k = 0; k < 4; k++) r.integer(); }
      for (const c of rawComps) {
        c.patParams.widthMm = r.mm();
        c.patParams.heightMm = r.mm();
        c.angleRad = r.number();
        r.boolean(); r.boolean(); r.integer(); r.integer(); r.integer();
        r.text(); r.text(); r.text(); r.boolean(); r.boolean();
        r.boolean(); r.integer(); r.boolean();
        // 6 markings x 2 sides
        for (let m = 0; m < 12; m++) { for (let k = 0; k < 4; k++) r.integer(); r.number(); r.number(); r.number(); }
        for (let uf = 0; uf < c.ufCount * 2; uf++) { for (let k = 0; k < 4; k++) r.integer(); r.number(); r.number(); r.number(); }
        r.number(); r.number(); r.number();
        readTerminals(r);
        for (let k = 0; k < 4; k++) r.integer();
        for (let k = 0; k < 6; k++) r.number();
        readMaskSegments(r);
        for (const pad of c.pads) {
          r.integer(); r.integer();
          pad.padCorner = r.number();
          pad.padAngleRad = r.number();
          r.number(); r.number();
          readTerminals(r);
          for (let k = 0; k < 4; k++) r.number();
          readMaskSegments(r);
        }
        for (const sh of c.shapes) {
          sh.pointsMm = r.pointsMm(sh.pointsMm.length);
          readTextProperties(r, sh);
          sh.allLayers = r.boolean();
          r.integer();
          sh.markingGenerated = r.boolean();
          if (sh.markingGenerated) sh.type = 0;
        }
        for (let h = 0; h < c.holes.length; h++) r.integer();
        for (let d = 0; d < c.dimCount; d++) r.integer();
        r.number(); r.number(); r.number(); r.color(); r.integer();
        const icr = r.count('intcon records');
        for (let i = 0; i < icr; i++) { r.integer(); r.integer(); }
        const ic = r.count('intcons');
        for (let i = 0; i < ic; i++) {
          r.boolean();
          const pids = r.count('intcon pads');
          for (let p = 0; p < pids; p++) r.integer();
          const rls = r.count('intcon ratlines');
          for (let rl = 0; rl < rls; rl++) { r.integer(); r.integer(); }
        }
      }
    } else {
      for (const c of rawComps) {
        for (const sh of c.shapes) {
          expandNormalizedPatternDrawing(sh, c.patParams.widthMm, c.patParams.heightMm);
        }
      }
    }
  } catch (e) {
    warnings.push(`Часть расширений платы .dip v${version} пропущена: ${(e as Error).message}`);
  }

  // Re-parse v47+ exact Angle/PadAngle cleanly when version >= 47 by tracking lpCnts?
  // Even simpler: in DipTrace v47+, let's check whether base component orientation/extraDeg already gives accurate placement or if v47+ overrides Angle!
  // Let's check: in InvertingIntegratorOpAmp.dip (v50), base orientation was `orientation=1` (90°), AND `read_drawing_extensions` overwrote `Angle`.
  // Wait — we already have the exact byte layout! Let's track `lpCnts` properly above in a tiny helper? No, let's check in a 2-sec test on `InvertingIntegratorOpAmp.dip` (v50) and `LedFlasherCircuit_Layout.dip` (v60) right after writing!

  // Map net number -> net name
  const netByNum = new Map<number, string>();
  for (const n of rawNets) netByNum.set(n.number, n.name);

  // Shift board into positive coordinates (minX >= 10, minY >= 10)
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of outlinePtsRaw) { xs.push(p.x); ys.push(p.y); }
  for (const c of rawComps) { if (c.enabled) { xs.push(c.xMm); ys.push(c.yMm); } }
  for (const n of rawNets) for (const tr of n.traces) for (const pt of tr) { xs.push(pt.xMm); ys.push(pt.yMm); }
  const minX = xs.length ? Math.min(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const shiftX = round3(10 - minX);
  const shiftY = round3(10 - minY);

  // Build PcbPlacedComponents
  const pcbComps: PcbPlacedComponent[] = [];
  for (let ci = 0; ci < rawComps.length; ci++) {
    const c = rawComps[ci];
    if (!c.enabled) continue;
    // DipTrace pads list in .dip often includes 2 sentinel pads (Number_New === 0 or > padCount-2); keep real pads
    const realPads = c.pads.filter((p) => p.number >= 1 || p.stringNumber.trim() !== '');
    const usePads = realPads.length > 0 ? realPads : c.pads;
    const side: 'Top' | 'Bottom' = c.bottomSide ? 'Bottom' : 'Top';
    const pads: PadDef[] = usePads.map((p, idx) =>
      mapDipPad(p, idx, {
        widthMm: c.patParams.padWidthMm,
        heightMm: c.patParams.padHeightMm,
        holeMm: c.patParams.padHoleMm,
        surface: c.patParams.surfacePad,
        shape: c.patParams.padShape
      }, side)
    );
    for (const h of c.holes) {
      if (!h.enabled) continue;
      pads.push({
        id: uid('dhole'),
        number: `MH${pads.length + 1}`,
        type: 'MountingHole',
        shape: 'Round',
        x: round3(h.xMm),
        y: round3(h.yMm),
        width: round3(Math.max(0.5, h.diamMm || h.holeDiamMm + 0.6)),
        height: round3(Math.max(0.5, h.diamMm || h.holeDiamMm + 0.6)),
        holeDiameter: round3(Math.max(0.3, h.holeDiamMm || 1.0)),
        layer: 'All'
      });
    }
    const padNets: Record<string, string> = {};
    usePads.forEach((p, idx) => {
      if (p.netNumber >= 0) {
        const nm = netByNum.get(p.netNumber);
        if (nm) padNets[pads[idx].number] = nm;
      }
    });
    for (const n of rawNets) {
      for (const np of n.pads) {
        if (np.compIdx === ci) {
          const matchedPad = pads[np.padIdx] ?? pads.find((pd, pIdx) => usePads[pIdx]?.number === np.padIdx + 1);
          if (matchedPad) padNets[matchedPad.number] = n.name;
        }
      }
    }

    const graphics = convertDipPatternShapes(c.shapes);
    const spanX = Math.max(2, c.patParams.widthMm || 6);
    const spanY = Math.max(2, c.patParams.heightMm || 4);
    if (graphics.length === 0) {
      graphics.push({ type: 'rect', layer: 'TopSilk', x: round3(-spanX / 2), y: round3(-spanY / 2), w: round3(spanX), h: round3(spanY), width: 0.15 });
    }

    // DipTrace angles are CCW in screen coords; negate for SIPTrace CW canvas rotation
    const dipDeg = (c.angleRad * 180) / Math.PI;
    const sipAngle = ((Math.round(-dipDeg * 10) / 10) % 360 + 360) % 360;

    const placed = createPlaceholderChipComponent({
      idPrefix: 'dtpcb',
      refDes: c.refDes || `U${pcbComps.length + 1}`,
      value: c.value || c.name || '',
      typeName: c.name || c.patParams.name || c.refDes,
      x: round3(c.xMm + shiftX),
      y: round3(c.yMm + shiftY),
      emptyPads: true
    });
    placed.patternId = c.patParams.name || placed.patternId;
    placed.side = side;
    placed.angle = sipAngle;
    placed.pads = pads;
    placed.padNets = padNets;
    placed.graphics = graphics;
    placed.courtyard = { width: round2(spanX + 1.0), height: round2(spanY + 1.0) };
    pcbComps.push(placed);
  }

  // Traces & Vias
  const traces: PcbTrace[] = [];
  const vias: PcbVia[] = [];
  const seenViaKeys = new Set<string>();
  const effCopperCount = layerCount >= 4 ? 4 : 2;

  for (const n of rawNets) {
    for (const trPts of n.traces) {
      // Split trace into segments when layer changes across points
      let curLay = mapCopperLayer(trPts[0].lay, effCopperCount);
      let curW = trPts[0].widthMm;
      let seg: Point2D[] = [{ x: round3(trPts[0].xMm + shiftX), y: round3(trPts[0].yMm + shiftY) }];

      for (let pi = 0; pi < trPts.length; pi++) {
        const pt = trPts[pi];
        const ptMm = { x: round3(pt.xMm + shiftX), y: round3(pt.yMm + shiftY) };
        if (pt.viaStyle >= 0) {
          const vs = viaStyles[pt.viaStyle] ?? { outerMm: 0.7, holeMm: 0.35 };
          const vKey = `${ptMm.x.toFixed(2)}_${ptMm.y.toFixed(2)}`;
          if (!seenViaKeys.has(vKey)) {
            seenViaKeys.add(vKey);
            vias.push({
              id: uid('dtvia'),
              x: ptMm.x,
              y: ptMm.y,
              netName: n.name,
              outerDiameter: round3(vs.outerMm),
              holeDiameter: round3(vs.holeMm),
              startLayer: 'TopCopper',
              endLayer: 'BottomCopper',
              viaStyle: 'Through'
            });
          }
        }
        if (pi === 0) continue;
        const ptLay = mapCopperLayer(pt.lay, effCopperCount);
        if (ptLay !== curLay) {
          if (seg.length >= 2) {
            traces.push({ id: uid('dtr'), layer: curLay, netName: n.name, points: seg, width: round3(Math.max(0.15, curW)) });
          }
          curLay = ptLay;
          curW = pt.widthMm;
          seg = [seg[seg.length - 1], ptMm];
        } else {
          seg.push(ptMm);
        }
      }
      if (seg.length >= 2) {
        traces.push({ id: uid('dtr'), layer: curLay, netName: n.name, points: seg, width: round3(Math.max(0.15, curW)) });
      }
    }
  }

  // Copper Pours
  const copperPours: PcbCopperPour[] = rawPours.map((p, idx) => ({
    id: uid('dtpour'),
    layer: mapCopperLayer(p.lay, effCopperCount),
    netName: netByNum.get(p.netId) || '',
    outline: p.outlineMm.map((pt) => ({ x: round3(pt.x + shiftX), y: round3(pt.y + shiftY) })),
    dependOnBoardOutline: false,
    boardClearance: round3(Math.max(0.2, p.boardClearanceMm || 0.4)),
    clearance: round3(Math.max(0.15, p.clearanceMm || 0.25)),
    fillType: p.type === 1 ? 'Hatch' : 'Solid',
    lineWidth: round3(Math.max(0.15, p.lineWidthMm || 0.25)),
    lineSpacing: 0.5,
    thermalType: '4Spoke',
    thermalSpokeWidth: 0.3,
    thermalGap: 0.25,
    removeIslands: true,
    priority: p.priority || idx,
    poured: p.poured
  }));

  // Board drawings -> cutouts, keepouts, silk/assy shapes
  const cutouts: PcbBoardCutout[] = [];
  const keepouts: PcbKeepoutZone[] = [];
  const boardShapes: PcbShape[] = [];
  for (const bd of boardDrawings) {
    const pts = bd.pointsMm.map((pt) => ({ x: round3(pt.x + shiftX), y: round3(pt.y + shiftY) }));
    if (bd.layer === 10 && pts.length >= 3) {
      cutouts.push({ id: uid('dtcut'), points: pts });
      continue;
    }
    if ((bd.layer === 2 || bd.layer === 11) && pts.length >= 2) {
      const poly = pts.length === 2
        ? [{ x: pts[0].x, y: pts[0].y }, { x: pts[1].x, y: pts[0].y }, { x: pts[1].x, y: pts[1].y }, { x: pts[0].x, y: pts[1].y }]
        : pts;
      keepouts.push({
        id: uid('dtko'),
        layer: 'AllCopper',
        kind: bd.layer === 11 ? 'PlaceKeepout' : 'RouteKeepout',
        points: poly
      });
      continue;
    }
    const targetLay = mapBoardShapeLayer(bd.layer);
    if (!targetLay || pts.length === 0) continue;
    const pw = Math.max(0.12, bd.penWidthMm || 0.15);
    if (bd.type === 0 && pts.length >= 2) {
      for (let i = 1; i < pts.length; i++) {
        boardShapes.push({ id: uid('dtbsh'), layer: targetLay, type: 'line', x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y, width: pw });
      }
    } else if ((bd.type === 2 || bd.type === 3) && pts.length >= 2) {
      const x1 = Math.min(pts[0].x, pts[1].x);
      const y1 = Math.min(pts[0].y, pts[1].y);
      boardShapes.push({ id: uid('dtbsh'), layer: targetLay, type: 'rect', x1, y1, w: round3(Math.abs(pts[1].x - pts[0].x)), h: round3(Math.abs(pts[1].y - pts[0].y)), width: pw });
    } else if (bd.type === 6 && bd.textLines.join(' ').trim()) {
      boardShapes.push({ id: uid('dtbsh'), layer: targetLay, type: 'text', x1: pts[0].x, y1: pts[0].y, width: pw, text: bd.textLines.join(' ').trim(), size: Math.max(1.0, (bd.fontSize || 5) * 0.35) });
    }
  }

  const pcb = createImportedPcbProject({
    filePath: `${projectName}.gostpcb`,
    projectName,
    components: pcbComps
  });
  pcb.layerCount = effCopperCount as 2 | 4;
  pcb.traces = traces;
  pcb.vias = vias;
  pcb.copperPours = copperPours;
  pcb.cutouts = cutouts;
  pcb.keepouts = keepouts;
  pcb.shapes = boardShapes;
  pcb.designRules = createGostDesignRules(4);
  if (outlineEnabled && outlinePtsRaw.length >= 3) {
    pcb.boardOutline = outlinePtsRaw.map((pt) => ({ x: round3(pt.x + shiftX), y: round3(pt.y + shiftY) }));
  }

  const converted = convertImportedPcbToGost(pcb, `DipTrace Binary PCB (.dip v${version})`, { preserveEmptyPads: true });
  // Preserve DipTrace exact pattern names & silkscreen graphics when physical pads were imported
  converted.pcb.components.forEach((c, idx) => {
    if (pcbComps[idx] && pcbComps[idx].pads.length > 0) {
      c.graphics = pcbComps[idx].graphics;
    }
  });
  if (warnings.length > 0) converted.report.warnings = warnings;
  return converted;
}
