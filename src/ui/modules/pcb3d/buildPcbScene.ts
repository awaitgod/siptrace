import * as THREE from 'three';
import { PcbPlacedComponent, PcbProject } from '../../../core/types';
import { dist as dist2d, pointInPolygon, transformPoint } from '../../../core/geometry';

interface PreviewOptions {
  maskColor: string;
  finishGold: boolean;
  showComponents: boolean;
  showSilk: boolean;
  showCopper?: boolean;
  showMask?: boolean;
  explodeFactor: number;
  inspectedRefDes?: string | null;
}

function getMaskedTraceColor(maskColor: string, finishGold: boolean): string {
  const c = maskColor.toLowerCase();
  if (c === '#dcdcdc') return finishGold ? '#d0cfc4' : '#c2cbd4';
  if (c === '#124185') return finishGold ? '#2e6bbf' : '#255bb0';
  if (c === '#8b1a1a') return finishGold ? '#ba3630' : '#a82828';
  if (c === '#1c1c1e') return finishGold ? '#36393d' : '#2c3036';
  return finishGold ? '#2ca05a' : '#2a8f50';
}

export function buildPcbScene(
  pcbGroup: THREE.Group,
  pcb: PcbProject,
  boardCenter: { cx: number; cy: number; w: number },
  { maskColor, finishGold, showComponents, showSilk, showCopper = true, showMask = true, explodeFactor, inspectedRefDes }: PreviewOptions
): void {
  const cx = boardCenter.cx;
  const cy = boardCenter.cy;
  const thick = pcb.boardThickness || 1.6;
  const ex = explodeFactor * 5.0;
  const isWhiteMask = maskColor.toLowerCase() === '#dcdcdc';
  const silkTextColor = isWhiteMask ? '#1e293b' : '#ffffff';

  // Materials
  const metalPadMat = new THREE.MeshStandardMaterial({
    color: finishGold ? '#d4af37' : '#d8dde2',
    metalness: 0.78,
    roughness: 0.25
  });
  const barrelMat = new THREE.MeshStandardMaterial({
    color: finishGold ? '#c9a22e' : '#b8c4cc',
    metalness: 0.75,
    roughness: 0.3,
    side: THREE.DoubleSide
  });
  const traceCopperMat = showMask
    ? new THREE.MeshStandardMaterial({
        color: getMaskedTraceColor(maskColor, finishGold),
        metalness: isWhiteMask ? 0.22 : 0.4,
        roughness: isWhiteMask ? 0.5 : 0.45
      })
    : new THREE.MeshStandardMaterial({
        color: '#c87533',
        metalness: 0.85,
        roughness: 0.25
      });
  const innerCopperMat = new THREE.MeshStandardMaterial({
    color: '#c87533',
    metalness: 0.55,
    roughness: 0.4
  });
  const maskMat = showMask
    ? new THREE.MeshStandardMaterial({
        color: maskColor,
        roughness: 0.35,
        metalness: 0.08
      })
    : new THREE.MeshStandardMaterial({
        color: '#c2b168',
        roughness: 0.75,
        metalness: 0.05
      });
  const fr4EdgeMat = new THREE.MeshStandardMaterial({
    color: '#9aa462',
    roughness: 0.75
  });
  const silkLineMat = new THREE.MeshBasicMaterial({ color: silkTextColor });

  // Collect non-overlapping drilled THT / Via holes so the FR-4 board has genuine see-through holes
  const drilledHoles: { x: number; y: number; r: number }[] = [];
  const tryAddDrillHole = (hx: number, hy: number, hd: number) => {
    const r = hd * 0.5;
    if (r < 0.15 || pcb.boardOutline.length < 3) return;
    if (!pointInPolygon({ x: hx, y: hy }, pcb.boardOutline)) return;
    if (pcb.cutouts.some((cut) => cut.points.length >= 3 && pointInPolygon({ x: hx, y: hy }, cut.points))) return;
    if (drilledHoles.some((dh) => dist2d(dh, { x: hx, y: hy }) < dh.r + r + 0.05)) return;
    drilledHoles.push({ x: hx, y: hy, r });
  };
  for (const v of pcb.vias) tryAddDrillHole(v.x, v.y, v.holeDiameter);
  for (const comp of pcb.components) {
    const mirror = comp.side === 'Bottom';
    for (const pad of comp.pads) {
      if (pad.holeDiameter && pad.holeDiameter > 0) {
        const pt = transformPoint(pad.x, pad.y, comp.x, comp.y, comp.angle, mirror, false);
        tryAddDrillHole(pt.x, pt.y, pad.holeDiameter);
      }
    }
  }

  // 1. FR-4 Extruded Board with Cutouts & Drilled Through-Holes
  if (pcb.boardOutline.length >= 3) {
    const shape = new THREE.Shape();
    pcb.boardOutline.forEach((pt, idx) => {
      const sx = pt.x - cx;
      const sy = -(pt.y - cy);
      if (idx === 0) shape.moveTo(sx, sy);
      else shape.lineTo(sx, sy);
    });
    shape.closePath();

    for (const cut of pcb.cutouts) {
      if (cut.points.length < 3) continue;
      const hole = new THREE.Path();
      cut.points.forEach((pt, idx) => {
        const sx = pt.x - cx;
        const sy = -(pt.y - cy);
        if (idx === 0) hole.moveTo(sx, sy);
        else hole.lineTo(sx, sy);
      });
      hole.closePath();
      shape.holes.push(hole);
    }

    for (const dh of drilledHoles) {
      const hole = new THREE.Path();
      hole.absarc(dh.x - cx, -(dh.y - cy), dh.r, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }

    const geom = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
    geom.rotateX(-Math.PI / 2);
    geom.translate(0, -thick / 2, 0);
    const boardMesh = new THREE.Mesh(geom, [maskMat, fr4EdgeMat]);
    boardMesh.receiveShadow = true;
    pcbGroup.add(boardMesh);
  }

  // 2. Copper Traces (Top, Bottom & Inner layers)
  const addTraceSegmentMesh = (x1: number, y1: number, x2: number, y2: number, width: number, yPos: number, mat: THREE.Material) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 0.05) return;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const box = new THREE.Mesh(new THREE.BoxGeometry(len + width * 0.4, 0.05, width), mat);
    box.position.set((x1 + x2) / 2 - cx, yPos, (y1 + y2) / 2 - cy);
    box.rotation.y = -angle;
    pcbGroup.add(box);
  };

  const topCopperY = thick / 2 + 0.03 + ex * 0.55;
  const botCopperY = -thick / 2 - 0.03 - ex * 0.55;

  if (showCopper) {
    for (const tr of pcb.traces) {
      const isOuter = tr.layer === 'TopCopper' || tr.layer === 'BottomCopper';
      const isInner = tr.layer === 'Inner1' || tr.layer === 'Inner2';
      if (!isOuter && (!isInner || ex <= 0.1)) continue;
      const yPos =
        tr.layer === 'TopCopper'
          ? topCopperY
          : tr.layer === 'BottomCopper'
            ? botCopperY
            : tr.layer === 'Inner1'
              ? thick * 0.18 + ex * 0.25
              : -thick * 0.18 - ex * 0.25;
      const mat = isInner ? innerCopperMat : traceCopperMat;
      for (let i = 1; i < tr.points.length; i++) {
        addTraceSegmentMesh(tr.points[i - 1].x, tr.points[i - 1].y, tr.points[i].x, tr.points[i].y, tr.width, yPos, mat);
      }
    }

    // 3. Copper Pour polygons (real extruded shapes + holes)
    for (const pour of pcb.copperPours) {
      if (!pour.poured || !pour.computedIslands) continue;
      const isOuter = pour.layer === 'TopCopper' || pour.layer === 'BottomCopper';
      if (!isOuter && ex <= 0.1) continue;
      const yPos =
        pour.layer === 'TopCopper'
          ? thick / 2 + 0.015 + ex * 0.55
          : pour.layer === 'BottomCopper'
            ? -thick / 2 - 0.045 - ex * 0.55
            : pour.layer === 'Inner1'
              ? thick * 0.18 + ex * 0.25
              : -thick * 0.18 - ex * 0.25;
      const mat = isOuter ? traceCopperMat : innerCopperMat;
      for (const isl of pour.computedIslands) {
        if (isl.outer.length < 3) continue;
        const pShape = new THREE.Shape();
        isl.outer.forEach((pt, idx) => {
          const sx = pt.x - cx;
          const sy = -(pt.y - cy);
          if (idx === 0) pShape.moveTo(sx, sy);
          else pShape.lineTo(sx, sy);
        });
        pShape.closePath();
        for (const h of isl.holes ?? []) {
          if (h.length < 3) continue;
          const hole = new THREE.Path();
          h.forEach((pt, idx) => {
            const sx = pt.x - cx;
            const sy = -(pt.y - cy);
            if (idx === 0) hole.moveTo(sx, sy);
            else hole.lineTo(sx, sy);
          });
          hole.closePath();
          pShape.holes.push(hole);
        }
        const m = new THREE.Mesh(new THREE.ExtrudeGeometry(pShape, { depth: 0.035, bevelEnabled: false }), mat);
        m.rotation.x = -Math.PI / 2;
        m.position.y = yPos;
        pcbGroup.add(m);
      }
    }
  }

  // Helper to build a hollow annular copper pad (extruded with circular drill hole) + plated through-hole barrel
  const addHollowThroughHole = (
    wx: number,
    wy: number,
    outerW: number,
    outerH: number,
    holeD: number,
    shapeKind: 'Round' | 'Oval' | 'Rect' | 'RoundedRect' | 'Polygon',
    rotDeg: number,
    yTop: number,
    yBot: number
  ) => {
    const rHole = Math.max(0.1, holeD * 0.5);
    const makePadRing = (yPos: number) => {
      const s = new THREE.Shape();
      if (shapeKind === 'Round') {
        const r = Math.max(rHole + 0.08, outerW * 0.5);
        s.absarc(0, 0, r, 0, Math.PI * 2, false);
      } else if (shapeKind === 'Oval') {
        const rx = Math.max(rHole + 0.08, outerW * 0.5);
        const ry = Math.max(rHole + 0.08, outerH * 0.5);
        s.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
      } else {
        const hw = Math.max(rHole + 0.08, outerW * 0.5);
        const hh = Math.max(rHole + 0.08, outerH * 0.5);
        s.moveTo(-hw, -hh);
        s.lineTo(hw, -hh);
        s.lineTo(hw, hh);
        s.lineTo(-hw, hh);
        s.closePath();
      }
      const hole = new THREE.Path();
      hole.absarc(0, 0, rHole, 0, Math.PI * 2, true);
      s.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, metalPadMat);
      m.position.set(wx - cx, yPos, wy - cy);
      m.rotation.y = -(rotDeg * Math.PI) / 180;
      pcbGroup.add(m);
    };
    makePadRing(yTop);
    makePadRing(yBot - 0.05);

    const spanH = Math.max(0.1, yTop - yBot);
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(rHole, rHole, spanH, 16, 1, true),
      barrelMat
    );
    barrel.position.set(wx - cx, (yTop + yBot) * 0.5, wy - cy);
    pcbGroup.add(barrel);
  };

  // 4. Vias (hollow annular rings + open plated barrel)
  const thtTopY = thick / 2 + 0.05 + ex * 0.58;
  const thtBotY = -thick / 2 - 0.05 - ex * 0.58;
  for (const v of pcb.vias) {
    addHollowThroughHole(v.x, v.y, v.outerDiameter, v.outerDiameter, v.holeDiameter, 'Round', 0, thtTopY, thtBotY);
  }

  // 4b. Board Silkscreen Shapes
  if (showSilk) {
    for (const sh of pcb.shapes) {
      if (sh.layer !== 'TopSilk' && sh.layer !== 'BottomSilk') continue;
      const yS = sh.layer === 'TopSilk' ? thtTopY + 0.02 : thtBotY - 0.02;
      if (sh.type === 'line' && sh.x2 !== undefined && sh.y2 !== undefined) {
        addTraceSegmentMesh(sh.x1, sh.y1, sh.x2, sh.y2, Math.max(0.15, sh.width), yS, silkLineMat);
      } else if (sh.type === 'rect' && sh.w !== undefined && sh.h !== undefined) {
        addTraceSegmentMesh(sh.x1, sh.y1, sh.x1 + sh.w, sh.y1, Math.max(0.15, sh.width), yS, silkLineMat);
        addTraceSegmentMesh(sh.x1 + sh.w, sh.y1, sh.x1 + sh.w, sh.y1 + sh.h, Math.max(0.15, sh.width), yS, silkLineMat);
        addTraceSegmentMesh(sh.x1 + sh.w, sh.y1 + sh.h, sh.x1, sh.y1 + sh.h, Math.max(0.15, sh.width), yS, silkLineMat);
        addTraceSegmentMesh(sh.x1, sh.y1 + sh.h, sh.x1, sh.y1, Math.max(0.15, sh.width), yS, silkLineMat);
      } else if (sh.type === 'text' && sh.text) {
        const cvs = document.createElement('canvas');
        cvs.width = 256;
        cvs.height = 64;
        const sctx = cvs.getContext('2d');
        if (sctx) {
          sctx.fillStyle = silkTextColor;
          sctx.font = 'bold 34px "Segoe UI", Arial';
          sctx.textBaseline = 'middle';
          sctx.fillText(sh.text, 8, 32);
          const tex = new THREE.CanvasTexture(cvs);
          const sz = sh.size ?? 2.0;
          const m = new THREE.Mesh(
            new THREE.PlaneGeometry(sz * 4, sz),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
          );
          m.rotation.x = sh.layer === 'BottomSilk' ? Math.PI / 2 : -Math.PI / 2;
          m.position.set(sh.x1 + sz * 1.8 - cx, yS, sh.y1 - cy);
          pcbGroup.add(m);
        }
      }
    }
  }

  // 5. Pads, Silkscreen RefDes & Procedural 3D Electronic Components
  const buildComponent3D = (c: PcbPlacedComponent) => {
    const mirror = c.side === 'Bottom';
    const dirY = c.side === 'Top' ? 1 : -1;
    const padBaseY = c.side === 'Top' ? thtTopY : thtBotY;
    const bodyBaseY = c.side === 'Top' ? thick / 2 + ex * 1.15 : -thick / 2 - ex * 1.15;
    const effAngle = mirror ? -c.angle : c.angle;

    // Pads
    for (const pad of c.pads) {
      const pt = transformPoint(pad.x, pad.y, c.x, c.y, c.angle, mirror, false);
      const isTht = pad.type === 'THT' || pad.type === 'MountingHole';
      if (pad.holeDiameter && pad.holeDiameter > 0) {
        addHollowThroughHole(
          pt.x,
          pt.y,
          pad.width,
          pad.height,
          pad.holeDiameter,
          pad.shape,
          effAngle + (pad.angle ?? 0),
          thtTopY,
          thtBotY
        );
      } else {
        const padH = isTht ? thick + 0.1 + ex * 1.16 : 0.06;
        const py = isTht ? 0 : padBaseY;
        let padMesh: THREE.Mesh;
        if (pad.shape === 'Round' || pad.shape === 'Oval') {
          padMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(pad.width / 2, pad.width / 2, padH, 16),
            metalPadMat
          );
          if (pad.shape === 'Oval' && pad.width > 0.01) {
            padMesh.scale.z = pad.height / pad.width;
          }
        } else {
          padMesh = new THREE.Mesh(new THREE.BoxGeometry(pad.width, padH, pad.height), metalPadMat);
        }
        padMesh.position.set(pt.x - cx, py, pt.y - cy);
        padMesh.rotation.y = -((effAngle + (pad.angle ?? 0)) * Math.PI) / 180;
        pcbGroup.add(padMesh);
      }
    }

    // Component Silkscreen outlines on board surface
    if (showSilk && !c.pads.every((p) => p.type === 'MountingHole')) {
      const ySilk = mirror ? thtBotY - 0.015 : thtTopY + 0.015;
      for (const g of c.graphics) {
        if (g.layer !== 'TopSilk') continue;
        const w = Math.max(0.14, 'width' in g ? g.width : 0.15);
        if (g.type === 'line') {
          const a = transformPoint(g.x1, g.y1, c.x, c.y, c.angle, mirror, false);
          const b = transformPoint(g.x2, g.y2, c.x, c.y, c.angle, mirror, false);
          addTraceSegmentMesh(a.x, a.y, b.x, b.y, w, ySilk, silkLineMat);
        } else if (g.type === 'rect') {
          const p1 = transformPoint(g.x, g.y, c.x, c.y, c.angle, mirror, false);
          const p2 = transformPoint(g.x + g.w, g.y, c.x, c.y, c.angle, mirror, false);
          const p3 = transformPoint(g.x + g.w, g.y + g.h, c.x, c.y, c.angle, mirror, false);
          const p4 = transformPoint(g.x, g.y + g.h, c.x, c.y, c.angle, mirror, false);
          addTraceSegmentMesh(p1.x, p1.y, p2.x, p2.y, w, ySilk, silkLineMat);
          addTraceSegmentMesh(p2.x, p2.y, p3.x, p3.y, w, ySilk, silkLineMat);
          addTraceSegmentMesh(p3.x, p3.y, p4.x, p4.y, w, ySilk, silkLineMat);
          addTraceSegmentMesh(p4.x, p4.y, p1.x, p1.y, w, ySilk, silkLineMat);
        } else if (g.type === 'polyline' && g.points.length >= 2) {
          for (let k = 1; k < g.points.length; k++) {
            const a = transformPoint(g.points[k - 1].x, g.points[k - 1].y, c.x, c.y, c.angle, mirror, false);
            const b = transformPoint(g.points[k].x, g.points[k].y, c.x, c.y, c.angle, mirror, false);
            addTraceSegmentMesh(a.x, a.y, b.x, b.y, w, ySilk, silkLineMat);
          }
        }
      }
    }

    // Silkscreen RefDes on board surface (visible even if 3D component bodies are hidden)
    if (showSilk && c.showRefDes && !c.pads.every((p) => p.type === 'MountingHole')) {
      const cvs = document.createElement('canvas');
      cvs.width = 160;
      cvs.height = 48;
      const sctx = cvs.getContext('2d');
      if (sctx) {
        sctx.fillStyle = silkTextColor;
        sctx.font = 'bold 26px "Segoe UI", Arial';
        sctx.textAlign = 'center';
        sctx.textBaseline = 'middle';
        sctx.fillText(c.refDes, 80, 24);
        const tex = new THREE.CanvasTexture(cvs);
        const lbl = new THREE.Mesh(
          new THREE.PlaneGeometry(5.2, 1.56),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
        );
        lbl.rotation.x = mirror ? Math.PI / 2 : -Math.PI / 2;
        lbl.position.set(c.x + c.refDesOffset.x - cx, dirY * (thick / 2 + 0.065 + ex * 0.58), c.y + c.refDesOffset.y - cy);
        pcbGroup.add(lbl);
      }
    }

    if (!showComponents || c.pads.every((p) => p.type === 'MountingHole')) return;

    // Component Body Group aligned with mirrored Bottom coordinates cleanly without negative scaling
    const grp = new THREE.Group();
    grp.position.set(c.x - cx, bodyBaseY, c.y - cy);
    grp.rotation.y = -(effAngle * Math.PI) / 180;
    const mx = mirror ? -1 : 1;

    const m3 = c.model3d;
    const bw = Math.max(0.6, m3.bodyWidth);
    const bl = Math.max(0.6, m3.bodyLength);
    const bh = Math.max(0.4, m3.bodyHeight);
    const isSelected = inspectedRefDes === c.refDes;
    const bodyMat = new THREE.MeshStandardMaterial({
      color: m3.color || '#222222',
      roughness: 0.45,
      metalness: 0.1,
      emissive: isSelected ? new THREE.Color('#0369a1') : new THREE.Color('#000000'),
      emissiveIntensity: isSelected ? 0.6 : 0
    });
    const silverMat = new THREE.MeshStandardMaterial({ color: '#cfd6dc', metalness: 0.85, roughness: 0.22 });

    if (m3.shape === 'RadialCap' || m3.shape === 'Cylinder') {
      const rad = bw / 2;
      const can = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, bh, 24), bodyMat);
      can.position.y = dirY * (bh / 2 + 0.2);
      grp.add(can);
      const capTop = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.85, rad * 0.85, 0.1, 24), silverMat);
      capTop.position.y = dirY * (bh + 0.22);
      grp.add(capTop);
    } else if (m3.shape === 'AxialResistor') {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(bw / 2, bw / 2, bl, 18), bodyMat);
      cyl.rotation.z = Math.PI / 2;
      cyl.position.y = dirY * (bw / 2 + 0.4);
      grp.add(cyl);
      const span = c.pads.length >= 2 ? Math.abs(c.pads[1].x - c.pads[0].x) : bl + 4;
      const leadWire = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, span, 10), silverMat);
      leadWire.rotation.z = Math.PI / 2;
      leadWire.position.y = dirY * (bw / 2 + 0.4);
      grp.add(leadWire);
    } else if (m3.shape === 'ChipSMD') {
      const core = new THREE.Mesh(new THREE.BoxGeometry(bl * 0.7, bh, bw), bodyMat);
      core.position.y = dirY * (bh / 2);
      grp.add(core);
      const capL = new THREE.Mesh(new THREE.BoxGeometry(bl * 0.16, bh * 1.02, bw * 1.02), silverMat);
      capL.position.set(-bl * 0.42, dirY * (bh / 2), 0);
      const capR = capL.clone();
      capR.position.x = bl * 0.42;
      grp.add(capL, capR);
    } else if (m3.shape === 'TO220') {
      // PAT_KT28_TO220 has bodyWidth along X (across pins -2.54, 0, +2.54) and bodyLength along Z
      const epoxy = new THREE.Mesh(new THREE.BoxGeometry(bw, bh * 0.65, bl), bodyMat);
      epoxy.position.y = dirY * (bh * 0.35 + 1.5);
      const tab = new THREE.Mesh(new THREE.BoxGeometry(bw, bh * 0.38, 1.3), silverMat);
      tab.position.set(0, dirY * (bh * 0.82 + 1.5), -bl * 0.35);
      grp.add(epoxy, tab);
      for (const p of c.pads) {
        const pin = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.2, 0.4), silverMat);
        pin.position.set(mx * p.x, dirY * 1.0, p.y);
        grp.add(pin);
      }
    } else {
      const lift = m3.shape === 'DIP' ? 1.1 : m3.shape === 'TO92' ? 1.6 : 0.15;
      const box = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bl), bodyMat);
      box.position.y = dirY * (bh / 2 + lift);
      box.castShadow = true;
      grp.add(box);

      const dot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 0.08, 12),
        new THREE.MeshBasicMaterial({ color: '#cccccc' })
      );
      dot.position.set(mx * -bw * 0.3, dirY * (bh + lift + 0.04), -bl * 0.36);
      grp.add(dot);

      if (m3.shape === 'Header') {
        const isGreenScrewTerminal = (m3.color || '').toLowerCase() === '#196f3d';
        const isUsbConnector = (c.patternId ?? '').includes('USBC') || (c.patternId ?? '').includes('USB') || c.pads.some((p) => p.type === 'SMD');
        if (isUsbConnector) {
          const usbShell = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.95, bh * 0.95, bl * 0.95), silverMat);
          usbShell.position.y = dirY * (bh / 2 + 0.1);
          grp.add(usbShell);
          const socketHole = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.65, bh * 0.45, 0.4), bodyMat);
          socketHole.position.set(0, dirY * (bh / 2 + 0.1), -bl * 0.48);
          grp.add(socketHole);
        } else {
          const goldPinMat = new THREE.MeshStandardMaterial({ color: '#e0b838', metalness: 0.85, roughness: 0.2 });
          for (const p of c.pads) {
            if (isGreenScrewTerminal) {
              const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.15, 16), silverMat);
              screw.position.set(mx * p.x, dirY * (bh + lift + 0.06), p.y);
              grp.add(screw);
            } else {
              const pinPost = new THREE.Mesh(new THREE.BoxGeometry(0.64, bh + lift + 2.8, 0.64), goldPinMat);
              pinPost.position.set(mx * p.x, dirY * ((bh + lift + 2.8) / 2), p.y);
              grp.add(pinPost);
            }
          }
        }
      } else if (m3.shape === 'DIP' || m3.shape === 'SOIC' || m3.shape === 'TO92' || m3.shape === 'QFP' || (m3.shape as string) === 'LQFP' || (m3.shape as string) === 'TQFP') {
        const pinH = lift + bh * 0.35;
        for (const p of c.pads) {
          const lead = new THREE.Mesh(new THREE.BoxGeometry(0.42, pinH, 0.35), silverMat);
          lead.position.set(mx * p.x, dirY * (pinH / 2), p.y);
          grp.add(lead);
        }
      }
    }

    if (isSelected) {
      const padSpanX = Math.max(bw + 1.2, ...c.pads.map((p) => Math.abs(p.x) * 2 + p.width));
      const padSpanZ = Math.max(bl + 1.2, ...c.pads.map((p) => Math.abs(p.y) * 2 + p.height));
      const selBox = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(padSpanX, bh + 0.8, padSpanZ)),
        new THREE.LineBasicMaterial({ color: 0x38bdf8 })
      );
      selBox.position.y = dirY * (bh / 2 + 0.3);
      grp.add(selBox);
    }

    grp.userData = { component: c, refDes: c.refDes };
    grp.traverse((child) => {
      child.userData = { component: c, refDes: c.refDes };
    });

    pcbGroup.add(grp);
  };

  for (const comp of pcb.components) buildComponent3D(comp);

  const grid = new THREE.GridHelper(Math.max(160, boardCenter.w * 2), 20, '#3a4250', '#2c323e');
  grid.position.y = -thick / 2 - 4 - ex;
  pcbGroup.add(grid);
}
