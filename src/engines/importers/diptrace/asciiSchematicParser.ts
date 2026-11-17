import {
  ComponentDef,
  PlacedComponent,
  PatternDef,
  Point2D,
  SchBus,
  SchJunction,
  SchNetPort,
  SchShape,
  SchWire,
  SchematicProject,
  SchematicSheet,
  SheetFormatId,
  SymbolPin,
  SymbolPrimitive
} from '../../../core/types';
import { uid } from '../../../core/geometry';
import { createDefaultGostTitleBlock } from '../../../gost/gostTitleBlock';
import { SHEET_FORMATS } from '../../../gost/titleBlock/sheetFormats';
import { convertImportedSchematicToGost, GostConversionReport } from '../gostConverter';
import { SExprList, parseSExpressions, sxFind, sxFindAll, sxNum, sxStr, sxWalk } from '../sexprParser';
import { mapDipElectricType, mapDipPadShape, mapDipPinStyle } from './binaryCommon';
import { deriveWireJunctions } from '../../../core/schematic/editing';

const numberField = (node: SExprList, tag: string, fallback = 0) => sxNum(sxFind(node, tag), 1, fallback);
const stringField = (node: SExprList, tag: string, fallback = '') => sxStr(sxFind(node, tag), 1, fallback);
const records = (node: SExprList, container: string, tag: string) => sxFindAll(sxFind(node, container) ?? [], tag);
const mm = (value: number) => value / 3;
const nativePoint = (node: SExprList, start = 1) => ({ x: mm(sxNum(node, start)), y: mm(sxNum(node, start + 1)) });

function nativeDrawing(node: SExprList): SymbolPrimitive | undefined {
  const points = records(node, 'Points_New', 'pt').map(p => nativePoint(p));
  if (!points.length) points.push(...records(node, 'Points', 'pt').map(p => nativePoint(p)));
  if (!points.length) return;
  const [a, b] = points;
  const width = mm(numberField(node, 'PenWidth', 0.75));
  switch (numberField(node, 'Type')) {
    case 1:
      if (b) return { type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, width };
      break;
    case 4:
    case 5:
      if (b) return { type: 'rect', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
        w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y), width };
      break;
    case 6:
      if (b) return { type: 'circle', cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, r: Math.abs(b.x - a.x) / 2, width };
      break;
    case 10:
      return { type: 'text', ...a, text: records(node, 'TextLine', 'pt').map(line => sxStr(line, 1)).join('\n') || stringField(node, 'Name'),
        size: mm(numberField(node, 'FontSize', 6)) };
  }
}

