import { PcbLayerId, PcbVia } from '../../core/types';

/** Determines whether a through/blind/buried via exists on the given CAM layer (copper or soldermask). */
export function isViaOnCamLayer(v: PcbVia, layer: PcbLayerId, layerCount: number): boolean {
  const copperLayers: PcbLayerId[] =
    layerCount === 4
      ? ['TopCopper', 'Inner1', 'Inner2', 'BottomCopper']
      : ['TopCopper', 'BottomCopper'];

  const start = v.startLayer ? copperLayers.indexOf(v.startLayer) : 0;
  const end = v.endLayer ? copperLayers.indexOf(v.endLayer) : copperLayers.length - 1;
  const minSpan = Math.min(start === -1 ? 0 : start, end === -1 ? copperLayers.length - 1 : end);
  const maxSpan = Math.max(start === -1 ? 0 : start, end === -1 ? copperLayers.length - 1 : end);

  if (layer === 'TopMask') {
    return minSpan === 0;
  }
  if (layer === 'BottomMask') {
    return maxSpan === copperLayers.length - 1;
  }
  const lIdx = copperLayers.indexOf(layer);
  if (lIdx === -1) return false;
  return lIdx >= minSpan && lIdx <= maxSpan;
}
