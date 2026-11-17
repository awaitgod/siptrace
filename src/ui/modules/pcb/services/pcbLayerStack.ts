import { PcbLayerId, PcbProject } from '../../../../core/types';
import { createDefaultPcbLayers } from '../../../../engines/netlist';

export function isInnerCopperLayer(layer: PcbLayerId | 'AllCopper'): boolean {
  return layer === 'Inner1' || layer === 'Inner2';
}

export function hasInternalLayerObjects(pcb: PcbProject): boolean {
  return [pcb.traces, pcb.copperPours, pcb.shapes, pcb.keepouts].some((objects) =>
    objects.some((object) => isInnerCopperLayer(object.layer))
  ) || pcb.vias.some((via) => isInnerCopperLayer(via.startLayer) || isInnerCopperLayer(via.endLayer));
}

export function changePcbLayerStack(pcb: PcbProject, layerCount: PcbProject['layerCount']): PcbProject {
  if (pcb.layerCount === layerCount || (layerCount === 2 && hasInternalLayerObjects(pcb))) return pcb;
  const existing = new Map(pcb.layers.map((layer) => [layer.id, layer]));
  return {
    ...pcb,
    layerCount,
    layers: createDefaultPcbLayers(layerCount).map((layer) => existing.get(layer.id) ?? layer)
  };
}

export const INTERNAL_LAYER_OBJECTS_MESSAGE = 'Перенесите или удалите объекты внутренних слоёв перед переходом на два слоя.';
