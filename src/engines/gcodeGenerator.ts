import { PcbProject, Point2D } from '../core/types';
import { getWorldPads } from './drc';

export type GCodePostprocessor = 'GRBL' | 'Mach3' | 'LinuxCNC';

export interface GCodeOptions {
  postprocessor: GCodePostprocessor;
  spindleRpm: number;
  feedRateMmMin: number;
  plungeRateMmMin: number;
  safeZ: number;
  engraveDepth: number;
  cutDepth: number;
  cutPasses: number;
  toolDiameterMm: number;
  drillDiameterMm: number;
  millTopIsolation: boolean;
  millBottomIsolation: boolean;
  drillHoles: boolean;
  cutOutline: boolean;
  mirrorBottomX: boolean;
}

export const DEFAULT_GCODE_OPTIONS: GCodeOptions = {
  postprocessor: 'GRBL',
  spindleRpm: 12000,
  feedRateMmMin: 180,
  plungeRateMmMin: 60,
  safeZ: 3.0,
  engraveDepth: 0.12,
  cutDepth: 1.65,
  cutPasses: 3,
  toolDiameterMm: 0.3,
  drillDiameterMm: 0.8,
  millTopIsolation: true,
  millBottomIsolation: false,
  drillHoles: true,
  cutOutline: true,
  mirrorBottomX: true
};

export interface GCodeSegment {
  rapid: boolean;
  kind: 'isolation' | 'drill' | 'outline' | 'rapid';
  p1: Point2D;
  p2: Point2D;
}

export interface GCodeResult {
  gcode: string;
  segments: GCodeSegment[];
  stats: {
    lineCount: number;
    isolationLoops: number;
    drillCount: number;
    totalLengthMm: number;
    estimatedMinutes: number;
  };
}

function fmt(n: number): string {
  return n.toFixed(3);
}

