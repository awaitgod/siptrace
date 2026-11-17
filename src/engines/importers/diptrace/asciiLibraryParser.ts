import { ComponentDef, PadDef, PatternDef } from '../../../core/types';
import { uid } from '../../../core/geometry';
import { findComponentById } from '../../../gost/libraries/gostComponents';
import { SExprList, parseSExpressions, sxFind, sxFindAll, sxNum, sxStr, sxWalk } from '../sexprParser';
import { convertImportedSchematicToGost, GostConversionReport } from '../gostConverter';
import { createImportedSchematicProject } from '../projectShells';

/** Imports DipTrace ASCII library (.eli/.lib/.asc components or patterns) and converts entries to GOST. */
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