function parseNativeSchematic(root: SExprList): { project: SchematicProject; report: GostConversionReport } {
  const pageRecords = records(root, 'Pages', 'Page');
  const projectName = sxStr(pageRecords[0], 1) || 'Импорт_DipTrace_Схема';
  const sheets: SchematicSheet[] = (pageRecords.length ? pageRecords : [[]]).map((page, index) => {
    const format = (Object.keys(SHEET_FORMATS) as SheetFormatId[]).find(key =>
      SHEET_FORMATS[key].widthMm === mm(numberField(page, 'PageWidth')) &&
      SHEET_FORMATS[key].heightMm === mm(numberField(page, 'PageHeight'))) ?? 'A4_L';
    return {
      id: uid('sheet'), name: sxStr(page, 1) || `Лист ${index + 1}`, format,
      titleBlock: createDefaultGostTitleBlock({ enabled: false, name: projectName, sheetNumber: index + 1, totalSheets: pageRecords.length || 1 }),
      components: [], wires: [], shapes: [], buses: [], netPorts: [], junctions: [], busTaps: [], hierarchyBlocks: [], diffPairs: []
    };
  });
  const sheetOf = (node: SExprList) => sheets[numberField(node, 'Page')] ?? sheets[0];
  const world = (sheet: SchematicSheet, point: Point2D) => ({
    x: point.x + SHEET_FORMATS[sheet.format].widthMm / 2,
    y: point.y + SHEET_FORMATS[sheet.format].heightMm / 2
  });
  const customComponentDefs: Record<string, ComponentDef> = {};
  const customPatternDefs: Record<string, PatternDef> = {};
  const netNames = new Map<number, string>();
  for (const net of records(root, 'Nets', 'Net')) {
    const netNumber = numberField(net, 'Number', netNames.size);
    const netName = sxStr(net, 1) || `NET_${netNumber + 1}`;
    netNames.set(netNumber, netName);
    for (const line of records(net, 'Lines', 'Line')) {
      if (stringField(line, 'Hidden') === 'Y') continue;
      const sheet = sheetOf(line);
      const points = records(line, 'Points', 'pt').map(p => world(sheet, nativePoint(p)));
      if (points.length > 1) sheet.wires.push({ id: uid('dtw'), points, netName });
    }
  }
  const packages = new Map<string, string>();
  for (const part of records(root, 'Components', 'Part')) {
    if (stringField(part, 'Enabled') === 'N') continue;
    const sheet = sheetOf(part);
    const name = sxStr(part, 1);
    const refDes = sxStr(part, 2);
    const value = stringField(part, 'Value');
    const isNetPort = numberField(part, 'PartType') === 2;
    const pattern = sxFind(part, 'Pattern') ?? [];
    const patternId = sxStr(pattern, 1) && records(pattern, 'Pads', 'Pad').length ? uid('dtpat') : '';
    const padNumbers = new Map<number, string>();
    if (patternId) {
      const pads = records(pattern, 'Pads', 'Pad').map(pad => {
        const number = sxStr(pad, 2);
        padNumbers.set(numberField(pad, 'Number', sxNum(pad, 1)), number);
        return {
          id: uid('pad'), number, ...nativePoint(pad, 4), width: mm(numberField(pad, 'PadWidth_New', numberField(pad, 'PadWidth'))),
          height: mm(numberField(pad, 'PadHeight_New', numberField(pad, 'PadHeight'))),
          type: stringField(pad, 'SurfacePad') === 'Y' ? 'SMD' as const : 'THT' as const,
          layer: stringField(pad, 'SurfacePad') === 'Y' ? 'Top' as const : 'All' as const,
          shape: mapDipPadShape(numberField(pad, 'PadShape_New', numberField(pad, 'PadShape'))),
          holeDiameter: mm(numberField(pad, 'PadHole')), angle: numberField(pad, 'PadAngle')
        };
      });
      const width = mm(numberField(pattern, 'Width'));
      const height = mm(numberField(pattern, 'Height'));
      customPatternDefs[patternId] = {
        id: patternId, name: sxStr(pattern, 1), library: 'DipTrace', description: stringField(pattern, 'Name_Description'),
        pads, graphics: [], courtyard: { width, height },
        model3d: { shape: 'Box', bodyWidth: width, bodyLength: height, bodyHeight: 1, color: '#404040' }
      };
    }
    const pins: SymbolPin[] = records(part, 'Pins', 'Pin').map(pin => {
      const body = nativePoint(pin, 2);
      const axis = numberField(pin, 'Orientation') & 3;
      const length = mm(numberField(pin, 'Length'));
      const number = stringField(pin, 'StringNumber', sxStr(pin, 1));
      const electricalType = mapDipElectricType(numberField(pin, 'ElectricType'));
      return {
        id: uid('pin'), number, name: stringField(pin, 'Name'), length,
        x: body.x - [1, 0, -1, 0][axis] * length, y: body.y - [0, 1, 0, -1][axis] * length,
        orientation: (axis * 90) as SymbolPin['orientation'], electricalType,
        style: mapDipPinStyle(numberField(pin, 'Type')), showName: stringField(pin, 'ShowName') === 'Y',
        showNumber: numberField(part, 'ShowNumbers') !== 2,
        isHiddenPower: electricalType === 'Power' && stringField(pin, 'Hidden') === 'Y',
        portNetName: netNames.get(numberField(pin, 'NetNumber', -1)),
        padMapping: padNumbers.get(numberField(pin, 'Number', -1)) ?? number
      };
    });
    const componentDefId = uid('dtdef');
    const partIndex = numberField(part, 'PartNumber');
    const primitives = records(part, 'Shapes', 'Shape').flatMap(shape => nativeDrawing(shape) ?? []);
    const refDesPrefix = stringField(part, 'BaseRefDes') || refDes.replace(/\d+$/, '') || 'U';
    customComponentDefs[componentDefId] = {
      id: componentDefId, name, defaultValue: value, refDesPrefix, patternId, isNetPort,
      manufacturer: stringField(part, 'Manufacturer'), description: '', library: 'DipTrace', gostStandard: '',
      parts: [{ partIndex, name: stringField(part, 'PartName'), primitives, pins }]
    };
    const packageKey = JSON.stringify([refDes, stringField(part, 'BaseName', name)]);
    if (!packages.has(packageKey)) packages.set(packageKey, uid('package'));
    sheet.components.push({
      id: uid('dtsch'), componentDefId, patternId, refDes, value, typeName: name, libraryId: 'DipTrace', partIndex,
      ...world(sheet, { x: mm(numberField(part, 'X')), y: mm(numberField(part, 'Y')) }),
      instanceId: packages.get(packageKey),
      // Native ASC stores placed pin and primitive geometry in its current orientation.
      angle: 0, flipX: false, flipY: false,
      refDesOffset: nativePoint(sxFind(part, 'ShowRefDes') ?? [], 3),
      valueOffset: nativePoint(sxFind(part, 'ShowValue') ?? [], 3),
      showRefDes: !isNetPort && numberField(part, 'ShowRefDes') !== 2,
      showValue: !isNetPort && numberField(part, 'ShowValue') !== 2
    });
  }
  for (const node of records(root, 'Shapes', 'Shape')) {
    const drawing = nativeDrawing(node);
    if (!drawing || drawing.type === 'polyline' || drawing.type === 'arc') continue;
    const sheet = sheetOf(node);
    const id = uid('dtsh');
    if (drawing.type === 'line') {
      const a = world(sheet, { x: drawing.x1, y: drawing.y1 });
      const b = world(sheet, { x: drawing.x2, y: drawing.y2 });
      sheet.shapes.push({ id, type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: drawing.width ?? 0.25 });
    } else if (drawing.type === 'circle') {
      const center = world(sheet, { x: drawing.cx, y: drawing.cy });
      sheet.shapes.push({ ...drawing, id, cx: center.x, cy: center.y, width: drawing.width ?? 0.25 });
    } else if (drawing.type === 'rect') {
      sheet.shapes.push({ ...drawing, ...world(sheet, drawing), id, width: drawing.width ?? 0.25 });
    } else {
      sheet.shapes.push({ ...drawing, ...world(sheet, drawing), id, size: drawing.size ?? 2 });
    }
  }
  for (const sheet of sheets) {
    const byNet = new Map<string, SchWire[]>();
    for (const wire of sheet.wires) {
      if (!byNet.has(wire.netName)) byNet.set(wire.netName, []);
      byNet.get(wire.netName)!.push(wire);
    }
    sheet.junctions = [...byNet.values()].flatMap(wires => deriveWireJunctions(wires));
  }
  return {
    project: {
      version: '1.0', filePath: '', projectName, units: 'mm', gridSize: mm(numberField(sxFind(root, 'Settings') ?? [], 'GridSize', 7.5)),
      origin: { x: 0, y: 0 }, sheets, activeSheetId: sheets[0].id, customComponentDefs, customPatternDefs,
      netClasses: [{ id: 'nc_default', name: 'Сигнальные', traceWidth: 0.25, minWidth: 0.15, maxWidth: 5,
        clearance: 0.2, viaOuterDiameter: 0.7, viaHoleDiameter: 0.35 }],
      netClassAssignments: {}
    },
    report: { sourceFormat: 'DipTrace ASCII (.dch/.asc)', convertedComponents: 0, convertedSymbolsToUgo: 0, convertedPatterns: 0, items: [] }
  };
}

