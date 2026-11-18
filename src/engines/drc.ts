import { DrcError, PadDef, PcbProject, PcbVia, Point2D } from '../core/types';
import { dist, pointInPolygon, pointToSegmentDist, pointToSegmentNearest, polygonBounds, segmentToSegmentDist, segmentsIntersect, transformPoint } from '../core/geometry';

import { COPPER_EPSILON, fitsBoardMaterial } from './pcbMaterial';
import { copperEdges, copperRegionDistance, inCopperRegion, segmentToCopper, type CopperRegion } from './copperPour/region';

export interface WorldPad {
  compId: string;
  refDes: string;
  pad: PadDef;
  x: number;
  y: number;
  padAngleDeg: number;
  netName: string;
  effectiveLayer: 'TopCopper' | 'BottomCopper' | 'All';
  radius: number; // bounding radius for clearance check
}

export function getWorldPads(pcb: PcbProject): WorldPad[] {
  const result: WorldPad[] = [];
  for (const comp of pcb.components) {
    const mirror = comp.side === 'Bottom';
    for (const pad of comp.pads) {
      const pt = transformPoint(pad.x, pad.y, comp.x, comp.y, comp.angle, mirror, false);
      const effectiveLayer =
        pad.type === 'THT' || pad.type === 'MountingHole'
          ? 'All'
          : comp.side === 'Top'
            ? 'TopCopper'
            : 'BottomCopper';
      const padAngleDeg = (mirror ? -comp.angle : comp.angle) + (pad.angle ?? 0);
      const polyMaxR = pad.shape === 'Polygon' && pad.polygonPoints?.length
        ? Math.max(...pad.polygonPoints.map((pt2) => Math.hypot(pt2.x, pt2.y)))
        : 0;
      const rx = pad.width * 0.5;
      const ry = pad.height * 0.5;
      const radius =
        pad.shape === 'Polygon' && pad.polygonPoints?.length
          ? polyMaxR
          : pad.shape === 'Round'
            ? Math.max(rx, ry)
            : Math.hypot(rx, ry);
      result.push({
        compId: comp.id,
        refDes: comp.refDes,
        pad,
        x: pt.x,
        y: pt.y,
        padAngleDeg,
        netName: comp.padNets[pad.number] ?? '',
        effectiveLayer,
        radius
      });
    }
  }
  return result;
}

const copperLayerOrder = ['TopCopper', 'Inner1', 'Inner2', 'BottomCopper'] as const;

type LayerSpan = [number, number];

function viaLayerSpan(via: PcbVia): LayerSpan {
  if (!via.startLayer || !via.endLayer) {
    return [0, copperLayerOrder.length - 1];
  }
  const a = copperLayerOrder.indexOf(via.startLayer);
  const b = copperLayerOrder.indexOf(via.endLayer);
  if (a === -1 || b === -1) return [0, copperLayerOrder.length - 1];
  return [Math.min(a, b), Math.max(a, b)];
}

function layerToSpan(layer: string): LayerSpan {
  if (layer === 'All' || layer === 'AllCopper') return [0, copperLayerOrder.length - 1];
  const idx = copperLayerOrder.indexOf(layer as (typeof copperLayerOrder)[number]);
  return idx >= 0 ? [idx, idx] : [0, copperLayerOrder.length - 1];
}

function spansOverlap(a: LayerSpan, b: LayerSpan): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

// Distance from a point to the pad's rendered copper outline.
export function pointToPadDistance(point: Point2D, wp: WorldPad): number {
  const angle = -wp.padAngleDeg * Math.PI / 180;
  const dx = point.x - wp.x, dy = point.y - wp.y;
  const lx = dx * Math.cos(angle) - dy * Math.sin(angle);
  const ly = dx * Math.sin(angle) + dy * Math.cos(angle);
  if (wp.pad.shape === 'Polygon' && wp.pad.polygonPoints && wp.pad.polygonPoints.length >= 3) {
    const pts = wp.pad.polygonPoints;
    if (pointInPolygon({ x: lx, y: ly }, pts)) return 0;
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
      best = Math.min(best, pointToSegmentDist({ x: lx, y: ly }, pts[i], pts[(i + 1) % pts.length]));
    }
    return best;
  }
  const x = Math.abs(lx);
  const y = Math.abs(ly);
  const rx = Math.max(0, wp.pad.width / 2), ry = Math.max(0, wp.pad.height / 2);
  if (wp.pad.shape === 'Round') return Math.max(0, Math.hypot(x, y) - rx);
  if (wp.pad.shape === 'Oval' && rx > 0 && ry > 0) {
    if ((x / rx) ** 2 + (y / ry) ** 2 <= 1) return 0;
    // The closest point on an ellipse is determined by a single monotonic
    // Lagrange multiplier; bisection is stable even on its axes.
    const f = (t: number) => (rx * x / (t + rx * rx)) ** 2 + (ry * y / (t + ry * ry)) ** 2;
    let lo = 0, hi = Math.max(rx * x, ry * y, 1);
    while (f(hi) > 1) hi *= 2;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 1) lo = mid; else hi = mid;
    }
    return Math.hypot(x - rx * rx * x / (hi + rx * rx), y - ry * ry * y / (hi + ry * ry));
  }
  if (wp.pad.shape === 'RoundedRect') {
    const cr = Math.min(rx, ry, Math.max(0, wp.pad.cornerRadius ?? Math.min(rx, ry) * 0.25));
    const ix = Math.max(0, rx - cr), iy = Math.max(0, ry - cr);
    return Math.max(0, Math.hypot(Math.max(0, x - ix), Math.max(0, y - iy)) - cr);
  }
  return Math.hypot(Math.max(0, x - rx), Math.max(0, y - ry));
}

