import { PcbProject } from '../../core/types';
import { buildMechanicalBodies, MechanicalBody, Point3 } from './boardGeometry';

function quoted(text: string): string {
  const escaped = Array.from(text, (character) => {
    const number = character.codePointAt(0)!;
    if (character === "'") return "''";
    if (character === '\\') return '\\\\';
    if (number >= 32 && number <= 126) return character;
    const width = number > 0xffff ? 8 : 4;
    return `\\X${width / 2}\\${number.toString(16).toUpperCase().padStart(width, '0')}\\X0\\`;
  }).join('');
  return `'${escaped}'`;
}

type AddEntity = (value: string) => string;

function vector([x, y, z]: Point3): string {
  return `(${x.toFixed(10)},${y.toFixed(10)},${z.toFixed(10)})`;
}

function addBody(add: AddEntity, body: MechanicalBody): string {
  const loops = [body.outline, ...body.openings];
  const bottom = loops.map((loop) => loop.map(({ x, y }) => add(`CARTESIAN_POINT('',${vector([x, y, body.bottom])})`)));
  const top = loops.map((loop) => loop.map(({ x, y }) => add(`CARTESIAN_POINT('',${vector([x, y, body.top])})`)));
  const faces: string[] = [];
  const addFace = (boundaries: string[][], normal: Point3, reference: Point3) => {
    const bounds = boundaries.map((points, index) => {
      const loop = add(`POLY_LOOP('',(${points.join(',')}))`);
      return add(`${index === 0 ? 'FACE_OUTER_BOUND' : 'FACE_BOUND'}('',${loop},.T.)`);
    });
    const axis = add(`DIRECTION('',${vector(normal)})`);
    const xAxis = add(`DIRECTION('',${vector(reference)})`);
    const placement = add(`AXIS2_PLACEMENT_3D('',${boundaries[0][0]},${axis},${xAxis})`);
    const plane = add(`PLANE('',${placement})`);
    faces.push(add(`FACE_SURFACE('',(${bounds.join(',')}),${plane},.T.)`));
  };
  addFace(top, [0, 0, 1], [1, 0, 0]);
  addFace(bottom.map((loop) => loop.slice().reverse()), [0, 0, -1], [1, 0, 0]);
  for (const [index, loop] of loops.entries()) {
    for (const [first, start] of loop.entries()) {
      const second = (first + 1) % loop.length;
      const end = loop[second];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      addFace(
        [[bottom[index][first], bottom[index][second], top[index][second], top[index][first]]],
        [dy / length, -dx / length, 0],
        [dx / length, dy / length, 0]
      );
    }
  }
  const shell = add(`CLOSED_SHELL('',(${faces.join(',')}))`);
  return add(`FACETED_BREP(${quoted(body.name)},${shell})`);
}

export function exportPcbStep(pcb: PcbProject): string {
  const bodies = buildMechanicalBodies(pcb);
  const name = pcb.projectName || 'PCB';
  const entities: string[] = [];
  const add: AddEntity = (value) => {
    const id = `#${entities.length + 1}`;
    entities.push(`${id}=${value};`);
    return id;
  };
  const application = add("APPLICATION_CONTEXT('core data for automotive mechanical design processes')");
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${application})`);
  const productContext = add(`PRODUCT_CONTEXT('',${application},'mechanical')`);
  const product = add(`PRODUCT(${quoted(name)},${quoted(name)},'',(${productContext}))`);
  const formation = add(`PRODUCT_DEFINITION_FORMATION('','',${product})`);
  const definitionContext = add(`PRODUCT_DEFINITION_CONTEXT('part definition',${application},'design')`);
  const definition = add(`PRODUCT_DEFINITION('design','',${formation},${definitionContext})`);
  const shape = add(`PRODUCT_DEFINITION_SHAPE('','',${definition})`);
  const mm = add('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))');
  const radian = add('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))');
  const steradian = add('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())');
  const tolerance = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-6),${mm},'distance_accuracy_value','')`);
  const context = add(
    `(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${tolerance}))` +
    `GLOBAL_UNIT_ASSIGNED_CONTEXT((${mm},${radian},${steradian}))REPRESENTATION_CONTEXT('','3D'))`
  );
  const solids = bodies.map((body) => addBody(add, body));
  const representation = add(`FACETED_BREP_SHAPE_REPRESENTATION('',(${solids.join(',')}),${context})`);
  add(`SHAPE_DEFINITION_REPRESENTATION(${shape},${representation})`);

  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('SIPTrace mechanical board model'),'2;1');",
    `FILE_NAME(${quoted(`${name}.stp`)},'${new Date().toISOString().slice(0, 19)}',(''),(''),'SIPTrace','SIPTrace','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));",
    'ENDSEC;',
    'DATA;',
    ...entities,
    'ENDSEC;',
    'END-ISO-10303-21;'
  ].join('\n');
}
