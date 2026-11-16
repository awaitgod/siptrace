import { ComponentDef, PatternDef, PcbProject, SchematicProject } from '../../core/types';
import { extractZipEntries, isZipBuffer, utf8Decode } from '../../core/utils/zipArchive';
import { convertSchematicToPcb } from '../netlist/schematicToPcbConverter';
import {
  parseDipTraceAsciiLibrary,
  parseDipTraceAsciiPcbWithReport,
  parseDipTraceAsciiSchematicWithReport,
  parseDipTraceXmlPcbWithReport,
  parseDipTraceXmlSchematicWithReport
} from './dipTraceImporter';
import {
  parseDxfToPcb,
  parseEagleXml,
  parseExcellonToPcb,
  parseForeignLibrary,
  parseGerberToPcb,
  parseKicadPcb,
  parseKicadSchematic,
  parseMultiEcadPcb,
  parseMultiEcadSchematic,
  parseProteusInput
} from './ecadFormatsImporter';
import { convertImportedPcbToGost, convertImportedSchematicToGost, GostConversionReport } from './gostConverter';
import { createImportedPcbProject, createImportedSchematicProject } from './projectShells';

export interface ImportedSchematicResult {
  project: SchematicProject;
  report: GostConversionReport;
  detectedFormat: string;
}

export interface ImportedPcbResult {
  pcb: PcbProject;
  report: GostConversionReport;
  detectedFormat: string;
}

export interface ImportedLibraryResult {
  components: ComponentDef[];
  patterns: PatternDef[];
  report: GostConversionReport;
  detectedFormat: string;
}

function emptyReport(sourceFormat: string): GostConversionReport {
  return {
    sourceFormat,
    convertedComponents: 0,
    convertedSymbolsToUgo: 0,
    convertedPatterns: 0,
    items: []
  };
}

function stripExt(filename = 'Импорт'): string {
  return filename.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || 'Импорт';
}

function isDipTraceXml(text: string): boolean {
  if (/<\s*eagle\b/i.test(text) || /<\s*(ISIS|PROTEUS)\b/i.test(text)) return false;
  return text.startsWith('<') && (/<(Source|Project|Schematic|Board|DipTrace)\b/.test(text) || text.includes('DipTrace'));
}

function isDipTraceAscii(text: string): boolean {
  return text.startsWith('(Source') || text.startsWith('(Schematic') || text.startsWith('(Board') || text.includes('(Part ') || text.includes('(Component ');
}

const nativeDipTraceSchematicMessage = 'Нативный двоичный файл DipTrace .dch пока не поддерживается. В DipTrace Schematic выполните «File → Save As» и сохраните копию в XML, затем импортируйте её. Проверьте результат: импорт XML пока неполный.';

function isNativeDipTraceSchematic(bytes: Uint8Array): boolean {
  // Native DipTrace schematics start with the length-prefixed DTSCHEM signature.
  return bytes.length >= 8 && bytes[0] === 7 && 'DTSCHEM'.split('').every((ch, i) => bytes[i + 1] === ch.charCodeAt(0));
}

