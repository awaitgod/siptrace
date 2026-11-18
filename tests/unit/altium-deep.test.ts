import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { isOle2Binary, readOle2Streams } from '../../src/engines/importers/ecad/ole2Reader';
import { importCadPcb } from '../../src/engines/importers/universalImporter';

describe('Altium PcbDoc binary import', () => {
  const radxaPcb = 'C:/Users/Dmitry/.gemini/antigravity/brain/c42dfb40-6153-445e-a0bc-3ab876677a5d/scratch/qa_cad_formats/samples/altium/Radxa-CM5-IO-ASCII/Radxa CM5 IO Board v2200.PcbDoc';

  it('imports real-world Altium binary PCB file via universal importCadPcb', async () => {
    if (!fs.existsSync(radxaPcb)) return;
    const buf = new Uint8Array(fs.readFileSync(radxaPcb));
    expect(isOle2Binary(buf)).toBe(true);

    const res = await importCadPcb(buf, 'Radxa CM5 IO Board v2200.PcbDoc');
    expect(res.detectedFormat).toBe('Altium Designer Binary (.PcbDoc)');
    expect(res.pcb.components.length).toBeGreaterThan(400);
    expect(res.pcb.traces.length).toBeGreaterThan(50000);
    expect(res.pcb.vias.length).toBeGreaterThan(2000);
    expect(res.pcb.boardOutline.length).toBeGreaterThanOrEqual(4);
  });
});
