import { PcbLayerId, PcbProject } from '../../../../core/types';
import { transformPoint } from '../../../../core/geometry';
import { PcbViewport } from '../types';
import { LayerLookup } from './drawBoardAndKeepouts';

function drawCompGraphicPrimitive(
  ctx: CanvasRenderingContext2D,
  g: PcbProject['components'][number]['graphics'][number],
  comp: PcbProject['components'][number],
  mirror: boolean
): void {
  ctx.lineWidth = Math.max(0.12, 'width' in g ? g.width : 0.15);
  if (g.type === 'line') {
    const a = transformPoint(g.x1, g.y1, comp.x, comp.y, comp.angle, mirror, false);
    const b = transformPoint(g.x2, g.y2, comp.x, comp.y, comp.angle, mirror, false);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  } else if (g.type === 'rect') {
    const p1 = transformPoint(g.x, g.y, comp.x, comp.y, comp.angle, mirror, false);
    const p2 = transformPoint(g.x + g.w, g.y, comp.x, comp.y, comp.angle, mirror, false);
    const p3 = transformPoint(g.x + g.w, g.y + g.h, comp.x, comp.y, comp.angle, mirror, false);
    const p4 = transformPoint(g.x, g.y + g.h, comp.x, comp.y, comp.angle, mirror, false);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    if (g.fill) ctx.fill();
    else ctx.stroke();
  } else if (g.type === 'circle') {
    const c = transformPoint(g.cx, g.cy, comp.x, comp.y, comp.angle, mirror, false);
    ctx.beginPath(); ctx.arc(c.x, c.y, g.r, 0, Math.PI * 2);
    if (g.fill) ctx.fill();
    else ctx.stroke();
  } else if (g.type === 'arc') {
    const c = transformPoint(g.cx, g.cy, comp.x, comp.y, comp.angle, mirror, false);
    const rotRad = (comp.angle * Math.PI) / 180;
    const a0 = (g.startAngle * Math.PI) / 180;
    const a1 = (g.endAngle * Math.PI) / 180;
    const p0 = { x: mirror ? -Math.cos(a0) : Math.cos(a0), y: Math.sin(a0) };
    const p1 = { x: mirror ? -Math.cos(a1) : Math.cos(a1), y: Math.sin(a1) };
    const sAng = Math.atan2(p0.y, p0.x) + rotRad;
    const eAng = Math.atan2(p1.y, p1.x) + rotRad;
    ctx.beginPath();
    ctx.arc(c.x, c.y, g.r, sAng, eAng, mirror);
    ctx.stroke();
  } else if (g.type === 'polyline' && g.points.length >= 2) {
    ctx.beginPath();
    const first = transformPoint(g.points[0].x, g.points[0].y, comp.x, comp.y, comp.angle, mirror, false);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < g.points.length; i++) {
      const pt = transformPoint(g.points[i].x, g.points[i].y, comp.x, comp.y, comp.angle, mirror, false);
      ctx.lineTo(pt.x, pt.y);
    }
    if (g.closed) ctx.closePath();
    ctx.stroke();
  } else if (g.type === 'text') {
    const pt = transformPoint(g.x, g.y, comp.x, comp.y, comp.angle, mirror, false);
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.font = `${Math.max(0.8, g.size || 1.2)}px "Segoe UI", Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(g.text, 0, 0);
    ctx.restore();
  }
}

/** Draws PCB component courtyards, silkscreen, assembly, mask, paste layers, pads, drill holes, and RefDes labels. */
export function drawPcbComponents(
  ctx: CanvasRenderingContext2D,
  pcb: PcbProject,
  viewport: PcbViewport,
  layers: LayerLookup,
  selectedCompId: string | null,
  highlightedNet: string | null
): void {
  for (const comp of pcb.components) {
    const mirror = comp.side === 'Bottom';
    const isSel = comp.id === selectedCompId;
    const silkLayer: PcbLayerId = comp.side === 'Top' ? 'TopSilk' : 'BottomSilk';

    // Courtyard
    if (layers.isVisible('Courtyard')) {
      ctx.save();
      ctx.translate(comp.x, comp.y);
      ctx.rotate((comp.angle * Math.PI) / 180);
      ctx.strokeStyle = isSel ? '#00FFFF' : '#555555';
      ctx.lineWidth = 0.12;
      ctx.setLineDash([0.6, 0.4]);
      ctx.strokeRect(-comp.courtyard.width / 2, -comp.courtyard.height / 2, comp.courtyard.width, comp.courtyard.height);
      ctx.restore();
    }

    // Assembly graphics (TopAssembly)
    if (layers.isVisible('TopAssembly')) {
      ctx.strokeStyle = isSel ? '#00FFFF' : layers.getColor('TopAssembly', '#FFCC00');
      ctx.fillStyle = isSel ? '#00FFFF' : layers.getColor('TopAssembly', '#FFCC00');
      for (const g of comp.graphics) {
        if (g.layer !== 'TopAssembly') continue;
        drawCompGraphicPrimitive(ctx, g, comp, mirror);
      }
    }

    // Silkscreen graphics
    if (layers.isVisible(silkLayer)) {
      ctx.strokeStyle = isSel ? '#FFFF44' : layers.getColor(silkLayer, '#FFFFFF');
      ctx.fillStyle = isSel ? '#FFFF44' : layers.getColor(silkLayer, '#FFFFFF');
      for (const g of comp.graphics) {
        if (g.layer !== 'TopSilk' && g.layer !== 'Courtyard') continue;
        if (g.layer === 'Courtyard' && !layers.isVisible('Courtyard')) continue;
        drawCompGraphicPrimitive(ctx, g, comp, mirror);
      }
    }

    // Pads & holes + Mask / Paste openings
    for (const pad of comp.pads) {
      const isTht = pad.type === 'THT' || pad.type === 'MountingHole';
      const padLayer: PcbLayerId = isTht ? 'TopCopper' : comp.side === 'Top' ? 'TopCopper' : 'BottomCopper';
      const showMaskTop = layers.isVisible('TopMask') && (isTht || comp.side === 'Top');
      const showMaskBot = layers.isVisible('BottomMask') && (isTht || comp.side === 'Bottom');
      const pasteLayer: PcbLayerId = comp.side === 'Top' ? 'TopPaste' : 'BottomPaste';
      const showPaste = !isTht && layers.isVisible(pasteLayer);
      const showCopper = isTht
        ? layers.isVisible('TopCopper') || layers.isVisible('BottomCopper')
        : layers.isVisible(padLayer);

      if (!showCopper && !showMaskTop && !showMaskBot && !showPaste) continue;
      const pt = transformPoint(pad.x, pad.y, comp.x, comp.y, comp.angle, mirror, false);
      const net = comp.padNets[pad.number] ?? '';
      const isNetHi = highlightedNet && net === highlightedNet;

      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate((((mirror ? -comp.angle : comp.angle) + (pad.angle ?? 0)) * Math.PI) / 180);

      // Solder Mask expansion (+0.08 mm each side)
      if (showMaskTop || showMaskBot) {
        const exp = 0.16;
        ctx.fillStyle = showMaskTop ? 'rgba(153, 51, 170, 0.35)' : 'rgba(102, 34, 136, 0.35)';
        ctx.strokeStyle = layers.getColor(showMaskTop ? 'TopMask' : 'BottomMask', '#9933AA');
        ctx.lineWidth = 0.08;
        if (pad.shape === 'Round') {
          ctx.beginPath(); ctx.arc(0, 0, (pad.width + exp) / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        } else if (pad.shape === 'Oval') {
          ctx.beginPath(); ctx.ellipse(0, 0, (pad.width + exp) / 2, (pad.height + exp) / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        } else {
          ctx.fillRect(-(pad.width + exp) / 2, -(pad.height + exp) / 2, pad.width + exp, pad.height + exp);
          ctx.strokeRect(-(pad.width + exp) / 2, -(pad.height + exp) / 2, pad.width + exp, pad.height + exp);
        }
      }

      if (showCopper) {
        ctx.fillStyle = isNetHi ? '#FFFF00' : isSel ? '#66EEFF' : isTht ? '#22CC55' : layers.getColor(padLayer, '#FF3030');

        if (pad.shape === 'Round') {
          ctx.beginPath(); ctx.arc(0, 0, pad.width / 2, 0, Math.PI * 2); ctx.fill();
        } else if (pad.shape === 'Oval') {
          const rx = pad.width / 2, ry = pad.height / 2;
          ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillRect(-pad.width / 2, -pad.height / 2, pad.width, pad.height);
        }
      }

      // Solder Paste stencil aperture (~85% of SMD pad area)
      if (showPaste) {
        ctx.fillStyle = 'rgba(220, 232, 245, 0.55)';
        const pw = pad.width * 0.84;
        const ph = pad.height * 0.84;
        if (pad.shape === 'Round') {
          ctx.beginPath(); ctx.arc(0, 0, pw / 2, 0, Math.PI * 2); ctx.fill();
        } else if (pad.shape === 'Oval') {
          ctx.beginPath(); ctx.ellipse(0, 0, pw / 2, ph / 2, 0, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
        }
      }

      if (showCopper && pad.holeDiameter && pad.holeDiameter > 0) {
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(0, 0, pad.holeDiameter / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (showCopper && viewport.pxPerMm >= 7 && pad.type !== 'MountingHole') {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `0.55px "Segoe UI", Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pad.number, 0, 0);
      }
      ctx.restore();
    }

    // Silkscreen RefDes text
    if (comp.showRefDes && layers.isVisible(silkLayer)) {
      ctx.fillStyle = isSel ? '#FFFF44' : '#FFFFFF';
      ctx.font = `1.4px "Segoe UI", Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(comp.refDes, comp.x + comp.refDesOffset.x, comp.y + comp.refDesOffset.y);
    }
  }
}