/** Synchronous schematic importer supporting all plain-text ECAD formats and GOST-Trace JSON. */
export function importCadSchematicSync(text: string, filename = 'Импорт.gostsch'): ImportedSchematicResult {
  if (text.startsWith('\x07DTSCHEM')) throw new Error(nativeDipTraceSchematicMessage);
  const trimmed = text.trim();
  const ext = filename.toLowerCase();
  const baseName = stripExt(filename);

  // 1. Native GOST-Trace JSON
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as SchematicProject & { shape?: unknown; schematics?: unknown };
      if (obj && Array.isArray(obj.sheets)) {
        return {
          project: obj,
          report: emptyReport('ГОСТ-Трейс (.gostsch)'),
          detectedFormat: 'ГОСТ-Трейс (.gostsch)'
        };
      }
    } catch {
      // Fall through to EasyEDA JSON parser
    }
  }

  // 2. DipTrace XML
  if (isDipTraceXml(trimmed)) {
    const res = parseDipTraceXmlSchematicWithReport(trimmed);
    return { ...res, detectedFormat: 'DipTrace XML' };
  }

  // 3. DipTrace ASCII (.dch / .asc)
  if (isDipTraceAscii(trimmed) && !ext.endsWith('.kicad_sch')) {
    const res = parseDipTraceAsciiSchematicWithReport(trimmed);
    return { ...res, detectedFormat: 'DipTrace ASCII (.dch/.asc)' };
  }

  // 4. KiCad (.kicad_sch / legacy .sch)
  if (ext.endsWith('.kicad_sch') || trimmed.includes('(kicad_sch') || trimmed.includes('EESchema Schematic File')) {
    const res = parseKicadSchematic(trimmed, baseName);
    return { ...res, detectedFormat: 'KiCad Schematic' };
  }

  // 5. Autodesk Eagle / Fusion (.sch XML)
  if (trimmed.includes('<eagle') || (trimmed.startsWith('<') && trimmed.includes('<schematic'))) {
    const res = parseEagleXml(trimmed, false, baseName);
    if (res.schematic) return { ...res.schematic, detectedFormat: 'Autodesk Eagle / Fusion (.sch)' };
  }

  // 6. Proteus ASCII/XML (.sec / .sdf / .xml)
  if (ext.endsWith('.sec') || ext.endsWith('.sdf') || /<(COMPONENT|ISIS|PROTEUS)/i.test(trimmed)) {
    // parseProteusInput string path is synchronous in effect, parse directly via XML/pattern pass
    // Note: for full async ZIP .pdsprj use importCadSchematic
    const comps: SchematicProject['sheets'][0]['components'] = [];
    const base = createImportedSchematicProject({ filePath: `${baseName}.gostsch`, projectName: baseName, titleName: baseName, components: comps });
    const conv = convertImportedSchematicToGost(base, 'Proteus ISIS');
    if (trimmed.includes('<') || /\*COMPONENT|ATMEGA|LM016L|7SEG|BUTTON/i.test(trimmed)) {
      const mRes = parseMultiEcadSchematic(trimmed, baseName);
      if (mRes.project.sheets[0].components.length > 0) {
        return { ...mRes, detectedFormat: 'Proteus ISIS' };
      }
    }
    return { ...conv, detectedFormat: 'Proteus ISIS' };
  }

  // 7. DXF imported into schematic as shapes via PCB intermediate
  if (ext.endsWith('.dxf') || (trimmed.includes('SECTION') && trimmed.includes('ENTITIES'))) {
    const dxfPcb = parseDxfToPcb(trimmed, baseName);
    const sch = createImportedSchematicProject({ filePath: `${baseName}.gostsch`, projectName: baseName, titleName: baseName, components: [] });
    sch.sheets[0].shapes = dxfPcb.pcb.boardOutline.map((p, i) => {
      const next = dxfPcb.pcb.boardOutline[(i + 1) % dxfPcb.pcb.boardOutline.length];
      return {
        id: `dxfs_${i}`,
        type: 'line' as const,
        x1: p.x,
        y1: p.y,
        x2: next.x,
        y2: next.y,
        width: 0.25
      };
    });
    return { project: sch, report: dxfPcb.report, detectedFormat: 'Autodesk DXF' };
  }

  // 8. EasyEDA JSON, Altium ASCII .SchDoc, P-CAD, OrCAD EDIF, LTspice .asc, PADS, SPICE
  const multi = parseMultiEcadSchematic(trimmed, baseName);
  if (multi.project.sheets[0].components.length > 0 || multi.project.sheets[0].wires.length > 0) {
    return { ...multi, detectedFormat: multi.report.sourceFormat };
  }

  throw new Error(`Не удалось распознать формат файла схемы: ${filename}`);
}

