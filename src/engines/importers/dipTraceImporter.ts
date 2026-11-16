import {
  ComponentDef,
  PadDef,
  PatternDef,
  PcbPlacedComponent,
  PcbProject,
  PcbTrace,
  PcbVia,
  PlacedComponent,
  Point2D,
  SchNetPort,
  SchShape,
  SchWire,
  SchematicProject,
  SchematicSheet
} from '../../core/types';
import { uid } from '../../core/geometry';
import { findComponentById } from '../../gost/libraries/gostComponents';
import { findPatternById } from '../../gost/libraries/gostPatterns';
import { createGostDesignRules } from '../../gost/gostRules';
import { createDefaultGostTitleBlock } from '../../gost/gostTitleBlock';
import { SExprList, parseSExpressions, sxFind, sxFindAll, sxNum, sxStr, sxWalk } from './sexprParser';
import { parseMiniXml, xmlFindAll, xmlFindFirst } from './xmlMiniParser';
import { createImportedPcbProject, createImportedSchematicProject, createPlaceholderChipComponent } from './projectShells';
import { convertImportedPcbToGost, convertImportedSchematicToGost, GostConversionReport } from './gostConverter';

function dipTraceCoordToMm(val: number, scaleFactor: number): number {
  return Math.round(val * scaleFactor * 100) / 100;
}

function detectDipTraceScaleFactor(coords: number[]): number {
  const maxAbs = coords.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  // DipTrace older .asc uses 3 units = 1 mm or 10 units = 1 mm (~300..3000 range)
  if (maxAbs > 1500) return 0.1;
  if (maxAbs > 450) return 1 / 3;
  return 1.0;
}

/** Parses full DipTrace ASCII Schematic (.dch / .asc) including sheets, parts, pins, wires, nets, netPorts, shapes. */
export function parseDipTraceAsciiSchematicFull(ascii: string): SchematicProject {
  return parseDipTraceAsciiSchematicWithReport(ascii).project;
}

