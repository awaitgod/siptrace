import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectDipTraceBinaryFormat,
  importCadLibrary,
  importCadPcb,
  importCadSchematic,
  importCadSchematicSync
} from '../../src/engines/importers';
import { extractSchematicNetlist } from '../../src/engines/netlist/netlistExtractor';
import { convertSchematicToPcb } from '../../src/engines/netlist/schematicToPcbConverter';
import { createZipArchive } from '../../src/core/utils/zipArchive';

/** Minimal DipTrace binary writer helper for deterministic self-contained unit tests. */
class TestDipWriter {
  private buf: number[] = [];

  raw(bytes: number[]) {
    this.buf.push(...bytes);
  }
  strAscii(s: string) {
    for (let i = 0; i < s.length; i++) this.buf.push(s.charCodeAt(i));
  }
  sig(s: string) {
    this.buf.push(s.length);
    this.strAscii(s);
  }
  int(v: number) {
    const n = v + 1_000_000;
    this.buf.push((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);
  }
  num(v: number) {
    const n = Math.round(v * 10_000) + 1_000_000_000;
    this.buf.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
  }
  mm(vMm: number) {
    this.num(vMm * 3);
  }
  bool(b: boolean) {
    this.buf.push(b ? 1 : 0);
  }
  color(rgb = 0) {
    this.buf.push(rgb & 0xff, (rgb >> 8) & 0xff, (rgb >> 16) & 0xff);
  }
  textU16(s: string) {
    this.buf.push((s.length >> 8) & 0xff, s.length & 0xff);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      this.buf.push((c >> 8) & 0xff, c & 0xff);
    }
  }
  bytes(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

function buildMinimalBinaryDch(): Uint8Array {
  const w = new TestDipWriter();
  w.sig('DTSCHEM');
  w.int(42); // v42 (UTF-16BE, radians)
  // Preamble
  w.num(1); w.int(0); w.int(0); // Scale, Xpos, Ypos
  w.int(0); // ActiveSheet
  w.int(1); w.textU16('Лист 1'); w.int(0); // 1 page
  w.int(0); // legacy pictures
  w.int(0); w.int(0); w.int(0); w.int(0); // ShowText..TextAlign2
  w.bool(false); w.num(0); w.num(0); // HidePower, OriginX, OriginY
  w.textU16(''); w.textU16(''); // FieldName1/2
  w.bool(false); w.num(0.2); w.num(1); // PartFont...
  w.int(0); // 0 net classes
  w.int(1); // 1 component (R1)

  // Component 0: R1 (RES_0805, 10k)
  w.bool(true); w.bool(false);
  w.int(0); w.int(0); w.int(0); w.int(0); w.int(0); w.int(0); w.int(0);
  w.mm(20); w.mm(30); w.mm(10); w.mm(4);
  w.textU16('RES_0805'); w.textU16('R1'); w.textU16('10k'); w.textU16('R'); w.textU16('RES_0805');
  w.int(0); w.int(0); w.bool(false);
  w.int(1); w.int(0); w.textU16('Part 1'); w.textU16(''); w.bool(false);
  w.int(0); w.int(0); w.int(0);
  w.num(0); w.num(0); w.num(0); w.num(0);
  w.textU16(''); w.int(1);
  w.int(0); // 0 user fields
  w.int(0); w.int(0); w.bool(false); w.num(0);
  w.textU16(''); w.int(0); w.int(0); w.textU16(''); w.textU16(''); w.bool(false); w.bool(false);

  // 2 pins for R1
  w.int(2);
  for (const [pIdx, pX, orient] of [[1, -2.5, 0], [2, 2.5, 2]] as const) {
    w.bool(true); w.int(0); w.int(orient); w.int(pIdx); w.int(-1);
    w.mm(pX); w.mm(0); w.mm(2.5);
    w.textU16(String(pIdx)); w.textU16(String(pIdx));
    w.bool(false); w.bool(false);
    w.num(0); w.num(0); w.num(0); w.num(0);
    w.int(1); w.bool(false); w.bool(false); w.textU16(''); w.bool(false);
    w.int(5); w.num(0.2); w.num(1);
  }
  w.int(0); // 0 symbol shapes

  // Embedded Pattern (RES_0805)
  w.int(0); // 0 internal connections
  w.int(0); w.bool(false); w.bool(false); w.bool(false); w.bool(false);
  w.int(2); w.int(0); w.num(0); w.num(0); w.bool(false); w.num(0); w.bool(false); w.int(0);
  w.mm(4); w.mm(2); w.mm(1.2); w.mm(1.3); w.int(2); w.bool(true); w.mm(0); w.mm(0); w.int(0);
  w.textU16('RES_0805'); w.mm(0); w.mm(0);
  w.mm(0); w.mm(0); w.bool(false);
  w.int(0); // uf
  w.int(0); // def pad pts
  w.int(2); // 2 pads
  for (const [num, px] of [[1, -1], [2, 1]] as const) {
    w.bool(false); w.int(num); w.mm(px); w.mm(0);
    w.textU16(String(num)); w.textU16('');
    w.mm(1.2); w.mm(1.3); w.mm(0); w.mm(0); w.int(0); w.bool(true); w.int(2); w.bool(true); w.int(0);
    w.bool(false); w.bool(false);
    w.bool(false); w.bool(false); w.bool(false); w.bool(false);
    w.num(-1000); w.num(-1000);
  }
  w.int(0); // pat shapes
  w.int(0); // holes
  w.int(0); // dims
  w.textU16(''); for (let i = 0; i < 9; i++) w.num(0); w.bool(false); w.bool(false);

  // PageConnectors, SchDrawings, Nets, Buses
  w.int(0); // pageConns
  w.int(0); // schShapes
  w.int(1); // 1 net ("VCC")
  w.bool(true); w.bool(false); w.bool(false); w.bool(false);
  w.int(0); w.int(0); w.int(0); w.int(0);
  w.textU16('VCC'); w.num(-1); w.num(-1); w.int(0); w.bool(false);
  w.int(1); w.int(0); w.int(0); // 1 net pin ref (comp 0, pin 0)
  w.int(1); // 1 wire line
  w.int(0); w.int(0); w.int(0); w.int(0); w.int(0); w.int(0);
  w.int(0); w.int(0); w.int(0); w.int(0); w.int(0); w.int(0); w.bool(false);
  w.int(2); // 2 points connecting to pin 1 of R1 (at 20 - 5 = 15, 30)
  w.mm(15); w.mm(30); w.int(0);
  w.mm(15); w.mm(15); w.int(0);
  w.bool(false); w.int(-1); w.bool(false); w.int(0);
  w.bool(false); w.bool(false); w.color(0);
  w.int(0); // 0 buses

  return w.bytes();
}

function buildMinimalBinaryLib(): Uint8Array {
  const w = new TestDipWriter();
  w.sig('DTCLIB');
  w.int(24); // v24
  w.int(1); // 1 pattern
  w.textU16('TestLib');
  w.textU16('Test Hint');
  w.int(0); // 0 categories
  // Pattern 0
  for (let i = 0; i < 4; i++) w.bool(false);
  w.mm(5); w.mm(3); w.num(0); w.num(0); w.bool(false); w.num(0); w.bool(false);
  w.int(0); w.int(2); w.int(1); w.int(0);
  w.mm(1.2); w.mm(1.4); w.int(2); w.bool(true); w.mm(0); w.mm(0); w.int(0);
  w.int(0); // def pad pts
  w.num(0); w.num(0); w.num(0); w.int(0);
  for (let i = 0; i < 4; i++) w.num(0);
  w.int(0); w.int(0);
  for (let i = 0; i < 4; i++) w.int(0);
  w.num(-1000); w.num(-1000);
  w.int(2); // 2 pads
  for (const [n, px] of [[1, -1.5], [2, 1.5]] as const) {
    w.int(n); w.mm(px); w.mm(0); w.textU16(String(n)); w.textU16('');
    w.mm(1.2); w.mm(1.4); w.mm(0); w.mm(0); w.int(0); w.bool(true); w.int(2); w.bool(true); w.int(0);
    w.bool(false); w.bool(false);
    for (let i = 0; i < 4; i++) w.int(0);
    w.num(-1000); w.num(-1000);
    w.int(-1); w.num(0); w.num(0); w.num(0); w.num(0);
    w.int(0); for (let i = 0; i < 4; i++) w.num(0);
    w.int(0); w.int(0);
  }
  w.int(0); w.int(0); w.int(0); // shapes, holes, dims
  w.textU16('SOIC_TEST'); w.textU16('U'); w.textU16('');
  w.mm(0); w.mm(0);
  w.bool(true); w.bool(true); w.int(0); w.int(0);
  w.textU16(''); w.textU16(''); w.textU16(''); w.bool(false); w.bool(false); w.textU16('');
  w.int(0); w.int(0);
  w.textU16(''); for (let i = 0; i < 9; i++) w.num(0); w.bool(false);
  w.textU16(''); w.bool(false); w.int(0);
  w.num(0); w.num(0); w.mm(1.5); w.color(0); w.int(0);
  w.bool(false);
  w.int(1); w.textU16(''); w.textU16('SMD'); w.int(0); w.int(0); w.int(0);
  w.int(4); for (let i = 0; i < 4; i++) w.bool(false);
  for (let i = 0; i < 5; i++) w.textU16('');
  return w.bytes();
}

describe('Native DipTrace binary format decoding & GOST conversion', () => {
  it('imports native DipTrace binary .dch (raw, binary-string, and inside .zip) and sets GOST schematic + netlist', async () => {
    const dchBytes = buildMinimalBinaryDch();
    const ident = detectDipTraceBinaryFormat(dchBytes);
    expect(ident?.family).toBe('schematic');
    expect(ident?.version).toBe(42);

    const res = await importCadSchematic(dchBytes, 'test_design.dch');
    expect(res.detectedFormat).toContain('DipTrace Binary Schematic');
    expect(res.project.sheets[0].components.length).toBe(1);
    expect(res.project.sheets[0].components[0].refDes).toBe('R1');
    expect(res.project.sheets[0].components[0].value).toBe('10 кОм');
    expect(res.project.sheets[0].wires.length).toBe(1);
    expect(res.project.sheets[0].titleBlock.enabled).toBe(true);

    // Verify wire stays connected to R1 pin 1 after GOST UGO replacement!
    const netlist = extractSchematicNetlist(res.project);
    expect(netlist.some((n) => n.netName === 'VCC' && n.nodes.some((nd) => nd.refDes === 'R1'))).toBe(true);

    // Sync binary-string path
    const latinStr = Array.from(dchBytes, (b) => String.fromCharCode(b)).join('');
    const syncRes = importCadSchematicSync(latinStr, 'test_design.dch');
    expect(syncRes.project.sheets[0].components[0].refDes).toBe('R1');

    // Inside ZIP
    const zip = createZipArchive({ 'test_design.dch': dchBytes });
    const zipRes = await importCadSchematic(zip, 'test_design.zip');
    expect(zipRes.project.sheets[0].components.length).toBe(1);
  });

  it('imports native DipTrace binary .lib pattern library', async () => {
    const libBytes = buildMinimalBinaryLib();
    const res = await importCadLibrary(libBytes, 'test_pats.lib');
    expect(res.patterns.length).toBe(1);
    expect(res.patterns[0].name).toBe('SOIC_TEST');
    expect(res.patterns[0].pads.length).toBe(2);
    expect(res.patterns[0].pads[0].x).toBeCloseTo(-1.5, 2);
  });

  it('parses all downloaded real DipTrace binary .dch, .dip, .eli, .lib samples if present on disk', async () => {
    const samplesDir = 'C:\\Users\\Dmitry\\.gemini\\antigravity\\brain\\c42dfb40-6153-445e-a0bc-3ab876677a5d\\scratch\\diptrace_samples';
    if (!fs.existsSync(samplesDir)) return;

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '.git') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(dch|dip|eli|lib)$/i.test(entry.name)) files.push(full);
      }
    };
    walk(samplesDir);
    expect(files.length).toBeGreaterThan(20);

    let dchCount = 0;
    let dipCount = 0;
    let eliCount = 0;
    let libCount = 0;
    const failures: string[] = [];

    for (const file of files) {
      const bytes = new Uint8Array(fs.readFileSync(file));
      const ext = path.extname(file).toLowerCase();
      try {
        if (ext === '.dch') {
          const res = await importCadSchematic(bytes, path.basename(file));
          expect(res.project.sheets.length).toBeGreaterThan(0);
          expect(res.project.sheets[0].components.length + res.project.sheets[0].netPorts.length).toBeGreaterThan(0);
          const pcbFromSch = convertSchematicToPcb(res.project);
          expect(pcbFromSch.components.length).toBeGreaterThan(0);
          dchCount++;
        } else if (ext === '.dip') {
          const res = await importCadPcb(bytes, path.basename(file));
          expect(res.pcb.boardOutline.length).toBeGreaterThanOrEqual(3);
          dipCount++;
        } else if (ext === '.eli') {
          const res = await importCadLibrary(bytes, path.basename(file));
          expect(res.components.length).toBeGreaterThan(0);
          eliCount++;
        } else if (ext === '.lib') {
          const res = await importCadLibrary(bytes, path.basename(file));
          expect(res.patterns.length).toBeGreaterThan(0);
          libCount++;
        }
      } catch (err) {
        failures.push(`${path.relative(samplesDir, file)}: ${(err as Error).message}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(`DipTrace sample failures (${failures.length}):\n${failures.slice(0, 15).join('\n')}`);
    }
    expect(dchCount).toBeGreaterThanOrEqual(8);
    expect(dipCount).toBeGreaterThanOrEqual(15);
    expect(eliCount).toBeGreaterThanOrEqual(50);
    expect(libCount).toBeGreaterThanOrEqual(50);
  }, 60_000);
});
