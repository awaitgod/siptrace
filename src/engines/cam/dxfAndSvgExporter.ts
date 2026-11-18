import { PcbProject } from '../../core/types';
import { getWorldPads } from '../drc';
import { isViaOnCamLayer } from './camCommon';

export interface DxfExportOptions {
  units?: 'mm' | 'in';
  scale?: number;
  layers?: {
    outline?: boolean;
    cutouts?: boolean;
    drills?: boolean;
    topCopper?: boolean;
    bottomCopper?: boolean;
    topSilk?: boolean;
    bottomSilk?: boolean;
  };
}

/** Exports PCB geometry to AutoCAD DXF R12/R2000 format with selectable CAM layers, units, and scale. */
export function exportPcbDxf(pcb: PcbProject, options?: DxfExportOptions): string {
  if (options) {
    const units = options.units === 'in' ? 'in' : 'mm';
    const unitScale = (options.scale ?? 1) * (units === 'in' ? 1 / 25.4 : 1);
    const L = {
      outline: options.layers?.outline ?? true,
      cutouts: options.layers?.cutouts ?? true,
      drills: options.layers?.drills ?? true,
      topCopper: options.layers?.topCopper ?? true,
      bottomCopper: options.layers?.bottomCopper ?? false,
      topSilk: options.layers?.topSilk ?? false,
      bottomSilk: options.layers?.bottomSilk ?? false
    };
    const ent: string[] = [];
    const addLine = (layer: string, x1: number, y1: number, x2: number, y2: number) => {
      ent.push(
        `0\nLINE\n8\n${layer}\n10\n${(x1 * unitScale).toFixed(4)}\n20\n${(-y1 * unitScale).toFixed(4)}\n30\n0.0\n11\n${(x2 * unitScale).toFixed(4)}\n21\n${(-y2 * unitScale).toFixed(4)}\n31\n0.0`
      );
    };
    const addCircle = (layer: string, x: number, y: number, r: number) => {
      ent.push(
        `0\nCIRCLE\n8\n${layer}\n10\n${(x * unitScale).toFixed(4)}\n20\n${(-y * unitScale).toFixed(4)}\n30\n0.0\n40\n${(r * unitScale).toFixed(4)}`
      );
    };
    if (L.outline && pcb.boardOutline.length >= 2) {
      for (let i = 0; i < pcb.boardOutline.length; i++) {
        const a = pcb.boardOutline[i];
        const b = pcb.boardOutline[(i + 1) % pcb.boardOutline.length];
        addLine('BOARD_OUTLINE', a.x, a.y, b.x, b.y);
      }
    }
    if (L.cutouts) {
      for (const cut of pcb.cutouts) {
        for (let i = 0; i < cut.points.length; i++) {
          const a = cut.points[i];
          const b = cut.points[(i + 1) % cut.points.length];
          addLine('CUTOUTS', a.x, a.y, b.x, b.y);
        }
      }
    }
    if (L.drills) {
      for (const wp of getWorldPads(pcb)) {
        if ((wp.pad.holeDiameter ?? 0) > 0) addCircle('DRILL', wp.x, wp.y, wp.pad.holeDiameter! / 2);
      }
      for (const v of pcb.vias) addCircle('DRILL', v.x, v.y, v.holeDiameter / 2);
    }
    for (const tr of pcb.traces) {
      if ((tr.layer === 'TopCopper' && L.topCopper) || (tr.layer === 'BottomCopper' && L.bottomCopper)) {
        const lay = tr.layer === 'BottomCopper' ? 'BOTTOM_COPPER' : 'TOP_COPPER';
        for (let i = 0; i < tr.points.length - 1; i++) {
          addLine(lay, tr.points[i].x, tr.points[i].y, tr.points[i + 1].x, tr.points[i + 1].y);
        }
      }
    }
    for (const wp of getWorldPads(pcb)) {
      const hasTop = L.topCopper && (wp.effectiveLayer === 'All' || wp.effectiveLayer === 'TopCopper');
      const hasBot = L.bottomCopper && (wp.effectiveLayer === 'All' || wp.effectiveLayer === 'BottomCopper');
      if (!hasTop && !hasBot) continue;
      const lay = hasTop ? 'TOP_COPPER' : 'BOTTOM_COPPER';
      addCircle(lay, wp.x, wp.y, Math.min(wp.pad.width, wp.pad.height) / 2);
    }
    if (L.topSilk || L.bottomSilk) {
      for (const sh of pcb.shapes) {
        if ((sh.layer === 'TopSilk' && L.topSilk) || (sh.layer === 'BottomSilk' && L.bottomSilk)) {
          if (sh.type === 'line' && sh.x2 !== undefined && sh.y2 !== undefined) {
            addLine(sh.layer.toUpperCase(), sh.x1, sh.y1, sh.x2, sh.y2);
          }
        }
      }
    }
    const insUnits = units === 'in' ? 1 : 4;
    return `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n${insUnits}\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${ent.join('\n')}\n0\nENDSEC\n0\nEOF`;
  }

  const entities: string[] = [];
  const addLine = (layer: string, x1: number, y1: number, x2: number, y2: number) => {
    entities.push(`0\nLINE\n8\n${layer}\n10\n${x1.toFixed(4)}\n20\n${(-y1).toFixed(4)}\n11\n${x2.toFixed(4)}\n21\n${(-y2).toFixed(4)}`);
  };
  const addCircle = (layer: string, cx: number, cy: number, r: number) => {
    entities.push(`0\nCIRCLE\n8\n${layer}\n10\n${cx.toFixed(4)}\n20\n${(-cy).toFixed(4)}\n40\n${r.toFixed(4)}`);
  };

  for (let i = 0; i < pcb.boardOutline.length; i++) {
    const a = pcb.boardOutline[i];
    const b = pcb.boardOutline[(i + 1) % pcb.boardOutline.length];
    addLine('BOARD_OUTLINE', a.x, a.y, b.x, b.y);
  }
  for (const cut of pcb.cutouts) {
    for (let i = 0; i < cut.points.length; i++) {
      const a = cut.points[i];
      const b = cut.points[(i + 1) % cut.points.length];
      addLine('BOARD_CUTOUT', a.x, a.y, b.x, b.y);
    }
  }
  for (const tr of pcb.traces) {
    for (let i = 1; i < tr.points.length; i++) {
      addLine(tr.layer.toUpperCase(), tr.points[i - 1].x, tr.points[i - 1].y, tr.points[i].x, tr.points[i].y);
    }
  }
  for (const wp of getWorldPads(pcb)) {
    if ((wp.pad.holeDiameter ?? 0) > 0) addCircle('DRILL', wp.x, wp.y, wp.pad.holeDiameter! * 0.5);
  }
  for (const v of pcb.vias) addCircle('DRILL', v.x, v.y, v.holeDiameter * 0.5);

  return `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities.join('\n')}\n0\nENDSEC\n0\nEOF`;
}

