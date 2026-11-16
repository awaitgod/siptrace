import { DrcError, PadDef, PcbProject, PcbVia, Point2D } from '../core/types';
import { dist, pointInPolygon, pointToSegmentDist, pointToSegmentNearest, polygonBounds, segmentToSegmentDist, segmentsIntersect, transformPoint } from '../core/geometry';

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
      result.push({
        compId: comp.id,
        refDes: comp.refDes,
        pad,
        x: pt.x,
        y: pt.y,
        padAngleDeg,
        netName: comp.padNets[pad.number] ?? '',
        effectiveLayer,
        radius: Math.max(pad.width, pad.height) * 0.5
      });
    }
  }
  return result;
}

const copperLayerOrder = ['TopCopper', 'Inner1', 'Inner2', 'BottomCopper'] as const;

function viaLayerSpan(via: PcbVia): [number, number] {
  const a = copperLayerOrder.indexOf(via.startLayer);
  const b = copperLayerOrder.indexOf(via.endLayer);
  return [Math.min(a, b), Math.max(a, b)];
}

// Distance from the via centre to the pad's rendered copper outline.
function pointToPadDistance(point: Point2D, wp: WorldPad): number {
  const angle = -wp.padAngleDeg * Math.PI / 180;
  const dx = point.x - wp.x, dy = point.y - wp.y;
  const x = Math.abs(dx * Math.cos(angle) - dy * Math.sin(angle));
  const y = Math.abs(dx * Math.sin(angle) + dy * Math.cos(angle));
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
  return Math.hypot(Math.max(0, x - rx), Math.max(0, y - ry));
}

export interface RatlineSegment {
  netName: string;
  from: Point2D;
  to: Point2D;
  fromLabel: string;
  toLabel: string;
}

