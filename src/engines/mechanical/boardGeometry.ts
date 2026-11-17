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

/** Returns simplified solids in PCB coordinates and millimetres. */
export function buildMechanicalBodies(pcb: PcbProject): MechanicalBody[] {
  const thickness = pcb.boardThickness || 1.6;
  if (!Number.isFinite(thickness) || thickness <= 0) throw new Error('Некорректная толщина платы.');

  const board: MechanicalBody = {
    name: 'BOARD_FR4',
    outline: normalizeLoop(pcb.boardOutline, false, 'Контур платы'),
    openings: [],
    bottom: 0,
    top: thickness
  };
  for (const [index, cutout] of (pcb.cutouts ?? []).entries()) {
    const label = `Вырез ${index + 1}`;
    const opening = normalizeLoop(cutout.points, true, label);
    if (!pointInPolygon(opening[0], board.outline) || boundariesIntersect(opening, board.outline)) {
      throw new Error(`${label}: контур пересекает край платы или находится за ним.`);
    }
    if (board.openings.some((other) =>
      pointInPolygon(opening[0], other) || pointInPolygon(other[0], opening) || boundariesIntersect(opening, other)
    )) {
      throw new Error(`${label}: пересекается с другим вырезом.`);
    }
    board.openings.push(opening);
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
    const local: Point2D[] = [
      { x: -halfX, y: -halfY }, { x: halfX, y: -halfY },
      { x: halfX, y: halfY }, { x: -halfX, y: halfY }
    ];
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
