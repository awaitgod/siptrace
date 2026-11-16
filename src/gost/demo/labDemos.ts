import { PlacedComponent, SchJunction, SchWire, SchematicProject } from '../../core/types';
import { createDefaultGostTitleBlock } from '../gostTitleBlock';
import { createDemoRs485Pcb } from './rs485Pcb';
import { convertSchematicToPcb } from '../../engines/netlist';
import { updateAllCopperPours } from '../../engines/copperPour';
import { runAutorouter, DEFAULT_AUTOROUTER_SETTINGS } from '../../engines/autorouter';
import { getComponentWorldPins } from '../../engines/erc';
import { PcbProject } from '../../core/types';

function findWorldPin(comp: PlacedComponent, query: string) {
  const pins = getComponentWorldPins(comp);
  return pins.find((p) => p.pinNumber === query) ?? pins.find((p) => p.pinName === query) ?? pins.find((p) => p.pinName.includes(query));
}

function orthoWire(id: string, comps: PlacedComponent[], refA: string, pinA: string, refB: string, pinB: string, netName: string, midX?: number): SchWire | null {
  const cA = comps.find((c) => c.refDes === refA);
  const cB = comps.find((c) => c.refDes === refB);
  if (!cA || !cB) return null;
  const pA = findWorldPin(cA, pinA);
  const pB = findWorldPin(cB, pinB);
  if (!pA || !pB) return null;
  const mx = midX ?? Math.round(((pA.x + pB.x) / 2) / 2.5) * 2.5;
  const pts = pA.x === pB.x || pA.y === pB.y
    ? [{ x: pA.x, y: pA.y }, { x: pB.x, y: pB.y }]
    : [{ x: pA.x, y: pA.y }, { x: mx, y: pA.y }, { x: mx, y: pB.y }, { x: pB.x, y: pB.y }];
  return { id, points: pts, netName };
}

export interface LabTemplateDescriptor {
  id: string;
  title: string;
  description: string;
  buildSchematic: () => SchematicProject;
}

function makeBaseLabSchematic(title: string, designation: string, subName: string, comps: PlacedComponent[], wires: SchWire[], junctions: SchJunction[] = []): SchematicProject {
  return {
    version: '1.0',
    filePath: `C:\\Projects\\GOSTTrace\\${title.replace(/[^A-Za-zА-Яа-я0-9_]/g, '_')}.gostsch`,
    projectName: title,
    units: 'mm',
    gridSize: 2.5,
    origin: { x: 0, y: 0 },
    activeSheetId: 'sheet_1',
    netClasses: [
      {
        id: 'nc_default',
        name: 'Сигнальные',
        traceWidth: 0.25,
        minWidth: 0.15,
        maxWidth: 4.0,
        clearance: 0.2,
        viaOuterDiameter: 0.7,
        viaHoleDiameter: 0.35
      },
      {
        id: 'nc_pwr',
        name: 'Питание',
        traceWidth: 0.5,
        minWidth: 0.25,
        maxWidth: 5.0,
        clearance: 0.25,
        viaOuterDiameter: 0.9,
        viaHoleDiameter: 0.45
      }
    ],
    netClassAssignments: { '+5V': 'nc_pwr', GND: 'nc_pwr' },
    customComponentDefs: {},
    customPatternDefs: {},
    sheets: [
      {
        id: 'sheet_1',
        name: 'Лист 1',
        format: 'A3_L',
        titleBlock: createDefaultGostTitleBlock({
          designation,
          name: title,
          subName,
          litera: 'У'
        }),
        components: comps,
        wires,
        buses: [],
        busTaps: [],
        junctions,
        netPorts: [],
        diffPairs: [],
        hierarchyBlocks: [],
        shapes: []
      }
    ]
  };
}

function comp(id: string, defId: string, refDes: string, value: string, typeName: string, patternId: string, x: number, y: number, angle: 0 | 90 | 180 | 270 = 0): PlacedComponent {
  const isPwr = refDes.startsWith('#');
  return {
    id,
    componentDefId: defId,
    libraryId: 'lib_gost_lab',
    refDes,
    value,
    typeName,
    partIndex: 1,
    x,
    y,
    angle,
    flipX: false,
    flipY: false,
    patternId,
    refDesOffset: { x: 0, y: -6 },
    valueOffset: { x: 0, y: 6 },
    showRefDes: !isPwr,
    showValue: !isPwr
  };
}

