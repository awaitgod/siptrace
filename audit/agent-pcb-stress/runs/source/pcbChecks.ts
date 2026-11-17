import type { PcbProject, Point2D } from '../../../../core/models';
import { dist, pointInPolygon, pointToSegmentDist, segmentToSegmentDist } from '../../../../core/geometry';
import { getWorldPads, pointToPadDistance } from '../../../../engines/drc';

const epsilon = 1e-4;

export function boundaryIssue(points: Point2D[], board: Point2D[], clearance: number): boolean {
  if (board.length < 3 || points.length < 3) return true;
  return points.some((p, i) => {
    const q = points[(i + 1) % points.length];
    if (!pointInPolygon(p, board)) return true;
    return board.some((a, index) =>
      segmentToSegmentDist(p, q, a, board[(index + 1) % board.length]) < Math.max(epsilon, clearance - epsilon));
  });
}

export function validateTrace(pcb: PcbProject, trace: Omit<PcbProject['traces'][number], 'id'>) {
  const { netName, layer, points, width } = trace;
  if (!pcb.layers.some(item => item.id === layer && item.enabled)) throw new Error('Слой отключён.');
  if (!pcb.components.some(item => Object.values(item.padNets).includes(netName))) {
    throw new Error('Цепь отсутствует в списке площадок. Исправьте padNets или синхронизацию платы.');
  }
  if (points.some((point, i) => i > 0 && dist(point, points[i - 1]) < epsilon)) {
    throw new Error('Маршрут содержит нулевой сегмент. Уберите подряд идущие совпадающие точки.');
  }
  if (width < pcb.designRules.minTraceWidth || width > pcb.designRules.maxTraceWidth) {
    throw new Error('Ширина дорожки вне допустимого диапазона правил платы.');
  }
  const pads = getWorldPads(pcb).filter(pad => pad.effectiveLayer === 'All' || pad.effectiveLayer === layer);
  for (const end of [points[0], points[points.length - 1]]) {
    const touchingPads = pads.filter(pad => pointToPadDistance(end, pad) < epsilon);
    const foreign = touchingPads.find(pad => pad.netName !== netName);
    if (foreign) throw new Error(`Конец трассы попал на чужую площадку ${foreign.refDes}.${foreign.pad.number} (${foreign.netName || 'NC'}).`);
    const via = pcb.vias.some(item => {
      const order = ['TopCopper', 'Inner1', 'Inner2', 'BottomCopper'];
      const index = order.indexOf(layer);
      const span = [order.indexOf(item.startLayer), order.indexOf(item.endLayer)];
      return item.netName === netName && index >= Math.min(...span) && index <= Math.max(...span) &&
        dist(item, end) <= item.outerDiameter / 2;
    });
    const branch = pcb.traces.some(item => item.netName === netName && item.layer === layer &&
      item.points.some((p, i) => i > 0 && pointToSegmentDist(end, item.points[i - 1], p) <= item.width / 2));
    if (!touchingPads.length && !via && !branch) {
      throw new Error(`Конец трассы (${end.x}; ${end.y}) не касается площадки, via или дорожки цепи ${netName} на слое ${layer}.`);
    }
  }
}
