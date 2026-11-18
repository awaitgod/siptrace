import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { importCadLibrary, importCadPcb, importCadSchematic } from '../../src/engines/importers/universalImporter';

const BRAIN = 'C:/Users/Dmitry/.gemini/antigravity/brain';
const corpus = `${BRAIN}/4b6a129f-5c92-406a-a6ac-8e1dcbcc68aa/scratch/cad_corpus`;
const dt = `${BRAIN}/c42dfb40-6153-445e-a0bc-3ab876677a5d/scratch/diptrace_samples`;

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.name.toLowerCase().endsWith(x))) out.push(p);
  }
  return out;
}

async function run(label: string, files: string[], kind: 'sch' | 'pcb' | 'lib') {
  let empty = 0;
  const errs: string[] = [];
  for (const f of files) {
    const buf = new Uint8Array(fs.readFileSync(f));
    const n = path.basename(f);
    try {
      if (kind === 'sch') {
        const s = (await importCadSchematic(buf, n)).project.sheets[0];
        if (!s.components.length && !s.wires.length && !s.netPorts.length) empty++;
      } else if (kind === 'pcb') {
        const p = (await importCadPcb(buf, n)).pcb;
        if (!p.components.length && !p.traces.length && !p.vias.length && !p.shapes.length && (!p.boardOutline || p.boardOutline.length === 0)) empty++;
      } else {
        const l = await importCadLibrary(buf, n);
        if (!l.components.length && !l.patterns.length) empty++;
      }
    } catch (e) {
      if (errs.length < 3) errs.push(`${n}: ${(e as Error).message}`);
      empty++;
    }
  }
  console.log(`[${label}] files=${files.length} failedOrEmpty=${empty}`, errs);
  return { total: files.length, empty };
}

describe('Real-world corpus (skipped if absent)', () => {
  it('imports corpus', async () => {
    if (!fs.existsSync(corpus)) return;
    const r = [
      await run('kicad_sch', walk(corpus, ['.kicad_sch']), 'sch'),
      await run('kicad_pcb', walk(corpus, ['.kicad_pcb']), 'pcb'),
      await run('kicad_sym', walk(corpus, ['.kicad_sym']), 'lib'),
      await run('kicad_mod(40)', walk(corpus, ['.kicad_mod']).slice(0, 40), 'lib'),
      await run('eagle brd', walk(corpus, ['.brd']), 'pcb'),
      await run('eagle lbr', walk(corpus, ['.lbr']).slice(0, 25), 'lib'),
      await run('ltspice(40)', walk(corpus, ['.asc']).slice(0, 40), 'sch'),
      await run('proteus(25)', walk(corpus, ['.pdsprj']).slice(0, 25), 'sch'),
      await run('altium sch', walk(corpus, ['.schdoc']), 'sch'),
      await run('altium pcb', walk(corpus, ['.pcbdoc']), 'pcb'),
      await run('diptrace elixml', walk(dt, ['.elixml']), 'lib'),
      await run('diptrace libxml', walk(dt, ['.libxml']), 'lib')
    ];
    expect(r.length).toBeGreaterThan(0);
  }, 180000);
});
