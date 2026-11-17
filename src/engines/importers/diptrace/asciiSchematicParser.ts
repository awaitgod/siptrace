import {
  ComponentDef,
  PlacedComponent,
  Point2D,
  SchBus,
  SchJunction,
  SchNetPort,
  SchShape,
  SchWire,
  SchematicProject,
  SchematicSheet,
  SheetFormatId
} from '../../../core/types';
import { uid } from '../../../core/geometry';
import { createDefaultGostTitleBlock } from '../../../gost/gostTitleBlock';
import { SHEET_FORMATS } from '../../../gost/titleBlock/sheetFormats';
import { convertImportedSchematicToGost, GostConversionReport } from '../gostConverter';
import { SExprList, parseSExpressions, sxFind, sxFindAll, sxNum, sxStr, sxWalk } from '../sexprParser';

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
  const roots = parseSExpressions(ascii);
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
