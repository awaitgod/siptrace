import { SchematicProject } from '../../core/types';
import { createDefaultGostTitleBlock } from '../gostTitleBlock';
import { uid } from '../../core/geometry';

// Демо-проект 2: «Контроллер К1986ВЕ92QI + Стабилизатор КР142ЕН5А»
export function createDemoMcuGostSchematic(): SchematicProject {
  return {
    version: '1.0',
    filePath: 'C:\\Projects\\GOSTTrace\\Контроллер_К1986ВЕ92.gostsch',
    projectName: 'Контроллер К1986ВЕ92QI',
    units: 'mm',
    gridSize: 2.5,
    origin: { x: 0, y: 0 },
    activeSheetId: 'sheet_1',
    netClasses: [
      {
        id: 'nc_default',
        name: 'Сигнальные',
        traceWidth: 0.2,
        minWidth: 0.15,
        maxWidth: 5.0,
        clearance: 0.18,
        viaOuterDiameter: 0.65,
        viaHoleDiameter: 0.3
      }
    ],
    netClassAssignments: {},
    customComponentDefs: {},
    customPatternDefs: {},
    sheets: [
      {
        id: 'sheet_1',
        name: 'Лист 1',
        format: 'A3_L',
        titleBlock: createDefaultGostTitleBlock({
          designation: 'ГТРС.468332.005 Э3',
          name: 'Модуль управления',
          subName: 'на МК К1986ВЕ92QI',
          litera: 'О'
        }),
        components: [
          { id: 'm_da1', componentDefId: 'COMP_DA_L78M33', libraryId: 'lib_gost_analog', refDes: 'DA1', value: 'L78M33 (+3,3В)', typeName: 'L78M33', partIndex: 1, x: 90, y: 75, angle: 0, flipX: false, flipY: false, patternId: 'PAT_KT28_TO220', refDesOffset: { x: 0, y: -8 }, valueOffset: { x: 0, y: 9 }, showRefDes: true, showValue: true },
          { id: 'm_c1', componentDefId: 'COMP_C_K50_35', libraryId: 'lib_gost_cap', refDes: 'C1', value: '47 мкФ × 25В', typeName: 'К50-35', partIndex: 1, x: 65, y: 90, angle: 90, flipX: false, flipY: false, patternId: 'PAT_K50_35_6X11', refDesOffset: { x: -5, y: 0 }, valueOffset: { x: 5, y: 0 }, showRefDes: true, showValue: true },
          { id: 'm_c2', componentDefId: 'COMP_C_K10_17V_0805', libraryId: 'lib_gost_cap', refDes: 'C2', value: '0,1 мкФ', typeName: 'К10-17в', partIndex: 1, x: 115, y: 90, angle: 90, flipX: false, flipY: false, patternId: 'PAT_CHIP_2012M', refDesOffset: { x: -5, y: 0 }, valueOffset: { x: 5, y: 0 }, showRefDes: true, showValue: true },
          { id: 'm_dd1', componentDefId: 'COMP_DD_K1986VE92QI', libraryId: 'lib_gost_mcu', refDes: 'DD1', value: 'К1986ВЕ92QI', typeName: 'К1986ВЕ92QI', partIndex: 1, x: 200, y: 120, angle: 0, flipX: false, flipY: false, patternId: 'PAT_LQFP64', refDesOffset: { x: 0, y: -51 }, valueOffset: { x: 0, y: 52 }, showRefDes: true, showValue: true },
          { id: 'm_bq1', componentDefId: 'COMP_BQ_RK169', libraryId: 'lib_gost_conn', refDes: 'BQ1', value: '8 МГц', typeName: 'РК-169', partIndex: 1, x: 155, y: 102.5, angle: 0, flipX: false, flipY: false, patternId: 'PAT_RK169', refDesOffset: { x: 0, y: -6 }, valueOffset: { x: 0, y: 6.5 }, showRefDes: true, showValue: true },
          { id: 'm_dd2', componentDefId: 'COMP_DD_K155LA3', libraryId: 'lib_gost_digital', refDes: 'DD2', value: 'К155ЛА3', typeName: 'К155ЛА3', partIndex: 1, x: 280, y: 105, angle: 0, flipX: false, flipY: false, patternId: 'PAT_DIP14', refDesOffset: { x: 0, y: -8 }, valueOffset: { x: 0, y: 8.5 }, showRefDes: true, showValue: true },
          { id: 'm_r1', componentDefId: 'COMP_R_MLT025', libraryId: 'lib_gost_res', refDes: 'R1', value: '1к', typeName: 'МЛТ-0,25', partIndex: 1, x: 315, y: 105, angle: 0, flipX: false, flipY: false, patternId: 'PAT_MLT_025', refDesOffset: { x: 0, y: -4.5 }, valueOffset: { x: 0, y: 4.5 }, showRefDes: true, showValue: true },
          { id: 'm_hl1', componentDefId: 'COMP_VD_AL307', libraryId: 'lib_gost_diode', refDes: 'HL1', value: 'АЛ307БМ', typeName: 'АЛ307БМ', partIndex: 1, x: 345, y: 105, angle: 0, flipX: false, flipY: false, patternId: 'PAT_LED_5MM', refDesOffset: { x: 0, y: -6 }, valueOffset: { x: 0, y: 6.5 }, showRefDes: true, showValue: true },
          { id: 'm_g1', componentDefId: 'COMP_GND', libraryId: 'lib_gost_general', refDes: '#GND1', value: 'GND', typeName: 'Земля', partIndex: 1, x: 90, y: 105, angle: 0, flipX: false, flipY: false, patternId: '', refDesOffset: { x: 0, y: 0 }, valueOffset: { x: 0, y: 0 }, showRefDes: false, showValue: false },
          { id: 'm_g2', componentDefId: 'COMP_GND', libraryId: 'lib_gost_general', refDes: '#GND2', value: 'GND', typeName: 'Земля', partIndex: 1, x: 235, y: 165, angle: 0, flipX: false, flipY: false, patternId: '', refDesOffset: { x: 0, y: 0 }, valueOffset: { x: 0, y: 0 }, showRefDes: false, showValue: false },
          { id: 'm_g3', componentDefId: 'COMP_GND', libraryId: 'lib_gost_general', refDes: '#GND3', value: 'GND', typeName: 'Земля', partIndex: 1, x: 360, y: 115, angle: 0, flipX: false, flipY: false, patternId: '', refDesOffset: { x: 0, y: 0 }, valueOffset: { x: 0, y: 0 }, showRefDes: false, showValue: false },
          { id: 'm_vcc', componentDefId: 'COMP_VCC_3V3', libraryId: 'lib_gost_general', refDes: '#PWR1', value: '+3V3', typeName: '+3,3В', partIndex: 1, x: 235, y: 75, angle: 0, flipX: false, flipY: false, patternId: '', refDesOffset: { x: 0, y: 0 }, valueOffset: { x: 0, y: 0 }, showRefDes: false, showValue: false }
        ],
        wires: [
          { id: 'mw1', points: [{ x: 65, y: 85 }, { x: 65, y: 75 }, { x: 77.5, y: 75 }], netName: 'VIN' },
          { id: 'mw2', points: [{ x: 65, y: 95 }, { x: 65, y: 105 }, { x: 115, y: 105 }, { x: 115, y: 95 }], netName: 'GND' },
          { id: 'mw3', points: [{ x: 90, y: 85 }, { x: 90, y: 105 }], netName: 'GND' },
          { id: 'mw4', points: [{ x: 102.5, y: 75 }, { x: 115, y: 75 }, { x: 115, y: 85 }], netName: '+3V3' },
          { id: 'mw5', points: [{ x: 115, y: 75 }, { x: 235, y: 75 }, { x: 235, y: 85 }, { x: 225, y: 85 }], netName: '+3V3' },
          { id: 'mw6', points: [{ x: 235, y: 75 }, { x: 235, y: 75 }], netName: '+3V3' },
          { id: 'mw7', points: [{ x: 225, y: 165 }, { x: 235, y: 165 }], netName: 'GND' },
          { id: 'mw8', points: [{ x: 147.5, y: 102.5 }, { x: 140, y: 102.5 }, { x: 140, y: 100 }, { x: 175, y: 100 }], netName: 'OSC_IN' },
          { id: 'mw9', points: [{ x: 162.5, y: 102.5 }, { x: 162.5, y: 105 }, { x: 175, y: 105 }], netName: 'OSC_OUT' },
          { id: 'mw10', points: [{ x: 225, y: 105 }, { x: 270, y: 105 }, { x: 270, y: 102.5 }], netName: 'PB0_OUT' },
          { id: 'mw11', points: [{ x: 225, y: 110 }, { x: 270, y: 110 }, { x: 270, y: 107.5 }], netName: 'PB1_OUT' },
          { id: 'mw12', points: [{ x: 290, y: 105 }, { x: 305, y: 105 }], netName: 'LED_DRV' },
          { id: 'mw13', points: [{ x: 325, y: 105 }, { x: 337.5, y: 105 }], netName: 'LED_A' },
          { id: 'mw14', points: [{ x: 352.5, y: 105 }, { x: 360, y: 105 }, { x: 360, y: 115 }], netName: 'GND' }
        ],
        buses: [],
        busTaps: [],
        junctions: [
          { id: 'mj1', x: 90, y: 105, netName: 'GND' },
          { id: 'mj2', x: 115, y: 75, netName: '+3V3' },
          { id: 'mj3', x: 235, y: 75, netName: '+3V3' }
        ],
        netPorts: [],
        diffPairs: [],
        hierarchyBlocks: [],
        shapes: []
      }
    ]
  };
}