export function createLabServoSchematic(): SchematicProject {
  const comps: PlacedComponent[] = [
    { ...comp('c_dd1', 'COMP_DD_ATMEGA328P_PU', 'DD1', 'ATmega328P-PU', 'ATmega328P-PU', 'PAT_DIP28_N', 180, 130), refDesOffset: { x: 0, y: -48 }, valueOffset: { x: 0, y: 49 } },
    { ...comp('c_m1', 'COMP_M_SERVO_SG90', 'M1', 'SG90', 'Сервопривод SG90', 'PAT_PLS_3', 260, 125), refDesOffset: { x: 0, y: -16 }, valueOffset: { x: 0, y: 17 } },
    comp('c_bq1', 'COMP_BQ_RK169', 'BQ1', '16 МГц', 'РК-169', 'PAT_RK169', 120, 135),
    { ...comp('c_r1', 'COMP_R_MLT025', 'R1', '10 кОм', 'МЛТ-0,25', 'PAT_MLT_025', 135, 90, 90), refDesOffset: { x: -7, y: 0 }, valueOffset: { x: 7, y: 0 } },
    comp('c_sb1', 'COMP_SB_KN1', 'SB1', 'Сброс', 'КМ1-1', 'PAT_KN_TACT', 120, 112.5),
    comp('c_v1', 'COMP_VCC_5V', '#PWR1', '+5V', '+5В', '', 135, 65),
    comp('c_v2', 'COMP_VCC_5V', '#PWR2', '+5V', '+5В', '', 235, 105),
    comp('c_g1', 'COMP_GND', '#GND1', 'GND', 'Земля', '', 145, 180),
    comp('c_g2', 'COMP_GND', '#GND2', 'GND', 'Земля', '', 235, 155)
  ];
  const wires = [
    orthoWire('w1', comps, '#PWR1', '1', 'DD1', '7', '+5V', 147.5),
    orthoWire('w2', comps, '#PWR1', '1', 'R1', '1', '+5V'),
    orthoWire('w3', comps, 'R1', '2', 'DD1', '1', 'RESET'),
    orthoWire('w4', comps, 'SB1', '2', 'DD1', '1', 'RESET', 142.5),
    orthoWire('w5', comps, 'SB1', '1', '#GND1', '1', 'GND', 105),
    orthoWire('w6', comps, 'DD1', '8', '#GND1', '1', 'GND', 152.5),
    orthoWire('w7', comps, 'BQ1', '1', 'DD1', '9', 'XTAL1'),
    orthoWire('w8', comps, 'BQ1', '2', 'DD1', '10', 'XTAL2'),
    orthoWire('w9', comps, 'DD1', '15', 'M1', '1', 'PWM_SERVO', 225),
    orthoWire('w10', comps, '#PWR2', '1', 'M1', '2', '+5V'),
    orthoWire('w11', comps, '#GND2', '1', 'M1', '3', 'GND')
  ].filter((w): w is SchWire => Boolean(w));
  return makeBaseLabSchematic('ЛР1 Сервопривод SG90 + ATmega328P', 'ЛР01.468332.001 Э3', 'Управление ШИМ 50 Гц', comps, wires);
}

export function createLabUsartLcdSchematic(): SchematicProject {
  const comps: PlacedComponent[] = [
    { ...comp('u_dd1', 'COMP_DD_ATMEGA8_PU', 'DD1', 'ATmega8A-PU', 'ATmega8A-PU', 'PAT_DIP28_N', 145, 130), refDesOffset: { x: 0, y: -48 }, valueOffset: { x: 0, y: 49 } },
    { ...comp('u_hg1', 'COMP_HG_LCD1602', 'HG1', 'WH1602A (16×2)', 'HD44780 LCD', 'PAT_LCD_16X2', 260, 120), refDesOffset: { x: 0, y: -34 }, valueOffset: { x: 0, y: 35 } },
    { ...comp('u_p1', 'COMP_PI_VIRTUAL_TERMINAL', 'P1', '9600 8N1', 'Терминал UART', 'PAT_PLS_4', 260, 185), refDesOffset: { x: 0, y: -18 }, valueOffset: { x: 0, y: 19 } },
    comp('u_sb1', 'COMP_SB_KN1', 'SB1', 'Кнопка 1', 'КМ1-1', 'PAT_KN_TACT', 210, 75),
    comp('u_v1', 'COMP_VCC_5V', '#PWR1', '+5V', '+5В', '', 115, 75),
    comp('u_g1', 'COMP_GND', '#GND1', 'GND', 'Земля', '', 115, 175),
    comp('u_g2', 'COMP_GND', '#GND2', 'GND', 'Земля', '', 225, 165)
  ];
  const wires = [
    orthoWire('uw1', comps, '#PWR1', '1', 'DD1', '7', '+5V'),
    orthoWire('uw2', comps, 'DD1', '8', '#GND1', '1', 'GND'),
    orthoWire('uw3', comps, 'DD1', '23', 'SB1', '1', 'PC0_BTN'),
    orthoWire('uw4', comps, 'SB1', '2', '#GND2', '1', 'GND'),
    orthoWire('uw5', comps, 'DD1', '3', 'P1', '1', 'MCU_TXD', 205),
    orthoWire('uw6', comps, 'DD1', '2', 'P1', '2', 'MCU_RXD', 210),
    orthoWire('uw7', comps, 'DD1', '14', 'HG1', '4', 'LCD_RS', 200),
    orthoWire('uw8', comps, 'DD1', '15', 'HG1', '6', 'LCD_E', 205),
    orthoWire('uw9', comps, 'DD1', '6', 'HG1', '11', 'LCD_D4', 210),
    orthoWire('uw10', comps, 'DD1', '11', 'HG1', '12', 'LCD_D5', 215),
    orthoWire('uw11', comps, 'DD1', '12', 'HG1', '13', 'LCD_D6', 220),
    orthoWire('uw12', comps, 'DD1', '13', 'HG1', '14', 'LCD_D7', 225),
    orthoWire('uw13', comps, 'HG1', '1', '#GND2', '1', 'GND')
  ].filter((w): w is SchWire => Boolean(w));
  return makeBaseLabSchematic('ЛР6 USART + ЖКИ 16×2 + Терминал', 'ЛР06.468332.006 Э3', 'Обмен данными USART с ЖКИ и терминалом', comps, wires);
}

