import { PcbProject, PcbTrace, PcbVia, Point2D } from '../core/types';
import { dist, pointInPolygon, pointToSegmentDist, polygonBounds, uid } from '../core/geometry';
import { computeUnroutedRatlines, getWorldPads } from './drc';

export interface AutorouterSettings {
  gridStepMm: number; // e.g., 0.5 or 0.635
  viaCost: number;
  bendCost: number;
  wrongDirCost: number;
  maxRipUpPasses: number;
  enableInnerLayers: boolean;
  simplify45Deg: boolean;
}

export const DEFAULT_AUTOROUTER_SETTINGS: AutorouterSettings = {
  gridStepMm: 0.4,
  viaCost: 14,
  bendCost: 3,
  wrongDirCost: 4,
  maxRipUpPasses: 2,
  enableInnerLayers: false,
  simplify45Deg: true
};

export interface AutorouterReport {
  routedConnections: number;
  failedConnections: number;
  addedTraces: number;
  addedVias: number;
  durationMs: number;
}

interface GridNode {
  g: number;
  f: number;
  idx: number;
  dir: number;
}

class MinHeap {
  private data: GridNode[] = [];
  get size() { return this.data.length; }
  push(n: GridNode) {
    this.data.push(n);
    let i = this.data.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.data[p].f <= this.data[i].f) break;
      [this.data[p], this.data[i]] = [this.data[i], this.data[p]];
      i = p;
    }
  }
  pop(): GridNode | undefined {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0 && last) {
      this.data[0] = last;
      let i = 0;
      const n = this.data.length;
      while (true) {
        let s = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && this.data[l].f < this.data[s].f) s = l;
        if (r < n && this.data[r].f < this.data[s].f) s = r;
        if (s === i) break;
        [this.data[i], this.data[s]] = [this.data[s], this.data[i]];
        i = s;
      }
    }
    return top;
  }
}

