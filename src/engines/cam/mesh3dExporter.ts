import { PcbProject, Point2D } from '../../core/types';

function getComp3dDimensionsMm(shape: string, bodyWidth: number, bodyLength: number): { dimX: number; dimY: number } {
  const isHorizPin = shape === 'ChipSMD' || shape === 'AxialResistor';
  return {
    dimX: Math.max(0.4, isHorizPin ? bodyLength : bodyWidth),
    dimY: Math.max(0.4, isHorizPin ? bodyWidth : bodyLength)
  };
}

function boxCornersWorld3D(cx: number, cy: number, z0: number, dimX: number, dimY: number, h: number, angleDeg: number): [number, number, number][] {
  const hw = dimX / 2;
  const hy = dimY / 2;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const local: [number, number][] = [[-hw, -hy], [hw, -hy], [hw, hy], [-hw, hy]];
  const bottom = local.map(([lx, ly]): [number, number, number] => [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos, z0]);
  const top = local.map(([lx, ly]): [number, number, number] => [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos, z0 + h]);
  return [...bottom, ...top];
}

function triangulatePolygon2D(poly: Point2D[]): [Point2D, Point2D, Point2D][] {
  if (poly.length < 3) return [];
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  const pts = area >= 0 ? [...poly] : [...poly].reverse();
  const tris: [Point2D, Point2D, Point2D][] = [];
  const cross = (a: Point2D, b: Point2D, c: Point2D) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const inTri = (p: Point2D, a: Point2D, b: Point2D, c: Point2D) =>
    cross(a, b, p) >= -1e-6 && cross(b, c, p) >= -1e-6 && cross(c, a, p) >= -1e-6;
  let guard = 0;
  while (pts.length > 3 && guard++ < poly.length * poly.length) {
    let clipped = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      if (cross(a, b, c) <= 1e-6) continue;
      const contains = pts.some((p) => p !== a && p !== b && p !== c && inTri(p, a, b, c));
      if (!contains) {
        tris.push([a, b, c]);
        pts.splice(i, 1);
        clipped = true;
        break;
      }
    }
    if (!clipped) break;
  }
  if (pts.length === 3) tris.push([pts[0], pts[1], pts[2]]);
  return tris;
}