function dipTraceCoordToMm(val: number, scaleFactor: number): number {
  return Math.round(val * scaleFactor * 1000) / 1000;
}

function detectDipTraceScaleFactor(coords: number[]): number {
  const maxAbs = coords.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  if (maxAbs > 1500) return 0.1;
  if (maxAbs > 450) return 1 / 3;
  return 1.0;
}

/** Parses DipTrace ASCII Schematic (.dch / .asc) including sheets, parts, wires, netPorts, junctions, buses, shapes. */
export function parseDipTraceAsciiSchematicFull(ascii: string): SchematicProject {
  return parseDipTraceAsciiSchematicWithReport(ascii).project;
}

/** Parses DipTrace ASCII Schematic (.dch / .asc) and returns both project and GOST conversion report. */
export function parseDipTraceAsciiSchematicWithReport(ascii: string): {
  project: SchematicProject;
  report: GostConversionReport;
} {
  // Native exports contain literal Windows paths, unlike the older SIPTrace variant.
  const roots = parseSExpressions(ascii, { literalBackslashes: /^\s*\(Source\s+"DipTrace-Schematic"\s+46\)/.test(ascii) });
  const source = roots.find(node => node[0] === 'Source');
  const native = roots.find(node => node[0] === 'Schematic');
  if (sxStr(source) === 'DipTrace-Schematic' && sxNum(source, 2) === 46 && native && sxFind(native, 'Pages')) {
    return parseNativeSchematic(native);
  }
  const allLists: SExprList[] = [];
  for (const r of roots) sxWalk(r, (node) => allLists.push(node));

  const topLevelNodes = roots.flatMap((r) => (Array.isArray(r) ? [r, ...r.filter((x): x is SExprList => Array.isArray(x))] : []));
  const projectName =
    sxStr(topLevelNodes.find((l) => l[0] === 'Name' || l[0] === 'Title' || l[0] === 'Schematic'), 1) || 'Импорт_DipTrace_Схема';

  const isNativeExport = ascii.includes('GOSTTrace-Export');
  const sampleCoords: number[] = [];
  if (!isNativeExport) {
    for (const l of allLists) {
      if (l[0] === 'Origin' || l[0] === 'Pt' || l[0] === 'Point') {
        const a = parseFloat(sxStr(l, 1));
        const b = parseFloat(sxStr(l, 2));
        if (Number.isFinite(a)) sampleCoords.push(a);
        if (Number.isFinite(b)) sampleCoords.push(b);
      } else if (l[0] === 'Part') {
        const a = parseFloat(sxStr(l, 2));
        const b = parseFloat(sxStr(l, 3));
        if (Number.isFinite(a)) sampleCoords.push(a);
        if (Number.isFinite(b)) sampleCoords.push(b);
      }
    }
  }
  const scale = isNativeExport ? 1.0 : detectDipTraceScaleFactor(sampleCoords);

  const sheetNodes = allLists.filter((l) => l[0] === 'Sheet' && typeof l[1] === 'string' && l.length > 2);
  const builtSheets: SchematicSheet[] = [];
  const customComponentDefs: Record<string, ComponentDef> = {};

  const parseSheetContents = (nodes: SExprList[], sheetName: string, sheetIdx: number, sheetFmtRaw: string): SchematicSheet => {
    const components: PlacedComponent[] = [];
    const wires: SchWire[] = [];
    const buses: SchBus[] = [];
    const junctions: SchJunction[] = [];
    const netPorts: SchNetPort[] = [];
    const shapes: SchShape[] = [];
    const seenPartKeys = new Set<string>();

    const partNodes = nodes.filter((l) => l[0] === 'Part' && (sxFind(l, 'RefDes') || sxFind(l, 'Name') || typeof l[1] === 'string'));
    partNodes.forEach((p, idx) => {
      const refDes = sxStr(sxFind(p, 'RefDes'), 1) || (typeof p[1] === 'string' && /^[A-Za-zА-Яа-я#]+\d*$/.test(p[1]) ? p[1] : `U${idx + 1}`);
      const defIdHint = sxStr(sxFind(p, 'DefId'), 1);
      const partName = sxStr(sxFind(p, 'Name'), 1) || sxStr(sxFind(p, 'PartName'), 1) || (typeof p[2] === 'string' ? p[2] : refDes);
      const value = sxStr(sxFind(p, 'Value'), 1) || partName;
      const pattern = sxStr(sxFind(p, 'Pattern'), 1) || sxStr(sxFind(p, 'AttachedPattern'), 1) || '';
      const originNode = sxFind(p, 'Origin') ?? sxFind(p, 'Pt');
      const x = originNode ? dipTraceCoordToMm(sxNum(originNode, 1, 50), scale) : dipTraceCoordToMm(sxNum(p, 2, 50 + (idx % 6) * 30), scale);
      const y = originNode ? dipTraceCoordToMm(sxNum(originNode, 2, 50), scale) : dipTraceCoordToMm(sxNum(p, 3, 50 + Math.floor(idx / 6) * 25), scale);
      const angle = ((Math.round(sxNum(sxFind(p, 'Angle'), 1, 0) / 90) * 90) % 360 + 360) % 360 as 0 | 90 | 180 | 270;
      const flipX = sxNum(sxFind(p, 'FlipX'), 1, 0) === 1;
      const flipY = sxNum(sxFind(p, 'FlipY'), 1, 0) === 1;

      const key = `${refDes}_${x}_${y}_${idx}`;
      if (seenPartKeys.has(key)) return;
      seenPartKeys.add(key);

      const pinNodes = sxFindAll(p, 'Pin');
      const customPins = pinNodes.map((pn, pIdx) => ({
        id: `dp_${idx}_${pIdx}`,
        number: sxStr(sxFind(pn, 'Number'), 1) || sxStr(pn, 1) || String(pIdx + 1),
        name: sxStr(sxFind(pn, 'Name'), 1) || sxStr(pn, 2) || `P${pIdx + 1}`,
        x: sxNum(sxFind(pn, 'Pt'), 1, -15),
        y: sxNum(sxFind(pn, 'Pt'), 2, (pIdx - pinNodes.length / 2) * 5),
        length: 5,
        orientation: 0 as const,
        electricalType: 'Passive' as const,
        style: 'Line' as const,
        showName: true,
        showNumber: true,
        padMapping: String(pIdx + 1)
      }));

      const customId = `DIP_IMP_${partName.replace(/[^A-Za-z0-9]/g, '_')}_${customPins.length}`;
      if (customPins.length > 0 && !defIdHint && !customComponentDefs[customId]) {
        customComponentDefs[customId] = {
          id: customId,
          name: partName,
          library: 'DipTrace Import',
          refDesPrefix: refDes.replace(/\d+$/, '') || 'U',
          defaultValue: value,
          gostStandard: 'DipTrace',
          description: partName,
          manufacturer: 'DipTrace',
          patternId: pattern,
          parts: [{ partIndex: 1, name: 'Part 1', primitives: [], pins: customPins }]
        };
      }

      components.push({
        id: uid('dtsch'),
        componentDefId: defIdHint || (customPins.length > 0 ? customId : partName),
        libraryId: 'lib_gost_import',
        refDes,
        value,
        typeName: partName,
        partIndex: 1,
        x,
        y,
        angle,
        flipX,
        flipY,
        patternId: pattern,
        refDesOffset: { x: 0, y: -7 },
        valueOffset: { x: 0, y: 7 },
        showRefDes: !refDes.startsWith('#'),
        showValue: !refDes.startsWith('#')
      });
    });

    const wireNodes = nodes.filter((l) => l[0] === 'Wire' || l[0] === 'NetWire');
    for (const w of wireNodes) {
      const pts: Point2D[] = [];
      const ptNodes = sxFindAll(w, 'Pt').concat(sxFindAll(w, 'Point'));
      if (ptNodes.length >= 2) {
        for (const pt of ptNodes) {
          pts.push({
            x: dipTraceCoordToMm(sxNum(pt, 1), scale),
            y: dipTraceCoordToMm(sxNum(pt, 2), scale)
          });
        }
      } else {
        const x1 = sxNum(w, 1, NaN);
        const y1 = sxNum(w, 2, NaN);
        const x2 = sxNum(w, 3, NaN);
        const y2 = sxNum(w, 4, NaN);
        if (Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2)) {
          pts.push(
            { x: dipTraceCoordToMm(x1, scale), y: dipTraceCoordToMm(y1, scale) },
            { x: dipTraceCoordToMm(x2, scale), y: dipTraceCoordToMm(y2, scale) }
          );
        }
      }
      if (pts.length >= 2) {
        const netName = sxStr(sxFind(w, 'Net'), 1) || `NET_${wires.length + 1}`;
        wires.push({ id: uid('dtw'), points: pts, netName });
      }
    }

    for (const b of nodes.filter((l) => l[0] === 'Bus')) {
      const pts = sxFindAll(b, 'Pt').map((pt) => ({
        x: dipTraceCoordToMm(sxNum(pt, 1), scale),
        y: dipTraceCoordToMm(sxNum(pt, 2), scale)
      }));
      if (pts.length >= 2) {
        buses.push({ id: uid('dtb'), busName: sxStr(sxFind(b, 'Name'), 1) || sxStr(b, 1) || 'BUS', points: pts });
      }
    }

    for (const jn of nodes.filter((l) => l[0] === 'Junction')) {
      junctions.push({
        id: uid('dtj'),
        x: dipTraceCoordToMm(sxNum(jn, 1), scale),
        y: dipTraceCoordToMm(sxNum(jn, 2), scale),
        netName: sxStr(sxFind(jn, 'Net'), 1)
      });
    }

    for (const np of nodes.filter((l) => l[0] === 'NetPort')) {
      const netName = sxStr(sxFind(np, 'Name'), 1) || sxStr(np, 1) || 'NET';
      const orig = sxFind(np, 'Origin');
      const x = orig ? dipTraceCoordToMm(sxNum(orig, 1, 50), scale) : dipTraceCoordToMm(sxNum(np, 2, 50), scale);
      const y = orig ? dipTraceCoordToMm(sxNum(orig, 2, 50), scale) : dipTraceCoordToMm(sxNum(np, 3, 50), scale);
      const styleRaw = sxStr(sxFind(np, 'Style'), 1);
      const style: SchNetPort['style'] =
        styleRaw === 'Ground' || styleRaw === 'Power' || styleRaw === 'OffPageIn' || styleRaw === 'OffPageOut' || styleRaw === 'PortLeft' || styleRaw === 'PortRight'
          ? styleRaw
          : styleRaw === 'Bidir' ? 'PortRight'
          : /GND|VSS/i.test(netName) ? 'Ground'
          : /VCC|VDD|\+/i.test(netName) ? 'Power' : 'OffPageOut';
      const angle = ((Math.round(sxNum(sxFind(np, 'Angle'), 1, 0) / 90) * 90) % 360 + 360) % 360 as 0 | 90 | 180 | 270;
      netPorts.push({ id: uid('dtnp'), netName, style, x, y, angle, electricalType: styleRaw === 'Bidir' ? 'Bidirectional' : undefined });
    }

    for (const sh of nodes.filter((l) => l[0] === 'Shape')) {
      const type = sxStr(sxFind(sh, 'Type'), 1) as SchShape['type'];
      const pts = sxFindAll(sh, 'Pt').map((pt) => ({
        x: dipTraceCoordToMm(sxNum(pt, 1), scale),
        y: dipTraceCoordToMm(sxNum(pt, 2), scale)
      }));
      if (type === 'line' && pts.length >= 2) {
        shapes.push({ id: uid('dtsh'), type: 'line', x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y, width: sxNum(sxFind(sh, 'Width'), 1, 0.25) });
      } else if (type === 'rect' && pts.length >= 1) {
        shapes.push({
          id: uid('dtsh'),
          type: 'rect',
          x: pts[0].x,
          y: pts[0].y,
          w: sxNum(sxFind(sh, 'W'), 1, 10),
          h: sxNum(sxFind(sh, 'H'), 1, 10),
          width: sxNum(sxFind(sh, 'Width'), 1, 0.25)
        });
      } else if (type === 'text' && pts.length >= 1) {
        shapes.push({
          id: uid('dtsh'),
          type: 'text',
          x: pts[0].x,
          y: pts[0].y,
          text: sxStr(sxFind(sh, 'Text'), 1),
          size: sxNum(sxFind(sh, 'Size'), 1, 3.5)
        });
      }
    }

    const fmt = (sheetFmtRaw in SHEET_FORMATS ? sheetFmtRaw : 'A3_L') as SheetFormatId;
    return {
      id: `sheet_${sheetIdx + 1}`,
      name: sheetName || `Лист ${sheetIdx + 1}`,
      format: fmt,
      titleBlock: createDefaultGostTitleBlock({
        name: projectName,
        form: sheetIdx === 0 ? 'Form1' : 'Form2a',
        sheetNumber: sheetIdx + 1,
        totalSheets: Math.max(1, sheetNodes.length)
      }),
      components,
      wires,
      buses,
      busTaps: [],
      junctions,
      netPorts,
      diffPairs: [],
      hierarchyBlocks: [],
      shapes
    };
  };

  if (sheetNodes.length > 0) {
    sheetNodes.forEach((shNode, i) => {
      const subNodes: SExprList[] = [];
      sxWalk(shNode, (n) => subNodes.push(n));
      const shName = sxStr(sxFind(shNode, 'Name'), 1) || sxStr(shNode, 1) || `Лист ${i + 1}`;
      const shFmt = sxStr(sxFind(shNode, 'Format'), 1) || 'A3_L';
      builtSheets.push(parseSheetContents(subNodes, shName, i, shFmt));
    });
  } else {
    builtSheets.push(parseSheetContents(allLists, 'Лист 1', 0, 'A3_L'));
  }

  const rawProject: SchematicProject = {
    version: '1.0',
    filePath: `${projectName}.gostsch`,
    projectName,
    units: 'mm',
    gridSize: 2.5,
    origin: { x: 0, y: 0 },
    sheets: builtSheets,
    activeSheetId: builtSheets[0].id,
    netClasses: [
      { id: 'nc_default', name: 'Сигнальные', traceWidth: 0.25, minWidth: 0.15, maxWidth: 5, clearance: 0.2, viaOuterDiameter: 0.7, viaHoleDiameter: 0.35 }
    ],
    netClassAssignments: {},
    customComponentDefs,
    customPatternDefs: {}
  };

  return convertImportedSchematicToGost(rawProject, 'DipTrace ASCII (.dch/.asc)');
}