// Multi-layer Shape/Grid-aware A* Autorouter with layer preferred directions, obstacle clearance & 45-degree post-smoothing
export function runAutorouter(
  pcb: PcbProject,
  settings: AutorouterSettings = DEFAULT_AUTOROUTER_SETTINGS
): { pcb: PcbProject; report: AutorouterReport } {
  const t0 = performance.now();
  const next = structuredClone(pcb);
  const rules = next.designRules;
  const ratlines = computeUnroutedRatlines(next);

  if (ratlines.length === 0) {
    return {
      pcb: next,
      report: { routedConnections: 0, failedConnections: 0, addedTraces: 0, addedVias: 0, durationMs: 0 }
    };
  }

  const bounds =
    next.boardOutline.length >= 3
      ? polygonBounds(next.boardOutline)
      : { minX: -5, minY: -5, maxX: 110, maxY: 80 };

  const margin = Math.max(0.4, rules.clearanceCopperToBoard);
  const minX = bounds.minX + margin;
  const minY = bounds.minY + margin;
  const maxX = bounds.maxX - margin;
  const maxY = bounds.maxY - margin;

  // Adjust grid step so grid stays tractable (< 220x180 per layer) for sub-second routing
  const spanW = Math.max(10, maxX - minX);
  const spanH = Math.max(10, maxY - minY);
  const step = Math.max(settings.gridStepMm, spanW / 240, spanH / 180);
  const cols = Math.max(12, Math.floor(spanW / step) + 1);
  const rows = Math.max(12, Math.floor(spanH / step) + 1);

  const layers: ('TopCopper' | 'Inner1' | 'Inner2' | 'BottomCopper')[] =
    settings.enableInnerLayers && next.layerCount === 4
      ? ['TopCopper', 'Inner1', 'Inner2', 'BottomCopper']
      : ['TopCopper', 'BottomCopper'];
  const L = layers.length;

  const toGridX = (x: number) => Math.max(0, Math.min(cols - 1, Math.round((x - minX) / step)));
  const toGridY = (y: number) => Math.max(0, Math.min(rows - 1, Math.round((y - minY) / step)));
  const toWorldX = (cx: number) => minX + cx * step;
  const toWorldY = (cy: number) => minY + cy * step;

  // 0 = empty, >0 = netId, -1 = blocked, -2 = contested multi-net pad margin
  const cellNet = new Int32Array(L * rows * cols);
  const padOwner = new Int32Array(L * rows * cols);
  const netNames = Array.from(new Set(ratlines.map((r) => r.netName)));
  const netIdMap = new Map<string, number>();
  netNames.forEach((n, i) => netIdMap.set(n, i + 1));

  const getNetId = (name: string) => {
    if (!name) return -1;
    if (!netIdMap.has(name)) {
      netIdMap.set(name, netIdMap.size + 1);
    }
    return netIdMap.get(name)!;
  };

  const idxOf = (l: number, r: number, c: number) => (l * rows + r) * cols + c;

  const markCell = (idx: number, netId: number, overwriteOwned = true) => {
    const cur = cellNet[idx];
    if (padOwner[idx] > 0 && padOwner[idx] !== netId) return;
    if (cur === 0 || cur === netId) {
      cellNet[idx] = netId;
    } else if (!overwriteOwned && cur > 0 && cur !== netId) {
      cellNet[idx] = -2;
    } else {
      cellNet[idx] = -2;
    }
  };

  const paintCircle = (l: number, wx: number, wy: number, radMm: number, netId: number, overwriteOwned = true) => {
    const gc = toGridX(wx);
    const gr = toGridY(wy);
    const rCells = Math.ceil(radMm / step);
    for (let r = Math.max(0, gr - rCells); r <= Math.min(rows - 1, gr + rCells); r++) {
      for (let c = Math.max(0, gc - rCells); c <= Math.min(cols - 1, gc + rCells); c++) {
        if (Math.hypot(toWorldX(c) - wx, toWorldY(r) - wy) <= radMm) {
          markCell(idxOf(l, r, c), netId, overwriteOwned);
        }
      }
    }
  };

  const paintSegment = (l: number, a: Point2D, b: Point2D, radMm: number, netId: number) => {
    const segMinX = Math.min(a.x, b.x) - radMm;
    const segMaxX = Math.max(a.x, b.x) + radMm;
    const segMinY = Math.min(a.y, b.y) - radMm;
    const segMaxY = Math.max(a.y, b.y) + radMm;
    const c0 = toGridX(segMinX);
    const c1 = toGridX(segMaxX);
    const r0 = toGridY(segMinY);
    const r1 = toGridY(segMaxY);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (pointToSegmentDist({ x: toWorldX(c), y: toWorldY(r) }, a, b) <= radMm) {
          markCell(idxOf(l, r, c), netId, true);
        }
      }
    }
  };

  // Mask cells outside board outline, inside board cutouts, or inside keepout zones
  const routeKeepouts = next.keepouts.filter((k) => k.kind === 'RouteKeepout' && k.points.length >= 3);
  for (let r = 0; r < rows; r++) {
    const wy = toWorldY(r);
    for (let c = 0; c < cols; c++) {
      const wx = toWorldX(c);
      const pt = { x: wx, y: wy };
      const outOfBoard = next.boardOutline.length >= 3 && !pointInPolygon(pt, next.boardOutline);
      const inCutout = next.cutouts.some((cut) => cut.points.length >= 3 && pointInPolygon(pt, cut.points));
      if (outOfBoard || inCutout) {
        for (let l = 0; l < L; l++) cellNet[idxOf(l, r, c)] = -1;
        continue;
      }
      for (const ko of routeKeepouts) {
        if (!pointInPolygon(pt, ko.points)) continue;
        for (let l = 0; l < L; l++) {
          if (ko.layer === 'AllCopper' || ko.layer === layers[l]) cellNet[idxOf(l, r, c)] = -1;
        }
      }
    }
  }

  // Populate existing pads, traces, vias
  const worldPads = getWorldPads(next);
  const clearance = Math.max(rules.clearanceTraceToTrace, rules.clearanceTraceToPad);
  const traceW = rules.defaultTraceWidth || 0.25;
  const gridMargin = step * 0.58;

  for (const wp of worldPads) {
    const nid = getNetId(wp.netName);
    const gc = toGridX(wp.x);
    const gr = toGridY(wp.y);
    for (let l = 0; l < L; l++) {
      if (wp.effectiveLayer === 'All' || wp.effectiveLayer === layers[l]) {
        const cIdx = idxOf(l, gr, gc);
        padOwner[cIdx] = nid;
        cellNet[cIdx] = nid;
      }
    }
  }
  for (const wp of worldPads) {
    const nid = getNetId(wp.netName);
    const rad = wp.radius + traceW * 0.5 + clearance + gridMargin;
    for (let l = 0; l < L; l++) {
      if (wp.effectiveLayer === 'All' || wp.effectiveLayer === layers[l]) {
        paintCircle(l, wp.x, wp.y, rad, nid, false);
      }
    }
  }
  for (const tr of next.traces) {
    const li = layers.indexOf(tr.layer);
    if (li === -1) continue;
    const nid = getNetId(tr.netName);
    for (let k = 1; k < tr.points.length; k++) {
      paintSegment(li, tr.points[k - 1], tr.points[k], (tr.width + traceW) * 0.5 + clearance + gridMargin, nid);
    }
  }
  for (const via of next.vias) {
    const nid = getNetId(via.netName);
    for (let l = 0; l < L; l++) {
      paintCircle(l, via.x, via.y, via.outerDiameter * 0.5 + traceW * 0.5 + clearance + gridMargin, nid, false);
    }
  }

  // Sort shortest ratlines first (better routability)
  const ordered = [...ratlines].sort((a, b) => dist(a.from, a.to) - dist(b.from, b.to));

  let routedConnections = 0;
  let failedConnections = 0;
  let addedTraces = 0;
  let addedVias = 0;

  const totalCells = L * rows * cols;
  const gScore = new Float32Array(totalCells);
  const cameFrom = new Int32Array(totalCells);
  const dirFrom = new Int8Array(totalCells);
  const closed = new Uint8Array(totalCells);

  // 8 planar directions (dc, dr, cost)
  const dirs = [
    [1, 0, 1.0],
    [-1, 0, 1.0],
    [0, 1, 1.0],
    [0, -1, 1.0],
    [1, 1, 1.414],
    [1, -1, 1.414],
    [-1, 1, 1.414],
    [-1, -1, 1.414]
  ];

  const routeSingle = (startPt: Point2D, endPt: Point2D, netName: string, allowRipCost: boolean): boolean => {
    const nid = getNetId(netName);
    const sc = toGridX(startPt.x);
    const sr = toGridY(startPt.y);
    const tc = toGridX(endPt.x);
    const tr = toGridY(endPt.y);

    gScore.fill(1e9);
    cameFrom.fill(-1);
    dirFrom.fill(-1);
    closed.fill(0);

    const open = new MinHeap();
    // Seed start on allowed layers (check pad layer)
    const startPad = worldPads.find((p) => dist(p, startPt) < 0.5);
    const endPad = worldPads.find((p) => dist(p, endPt) < 0.5);

    const allowedLayersStart = startPad && startPad.effectiveLayer !== 'All'
      ? [layers.indexOf(startPad.effectiveLayer)].filter((x) => x >= 0)
      : layers.map((_, i) => i);
    const allowedLayersEnd = endPad && endPad.effectiveLayer !== 'All'
      ? new Set([layers.indexOf(endPad.effectiveLayer)].filter((x) => x >= 0))
      : new Set(layers.map((_, i) => i));

    for (const sl of allowedLayersStart) {
      const sIdx = idxOf(sl, sr, sc);
      gScore[sIdx] = 0;
      const h = Math.hypot(tc - sc, tr - sr);
      open.push({ g: 0, f: h, idx: sIdx, dir: -1 });
    }

    let goalIdx = -1;
    let expansions = 0;
    const maxExpansions = 45000;

    while (open.size > 0 && expansions < maxExpansions) {
      const cur = open.pop()!;
      if (closed[cur.idx]) continue;
      closed[cur.idx] = 1;
      expansions++;

      const cl = Math.floor(cur.idx / (rows * cols));
      const rem = cur.idx % (rows * cols);
      const cr = Math.floor(rem / cols);
      const cc = rem % cols;

      if (cc === tc && cr === tr && allowedLayersEnd.has(cl)) {
        goalIdx = cur.idx;
        break;
      }

      const layerPref = next.layers.find((ly) => ly.id === layers[cl])?.routingDirection ?? 'Any';

      // Planar neighbors
      for (let d = 0; d < 8; d++) {
        const nc = cc + dirs[d][0];
        const nr = cr + dirs[d][1];
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        const nIdx = idxOf(cl, nr, nc);
        if (closed[nIdx]) continue;

        const occ = cellNet[nIdx];
        const isGoalCell = nc === tc && nr === tr;
        if (occ !== 0 && occ !== nid && !isGoalCell) {
          // Never cross foreign nets or blocked regions — avoids short circuits on retries
          continue;
        }
        // Prevent diagonal moves from cutting corners of blocked or foreign-net cells
        if (dirs[d][0] !== 0 && dirs[d][1] !== 0 && !isGoalCell) {
          const occH = cellNet[idxOf(cl, cr, nc)];
          const occV = cellNet[idxOf(cl, nr, cc)];
          if ((occH !== 0 && occH !== nid) || (occV !== 0 && occV !== nid)) continue;
        }
        // Guard exact segment endpoints near start/end pads against foreign pad clearance violations
        const segA = (cc === sc && cr === sr) ? startPt : { x: toWorldX(cc), y: toWorldY(cr) };
        const segB = isGoalCell ? endPt : { x: toWorldX(nc), y: toWorldY(nr) };
        let clippedPad = false;
        for (let pi = 0; pi < worldPads.length; pi++) {
          const wp = worldPads[pi];
          if (wp.netName === netName) continue;
          if (wp.effectiveLayer !== 'All' && wp.effectiveLayer !== layers[cl]) continue;
          if (pointToSegmentDist(wp, segA, segB) < wp.radius + traceW * 0.5 + clearance + 0.02) {
            clippedPad = true;
            break;
          }
        }
        if (clippedPad) continue;

        let stepCost = dirs[d][2];
        const effWrongCost = allowRipCost ? settings.wrongDirCost * 0.25 : settings.wrongDirCost;
        const effBendCost = allowRipCost ? settings.bendCost * 0.35 : settings.bendCost;
        if (layerPref === 'Horizontal' && dirs[d][1] !== 0) stepCost += effWrongCost * 0.25;
        if (layerPref === 'Vertical' && dirs[d][0] !== 0) stepCost += effWrongCost * 0.25;
        if (cur.dir !== -1 && cur.dir !== d && cur.dir < 8) stepCost += effBendCost * 0.3;

        const ng = cur.g + stepCost;
        if (ng < gScore[nIdx]) {
          gScore[nIdx] = ng;
          cameFrom[nIdx] = cur.idx;
          dirFrom[nIdx] = d;
          const h = Math.hypot(tc - nc, tr - nr) * 1.05;
          open.push({ g: ng, f: ng + h, idx: nIdx, dir: d });
        }
      }

      // Layer change (Via) — also check full via annular radius against foreign copper and ViaKeepout
      if (L > 1) {
        const curOcc = cellNet[cur.idx];
        const nearStart = Math.hypot(cc - sc, cr - sr) < 2;
        const nearEnd = Math.hypot(cc - tc, cr - tr) < 2;
        const vwx = toWorldX(cc);
        const vwy = toWorldY(cr);
        const viaKeepoutHit = next.keepouts.some(
          (k) => k.kind === 'RouteKeepout' && k.points.length >= 3 && pointInPolygon({ x: vwx, y: vwy }, k.points)
        );
        const viaR = Math.max(rules.minViaOuter, rules.minViaHole + rules.minAnnularRing * 2) * 0.5 + rules.clearanceViaToAny;
        const viaClear = !viaKeepoutHit && !next.traces.some(
          (trOther) =>
            trOther.netName !== netName &&
            trOther.points.some((pt, k) => k > 0 && pointToSegmentDist({ x: vwx, y: vwy }, trOther.points[k - 1], pt) < viaR + trOther.width * 0.5)
        );
        if (!nearStart && !nearEnd && viaClear && (curOcc === 0 || curOcc === nid)) {
          for (let nl = 0; nl < L; nl++) {
            if (nl === cl) continue;
            const nIdx = idxOf(nl, cr, cc);
            if (closed[nIdx]) continue;
            const occ = cellNet[nIdx];
            if (occ !== 0 && occ !== nid) continue;
            const effViaCost = allowRipCost ? Math.max(2, settings.viaCost * 0.4) : settings.viaCost;
            const ng = cur.g + effViaCost;
            if (ng < gScore[nIdx]) {
              gScore[nIdx] = ng;
              cameFrom[nIdx] = cur.idx;
              dirFrom[nIdx] = 8;
              const h = Math.hypot(tc - cc, tr - cr) * 1.05;
              open.push({ g: ng, f: ng + h, idx: nIdx, dir: 8 });
            }
          }
        }
      }
    }

    if (goalIdx === -1) return false;

    // Reconstruct path grouped by layer
    const pathNodes: { l: number; r: number; c: number }[] = [];
    let curr = goalIdx;
    while (curr !== -1) {
      const l = Math.floor(curr / (rows * cols));
      const rem = curr % (rows * cols);
      const r = Math.floor(rem / cols);
      const c = rem % cols;
      pathNodes.push({ l, r, c });
      curr = cameFrom[curr];
    }
    pathNodes.reverse();

    // Group contiguous segments on same layer, inserting Vias on layer switches
    let segPts: Point2D[] = [];
    let segLayer = pathNodes[0].l;

    const flushSegment = (pts: Point2D[], layerIdx: number) => {
      if (pts.length < 2) return;
      const simplified = settings.simplify45Deg ? simplifyCollinear(pts) : pts;
      const netClsId = next.netClassAssignments[netName];
      const netCls = next.netClasses.find((nc) => nc.id === netClsId);
      const w = netCls?.traceWidth ?? traceW;
      const trace: PcbTrace = {
        id: uid('tr'),
        layer: layers[layerIdx],
        netName,
        points: simplified,
        width: w
      };
      next.traces.push(trace);
      addedTraces++;
      for (let k = 1; k < simplified.length; k++) {
        paintSegment(layerIdx, simplified[k - 1], simplified[k], (w + traceW) * 0.5 + clearance + gridMargin, nid);
      }
    };

    pathNodes.forEach((node, idx) => {
      const wx = idx === 0 ? startPt.x : idx === pathNodes.length - 1 ? endPt.x : toWorldX(node.c);
      const wy = idx === 0 ? startPt.y : idx === pathNodes.length - 1 ? endPt.y : toWorldY(node.r);
      const pt = { x: Number(wx.toFixed(3)), y: Number(wy.toFixed(3)) };

      if (node.l !== segLayer) {
        const viaPt = segPts[segPts.length - 1] ?? pt;
        flushSegment([...segPts, viaPt], segLayer);
        const via: PcbVia = {
          id: uid('via'),
          x: viaPt.x,
          y: viaPt.y,
          netName,
          outerDiameter: Math.max(rules.minViaOuter, rules.minViaHole + rules.minAnnularRing * 2),
          holeDiameter: rules.minViaHole,
          startLayer: 'TopCopper',
          endLayer: 'BottomCopper',
          viaStyle: 'Through'
        };
        next.vias.push(via);
        addedVias++;
        for (let l = 0; l < L; l++) paintCircle(l, via.x, via.y, via.outerDiameter * 0.5 + traceW * 0.5 + clearance + gridMargin, nid, false);
        segLayer = node.l;
        segPts = [viaPt];
      } else {
        segPts.push(pt);
      }
    });
    flushSegment(segPts, segLayer);
    return true;
  };

  const failedRats: typeof ordered = [];
  for (const rat of ordered) {
    const ok = routeSingle(rat.from, rat.to, rat.netName, false);
    if (ok) {
      routedConnections++;
    } else {
      failedRats.push(rat);
    }
  }

  // Pass 2: Negotiated Rip-Up retry on inner-via cost relaxation for any blocked nets
  let retryFailed = 0;
  for (const rat of failedRats) {
    const ok = routeSingle(rat.from, rat.to, rat.netName, true);
    if (ok) {
      routedConnections++;
    } else {
      retryFailed++;
    }
  }
  failedConnections = retryFailed;

  return {
    pcb: next,
    report: {
      routedConnections,
      failedConnections,
      addedTraces,
      addedVias,
      durationMs: Math.round(performance.now() - t0)
    }
  };
}