/** Exports the PCB assembly as Wavefront OBJ 3D mesh (Y-up, mm). */
export function exportPcbObj3D(pcb: PcbProject): string {
  const lines: string[] = ['# GOSTTrace EDA 3D Board Mesh (OBJ, Y-up, mm)', `o ${pcb.projectName || 'PCB'}`];
  let vOff = 1;
  const addBox = (cx: number, cy: number, z0: number, dimX: number, dimY: number, h: number, angleDeg = 0) => {
    const pts = boxCornersWorld3D(cx, cy, z0, dimX, dimY, h, angleDeg);
    for (const p of pts) lines.push(`v ${p[0].toFixed(3)} ${p[2].toFixed(3)} ${(-p[1]).toFixed(3)}`);
    const b = vOff;
    lines.push(`f ${b} ${b + 3} ${b + 2} ${b + 1}`);
    lines.push(`f ${b + 4} ${b + 5} ${b + 6} ${b + 7}`);
    lines.push(`f ${b} ${b + 1} ${b + 5} ${b + 4}`);
    lines.push(`f ${b + 1} ${b + 2} ${b + 6} ${b + 5}`);
    lines.push(`f ${b + 2} ${b + 3} ${b + 7} ${b + 6}`);
    lines.push(`f ${b + 3} ${b} ${b + 4} ${b + 7}`);
    vOff += 8;
  };

  if (pcb.boardOutline.length >= 3) {
    const thick = pcb.boardThickness || 1.6;
    const tris = triangulatePolygon2D(pcb.boardOutline);
    for (const [a, b, c] of tris) {
      lines.push(`v ${a.x.toFixed(3)} ${thick.toFixed(3)} ${(-a.y).toFixed(3)}`);
      lines.push(`v ${c.x.toFixed(3)} ${thick.toFixed(3)} ${(-c.y).toFixed(3)}`);
      lines.push(`v ${b.x.toFixed(3)} ${thick.toFixed(3)} ${(-b.y).toFixed(3)}`);
      lines.push(`f ${vOff} ${vOff + 1} ${vOff + 2}`);
      vOff += 3;
      lines.push(`v ${a.x.toFixed(3)} 0.000 ${(-a.y).toFixed(3)}`);
      lines.push(`v ${b.x.toFixed(3)} 0.000 ${(-b.y).toFixed(3)}`);
      lines.push(`v ${c.x.toFixed(3)} 0.000 ${(-c.y).toFixed(3)}`);
      lines.push(`f ${vOff} ${vOff + 1} ${vOff + 2}`);
      vOff += 3;
    }
    const outline = pcb.boardOutline;
    for (let i = 0; i < outline.length; i++) {
      const p0 = outline[i];
      const p1 = outline[(i + 1) % outline.length];
      lines.push(`v ${p0.x.toFixed(3)} 0.000 ${(-p0.y).toFixed(3)}`);
      lines.push(`v ${p1.x.toFixed(3)} 0.000 ${(-p1.y).toFixed(3)}`);
      lines.push(`v ${p1.x.toFixed(3)} ${thick.toFixed(3)} ${(-p1.y).toFixed(3)}`);
      lines.push(`v ${p0.x.toFixed(3)} ${thick.toFixed(3)} ${(-p0.y).toFixed(3)}`);
      lines.push(`f ${vOff} ${vOff + 1} ${vOff + 2} ${vOff + 3}`);
      vOff += 4;
    }
  }
  for (const c of pcb.components) {
    if (c.pads.every((p) => p.type === 'MountingHole')) continue;
    const zBase = c.side === 'Top' ? pcb.boardThickness : -c.model3d.bodyHeight;
    const { dimX, dimY } = getComp3dDimensionsMm(c.model3d.shape, c.model3d.bodyWidth, c.model3d.bodyLength);
    addBox(c.x, c.y, zBase, dimX, dimY, c.model3d.bodyHeight, c.angle);
  }
  return lines.join('\n');
}

/** Exports the PCB assembly in VRML97 (.wrl) format (meters). */
export function exportPcbWrl(pcb: PcbProject): string {
  const lines: string[] = [
    '#VRML V2.0 utf8',
    `# Generated by GOSTTrace EDA — ${pcb.projectName} (VRML97 meters)`,
    'Transform {',
    '  scale 0.001 0.001 0.001',
    '  children ['
  ];
  if (pcb.boardOutline.length >= 3) {
    const xs = pcb.boardOutline.map((p) => p.x);
    const ys = pcb.boardOutline.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    lines.push(`    Transform { translation ${cx.toFixed(3)} ${(pcb.boardThickness / 2).toFixed(3)} ${cy.toFixed(3)} children [ Shape { appearance Appearance { material Material { diffuseColor 0.05 0.38 0.18 } } geometry Box { size ${w.toFixed(3)} ${pcb.boardThickness.toFixed(3)} ${h.toFixed(3)} } } ] }`);
  }
  for (const c of pcb.components) {
    if (c.pads.every((p) => p.type === 'MountingHole')) continue;
    const z = c.side === 'Top' ? pcb.boardThickness + c.model3d.bodyHeight / 2 : -c.model3d.bodyHeight / 2;
    const { dimX, dimY } = getComp3dDimensionsMm(c.model3d.shape, c.model3d.bodyWidth, c.model3d.bodyLength);
    lines.push(`    # ${c.refDes}`);
    lines.push(`    Transform { translation ${c.x.toFixed(3)} ${z.toFixed(3)} ${c.y.toFixed(3)} rotation 0 1 0 ${((-c.angle * Math.PI) / 180).toFixed(4)} children [ Shape { appearance Appearance { material Material { diffuseColor 0.16 0.16 0.18 } } geometry Box { size ${dimX.toFixed(3)} ${c.model3d.bodyHeight.toFixed(3)} ${dimY.toFixed(3)} } } ] }`);
  }
  lines.push('  ]', '}');
  return lines.join('\n');
}

