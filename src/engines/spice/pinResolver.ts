import { ComponentDef, PlacedComponent, SchematicProject } from '../../core/types';
import { resolveComponentDef } from '../erc';
import { extractSchematicNetlist } from '../netlist/netlistExtractor';

export interface SchematicSpiceConnectivity {
  pinToNet: Map<string, string>;
  compPinsMap: Map<string, Map<string, string>>;
  nonGroundNets: string[];
  resolveComponentPinNet: (
    comp: PlacedComponent,
    semanticAliases: string[],
    fallbackPads: string[]
  ) => string | undefined;
}

const CYRILLIC_MAP: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'E', Ж: 'Zh', З: 'Z',
  И: 'I', Й: 'Y', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R',
  С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'Kh', Ц: 'Ts', Ч: 'Ch', Ш: 'Sh', Щ: 'Shch',
  Ъ: '', Ы: 'Y', Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
};

/** Transliterates Cyrillic and sanitizes a name into a valid SPICE identifier. */
export function transliterateToSpiceIdentifier(raw: string, fallback = 'SUBCKT'): string {
  const translit = Array.from(raw, (ch) => CYRILLIC_MAP[ch] ?? ch).join('');
  const clean = translit.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return clean || fallback;
}

function tokenizePinName(name: string): string[] {
  return name
    .toUpperCase()
    .split(/[\s()[\]{}/,.:;+\-_]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function findMatchingPadKey(
  def: ComponentDef | undefined,
  partIndex: number,
  semanticAliases: string[]
): string | undefined {
  if (!def) return undefined;
  const part = def.parts.find((pt) => pt.partIndex === partIndex) ?? def.parts[0];
  if (!part) return undefined;
  const upperAliases = semanticAliases.map((a) => a.toUpperCase());

  // 1. Exact pin name match
  for (const alias of upperAliases) {
    const byExactName = part.pins.find((p) => p.name.trim().toUpperCase() === alias);
    if (byExactName) return String(byExactName.padMapping || byExactName.number);
  }
  // 2. Tokenized pin name match (handles e.g. 'З (G)', 'И (S)', 'С (D)')
  for (const alias of upperAliases) {
    const byToken = part.pins.find((p) => tokenizePinName(p.name).includes(alias));
    if (byToken) return String(byToken.padMapping || byToken.number);
  }
  return undefined;
}

/** Builds pin-to-net connectivity with semantic GOST/Latin pin-name resolution. */
export function buildSchematicSpiceConnectivity(
  sch: SchematicProject,
  groundName = 'GND'
): SchematicSpiceConnectivity {
  const netlist = extractSchematicNetlist(sch);
  const pinToNet = new Map<string, string>();
  const compPinsMap = new Map<string, Map<string, string>>();
  const nonGroundSet = new Set<string>();

  for (const n of netlist) {
    const isGnd =
      n.netName === 'GND' ||
      n.netName === '0' ||
      n.netName === 'VSS' ||
      n.netName === 'AGND' ||
      n.netName === 'DGND';
    const cleanNet = isGnd ? groundName : n.netName;
    for (const nd of n.nodes) {
      const padKey = String(nd.padNumber);
      pinToNet.set(`${nd.refDes}:${padKey}`, cleanNet);
      if (!compPinsMap.has(nd.refDes)) compPinsMap.set(nd.refDes, new Map());
      compPinsMap.get(nd.refDes)!.set(padKey, cleanNet);
    }
    if (!isGnd) nonGroundSet.add(n.netName);
  }

  const defCache = new Map<string, ComponentDef | undefined>();
  const getDef = (defId: string) => {
    if (!defCache.has(defId)) {
      defCache.set(defId, resolveComponentDef(defId, sch.customComponentDefs));
    }
    return defCache.get(defId);
  };

  const resolveComponentPinNet = (
    comp: PlacedComponent,
    semanticAliases: string[],
    fallbackPads: string[]
  ): string | undefined => {
    const def = getDef(comp.componentDefId);
    const semanticPad = findMatchingPadKey(def, comp.partIndex, semanticAliases);
    if (semanticPad) {
      const net = pinToNet.get(`${comp.refDes}:${semanticPad}`);
      if (net !== undefined) return net;
    }

    const map = compPinsMap.get(comp.refDes);
    for (const key of [...semanticAliases, ...fallbackPads]) {
      const direct = pinToNet.get(`${comp.refDes}:${key}`);
      if (direct !== undefined) return direct;
      if (map) {
        const mapped = map.get(key);
        if (mapped !== undefined) return mapped;
      }
    }

    if (map && fallbackPads.length > 0) {
      const vals = Array.from(map.values());
      const idx = parseInt(fallbackPads[0], 10);
      if (Number.isFinite(idx) && idx >= 1 && idx <= vals.length) {
        return vals[idx - 1];
      }
    }
    return undefined;
  };

  return {
    pinToNet,
    compPinsMap,
    nonGroundNets: Array.from(nonGroundSet),
    resolveComponentPinNet
  };
}
