import {
  ComponentDef,
  PatternDef,
  PlacedComponent,
  Point2D,
  SchBus,
  SchNetPort,
  SchShape,
  SchWire,
  SchematicProject,
  SchematicSheet,
  SheetFormatId
} from '../../../core/types';
import { dist, transformPoint, uid } from '../../../core/geometry';
import { deriveWireJunctions } from '../../../core/schematic/editing';
import { findComponentById } from '../../../gost/libraries/gostComponents';
import { createDefaultGostTitleBlock } from '../../../gost/gostTitleBlock';
import { getGostFrameRect, SHEET_FORMATS } from '../../../gost/titleBlock/sheetFormats';
import { GostConversionItem, GostConversionReport, resolveOrBuildGostComponent } from '../gostConverter';
import {
  buildPatternDefFromDip,
  convertDipSymbolShapes,
  DipPad,
  DipPattern,
  DipPin,
  DipShape,
  expandNormalizedPatternDrawing,
  mapDipPinToSip,
  readCategoryTypes,
  readDimensions,
  readGroups,
  readHoles,
  readPadGeometry,
  readPadMaskStates,
  readPatternParameters,
  readPossibleNames,
  readTitleBlock,
  round3
} from './binaryCommon';
import { detectDipTraceBinaryFormat, DipBinaryReader } from './binaryEncoding';

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
  const movedTip = { x: round3(newTip.x), y: round3(newTip.y) };
  for (const w of wires) {
    if (netNameHint && w.netName !== netNameHint) continue;
    if (w.points.length < 2) continue;
    const first = w.points[0];
    const last = w.points[w.points.length - 1];
    const extension = (end: Point2D) =>
      Math.abs(end.x - movedTip.x) > 0.05 && Math.abs(end.y - movedTip.y) > 0.05
        ? [movedTip, { x: end.x, y: movedTip.y }]
        : [movedTip];
    // Keep the original segment so a T junction along it stays connected.
    if (dist(first, oldTip) < 0.25 && dist(first, movedTip) >= 0.02) w.points.unshift(...extension(first));
    if (dist(last, oldTip) < 0.25 && dist(last, movedTip) >= 0.02) w.points.push(...extension(last).reverse());
  }
}