export function createLabSevenSegSchematic(): SchematicProject {
  const comps: PlacedComponent[] = [
    { ...comp('s_dd1', 'COMP_DD_ATMEGA8_PU', 'DD1', 'ATmega8A-PU', 'ATmega8A-PU', 'PAT_DIP28_N', 150, 130), refDesOffset: { x: 0, y: -48 }, valueOffset: { x: 0, y: 49 } },
    { ...comp('s_hg1', 'COMP_HG_ALS324A_CC', 'HG1', 'АЛС324А (ОК)', 'АЛС324А', 'PAT_DIP10_7SEG', 280, 130), refDesOffset: { x: 0, y: -24 }, valueOffset: { x: 0, y: 25 } },
    comp('s_r1', 'COMP_R_MLT025', 'R1', '300 Ом', 'МЛТ-0,25', 'PAT_MLT_025', 225, 115),
    comp('s_sb1', 'COMP_SB_KN1', 'SB1', '+1', 'КМ1-1', 'PAT_KN_TACT', 215, 70),
    comp('s_g1', 'COMP_GND', '#GND1', 'GND', 'Земля', '', 315, 165)
  ];
  const wires = [
    orthoWire('sw1', comps, 'DD1', '2', 'R1', '1', 'PD0_A'),
    orthoWire('sw2', comps, 'R1', '2', 'HG1', '7', 'SEG_A'),
    orthoWire('sw3', comps, 'DD1', '23', 'SB1', '1', 'BTN_STEP'),
    orthoWire('sw4', comps, 'HG1', '3', '#GND1', '1', 'GND')
  ].filter((w): w is SchWire => Boolean(w));
  return makeBaseLabSchematic('ЛР7 Семисегментный индикатор АЛС324А', 'ЛР07.468332.007 Э3', 'Работа с массивами и кнопкой', comps, wires);
}

export function createLabEncoderSchematic(): SchematicProject {
  const comps: PlacedComponent[] = [
    { ...comp('e_dd1', 'COMP_DD_ATMEGA8_PU', 'DD1', 'ATmega8A-PU', 'ATmega8A-PU', 'PAT_DIP28_N', 200, 130), refDesOffset: { x: 0, y: -48 }, valueOffset: { x: 0, y: 49 } },
    { ...comp('e_b1', 'COMP_B_ENCODER_EC11', 'B1', 'EC11 (KY-040)', 'Энкодер EC11', 'PAT_ENCODER_EC11', 105, 125), refDesOffset: { x: 0, y: -20 }, valueOffset: { x: 0, y: 21 } },
    comp('e_r1', 'COMP_R_MLT025', 'R1', '1 кОм', 'МЛТ-0,25', 'PAT_MLT_025', 255, 125),
    comp('e_hl1', 'COMP_VD_AL307', 'HL1', 'АЛ307БМ', 'АЛ307БМ', 'PAT_LED_5MM', 285, 125),
    comp('e_g1', 'COMP_GND', '#GND1', 'GND', 'Земля', '', 305, 145)
  ];
  const wires = [
    orthoWire('ew1', comps, 'B1', '1', 'DD1', '23', 'ENC_A', 150),
    orthoWire('ew2', comps, 'B1', '2', 'DD1', '24', 'ENC_B', 155),
    orthoWire('ew3', comps, 'DD1', '2', 'R1', '1', 'LED0_DRV'),
    orthoWire('ew4', comps, 'R1', '2', 'HL1', '1', 'LED0_A'),
    orthoWire('ew5', comps, 'HL1', '2', '#GND1', '1', 'GND')
  ].filter((w): w is SchWire => Boolean(w));
  return makeBaseLabSchematic('ЛР2 Энкодер EC11 + ATmega8', 'ЛР02.468332.002 Э3', 'Обработка инкрементального энкодера', comps, wires);
}

