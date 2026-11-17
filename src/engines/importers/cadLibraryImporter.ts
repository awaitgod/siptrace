import { ComponentDef, PatternDef } from '../../core/types';
import { extractZipEntries, isZipBuffer, utf8Decode } from '../../core/utils/zipArchive';
import { detectDipTraceBinaryFormat, parseDipTraceBinaryEli, parseDipTraceBinaryLib } from './dipTraceBinaryParser';
import { parseDipTraceAsciiLibrary } from './diptrace/asciiLibraryParser';
import { parseDipTraceXmlLibrary } from './diptrace/xmlLibraryParser';
import { GostConversionReport } from './gostConverter';
import { parseKicadFootprintMod, parseKicadLegacyLib, parseKicadSymbolLib, parseKicadSymbolList } from './kicad/kicadLibraryParser';
import { parseEagleLbr } from './eagle/eagleXmlParser';
import { parseEasyEdaLibraryJson } from './ecad/easyEdaParser';

export { parseKicadSymbolList };

export interface CadLibraryImportOptions {
  libraryName?: string;
  adaptToGost?: boolean;
}

export interface CadLibraryImportResult {
  libraryName: string;
  categories: string[];
  components: ComponentDef[];
  patterns: PatternDef[];
  report: GostConversionReport;
  detectedFormat: string;
}

function crossLinkPatterns(components: ComponentDef[], patterns: PatternDef[]): void {
  if (patterns.length === 0) return;
  for (const comp of components) {
    const key = (comp.patternId || '').toLowerCase();
    const match =
      patterns.find((p) => p.id === comp.patternId || p.name.toLowerCase() === key) ??
      patterns.find((p) => key && (p.name.toLowerCase().includes(key) || key.includes(p.name.toLowerCase()))) ??
      (patterns.length === 1 ? patterns[0] : undefined);
    if (match) comp.patternId = match.id;
  }
}

/**
 * Universal library importer supporting:
 *  - ZIP bundles combining symbols & footprints (.kicad_sym + .kicad_mod, .eli + .lib, .lbr)
 *  - Native DipTrace Binary (.eli, .lib), ASCII (.eli/.lib/.asc), XML (.elixml/.libxml)
 *  - KiCad Symbols (.kicad_sym), KiCad Footprints (.kicad_mod), KiCad Legacy (.lib)
 *  - Autodesk Eagle (.lbr), EasyEDA JSON (.json), GOST-Trace (.gostlib)
 */