/** Universal async schematic importer handling both text and binary/ZIP containers (.pdsprj, .zip, DipTrace, KiCad, Eagle, EasyEDA, Altium, SPICE). */
export async function importCadSchematic(input: string | Uint8Array, filename = 'Импорт.gostsch'): Promise<ImportedSchematicResult> {
  const ext = filename.toLowerCase();
  const baseName = stripExt(filename);

  if (input instanceof Uint8Array) {
    if (isZipBuffer(input)) {
      const entries = await extractZipEntries(input);
      const names = Object.keys(entries);

      // Proteus .pdsprj ZIP container
      if (ext.endsWith('.pdsprj') || names.some((n) => /\.(dsn|sec|sdf|workspace)$/i.test(n))) {
        const res = await parseProteusInput(input, baseName);
        return { ...res, detectedFormat: 'Proteus Design Suite (.pdsprj)' };
      }

      // ZIP archive wrapping KiCad / DipTrace / Eagle / Altium / EasyEDA schematic
      const schEntry = names.find((n) => /\.(kicad_sch|sch|dch|xml|asc|json|esch|cir)$/i.test(n));
      if (schEntry) {
        return importCadSchematic(entries[schEntry], schEntry);
      }
      throw new Error(`Внутри ZIP-архива ${filename} не найден поддерживаемый файл схемы.`);
    }

    if (isNativeDipTraceSchematic(input)) throw new Error(nativeDipTraceSchematicMessage);
    const decoded = utf8Decode(input);
    if (ext.endsWith('.pdsprj') || ext.endsWith('.dsn')) {
      const res = await parseProteusInput(input, baseName);
      return { ...res, detectedFormat: 'Proteus (.pdsprj/.dsn)' };
    }
    return importCadSchematicSync(decoded, filename);
  }

  if (ext.endsWith('.pdsprj') || ext.endsWith('.sec') || ext.endsWith('.sdf')) {
    const res = await parseProteusInput(input, baseName);
    return { ...res, detectedFormat: 'Proteus (.pdsprj/.sec)' };
  }
  return importCadSchematicSync(input, filename);
}

/** Synchronous PCB importer supporting GOST-Trace JSON, DipTrace, KiCad, Eagle, EasyEDA, Altium, PADS, P-CAD, DXF, Gerber. */
export function importCadPcbSync(text: string, filename = 'Импорт.gostpcb'): ImportedPcbResult {
  const trimmed = text.trim();
  const ext = filename.toLowerCase();
  const baseName = stripExt(filename);

  // 1. Native GOST-Trace PCB JSON
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as PcbProject;
      if (obj && Array.isArray(obj.components) && Array.isArray(obj.boardOutline)) {
        return { pcb: obj, report: emptyReport('ГОСТ-Трейс (.gostpcb)'), detectedFormat: 'ГОСТ-Трейс (.gostpcb)' };
      }
    } catch {
      // Fall through to EasyEDA PCB JSON
    }
  }

  // 2. DipTrace XML PCB
  if (isDipTraceXml(trimmed)) {
    const res = parseDipTraceXmlPcbWithReport(trimmed);
    return { ...res, detectedFormat: 'DipTrace XML PCB' };
  }

  // 3. DipTrace ASCII PCB (.dip / .asc)
  if ((isDipTraceAscii(trimmed) || trimmed.includes('(Trace') || trimmed.includes('(BoardOutline')) && !ext.endsWith('.kicad_pcb')) {
    const res = parseDipTraceAsciiPcbWithReport(trimmed);
    return { ...res, detectedFormat: 'DipTrace ASCII PCB (.dip/.asc)' };
  }

  // 4. KiCad PCB (.kicad_pcb or legacy $PCBNEW-BOARD)
  if (ext.endsWith('.kicad_pcb') || trimmed.includes('(kicad_pcb') || trimmed.includes('$PCBNEW-BOARD')) {
    if (trimmed.includes('$PCBNEW-BOARD')) {
      const res = parseMultiEcadPcb(trimmed, baseName);
      return { ...res, detectedFormat: 'Legacy KiCad (.brd)' };
    }
    const res = parseKicadPcb(trimmed, baseName);
    return { ...res, detectedFormat: 'KiCad PCB (.kicad_pcb)' };
  }

  // 5. Eagle / Fusion XML PCB
  if (trimmed.includes('<eagle') || trimmed.includes('<board')) {
    const res = parseEagleXml(trimmed, true, baseName);
    if (res.pcb) return { ...res.pcb, detectedFormat: 'Autodesk Eagle / Fusion (.brd)' };
  }

  // 6. AutoCAD DXF
  if (ext.endsWith('.dxf') || (trimmed.includes('SECTION') && trimmed.includes('ENTITIES'))) {
    const res = parseDxfToPcb(trimmed, baseName);
    return { ...res, detectedFormat: 'Autodesk DXF' };
  }

  // 7. Excellon Drill / Gerber RS-274X
  if (/\.(drl|xln)$/i.test(ext) || (trimmed.includes('M48') && !trimmed.includes('%FSLAX'))) {
    const res = parseExcellonToPcb(trimmed, baseName);
    return { ...res, detectedFormat: 'Excellon N/C Drill (.drl)' };
  }
  if (/\.(gbr|gtl|gbl|gto|gbo|gts|gbs|gko|gm1)$/i.test(ext) || trimmed.includes('%FSLAX') || trimmed.includes('G04 ')) {
    const res = parseGerberToPcb(trimmed, baseName);
    return { ...res, detectedFormat: 'Gerber RS-274X' };
  }

  // 8. EasyEDA PCB JSON, Altium .PcbDoc ASCII, PADS ASCII
  const multiPcb = parseMultiEcadPcb(trimmed, baseName);
  if (multiPcb.pcb.components.length > 0 || multiPcb.pcb.traces.length > 0 || multiPcb.pcb.vias.length > 0) {
    return { ...multiPcb, detectedFormat: multiPcb.report.sourceFormat };
  }

  // 9. Fallback: if user opened a schematic file (.dch / .kicad_sch / .sch) inside PCB Editor -> convert Schematic -> GOST PCB!
  try {
    const schRes = importCadSchematicSync(trimmed, filename);
    const pcb = convertSchematicToPcb(schRes.project);
    const conv = convertImportedPcbToGost(pcb, `${schRes.detectedFormat} → Плата ГОСТ`);
    return { ...conv, detectedFormat: `${schRes.detectedFormat} → Плата` };
  } catch {
    throw new Error(`Не удалось распознать формат файла платы: ${filename}`);
  }
}

