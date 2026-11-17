import { Point2D } from '../../../core/types';
import {
  DipPad,
  DipPattern,
  DipShape,
  discardLegacyGroups,
  expandNormalizedPatternDrawing,
  readCategories,
  readCategoryTypes,
  readDimensions,
  readGroups,
  readHoles,
  readMaskSegments,
  readPadGeometry,
  readPadMaskStates,
  readPatternParameters,
  readPossibleNames,
  readTerminals,
  readTextProperties,
  readTitleBlock
} from './binaryCommon';
import { DipBinaryReader } from './binaryEncoding';

export interface DipPcbComp {
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
  ufCount: number;
  dimCount: number;
}

export interface DipPcbPour {
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

/** Reads DipTrace binary PCB copper pours and v32..v47 extensions. */
export function readDipTracePcbExtensions(opts: {
  r: DipBinaryReader;
  version: number;
  ncCount: number;
  ncLayerCounts: number[];
  netCount: number;
  allNetTracePtCounts: number[][];
  rawComps: DipPcbComp[];
}): { rawPours: DipPcbPour[]; warnings: string[] } {
  const { r, version, ncCount, ncLayerCounts, netCount, allNetTracePtCounts, rawComps } = opts;
  const rawPours: DipPcbPour[] = [];
  const allPoursCount: number[] = [];
  const warnings: string[] = [];

  try {
    readGroups(r);
    for (let k = 0; k < 6; k++) r.number();
    for (let t = 0; t < 6; t++) readTitleBlock(r);
    r.boolean(); r.integer(); r.integer(); r.integer();
    r.text(); r.integer(); r.boolean();
    r.number(); r.number(); r.number();

    const tblCnt = r.count('tables');
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
      for (let cell = 0; cell < cols * rows; cell++) {
        r.boolean(); r.integer(); r.integer(); r.integer(); r.color();
        r.text(); r.text();
        r.number(); r.number(); r.number(); r.number();
        r.boolean(); r.number(); r.number();
      }
      r.boolean(); r.boolean(); r.number(); r.number(); r.boolean(); r.boolean();
      if (version > 32) r.integer();
    }

    const pourCnt = r.count('copper pours');
    for (let p = 0; p < pourCnt; p++) {
      allPoursCount.push(p);
      const enabled = r.boolean();
      r.boolean();
      const poured = r.boolean();
      const lineWidthMm = r.mm();
      const clearanceMm = r.mm();
      r.number();
      r.integer();
      const lay = r.integer();
      const netId = r.integer();
      const outlineMm = r.pointsMm(r.count('pour boundary points'));
      const flCnt = r.count('pour fill lines');
      for (let l = 0; l < flCnt; l++) {
        for (let k = 0; k < 4; k++) r.number();
        if (version > 33) r.integer();
      }
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

    readDimensions(r, false);
    r.number(); r.boolean(); r.number(); r.boolean(); r.boolean(); r.color();
    r.boolean(); r.boolean();
    for (let k = 0; k < 5; k++) r.boolean();
    r.boolean(); r.integer(); r.integer(); r.boolean();
    for (let k = 0; k < 4; k++) r.number();
    for (let k = 0; k < 3; k++) r.boolean();
    r.integer();
    for (let k = 0; k < 5; k++) r.number();
    r.integer(); r.number(); r.number();

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
    r.boolean(); r.boolean(); r.boolean();

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
        for (const ptCnt of trList) for (let p = 0; p < ptCnt; p++) { r.integer(); r.number(); r.number(); }
      }
      for (let e = 0; e < designErrorCount; e++) for (let k = 0; k < 4; k++) r.integer();
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
        for (const sh of c.shapes) expandNormalizedPatternDrawing(sh, c.patParams.widthMm, c.patParams.heightMm);
      }
    }
  } catch (e) {
    warnings.push(`Часть расширений платы .dip v${version} пропущена: ${(e as Error).message}`);
  }

  return { rawPours, warnings };
}