export async function importExternalCadLibrary(
  input: string | Uint8Array,
  filename = 'external_lib',
  options: CadLibraryImportOptions = {}
): Promise<CadLibraryImportResult> {
  const adaptToGost = options.adaptToGost ?? true;
  const fallbackLibName = options.libraryName || filename.replace(/\.[^/.]+$/, '') || 'Импорт';
  const ext = filename.toLowerCase();

  if (input instanceof Uint8Array) {
    if (isZipBuffer(input)) {
      const entries = await extractZipEntries(input);
      const components: ComponentDef[] = [];
      const patterns: PatternDef[] = [];
      const items: GostConversionReport['items'] = [];
      const categories = new Set<string>();

      for (const [entryName, entryBytes] of Object.entries(entries)) {
        if (entryName.endsWith('/') || entryBytes.length === 0) continue;
        if (!/\.(kicad_sym|kicad_mod|eli|lib|elixml|libxml|lbr|gostlib|json)$/i.test(entryName)) continue;
        try {
          const sub = await importExternalCadLibrary(entryBytes, entryName, { libraryName: fallbackLibName, adaptToGost });
          components.push(...sub.components);
          patterns.push(...sub.patterns);
          items.push(...sub.report.items);
          for (const cat of sub.categories) categories.add(cat);
        } catch {
          // Skip unparseable auxiliary files inside bundle
        }
      }
      if (components.length === 0 && patterns.length === 0) {
        throw new Error(`Внутри ZIP-архива ${filename} не найдено распознаваемых библиотек CAD.`);
      }
      const hasExplicitPatterns = patterns.some((p) => !p.description.startsWith('Auto-generated pattern'));
      const finalPatterns = hasExplicitPatterns
        ? patterns.filter((p) => !p.description.startsWith('Auto-generated pattern'))
        : patterns;
      crossLinkPatterns(components, finalPatterns);
      return {
        libraryName: fallbackLibName,
        categories: Array.from(categories),
        components,
        patterns: finalPatterns,
        detectedFormat: 'ZIP-архив библиотек CAD',
        report: {
          sourceFormat: 'ZIP-архив библиотек CAD',
          convertedComponents: components.length,
          convertedSymbolsToUgo: components.length,
          convertedPatterns: finalPatterns.length,
          items
        }
      };
    }

    const dtKind = detectDipTraceBinaryFormat(input);
    if (dtKind?.family === 'component') {
      const res = parseDipTraceBinaryEli(input);
      return {
        libraryName: fallbackLibName,
        categories: ['DipTrace Binary (.eli)'],
        components: res.components.map((c) => ({ ...c, library: fallbackLibName })),
        patterns: [],
        report: res.report,
        detectedFormat: 'DipTrace Binary Component Library (.eli)'
      };
    }
    if (dtKind?.family === 'pattern') {
      const res = parseDipTraceBinaryLib(input);
      return {
        libraryName: fallbackLibName,
        categories: ['DipTrace Binary (.lib)'],
        components: [],
        patterns: res.patterns.map((p) => ({ ...p, library: fallbackLibName })),
        report: res.report,
        detectedFormat: 'DipTrace Binary Pattern Library (.lib)'
      };
    }
  }

  const text = input instanceof Uint8Array ? utf8Decode(input) : input;
  const trimmed = text.trim();

  // 1. JSON (.gostlib or EasyEDA JSON)
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { components?: ComponentDef[]; patterns?: PatternDef[]; name?: string };
      if (Array.isArray(parsed.components) || Array.isArray(parsed.patterns)) {
        const libName = options.libraryName || parsed.name || fallbackLibName;
        return {
          libraryName: libName,
          categories: ['ГОСТ-Трейс (.gostlib)'],
          components: (parsed.components ?? []).map((c) => ({ ...c, library: libName })),
          patterns: (parsed.patterns ?? []).map((p) => ({ ...p, library: libName })),
          detectedFormat: 'Библиотека ГОСТ-Трейс (.gostlib)',
          report: {
            sourceFormat: 'Библиотека ГОСТ-Трейс (.gostlib)',
            convertedComponents: parsed.components?.length ?? 0,
            convertedSymbolsToUgo: parsed.components?.length ?? 0,
            convertedPatterns: parsed.patterns?.length ?? 0,
            items: []
          }
        };
      }
      const ee = parseEasyEdaLibraryJson(trimmed, fallbackLibName, adaptToGost);
      return {
        libraryName: fallbackLibName,
        categories: ['EasyEDA JSON'],
        ...ee,
        detectedFormat: 'EasyEDA Component Library (.json)'
      };
    } catch {
      // fall through
    }
  }

  // 2. KiCad Legacy (.lib EESchema-LIBRARY checked before DipTrace .lib)
  if (trimmed.startsWith('EESchema-LIBRARY')) {
    return parseKicadLegacyLib(trimmed, fallbackLibName, adaptToGost);
  }

  // 3. DipTrace XML (.elixml / .libxml)
  if (ext.endsWith('.elixml') || ext.endsWith('.libxml') || trimmed.includes('<Library Type="DipTrace')) {
    const res = parseDipTraceXmlLibrary(trimmed);
    return {
      libraryName: fallbackLibName,
      categories: ['DipTrace XML (.elixml/.libxml)'],
      components: res.components.map((c) => ({ ...c, library: fallbackLibName })),
      patterns: res.patterns.map((p) => ({ ...p, library: fallbackLibName })),
      report: res.report,
      detectedFormat: 'DipTrace XML Library (.elixml/.libxml)'
    };
  }

  // 4. DipTrace ASCII (.eli / .lib / .asc library)
  if (
    ((ext.endsWith('.eli') || ext.endsWith('.lib') || trimmed.includes('DipTrace-ElementLibrary') || trimmed.includes('DipTrace-PatternLibrary') || trimmed.includes('(Library') || trimmed.includes('(Pattern '))
      && !trimmed.includes('(kicad_'))
  ) {
    const res = parseDipTraceAsciiLibrary(trimmed);
    return {
      libraryName: fallbackLibName,
      categories: ['DipTrace ASCII'],
      components: res.components.map((c) => ({ ...c, library: fallbackLibName })),
      patterns: res.patterns.map((p) => ({ ...p, library: fallbackLibName })),
      report: res.report,
      detectedFormat: 'DipTrace ASCII Library (.eli/.lib)'
    };
  }

  // 5. KiCad Modern (.kicad_sym / .kicad_mod)
  if (trimmed.includes('(kicad_symbol_lib') || ext.endsWith('.kicad_sym')) {
    return parseKicadSymbolLib(trimmed, fallbackLibName, adaptToGost);
  }
  if (trimmed.includes('(footprint') || trimmed.includes('(module') || ext.endsWith('.kicad_mod')) {
    return parseKicadFootprintMod(trimmed, fallbackLibName);
  }

  // 6. Eagle (.lbr)
  if (ext.endsWith('.lbr') || trimmed.includes('<eagle') || trimmed.includes('<library')) {
    return parseEagleLbr(trimmed, fallbackLibName, adaptToGost);
  }

  throw new Error(`Не удалось распознать формат библиотеки CAD: ${filename}`);
}