/** Generates CNC G-code (.nc / .gcode) from PcbProject for GRBL / Mach3 / LinuxCNC PCB isolation milling, drilling, and board cutout. */
export function generatePcbGCode(pcb: PcbProject, opts: Partial<GCodeOptions> = {}): GCodeResult {
  const o: GCodeOptions = { ...DEFAULT_GCODE_OPTIONS, ...opts };
  const lines: string[] = [];
  const xs = pcb.boardOutline.map((p) => p.x);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 100;

  lines.push(`( ГОСТ-Трейс ЧПУ G-Code — Проект: ${pcb.projectName} )`);
  lines.push(`( Постпроцессор: ${o.postprocessor}, Фреза: ${o.toolDiameterMm} мм )`);
  lines.push(`G21`);
  lines.push(`G90`);
  lines.push(`G17`);
  if (o.postprocessor === 'LinuxCNC') lines.push(`G64 P0.02`);
  lines.push(`G00 Z${fmt(o.safeZ)}`);
  lines.push(`M03 S${Math.round(o.spindleRpm)}`);

  const segments: GCodeSegment[] = [];
  let cur: Point2D = { x: 0, y: 0 };
  let totalLengthMm = 0;
  let isolationLoops = 0;
  let drillCount = 0;

  const moveTo = (pt: Point2D, rapid: boolean, kind: GCodeSegment['kind']) => {
    const dx = pt.x - cur.x;
    const dy = pt.y - cur.y;
    totalLengthMm += Math.hypot(dx, dy);
    segments.push({ rapid, kind, p1: { ...cur }, p2: { ...pt } });
    cur = { ...pt };
  };

  const emitPath = (pts: Point2D[], depth: number, kind: 'isolation' | 'outline', closed = true, mirrorX = false) => {
    if (pts.length < 2) return;
    const mapped = pts.map((p) => ({
      x: mirrorX ? maxX + minX - p.x : p.x,
      y: p.y
    }));
    lines.push(`G00 X${fmt(mapped[0].x)} Y${fmt(mapped[0].y)}`);
    moveTo(mapped[0], true, 'rapid');
    lines.push(`G01 Z-${fmt(Math.abs(depth))} F${Math.round(o.plungeRateMmMin)}`);
    for (let i = 1; i < mapped.length; i++) {
      lines.push(`G01 X${fmt(mapped[i].x)} Y${fmt(mapped[i].y)} F${Math.round(o.feedRateMmMin)}`);
      moveTo(mapped[i], false, kind);
    }
    if (closed) {
      lines.push(`G01 X${fmt(mapped[0].x)} Y${fmt(mapped[0].y)} F${Math.round(o.feedRateMmMin)}`);
      moveTo(mapped[0], false, kind);
    }
    lines.push(`G00 Z${fmt(o.safeZ)}`);
  };

  const emitLoop = (pts: Point2D[], depth: number, kind: 'isolation' | 'outline', mirrorX = false) => {
    emitPath(pts, depth, kind, true, mirrorX);
  };

  const millCopperLayer = (copperLayer: 'TopCopper' | 'BottomCopper', mirrorX: boolean) => {
    const halfTool = o.toolDiameterMm / 2;
    lines.push(`( === Изоляционное фрезерование: ${copperLayer} === )`);

    const isConnectedEndpoint = (pt: Point2D, netName: string) => {
      if (!netName) return false;
      for (const wp of getWorldPads(pcb)) {
        if (wp.netName !== netName) continue;
        if (wp.effectiveLayer !== 'All' && wp.effectiveLayer !== copperLayer) continue;
        const padR = Math.max(wp.pad.width, wp.pad.height) * 0.75;
        if (Math.hypot(pt.x - wp.x, pt.y - wp.y) <= padR) return true;
      }
      for (const v of pcb.vias) {
        if (v.netName !== netName) continue;
        if (Math.hypot(pt.x - v.x, pt.y - v.y) <= v.outerDiameter * 0.6) return true;
      }
      return false;
    };

    // 1. Pad isolation boxes
    for (const wp of getWorldPads(pcb)) {
      if (wp.effectiveLayer !== 'All') {
        const onLayer =
          (copperLayer === 'TopCopper' && wp.effectiveLayer === 'TopCopper') ||
          (copperLayer === 'BottomCopper' && wp.effectiveLayer === 'BottomCopper');
        if (!onLayer) continue;
      }
      const rx = wp.pad.width / 2 + halfTool;
      const ry = wp.pad.height / 2 + halfTool;
      const rad = ((wp.padAngleDeg || 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rotatePt = (lx: number, ly: number) => ({
        x: wp.x + lx * cos - ly * sin,
        y: wp.y + lx * sin + ly * cos
      });

      const connectedTraces = pcb.traces.filter(
        (tr) =>
          tr.layer === copperLayer &&
          tr.netName &&
          tr.netName === wp.netName &&
          tr.points.some((p) => Math.hypot(p.x - wp.x, p.y - wp.y) <= Math.max(wp.pad.width, wp.pad.height) * 0.75)
      );

      if (connectedTraces.length === 0) {
        emitLoop(
          [
            rotatePt(-rx, -ry),
            rotatePt(rx, -ry),
            rotatePt(rx, ry),
            rotatePt(-rx, ry)
          ],
          o.engraveDepth,
          'isolation',
          mirrorX
        );
        isolationLoops++;
      }
    }

    // 2. Trace continuous contour isolation (isolates sides without severing trace joints)
    for (const tr of pcb.traces) {
      if (tr.layer !== copperLayer || tr.points.length < 2) continue;

      const pts: Point2D[] = [tr.points[0]];
      for (let i = 1; i < tr.points.length; i++) {
        const prev = pts[pts.length - 1];
        if (Math.hypot(tr.points[i].x - prev.x, tr.points[i].y - prev.y) > 0.001) {
          pts.push(tr.points[i]);
        }
      }
      if (pts.length < 2) continue;

      const off = tr.width / 2 + halfTool;
      const numSegs = pts.length - 1;

      const normals: Point2D[] = [];
      const dirVecs: Point2D[] = [];
      for (let i = 0; i < numSegs; i++) {
        const dx = pts[i + 1].x - pts[i].x;
        const dy = pts[i + 1].y - pts[i].y;
        const len = Math.hypot(dx, dy) || 1;
        dirVecs.push({ x: dx / len, y: dy / len });
        normals.push({ x: -dy / len, y: dx / len });
      }

      const leftPts: Point2D[] = [{
        x: pts[0].x + normals[0].x * off,
        y: pts[0].y + normals[0].y * off
      }];

      for (let i = 1; i < numSegs; i++) {
        const nPrev = normals[i - 1];
        const nCur = normals[i];
        const uPrev = dirVecs[i - 1];
        const uCur = dirVecs[i];
        const det = uPrev.x * uCur.y - uPrev.y * uCur.x;
        const v = pts[i];
        if (Math.abs(det) < 0.05) {
          leftPts.push({ x: v.x + nCur.x * off, y: v.y + nCur.y * off });
        } else {
          const p1x = v.x + nPrev.x * off;
          const p1y = v.y + nPrev.y * off;
          const p2x = v.x + nCur.x * off;
          const p2y = v.y + nCur.y * off;
          const s = ((p2x - p1x) * uCur.y - (p2y - p1y) * uCur.x) / det;
          const ix = p1x + s * uPrev.x;
          const iy = p1y + s * uPrev.y;
          const miterDist = Math.hypot(ix - v.x, iy - v.y);
          if (miterDist <= off * 2.5) {
            leftPts.push({ x: ix, y: iy });
          } else {
            leftPts.push({ x: p1x, y: p1y });
            leftPts.push({ x: p2x, y: p2y });
          }
        }
      }
      leftPts.push({
        x: pts[numSegs].x + normals[numSegs - 1].x * off,
        y: pts[numSegs].y + normals[numSegs - 1].y * off
      });

      const rightPts: Point2D[] = [{
        x: pts[numSegs].x - normals[numSegs - 1].x * off,
        y: pts[numSegs].y - normals[numSegs - 1].y * off
      }];

      for (let i = numSegs - 1; i >= 1; i--) {
        const nCur = normals[i];
        const nPrev = normals[i - 1];
        const uCur = dirVecs[i];
        const uPrev = dirVecs[i - 1];
        const det = uCur.x * uPrev.y - uCur.y * uPrev.x;
        const v = pts[i];
        if (Math.abs(det) < 0.05) {
          rightPts.push({ x: v.x - nPrev.x * off, y: v.y - nPrev.y * off });
        } else {
          const p1x = v.x - nCur.x * off;
          const p1y = v.y - nCur.y * off;
          const p2x = v.x - nPrev.x * off;
          const p2y = v.y - nPrev.y * off;
          const s = ((p2x - p1x) * (-uPrev.y) - (p2y - p1y) * (-uPrev.x)) / det;
          const ix = p1x + s * (-uCur.x);
          const iy = p1y + s * (-uCur.y);
          const miterDist = Math.hypot(ix - v.x, iy - v.y);
          if (miterDist <= off * 2.5) {
            rightPts.push({ x: ix, y: iy });
          } else {
            rightPts.push({ x: p1x, y: p1y });
            rightPts.push({ x: p2x, y: p2y });
          }
        }
      }
      rightPts.push({
        x: pts[0].x - normals[0].x * off,
        y: pts[0].y - normals[0].y * off
      });

      const startConnected = isConnectedEndpoint(pts[0], tr.netName);
      const endConnected = isConnectedEndpoint(pts[pts.length - 1], tr.netName);

      if (startConnected && endConnected) {
        emitPath(leftPts, o.engraveDepth, 'isolation', false, mirrorX);
        emitPath(rightPts, o.engraveDepth, 'isolation', false, mirrorX);
        isolationLoops += 2;
      } else if (!startConnected && !endConnected) {
        const lastU = dirVecs[numSegs - 1];
        const firstU = dirVecs[0];
        const endCap: Point2D[] = [
          { x: pts[numSegs].x + lastU.x * off + normals[numSegs - 1].x * off, y: pts[numSegs].y + lastU.y * off + normals[numSegs - 1].y * off },
          { x: pts[numSegs].x + lastU.x * off - normals[numSegs - 1].x * off, y: pts[numSegs].y + lastU.y * off - normals[numSegs - 1].y * off }
        ];
        const startCap: Point2D[] = [
          { x: pts[0].x - firstU.x * off - normals[0].x * off, y: pts[0].y - firstU.y * off - normals[0].x * off },
          { x: pts[0].x - firstU.x * off + normals[0].x * off, y: pts[0].y - firstU.y * off + normals[0].y * off }
        ];
        emitLoop([...leftPts, ...endCap, ...rightPts, ...startCap], o.engraveDepth, 'isolation', mirrorX);
        isolationLoops++;
      } else if (startConnected && !endConnected) {
        const lastU = dirVecs[numSegs - 1];
        const endCap: Point2D[] = [
          { x: pts[numSegs].x + lastU.x * off + normals[numSegs - 1].x * off, y: pts[numSegs].y + lastU.y * off + normals[numSegs - 1].y * off },
          { x: pts[numSegs].x + lastU.x * off - normals[numSegs - 1].x * off, y: pts[numSegs].y + lastU.y * off - normals[numSegs - 1].y * off }
        ];
        emitPath([...leftPts, ...endCap, ...rightPts], o.engraveDepth, 'isolation', false, mirrorX);
        isolationLoops++;
      } else {
        const firstU = dirVecs[0];
        const startCap: Point2D[] = [
          { x: pts[0].x - firstU.x * off - normals[0].x * off, y: pts[0].y - firstU.y * off - normals[0].x * off },
          { x: pts[0].x - firstU.x * off + normals[0].x * off, y: pts[0].y - firstU.y * off + normals[0].y * off }
        ];
        emitPath([...rightPts, ...startCap, ...leftPts], o.engraveDepth, 'isolation', false, mirrorX);
        isolationLoops++;
      }
    }
  };

  if (o.millTopIsolation) millCopperLayer('TopCopper', false);
  if (o.millBottomIsolation) millCopperLayer('BottomCopper', o.mirrorBottomX);

  if (o.drillHoles) {
    lines.push(`( === Сверловка отверстий === )`);
    const drills: { x: number; y: number; dia: number }[] = [];
    for (const wp of getWorldPads(pcb)) {
      if ((wp.pad.holeDiameter ?? 0) > 0) drills.push({ x: wp.x, y: wp.y, dia: wp.pad.holeDiameter! });
    }
    for (const v of pcb.vias) drills.push({ x: v.x, y: v.y, dia: v.holeDiameter });
    // Nearest-neighbor sort
    const sorted: typeof drills = [];
    let last = { x: cur.x, y: cur.y };
    const pool = [...drills];
    while (pool.length > 0) {
      let bestI = 0;
      let bestD = Infinity;
      for (let i = 0; i < pool.length; i++) {
        const d = Math.hypot(pool[i].x - last.x, pool[i].y - last.y);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      const next = pool.splice(bestI, 1)[0];
      sorted.push(next);
      last = next;
    }

    let lastDia = -1;
    let toolIdx = 1;
    for (const h of sorted) {
      if (lastDia !== -1 && Math.abs(h.dia - lastDia) > 0.05) {
        toolIdx++;
        lines.push(`G00 Z${fmt(Math.max(o.safeZ + 5, 10))}`);
        lines.push(`M05`);
        lines.push(`M00 ( СМЕНА СВЕРЛА: ${h.dia.toFixed(2)} мм )`);
        lines.push(`M06 T${toolIdx}`);
        lines.push(`M03 S${Math.round(o.spindleRpm)}`);
        lines.push(`G00 Z${fmt(o.safeZ)}`);
        lastDia = h.dia;
      } else if (lastDia === -1) {
        lines.push(`( Диаметр сверла: ${h.dia.toFixed(2)} мм )`);
        lastDia = h.dia;
      }
      const hx = o.millBottomIsolation && !o.millTopIsolation && o.mirrorBottomX ? maxX + minX - h.x : h.x;
      lines.push(`G00 X${fmt(hx)} Y${fmt(h.y)}`);
      moveTo({ x: hx, y: h.y }, true, 'rapid');
      lines.push(`G01 Z-${fmt(Math.abs(o.cutDepth))} F${Math.round(o.plungeRateMmMin)}`);
      lines.push(`G00 Z${fmt(o.safeZ)}`);
      segments.push({ rapid: false, kind: 'drill', p1: { x: hx, y: h.y }, p2: { x: hx, y: h.y } });
      drillCount++;
    }
  }

  if (o.cutOutline && pcb.boardOutline.length >= 3) {
    lines.push(`( === Обрезка контура платы === )`);
    const passes = Math.max(1, Math.round(o.cutPasses));
    for (let pass = 1; pass <= passes; pass++) {
      const z = (Math.abs(o.cutDepth) * pass) / passes;
      lines.push(`( Проход ${pass}/${passes}, Z=-${fmt(z)} )`);
      emitLoop(pcb.boardOutline, z, 'outline', o.millBottomIsolation && !o.millTopIsolation && o.mirrorBottomX);
    }
    for (const cut of pcb.cutouts) {
      if (cut.points.length < 3) continue;
      for (let pass = 1; pass <= passes; pass++) {
        const z = (Math.abs(o.cutDepth) * pass) / passes;
        emitLoop(cut.points, z, 'outline', o.millBottomIsolation && !o.millTopIsolation && o.mirrorBottomX);
      }
    }
  }

  lines.push(`M05`);
  lines.push(`G00 Z${fmt(o.safeZ)}`);
  lines.push(`G00 X0.000 Y0.000`);
  lines.push(`M02`);

  return {
    gcode: lines.join('\n'),
    segments,
    stats: {
      lineCount: lines.length,
      isolationLoops,
      drillCount,
      totalLengthMm: Math.round(totalLengthMm * 10) / 10,
      estimatedMinutes: Math.round(((totalLengthMm / Math.max(10, o.feedRateMmMin)) + drillCount * 0.04) * 10) / 10
    }
  };
}
