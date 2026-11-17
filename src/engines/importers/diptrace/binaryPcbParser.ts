import {
  PadDef,
  PcbBoardCutout,
  PcbCopperPour,
  PcbKeepoutZone,
  PcbLayerId,
  PcbPlacedComponent,
  PcbProject,
  PcbShape,
  PcbTrace,
  PcbVia,
  Point2D
} from '../../../core/types';
import { uid } from '../../../core/geometry';
import { createGostDesignRules } from '../../../gost/gostRules';
import { convertImportedPcbToGost, GostConversionReport } from '../gostConverter';
import { createImportedPcbProject, createPlaceholderChipComponent } from '../projectShells';
import {
  convertDipPatternShapes,
  DipPad,
  DipShape,
  mapDipPad,
  readHoles,
  readPadGeometry,
  readPadMaskStates,
  round2,
  round3
} from './binaryCommon';
import { detectDipTraceBinaryFormat, DipBinaryReader } from './binaryEncoding';
import { DipPcbComp, readDipTracePcbExtensions } from './binaryPcbExtensions';

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
    case 10: return 'BoardOutline';
    case 16:
    case 17: return 'Courtyard';
    default: return null;
  }
}

/** Parses a native DipTrace binary PCB (.dip) into a GOST PcbProject. */
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

  r.number(); r.integer(); r.integer();
  r.text();
  const outlineEnabled = r.boolean();
  for (let i = 0; i < 4; i++) r.number();
  const outlineCount = r.count('board outline points');
  const outlinePtsRaw: Point2D[] = [];
  for (let i = 0; i < outlineCount; i++) {
    outlinePtsRaw.push({ x: r.mm(), y: r.mm() });
    r.boolean();
  }
  r.boolean(); r.integer(); r.integer(); r.number(); r.number();
  if (version > 31) {
    r.boolean();
    for (let i = 0; i < 4; i++) r.number();
  }
  r.boolean(); r.boolean(); r.boolean();

  const layerCount = r.count('copper layers');
  for (let i = 0; i < layerCount; i++) {
    r.boolean(); r.integer(); r.color(); r.text();
    r.integer(); r.integer(); r.integer(); r.number(); r.boolean();
  }
  r.count('legacy picture companions');
  for (let i = 0; i < 4; i++) r.integer();
  r.integer(); r.text();
  r.number(); r.number();
  r.boolean(); r.number(); r.number();
  for (let i = 0; i < 5; i++) r.boolean();
  r.text(); r.text();
  r.boolean();

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
  r.boolean();
  const ccRows = r.count('class clearance rows');
  for (let rIdx = 0; rIdx < ccRows; rIdx++) {
    const ccCols = r.count('class clearance columns');
    for (let cIdx = 0; cIdx < ccCols; cIdx++) {
      r.boolean();
      const vCnt = r.count('class clearances');
      for (let v = 0; v < vCnt; v++) r.number();
    }
  }

  const compCount = r.count('components');
  const rawComps: DipPcbComp[] = [];
  for (let ci = 0; ci < compCount; ci++) {
    const enabled = r.boolean();
    r.boolean();
    const patType = r.integer();
    const patNum1 = r.integer();
    const patNum2 = r.integer();
    const orientation = r.integer();
    const angleRad = (orientation * Math.PI) / 2;
    r.integer(); r.integer();
    const patPadShape = r.integer();
    const patSurfacePad = r.boolean();
    for (let k = 0; k < 4; k++) r.integer();
    for (let k = 0; k < 4; k++) r.number();
    const bottomSide = r.boolean();
    r.integer();
    const flipped = r.boolean();
    r.integer();
    const patOrigXMm = r.mm();
    const patOrigYMm = r.mm();
    r.boolean();
    const horzFlip = r.boolean();
    const ufCount = r.count('component user fields');
    for (let i = 0; i < ufCount; i++) { r.text(); r.text(); r.integer(); }
    r.integer(); r.integer();
    const extraDeg = r.number();
    r.boolean(); r.text(); r.integer();
    r.pointsMm(r.count('default pad contour points'));
    for (let k = 0; k < 4; k++) r.boolean();
    const xMm = r.mm();
    const yMm = r.mm();
    r.number(); r.number(); r.boolean(); r.number(); r.boolean();
    r.boolean();
    r.integer(); r.integer();
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
    r.text();

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
      r.boolean();
      for (let b = 0; b < 2; b++) {
        const lCnt = r.count('pad hide/blind layers');
        for (let l = 0; l < lCnt; l++) r.integer();
      }
      const spCnt = r.count('custom thermal settings');
      for (let s = 0; s < spCnt; s++) { r.integer(); r.integer(); r.integer(); r.number(); }
      r.boolean();
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
    r.text();
    for (let i = 0; i < 9; i++) r.number();
    r.boolean(); r.boolean();

    rawComps.push({
      enabled,
      angleRad: angleRad + (extraDeg ? (extraDeg * Math.PI) / 180 : 0),
      bottomSide, flipped, horzFlip, xMm, yMm, name, refDes, value,
      pads, shapes, holes, extraDeg, ufCount, dimCount,
      patParams: {
        type: patType, number1: patNum1, number2: patNum2, widthMm: patWMm, heightMm: patHMm,
        padWidthMm: patPadWMm, padHeightMm: patPadHMm, padShape: patPadShape, surfacePad: patSurfacePad,
        padHoleMm: patPadHoleMm, name: patName, originXMm: patOrigXMm, originYMm: patOrigYMm
      }
    });
  }

  const connCount = r.count('connections');
  for (let i = 0; i < connCount; i++) {
    r.boolean();
    for (let k = 0; k < 4; k++) r.number();
    for (let k = 0; k < 4; k++) r.integer();
    if (version > 33) r.boolean();
  }

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
    for (let p = 0; p < npCnt; p++) netPads.push({ compIdx: r.integer(), padIdx: r.integer() });
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

  const { rawPours, warnings } = readDipTracePcbExtensions({
    r, version, ncCount, ncLayerCounts, netCount, allNetTracePtCounts, rawComps
  });

  const netByNum = new Map<number, string>();
  for (const n of rawNets) netByNum.set(n.number, n.name);

  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of outlinePtsRaw) { xs.push(p.x); ys.push(p.y); }
  for (const c of rawComps) { if (c.enabled) { xs.push(c.xMm); ys.push(c.yMm); } }
  for (const n of rawNets) for (const tr of n.traces) for (const pt of tr) { xs.push(pt.xMm); ys.push(pt.yMm); }
  const minX = xs.length ? Math.min(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const shiftX = round3(10 - minX);
  const shiftY = round3(10 - minY);

  const pcbComps: PcbPlacedComponent[] = [];
  for (let ci = 0; ci < rawComps.length; ci++) {
    const c = rawComps[ci];
    if (!c.enabled) continue;
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
          const matchedPad = pads[np.padIdx] ?? pads.find((_pd, pIdx) => usePads[pIdx]?.number === np.padIdx + 1);
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

  const traces: PcbTrace[] = [];
  const vias: PcbVia[] = [];
  const seenViaKeys = new Set<string>();
  const effCopperCount = layerCount >= 4 ? 4 : 2;

  for (const n of rawNets) {
    for (const trPts of n.traces) {
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
              id: uid('dtvia'), x: ptMm.x, y: ptMm.y, netName: n.name,
              outerDiameter: round3(vs.outerMm), holeDiameter: round3(vs.holeMm),
              startLayer: 'TopCopper', endLayer: 'BottomCopper', viaStyle: 'Through'
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
  converted.pcb.components.forEach((c, idx) => {
    if (pcbComps[idx] && pcbComps[idx].pads.length > 0) c.graphics = pcbComps[idx].graphics;
  });
  if (warnings.length > 0) converted.report.warnings = warnings;
  return converted;
}
