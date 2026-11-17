import { PcbProject } from '../../core/types';
import { buildMechanicalBodies, Point3, triangulateBody } from './boardGeometry';

function nameOnOneLine(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() || 'PCB';
}

function yUp([x, y, z]: Point3): Point3 {
  return [x, z, -y];
}

function numbers(vector: Point3): string {
  return vector.map((value) => value.toFixed(6)).join(' ');
}

function normal(a: Point3, b: Point3, c: Point3): Point3 {
  const u = b.map((value, index) => value - a[index]);
  const v = c.map((value, index) => value - a[index]);
  const x = u[1] * v[2] - u[2] * v[1];
  const y = u[2] * v[0] - u[0] * v[2];
  const z = u[0] * v[1] - u[1] * v[0];
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

export function exportPcbObj3D(pcb: PcbProject): string {
  const lines = ['# SIPTrace EDA 3D Board Mesh (OBJ, Y-up, mm)', `o ${nameOnOneLine(pcb.projectName)}`];
  let offset = 1;
  for (const body of buildMechanicalBodies(pcb)) {
    const { vertices, triangles } = triangulateBody(body);
    lines.push(`g ${nameOnOneLine(body.name).replace(/\s+/g, '_')}`);
    for (const vertex of vertices) lines.push(`v ${numbers(yUp(vertex))}`);
    for (const face of triangles) lines.push(`f ${face.map((index) => index + offset).join(' ')}`);
    offset += vertices.length;
  }
  return lines.join('\n');
}

export function exportPcbStlAscii(pcb: PcbProject): string {
  const name = nameOnOneLine(pcb.projectName);
  const lines = [`solid ${name}`];
  for (const body of buildMechanicalBodies(pcb)) {
    const { vertices, triangles } = triangulateBody(body);
    for (const [a, b, c] of triangles) {
      lines.push(
        `  facet normal ${numbers(normal(vertices[a], vertices[b], vertices[c]))}`,
        '    outer loop',
        ...[a, b, c].map((index) => `      vertex ${numbers(vertices[index])}`),
        '    endloop',
        '  endfacet'
      );
    }
  }
  lines.push(`endsolid ${name}`);
  return lines.join('\n');
}

export function exportPcbWrl(pcb: PcbProject): string {
  const lines = [
    '#VRML V2.0 utf8',
    `# SIPTrace EDA — ${nameOnOneLine(pcb.projectName)}`,
    'Transform { scale 0.001 0.001 0.001 children ['
  ];
  for (const [index, body] of buildMechanicalBodies(pcb).entries()) {
    const { vertices, triangles } = triangulateBody(body);
    const color = index === 0 ? '0.05 0.38 0.18' : '0.16 0.16 0.18';
    lines.push(
      `  # ${nameOnOneLine(body.name)}`,
      '  Shape {',
      `    appearance Appearance { material Material { diffuseColor ${color} } }`,
      '    geometry IndexedFaceSet {',
      '      coord Coordinate { point [',
      ...vertices.map((vertex) => `        ${numbers(yUp(vertex))},`),
      '      ] }',
      '      coordIndex [',
      ...triangles.map((face) => `        ${face.join(', ')}, -1,`),
      '      ]',
      '    }',
      '  }'
    );
  }
  lines.push('] }');
  return lines.join('\n');
}
