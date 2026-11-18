import { ComponentDef, PatternDef, PcbProject, SchematicProject } from '../../core/types';
import { GostConversionReport } from './gostConverter';
import { parseAltiumOrPcadPcb, parseAltiumOrPcadSchematic } from './ecad/altiumParser';
import { parseEasyEdaLibraryJson, parseEasyEdaPcbJson, parseEasyEdaSchematicJson } from './ecad/easyEdaParser';
import { parseLtspiceAsc, parsePadsAsciiPcb, parsePadsAsciiSchematic, parseSpiceNetlist } from './ecad/ltspiceAndSpiceParser';
import { parseKicadPcb } from './kicad/kicadPcbParser';
import { parseKicadSchematic } from './kicad/kicadSchematicParser';
import { parseKicadFootprintMod, parseKicadLegacyLib, parseKicadSymbolLib } from './kicad/kicadLibraryParser';
import { parseEagleLbr, parseEagleXml } from './eagle/eagleXmlParser';
import { parseProteusInput } from './proteus/proteusParser';
import { parseDxfToPcb } from './cam/dxfImporter';
import { parseExcellonToPcb, parseGerberToPcb } from './cam/gerberExcellonImporter';

export { parseKicadSchematic, parseKicadPcb, parseEagleXml, parseProteusInput, parseDxfToPcb, parseGerberToPcb, parseExcellonToPcb };

/** Parses multi-ECAD schematic formats (Altium, EasyEDA, LTspice, SPICE, P-CAD, EDIF, KiCad, Eagle). */
export function parseMultiEcadSchematic(input: string | Uint8Array, name = 'Imported_Schematic'): {
  project: SchematicProject;
  report: GostConversionReport;
} {
  if (input instanceof Uint8Array) {
    return parseAltiumOrPcadSchematic(input, name);
  }
  const t = input.trim();
  if (t.startsWith('{')) return parseEasyEdaSchematicJson(t, name);
  if (t.includes('(kicad_sch') || t.startsWith('EESchema Schematic File')) return parseKicadSchematic(t, name);
  if (t.includes('<eagle') || t.includes('<schematic')) {
    const res = parseEagleXml(t, false, name);
    if (res.schematic) return res.schematic;
  }
  if (t.includes('Version 4') && (t.includes('WIRE ') || t.includes('SYMBOL ') || t.includes('SHEET '))) {
    return parseLtspiceAsc(t, name);
  }
  if (t.includes('*PADS-') || t.includes('*PART*')) {
    return parsePadsAsciiSchematic(t, name);
  }
  if (t.includes('RECORD=') || t.includes('(edif') || t.includes('SCH_DESIGN') || t.includes('(compInst')) {
    return parseAltiumOrPcadSchematic(t, name);
  }
  return parseSpiceNetlist(t, name);
}

/** Parses multi-ECAD PCB formats (KiCad, Eagle, EasyEDA, Altium, P-CAD, PADS, DXF, Gerber, Excellon). */
export function parseMultiEcadPcb(input: string | Uint8Array, name = 'Imported_PCB'): {
  pcb: PcbProject;
  report: GostConversionReport;
} {
  if (input instanceof Uint8Array) {
    return parseAltiumOrPcadPcb(input, name);
  }
  const t = input.trim();
  if (t.startsWith('{')) return parseEasyEdaPcbJson(t, name);
  if (t.includes('(kicad_pcb') || t.startsWith('PCBNEW-BOARD')) return parseKicadPcb(t, name);
  if (t.includes('<eagle') || t.includes('<board')) {
    const res = parseEagleXml(t, true, name);
    if (res.pcb) return res.pcb;
  }
  if (t.includes('*PADS-') || t.includes('*PART*') || t.includes('*NET*')) return parsePadsAsciiPcb(t, name);
  if (t.includes('%FSLA') || t.includes('%FSTA') || t.includes('%ADD') || t.includes('G04 ')) return parseGerberToPcb(t, name);
  if (t.includes('M48') || /^T0?\d+C[\d.]+/m.test(t)) return parseExcellonToPcb(t, name);
  if (t.includes('ENTITIES') && (t.includes('AcDb') || t.includes('LWPOLYLINE') || t.includes('SECTION'))) {
    return parseDxfToPcb(t, name);
  }
  return parseAltiumOrPcadPcb(t, name);
}

/** Parses external component/footprint library formats into GOST ComponentDef / PatternDef sets. */
export function parseForeignLibrary(text: string, filename = 'library'): {
  components: ComponentDef[];
  patterns: PatternDef[];
  report: GostConversionReport;
} {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return parseEasyEdaLibraryJson(trimmed, filename, true);
  if (trimmed.startsWith('EESchema-LIBRARY')) return parseKicadLegacyLib(trimmed, filename, true);
  if (trimmed.includes('(kicad_symbol_lib')) return parseKicadSymbolLib(trimmed, filename, true);
  if (trimmed.includes('(footprint') || trimmed.includes('(module')) return parseKicadFootprintMod(trimmed, filename);
  return parseEagleLbr(trimmed, filename, true);
}
