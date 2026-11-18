import { ShapeUtils, Vector2 } from 'three';
import { pointInPolygon, segmentsIntersect, transformPoint } from '../../core/geometry';
import { PcbProject, Point2D } from '../../core/types';

export type Point3 = [x: number, y: number, z: number];

export interface MechanicalBody {
  name: string;
  outline: Point2D[];
  openings: Point2D[][];
  bottom: number;
  top: number;
}

type PolygonEdge = [Point2D, Point2D];

function edges(loop: Point2D[]): PolygonEdge[] {
  return loop.map((point, index) => [point, loop[(index + 1) % loop.length]]);
}

function roundCoordinate(n: number): number {
  return Number(n.toFixed(6));
}

function normalizeLoop(input: Point2D[], clockwise: boolean, label: string): Point2D[] {
  const loop: Vector2[] = [];
  for (const { x, y } of input) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`${label}: координаты должны быть конечными числами.`);
    const point = new Vector2(roundCoordinate(x), roundCoordinate(y));
    if (!point.equals(loop.at(-1) ?? new Vector2(Infinity, Infinity))) loop.push(point);
  }
  if (loop.length > 1 && loop[0].equals(loop[loop.length - 1])) loop.pop();
  const area = ShapeUtils.area(loop);
  const segments = edges(loop);
  const intersectsSelf = segments.some(([a, b], first) => segments.slice(first + 2).some(([c, d], offset) => (
    (first > 0 || offset < segments.length - 3) && segmentsIntersect(a, b, c, d)
  )));
  if (loop.length < 3 || Math.abs(area) < 1e-9 || intersectsSelf) {
    throw new Error(`${label}: требуется простой замкнутый контур ненулевой площади.`);
  }
  if ((area < 0) !== clockwise) loop.reverse();
  return loop;
}

function boundariesIntersect(a: Point2D[], b: Point2D[]): boolean {
  const second = edges(b);
  return edges(a).some(([a1, a2]) => second.some(([b1, b2]) => segmentsIntersect(a1, a2, b1, b2)));
}

function makeCircleLoop(cx: number, cy: number, radius: number, points = 16, clockwise = false): Point2D[] {
  const loop: Point2D[] = [];
  for (let i = 0; i < points; i++) {
    const angle = ((clockwise ? -i : i) / points) * Math.PI * 2;
    loop.push({
      x: roundCoordinate(cx + radius * Math.cos(angle)),
      y: roundCoordinate(cy + radius * Math.sin(angle))
    });
  }
  return loop;
}