// Computes Minimum Spanning Tree of unrouted connections per net, accounting for traces, vias & copper pours!
export function computeUnroutedRatlines(pcb: PcbProject): RatlineSegment[] {
  const pads = getWorldPads(pcb);
  const byNet = new Map<string, WorldPad[]>();
  for (const wp of pads) {
    if (!wp.netName || wp.pad.type === 'MountingHole') continue;
    if (!byNet.has(wp.netName)) byNet.set(wp.netName, []);
    byNet.get(wp.netName)!.push(wp);
  }

  const ratlines: RatlineSegment[] = [];
  const SNAP = 0.35;

  for (const [netName, netPads] of byNet) {
    if (netPads.length < 2) continue;

    interface CNode {
      x: number;
      y: number;
      layer: string;
      label: string;
      isPad: boolean;
    }
    const nodes: CNode[] = netPads.map((p) => ({
      x: p.x,
      y: p.y,
      layer: p.effectiveLayer,
      label: `${p.refDes}.${p.pad.number}`,
      isPad: true
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

    const sameLayer = (a: string, b: string) => a === 'All' || b === 'All' || a === b;

    const addNode = (n: CNode): number => {
      nodes.push(n);
      parent.push(nodes.length - 1);
      return nodes.length - 1;
    };

    for (const v of netVias) {
      const idx = addNode({ x: v.x, y: v.y, layer: 'All', label: 'Via', isPad: false });
      for (let i = 0; i < netPads.length; i++) {
        if (dist(v, netPads[i]) < Math.max(SNAP, netPads[i].radius + v.outerDiameter * 0.5)) {
          union(idx, i);
        }
      }
    }

    for (const tr of netTraces) {
      const idxs: number[] = [];
      for (const pt of tr.points) {
        const idx = addNode({ x: pt.x, y: pt.y, layer: tr.layer, label: 'Trace', isPad: false });
        idxs.push(idx);
      }
      for (let k = 1; k < idxs.length; k++) union(idxs[k - 1], idxs[k]);

      for (let k = 1; k < tr.points.length; k++) {
        const a = tr.points[k - 1];
        const b = tr.points[k];
        for (let i = 0; i < nodes.length; i++) {
          if (!sameLayer(tr.layer, nodes[i].layer)) continue;
          const thr = nodes[i].isPad ? Math.max(SNAP, 0.5) : SNAP;
          if (pointToSegmentDist(nodes[i], a, b) <= thr) {
            union(idxs[0], i);
          }
        }
      }
    }

    // Check copper pours: group adjacent computed islands so isolated copper regions do not falsely short nets
    for (const pour of pcb.copperPours) {
      if (pour.netName === netName && pour.poured && pour.computedIslands && pour.computedIslands.length > 0 && pour.thermalType !== 'None') {
        const isls = pour.computedIslands;
        const ib = isls.map((isl) => polygonBounds(isl.outer));
        const islParent = isls.map((_, idx) => idx);
        const findIsl = (x: number): number => {
          while (islParent[x] !== x) {
            islParent[x] = islParent[islParent[x]];
            x = islParent[x];
          }
          return x;
        };
        for (let a = 0; a < ib.length; a++) {
          for (let b = a + 1; b < ib.length; b++) {
            const ra = findIsl(a);
            const rb = findIsl(b);
            if (ra === rb) continue;
            const touchX = ib[a].maxX >= ib[b].minX - 0.05 && ib[b].maxX >= ib[a].minX - 0.05;
            const touchY = ib[a].maxY >= ib[b].minY - 0.05 && ib[b].maxY >= ib[a].minY - 0.05;
            if (touchX && touchY) islParent[ra] = rb;
          }
        }
        const tol = Math.max(SNAP, (pour.thermalGap ?? 0.3) + 0.35);
        const byComp = new Map<number, number[]>();
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          if (!sameLayer(pour.layer, n.layer)) continue;
          for (let k = 0; k < isls.length; k++) {
            const b = ib[k];
            if (n.x < b.minX - tol || n.x > b.maxX + tol || n.y < b.minY - tol || n.y > b.maxY + tol) continue;
            const inPoly = pointInPolygon(n, isls[k].outer) && !(isls[k].holes ?? []).some((h) => pointInPolygon(n, h));
            const nearEdge =
              n.x >= b.minX - tol && n.x <= b.maxX + tol && n.y >= b.minY - tol && n.y <= b.maxY + tol &&
              (isls[k].outer.some((pt, pIdx) => {
                const nextPt = isls[k].outer[(pIdx + 1) % isls[k].outer.length];
                return pointToSegmentDist(n, pt, nextPt) <= tol;
              }));
            if (inPoly || nearEdge) {
              const root = findIsl(k);
              if (!byComp.has(root)) byComp.set(root, []);
              byComp.get(root)!.push(i);
              break;
            }
          }
        }
        for (const group of byComp.values()) {
          for (let m = 1; m < group.length; m++) union(group[0], group[m]);
        }
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

  // 1. Trace widths
  for (const tr of pcb.traces) {
    if (tr.width + 1e-6 < rules.minTraceWidth) {
      const p = tr.points[0] ?? { x: 0, y: 0 };
      pushErr({
        sigKey: tr.id,
        severity: 'Error',
        layer: tr.layer,
        x: p.x,
        y: p.y,
        code: 'DRC-WIDTH',
        message: `Ширина проводника цепи «${tr.netName || 'Без имени'}» (${tr.width.toFixed(2)} мм) меньше допустимой (${rules.minTraceWidth.toFixed(2)} мм, класс ${rules.gostAccuracyClass}).`,
        objectIds: [tr.id]
      });
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

  // 3. Pad-to-Pad Clearance
  const pads = getWorldPads(pcb);
  for (let i = 0; i < pads.length; i++) {
    const a = pads[i];
    for (let j = i + 1; j < pads.length; j++) {
      const b = pads[j];
      if (a.compId === b.compId) continue;
      const shareLayer = a.effectiveLayer === 'All' || b.effectiveLayer === 'All' || a.effectiveLayer === b.effectiveLayer;
      if (!shareLayer) continue;
      if (a.netName && b.netName && a.netName === b.netName) continue;
      const centerDist = dist(a, b);
      const edgeGap = centerDist - (a.radius + b.radius);
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
    for (let j = i + 1; j < pcb.traces.length; j++) {
      const tb = pcb.traces[j];
      if (ta.layer !== tb.layer) continue;
      if (ta.netName && tb.netName && ta.netName === tb.netName) continue;
      let violated = false;
      for (let sa = 1; sa < ta.points.length && !violated; sa++) {
        for (let sb = 1; sb < tb.points.length && !violated; sb++) {
          const d = segmentToSegmentDist(ta.points[sa - 1], ta.points[sa], tb.points[sb - 1], tb.points[sb]);
          const gap = d - (ta.width + tb.width) * 0.5;
          if (gap + 1e-4 < rules.clearanceTraceToTrace) {
            const pair = [ta.netName || ta.id, tb.netName || tb.id].sort().join('_');
            pushErr({
              sigKey: `${pair}_${Math.round(ta.points[sa - 1].x)}_${Math.round(ta.points[sa - 1].y)}`,
              severity: 'Error',
              layer: ta.layer,
              x: (ta.points[sa - 1].x + tb.points[sb - 1].x) / 2,
              y: (ta.points[sa - 1].y + tb.points[sb - 1].y) / 2,
              code: 'DRC-TR-TR',
              message: `Зазор между дорожками «${ta.netName || '?'}» и «${tb.netName || '?'}» (${gap.toFixed(2)} мм) < ${rules.clearanceTraceToTrace.toFixed(2)} мм.`,
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
    for (const wp of pads) {
      if (wp.effectiveLayer !== 'All' && wp.effectiveLayer !== tr.layer) continue;
      if (tr.netName && wp.netName && tr.netName === wp.netName) continue;
      for (let k = 1; k < tr.points.length; k++) {
        const d = pointToSegmentDist(wp, tr.points[k - 1], tr.points[k]);
        const gap = d - tr.width * 0.5 - wp.radius;
        if (gap + 1e-4 < rules.clearanceTraceToPad) {
          pushErr({
            sigKey: `${tr.netName}_${wp.refDes}.${wp.pad.number}`,
            severity: 'Error',
            layer: tr.layer,
            x: wp.x,
            y: wp.y,
            code: 'DRC-TR-PAD',
            message: `Нарушение зазора дорожки «${tr.netName}» к КП ${wp.refDes}.${wp.pad.number} (${gap.toFixed(2)} мм < ${rules.clearanceTraceToPad.toFixed(2)} мм).`,
            objectIds: [tr.id, wp.compId]
          });
          break;
        }
      }
    }
  }

  // 6. Via-to-Trace Clearance
  for (const via of pcb.vias) {
    for (const tr of pcb.traces) {
      if (via.netName && tr.netName && via.netName === tr.netName) continue;
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

  // 7. Trace-to-Board Outline Clearance
  if (pcb.boardOutline.length >= 3) {
    for (const tr of pcb.traces) {
      for (let k = 1; k < tr.points.length; k++) {
        for (let b = 0; b < pcb.boardOutline.length; b++) {
          const bNext = (b + 1) % pcb.boardOutline.length;
          const d = segmentToSegmentDist(tr.points[k - 1], tr.points[k], pcb.boardOutline[b], pcb.boardOutline[bNext]);
          const gap = d - tr.width * 0.5;
          if (gap + 1e-4 < rules.clearanceCopperToBoard) {
            pushErr({
              sigKey: `${tr.id}_edge`,
              severity: 'Warning',
              layer: tr.layer,
              x: tr.points[k].x,
              y: tr.points[k].y,
              code: 'DRC-EDGE',
              message: `Проводник «${tr.netName}» ближе ${rules.clearanceCopperToBoard.toFixed(2)} мм к краю платы.`,
              objectIds: [tr.id]
            });
            break;
          }
        }
      }
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
      for (const v of pcb.vias) {
        if (pointInPolygon(v, ko.points)) {
          pushErr({
            sigKey: `ko_${ko.id}_${v.id}`,
            severity: 'Error',
            layer: 'All',
            x: v.x,
            y: v.y,
            code: 'DRC-KEEPOUT',
            message: `Переходное отверстие (${v.netName || v.id}) внутри зоны запрета Keepout.`,
            objectIds: [v.id, ko.id]
          });
        }
      }
    }
    if (ko.kind === 'PlaceKeepout') {
      for (const comp of pcb.components) {
        if (ko.layer !== 'AllCopper' && ((comp.side === 'Top' && ko.layer !== 'TopCopper') || (comp.side === 'Bottom' && ko.layer !== 'BottomCopper'))) continue;
        if (pointInPolygon(comp, ko.points)) {
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

  // 10. Component courtyard overlap check (same side)
  for (let i = 0; i < pcb.components.length; i++) {
    const a = pcb.components[i];
    if (a.pads.every((p) => p.type === 'MountingHole')) continue;
    const ar = (a.angle * Math.PI) / 180;
    const aw = Math.abs(a.courtyard.width * Math.cos(ar)) + Math.abs(a.courtyard.height * Math.sin(ar));
    const ah = Math.abs(a.courtyard.width * Math.sin(ar)) + Math.abs(a.courtyard.height * Math.cos(ar));
    for (let j = i + 1; j < pcb.components.length; j++) {
      const b = pcb.components[j];
      if (a.side !== b.side || b.pads.every((p) => p.type === 'MountingHole')) continue;
      const br = (b.angle * Math.PI) / 180;
      const bw = Math.abs(b.courtyard.width * Math.cos(br)) + Math.abs(b.courtyard.height * Math.sin(br));
      const bh = Math.abs(b.courtyard.width * Math.sin(br)) + Math.abs(b.courtyard.height * Math.cos(br));
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