/** Universal async PCB importer supporting ZIP archives (Gerber ZIP, Proteus .pdsprj -> PCB, zipped DipTrace/KiCad). */
export async function importCadPcb(input: string | Uint8Array, filename = 'Импорт.gostpcb'): Promise<ImportedPcbResult> {
  const ext = filename.toLowerCase();
  const baseName = stripExt(filename);

  if (input instanceof Uint8Array) {
    if (isZipBuffer(input)) {
      const entries = await extractZipEntries(input);
      const names = Object.keys(entries);

      // Gerber + Excellon ZIP bundle -> route each file to its proper PCB layer
      const gerberNames = names.filter((n) => /\.(gbr|gtl|gbl|gko|gm1|gts|gbs|gto|gbo|drl|xln)$/i.test(n));
      if (gerberNames.length > 0) {
        const merged = createImportedPcbProject({ filePath: `${baseName}.gostpcb`, projectName: baseName, components: [] });
        for (const gn of gerberNames) {
          const content = utf8Decode(entries[gn]);
          if (/\.(drl|xln)$/i.test(gn) || (content.includes('M48') && !content.includes('%FSLAX'))) {
            merged.vias.push(...parseExcellonToPcb(content, gn).pcb.vias);
            continue;
          }
          const parsed = parseGerberToPcb(content, gn);
          if (/\.(gko|gm1)$/i.test(gn)) {
            const poly: { x: number; y: number }[] = [];
            for (const tr of parsed.pcb.traces) poly.push(...tr.points);
            if (poly.length >= 3) {
              const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
              merged.boardOutline = [
                { x: Math.min(...xs), y: Math.min(...ys) },
                { x: Math.max(...xs), y: Math.min(...ys) },
                { x: Math.max(...xs), y: Math.max(...ys) },
                { x: Math.min(...xs), y: Math.max(...ys) }
              ];
            }
            continue;
          }
          if (/\.(gto|gbo)$/i.test(gn)) {
            const silkLay = /gbo/i.test(gn) ? 'BottomSilk' : 'TopSilk';
            for (const tr of parsed.pcb.traces) {
              for (let k = 1; k < tr.points.length; k++) {
                merged.shapes.push({ id: `gs_${merged.shapes.length}`, layer: silkLay, type: 'line', x1: tr.points[k - 1].x, y1: tr.points[k - 1].y, x2: tr.points[k].x, y2: tr.points[k].y, width: 0.15 });
              }
            }
            continue;
          }
          if (/\.(gts|gbs)$/i.test(gn)) continue;
          const isBot = /gbl|bottom/i.test(gn);
          for (const tr of parsed.pcb.traces) {
            merged.traces.push({ ...tr, layer: isBot ? 'BottomCopper' : 'TopCopper' });
          }
          merged.vias.push(...parsed.pcb.vias);
        }
        return {
          pcb: merged,
          report: emptyReport('Gerber ZIP архив'),
          detectedFormat: 'Gerber ZIP архив'
        };
      }

      // Proteus .pdsprj -> extract schematic and auto-convert to GOST PCB
      if (ext.endsWith('.pdsprj') || names.some((n) => /\.(dsn|sec|sdf|workspace)$/i.test(n))) {
        const schRes = await parseProteusInput(input, baseName);
        const pcb = convertSchematicToPcb(schRes.project);
        return { pcb, report: schRes.report, detectedFormat: 'Proteus (.pdsprj) → Плата ГОСТ' };
      }

      const pcbEntry = names.find((n) => /\.(kicad_pcb|brd|dip|pcbdoc|xml|dxf|json|epcb)$/i.test(n));
      if (pcbEntry) {
        return importCadPcbSync(utf8Decode(entries[pcbEntry]), pcbEntry);
      }

      const schEntry = names.find((n) => /\.(kicad_sch|sch|dch|asc|cir)$/i.test(n));
      if (schEntry) {
        return importCadPcbSync(utf8Decode(entries[schEntry]), schEntry);
      }

      throw new Error(`ZIP-архив ${filename} не содержит распознанных файлов платы или Gerber.`);
    }

    return importCadPcbSync(utf8Decode(input), filename);
  }

  return importCadPcbSync(input, filename);
}