/** Returns simplified solids in PCB coordinates and millimetres. */
export function buildMechanicalBodies(pcb: PcbProject): MechanicalBody[] {
  const thickness = pcb.boardThickness || 1.6;
  if (!Number.isFinite(thickness) || thickness <= 0) throw new Error('Некорректная толщина платы.');

  const rawOutline = pcb.boardOutline && pcb.boardOutline.length >= 3
    ? pcb.boardOutline
    : [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 50 }, { x: 0, y: 50 }];

  const board: MechanicalBody = {
    name: 'BOARD_FR4',
    outline: normalizeLoop(rawOutline, false, 'Контур платы'),
    openings: [],
    bottom: 0,
    top: thickness
  };
  for (const [index, cutout] of (pcb.cutouts ?? []).entries()) {
    try {
      const label = `Вырез ${index + 1}`;
      const opening = normalizeLoop(cutout.points, true, label);
      if (!pointInPolygon(opening[0], board.outline) || boundariesIntersect(opening, board.outline)) {
        continue;
      }
      if (board.openings.some((other) =>
        pointInPolygon(opening[0], other) || pointInPolygon(other[0], opening) || boundariesIntersect(opening, other)
      )) {
        continue;
      }
      board.openings.push(opening);
    } catch {
      // Gracefully ignore degenerate cutout
    }
  }

  // Include mechanical mounting holes / large tooling cutouts as authentic openings in MCAD board body
  const addedHoles: { x: number; y: number; r: number }[] = [];
  const tryAddMountingHole = (hx: number, hy: number, dia: number) => {
    const r = Math.max(0.5, dia / 2);
    if (addedHoles.some((h) => Math.hypot(h.x - hx, h.y - hy) < h.r + r)) return;
    const circle = makeCircleLoop(hx, hy, r, 16, true);
    if (pointInPolygon(circle[0], board.outline) && !boundariesIntersect(circle, board.outline)) {
      if (!board.openings.some((other) => pointInPolygon(circle[0], other) || boundariesIntersect(circle, other))) {
        board.openings.push(circle);
        addedHoles.push({ x: hx, y: hy, r });
      }
    }
  };

  for (const comp of pcb.components) {
    const mirror = comp.side === 'Bottom';
    for (const pad of comp.pads) {
      if ((pad.type === 'MountingHole' || (pad.holeDiameter && pad.holeDiameter >= 1.5)) && pad.holeDiameter) {
        const pt = transformPoint(pad.x, pad.y, comp.x, comp.y, comp.angle, mirror, false);
        tryAddMountingHole(pt.x, pt.y, pad.holeDiameter);
      }
    }
  }
  for (const via of pcb.vias ?? []) {
    if (via.holeDiameter && via.holeDiameter >= 2.0) {
      tryAddMountingHole(via.x, via.y, via.holeDiameter);
    }
  }

  const bodies = [board];
  for (const component of pcb.components) {
    if (component.pads.length && component.pads.every((pad) => pad.type === 'MountingHole')) continue;
    const model = component.model3d;
    if (!model) continue;
    const lengthAlongX = model.shape === 'ChipSMD' || model.shape === 'AxialResistor';
    const halfX = Math.max(0.4, lengthAlongX ? model.bodyLength : model.bodyWidth) / 2;
    const halfY = Math.max(0.4, lengthAlongX ? model.bodyWidth : model.bodyLength) / 2;
    const height = Math.max(0.4, model.bodyHeight);
    if (!Number.isFinite(height)) throw new Error(`Корпус ${component.refDes}: некорректная высота.`);
    const bottom = component.side === 'Bottom';
    let local: Point2D[];
    if (model.shape === 'RadialCap' || model.shape === 'Cylinder') {
      const radius = Math.max(0.4, model.bodyWidth / 2);
      local = makeCircleLoop(0, 0, radius, 16, false);
    } else {
      local = [
        { x: -halfX, y: -halfY }, { x: halfX, y: -halfY },
        { x: halfX, y: halfY }, { x: -halfX, y: halfY }
      ];
    }
    const outline = local.map(({ x, y }) => transformPoint(
      x + (model.offsetX ?? 0), y + (model.offsetY ?? 0), component.x, component.y, component.angle, bottom
    ));
    bodies.push({
      name: component.refDes,
      outline: normalizeLoop(outline, false, `Корпус ${component.refDes}`),
      openings: [],
      bottom: bottom ? -height : thickness,
      top: bottom ? 0 : thickness + height
    });
  }
  return bodies;
}

export function triangulateBody(body: MechanicalBody): { vertices: Point3[]; triangles: number[][] } {
  const loops = [body.outline, ...body.openings];
  const points = loops.flat();
  const size = points.length;
  const vertices: Point3[] = [
    ...points.map(({ x, y }): Point3 => [x, y, body.bottom]),
    ...points.map(({ x, y }): Point3 => [x, y, body.top])
  ];
  const cap = ShapeUtils.triangulateShape(
    body.outline.map(({ x, y }) => new Vector2(x, y)),
    body.openings.map((hole) => hole.map(({ x, y }) => new Vector2(x, y)))
  );
  const triangles: number[][] = [];
  for (const [a, b, c] of cap) {
    triangles.push([a, c, b], [a + size, b + size, c + size]);
  }
  let start = 0;
  for (const loop of loops) {
    for (let index = 0; index < loop.length; index++) {
      const a = start + index;
      const b = start + (index + 1) % loop.length;
      triangles.push([a, b, b + size], [a, b + size, a + size]);
    }
    start += loop.length;
  }
  return { vertices, triangles };
}
