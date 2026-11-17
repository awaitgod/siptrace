import { PcbProject, Point2D } from '../core/types';
import { createZipArchive, extractZipEntries, isZipBuffer, utf8Decode } from '../core/utils/zipArchive';
import {
  exportExcellonDrill,
  exportGerberSet,
  ParsedGerberEntity,
  parseGerberPreview
} from './camExport';

import { parseExcellonPreview, ParsedDrillHole } from './importers/cam/gerberExcellonImporter';
export { parseExcellonPreview, type ParsedDrillHole };

export interface GerberLayerInspect {
  key: string;
  label: string;
  filename: string;
  color: string;
  entities: ParsedGerberEntity[];
  drills: ParsedDrillHole[];
}

export interface GerberInspectionSummary {
  layers: GerberLayerInspect[];
  widthMm: number;
  heightMm: number;
  drillCount: number;
  uniqueDrillSizes: number[];
}

function findGerberEntry(files: Record<string, string>, extRegex: RegExp): { name: string; content: string } | null {
  for (const [fn, content] of Object.entries(files)) {
    if (extRegex.test(fn)) return { name: fn, content };
  }
  return null;
}

export function getGerberExportEntries(pcb: PcbProject, x2Attributes = true, includeDrills = true): Record<string, string> {
  const { files } = exportGerberSet(pcb, x2Attributes);
  return Object.fromEntries(Object.entries(files).filter(([name]) => (
    /\.(GTL|GBL|G2L|G3L|GTS|GBS|GTO|GBO|GTP|GBP|GKO)$/i.test(name) || (includeDrills && /\.drl$/i.test(name))
  )));
}

/** Packages the selected Gerber RS-274X/X2 and Excellon files into one ZIP archive. */
export function exportGerberZipBytes(pcb: PcbProject, x2Attributes = true, includeDrills = true): Uint8Array {
  return createZipArchive(getGerberExportEntries(pcb, x2Attributes, includeDrills));
}

// parseExcellonPreview is imported and re-exported from ./importers/cam/gerberExcellonImporter

/** Inspects either the current PcbProject's generated Gerber+Excellon set or an external ZIP/Gerber/Drill file. */
export async function inspectGerberProjectOrBytes(
  pcb: PcbProject,
  x2Attributes = true,
  externalBytes?: Uint8Array,
  externalFilename?: string
): Promise<GerberInspectionSummary> {
  const layers: GerberLayerInspect[] = [];

  if (externalBytes) {
    if (isZipBuffer(externalBytes)) {
      const zipEntries = await extractZipEntries(externalBytes);
      for (const [fn, bytes] of Object.entries(zipEntries)) {
        const txt = utf8Decode(bytes);
        const low = fn.toLowerCase();
        if (/\.(drl|xln)$/.test(low) || txt.includes('M48')) {
          layers.push({ key: fn, label: fn, filename: fn, color: '#38bdf8', entities: [], drills: parseExcellonPreview(txt) });
        } else if (/\.(gbr|gtl|gbl|gts|gbs|gto|gbo|gtp|gbp|gko|gm1|g2l|g3l)$/i.test(low)) {
          const color = /gbl|b_cu|bot/.test(low)
            ? '#3b82f6'
            : /gtl|f_cu|top/.test(low)
              ? '#ef4444'
              : /gko|edge|gm1|out/.test(low)
                ? '#eab308'
                : /gto|silk/.test(low)
                  ? '#f8fafc'
                  : '#22c55e';
          layers.push({ key: fn, label: fn, filename: fn, color, entities: parseGerberPreview(txt), drills: [] });
        }
      }
    } else {
      const txt = utf8Decode(externalBytes);
      const isDrl = /\.(drl|xln)$/i.test(externalFilename || '') || txt.includes('M48');
      layers.push(
        isDrl
          ? { key: 'drill', label: externalFilename || 'Drills.drl', filename: externalFilename || 'Drills.drl', color: '#38bdf8', entities: [], drills: parseExcellonPreview(txt) }
          : { key: 'ext', label: externalFilename || 'Layer.gbr', filename: externalFilename || 'Layer.gbr', color: '#ef4444', entities: parseGerberPreview(txt), drills: [] }
      );
    }
  } else {
    const { files } = exportGerberSet(pcb, x2Attributes);
    const drl = findGerberEntry(files, /\.drl$/i)?.content ?? exportExcellonDrill(pcb);
    const layerDefs: { key: string; regex: RegExp; label: string; color: string }[] = [
      { key: 'boardOutline', regex: /\.GKO$/i, label: 'Контур платы (.gko)', color: '#eab308' },
      { key: 'bottomCopper', regex: /\.GBL$/i, label: 'Медь низ (.gbl)', color: '#3b82f6' },
      { key: 'topCopper', regex: /\.GTL$/i, label: 'Медь верх (.gtl)', color: '#ef4444' },
      { key: 'inner1', regex: /\.G2L$/i, label: 'Медь внутренний 1 (.g2l)', color: '#f97316' },
      { key: 'inner2', regex: /\.G3L$/i, label: 'Медь внутренний 2 (.g3l)', color: '#a78bfa' },
      { key: 'topMask', regex: /\.GTS$/i, label: 'Маска верх (.gts)', color: '#22c55e' },
      { key: 'bottomMask', regex: /\.GBS$/i, label: 'Маска низ (.gbs)', color: '#a855f7' },
      { key: 'topSilk', regex: /\.GTO$/i, label: 'Шелкография верх (.gto)', color: '#f8fafc' },
      { key: 'bottomSilk', regex: /\.GBO$/i, label: 'Шелкография низ (.gbo)', color: '#cbd5e1' },
      { key: 'topPaste', regex: /\.GTP$/i, label: 'Паста верх (.gtp)', color: '#f472b6' },
      { key: 'bottomPaste', regex: /\.GBP$/i, label: 'Паста низ (.gbp)', color: '#67e8f9' }
    ];
    for (const def of layerDefs) {
      const found = findGerberEntry(files, def.regex);
      if (found) {
        layers.push({
          key: def.key,
          label: def.label,
          filename: found.name,
          color: def.color,
          entities: parseGerberPreview(found.content),
          drills: []
        });
      }
    }
    layers.push({ key: 'drill', label: 'Сверловка (.drl)', filename: 'Drills.drl', color: '#38bdf8', entities: [], drills: parseExcellonPreview(drl) });
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const uniqueSizes = new Set<number>();
  let drillCount = 0;

  const pushPt = (p: Point2D) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  for (const l of layers) {
    for (const e of l.entities) e.pts.forEach(pushPt);
    for (const d of l.drills) {
      pushPt(d);
      drillCount++;
      uniqueSizes.add(Math.round(d.diameter * 100) / 100);
    }
  }

  return {
    layers,
    widthMm: Number.isFinite(minX) ? Math.max(0, Math.round((maxX - minX) * 10) / 10) : 0,
    heightMm: Number.isFinite(minY) ? Math.max(0, Math.round((maxY - minY) * 10) / 10) : 0,
    drillCount,
    uniqueDrillSizes: Array.from(uniqueSizes).sort((a, b) => a - b)
  };
}