/** Parses a native DipTrace binary schematic (.dch) into a GOST SchematicProject. */
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

  r.number();
  r.integer(); r.integer();
  r.integer();
  const pageCount = r.count('pages');
  const pageNames: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    pageNames.push(r.text() || `Лист ${i + 1}`);
    r.integer();
  }
  r.integer();
  for (let i = 0; i < 4; i++) r.integer();
  r.boolean(); r.number(); r.number();
  r.text(); r.text();
  r.boolean(); r.number(); r.number();
  const ncCount = r.count('net classes');
  for (let i = 0; i < ncCount; i++) {
    r.text(); r.integer(); r.number(); r.number(); r.integer();
  }
  const compCount = r.count('components');

  const rawComps: DipSchComp[] = [];
  for (let ci = 0; ci < compCount; ci++) {
    const enabled = r.boolean();
    r.boolean();
    r.integer(); r.integer(); r.integer();
    const pageIdx = r.integer();
    r.integer(); r.integer(); r.integer();
    const xMm = r.mm();
    const yMm = r.mm();
    r.mm(); r.mm();
    const name = r.text();
    const refDes = r.text();
    const value = r.text();
    r.text(); r.text();
    r.integer(); r.integer();
    r.boolean();
    const partNumber = r.integer();
    const partType = r.integer();
    const partName = r.text();
    r.text(); r.boolean();
    r.integer(); r.integer(); r.integer();
    for (let k = 0; k < 4; k++) r.number();
    r.text(); r.integer();
    const ufCount = r.count('component user fields');
    for (let i = 0; i < ufCount; i++) { r.text(); r.text(); r.integer(); }
    r.integer(); r.integer();
    r.boolean();
    const rawAngle = r.number();
    const angleDeg = identity.anglesInDegrees ? rawAngle : (rawAngle * 180) / Math.PI;
    r.text(); r.integer();
    const modelLines = r.count('model text lines');
    for (let i = 0; i < modelLines; i++) r.text();
    r.text(); r.text();
    const horzFlip = r.boolean();
    const vertFlip = r.boolean();

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
      r.boolean();
      const modelSig = r.text();
      const noConnect = r.boolean();
      r.integer(); r.number(); r.number();
      pins.push({
        enabled: pEnabled, type, orientation, number, netNumber,
        xMm: pxMm, yMm: pyMm, lengthMm, name: pName, stringNumber,
        fConnect, showName, electricType, hidden, modelSig, noConnect
      });
    }

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
      r.boolean(); r.boolean();
      r.number(); r.number();
      shapes.push({
        enabled: shEnabled, orientation: shOrient, type: shType,
        fontSize, fontColor, fontType, fontName, textLines: [shName],
        penWidthMm, pointsMm: ptsMm, controlsRaw: [], layer: 0, layId: 0,
        allLayers: false, textAngle: 0, textShow: 0, padId: -1,
        markingGenerated: generated, showPart: false
      });
    }

    const intConCount = r.count('footprint internal connections');
    for (let i = 0; i < intConCount; i++) { r.integer(); r.integer(); }
    const patParams = readPatternParameters(r);
    r.mm(); r.mm(); r.boolean();
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
      r.boolean();
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
      name, refDes, value, partNumber, partName, pins, shapes,
      pattern: {
        ...patParams, pads, shapes: patShapes, holes,
        model3dFile, model3dAutoHeightMm: 1.6, refDes, value,
        description: '', manufacturer: '', categoryName: ''
      }
    });
  }

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
        r.integer();
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

  const warnings: string[] = [];
  try {
    readGroups(r);
    r.integer();
    for (let p = 0; p < pageCount; p++) {
      r.number(); r.number();
      for (let k = 0; k < 4; k++) r.number();
      for (let t = 0; t < 6; t++) readTitleBlock(r);
      r.boolean(); r.integer(); r.integer(); r.integer();
      r.text(); r.integer(); r.boolean(); r.number(); r.number();
      r.integer(); r.integer(); r.number(); r.number(); r.integer();
    }
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
    r.number(); r.boolean(); r.color(); r.integer(); r.integer();
    for (let k = 0; k < 9; k++) r.boolean();
    for (let k = 0; k < 5; k++) r.number();
    for (let k = 0; k < 7; k++) r.boolean();
    r.text(); r.text();
    if (version >= 30) r.boolean();
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
      for (const c of rawComps) { void c; r.integer(); }
    }
  } catch (e) {
    warnings.push(`Часть вспомогательных секций таблицы/настроек .dch v${version} пропущена: ${(e as Error).message}`);
  }

  const pinToNet = new Map<string, string>();
  for (const n of rawNets) {
    for (const pt of n.parts) pinToNet.set(`${pt.compIdx}:${pt.pinIdx}`, n.name);
  }
  const netByNumber = new Map(rawNets.map(n => [n.number, n.name]));
  const netForPin = (compIdx: number, pinIdx: number, pin: DipPin) =>
    pinToNet.get(`${compIdx}:${pinIdx}`) || (pin.netNumber >= 0 ? netByNumber.get(pin.netNumber) : undefined);

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
      const activePins = comp.pins.map((pin, index) => ({ pin, index })).filter(({ pin }) => pin.enabled);
      const hintStr = `${comp.name} ${comp.value} ${comp.refDes}`.trim();
      const isPowerOrPort =
        comp.partType === 1 ||
        comp.partType === 2 ||
        (activePins.length === 1 && /^(GND|VSS|VCC|VDD|\+?\d+V\d*|NetPort\d*)$/i.test(comp.name || comp.refDes));
      if (isPowerOrPort && activePins.length === 1) {
        const { pin, index } = activePins[0];
        const tip = computePinTipWorld(comp, pin);
        const label = (/^NetPort\d*$/i.test(comp.name) ? pin.name : comp.name) || pin.name;
        const netName = netForPin(origIdx, index, pin) || label || 'NET';
        const isGnd = /GND|GROUND|VSS|0V/i.test(`${label} ${netName}`);
        const isPwr = !isGnd && (/VCC|VDD|\+|V\d|PWR|POWER/i.test(`${label} ${netName}`) || comp.partType === 1);
        const defaultDirection = isGnd ? 90 : isPwr ? 270 : 0;
        const portAngle = (((pin.orientation & 3) * 90 + 360 - defaultDirection) % 360) as SchNetPort['angle'];
        netPorts.push({
          id: uid('dtnp'),
          netName,
          label: label || undefined,
          style: isGnd ? 'Ground' : isPwr ? 'Power' : 'OffPageOut',
          x: round3(tip.x + shiftX),
          y: round3(tip.y + shiftY),
          angle: portAngle
        });
        continue;
      }

      if (isPowerOrPort && activePins.length > 1) {
        const key = `CUST_DT_PORT_${origIdx}`;
        const pins = activePins.map(({ pin, index }, idx) => ({
          ...mapDipPinToSip(pin, idx, 0),
          portNetName: netForPin(origIdx, index, pin)
        }));
        const label = comp.name || comp.refDes;
        const primitives = convertDipSymbolShapes(comp.shapes);
        customComponentDefs[key] = {
          id: key,
          name: label,
          library: 'Импорт DipTrace (ГОСТ)',
          refDesPrefix: '#PORT',
          defaultValue: label,
          description: hintStr,
          gostStandard: '',
          patternId: '',
          isNetPort: true,
          parts: [{ partIndex: 1, name: comp.partName, primitives, pins }]
        };
        placedComps.push({
          id: uid('dtsch'),
          componentDefId: key,
          libraryId: 'lib_gost_import',
          refDes: `#PORT${origIdx + 1}`,
          value: label,
          typeName: label,
          partIndex: 1,
          x: compX,
          y: compY,
          angle: 0,
          flipX: false,
          flipY: false,
          patternId: '',
          refDesOffset: { x: 0, y: 0 },
          valueOffset: { x: 0, y: Math.min(0, ...pins.map(pin => pin.y), ...comp.shapes.flatMap(shape => shape.pointsMm.map(point => point.y))) - 2 },
          showRefDes: false,
          showValue: true
        });
        continue;
      }

      let embeddedPatId = '';
      if (comp.pattern.pads.length > 0) {
        const builtPat = buildPatternDefFromDip(comp.pattern, 'PAT_DT_SCH', 'DipTrace Импорт');
        if (!customPatternDefs[builtPat.id]) customPatternDefs[builtPat.id] = builtPat;
        embeddedPatId = builtPat.id;
      }

      const sipPins = activePins.map(({ pin }, idx) => mapDipPinToSip(pin, idx, comp.pattern.pads.length));
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
      const isBuiltInTwoPin =
        gostDef &&
        !gostRes.defId.startsWith('CUST_') &&
        gostDef.parts[0]?.pins.length === 2 &&
        sipPins.length === 2;

      if (isBuiltInTwoPin) {
        const oldTip0 = computePinTipWorld(comp, activePins[0].pin);
        const oldTip1 = computePinTipWorld(comp, activePins[1].pin);
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
        updateAttachedWireEndpoints(wires, oldWorld0, newWorld0, netForPin(origIdx, activePins[0].index, activePins[0].pin));
        updateAttachedWireEndpoints(wires, oldWorld1, newWorld1, netForPin(origIdx, activePins[1].index, activePins[1].pin));

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
        parts: [{ partIndex: 1, name: comp.partName || 'Секция 1', primitives, pins: sipPins }]
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
        angle: 0,
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

    const wiresByNet = new Map<string, SchWire[]>();
    for (const wire of wires) {
      const netWires = wiresByNet.get(wire.netName);
      if (netWires) netWires.push(wire);
      else wiresByNet.set(wire.netName, [wire]);
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
      junctions: [...wiresByNet.values()].flatMap(netWires => deriveWireJunctions(netWires)),
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
