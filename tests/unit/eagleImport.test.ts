import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importCadPcbSync } from '../../src/engines/importers';

describe('Eagle board import', () => {
  it('preserves SparkFun contactrefs and reports omitted polygons without inventing pads for logos', () => {
    const content = readFileSync('audit/external/sparkfun-rfm22b/SparkFun_RF_Transceiver-RFM22B.brd', 'utf8');
    const { pcb, report } = importCadPcbSync(content, 'sparkfun.brd');
    expect(pcb.components.reduce((n, c) => n + Object.keys(c.padNets).length, 0)).toBe(29);
    const module = pcb.components.find((c) => c.patternId === 'RFM22-XXX-S2');
    expect(module?.padNets['5']).toBe('3.3V');
    expect(module?.padNets['16']).toBe('GND');
    expect(pcb.components.find((c) => c.patternId === 'SFE-NEW-WEBLOGO')?.pads).toEqual([]);
    expect(pcb.components.find((c) => c.patternId === 'CREATIVE_COMMONS')?.pads).toEqual([]);
    expect(report.warnings?.join(' ')).toContain('Полигоны цепей Eagle (2) не импортированы');
    expect(report.warnings?.join(' ')).toContain('геометрия');
  });

  it('leaves unknown and conflicting contacts unassigned and reports them', () => {
    const content = `<eagle><drawing><board><libraries><library name="L"><packages><package name="P"><smd name="1" x="0" y="0" dx="1" dy="1"/></package></packages></library></libraries><elements><element name="R1" library="L" package="P" x="10" y="10"/></elements><signals><signal name="A"><contactref element="R1" pad="1"/><contactref element="R1" pad="missing"/></signal><signal name="B"><contactref element="R1" pad="1"/></signal><signal name="C"><contactref element="R1" pad="1"/></signal></signals></board></drawing></eagle>`;
    const { pcb, report } = importCadPcbSync(content, 'conflict.brd');
    expect(pcb.components[0].padNets).toEqual({});
    expect(report.warnings?.join(' ')).toContain('Не удалось однозначно восстановить');
  });
});