/** Parses full DipTrace ASCII Schematic (.dch / .asc) and returns both project and GOST conversion report. */
export function parseDipTraceAsciiSchematicWithReport(ascii: string): {
  project: SchematicProject;
  report: GostConversionReport;
} {
  const roots = parseSExpressions(ascii);
  const allLists: SExprList[] = [];
  for (const r of roots) sxWalk(r, (node) => allLists.push(node));

  const topLevelNodes = roots.flatMap((r) => (Array.isArray(r) ? [r, ...r.filter((x): x is SExprList => Array.isArray(x))] : []));
  const projectName =
    sxStr(topLevelNodes.find((l) => l[0] === 'Name' || l[0] === 'Title'), 1) || 'Импорт_DipTrace_Схема';

  // Extract raw coordinates to auto-detect DipTrace scaling (mm vs internal units)
  const sampleCoords: number[] = [];
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
  const scale = detectDipTraceScaleFactor(sampleCoords);

  // Collect sheets if explicit (Sheet ...) nodes exist, otherwise single sheet
  const sheetNodes = allLists.filter((l) => l[0] === 'Sheet' && Array.isArray(l[1]) === false && l.length > 2);
  const effectiveSheetNodes: SExprList[] = sheetNodes.length > 0 ? sheetNodes : [{ ...allLists, length: 0 } as unknown as SExprList];

  const builtSheets: SchematicSheet[] = [];
  const customComponentDefs: Record<string, ComponentDef> = {};

  const parseSheetContents = (nodes: SExprList[], sheetName: string, sheetIdx: number): SchematicSheet => {
    const components: PlacedComponent[] = [];
    const wires: SchWire[] = [];
    const netPorts: SchNetPort[] = [];
    const shapes: SchShape[] = [];
    const seenPartKeys = new Set<string>();

    const partNodes = nodes.filter((l) => l[0] === 'Part' && (sxFind(l, 'RefDes') || sxFind(l, 'Name') || typeof l[1] === 'string'));
    partNodes.forEach((p, idx) => {
      const refDes = sxStr(sxFind(p, 'RefDes'), 1) || (typeof p[1] === 'string' && /^[A-Za-zА-Яа-я#]+\d*$/.test(p[1]) ? p[1] : `U${idx + 1}`);
      const partName = sxStr(sxFind(p, 'Name'), 1) || sxStr(sxFind(p, 'PartName'), 1) || (typeof p[2] === 'string' ? p[2] : refDes);
      const value = sxStr(sxFind(p, 'Value'), 1) || partName;
      const pattern = sxStr(sxFind(p, 'Pattern'), 1) || sxStr(sxFind(p, 'AttachedPattern'), 1) || '';
      const originNode = sxFind(p, 'Origin') ?? sxFind(p, 'Pt');
      const x = originNode ? dipTraceCoordToMm(sxNum(originNode, 1, 50), scale) : dipTraceCoordToMm(sxNum(p, 2, 50 + (idx % 6) * 30), scale);
      const y = originNode ? dipTraceCoordToMm(sxNum(originNode, 2, 50), scale) : dipTraceCoordToMm(sxNum(p, 3, 50 + Math.floor(idx / 6) * 25), scale);
      const angle = ((Math.round(sxNum(sxFind(p, 'Angle'), 1, 0) / 90) * 90) % 360 + 360) % 360 as 0 | 90 | 180 | 270;

      const key = `${refDes}_${x}_${y}`;
      if (seenPartKeys.has(key)) return;
      seenPartKeys.add(key);

      // Extract explicit pins inside Part if present for faithful custom UGO synthesis
      const pinNodes = sxFindAll(p, 'Pin');
      const customPins = pinNodes.map((pn, pIdx) => ({
        id: `dp_${idx}_${pIdx}`,
        number: sxStr(sxFind(pn, 'Number'), 1) || sxStr(pn, 1) || String(pIdx + 1),
        name: sxStr(sxFind(pn, 'Name'), 1) || sxStr(pn, 2) || `P${pIdx + 1}`,
        x: -15,
        y: (pIdx - pinNodes.length / 2) * 5,
        length: 5,
        orientation: 0 as const,
        electricalType: 'Passive' as const,
        style: 'Line' as const,
        showName: true,
        showNumber: true,
        padMapping: String(pIdx + 1)
      }));

      const customId = `DIP_IMP_${partName.replace(/[^A-Za-z0-9]/g, '_')}_${customPins.length}`;
      if (customPins.length > 0 && !customComponentDefs[customId]) {
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
        componentDefId: customPins.length > 0 ? customId : partName,
        libraryId: 'lib_gost_import',
        refDes,
        value,
        typeName: partName,
        partIndex: 1,
        x,
        y,
        angle,
        flipX: false,
        flipY: false,
        patternId: pattern,
        refDesOffset: { x: 0, y: -7 },
        valueOffset: { x: 0, y: 7 },
        showRefDes: true,
        showValue: true
      });
    });

    // Wires from (Wire ...) / (Line ...) / (Net ... (Wire ...))
    const wireNodes = nodes.filter((l) => l[0] === 'Wire' || l[0] === 'NetWire');
    for (const w of wireNodes) {
      const pts: Point2D[] = [];
      const ptNodes = sxFindAll(w, 'Pt').concat(sxFindAll(w, 'Point'));
      if (ptNodes.length >= 2) {
        for (const pt of ptNodes) {
          pts.push({
            x: Math.max(15, Math.min(400, dipTraceCoordToMm(sxNum(pt, 1), scale))),
            y: Math.max(15, Math.min(280, dipTraceCoordToMm(sxNum(pt, 2), scale)))
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

    // NetPorts
    for (const np of nodes.filter((l) => l[0] === 'NetPort')) {
      const netName = sxStr(sxFind(np, 'Name'), 1) || sxStr(np, 1) || 'NET';
      const x = dipTraceCoordToMm(sxNum(np, 2, 50), scale);
      const y = dipTraceCoordToMm(sxNum(np, 3, 50), scale);
      netPorts.push({
        id: uid('dtnp'),
        netName,
        style: /GND|VSS/i.test(netName) ? 'Ground' : /VCC|VDD|\+/i.test(netName) ? 'Power' : 'OffPageOut',
        x,
        y,
        angle: 0
      });
    }

    return {
      id: `sheet_${sheetIdx + 1}`,
      name: sheetName || `Лист ${sheetIdx + 1}`,
      format: 'A3_L',
      titleBlock: createDefaultGostTitleBlock({
        name: projectName,
        form: sheetIdx === 0 ? 'Form1' : 'Form2a',
        sheetNumber: sheetIdx + 1,
        totalSheets: Math.max(1, effectiveSheetNodes.length)
      }),
      components,
      wires,
      buses: [],
      busTaps: [],
      junctions: [],
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
      builtSheets.push(parseSheetContents(subNodes, shName, i));
    });
  } else {
    builtSheets.push(parseSheetContents(allLists, 'Лист 1', 0));
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

/** Parses full DipTrace ASCII PCB (.dip / .asc) including components, pads, traces, vias, nets, and board outline. */
export function parseDipTraceAsciiPcbFull(ascii: string): PcbProject {
  return parseDipTraceAsciiPcbWithReport(ascii).pcb;
}

/** Parses full DipTrace ASCII PCB (.dip / .asc) and returns both PCB project and GOST conversion report. */
export function parseDipTraceAsciiPcbWithReport(ascii: string): {
  pcb: PcbProject;
  report: GostConversionReport;
} {
  const roots = parseSExpressions(ascii);
  const allLists: SExprList[] = [];
  for (const r of roots) sxWalk(r, (node) => allLists.push(node));

  const topLevelNodes = roots.flatMap((r) => (Array.isArray(r) ? [r, ...r.filter((x): x is SExprList => Array.isArray(x))] : []));
  const projectName = sxStr(topLevelNodes.find((l) => l[0] === 'Name' || l[0] === 'Title'), 1) || 'Импорт_DipTrace_Плата';
  const sampleCoords: number[] = [];
  for (const l of allLists) {
    if (l[0] === 'Origin' || l[0] === 'Pt' || l[0] === 'Via') {
      const a = parseFloat(sxStr(l, 1));
      const b = parseFloat(sxStr(l, 2));
      if (Number.isFinite(a)) sampleCoords.push(a);
      if (Number.isFinite(b)) sampleCoords.push(b);
    } else if (l[0] === 'Component' || l[0] === 'Pad') {
      const a = parseFloat(sxStr(l, 2, sxStr(l, 1)));
      const b = parseFloat(sxStr(l, 3, sxStr(l, 2)));
      if (Number.isFinite(a)) sampleCoords.push(a);
      if (Number.isFinite(b)) sampleCoords.push(b);
    }
  }
  const scale = detectDipTraceScaleFactor(sampleCoords);

  const components: PcbPlacedComponent[] = [];
  const compNodes = allLists.filter((l) => l[0] === 'Component' && (sxFind(l, 'RefDes') || sxFind(l, 'Pattern') || typeof l[1] === 'string'));
  compNodes.forEach((cn, idx) => {
    const refDes = sxStr(sxFind(cn, 'RefDes'), 1) || (typeof cn[1] === 'string' ? cn[1] : `U${idx + 1}`);
    const value = sxStr(sxFind(cn, 'Value'), 1) || sxStr(sxFind(cn, 'Name'), 1) || '';
    const patternName = sxStr(sxFind(cn, 'Pattern'), 1) || '';
    const orig = sxFind(cn, 'Origin') ?? sxFind(cn, 'Pt');
    const x = orig ? dipTraceCoordToMm(sxNum(orig, 1, 15 + idx * 12), scale) : dipTraceCoordToMm(sxNum(cn, 2, 15 + (idx % 6) * 14), scale);
    const y = orig ? dipTraceCoordToMm(sxNum(orig, 2, 15), scale) : dipTraceCoordToMm(sxNum(cn, 3, 15 + Math.floor(idx / 6) * 14), scale);
    const angle = ((Math.round(sxNum(sxFind(cn, 'Angle'), 1, 0)) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
    const sideStr = sxStr(sxFind(cn, 'Side'), 1).toLowerCase();
    const side = sideStr.includes('bot') ? 'Bottom' : 'Top';

    const padNodes = sxFindAll(cn, 'Pad');
    const pads: PadDef[] = padNodes.map((pn, pIdx) => {
      const num = sxStr(pn, 1) || String(pIdx + 1);
      const px = dipTraceCoordToMm(sxNum(sxFind(pn, 'Origin') ?? pn, 1, (pIdx - 0.5) * 2), scale);
      const py = dipTraceCoordToMm(sxNum(sxFind(pn, 'Origin') ?? pn, 2, 0), scale);
      const hole = dipTraceCoordToMm(sxNum(sxFind(pn, 'Hole'), 1, 0), scale);
      const w = Math.max(0.5, dipTraceCoordToMm(sxNum(sxFind(pn, 'Width'), 1, hole > 0 ? 1.7 : 1.0), scale));
      const h = Math.max(0.5, dipTraceCoordToMm(sxNum(sxFind(pn, 'Height'), 1, hole > 0 ? 1.7 : 1.2), scale));
      return {
        id: uid('dpad'),
        number: num,
        type: hole > 0 ? 'THT' : 'SMD',
        shape: pIdx === 0 ? 'Rect' : 'Round',
        x: Number.isFinite(px) && Math.abs(px) < 80 ? px : (pIdx - 0.5) * 2.54,
        y: Number.isFinite(py) && Math.abs(py) < 80 ? py : 0,
        width: w,
        height: h,
        holeDiameter: hole,
        layer: hole > 0 ? 'All' : side
      };
    });

    const baseComp = createPlaceholderChipComponent({
      idPrefix: 'dtpcb',
      refDes,
      value,
      typeName: value || patternName || refDes,
      x: Number.isFinite(x) ? x : 20,
      y: Number.isFinite(y) ? y : 20
    });
    baseComp.patternId = patternName || 'PAT_CHIP_2012M';
    baseComp.side = side;
    baseComp.angle = angle;
    if (pads.length > 0) baseComp.pads = pads;
    components.push(baseComp);
  });

  // Traces
  const traces: PcbTrace[] = [];
  for (const tr of allLists.filter((l) => l[0] === 'Trace')) {
    const pts: Point2D[] = sxFindAll(tr, 'Pt').concat(sxFindAll(tr, 'Point')).map((pt) => ({
      x: dipTraceCoordToMm(sxNum(pt, 1), scale),
      y: dipTraceCoordToMm(sxNum(pt, 2), scale)
    }));
    if (pts.length >= 2) {
      const layerRaw = sxStr(sxFind(tr, 'Layer'), 1).toLowerCase();
      traces.push({
        id: uid('dtr'),
        layer: layerRaw.includes('bot') ? 'BottomCopper' : 'TopCopper',
        netName: sxStr(sxFind(tr, 'Net'), 1) || '',
        points: pts,
        width: Math.max(0.15, dipTraceCoordToMm(sxNum(sxFind(tr, 'Width'), 1, 0.25), scale))
      });
    }
  }

  // Vias
  const vias: PcbVia[] = allLists.filter((l) => l[0] === 'Via').map((vn) => ({
    id: uid('dvia'),
    x: dipTraceCoordToMm(sxNum(vn, 1, 20), scale),
    y: dipTraceCoordToMm(sxNum(vn, 2, 20), scale),
    netName: sxStr(sxFind(vn, 'Net'), 1) || '',
    outerDiameter: Math.max(0.6, dipTraceCoordToMm(sxNum(sxFind(vn, 'Outer'), 1, 0.7), scale)),
    holeDiameter: Math.max(0.3, dipTraceCoordToMm(sxNum(sxFind(vn, 'Hole'), 1, 0.35), scale)),
    startLayer: 'TopCopper',
    endLayer: 'BottomCopper',
    viaStyle: 'Through'
  }));

  // Board outline
  const outlineNode = allLists.find((l) => l[0] === 'BoardOutline' || l[0] === 'Outline');
  const boardOutline: Point2D[] = outlineNode
    ? sxFindAll(outlineNode, 'Pt').concat(sxFindAll(outlineNode, 'Point')).map((pt) => ({
        x: dipTraceCoordToMm(sxNum(pt, 1), scale),
        y: dipTraceCoordToMm(sxNum(pt, 2), scale)
      }))
    : [];

  const pcb = createImportedPcbProject({
    filePath: `${projectName}.gostpcb`,
    projectName,
    components
  });
  pcb.traces = traces;
  pcb.vias = vias;
  if (boardOutline.length >= 3) pcb.boardOutline = boardOutline;
  pcb.designRules = createGostDesignRules(4);

  return convertImportedPcbToGost(pcb, 'DipTrace ASCII PCB (.dip/.asc)');
}

/** Parses DipTrace XML Schematic with full attribute/child extraction + GOST conversion. */
export function parseDipTraceXmlSchematic(xml: string): SchematicProject {
  return parseDipTraceXmlSchematicWithReport(xml).project;
}

/** Parses DipTrace XML Schematic and returns both project and GOST conversion report. */
export function parseDipTraceXmlSchematicWithReport(xml: string): {
  project: SchematicProject;
  report: GostConversionReport;
} {
  const root = parseMiniXml(xml);
  const nameMatch = /Name="([^"]+)"/.exec(xml);
  const projName = xmlFindFirst(root, 'Project')?.attrs.Name || nameMatch?.[1] || 'Импорт_DipTrace_XML';
  const rawParts = xmlFindAll(root, 'Part');
  const parts = (rawParts.length > 0 ? rawParts : xmlFindAll(root, 'Component')).filter((p) =>
    Boolean(p.attrs.RefDes || p.attrs.Name || p.attrs.Value)
  );
  const comps: PlacedComponent[] = parts.map((p, idx) => ({
    id: uid('xmlsch'),
    componentDefId: p.attrs.Name || p.attrs.Type || 'R',
    libraryId: 'lib_gost_import',
    refDes: p.attrs.RefDes || `U${idx + 1}`,
    value: p.attrs.Value || p.attrs.Name || '',
    typeName: p.attrs.Name || p.attrs.Type || '',
    partIndex: 1,
    x: parseFloat(p.attrs.X || String(50 + (idx % 6) * 30)) || 50,
    y: parseFloat(p.attrs.Y || String(50 + Math.floor(idx / 6) * 25)) || 50,
    angle: ((Math.round(parseFloat(p.attrs.Angle || '0')) % 360 + 360) % 360) as 0 | 90 | 180 | 270,
    flipX: false,
    flipY: false,
    patternId: p.attrs.Pattern || '',
    refDesOffset: { x: 0, y: -7 },
    valueOffset: { x: 0, y: 7 },
    showRefDes: true,
    showValue: true
  }));

  const wires: SchWire[] = xmlFindAll(root, 'Wire').map((w, idx) => {
    const pts = xmlFindAll(w, 'Point').map((pt) => ({
      x: parseFloat(pt.attrs.X || '0'),
      y: parseFloat(pt.attrs.Y || '0')
    }));
    return { id: uid('xw'), points: pts, netName: w.attrs.Net || `NET_${idx + 1}` };
  }).filter((w) => w.points.length >= 2);

  const raw = createImportedSchematicProject({
    filePath: `${projName}.gostsch`,
    projectName: projName,
    titleName: projName,
    components: comps,
    wires
  });
  return convertImportedSchematicToGost(raw, 'DipTrace XML');
}

/** Parses DipTrace XML PCB with full component, pad, trace, and board outline extraction + GOST conversion. */
export function parseDipTraceXmlPcb(xml: string): PcbProject {
  return parseDipTraceXmlPcbWithReport(xml).pcb;
}

/** Parses DipTrace XML PCB and returns both PCB project and GOST conversion report. */
export function parseDipTraceXmlPcbWithReport(xml: string): {
  pcb: PcbProject;
  report: GostConversionReport;
} {
  const root = parseMiniXml(xml);
  const nameMatch = /Name="([^"]+)"/.exec(xml);
  const projName = xmlFindFirst(root, 'Board')?.attrs.Name || nameMatch?.[1] || 'Импорт_DipTrace_PCB_XML';
  const rawCompNodes = xmlFindAll(root, 'Component');
  const compNodes = (rawCompNodes.length > 0 ? rawCompNodes : xmlFindAll(root, 'Part')).filter((c) =>
    Boolean(c.attrs.RefDes || c.attrs.Name || c.attrs.Pattern)
  );
  const comps: PcbPlacedComponent[] = compNodes.map((c, idx) => {
    const comp = createPlaceholderChipComponent({
      idPrefix: 'xmlpcb',
      refDes: c.attrs.RefDes || `U${idx + 1}`,
      value: c.attrs.Value || '',
      typeName: c.attrs.Name || c.attrs.Pattern || c.attrs.RefDes || 'ЭРЭ',
      x: parseFloat(c.attrs.X || String(15 + (idx % 6) * 14)) || 20,
      y: parseFloat(c.attrs.Y || String(15 + Math.floor(idx / 6) * 14)) || 20
    });
    comp.patternId = c.attrs.Pattern || comp.patternId;
    comp.side = c.attrs.Side?.toLowerCase().includes('bot') ? 'Bottom' : 'Top';
    return comp;
  });

  const pcb = createImportedPcbProject({ filePath: `${projName}.gostpcb`, projectName: projName, components: comps });
  const traces: PcbTrace[] = xmlFindAll(root, 'Trace').map((t) => ({
    id: uid('xtr'),
    layer: (t.attrs.Layer?.toLowerCase().includes('bot') ? 'BottomCopper' : 'TopCopper') as 'TopCopper' | 'BottomCopper',
    netName: t.attrs.Net || '',
    width: parseFloat(t.attrs.Width || '0.25') || 0.25,
    points: xmlFindAll(t, 'Point').map((pt) => ({ x: parseFloat(pt.attrs.X || '0'), y: parseFloat(pt.attrs.Y || '0') }))
  })).filter((t) => t.points.length >= 2);
  pcb.traces = traces;

  const outlinePts = xmlFindAll(xmlFindFirst(root, 'BoardOutline') ?? null, 'Point').map((pt) => ({
    x: parseFloat(pt.attrs.X || '0'),
    y: parseFloat(pt.attrs.Y || '0')
  }));
  if (outlinePts.length >= 3) pcb.boardOutline = outlinePts;

  return convertImportedPcbToGost(pcb, 'DipTrace XML PCB');
}

/** Imports DipTrace ASCII library (.eli components or .lib patterns) and converts entries to GOST. */
export function parseDipTraceAsciiLibrary(ascii: string): {
  components: ComponentDef[];
  patterns: PatternDef[];
  report: GostConversionReport;
} {
  const roots = parseSExpressions(ascii);
  const all: SExprList[] = [];
  for (const r of roots) sxWalk(r, (n) => all.push(n));

  const components: ComponentDef[] = [];
  const patterns: PatternDef[] = [];

  for (const cn of all.filter((l) => l[0] === 'Component' || l[0] === 'Part')) {
    const name = sxStr(sxFind(cn, 'Name'), 1) || sxStr(cn, 1);
    const refDes = sxStr(sxFind(cn, 'RefDes'), 1) || 'DD';
    const pattern = sxStr(sxFind(cn, 'Pattern'), 1) || 'PAT_DIP8';
    const pins = sxFindAll(cn, 'Pin').map((p, i) => ({
      number: sxStr(sxFind(p, 'Number'), 1) || sxStr(p, 1) || String(i + 1),
      name: sxStr(sxFind(p, 'Name'), 1) || sxStr(p, 2) || `P${i + 1}`,
      x: i % 2 === 0 ? -10 : 10,
      y: i * 5
    }));
    if (!name) continue;
    const dummyProj = createImportedSchematicProject({
      filePath: 'lib.gostsch',
      projectName: 'lib',
      titleName: 'lib',
      components: [
        {
          id: uid('imp'),
          componentDefId: name,
          libraryId: 'lib_import',
          refDes: refDes.replace(/\d+$/, '') + '1',
          value: name,
          typeName: name,
          partIndex: 1,
          x: 100,
          y: 100,
          angle: 0,
          flipX: false,
          flipY: false,
          patternId: pattern,
          refDesOffset: { x: 0, y: -6 },
          valueOffset: { x: 0, y: 6 },
          showRefDes: true,
          showValue: true
        }
      ]
    });
    if (pins.length > 0) {
      dummyProj.customComponentDefs[name] = {
        id: name,
        name,
        library: 'Import',
        refDesPrefix: refDes.replace(/\d+$/, '') || 'DD',
        defaultValue: name,
        gostStandard: '',
        description: name,
        manufacturer: '',
        patternId: pattern,
        parts: [{ partIndex: 1, name: 'Part 1', primitives: [], pins: pins.map((p, idx) => ({ ...p, id: `p${idx}`, length: 5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: true, showNumber: true, padMapping: p.number })) }]
      };
    }
    const conv = convertImportedSchematicToGost(dummyProj, 'DipTrace ELI');
    const cDefId = conv.project.sheets[0].components[0].componentDefId;
    const resolvedDef = findComponentById(cDefId, conv.project.customComponentDefs);
    if (resolvedDef) components.push({ ...resolvedDef });
  }

  for (const pn of all.filter((l) => l[0] === 'Pattern' && sxFindAll(l, 'Pad').length > 0)) {
    const pName = sxStr(sxFind(pn, 'Name'), 1) || sxStr(pn, 1) || 'CustomPattern';
    const pads: PadDef[] = sxFindAll(pn, 'Pad').map((pd, i) => {
      const hole = sxNum(sxFind(pd, 'Hole'), 1, 0);
      return {
        id: uid('lpad'),
        number: sxStr(pd, 1) || String(i + 1),
        type: hole > 0 ? 'THT' : 'SMD',
        shape: i === 0 ? 'Rect' : 'Round',
        x: sxNum(sxFind(pd, 'Origin') ?? pd, 1, (i - 1) * 2.54),
        y: sxNum(sxFind(pd, 'Origin') ?? pd, 2, 0),
        width: Math.max(0.5, sxNum(sxFind(pd, 'Width'), 1, 1.5)),
        height: Math.max(0.5, sxNum(sxFind(pd, 'Height'), 1, 1.5)),
        holeDiameter: hole,
        layer: hole > 0 ? 'All' : 'Top'
      };
    });
    patterns.push({
      id: `PAT_IMP_${pName.replace(/[^A-Za-z0-9]/g, '_')}`,
      name: `${pName} (ГОСТ импорт)`,
      library: 'Импортированные корпуса',
      gostName: 'ГОСТ / DipTrace',
      description: `Импортировано из DipTrace: ${pName}`,
      pads,
      graphics: [{ type: 'rect', layer: 'TopSilk', x: -5, y: -4, w: 10, h: 8, width: 0.15 }],
      courtyard: { width: 12, height: 10 },
      model3d: { shape: 'Box', bodyWidth: 10, bodyLength: 8, bodyHeight: 2.5, color: '#222225' }
    });
  }

  return {
    components,
    patterns,
    report: {
      sourceFormat: 'DipTrace Library (.eli/.lib)',
      convertedComponents: components.length,
      convertedSymbolsToUgo: components.length,
      convertedPatterns: patterns.length,
      items: []
    }
  };
}

/** Exports a GOST SchematicProject in DipTrace-compatible ASCII format (.dch/.asc). */
export function exportDipTraceAsciiSchematic(sch: SchematicProject): string {
  const lines: string[] = [
    `(Source "DipTrace-Schematic" "GOSTTrace-Export")`,
    `(Schematic "${sch.projectName}"`,
    `  (Units "${sch.units}")`,
    `  (GridSize ${sch.gridSize})`
  ];
  for (const sheet of sch.sheets) {
    lines.push(`  (Sheet "${sheet.name}" (Format "${sheet.format}")`);
    lines.push(`    (Components`);
    for (const c of sheet.components) {
      const patName = findPatternById(c.patternId, sch.customPatternDefs)?.name ?? c.patternId;
      lines.push(`      (Part "${c.refDes}" "${c.typeName || c.componentDefId}"`);
      lines.push(`        (RefDes "${c.refDes}")`);
      lines.push(`        (Name "${c.typeName || c.value || c.refDes}")`);
      lines.push(`        (Value "${c.value}")`);
      lines.push(`        (Pattern "${patName}")`);
      lines.push(`        (Origin ${c.x.toFixed(3)} ${c.y.toFixed(3)})`);
      lines.push(`        (Angle ${c.angle})`);
      lines.push(`      )`);
    }
    lines.push(`    )`);
    lines.push(`    (Wires`);
    for (const w of sheet.wires) {
      const ptsStr = w.points.map((p) => `(Pt ${p.x.toFixed(3)} ${p.y.toFixed(3)})`).join(' ');
      lines.push(`      (Wire (Net "${w.netName}") ${ptsStr})`);
    }
    lines.push(`    )`);
    lines.push(`  )`);
  }
  lines.push(`)`);
  return lines.join('\n');
}

/** Exports a GOST PcbProject in DipTrace-compatible ASCII format (.dip/.asc). */
export function exportDipTraceAsciiPcb(pcb: PcbProject): string {
  const lines: string[] = [
    `(Source "DipTrace-PCB" "GOSTTrace-Export")`,
    `(Board "${pcb.projectName}"`,
    `  (Units "${pcb.units}")`,
    `  (BoardThickness ${pcb.boardThickness})`,
    `  (BoardOutline ${pcb.boardOutline.map((p) => `(Pt ${p.x.toFixed(3)} ${p.y.toFixed(3)})`).join(' ')})`,
    `  (Components`
  ];
  for (const c of pcb.components) {
    lines.push(`    (Component "${c.refDes}"`);
    lines.push(`      (RefDes "${c.refDes}")`);
    lines.push(`      (Value "${c.value}")`);
    lines.push(`      (Pattern "${c.patternId}")`);
    lines.push(`      (Side "${c.side}")`);
    lines.push(`      (Origin ${c.x.toFixed(3)} ${c.y.toFixed(3)})`);
    lines.push(`      (Angle ${c.angle})`);
    for (const pd of c.pads) {
      lines.push(`      (Pad "${pd.number}" (Origin ${pd.x.toFixed(3)} ${pd.y.toFixed(3)}) (Width ${pd.width}) (Height ${pd.height}) (Hole ${pd.holeDiameter ?? 0}))`);
    }
    lines.push(`    )`);
  }
  lines.push(`  )`);
  lines.push(`  (Traces`);
  for (const tr of pcb.traces) {
    const pts = tr.points.map((p) => `(Pt ${p.x.toFixed(3)} ${p.y.toFixed(3)})`).join(' ');
    lines.push(`    (Trace (Net "${tr.netName}") (Layer "${tr.layer}") (Width ${tr.width.toFixed(3)}) ${pts})`);
  }
  lines.push(`  )`);
  lines.push(`  (Vias`);
  for (const v of pcb.vias) {
    lines.push(`    (Via ${v.x.toFixed(3)} ${v.y.toFixed(3)} (Net "${v.netName}") (Outer ${v.outerDiameter}) (Hole ${v.holeDiameter}))`);
  }
  lines.push(`  )`);
  lines.push(`)`);
  return lines.join('\n');
}