export function createLabAdcBargraphSchematic(): SchematicProject {
  const comps: PlacedComponent[] = [
    { ...comp('a_dd1', 'COMP_DD_ATMEGA8_PU', 'DD1', 'ATmega8A-PU', 'ATmega8A-PU', 'PAT_DIP28_N', 180, 130), refDesOffset: { x: 0, y: -48 }, valueOffset: { x: 0, y: 49 } },
    comp('a_r9', 'COMP_R_POT_SP3_10K', 'R9', '10 кОм', 'СП3-38б', 'PAT_POT_SP3_4', 260, 95),
    comp('a_r1', 'COMP_R_MLT025', 'R1', '220 Ом', 'МЛТ-0,25', 'PAT_MLT_025', 250, 135),
    comp('a_hl1', 'COMP_VD_AL307', 'HL1', 'АЛ307БМ', 'АЛ307БМ', 'PAT_LED_5MM', 280, 135),
    comp('a_v1', 'COMP_VCC_5V', '#PWR1', '+5V', '+5В', '', 150, 75),
    comp('a_g1', 'COMP_GND', '#GND1', 'GND', 'Земля', '', 300, 150)
  ];
  const wires = [
    orthoWire('aw1', comps, '#PWR1', '1', 'DD1', '7', '+5V'),
    orthoWire('aw2', comps, '#PWR1', '1', 'DD1', '20', '+5V'),
    orthoWire('aw3', comps, '#PWR1', '1', 'R9', '1', '+5V'),
    orthoWire('aw4', comps, 'R9', '2', 'DD1', '23', 'ADC0_IN', 230),
    orthoWire('aw5', comps, 'R9', '3', '#GND1', '1', 'GND'),
    orthoWire('aw6', comps, 'DD1', '2', 'R1', '1', 'BAR0'),
    orthoWire('aw7', comps, 'R1', '2', 'HL1', '1', 'BAR0_A'),
    orthoWire('aw8', comps, 'HL1', '2', '#GND1', '1', 'GND')
  ].filter((w): w is SchWire => Boolean(w));
  return makeBaseLabSchematic('ЛР10 АЦП шкала светодиодов + СП3-38', 'ЛР10.468332.010 Э3', 'Измерение напряжения потенциометра', comps, wires);
}

export function createLabCamReadyPcb(): PcbProject {
  const sch = createLabServoSchematic();
  const pcb = convertSchematicToPcb(sch);
  const res = runAutorouter(pcb, { ...DEFAULT_AUTOROUTER_SETTINGS, enableInnerLayers: false });
  return updateAllCopperPours({ ...res.pcb, projectName: 'Плата_ЛР_Гербер_DXF_GCode' });
}

export const GOST_LAB_TEMPLATES: LabTemplateDescriptor[] = [
  {
    id: 'lab_servo',
    title: 'ЛР №1: Сервопривод SG90 + ATmega328P (ШИМ 50 Гц)',
    description: 'Схема управления сервомотором по сигналу Fast PWM OC1A от МК ATmega328P',
    buildSchematic: createLabServoSchematic
  },
  {
    id: 'lab_encoder',
    title: 'ЛР №2: Инкрементальный энкодер EC11 + ATmega8',
    description: 'Подключение квадратурного энкодера с фильтрующими RC-цепями и светодиодной индикацией',
    buildSchematic: createLabEncoderSchematic
  },
  {
    id: 'lab_usart_lcd',
    title: 'ЛР №5/6/10: ЖКИ 16×2 (HD44780) + USART + Виртуальный терминал',
    description: 'ATmega8 + LCD1602 + Виртуальный терминал UART + кнопка опроса',
    buildSchematic: createLabUsartLcdSchematic
  },
  {
    id: 'lab_7seg',
    title: 'ЛР №7: Одноразрядный 7-сегментный индикатор АЛС324А + кнопка',
    description: 'Динамическая и табличная индикация цифр 0–9 с массивом кодов на порту D',
    buildSchematic: createLabSevenSegSchematic
  },
  {
    id: 'lab_adc',
    title: 'ЛР №8: АЦП микроконтроллера AVR + Потенциометр + 8 светодиодов',
    description: 'Непрерывное преобразование напряжения с СП3-38 на вход ADC0 (PC0)',
    buildSchematic: createLabAdcBargraphSchematic
  }
];

export { createDemoRs485Pcb };
