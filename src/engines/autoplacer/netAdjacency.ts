import { PcbPlacedComponent } from '../../core/types';

/** Maps non-power signal nets to indices of connected PCB components. */
export function buildNetAdjacency(components: PcbPlacedComponent[]): Map<string, number[]> {
  const netToComps = new Map<string, number[]>();
  components.forEach((comp, idx) => {
    for (const net of Object.values(comp.padNets)) {
      if (!net || net === 'GND' || net === '+5V' || net === '+3V3') continue;
      if (!netToComps.has(net)) netToComps.set(net, []);
      const arr = netToComps.get(net)!;
      if (!arr.includes(idx)) arr.push(idx);
    }
  });
  return netToComps;
}