/** Exports the PCB assembly as an ASCII STL mesh (mm). */
export function exportPcbStlAscii(pcb: PcbProject): string {
  const tris: string[] = [];
  const emitTri = (p1: [number, number, number], p2: [number, number, number], p3: [number, number, number]) => {
    const ux = p2[0] - p1[0], uy = p2[1] - p1[1], uz = p2[2] - p1[2];
    const vx = p3[0] - p1[0], vy = p3[1] - p1[1], vz = p3[2] - p1[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    tris.push(
      `  facet normal ${nx.toFixed(4)} ${ny.toFixed(4)} ${nz.toFixed(4)}\n    outer loop\n      vertex ${p1[0].toFixed(3)} ${p1[1].toFixed(3)} ${p1[2].toFixed(3)}\n      vertex ${p2[0].toFixed(3)} ${p2[1].toFixed(3)} ${p2[2].toFixed(3)}\n      vertex ${p3[0].toFixed(3)} ${p3[1].toFixed(3)} ${p3[2].toFixed(3)}\n    endloop\n  endfacet`
    );
  };
  const pushBox = (cx: number, cy: number, z0: number, dimX: number, dimY: number, h: number, angleDeg: number) => {
    const pts = boxCornersWorld3D(cx, cy, z0, dimX, dimY, h, angleDeg);
    const quad = (i0: number, i1: number, i2: number, i3: number) => {
      emitTri(pts[i0], pts[i1], pts[i2]);
      emitTri(pts[i0], pts[i2], pts[i3]);
    };
    quad(4, 5, 6, 7);
    quad(3, 2, 1, 0);
    quad(0, 1, 5, 4);
    quad(1, 2, 6, 5);
    quad(2, 3, 7, 6);
    quad(3, 0, 4, 7);
  };
  if (pcb.boardOutline.length >= 3) {
    const thick = pcb.boardThickness || 1.6;
    const polyTris = triangulatePolygon2D(pcb.boardOutline);
    for (const [a, b, c] of polyTris) {
      emitTri([a.x, a.y, thick], [b.x, b.y, thick], [c.x, c.y, thick]);
      emitTri([a.x, a.y, 0], [c.x, c.y, 0], [b.x, b.y, 0]);
    }
    const outline = pcb.boardOutline;
    for (let i = 0; i < outline.length; i++) {
      const p0 = outline[i];
      const p1 = outline[(i + 1) % outline.length];
      emitTri([p0.x, p0.y, 0], [p1.x, p1.y, 0], [p1.x, p1.y, thick]);
      emitTri([p0.x, p0.y, 0], [p1.x, p1.y, thick], [p0.x, p0.y, thick]);
    }
  }
  for (const c of pcb.components) {
    if (c.pads.every((p) => p.type === 'MountingHole')) continue;
    const { dimX, dimY } = getComp3dDimensionsMm(c.model3d.shape, c.model3d.bodyWidth, c.model3d.bodyLength);
    pushBox(c.x, c.y, c.side === 'Top' ? pcb.boardThickness : -c.model3d.bodyHeight, dimX, dimY, c.model3d.bodyHeight, c.angle);
  }
  return `solid ${pcb.projectName || 'PCB'}\n${tris.join('\n')}\nendsolid ${pcb.projectName || 'PCB'}`;
}

/** Exports the PCB assembly as an ISO-10303-21 STEP AP214 file. */
export function exportPcbStep(pcb: PcbProject): string {
  const xs = pcb.boardOutline.map((p) => p.x);
  const ys = pcb.boardOutline.map((p) => p.y);
  const w = xs.length ? Math.max(...xs) - Math.min(...xs) : 100;
  const h = ys.length ? Math.max(...ys) - Math.min(...ys) : 70;
  const thick = pcb.boardThickness || 1.6;
  const ent: string[] = [
    `#1=APPLICATION_CONTEXT('configuration controlled 3d designs of mechanical parts and assemblies');`,
    `#2=APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#1);`,
    `#3=PRODUCT('${pcb.projectName || 'PCB'}','PCB Assembly','',(#4));`,
    `#4=PRODUCT_CONTEXT('',#1,'mechanical');`,
    `#5=PRODUCT_DEFINITION_FORMATION('','',#3);`,
    `#6=PRODUCT_DEFINITION('design','',#5,#7);`,
    `#7=PRODUCT_DEFINITION_CONTEXT('part definition',#1,'design');`,
    `#8=PRODUCT_DEFINITION_SHAPE('','',#6);`,
    `#9=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));`,
    `#10=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));`,
    `#11=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNIT_ASSIGNED_CONTEXT((#9,#10))REPRESENTATION_CONTEXT('GOSTTrace','3D'));`,
    `#12=SHAPE_REPRESENTATION('PCB',(#15),#11);`,
    `#13=SHAPE_DEFINITION_REPRESENTATION(#8,#12);`
  ];
  let eid = 20;
  const brepRefs: number[] = [];
  const addPolySolid = (label: string, bottomPts: Point2D[], z0: number, z1: number) => {
    if (bottomPts.length < 3) return;
    const botIds = bottomPts.map((pt) => {
      const id = eid++;
      ent.push(`#${id}=CARTESIAN_POINT('',(${pt.x.toFixed(3)},${pt.y.toFixed(3)},${z0.toFixed(3)}));`);
      return id;
    });
    const topIds = bottomPts.map((pt) => {
      const id = eid++;
      ent.push(`#${id}=CARTESIAN_POINT('',(${pt.x.toFixed(3)},${pt.y.toFixed(3)},${z1.toFixed(3)}));`);
      return id;
    });
    const faces: number[] = [];
    const makeFace = (ptIds: number[]) => {
      const loopId = eid++;
      const boundId = eid++;
      const planeId = eid++;
      const faceId = eid++;
      ent.push(`#${loopId}=POLY_LOOP('',(${ptIds.map((i) => `#${i}`).join(',')}));`);
      ent.push(`#${boundId}=FACE_OUTER_BOUND('',#${loopId},.T.);`);
      ent.push(`#${planeId}=PLANE('',#${eid});`);
      const origId = eid++;
      ent.push(`#${origId}=AXIS2_PLACEMENT_3D('',#${ptIds[0]},$,$);`);
      ent.push(`#${faceId}=ADVANCED_FACE('',(#${boundId}),#${planeId},.T.);`);
      faces.push(faceId);
    };
    makeFace(topIds);
    makeFace([...botIds].reverse());
    for (let i = 0; i < bottomPts.length; i++) {
      const j = (i + 1) % bottomPts.length;
      makeFace([botIds[i], botIds[j], topIds[j], topIds[i]]);
    }
    const shellId = eid++;
    const brepId = eid++;
    ent.push(`#${shellId}=CLOSED_SHELL('',(${faces.map((f) => `#${f}`).join(',')}));`);
    ent.push(`#${brepId}=FACETED_BREP('${label}',#${shellId});`);
    brepRefs.push(brepId);
  };
  const outlinePts = pcb.boardOutline.length >= 3 ? pcb.boardOutline : [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  addPolySolid('PCB_Board', outlinePts, 0, thick);
  for (const c of pcb.components) {
    if (c.pads.every((p) => p.type === 'MountingHole')) continue;
    const { dimX, dimY } = getComp3dDimensionsMm(c.model3d.shape, c.model3d.bodyWidth, c.model3d.bodyLength);
    const z0 = c.side === 'Top' ? thick : -c.model3d.bodyHeight;
    const z1 = z0 + c.model3d.bodyHeight;
    const pts = boxCornersWorld3D(c.x, c.y, z0, dimX, dimY, c.model3d.bodyHeight, c.angle).slice(0, 4).map(([x, y]) => ({ x, y }));
    addPolySolid(c.refDes || 'COMP', pts, z0, z1);
  }
  ent[11] = `#12=SHAPE_REPRESENTATION('PCB',(${brepRefs.map((i) => `#${i}`).join(',')}),#11);`;
  return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('GOSTTrace EDA 3D PCB Assembly'),'2;1');\nFILE_NAME('${pcb.projectName || 'board'}.stp','${new Date().toISOString()}',('GOSTTrace'),('SIPTrace'),'','','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\nENDSEC;\nDATA;\n${ent.join('\n')}\nENDSEC;\nEND-ISO-10303-21;`;
}