/** Universal component/pattern library importer (.gostlib, DipTrace .eli/.lib, KiCad .kicad_sym/.kicad_mod, Eagle .lbr, DXF footprint). */
export async function importCadLibrary(input: string | Uint8Array, filename = 'library'): Promise<ImportedLibraryResult> {
  const text = input instanceof Uint8Array ? utf8Decode(input) : input;
  const trimmed = text.trim();
  const ext = filename.toLowerCase();

  // 1. Native .gostlib JSON
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as { components?: ComponentDef[]; patterns?: PatternDef[] };
      if (Array.isArray(obj.components) || Array.isArray(obj.patterns)) {
        return {
          components: obj.components ?? [],
          patterns: obj.patterns ?? [],
          report: emptyReport('Библиотека ГОСТ-Трейс (.gostlib)'),
          detectedFormat: 'Библиотека ГОСТ-Трейс (.gostlib)'
        };
      }
    } catch {
      // fall through
    }
  }

  // 2. DipTrace ASCII library (.eli / .lib)
  if (ext.endsWith('.eli') || ext.endsWith('.lib') || trimmed.includes('(Library') || trimmed.includes('(Pattern ')) {
    const res = parseDipTraceAsciiLibrary(trimmed);
    return { ...res, detectedFormat: 'DipTrace Library (.eli/.lib)' };
  }

  // 3. DXF -> Pattern footprint
  if (ext.endsWith('.dxf')) {
    const dxfPcb = parseDxfToPcb(trimmed, stripExt(filename));
    const pat: PatternDef = {
      id: `PAT_DXF_${Date.now().toString(36)}`,
      name: `${stripExt(filename)} (DXF)`,
      library: 'Импорт DXF',
      gostName: 'ГОСТ / DXF',
      description: `Посадочное место из DXF: ${filename}`,
      pads: dxfPcb.pcb.vias.map((v, idx) => ({
        id: `dxfp_${idx}`,
        number: String(idx + 1),
        type: 'THT',
        shape: 'Round',
        x: v.x,
        y: v.y,
        width: v.outerDiameter,
        height: v.outerDiameter,
        holeDiameter: v.holeDiameter,
        layer: 'All'
      })),
      graphics: [{ type: 'polyline', layer: 'TopSilk', points: dxfPcb.pcb.boardOutline, closed: true, width: 0.15 }],
      courtyard: { width: 20, height: 20 },
      model3d: { shape: 'Box', bodyWidth: 12, bodyLength: 10, bodyHeight: 2.5, color: '#222225' }
    };
    return { components: [], patterns: [pat], report: dxfPcb.report, detectedFormat: 'Autodesk DXF' };
  }

  // 4. KiCad (.kicad_sym / .kicad_mod) or Eagle (.lbr)
  const res = parseForeignLibrary(trimmed, filename);
  return { ...res, detectedFormat: res.report.sourceFormat };
}
