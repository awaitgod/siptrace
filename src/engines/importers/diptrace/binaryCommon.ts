import {
  PadDef,
  PadShape,
  PatternDef,
  PatternGraphic,
  PatternLayer,
  PinElectricalType,
  PinGraphicStyle,
  PinOrientation,
  Point2D,
  SymbolPin,
  SymbolPrimitive
} from '../../../core/types';
import { uid } from '../../../core/geometry';
import { DipBinaryReader } from './binaryEncoding';

export interface DipShape {
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

export interface DipPin {
  enabled: boolean;
  type: number;
  orientation: number;
  number: number;
  netNumber: number;
  xMm: number;
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

export interface DipPad {
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
  shapeCode: number;
  standard: boolean;
  contourMm: Point2D[];
  sided: boolean;
  padAngleRad: number;
  padCorner: number;
}

export interface DipPattern {
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

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function mapDipElectricType(code: number): PinElectricalType {
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

export function mapDipPinStyle(code: number): PinGraphicStyle {
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

export function mapDipPinToSip(pin: DipPin, idx: number, defPadCount: number): SymbolPin {
  let tipX = pin.xMm;
  let tipY = pin.yMm;
  let sipOrient: PinOrientation = 0;
  const len = Math.max(0.5, round2(pin.lengthMm || 2.54));
  switch (pin.orientation & 3) {
    case 0:
      tipX = pin.xMm - len;
      sipOrient = 0;
      break;
    case 1:
      tipY = pin.yMm - len;
      sipOrient = 90;
      break;
    case 2:
      tipX = pin.xMm + len;
      sipOrient = 180;
      break;
    case 3:
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

export function mapDipPadShape(code: number): PadShape {
  switch (code) {
    case 0: return 'Round';
    case 1: return 'Oval';
    case 2: return 'Rect';
    case 3: return 'Polygon';
    case 4: return 'RoundedRect';
    default: return 'Rect';
  }
}

export function mapDipPad(
  pad: DipPad,
  idx: number,
  patternDefaults: { widthMm: number; heightMm: number; holeMm: number; surface: boolean; shape: number },
  side: 'Top' | 'Bottom' = 'Top'
): PadDef {
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

export function circleFrom3Pts(p0: Point2D, p1: Point2D, p2: Point2D): { cx: number; cy: number; r: number; a0: number; a2: number } | null {
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

export function convertDipSymbolShapes(shapes: DipShape[]): SymbolPrimitive[] {
  const out: SymbolPrimitive[] = [];
  for (const sh of shapes) {
    if (!sh.enabled || sh.markingGenerated) continue;
    const pts = sh.pointsMm;
    const w = Math.max(0.15, Math.abs(sh.penWidthMm) > 0.01 && sh.penWidthMm > 0 ? sh.penWidthMm : 0.35);
    if ((sh.type === 1 || sh.type === 3) && pts.length >= 2) {
      for (let i = 1; i < pts.length; i++) {
        out.push({ type: 'line', x1: round3(pts[i - 1].x), y1: round3(pts[i - 1].y), x2: round3(pts[i].x), y2: round3(pts[i].y), width: w });
      }
    } else if (sh.type === 2 && pts.length >= 3) {
      const arc = circleFrom3Pts(pts[0], pts[1], pts[2]);
      if (arc) {
        const through = Math.atan2(pts[1].y - arc.cy, pts[1].x - arc.cx);
        const turn = 2 * Math.PI;
        const sweep = (end: number) => (end - arc.a0 + turn) % turn;
        const [startAngle, endAngle] = sweep(through) <= sweep(arc.a2) ? [arc.a0, arc.a2] : [arc.a2, arc.a0];
        out.push({ type: 'arc', cx: round3(arc.cx), cy: round3(arc.cy), r: round3(arc.r), startAngle, endAngle, width: w });
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

export function mapPatternLayer(layerCode: number): PatternLayer | null {
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

export function convertDipPatternShapes(shapes: DipShape[]): PatternGraphic[] {
  const out: PatternGraphic[] = [];
  for (const sh of shapes) {
    if (sh.type <= 0) continue;
    const layer = mapPatternLayer(sh.layer);
    if (!layer) continue;
    const pts = sh.pointsMm;
    const w = Math.max(0.12, sh.penWidthMm > 0 ? sh.penWidthMm : 0.15);
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

export function buildPatternDefFromDip(dipPat: DipPattern, idPrefix: string, libraryLabel: string): PatternDef {
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

export function readCategories(r: DipBinaryReader): string[] {
  const names: string[] = [];
  const catCount = r.count('library categories');
  for (let i = 0; i < catCount; i++) {
    const catName = r.text();
    r.integer();
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

export function readCategoryTypes(r: DipBinaryReader): void {
  const cnt = r.count('category types');
  for (let i = 0; i < cnt; i++) {
    r.text(); r.text(); r.integer(); r.integer();
  }
}

export function readPossibleNames(r: DipBinaryReader): void {
  const cnt = r.count('possible names');
  for (let i = 0; i < cnt; i++) r.text();
}

export function readGroups(r: DipBinaryReader): void {
  const cnt = r.count('groups');
  for (let i = 0; i < cnt; i++) {
    r.boolean(); r.integer(); r.mm(); r.mm();
  }
}

export function discardLegacyGroups(r: DipBinaryReader, kindCount: number): void {
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

export function readMaskSegments(r: DipBinaryReader): void {
  for (let s = 0; s < 2; s++) {
    const cnt = r.count('pad mask segments');
    for (let i = 0; i < cnt; i++) {
      r.number(); r.number(); r.number(); r.number();
    }
  }
}

export function readTerminals(r: DipBinaryReader): void {
  const cnt = r.count('pad terminals');
  for (let i = 0; i < cnt; i++) {
    r.integer();
    r.mm(); r.mm();
    r.number();
    r.mm(); r.mm();
    r.number();
    const pCnt = r.count('terminal points');
    r.pointsMm(pCnt);
  }
}

export function readPadMaskStates(r: DipBinaryReader, extended: boolean): void {
  for (let i = 0; i < 4; i++) {
    if (extended) r.integer();
    else r.boolean();
  }
}

export function readPadGeometry(r: DipBinaryReader): {
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

export function readHoles(r: DipBinaryReader, grouped: boolean): DipPattern['holes'] {
  const out: DipPattern['holes'] = [];
  const cnt = r.count('footprint holes');
  for (let i = 0; i < cnt; i++) {
    const enabled = r.boolean();
    const xMm = r.mm();
    const yMm = r.mm();
    const diamMm = r.mm();
    const holeDiamMm = r.mm();
    r.boolean();
    if (grouped) r.integer();
    out.push({ enabled, xMm, yMm, diamMm, holeDiamMm });
  }
  return out;
}

export function readDimensions(r: DipBinaryReader, withGroup = false): void {
  const cnt = r.count('dimensions');
  for (let i = 0; i < cnt; i++) {
    r.boolean(); r.boolean();
    for (let k = 0; k < 10; k++) r.integer();
    for (let k = 0; k < 7; k++) r.number();
    r.integer(); r.boolean(); r.text(); r.integer(); r.number(); r.number(); r.boolean(); r.number();
    r.integer(); r.integer(); r.text();
    if (withGroup) r.integer();
  }
}

export function readTitleBlock(r: DipBinaryReader): void {
  r.text();
  r.number(); r.number();
  const cols = r.count('title columns');
  const rows = r.count('title rows');
  for (let i = 0; i < cols + rows; i++) r.number();
  for (let i = 0; i < cols * rows; i++) {
    r.integer(); r.boolean(); r.boolean(); r.boolean(); r.boolean();
  }
  const contents = r.count('title cell contents');
  for (let i = 0; i < contents; i++) {
    r.boolean(); r.integer(); r.integer(); r.integer(); r.color();
    r.text(); r.text(); r.number(); r.number(); r.number(); r.number();
    r.boolean(); r.number(); r.number();
  }
}

export function readPatternParameters(r: DipBinaryReader): {
  type: number; number1: number; number2: number; widthMm: number; heightMm: number;
  padWidthMm: number; padHeightMm: number; padShape: number; surfacePad: boolean;
  padHoleMm: number; name: string; originXMm: number; originYMm: number;
} {
  const type = r.integer();
  for (let i = 0; i < 4; i++) r.boolean();
  const number1 = r.integer();
  const number2 = r.integer();
  r.number(); r.number();
  r.boolean(); r.number(); r.boolean();
  r.integer();
  const widthMm = r.mm();
  const heightMm = r.mm();
  const padWidthMm = r.mm();
  const padHeightMm = r.mm();
  const padShape = r.integer();
  const surfacePad = r.boolean();
  const padHoleMm = r.mm();
  r.mm();
  r.integer();
  const name = r.text();
  const originXMm = r.mm();
  const originYMm = r.mm();
  return { type, number1, number2, widthMm, heightMm, padWidthMm, padHeightMm, padShape, surfacePad, padHoleMm, name, originXMm, originYMm };
}

export function readPatternAuthoring(r: DipBinaryReader): { description: string; manufacturer: string } {
  r.boolean(); r.boolean();
  r.integer(); r.integer();
  const description = r.text();
  r.text(); r.text();
  r.boolean(); r.boolean();
  const manufacturer = r.text();
  r.number(); r.number(); r.number();
  readTerminals(r);
  for (let i = 0; i < 4; i++) r.integer();
  for (let i = 0; i < 6; i++) r.number();
  readMaskSegments(r);
  return { description, manufacturer };
}

export function readPadExtensions(r: DipBinaryReader, pad: DipPad): void {
  pad.padCorner = r.number();
  pad.padAngleRad = r.number();
  r.number(); r.number();
  readTerminals(r);
  for (let i = 0; i < 4; i++) r.number();
  readMaskSegments(r);
}

export function readTextProperties(r: DipBinaryReader, shape: DipShape): void {
  shape.textAngle = r.number();
  r.integer(); r.integer(); r.integer();
  r.number();
  const lineCnt = r.count('text lines');
  shape.textLines = [];
  for (let i = 0; i < lineCnt; i++) shape.textLines.push(r.text());
}

export function expandNormalizedPatternDrawing(shape: DipShape, patWidthMm: number, patHeightMm: number): void {
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