/** Exports 1:1 Photomask / ЛУТ SVG with full pad rotation and cutouts. */
export function exportPcbSvg1to1(pcb: PcbProject, copperLayer: 'TopCopper' | 'BottomCopper', mirrorX: boolean): string {
  const xs = pcb.boardOutline.map((p) => p.x);
  const ys = pcb.boardOutline.map((p) => p.y);
  const minX = xs.length ? Math.min(...xs) - 2 : -5;
  const minY = ys.length ? Math.min(...ys) - 2 : -5;
  const maxX = xs.length ? Math.max(...xs) + 2 : 105;
  const maxY = ys.length ? Math.max(...ys) + 2 : 75;
  const w = maxX - minX;
  const h = maxY - minY;

  const els: string[] = [];
  if (pcb.boardOutline.length >= 3) {
    els.push(`<polygon points="${pcb.boardOutline.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#000" stroke-width="0.25" />`);
  }
  for (const cut of pcb.cutouts) {
    if (cut.points.length >= 3) {
      els.push(`<polygon points="${cut.points.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#000" stroke-width="0.25" />`);
    }
  }
  for (const pour of pcb.copperPours) {
    if (pour.layer === copperLayer && pour.poured && pour.computedIslands) {
      for (const isl of pour.computedIslands) {
        els.push(`<polygon points="${isl.outer.map((p) => `${p.x},${p.y}`).join(' ')}" fill="#000" stroke="none" />`);
      }
    }
  }
  for (const tr of pcb.traces) {
    if (tr.layer !== copperLayer || tr.points.length < 2) continue;
    els.push(`<polyline points="${tr.points.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#000" stroke-width="${tr.width}" stroke-linecap="round" stroke-linejoin="round" />`);
  }
  for (const wp of getWorldPads(pcb)) {
    if (wp.effectiveLayer !== 'All' && wp.effectiveLayer !== copperLayer) continue;
    if (wp.pad.shape === 'Round') {
      els.push(`<circle cx="${wp.x}" cy="${wp.y}" r="${wp.pad.width / 2}" fill="#000" />`);
    } else if (wp.pad.shape === 'Oval') {
      els.push(`<ellipse cx="${wp.x}" cy="${wp.y}" rx="${wp.pad.width / 2}" ry="${wp.pad.height / 2}" transform="rotate(${wp.padAngleDeg} ${wp.x} ${wp.y})" fill="#000" />`);
    } else {
      els.push(`<rect x="${wp.x - wp.pad.width / 2}" y="${wp.y - wp.pad.height / 2}" width="${wp.pad.width}" height="${wp.pad.height}" rx="${wp.pad.cornerRadius ?? 0}" transform="rotate(${wp.padAngleDeg} ${wp.x} ${wp.y})" fill="#000" />`);
    }
    if ((wp.pad.holeDiameter ?? 0) > 0) {
      els.push(`<circle cx="${wp.x}" cy="${wp.y}" r="${wp.pad.holeDiameter! / 2}" fill="#fff" />`);
    }
  }
  for (const v of pcb.vias) {
    if (!isViaOnCamLayer(v, copperLayer, pcb.layerCount)) continue;
    els.push(`<circle cx="${v.x}" cy="${v.y}" r="${v.outerDiameter / 2}" fill="#000" />`);
    els.push(`<circle cx="${v.x}" cy="${v.y}" r="${v.holeDiameter / 2}" fill="#fff" />`);
  }

  const transform = mirrorX ? `translate(${minX + maxX}, 0) scale(-1, 1)` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="${minX} ${minY} ${w} ${h}" style="background:#fff">
  <g transform="${transform}">${els.join('\n  ')}</g>
</svg>`;
}
