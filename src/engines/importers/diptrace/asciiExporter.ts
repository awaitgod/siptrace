import { PcbProject } from '../../../core/types';

export { exportDipTraceAsciiSchematic } from './nativeSchematicExporter';

function esc(s: string): string {
  return (s || '').replace(/"/g, '\\"');
}

/** Exports a GOST PcbProject in DipTrace-compatible ASCII format (.dip/.asc) with full round-trip fidelity. */
export function exportDipTraceAsciiPcb(pcb: PcbProject): string {
  const lines: string[] = [
    `(Source "DipTrace-PCB" "GOSTTrace-Export")`,
    `(Board "${esc(pcb.projectName)}"`,
    `  (Units "${pcb.units}")`,
    `  (LayerCount ${pcb.layerCount})`,
    `  (BoardThickness ${pcb.boardThickness})`,
    `  (BoardOutline ${pcb.boardOutline.map((p) => `(Pt ${p.x.toFixed(3)} ${p.y.toFixed(3)})`).join(' ')})`,
    `  (Components`
  ];
  for (const c of pcb.components) {
    lines.push(`    (Component "${esc(c.refDes)}"`);
    lines.push(`      (RefDes "${esc(c.refDes)}")`);
    lines.push(`      (Value "${esc(c.value)}")`);
    lines.push(`      (Pattern "${esc(c.patternId)}")`);
    lines.push(`      (Side "${c.side}")`);
    lines.push(`      (Origin ${c.x.toFixed(3)} ${c.y.toFixed(3)})`);
    lines.push(`      (Angle ${c.angle})`);
    for (const pd of c.pads) {
      const net = c.padNets[pd.number] || '';
      lines.push(
        `      (Pad "${esc(pd.number)}" (Type "${pd.type}") (Shape "${pd.shape}") (Layer "${pd.layer}") (Origin ${pd.x.toFixed(3)} ${pd.y.toFixed(3)}) (Width ${pd.width}) (Height ${pd.height}) (Hole ${pd.holeDiameter ?? 0}) (Angle ${pd.angle ?? 0})${net ? ` (Net "${esc(net)}")` : ''})`
      );
    }
    lines.push(`    )`);
  }
  lines.push(`  )`);
  lines.push(`  (Traces`);
  for (const tr of pcb.traces) {
    const pts = tr.points.map((p) => `(Pt ${p.x.toFixed(3)} ${p.y.toFixed(3)})`).join(' ');
    lines.push(`    (Trace (Net "${esc(tr.netName)}") (Layer "${tr.layer}") (Width ${tr.width.toFixed(3)}) ${pts})`);
  }
  lines.push(`  )`);
  lines.push(`  (Vias`);
  for (const v of pcb.vias) {
    lines.push(`    (Via ${v.x.toFixed(3)} ${v.y.toFixed(3)} (Net "${esc(v.netName)}") (Outer ${v.outerDiameter}) (Hole ${v.holeDiameter}))`);
  }
  lines.push(`  )`);
  if (pcb.cutouts.length > 0) {
    lines.push(`  (Cutouts`);
    for (const cut of pcb.cutouts) {
      lines.push(`    (Cutout ${cut.points.map((p) => `(Pt ${p.x.toFixed(3)} ${p.y.toFixed(3)})`).join(' ')})`);
    }
    lines.push(`  )`);
  }
  if (pcb.keepouts.length > 0) {
    lines.push(`  (Keepouts`);
    for (const ko of pcb.keepouts) {
      lines.push(`    (Keepout (Layer "${ko.layer}") (Kind "${ko.kind}") ${ko.points.map((p) => `(Pt ${p.x.toFixed(3)} ${p.y.toFixed(3)})`).join(' ')})`);
    }
    lines.push(`  )`);
  }
  if (pcb.copperPours.length > 0) {
    lines.push(`  (CopperPours`);
    for (const pour of pcb.copperPours) {
      lines.push(`    (CopperPour (Layer "${pour.layer}") (Net "${esc(pour.netName)}") (FillType "${pour.fillType}") (Clearance ${pour.clearance}) (BoardClearance ${pour.boardClearance}) (FollowOutline ${pour.dependOnBoardOutline ? 1 : 0}) ${pour.outline.map((p) => `(Pt ${p.x.toFixed(3)} ${p.y.toFixed(3)})`).join(' ')})`);
    }
    lines.push(`  )`);
  }
  if (pcb.shapes.length > 0) {
    lines.push(`  (Shapes`);
    for (const sh of pcb.shapes) {
      if (sh.type === 'line' && sh.x2 !== undefined && sh.y2 !== undefined) {
        lines.push(`    (PcbShape (Layer "${sh.layer}") (Type "line") (Width ${sh.width}) (Pt ${sh.x1.toFixed(3)} ${sh.y1.toFixed(3)}) (Pt ${sh.x2.toFixed(3)} ${sh.y2.toFixed(3)}))`);
      } else if (sh.type === 'text' && sh.text) {
        lines.push(`    (PcbShape (Layer "${sh.layer}") (Type "text") (Text "${esc(sh.text)}") (Size ${sh.size ?? 1.5}) (Pt ${sh.x1.toFixed(3)} ${sh.y1.toFixed(3)}))`);
      }
    }
    lines.push(`  )`);
  }
  lines.push(`)`);
  return lines.join('\n');
}
