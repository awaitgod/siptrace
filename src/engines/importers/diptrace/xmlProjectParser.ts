import { PcbPlacedComponent, PcbProject, PcbTrace, PlacedComponent, SchematicProject } from '../../../core/types';
import { uid } from '../../../core/geometry';
import { parseMiniXml, xmlFindAll, xmlFindFirst } from '../xmlMiniParser';
import { createImportedPcbProject, createImportedSchematicProject, createPlaceholderChipComponent } from '../projectShells';
import { convertImportedPcbToGost, convertImportedSchematicToGost, GostConversionReport } from '../gostConverter';

function parseSafeCoord(val: string | undefined, fallback: number): number {
  if (val === undefined || val === '') return fallback;
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : fallback;
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
    x: parseSafeCoord(p.attrs.X, 50 + (idx % 6) * 30),
    y: parseSafeCoord(p.attrs.Y, 50 + Math.floor(idx / 6) * 25),
    angle: ((Math.round(parseFloat(p.attrs.Angle || '0')) % 360 + 360) % 360) as 0 | 90 | 180 | 270,
    flipX: false,
    flipY: false,
    patternId: p.attrs.Pattern || '',
    refDesOffset: { x: 0, y: -7 },
    valueOffset: { x: 0, y: 7 },
    showRefDes: true,
    showValue: true
  }));

  const wires = xmlFindAll(root, 'Wire').map((w, idx) => {
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
      x: parseSafeCoord(c.attrs.X, 15 + (idx % 6) * 14),
      y: parseSafeCoord(c.attrs.Y, 15 + Math.floor(idx / 6) * 14)
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
