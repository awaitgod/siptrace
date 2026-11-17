import { PatternDef } from '../../../core/types';
import { GostConversionItem, GostConversionReport } from '../gostConverter';
import {
  buildPatternDefFromDip,
  DipPad,
  DipShape,
  discardLegacyGroups,
  expandNormalizedPatternDrawing,
  readCategories,
  readCategoryTypes,
  readGroups,
  readHoles,
  readMaskSegments,
  readPadExtensions,
  readPadGeometry,
  readPadMaskStates,
  readPossibleNames,
  readTerminals,
  readTextProperties
} from './binaryCommon';
import { detectDipTraceBinaryFormat, DipBinaryReader } from './binaryEncoding';

/** Parses a native DipTrace binary footprint library (.lib) into PatternDefs. */
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
    for (let i = 0; i < 4; i++) r.boolean();
    const widthMm = r.mm();
    const heightMm = r.mm();
    r.mm(); r.mm();
    r.boolean(); r.mm(); r.boolean();
    r.integer();
    const number1 = r.integer();
    const number2 = r.integer();
    const type = r.integer();
    const padWidthMm = r.mm();
    const padHeightMm = r.mm();
    const padShape = r.integer();
    const surfacePad = r.boolean();
    const padHoleMm = r.mm();
    r.mm();
    r.integer();
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
      r.boolean();
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
      r.text(true);
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