// Export PCB to Specctra Design Format (.dsn) for FreeRouting interoperability
export function exportSpecctraDsn(pcb: PcbProject): string {
  const b = pcb.boardOutline.length >= 3 ? polygonBounds(pcb.boardOutline) : { minX: 0, minY: 0, maxX: 90, maxY: 60 };
  const wires = pcb.traces
    .map((tr) => `    (wire (path ${tr.layer === 'BottomCopper' ? 'Bottom' : 'Top'} ${tr.width.toFixed(3)} ${tr.points.map((p) => `${p.x.toFixed(3)} ${(-p.y).toFixed(3)}`).join(' ')}) (net "${tr.netName}"))`)
    .join('\n');
  const nets = Array.from(new Set(getWorldPads(pcb).map((wp) => wp.netName).filter(Boolean)))
    .map((net) => {
      const pins = getWorldPads(pcb)
        .filter((wp) => wp.netName === net)
        .map((wp) => `${wp.refDes}-${wp.pad.number}`)
        .join(' ');
      return `    (net "${net}" (pins ${pins}))`;
    })
    .join('\n');
  return [
    `(pcb "${pcb.projectName || 'board'}.dsn"`,
    `  (parser (string_quote ") (space_in_quoted_tokens on) (host_cad "GOSTTrace EDA") (host_version "2.0"))`,
    `  (resolution mm 1000)`,
    `  (structure`,
    `    (layer Top (type signal))`,
    `    (layer Bottom (type signal))`,
    `    (boundary (rect pcb ${b.minX} ${-b.maxY} ${b.maxX} ${-b.minY}))`,
    `    (rule (width ${pcb.designRules.defaultTraceWidth}) (clearance ${pcb.designRules.clearanceTraceToTrace}))`,
    `  )`,
    `  (network\n${nets}\n  )`,
    `  (wiring\n${wires}\n  )`,
    `)`
  ].join('\n');
}

