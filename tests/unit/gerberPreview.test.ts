import { describe, expect, it } from 'vitest';
import { parseGerberPreview } from '../../src/engines/camExport';
import { importCadPcbSync } from '../../src/engines/importers';

const words = [
  'G04 Gerber test*', '%FSLAX46Y46*%', '%MOIN*%', '%ADD10C,0.010*%',
  'D10*', 'X1000000Y2000000D03*', 'X2000000Y2000000D02*', 'X3000000Y2000000D01*', 'M02*'
];

describe('Gerber preview command stream', () => {
  it('parses identical geometry with or without line breaks', () => {
    const separate = parseGerberPreview(words.join('\n'));
    const packed = parseGerberPreview(words.join(''));
    expect(packed).toEqual(separate);
    const board = importCadPcbSync(words.join(''), 'packed.gbr').pcb;
    expect(board.vias).toHaveLength(1);
    expect(board.traces).toHaveLength(1);
    expect(packed).toEqual([
      { kind: 'flash', pts: [{ x: 25.4, y: 50.8 }], width: 0.254, shape: 'C', w: 0.254, h: 0.254, angleDeg: undefined },
      { kind: 'line', pts: [{ x: 50.8, y: 50.8 }, { x: 76.19999999999999, y: 50.8 }], width: 0.254 }
    ]);
  });

  it('keeps multiword aperture macros intact and handles multiline parameter blocks', () => {
    const macro = '%AMIGNORED*\n1,1,1,0,0*\n1,0,0.5,0,0*\n%';
    const result = parseGerberPreview('%FSLAX46Y46*%\n%MOMM*%' + macro + '%ADD10R,1X2*%D10*X1000000Y2000000D03*M02*');
    expect(result).toEqual([{ kind: 'flash', pts: [{ x: 1, y: 2 }], width: 1, shape: 'R', w: 1, h: 2, angleDeg: undefined }]);
  });
});