function padToWorldPolygon(wp: WorldPad, segs = 16): Point2D[] {
  const rad = (wp.padAngleDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const toWorld = (lx: number, ly: number): Point2D => ({
    x: wp.x + lx * cos - ly * sin,
    y: wp.y + lx * sin + ly * cos
  });
  if (wp.pad.shape === 'Polygon' && wp.pad.polygonPoints && wp.pad.polygonPoints.length >= 3) {
    return wp.pad.polygonPoints.map((p) => toWorld(p.x, p.y));
  }
  const rx = Math.max(0, wp.pad.width / 2), ry = Math.max(0, wp.pad.height / 2);
  if (wp.pad.shape === 'Round' || wp.pad.shape === 'Oval') {
    const pts: Point2D[] = [];
    for (let i = 0; i < segs; i++) {
      const a = (2 * Math.PI * i) / segs;
      pts.push(toWorld(rx * Math.cos(a), ry * Math.sin(a)));
    }
    return pts;
  }
  if (wp.pad.shape === 'RoundedRect') {
    const cr = Math.min(rx, ry, Math.max(0, wp.pad.cornerRadius ?? Math.min(rx, ry) * 0.25));
    if (cr > 1e-4) {
      const pts: Point2D[] = [];
      const arcSteps = 4;
      const corners = [
        { cx: rx - cr, cy: ry - cr, start: 0 },
        { cx: -(rx - cr), cy: ry - cr, start: Math.PI / 2 },
        { cx: -(rx - cr), cy: -(ry - cr), start: Math.PI },
        { cx: rx - cr, cy: -(ry - cr), start: (3 * Math.PI) / 2 }
      ];
      for (const c of corners) {
        for (let k = 0; k <= arcSteps; k++) {
          const a = c.start + (Math.PI / 2) * (k / arcSteps);
          pts.push(toWorld(c.cx + cr * Math.cos(a), c.cy + cr * Math.sin(a)));
        }
      }
      return pts;
    }
  }
  return [toWorld(-rx, -ry), toWorld(rx, -ry), toWorld(rx, ry), toWorld(-rx, ry)];
}

function segmentToPadDistance(a: Point2D, b: Point2D, wp: WorldPad): number {
  if (wp.pad.shape === 'Round') {
    return Math.max(0, pointToSegmentDist(wp, a, b) - wp.pad.width * 0.5);
  }
  if (wp.pad.shape === 'Polygon' && wp.pad.polygonPoints && wp.pad.polygonPoints.length >= 3) {
    const angle = -wp.padAngleDeg * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const toLocal = (p: Point2D): Point2D => {
      const dx = p.x - wp.x, dy = p.y - wp.y;
      return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
    };
    const la = toLocal(a), lb = toLocal(b), pts = wp.pad.polygonPoints;
    if (pointInPolygon(la, pts) || pointInPolygon(lb, pts)) return 0;
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
      if (segmentsIntersect(la, lb, p1, p2)) return 0;
      best = Math.min(best, segmentToSegmentDist(la, lb, p1, p2));
    }
    return best;
  }
  // Golden-section search on convex distance function along segment [a, b]
  const evalAt = (t: number) => pointToPadDistance({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }, wp);
  const d0 = evalAt(0), d1 = evalAt(1);
  if (d0 === 0 || d1 === 0) return 0;
  let lo = 0, hi = 1;
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = hi - phi * (hi - lo), d = lo + phi * (hi - lo);
  let fc = evalAt(c), fd = evalAt(d);
  let best = Math.min(d0, d1, fc, fd);
  if (best === 0) return 0;
  for (let i = 0; i < 28; i++) {
    if (fc < fd) {
      hi = d; d = c; fd = fc;
      c = hi - phi * (hi - lo);
      fc = evalAt(c);
      if (fc < best) best = fc;
    } else {
      lo = c; c = d; fc = fd;
      d = lo + phi * (hi - lo);
      fd = evalAt(d);
      if (fd < best) best = fd;
    }
    if (best === 0) return 0;
  }
  return best;
}

function padToPadDistance(a: WorldPad, b: WorldPad): number {
  if (a.pad.shape === 'Round' && b.pad.shape === 'Round') {
    return Math.max(0, dist(a, b) - (a.pad.width + b.pad.width) * 0.5);
  }
  const polyA = padToWorldPolygon(a), polyB = padToWorldPolygon(b);
  if (polyA.some((p) => pointInPolygon(p, polyB)) || polyB.some((p) => pointInPolygon(p, polyA))) return 0;
  let best = Infinity;
  for (let i = 0; i < polyA.length; i++) {
    const a1 = polyA[i], a2 = polyA[(i + 1) % polyA.length];
    for (let j = 0; j < polyB.length; j++) {
      const b1 = polyB[j], b2 = polyB[(j + 1) % polyB.length];
      if (segmentsIntersect(a1, a2, b1, b2)) return 0;
      best = Math.min(best, segmentToSegmentDist(a1, a2, b1, b2));
    }
  }
  return best;
}

export interface RatlineSegment {
  netName: string;
  from: Point2D;
  to: Point2D;
  fromLabel: string;
  toLabel: string;
}

// Computes Minimum Spanning Tree of unrouted connections per net, accounting for traces, vias & copper pours!
function padToCopperDistance(pad: WorldPad, region: CopperRegion): number {
  if (inCopperRegion(pad, region)) return 0;
  const b = polygonBounds(region.outer);
  const dx = Math.max(0, b.minX - pad.x, pad.x - b.maxX);
  const dy = Math.max(0, b.minY - pad.y, pad.y - b.maxY);
  const boxDist = Math.hypot(dx, dy) - pad.radius;
  if (boxDist > 2.0) return boxDist;
  let distance = Infinity;
  for (const [a, bEdge] of copperEdges(region)) distance = Math.min(distance, segmentToPadDistance(a, bEdge, pad));
  return distance;
}