// Import Specctra Session (.ses) routed wires back into PCB
export function importSpecctraSes(pcb: PcbProject, sesText: string): { pcb: PcbProject; addedTraces: number } {
  const next = structuredClone(pcb);
  let addedTraces = 0;
  const netBlocks = Array.from(sesText.matchAll(/\(net\s+"?([^"\s)]+)"?([\s\S]*?)(?=\n\s*\(net\s+|\n\s*\)\s*$)/g));
  for (const nb of netBlocks) {
    const netName = nb[1];
    const body = nb[2];
    const wireMatches = Array.from(body.matchAll(/\(path\s+(\S+)\s+([\d.]+)\s+([\d.\s-]+)\)/g));
    for (const wm of wireMatches) {
      const layerName = wm[1].toLowerCase().includes('bot') ? 'BottomCopper' : 'TopCopper';
      const width = Math.max(next.designRules.minTraceWidth, parseFloat(wm[2]) || next.designRules.defaultTraceWidth);
      const coords = wm[3].trim().split(/\s+/).map(Number);
      const pts: Point2D[] = [];
      for (let i = 0; i + 1 < coords.length; i += 2) {
        if (isFinite(coords[i]) && isFinite(coords[i + 1])) {
          pts.push({ x: Number(coords[i].toFixed(3)), y: Number((-coords[i + 1]).toFixed(3)) });
        }
      }
      if (pts.length >= 2) {
        next.traces.push({ id: uid('ses'), layer: layerName, netName, points: pts, width });
        addedTraces++;
      }
    }
  }
  return { pcb: next, addedTraces };
}

