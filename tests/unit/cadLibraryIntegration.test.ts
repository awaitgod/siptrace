import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteImportedLibraryBundle,
  exportLibraryBundleAsGostlib,
  getUserComponentLibraries,
  getUserPatternLibraries,
  loadImportedLibraryBundles,
  loadUserComponents,
  loadUserPatterns,
  registerImportedLibraryBundle
} from '../../src/core/store';
import { importExternalCadLibrary } from '../../src/engines/importers';
import { createZipArchive, utf8Encode } from '../../src/core/utils/zipArchive';
import { validateSchematic } from '../../src/core/schematic/validation';
import { extractSchematicNetlist } from '../../src/engines/netlist/netlistExtractor';
import { convertSchematicToPcb } from '../../src/engines/netlist/schematicToPcbConverter';
import { generateGostBom } from '../../src/gost/gostBom';
import { GOST_COMPONENT_LIBRARIES } from '../../src/gost/libraries/gostComponents';
import { createDefaultGostTitleBlock } from '../../src/gost/gostTitleBlock';
import { SchematicProject } from '../../src/core/types';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const mockStorage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    }
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true
  });
}

describe('External CAD Library Integration (DipTrace, KiCad, Eagle, EasyEDA, ZIP)', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('imports KiCad .kicad_sym + .kicad_mod inside .zip, cross-links footprints, and drives Schematic -> PCB -> BOM', async () => {
    const kicadSym = `(kicad_symbol_lib (version 20220914) (generator kicad_symbol_editor)
      (symbol "LM358_EXT" (pin_names (offset 1.016)) (in_bom yes) (on_board yes)
        (property "Reference" "U" (at 0 6.35 0))
        (property "Value" "LM358N" (at 0 -6.35 0))
        (property "Footprint" "Package_DIP:DIP-8_W7.62mm" (at 0 -10 0))
        (symbol "LM358_EXT_1_1"
          (rectangle (start -5.08 5.08) (end 5.08 -5.08) (stroke (width 0.254)))
          (pin input line (at -7.62 2.54 0) (length 2.54) (name "IN+" (effects (font (size 1.27 1.27)))) (number "3" (effects (font (size 1.27 1.27)))))
          (pin output line (at 7.62 0 180) (length 2.54) (name "OUT" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
        )
      )
    )`;

    const kicadMod = `(footprint "DIP-8_W7.62mm" (version 20221018) (generator pcbnew)
      (layer "F.Cu")
      (fp_line (start -3 -5) (end 3 -5) (layer "F.SilkS") (width 0.15))
      (pad "1" thru_hole rect (at -3.81 -3.81) (size 1.6 1.6) (drill 0.8) (layers *.Cu *.Mask))
      (pad "3" thru_hole circle (at -3.81 1.27) (size 1.6 1.6) (drill 0.8) (layers *.Cu *.Mask))
    )`;

    const zipBytes = createZipArchive({
      'lib/analog.kicad_sym': utf8Encode(kicadSym),
      'lib/DIP-8_W7.62mm.kicad_mod': utf8Encode(kicadMod)
    });

    const imported = await importExternalCadLibrary(zipBytes, 'analog_pack.zip', { adaptToGost: true });
    expect(imported.components.length).toBe(1);
    expect(imported.patterns.length).toBe(1);

    const comp = imported.components[0];
    const pat = imported.patterns[0];
    expect(comp.name).toBe('LM358_EXT');
    expect(comp.refDesPrefix).toBe('DA'); // GOST 2.710-81 for analog/opamp U -> DA or DD
    expect(comp.patternId).toBe(pat.id);
    expect(pat.pads.length).toBe(2);

    const bundle = registerImportedLibraryBundle({
      name: imported.libraryName,
      sourceFormat: imported.detectedFormat,
      sourceFile: 'analog_pack.zip',
      category: imported.categories[0],
      gostAdapted: true,
      components: imported.components,
      patterns: imported.patterns
    });

    expect(loadImportedLibraryBundles().length).toBe(1);
    expect(getUserComponentLibraries().some((l) => l.id === bundle.id && l.name.includes(bundle.name))).toBe(true);
    expect(getUserPatternLibraries().some((l) => l.name.includes(bundle.name))).toBe(true);

    // Place imported component + GOST resistor on schematic, wire pin 1 <-> pin 1
    const pin1 = comp.parts[0].pins.find((p) => p.number === '1')!;
    const resDef = GOST_COMPONENT_LIBRARIES.flatMap((l) => l.components).find((c) => c.refDesPrefix === 'R')!;
    const resPin1 = resDef.parts[0].pins[0];
    const compX = 100;
    const compY = 100;
    const tipX = compX + pin1.x;
    const tipY = compY + pin1.y;
    const resX = tipX + 25;
    const resY = tipY - resPin1.y;

    const project: SchematicProject = validateSchematic({
      version: '1.0',
      filePath: 'ExternalLibFlowTest.gostsch',
      projectName: 'ExternalLibFlowTest',
      units: 'mm',
      gridSize: 2.5,
      sheets: [
        {
          id: 'sheet_1',
          name: 'Лист 1',
          format: 'A3_L',
          titleBlock: createDefaultGostTitleBlock({ name: 'ExternalLibFlowTest', designation: 'TEST.001' }),
          components: [
            {
              id: 'sc_ext_1',
              componentDefId: comp.id,
              refDes: 'DA1',
              value: comp.defaultValue,
              patternId: comp.patternId,
              partIndex: 1,
              x: compX,
              y: compY,
              angle: 0,
              flipX: false,
              flipY: false
            },
            {
              id: 'sc_r_1',
              componentDefId: resDef.id,
              refDes: 'R1',
              value: '10 кОм',
              partIndex: 1,
              x: resX,
              y: resY,
              angle: 0,
              flipX: false,
              flipY: false
            }
          ],
          wires: [
            {
              id: 'w1',
              points: [
                { x: tipX, y: tipY },
                { x: resX + resPin1.x, y: resY + resPin1.y }
              ],
              netName: 'SIG_OUT'
            }
          ],
          junctions: [],
          noConnects: [],
          netPorts: [],
          pinLabels: [],
          buses: [],
          busTaps: [],
          shapes: [],
          texts: [],
          tables: [],
          hierarchyBlocks: [],
          diffPairs: []
        }
      ],
      activeSheetId: 'sheet_1',
      customComponentDefs: {},
      customPatternDefs: {}
    });

    const nets = extractSchematicNetlist(project);
    const sigNet = nets.find((n) => n.netName === 'SIG_OUT');
    expect(sigNet).toBeDefined();
    expect(sigNet!.nodes.some((n) => n.refDes === 'DA1' && n.padNumber === '1')).toBe(true);
    expect(sigNet!.nodes.some((n) => n.refDes === 'R1')).toBe(true);

    const pcb = convertSchematicToPcb(project);
    const pcbDa1 = pcb.components.find((c) => c.refDes === 'DA1');
    expect(pcbDa1).toBeDefined();
    expect(pcbDa1!.patternId).toBe(pat.id);
    expect(pcbDa1!.pads.length).toBe(2);

    const bom = generateGostBom(project);
    expect(bom.some((b) => b.refDesList.includes('DA1'))).toBe(true);

    // Export bundle as .gostlib & clean delete
    const gostlibText = exportLibraryBundleAsGostlib(bundle.id);
    const reimported = await importExternalCadLibrary(gostlibText, 'reimport.gostlib');
    expect(reimported.components.length).toBe(1);
    expect(reimported.patterns.length).toBe(1);

    deleteImportedLibraryBundle(bundle.id);
    expect(loadImportedLibraryBundles().length).toBe(0);
    expect(loadUserComponents().length).toBe(0);
    expect(loadUserPatterns().length).toBe(0);
  });

  it('imports Eagle .lbr devicesets/symbols/packages and maps pin-to-pad connections', async () => {
    const eagleLbr = `<?xml version="1.0" encoding="utf-8"?>
<eagle version="9.6.2">
  <drawing>
    <library>
      <packages>
        <package name="SOT23-3">
          <wire x1="-1.5" y1="-0.7" x2="1.5" y2="-0.7" width="0.12" layer="21"/>
          <smd name="1" x="-0.95" y="-1.1" dx="0.6" dy="0.7" layer="1"/>
          <smd name="2" x="0.95" y="-1.1" dx="0.6" dy="0.7" layer="1"/>
          <smd name="3" x="0" y="1.1" dx="0.6" dy="0.7" layer="1"/>
        </package>
      </packages>
      <symbols>
        <symbol name="NPN_BJT">
          <wire x1="-2.54" y1="2.54" x2="-2.54" y2="-2.54" width="0.254" layer="94"/>
          <pin name="B" x="-7.62" y="0" length="middle" rot="R0"/>
          <pin name="C" x="0" y="5.08" length="middle" rot="R270"/>
          <pin name="E" x="0" y="-5.08" length="middle" rot="R90"/>
        </symbol>
      </symbols>
      <devicesets>
        <deviceset name="BC817" prefix="Q">
          <gates><gate name="G$1" symbol="NPN_BJT" x="0" y="0"/></gates>
          <devices>
            <device name="" package="SOT23-3">
              <connects>
                <connect gate="G$1" pin="B" pad="1"/>
                <connect gate="G$1" pin="E" pad="2"/>
                <connect gate="G$1" pin="C" pad="3"/>
              </connects>
            </device>
          </devices>
        </deviceset>
      </devicesets>
    </library>
  </drawing>
</eagle>`;

    const res = await importExternalCadLibrary(eagleLbr, 'transistors.lbr', { adaptToGost: true });
    expect(res.patterns.length).toBe(1);
    expect(res.components.length).toBe(1);
    expect(res.components[0].refDesPrefix).toBe('VT'); // Q -> VT by GOST 2.710-81
    expect(res.components[0].parts[0].pins.length).toBe(3);
    const pinB = res.components[0].parts[0].pins.find((p) => p.name === 'B');
    expect(pinB?.padMapping).toBe('1');
    expect(res.components[0].patternId).toBe(res.patterns[0].id);
  });

  it('imports EasyEDA component/footprint JSON with pads and silkscreen', async () => {
    const easyJson = JSON.stringify({
      title: 'NE555_EASY',
      head: { c_para: { name: 'NE555DR', pre: 'U?', package: 'SOIC-8' } },
      shape: [
        'R~0~0~20~20~#880000~1~0~none',
        'P~show~0~1~-15~5~0~gge1~0^^-15~5^^M -15 5 h 5^^#000~gge2^^1~GND'
      ],
      packageDetail: {
        title: 'SOIC-8',
        dataStr: {
          shape: [
            'PAD~RECT~4000~3000~1.5~0.6~1~~1~0~',
            'PAD~RECT~4000~3005~1.5~0.6~1~~2~0~',
            'TRACK~0.2~3~~4000 2995 4020 2995~gge9'
          ]
        }
      }
    });

    const res = await importExternalCadLibrary(easyJson, 'NE555.json', { adaptToGost: false });
    expect(res.components.length).toBe(1);
    expect(res.patterns.length).toBe(1);
    expect(res.patterns[0].pads.length).toBe(2);
    expect(res.components[0].patternId).toBe(res.patterns[0].id);
  });

  it('imports real DipTrace binary .eli + .lib files (arduino) if present on disk', async () => {
    const eliPath = 'C:\\Users\\Dmitry\\.gemini\\antigravity\\brain\\c42dfb40-6153-445e-a0bc-3ab876677a5d\\scratch\\diptrace_samples\\unwireddevices_diptrace\\arduino.eli';
    const libPath = 'C:\\Users\\Dmitry\\.gemini\\antigravity\\brain\\c42dfb40-6153-445e-a0bc-3ab876677a5d\\scratch\\diptrace_samples\\unwireddevices_diptrace\\arduino.lib';
    if (!fs.existsSync(eliPath) || !fs.existsSync(libPath)) return;

    const eliRes = await importExternalCadLibrary(new Uint8Array(fs.readFileSync(eliPath)), 'arduino.eli');
    const libRes = await importExternalCadLibrary(new Uint8Array(fs.readFileSync(libPath)), 'arduino.lib');
    expect(eliRes.components.length).toBeGreaterThan(0);
    expect(libRes.patterns.length).toBeGreaterThan(0);
  });
});