export function computeUnroutedRatlines(pcb: PcbProject): RatlineSegment[] {
  const pads = getWorldPads(pcb);
  const byNet = new Map<string, WorldPad[]>();
  for (const wp of pads) {
    if (!wp.netName || wp.pad.type === 'MountingHole') continue;
    if (!byNet.has(wp.netName)) byNet.set(wp.netName, []);
    byNet.get(wp.netName)!.push(wp);
  }

  const ratlines: RatlineSegment[] = [];
  const SNAP = 0.001;

  for (const [netName, netPads] of byNet) {
    if (netPads.length < 2) continue;

    interface CNode {
      x: number;
      y: number;
      span: LayerSpan;
      label: string;
      isPad: boolean;
      padIdx?: number;
    }
    const nodes: CNode[] = netPads.map((p, i) => ({
      x: p.x,
      y: p.y,
      span: layerToSpan(p.effectiveLayer),
      label: `${p.refDes}.${p.pad.number}`,
      isPad: true,
      padIdx: i
    }));

    const netTraces = pcb.traces.filter((t) => t.netName === netName);
    const netVias = pcb.vias.filter((v) => v.netName === netName);

    const parent = nodes.map((_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };

    const addNode = (n: CNode): number => {
      nodes.push(n);
      parent.push(nodes.length - 1);
      return nodes.length - 1;
    };

    const viaNodeEntries: { idx: number; via: PcbVia; span: LayerSpan }[] = [];
    for (const v of netVias) {
      const span = viaLayerSpan(v);
      const idx = addNode({ x: v.x, y: v.y, span, label: 'Via', isPad: false });
      viaNodeEntries.push({ idx, via: v, span });
      for (let i = 0; i < netPads.length; i++) {
        if (!spansOverlap(span, nodes[i].span)) continue;
        if (pointToPadDistance(v, netPads[i]) <= v.outerDiameter * 0.5 + SNAP) {
          union(idx, i);
        }
      }
    }

    const traceNodeGroups: { tr: (typeof netTraces)[number]; span: LayerSpan; repIdx: number }[] = [];
    for (const tr of netTraces) {
      const span = layerToSpan(tr.layer);
      const idxs: number[] = [];
      for (const pt of tr.points) {
        const idx = addNode({ x: pt.x, y: pt.y, span, label: 'Trace', isPad: false });
        idxs.push(idx);
      }
      for (let k = 1; k < idxs.length; k++) union(idxs[k - 1], idxs[k]);
      if (idxs.length > 0) traceNodeGroups.push({ tr, span, repIdx: idxs[0] });

      for (let k = 1; k < tr.points.length; k++) {
        const a = tr.points[k - 1];
        const b = tr.points[k];
        for (let i = 0; i < netPads.length; i++) {
          if (!spansOverlap(span, nodes[i].span)) continue;
          if (segmentToPadDistance(a, b, netPads[i]) <= tr.width * 0.5 + SNAP) {
            union(idxs[0], i);
          }
        }
        for (const vn of viaNodeEntries) {
          if (!spansOverlap(span, vn.span)) continue;
          if (pointToSegmentDist(vn.via, a, b) <= (vn.via.outerDiameter + tr.width) * 0.5 + SNAP) {
            union(idxs[0], vn.idx);
          }
        }
      }
    }

    // Union crossing or touching same-net traces on the same copper layer
    for (let i = 0; i < traceNodeGroups.length; i++) {
      const ga = traceNodeGroups[i];
      for (let j = i + 1; j < traceNodeGroups.length; j++) {
        const gb = traceNodeGroups[j];
        if (!spansOverlap(ga.span, gb.span)) continue;
        if (find(ga.repIdx) === find(gb.repIdx)) continue;
        const tol = (ga.tr.width + gb.tr.width) * 0.5 + SNAP;
        let joined = false;
        for (let sa = 1; sa < ga.tr.points.length && !joined; sa++) {
          for (let sb = 1; sb < gb.tr.points.length && !joined; sb++) {
            if (segmentToSegmentDist(ga.tr.points[sa - 1], ga.tr.points[sa], gb.tr.points[sb - 1], gb.tr.points[sb]) <= tol) {
              joined = true;
            }
          }
        }
        if (joined) union(ga.repIdx, gb.repIdx);
      }
    }

    // Connect actual generated copper. Thermal clearances and bounding-box overlap
    // alone do not establish an electrical connection.
    const islands = pcb.copperPours.flatMap(pour =>
      pour.netName === netName && pour.poured
        ? (pour.computedIslands ?? []).filter(region => region.outer.length >= 3)
          .map(region => ({ region, span: layerToSpan(pour.layer) }))
        : []);
    const islandNodes = islands.map(({region, span}) => addNode({ ...region.outer[0], span, label: 'Pour', isPad: false }));
    for (const [index, {region, span}] of islands.entries()) {
      const node = islandNodes[index];
      for (let other = 0; other < index; other++) {
        if (find(node) === find(islandNodes[other])) continue;
        if (spansOverlap(span, islands[other].span) && copperRegionDistance(region, islands[other].region, SNAP) <= SNAP) {
          union(node, islandNodes[other]);
        }
      }
      for (const [i, pad] of netPads.entries()) {
        if (spansOverlap(span, nodes[i].span) && padToCopperDistance(pad, region) <= SNAP) union(node, i);
      }
      for (const {idx, via, span: viaSpan} of viaNodeEntries) {
        if (spansOverlap(span, viaSpan) && segmentToCopper(via, via, region) <= via.outerDiameter / 2 + SNAP) union(node, idx);
      }
      for (const {tr, span: traceSpan, repIdx} of traceNodeGroups) {
        if (spansOverlap(span, traceSpan) && tr.points.some((point, i) => i > 0 &&
          segmentToCopper(tr.points[i - 1], point, region) <= tr.width / 2 + SNAP)) union(node, repIdx);
      }
    }

    const compReps = new Map<number, WorldPad[]>();
    for (let i = 0; i < netPads.length; i++) {
      const root = find(i);
      if (!compReps.has(root)) compReps.set(root, []);
      compReps.get(root)!.push(netPads[i]);
    }
    const clusters = Array.from(compReps.values());
    if (clusters.length <= 1) continue;

    const connected = new Set<number>([0]);
    while (connected.size < clusters.length) {
      let bestDist = Infinity;
      let bestA: WorldPad | null = null;
      let bestB: WorldPad | null = null;
      let bestClusterIdx = -1;

      for (const ci of connected) {
        for (let cj = 0; cj < clusters.length; cj++) {
          if (connected.has(cj)) continue;
          for (const pa of clusters[ci]) {
            for (const pb of clusters[cj]) {
              const d = dist(pa, pb);
              if (d < bestDist) {
                bestDist = d;
                bestA = pa;
                bestB = pb;
                bestClusterIdx = cj;
              }
            }
          }
        }
      }
      if (bestClusterIdx === -1 || !bestA || !bestB) break;
      connected.add(bestClusterIdx);
      ratlines.push({
        netName,
        from: { x: bestA.x, y: bestA.y },
        to: { x: bestB.x, y: bestB.y },
        fromLabel: `${bestA.refDes}.${bestA.pad.number}`,
        toLabel: `${bestB.refDes}.${bestB.pad.number}`
      });
    }
  }

  return ratlines;
}

// Comprehensive Design Rule Check (DRC) per ГОСТ 23751 / DipTrace Rules + Waiver Support
export function runPcbDrc(pcb: PcbProject): DrcError[] {
  const errors: DrcError[] = [];
  const rules = pcb.designRules;
  const waivers = pcb.drcWaivers ?? {};
  let idCounter = 1;

  const pushErr = (
    item: Omit<DrcError, 'id' | 'signature' | 'waived' | 'waiveReason'> & { sigKey: string }
  ) => {
    const signature = `${item.code}::${item.layer}::${item.sigKey}`;
    const reason = waivers[signature];
    errors.push({
      id: `drc_${idCounter++}`,
      signature,
      waived: reason !== undefined,
      waiveReason: reason,
      severity: item.severity,
      layer: item.layer,
      x: item.x,
      y: item.y,
      code: item.code,
      message: item.message,
      objectIds: item.objectIds
    });
  };

  const netClassMap = new Map((pcb.netClasses ?? []).map((nc) => [nc.id, nc]));
  const getNetClass = (netName?: string) => {
    if (!netName) return undefined;
    const id = pcb.netClassAssignments?.[netName];
    return id ? netClassMap.get(id) : undefined;
  };

  // 1. Trace widths & Acid Trap (<45 deg) acute-angle check
  for (const tr of pcb.traces) {
    const nc = getNetClass(tr.netName);
    const reqWidth = Math.max(rules.minTraceWidth, nc?.traceWidth ?? 0);
    if (tr.width + 1e-6 < reqWidth) {
      const p = tr.points[0] ?? { x: 0, y: 0 };
      pushErr({
        sigKey: tr.id,
        severity: 'Error',
        layer: tr.layer,
        x: p.x,
        y: p.y,
        code: 'DRC-WIDTH',
        message: `Ширина проводника цепи «${tr.netName || 'Без имени'}» (${tr.width.toFixed(2)} мм) меньше допустимой (${reqWidth.toFixed(2)} мм${nc ? `, класс «${nc.name}»` : `, класс ${rules.gostAccuracyClass}`}).`,
        objectIds: [tr.id]
      });
    }
    for (let k = 1; k < tr.points.length - 1; k++) {
      const a = tr.points[k - 1];
      const b = tr.points[k];
      const c = tr.points[k + 1];
      const v1x = a.x - b.x;
      const v1y = a.y - b.y;
      const v2x = c.x - b.x;
      const v2y = c.y - b.y;
      const len1 = Math.hypot(v1x, v1y);
      const len2 = Math.hypot(v2x, v2y);
      if (len1 > 0.05 && len2 > 0.05) {
        const cosAng = (v1x * v2x + v1y * v2y) / (len1 * len2);
        // Cos > 0.72 corresponds to interior vertex angle < ~44 deg (acute acid trap)
        if (cosAng > 0.72) {
          pushErr({
            sigKey: `acid_${tr.id}_${Math.round(b.x * 10)}_${Math.round(b.y * 10)}`,
            severity: 'Warning',
            layer: tr.layer,
            x: b.x,
            y: b.y,
            code: 'DRC-ACID-TRAP',
            message: `Острый угол (< 45°) проводника «${tr.netName || 'Без имени'}» — риск ловушки травления.`,
            objectIds: [tr.id]
          });
          break;
        }
      }
    }
  }

  // 2. Via sizes & annular ring
  for (const via of pcb.vias) {
    const ring = (via.outerDiameter - via.holeDiameter) / 2;
    if (via.holeDiameter + 1e-6 < rules.minViaHole) {
      pushErr({
        sigKey: `${via.x.toFixed(2)}_${via.y.toFixed(2)}`,
        severity: 'Error',
        layer: 'All',
        x: via.x,
        y: via.y,
        code: 'DRC-VIA-HOLE',
        message: `Диаметр отверстия перехода (${via.holeDiameter.toFixed(2)} мм) меньше нормы (${rules.minViaHole.toFixed(2)} мм).`,
        objectIds: [via.id]
      });
    }
    if (ring + 1e-6 < rules.minAnnularRing) {
      pushErr({
        sigKey: `${via.x.toFixed(2)}_${via.y.toFixed(2)}`,
        severity: 'Error',
        layer: 'All',
        x: via.x,
        y: via.y,
        code: 'DRC-RING',
        message: `Гарантийный поясок перехода (${ring.toFixed(2)} мм) меньше нормы (${rules.minAnnularRing.toFixed(2)} мм).`,
        objectIds: [via.id]
      });
    }
  }

  // 3. Pad-to-Pad Clearance (exact outline distance after bounding-circle filter)
  const pads = getWorldPads(pcb);
  for (let i = 0; i < pads.length; i++) {
    const a = pads[i];
    for (let j = i + 1; j < pads.length; j++) {
      const b = pads[j];
      if (a.compId === b.compId) continue;
      const shareLayer = a.effectiveLayer === 'All' || b.effectiveLayer === 'All' || a.effectiveLayer === b.effectiveLayer;
      if (!shareLayer) continue;
      if (a.netName && b.netName && a.netName === b.netName) continue;
      if (dist(a, b) - (a.radius + b.radius) + 1e-4 >= rules.clearancePadToPad) continue;
      const edgeGap = padToPadDistance(a, b);
      if (edgeGap + 1e-4 < rules.clearancePadToPad) {
        const pair = [`${a.refDes}.${a.pad.number}`, `${b.refDes}.${b.pad.number}`].sort().join('_');
        pushErr({
          sigKey: pair,
          severity: 'Error',
          layer: a.effectiveLayer === 'All' ? (b.effectiveLayer === 'All' ? 'TopCopper' : b.effectiveLayer) : a.effectiveLayer,
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          code: 'DRC-PAD-PAD',
          message: `Зазор между КП ${a.refDes}.${a.pad.number} и ${b.refDes}.${b.pad.number} (${edgeGap.toFixed(2)} мм) меньше нормы ${rules.clearancePadToPad.toFixed(2)} мм.`,
          objectIds: [a.compId, b.compId]
        });
      }
    }
  }

  // 4. Trace-to-Trace Clearance
  for (let i = 0; i < pcb.traces.length; i++) {
    const ta = pcb.traces[i];
    const clrA = getNetClass(ta.netName)?.clearance ?? 0;
    for (let j = i + 1; j < pcb.traces.length; j++) {
      const tb = pcb.traces[j];
      if (ta.layer !== tb.layer) continue;
      if (ta.netName && tb.netName && ta.netName === tb.netName) continue;
      const reqTrClr = Math.max(rules.clearanceTraceToTrace, clrA, getNetClass(tb.netName)?.clearance ?? 0);
      let violated = false;
      for (let sa = 1; sa < ta.points.length && !violated; sa++) {
        for (let sb = 1; sb < tb.points.length && !violated; sb++) {
          const d = segmentToSegmentDist(ta.points[sa - 1], ta.points[sa], tb.points[sb - 1], tb.points[sb]);
          const gap = d - (ta.width + tb.width) * 0.5;
          if (gap + 1e-4 < reqTrClr) {
            const pair = [ta.netName || ta.id, tb.netName || tb.id].sort().join('_');
            pushErr({
              sigKey: `${pair}_${Math.round(ta.points[sa - 1].x)}_${Math.round(ta.points[sa - 1].y)}`,
              severity: 'Error',
              layer: ta.layer,
              x: (ta.points[sa - 1].x + tb.points[sb - 1].x) / 2,
              y: (ta.points[sa - 1].y + tb.points[sb - 1].y) / 2,
              code: 'DRC-TR-TR',
              message: `Зазор между дорожками «${ta.netName || '?'}» и «${tb.netName || '?'}» (${gap.toFixed(2)} мм) < ${reqTrClr.toFixed(2)} мм.`,
              objectIds: [ta.id, tb.id]
            });
            violated = true;
          }
        }
      }
    }
  }

  // 5. Trace-to-Pad Clearance
  for (const tr of pcb.traces) {
    const trNetClr = getNetClass(tr.netName)?.clearance ?? 0;
    for (const wp of pads) {
      if (wp.effectiveLayer !== 'All' && wp.effectiveLayer !== tr.layer) continue;
      if (tr.netName && wp.netName && tr.netName === wp.netName) continue;
      const reqPadClr = Math.max(rules.clearanceTraceToPad, trNetClr, getNetClass(wp.netName)?.clearance ?? 0);
      for (let k = 1; k < tr.points.length; k++) {
        const boundGap = pointToSegmentDist(wp, tr.points[k - 1], tr.points[k]) - tr.width * 0.5 - wp.radius;
        if (boundGap + 1e-4 >= reqPadClr) continue;
        const gap = segmentToPadDistance(tr.points[k - 1], tr.points[k], wp) - tr.width * 0.5;
        if (gap + 1e-4 < reqPadClr) {
          pushErr({
            sigKey: `${tr.netName}_${wp.refDes}.${wp.pad.number}`,
            severity: 'Error',
            layer: tr.layer,
            x: wp.x,
            y: wp.y,
            code: 'DRC-TR-PAD',
            message: `Нарушение зазора дорожки «${tr.netName}» к КП ${wp.refDes}.${wp.pad.number} (${gap.toFixed(2)} мм < ${reqPadClr.toFixed(2)} мм).`,
            objectIds: [tr.id, wp.compId]
          });
          break;
        }
      }
    }
  }

  // 6. Via-to-Trace Clearance (respecting blind/buried layer spans)
  for (const via of pcb.vias) {
    const [vStart, vEnd] = viaLayerSpan(via);
    for (const tr of pcb.traces) {
      if (via.netName && tr.netName && via.netName === tr.netName) continue;
      const trLayerIdx = copperLayerOrder.indexOf(tr.layer);
      if (trLayerIdx < vStart || trLayerIdx > vEnd) continue;
      for (let k = 1; k < tr.points.length; k++) {
        const d = pointToSegmentDist(via, tr.points[k - 1], tr.points[k]);
        const gap = d - via.outerDiameter * 0.5 - tr.width * 0.5;
        if (gap + 1e-4 < rules.clearanceViaToAny) {
          pushErr({
            sigKey: `${via.id}_${tr.id}`,
            severity: 'Error',
            layer: tr.layer,
            x: via.x,
            y: via.y,
            code: 'DRC-VIA-TR',
            message: `Нарушение зазора перехода (${via.netName}) к дорожке «${tr.netName}» (${gap.toFixed(2)} мм < ${rules.clearanceViaToAny.toFixed(2)} мм).`,
            objectIds: [via.id, tr.id]
          });
          break;
        }
      }
    }
  }

  // Via-to-via and via-to-pad clearance. Blind/buried vias only interact
  // on copper layers included in both spans.
  for (let i = 0; i < pcb.vias.length; i++) {
    const a = pcb.vias[i];
    const [aStart, aEnd] = viaLayerSpan(a);
    for (let j = i + 1; j < pcb.vias.length; j++) {
      const b = pcb.vias[j];
      if (a.netName && a.netName === b.netName) continue;
      const [bStart, bEnd] = viaLayerSpan(b);
      if (aEnd < bStart || bEnd < aStart) continue;
      const gap = dist(a, b) - (a.outerDiameter + b.outerDiameter) / 2;
      if (gap + 1e-4 < rules.clearanceViaToAny) {
        pushErr({ sigKey: [a.id, b.id].sort().join('_'), severity: 'Error', layer: copperLayerOrder[Math.max(aStart, bStart)],
          x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, code: 'DRC-VIA-VIA',
          message: `Нарушение зазора между переходами «${a.netName || '?'}» и «${b.netName || '?'}» (${gap.toFixed(2)} мм < ${rules.clearanceViaToAny.toFixed(2)} мм).`, objectIds: [a.id, b.id] });
      }
    }
    for (const wp of pads) {
      if (wp.pad.type === 'MountingHole' || (a.netName && a.netName === wp.netName)) continue;
      const layerIndex = wp.effectiveLayer === 'All' ? -1 : copperLayerOrder.indexOf(wp.effectiveLayer);
      if (layerIndex !== -1 && (layerIndex < aStart || layerIndex > aEnd)) continue;
      const gap = pointToPadDistance(a, wp) - a.outerDiameter / 2;
      if (gap + 1e-4 < rules.clearanceViaToAny) {
        pushErr({ sigKey: `${a.id}_${wp.compId}_${wp.pad.id}`, severity: 'Error', layer: layerIndex === -1 ? copperLayerOrder[aStart] : wp.effectiveLayer as 'TopCopper' | 'BottomCopper',
          x: a.x, y: a.y, code: 'DRC-VIA-PAD',
          message: `Нарушение зазора перехода «${a.netName || '?'}» к КП ${wp.refDes}.${wp.pad.number} (${gap.toFixed(2)} мм < ${rules.clearanceViaToAny.toFixed(2)} мм).`, objectIds: [a.id, wp.compId] });
      }
    }
  }

  // 6b. Hole-to-Hole (Drill-to-Drill) clearance check
  const minHoleGap = rules.clearanceHoleToHole ?? Math.max(0.15, rules.clearanceViaToAny * 0.7);
  const allHoles: Array<{ id: string; x: number; y: number; holeDia: number; name: string }> = [];
  for (const v of pcb.vias) {
    allHoles.push({ id: v.id, x: v.x, y: v.y, holeDia: v.holeDiameter, name: `Переход (${v.netName || '—'})` });
  }
  for (const wp of pads) {
    if ((wp.pad.holeDiameter ?? 0) > 0) {
      allHoles.push({ id: `${wp.compId}_${wp.pad.id}`, x: wp.x, y: wp.y, holeDia: wp.pad.holeDiameter!, name: `КП ${wp.refDes}.${wp.pad.number}` });
    }
  }
  for (let i = 0; i < allHoles.length; i++) {
    const h1 = allHoles[i];
    for (let j = i + 1; j < allHoles.length; j++) {
      const h2 = allHoles[j];
      const d = dist(h1, h2);
      const edgeGap = d - (h1.holeDia + h2.holeDia) / 2;
      if (edgeGap + 1e-4 < minHoleGap) {
        pushErr({
          sigKey: [h1.id, h2.id].sort().join('_hh_'),
          severity: 'Error',
          layer: 'TopCopper',
          x: (h1.x + h2.x) / 2,
          y: (h1.y + h2.y) / 2,
          code: 'DRC-HOLE-HOLE',
          message: `Нарушение зазора между отверстиями сверловки ${h1.name} и ${h2.name} (${edgeGap.toFixed(2)} мм < ${minHoleGap.toFixed(2)} мм по ГОСТ 23751).`,
          objectIds: [h1.id, h2.id]
        });
      }
    }
  }

  // 7. Copper must stay on board material, including the clearance around cutouts.
  const edgeClearance = rules.clearanceCopperToBoard;
  for (const tr of pcb.traces) {
    const bad = tr.points.find((point, index) => index > 0 &&
      !fitsBoardMaterial(pcb, tr.points[index - 1], point, edgeClearance + tr.width / 2));
    if (bad) pushErr({
      sigKey: `${tr.id}_edge`, severity: 'Warning', layer: tr.layer, ...bad,
      code: 'DRC-EDGE', message: `Проводник «${tr.netName}» нарушает зазор до края платы или выреза.`, objectIds: [tr.id]
    });
  }
  const boundaries = [pcb.boardOutline, ...(pcb.cutouts ?? []).map(cutout => cutout.points)];
  for (const wp of pads) {
    if (wp.pad.type === 'MountingHole') continue;
    if (!fitsBoardMaterial(pcb, wp, wp, 0) || boundaries.some(points => points.length >= 3 &&
      points.some((point, index) => segmentToPadDistance(point, points[(index + 1) % points.length], wp) + COPPER_EPSILON < edgeClearance))) {
      pushErr({
        sigKey: `pad_${wp.compId}_${wp.pad.id}_edge`, severity: 'Warning',
        layer: wp.effectiveLayer === 'All' ? 'TopCopper' : wp.effectiveLayer, x: wp.x, y: wp.y,
        code: 'DRC-EDGE', message: `КП ${wp.refDes}.${wp.pad.number} нарушает зазор до края платы или выреза.`, objectIds: [wp.compId]
      });
    }
  }
  for (const via of pcb.vias) {
    if (!fitsBoardMaterial(pcb, via, via, edgeClearance + via.outerDiameter / 2)) {
      pushErr({
        sigKey: `via_${via.id}_edge`, severity: 'Warning', layer: 'All', x: via.x, y: via.y,
        code: 'DRC-EDGE', message: `Via ${via.netName || via.id} нарушает зазор до края платы или выреза.`, objectIds: [via.id]
      });
    }
    const offendingPad = pads.find(wp => wp.pad.type === 'SMD' &&
      spansOverlap(viaLayerSpan(via), layerToSpan(wp.effectiveLayer)) &&
      (!via.viaInPad || wp.netName !== via.netName || !via.netName) &&
      pointToPadDistance(via, wp) + COPPER_EPSILON < via.holeDiameter / 2);
    if (offendingPad) pushErr({
      sigKey: `${via.id}_smd_drill`, severity: 'Error', layer: 'All', x: via.x, y: via.y,
      code: 'DRC-VIA-IN-PAD', message: `Отверстие пересекает SMD-площадку ${offendingPad.refDes}.${offendingPad.pad.number}.`,
      objectIds: [via.id, offendingPad.compId]
    });
  }

  const poured = pcb.copperPours.filter(pour => pour.poured && pour.computedIslands?.length);
  for (const [index, pour] of poured.entries()) {
    const regions = pour.computedIslands!.filter(region => region.outer.length >= 3);
    const span = layerToSpan(pour.layer);
    const clearance = (net: string, base: number) => Math.max(base, pour.clearance,
      getNetClass(net)?.clearance ?? 0, getNetClass(pour.netName)?.clearance ?? 0);
    const location = regions[0]?.outer[0];
    if (!location) continue;
    const issue = (objectId: string, label: string) => pushErr({
      sigKey: `${pour.id}_${objectId}`, severity: 'Error', layer: pour.layer, ...location,
      code: 'DRC-POUR-CLEARANCE', message: `Заливка «${pour.netName}» нарушает зазор до ${label}.`,
      objectIds: [pour.id, objectId]
    });
    const materialMargin = Math.max(pour.boardClearance, edgeClearance);
    if (regions.some(region => copperEdges(region).some(([a, b]) => !fitsBoardMaterial(pcb, a, b, materialMargin)) ||
      (pcb.cutouts ?? []).some(cutout => cutout.points.some(point => inCopperRegion(point, region))))) {
      issue(pour.id, 'края платы или выреза');
    }
    for (const zone of pcb.keepouts) {
      if ((zone.kind === 'PourKeepout' || zone.kind === 'RouteKeepout') && zone.points.length >= 3 &&
        (zone.layer === 'AllCopper' || zone.layer === pour.layer) &&
        regions.some(region => copperRegionDistance(region, {outer: zone.points, holes: []}, COPPER_EPSILON) <= COPPER_EPSILON)) {
        issue(zone.id, 'зоны запрета');
      }
    }
    for (const pad of pads) {
      if (pad.pad.type === 'MountingHole' || pad.netName === pour.netName || !spansOverlap(span, layerToSpan(pad.effectiveLayer))) continue;
      const minGap = clearance(pad.netName, rules.clearanceTraceToPad);
      if (regions.some(region => padToCopperDistance(pad, region) + COPPER_EPSILON < minGap)) {
        issue(pad.compId, `КП ${pad.refDes}.${pad.pad.number}`);
      }
    }
    for (const trace of pcb.traces) {
      if (trace.layer !== pour.layer || trace.netName === pour.netName) continue;
      const minDist = clearance(trace.netName, rules.clearanceTraceToTrace) + trace.width / 2;
      if (regions.some(region => trace.points.some((point, i) => i > 0 &&
        segmentToCopper(trace.points[i - 1], point, region) + COPPER_EPSILON < minDist))) issue(trace.id, `дорожки «${trace.netName}»`);
    }
    for (const via of pcb.vias) {
      if (via.netName === pour.netName || !spansOverlap(span, viaLayerSpan(via))) continue;
      const minDist = clearance(via.netName, rules.clearanceViaToAny) + via.outerDiameter / 2;
      if (regions.some(region => segmentToCopper(via, via, region) + COPPER_EPSILON < minDist)) issue(via.id, `via «${via.netName}»`);
    }
    for (const other of poured.slice(0, index)) {
      if (other.layer !== pour.layer || other.netName === pour.netName) continue;
      const minDist = Math.max(other.clearance, clearance(other.netName, rules.clearanceTraceToTrace));
      if (regions.some(region => other.computedIslands!.some(island => island.outer.length >= 3 &&
        copperRegionDistance(region, island, minDist) + COPPER_EPSILON < minDist))) issue(other.id, `заливки «${other.netName}»`);
    }
  }

  // 8. Unrouted Nets check
  if (rules.checkUnroutedNets) {
    const ratlines = computeUnroutedRatlines(pcb);
    for (const rat of ratlines) {
      pushErr({
        sigKey: `${rat.netName}_${rat.fromLabel}_${rat.toLabel}`,
        severity: 'Warning',
        layer: 'All',
        x: (rat.from.x + rat.to.x) / 2,
        y: (rat.from.y + rat.to.y) / 2,
        code: 'DRC-UNROUTED',
        message: `Неразведённая связь цепи «${rat.netName}»: ${rat.fromLabel} ↔ ${rat.toLabel}`,
        objectIds: []
      });
    }
  }

  // 9. Keepout zone violations (Trace / Via / Pad inside RouteKeepout / ViaKeepout / ComponentKeepout)
  for (const ko of pcb.keepouts) {
    if (ko.points.length < 3) continue;
    if (ko.kind === 'RouteKeepout') {
      for (const tr of pcb.traces) {
        if (ko.layer !== 'AllCopper' && ko.layer !== tr.layer) continue;
        const inside = tr.points.find((pt) => pointInPolygon(pt, ko.points));
        let crossing: Point2D | undefined;
        for (let i = 1; i < tr.points.length && !crossing; i++) {
          for (let j = 0; j < ko.points.length; j++) {
            if (segmentsIntersect(tr.points[i - 1], tr.points[i], ko.points[j], ko.points[(j + 1) % ko.points.length])) {
              const a = tr.points[i - 1];
              const b = tr.points[i];
              const c = ko.points[j];
              const d = ko.points[(j + 1) % ko.points.length];
              const dx = b.x - a.x, dy = b.y - a.y;
              const ex = d.x - c.x, ey = d.y - c.y;
              const denominator = dx * ey - dy * ex;
              if (Math.abs(denominator) > 1e-12) {
                const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / denominator;
                crossing = { x: a.x + t * dx, y: a.y + t * dy };
              } else {
                crossing = pointToSegmentNearest(c, a, b).point;
              }
              break;
            }
            const a = tr.points[i - 1];
            const b = tr.points[i];
            const c = ko.points[j];
            const d = ko.points[(j + 1) % ko.points.length];
            if (segmentToSegmentDist(a, b, c, d) <= tr.width / 2 + 1e-9) {
              // Choose the nearest point on the trace for the marker. For
              // disjoint segments the closest pair includes an endpoint.
              const candidates = [
                { point: a, dist: pointToSegmentDist(a, c, d) },
                { point: b, dist: pointToSegmentDist(b, c, d) },
                pointToSegmentNearest(c, a, b),
                pointToSegmentNearest(d, a, b)
              ];
              candidates.sort((u, v) => u.dist - v.dist);
              crossing = candidates[0].point;
              break;
            }
          }
        }
        if (inside || crossing) {
          const pt = inside ?? crossing!;
          pushErr({
            sigKey: `ko_${ko.id}_${tr.id}`,
            severity: 'Error',
            layer: tr.layer,
            x: pt.x,
            y: pt.y,
            code: 'DRC-KEEPOUT',
            message: `Дорожка «${tr.netName || tr.id}» пересекает зону запрета трассировки.`,
            objectIds: [tr.id, ko.id]
          });
        }
      }
    }
    if (ko.kind === 'RouteKeepout') {
      const koSpan = layerToSpan(ko.layer);
      for (const v of pcb.vias) {
        if (!spansOverlap(viaLayerSpan(v), koSpan)) continue;
        const r = v.outerDiameter * 0.5;
        let touches = pointInPolygon(v, ko.points);
        if (!touches) {
          for (let j = 0; j < ko.points.length; j++) {
            if (pointToSegmentDist(v, ko.points[j], ko.points[(j + 1) % ko.points.length]) <= r + 1e-6) {
              touches = true;
              break;
            }
          }
        }
        if (touches) {
          pushErr({
            sigKey: `ko_${ko.id}_${v.id}`,
            severity: 'Error',
            layer: 'All',
            x: v.x,
            y: v.y,
            code: 'DRC-KEEPOUT',
            message: `Переходное отверстие (${v.netName || v.id}) пересекает зону запрета Keepout.`,
            objectIds: [v.id, ko.id]
          });
        }
      }
    }
    if (ko.kind === 'PlaceKeepout') {
      for (const comp of pcb.components) {
        if (ko.layer !== 'AllCopper' && ((comp.side === 'Top' && ko.layer !== 'TopCopper') || (comp.side === 'Bottom' && ko.layer !== 'BottomCopper'))) continue;
        const rad = (comp.angle * Math.PI) / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const hw = Math.max(0.1, (comp.courtyard?.width ?? 1) * 0.5);
        const hh = Math.max(0.1, (comp.courtyard?.height ?? 1) * 0.5);
        const corners: Point2D[] = [
          { x: comp.x + (-hw * cos - -hh * sin), y: comp.y + (-hw * sin + -hh * cos) },
          { x: comp.x + (hw * cos - -hh * sin), y: comp.y + (hw * sin + -hh * cos) },
          { x: comp.x + (hw * cos - hh * sin), y: comp.y + (hw * sin + hh * cos) },
          { x: comp.x + (-hw * cos - hh * sin), y: comp.y + (-hw * sin + hh * cos) }
        ];
        let violates = pointInPolygon(comp, ko.points)
          || corners.some((c) => pointInPolygon(c, ko.points))
          || ko.points.some((kp) => pointInPolygon(kp, corners));
        if (!violates) {
          for (let ci = 0; ci < 4 && !violates; ci++) {
            for (let ki = 0; ki < ko.points.length && !violates; ki++) {
              if (segmentsIntersect(corners[ci], corners[(ci + 1) % 4], ko.points[ki], ko.points[(ki + 1) % ko.points.length])) {
                violates = true;
              }
            }
          }
        }
        if (violates) {
          pushErr({
            sigKey: `ko_${ko.id}_${comp.id}`,
            severity: 'Warning',
            layer: comp.side === 'Bottom' ? 'BottomCopper' : 'TopCopper',
            x: comp.x,
            y: comp.y,
            code: 'DRC-KEEPOUT',
            message: `Компонент ${comp.refDes} находится в зоне запрета размещения.`,
            objectIds: [comp.id, ko.id]
          });
        }
      }
    }
  }

  // 9b. Silkscreen-over-Pad Clearance
  if (rules.checkSilkOverPads) {
    const silkPadViolations = new Set<string>();
    const checkSilkSegment = (a: Point2D, b: Point2D, halfWidth: number, silkLayer: 'TopSilk' | 'BottomSilk', objId: string) => {
      for (const wp of pads) {
        if (wp.pad.type === 'MountingHole') continue;
        const padOnSide = wp.effectiveLayer === 'All'
          || (silkLayer === 'TopSilk' && wp.effectiveLayer === 'TopCopper')
          || (silkLayer === 'BottomSilk' && wp.effectiveLayer === 'BottomCopper');
        if (!padOnSide) continue;
        const key = `${objId}::${wp.compId}_${wp.pad.id}`;
        if (silkPadViolations.has(key)) continue;
        const gap = segmentToPadDistance(a, b, wp) - halfWidth;
        if (gap + 1e-4 < rules.silkToPadClearance) {
          silkPadViolations.add(key);
          pushErr({
            sigKey: `silk_${objId}_${wp.compId}_${wp.pad.id}`,
            severity: 'Warning',
            layer: silkLayer,
            x: wp.x,
            y: wp.y,
            code: 'DRC-SILK-PAD',
            message: `Шелкография перекрывает КП ${wp.refDes}.${wp.pad.number} (зазор ${gap.toFixed(2)} мм < ${rules.silkToPadClearance.toFixed(2)} мм).`,
            objectIds: [objId, wp.compId]
          });
        }
      }
    };
    for (const sh of pcb.shapes) {
      if (sh.layer !== 'TopSilk' && sh.layer !== 'BottomSilk') continue;
      const hw = (sh.width ?? 0.15) * 0.5;
      if (sh.type === 'line' && sh.x2 !== undefined && sh.y2 !== undefined) {
        checkSilkSegment({ x: sh.x1, y: sh.y1 }, { x: sh.x2, y: sh.y2 }, hw, sh.layer, sh.id);
      } else if (sh.type === 'rect' && sh.w !== undefined && sh.h !== undefined) {
        const p1 = { x: sh.x1, y: sh.y1 }, p2 = { x: sh.x1 + sh.w, y: sh.y1 };
        const p3 = { x: sh.x1 + sh.w, y: sh.y1 + sh.h }, p4 = { x: sh.x1, y: sh.y1 + sh.h };
        checkSilkSegment(p1, p2, hw, sh.layer, sh.id);
        checkSilkSegment(p2, p3, hw, sh.layer, sh.id);
        checkSilkSegment(p3, p4, hw, sh.layer, sh.id);
        checkSilkSegment(p4, p1, hw, sh.layer, sh.id);
      } else if (sh.type === 'circle' && sh.r !== undefined) {
        for (const wp of pads) {
          if (wp.pad.type === 'MountingHole') continue;
          const padOnSide = wp.effectiveLayer === 'All'
            || (sh.layer === 'TopSilk' && wp.effectiveLayer === 'TopCopper')
            || (sh.layer === 'BottomSilk' && wp.effectiveLayer === 'BottomCopper');
          if (!padOnSide) continue;
          const d = Math.abs(dist({ x: sh.x1, y: sh.y1 }, wp) - sh.r) - hw - wp.radius;
          if (d + 1e-4 < rules.silkToPadClearance) {
            pushErr({
              sigKey: `silk_${sh.id}_${wp.compId}_${wp.pad.id}`,
              severity: 'Warning',
              layer: sh.layer,
              x: wp.x,
              y: wp.y,
              code: 'DRC-SILK-PAD',
              message: `Шелкография перекрывает КП ${wp.refDes}.${wp.pad.number}.`,
              objectIds: [sh.id, wp.compId]
            });
          }
        }
      }
    }
    for (const comp of pcb.components) {
      const mirror = comp.side === 'Bottom';
      for (const g of comp.graphics) {
        const mappedLayer: string = mirror
          ? (g.layer === 'TopSilk' ? 'BottomSilk' : g.layer === 'BottomSilk' ? 'TopSilk' : g.layer)
          : g.layer;
        if (mappedLayer !== 'TopSilk' && mappedLayer !== 'BottomSilk') continue;
        const hw = ('width' in g ? g.width : 0.15) * 0.5;
        if (g.type === 'line') {
          checkSilkSegment(
            transformPoint(g.x1, g.y1, comp.x, comp.y, comp.angle, mirror, false),
            transformPoint(g.x2, g.y2, comp.x, comp.y, comp.angle, mirror, false),
            hw, mappedLayer, comp.id
          );
        } else if (g.type === 'rect') {
          const pts = [
            transformPoint(g.x, g.y, comp.x, comp.y, comp.angle, mirror, false),
            transformPoint(g.x + g.w, g.y, comp.x, comp.y, comp.angle, mirror, false),
            transformPoint(g.x + g.w, g.y + g.h, comp.x, comp.y, comp.angle, mirror, false),
            transformPoint(g.x, g.y + g.h, comp.x, comp.y, comp.angle, mirror, false)
          ];
          for (let k = 0; k < 4; k++) checkSilkSegment(pts[k], pts[(k + 1) % 4], hw, mappedLayer, comp.id);
        } else if (g.type === 'polyline' && g.points.length >= 2) {
          const pts = g.points.map((pt) => transformPoint(pt.x, pt.y, comp.x, comp.y, comp.angle, mirror, false));
          for (let k = 1; k < pts.length; k++) checkSilkSegment(pts[k - 1], pts[k], hw, mappedLayer, comp.id);
          if (g.closed && pts.length > 2) checkSilkSegment(pts[pts.length - 1], pts[0], hw, mappedLayer, comp.id);
        } else if (g.type === 'circle' || g.type === 'arc') {
          const startDeg = g.type === 'circle' ? 0 : g.startAngle;
          let endDeg = g.type === 'circle' ? 360 : g.endAngle;
          if (g.type === 'arc' && endDeg < startDeg) endDeg += 360;
          const steps = g.type === 'circle' ? 16 : Math.max(6, Math.ceil((endDeg - startDeg) / 22.5));
          const pts: Point2D[] = [];
          for (let s = 0; s <= steps; s++) {
            const rad = ((startDeg + ((endDeg - startDeg) * s) / steps) * Math.PI) / 180;
            pts.push(
              transformPoint(
                g.cx + Math.cos(rad) * g.r,
                g.cy + Math.sin(rad) * g.r,
                comp.x,
                comp.y,
                comp.angle,
                mirror,
                false
              )
            );
          }
          for (let k = 1; k < pts.length; k++) checkSilkSegment(pts[k - 1], pts[k], hw, mappedLayer, comp.id);
        }
      }
    }
  }

  // 10. Component courtyard overlap check (same side)
  for (let i = 0; i < pcb.components.length; i++) {
    const a = pcb.components[i];
    if (a.pads.every((p) => p.type === 'MountingHole')) continue;
    const ar = (a.angle * Math.PI) / 180;
    const aCw = a.courtyard?.width ?? Math.max(1.0, ...a.pads.map((p) => (Math.abs(p.x) + p.width * 0.5) * 2));
    const aCh = a.courtyard?.height ?? Math.max(1.0, ...a.pads.map((p) => (Math.abs(p.y) + p.height * 0.5) * 2));
    const aw = Math.abs(aCw * Math.cos(ar)) + Math.abs(aCh * Math.sin(ar));
    const ah = Math.abs(aCw * Math.sin(ar)) + Math.abs(aCh * Math.cos(ar));
    for (let j = i + 1; j < pcb.components.length; j++) {
      const b = pcb.components[j];
      if (a.side !== b.side || b.pads.every((p) => p.type === 'MountingHole')) continue;
      const br = (b.angle * Math.PI) / 180;
      const bCw = b.courtyard?.width ?? Math.max(1.0, ...b.pads.map((p) => (Math.abs(p.x) + p.width * 0.5) * 2));
      const bCh = b.courtyard?.height ?? Math.max(1.0, ...b.pads.map((p) => (Math.abs(p.y) + p.height * 0.5) * 2));
      const bw = Math.abs(bCw * Math.cos(br)) + Math.abs(bCh * Math.sin(br));
      const bh = Math.abs(bCw * Math.sin(br)) + Math.abs(bCh * Math.cos(br));
      if (Math.abs(a.x - b.x) < (aw + bw) * 0.48 && Math.abs(a.y - b.y) < (ah + bh) * 0.48) {
        pushErr({
          sigKey: [a.refDes, b.refDes].sort().join('_'),
          severity: 'Warning',
          layer: a.side === 'Bottom' ? 'BottomCopper' : 'TopCopper',
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          code: 'DRC-COURTYARD',
          message: `Перекрытие корпусов ${a.refDes} и ${b.refDes} (проверьте габариты Courtyard).`,
          objectIds: [a.id, b.id]
        });
      }
    }
  }

  // 11. Differential Pair length matching check (marker located cleanly on pair midpoint!)
  for (const dp of pcb.diffPairs) {
    let lenPos = 0;
    let lenNeg = 0;
    let midPt: Point2D | null = null;
    for (const tr of pcb.traces) {
      if (tr.netName === dp.posNet || tr.netName === dp.negNet) {
        if (!midPt && tr.points.length >= 2) {
          midPt = {
            x: (tr.points[0].x + tr.points[tr.points.length - 1].x) * 0.5,
            y: (tr.points[0].y + tr.points[tr.points.length - 1].y) * 0.5
          };
        }
        for (let k = 1; k < tr.points.length; k++) {
          const segLen = dist(tr.points[k - 1], tr.points[k]);
          if (tr.netName === dp.posNet) lenPos += segLen;
          else lenNeg += segLen;
        }
      }
    }
    const diff = Math.abs(lenPos - lenNeg);
    if (lenPos > 0 && lenNeg > 0 && diff > dp.maxMismatch && midPt) {
      pushErr({
        sigKey: dp.name,
        severity: 'Warning',
        layer: 'TopCopper',
        x: midPt.x,
        y: midPt.y,
        code: 'DRC-DIFF-LEN',
        message: `Рассогласование длин дифф. пары «${dp.name}»: ΔL = ${diff.toFixed(2)} мм > ${dp.maxMismatch.toFixed(2)} мм.`,
        objectIds: []
      });
    }
  }

  return errors;
}