function simplifyCollinear(pts: Point2D[]): Point2D[] {
  if (pts.length <= 2) return pts;
  const out: Point2D[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const dx1 = b.x - a.x;
    const dy1 = b.y - a.y;
    const dx2 = c.x - b.x;
    const dy2 = c.y - b.y;
    // Remove collinear points
    if (Math.abs(dx1 * dy2 - dy1 * dx2) < 1e-4 && dx1 * dx2 + dy1 * dy2 >= 0) {
      continue;
    }
    out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Meander generator (Змейка / выравнивание длины дорожки)
export function applyMeanderToTrace(
  trace: PcbTrace,
  targetAdditionalLengthMm: number,
  amplitudeMm = 1.5,
  pitchMm = 1.0
): PcbTrace {
  if (trace.points.length < 2 || targetAdditionalLengthMm <= 0.1) return trace;
  // Find longest straight horizontal or vertical segment
  let bestIdx = 0;
  let bestLen = 0;
  for (let i = 0; i < trace.points.length - 1; i++) {
    const len = dist(trace.points[i], trace.points[i + 1]);
    if (len > bestLen) {
      bestLen = len;
      bestIdx = i;
    }
  }
  if (bestLen < pitchMm * 2) return trace;

  const p0 = trace.points[bestIdx];
  const p1 = trace.points[bestIdx + 1];
  const ux = (p1.x - p0.x) / bestLen;
  const uy = (p1.y - p0.y) / bestLen;
  const nx = -uy;
  const ny = ux;

  // Each U-bump adds roughly 2 * amplitudeMm
  const numBumps = Math.max(1, Math.min(Math.floor((bestLen * 0.7) / pitchMm), Math.ceil(targetAdditionalLengthMm / (2 * amplitudeMm))));
  const bumpAmp = Math.min(amplitudeMm, Math.max(0.4, targetAdditionalLengthMm / (2 * numBumps)));
  const startOffset = (bestLen - numBumps * pitchMm) * 0.5;

  const meanderPts: Point2D[] = [];
  for (let i = 0; i < numBumps; i++) {
    const sA = startOffset + i * pitchMm;
    const sB = sA + pitchMm * 0.5;
    const sign = i % 2 === 0 ? 1 : -1;
    meanderPts.push({ x: p0.x + ux * sA, y: p0.y + uy * sA });
    meanderPts.push({ x: p0.x + ux * sA + nx * bumpAmp * sign, y: p0.y + uy * sA + ny * bumpAmp * sign });
    meanderPts.push({ x: p0.x + ux * sB + nx * bumpAmp * sign, y: p0.y + uy * sB + ny * bumpAmp * sign });
    meanderPts.push({ x: p0.x + ux * sB, y: p0.y + uy * sB });
  }

  return {
    ...trace,
    points: [
      ...trace.points.slice(0, bestIdx + 1),
      ...meanderPts,
      ...trace.points.slice(bestIdx + 1)
    ]
  };
}
