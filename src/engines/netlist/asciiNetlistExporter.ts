import { SchematicProject } from '../../core/types';
import { extractSchematicNetlist } from './netlistExtractor';

/** Exports schematic connectivity in DipTrace ASCII netlist S-expression format. */
export function exportDipTraceAsciiNetlist(sch: SchematicProject): string {
  const netlist = extractSchematicNetlist(sch);
  const lines: string[] = [
    `(Source "GOSTTrace-EDA 1.0")`,
    `(Project "${sch.projectName}")`,
    `(Components`
  ];
  for (const s of sch.sheets) {
    for (const c of s.components) {
      if (c.refDes.startsWith('#')) continue;
      lines.push(`  (Component "${c.refDes}" "${c.typeName}" "${c.value}" "${c.patternId}")`);
    }
  }
  lines.push(`)`, `(Nets`);
  for (const net of netlist) {
    const nodeStr = net.nodes.map((n) => `(${n.refDes} "${n.padNumber}")`).join(' ');
    lines.push(`  (Net "${net.netName}" ${nodeStr})`);
  }
  lines.push(`)`);
  return lines.join('\n');
}
