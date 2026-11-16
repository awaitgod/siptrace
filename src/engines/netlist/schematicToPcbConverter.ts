import { PcbPlacedComponent, PcbProject, SchematicProject } from '../../core/types';
import { uid } from '../../core/geometry';
import { createGostDesignRules } from '../../gost/gostRules';
import { loadSettings, loadUserPatterns } from '../../core/store';
import { findPatternById } from '../../gost/libraries/gostPatterns';
import { createDefaultPcbLayers } from './pcbLayerDefaults';
import { extractSchematicNetlist } from './netlistExtractor';

/** Converts or synchronizes a SchematicProject into a PcbProject preserving existing placements and routes. */
export function convertSchematicToPcb(sch: SchematicProject, existingPcb?: PcbProject): PcbProject {
  const netlist = extractSchematicNetlist(sch);
  const pinToNet = new Map<string, string>();
  for (const net of netlist) {
    for (const node of net.nodes) {
      pinToNet.set(`${node.refDes}:${node.padNumber}`, net.netName);
    }
  }

  // Group multi-part schematic components by refDes so multi-gate ICs become a single PCB package
  const schPartsByRef = new Map<string, SchematicProject['sheets'][0]['components'][0]>();
  for (const sheet of sch.sheets) {
    for (const comp of sheet.components) {
      if (!comp.refDes || comp.refDes.startsWith('#') || comp.doNotMount) continue;
      if (!schPartsByRef.has(comp.refDes)) {
        schPartsByRef.set(comp.refDes, comp);
      }
    }
  }

  const existingByRef = new Map<string, PcbPlacedComponent>();
  if (existingPcb) {
    for (const c of existingPcb.components) existingByRef.set(c.refDes, c);
  }

  const pcbComponents: PcbPlacedComponent[] = [];
  let gridIdx = 0;

  const userPats = loadUserPatterns();
  const mergedCustomPats = { ...Object.fromEntries(userPats.map((p) => [p.id, p])), ...(sch.customPatternDefs ?? {}) };

  for (const [refDes, schComp] of schPartsByRef) {
    const pattern = findPatternById(schComp.patternId, mergedCustomPats);
    if (!pattern) continue;

    const prev = existingByRef.get(refDes);
    const padNets: Record<string, string> = {};
    for (const pad of pattern.pads) {
      const net = pinToNet.get(`${refDes}:${pad.number}`);
      if (net) padNets[pad.number] = net;
    }

    const col = gridIdx % 6;
    const row = Math.floor(gridIdx / 6);
    const defaultX = Math.max(16, Math.ceil(pattern.courtyard.width / 2) + 8) + col * 16;
    const defaultY = Math.max(16, Math.ceil(pattern.courtyard.height / 2) + 8) + row * 15;
    gridIdx++;

    pcbComponents.push({
      id: prev?.id ?? uid('pcbcomp'),
      refDes,
      value: schComp.value,
      typeName: schComp.typeName,
      patternId: pattern.id,
      side: prev?.side ?? 'Top',
      x: prev?.x ?? defaultX,
      y: prev?.y ?? defaultY,
      angle: prev?.angle ?? 0,
      locked: prev?.locked ?? false,
      showRefDes: true,
      showValue: false,
      refDesOffset: prev?.refDesOffset ?? { x: 0, y: -pattern.courtyard.height / 2 - 1.5 },
      pads: structuredClone(pattern.pads),
      padNets,
      graphics: structuredClone(pattern.graphics),
      courtyard: { ...pattern.courtyard },
      model3d: { ...pattern.model3d }
    });
  }

  const cols = Math.min(6, Math.max(1, pcbComponents.length));
  const rows = Math.max(1, Math.ceil(pcbComponents.length / 6));
  const autoW = Math.max(100, 12 + cols * 15 + 10);
  const autoH = Math.max(70, 12 + rows * 14 + 10);
  const defaultOutline = [
    { x: 0, y: 0 },
    { x: autoW, y: 0 },
    { x: autoW, y: autoH },
    { x: 0, y: autoH }
  ];

  const diffPairs = [];
  for (const sheet of sch.sheets) {
    for (const dp of sheet.diffPairs) {
      diffPairs.push({
        id: dp.id,
        name: dp.pairName,
        posNet: dp.posNet,
        negNet: dp.negNet,
        targetWidth: 0.25,
        targetGap: 0.2,
        maxMismatch: 0.25
      });
    }
  }

  return {
    version: '1.0',
    filePath: existingPcb?.filePath ?? sch.filePath.replace(/\.gostsch$/i, '.gostpcb'),
    linkedSchematicPath: sch.filePath,
    projectName: sch.projectName,
    units: sch.units,
    gridSize: existingPcb?.gridSize ?? 1.25,
    boardThickness: existingPcb?.boardThickness ?? 1.6,
    soldermaskColor: existingPcb?.soldermaskColor ?? '#0d5e2e',
    silkscreenColor: existingPcb?.silkscreenColor ?? '#ffffff',
    surfaceFinish: existingPcb?.surfaceFinish ?? 'ENIG',
    layerCount: existingPcb?.layerCount ?? 2,
    origin: existingPcb?.origin ?? { x: 0, y: 0 },
    boardOutline: existingPcb?.boardOutline ?? defaultOutline,
    cutouts: existingPcb?.cutouts ?? [],
    keepouts: existingPcb?.keepouts ?? [],
    layers: existingPcb?.layers ?? createDefaultPcbLayers(existingPcb?.layerCount ?? 2),
    components: pcbComponents,
    traces: existingPcb?.traces ?? [],
    vias: existingPcb?.vias ?? [],
    copperPours: existingPcb?.copperPours ?? [],
    shapes: existingPcb?.shapes ?? [],
    netClasses: sch.netClasses,
    netClassAssignments: { ...sch.netClassAssignments },
    diffPairs: existingPcb?.diffPairs?.length ? existingPcb.diffPairs : diffPairs,
    designRules: existingPcb?.designRules ?? createGostDesignRules(loadSettings().defaultAccuracyClass),
    teardropsEnabled: existingPcb?.teardropsEnabled ?? false
  };
}
