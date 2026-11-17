import { ComponentDef, ComponentPartDef, PatternDef } from '../../../core/types';
import {
  convertValueToGost,
  GostConversionItem,
  GostConversionReport,
  mapForeignPatternToGost,
  mapForeignPrefixToGost
} from '../gostConverter';
import {
  buildPatternDefFromDip,
  convertDipSymbolShapes,
  DipPad,
  DipPin,
  DipShape,
  discardLegacyGroups,
  expandNormalizedPatternDrawing,
  mapDipPinToSip,
  readCategories,
  readCategoryTypes,
  readGroups,
  readHoles,
  readPadExtensions,
  readPadGeometry,
  readPadMaskStates,
  readPatternAuthoring,
  readPatternParameters,
  readPossibleNames,
  readTextProperties
} from './binaryCommon';
import { detectDipTraceBinaryFormat, DipBinaryReader } from './binaryEncoding';

/** Parses a native DipTrace binary component library (.eli) into GOST ComponentDefs and attached PatternDefs. */
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
      r.boolean();
      r.integer();
      const partName = r.text();
      r.integer();
      r.integer();
      r.integer(); r.integer();
      r.mm(); r.mm();
      const pName = r.text();
      const pRef = r.text();
      const pValue = r.text();
      r.boolean();
      if (pi === 0) {
        compName = pName;
        compRef = pRef;
        compValue = pValue;
      }

      const intConCount = r.count('internal pad connections');
      for (let i = 0; i < intConCount; i++) { r.integer(); r.integer(); }
      const patParams = readPatternParameters(r);
      r.mm(); r.mm();
      const defPadPts = r.count('default pad points');
      r.pointsMm(defPadPts);
      let patAuth = { description: '', manufacturer: '' };
      if (version >= 27) patAuth = readPatternAuthoring(r);

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
        r.boolean();
        const sided = r.boolean();
        readPadMaskStates(r, version >= 26);
        r.number(); r.number();
        const padObj: DipPad = {
          number, netNumber: -1, xMm, yMm, stringNumber, name: padName,
          widthMm: geom.widthMm, heightMm: geom.heightMm, holeMm: geom.holeMm,
          holeHMm: geom.holeHMm, holeType: geom.holeType, surfacePad: geom.surfacePad,
          shapeCode: geom.shapeCode, standard: geom.standard, contourMm: geom.contourMm,
          sided, padAngleRad, padCorner: 0
        };
        if (version >= 27) {
          r.integer();
          readPadExtensions(r, padObj);
        }
        if (number >= 1) pads.push(padObj);
      }

      const physicalCoords = version >= 27;
      const drawingPadLinks = version >= 32;
      const extendedFonts = version >= 33;
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

      if (version >= 27) readGroups(r);
      else discardLegacyGroups(r, 3);
      const pufCount = r.count('footprint user fields');
      for (let i = 0; i < pufCount; i++) { r.text(); r.text(); r.integer(); }
      const model3dFile = r.text(true);
      for (let i = 0; i < 9; i++) r.number();
      r.boolean();
      if (version >= 31) r.text();
      r.boolean();
      if (version >= 22) r.integer();
      let autoHeightMm = 1.6;
      if (version >= 27) {
        r.number(); r.number();
        autoHeightMm = r.mm();
        r.color(); r.integer();
      }
      if (version >= 29) r.boolean();
      let patCatName = '';
      if (version >= 24) {
        r.integer();
        patCatName = r.text();
        r.integer();
        readCategoryTypes(r);
        readPossibleNames(r);
      }

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
        r.number(); r.number(); r.number(); r.number();
        if (version >= 28) { r.integer(); r.integer(); }
        const electricType = r.integer();
        r.boolean();
        const modelSig = r.text();
        r.integer(); r.number(); r.number();
        if (version >= 25) r.number();
        if (version >= 27) r.integer();
        if (version >= 33) { r.boolean(); r.number(); }
        if (enabled) {
          rawPins.push({
            enabled, type, orientation, number, netNumber: -1,
            xMm, yMm, lengthMm, name, stringNumber, fConnect: false, showName,
            electricType, hidden: false, modelSig, noConnect: false
          });
        }
      }

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
          layer: 0, layId: 0, allLayers: false, textAngle: 0, textShow: 0,
          padId: -1, markingGenerated: false, showPart: false
        };
        r.boolean(); r.boolean();
        r.number(); r.number();
        if (version >= 27) {
          readTextProperties(r, sh);
          r.integer();
        }
        if (version >= 33) {
          r.boolean();
          sh.fontSize = r.number();
        }
        symShapes.push(sh);
      }

      if (version >= 27) readGroups(r);
      else discardLegacyGroups(r, 2);
      const sufCount = r.count('symbol user fields');
      for (let i = 0; i < sufCount; i++) { r.text(); r.text(); r.integer(); }
      r.integer();
      r.text(true);
      const modelLines = r.count('simulation model lines');
      for (let i = 0; i < modelLines; i++) r.text(true);
      r.integer();
      const verFlags = r.count('verification flags');
      for (let i = 0; i < verFlags; i++) r.boolean();
      r.text(true);
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
        for (let i = 0; i < 5; i++) r.text();
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
