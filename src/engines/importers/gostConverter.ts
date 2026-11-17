import {
  ComponentDef,
  PadDef,
  PatternDef,
  PcbPlacedComponent,
  PcbProject,
  PlacedComponent,
  Point2D,
  SchematicProject,
  SymbolPin,
  SymbolPrimitive
} from '../../core/types';
import { uid } from '../../core/geometry';
import { ALL_GOST_COMPONENTS, findComponentById } from '../../gost/libraries/gostComponents';
import { ALL_GOST_PATTERNS, findPatternById } from '../../gost/libraries/gostPatterns';
import { makeGostRectangularIcPart } from '../../gost/libraries/components/helpers';

export interface GostConversionItem {
  originalRef: string;
  gostRef: string;
  originalValue: string;
  gostValue: string;
  originalPattern: string;
  gostPattern: string;
  action: string;
}

export interface GostConversionReport {
  sourceFormat: string;
  convertedComponents: number;
  convertedSymbolsToUgo: number;
  convertedPatterns: number;
  items: GostConversionItem[];
  warnings?: string[];
}

interface AnalogCrossRef {
  pattern: RegExp;
  gostDefId: string;
  gostValue: string;
  gostTypeName: string;
  gostPrefix?: string;
  gostPatternId?: string;
}

const FOREIGN_CROSS_REF: AnalogCrossRef[] = [
  // AVR Microcontrollers & Arduino
  { pattern: /\bATMEGA328P?-?AU\b/i, gostDefId: 'COMP_DD_ATMEGA328P_AU', gostValue: 'ATmega328P-AU', gostTypeName: 'ATmega328P-AU (ГОСТ УГО)', gostPrefix: 'DD', gostPatternId: 'PAT_TQFP32' },
  { pattern: /\bATMEGA328P?\b/i, gostDefId: 'COMP_DD_ATMEGA328P_PU', gostValue: 'ATmega328P-PU', gostTypeName: 'ATmega328P-PU (ГОСТ УГО)', gostPrefix: 'DD', gostPatternId: 'PAT_DIP28_N' },
  { pattern: /\bATMEGA8\w*-?AU\b/i, gostDefId: 'COMP_DD_ATMEGA8_AU', gostValue: 'ATmega8A-AU', gostTypeName: 'ATmega8A-AU (ГОСТ УГО)', gostPrefix: 'DD', gostPatternId: 'PAT_TQFP32' },
  { pattern: /\bATMEGA8\w*\b/i, gostDefId: 'COMP_DD_ATMEGA8_PU', gostValue: 'ATmega8A-PU', gostTypeName: 'ATmega8A-PU (ГОСТ УГО)', gostPrefix: 'DD', gostPatternId: 'PAT_DIP28_N' },
  { pattern: /\bATMEGA16\w*\b/i, gostDefId: 'COMP_DD_ATMEGA16_PU', gostValue: 'ATmega16A-PU', gostTypeName: 'ATmega16A-PU (ГОСТ УГО)', gostPrefix: 'DD', gostPatternId: 'PAT_DIP40' },
  // Displays, Actuators, Sensors, Instruments
  { pattern: /\b(LM016L|LCD1602|HD44780|WH1602\w*|16X2)\b/i, gostDefId: 'COMP_HG_LCD1602', gostValue: 'WH1602A (16×2)', gostTypeName: 'ЖКИ HD44780 (ГОСТ)', gostPrefix: 'HG', gostPatternId: 'PAT_LCD_16X2' },
  { pattern: /\b(7SEG.*CA|ALS324B|АЛС324Б)\b/i, gostDefId: 'COMP_HG_ALS324B_CA', gostValue: 'АЛС324Б (ОА)', gostTypeName: 'АЛС324Б', gostPrefix: 'HG', gostPatternId: 'PAT_DIP10_7SEG' },
  { pattern: /\b(7SEG|SEVEN.?SEG|ALS324A?|АЛС324А?)\b/i, gostDefId: 'COMP_HG_ALS324A_CC', gostValue: 'АЛС324А (ОК)', gostTypeName: 'АЛС324А', gostPrefix: 'HG', gostPatternId: 'PAT_DIP10_7SEG' },
  { pattern: /\b(SERVO|SG90|SG-5010|MOTOR.?SERVO)\b/i, gostDefId: 'COMP_M_SERVO_SG90', gostValue: 'SG90', gostTypeName: 'Сервопривод SG90', gostPrefix: 'M', gostPatternId: 'PAT_PLS_3' },
  { pattern: /\b(ENCODER|EC11|KY-?040|ROTARY.?ENC)\b/i, gostDefId: 'COMP_B_ENCODER_EC11', gostValue: 'EC11 (20 имп/об)', gostTypeName: 'Энкодер EC11', gostPrefix: 'B', gostPatternId: 'PAT_ENCODER_EC11' },
  { pattern: /\b(VIRTUAL.?TERMINAL|VTERM|UART.?TERM)\b/i, gostDefId: 'COMP_PI_VIRTUAL_TERMINAL', gostValue: '9600 8N1', gostTypeName: 'Терминал UART', gostPrefix: 'P', gostPatternId: 'PAT_PLS_3' },
  // Interfaces & Power & Analog & Logic -> Russian GOST Equivalents
  { pattern: /\bMAX232\w*\b/i, gostDefId: 'COMP_DA_MAX232', gostValue: 'MAX232CSE (КР1181)', gostTypeName: 'MAX232 (ГОСТ)', gostPrefix: 'DA', gostPatternId: 'PAT_SOIC16_N' },
  { pattern: /\bFT232RL\b/i, gostDefId: 'COMP_DD_FT232RL', gostValue: 'FT232RL', gostTypeName: 'FT232RL (ГОСТ)', gostPrefix: 'DD', gostPatternId: 'PAT_SSOP28' },
  { pattern: /\bCH340G\b/i, gostDefId: 'COMP_DD_CH340G', gostValue: 'CH340G', gostTypeName: 'CH340G (ГОСТ)', gostPrefix: 'DD', gostPatternId: 'PAT_SOIC16_N' },
  { pattern: /\b(AMS1117|NCP1117|MC33269D?-?5|LM1117)\b/i, gostDefId: 'COMP_DA_NCP1117_5V', gostValue: 'КР1181 / AMS1117-5.0', gostTypeName: 'AMS1117-5.0', gostPrefix: 'DA', gostPatternId: 'PAT_SOT223' },
  { pattern: /\bLP2985\w*\b/i, gostDefId: 'COMP_DA_LP2985_33', gostValue: 'LP2985-33DBVR', gostTypeName: 'LP2985-3.3', gostPrefix: 'DA', gostPatternId: 'PAT_SOT23_5' },
  { pattern: /\b(LM7805|7805|L7805)\b/i, gostDefId: 'COMP_DA_KR142EN5A', gostValue: 'КР142ЕН5А (5 В)', gostTypeName: 'КР142ЕН5А', gostPrefix: 'DA', gostPatternId: 'PAT_KT28_TO220' },
  { pattern: /\b(LM7812|7812|L7812)\b/i, gostDefId: 'COMP_DA_KR142EN8B', gostValue: 'КР142ЕН8Б (12 В)', gostTypeName: 'КР142ЕН8Б', gostPrefix: 'DA', gostPatternId: 'PAT_KT28_TO220' },
  { pattern: /\b(LMV358|LM358|NE5532|TL072)\b/i, gostDefId: 'COMP_DA_LMV358', gostValue: 'К140УД20 / LMV358', gostTypeName: 'К140УД20', gostPrefix: 'DA', gostPatternId: 'PAT_SOIC8' },
  { pattern: /\b(LM741|UA741|OP07|TL071)\b/i, gostDefId: 'COMP_DA_KR140UD708', gostValue: 'КР140УД708', gostTypeName: 'КР140УД708', gostPrefix: 'DA', gostPatternId: 'PAT_DIP8' },
  { pattern: /\b(NE555|LM555|TLC555)\b/i, gostDefId: 'COMP_DA_KR1006VI1', gostValue: 'КР1006ВИ1 (NE555)', gostTypeName: 'КР1006ВИ1', gostPrefix: 'DA', gostPatternId: 'PAT_DIP8' },
  { pattern: /\b(?:SN)?74HC595D?\b/i, gostDefId: 'COMP_DD_K555IR23_595', gostValue: '74HC595', gostTypeName: '74HC595 (ГОСТ)', gostPrefix: 'DD', gostPatternId: 'PAT_SOIC16_N' },
  { pattern: /\b(74HC00|74LS00|SN7400|CD4011)\b/i, gostDefId: 'COMP_DD_K155LA3', gostValue: 'К155ЛА3', gostTypeName: 'К155ЛА3', gostPrefix: 'DD', gostPatternId: 'PAT_DIP14' },
  { pattern: /\b(74HC02|74LS02)\b/i, gostDefId: 'COMP_DD_K555LE1', gostValue: 'К555ЛЕ1', gostTypeName: 'К555ЛЕ1', gostPrefix: 'DD', gostPatternId: 'PAT_DIP14' },
  { pattern: /\b(74HC04|74LS04|CD4069)\b/i, gostDefId: 'COMP_DD_K561LN2', gostValue: 'К561ЛН2', gostTypeName: 'К561ЛН2', gostPrefix: 'DD', gostPatternId: 'PAT_DIP14' },
  { pattern: /\b(74HC74|74LS74)\b/i, gostDefId: 'COMP_DD_K555TM2', gostValue: 'К555ТМ2', gostTypeName: 'К555ТМ2', gostPrefix: 'DD', gostPatternId: 'PAT_DIP14' },
  { pattern: /\b(MAX485|ADM485|SN75176|SP485)\b/i, gostDefId: 'COMP_DA_K5559IN10A', gostValue: 'К5559ИН10А (RS-485)', gostTypeName: 'К5559ИН10А', gostPrefix: 'DA', gostPatternId: 'PAT_SOIC8' },
  { pattern: /\b(PC817|4N25|4N35|EL817)\b/i, gostDefId: 'COMP_U_AOT128A', gostValue: 'АОТ128А', gostTypeName: 'АОТ128А', gostPrefix: 'U', gostPatternId: 'PAT_DIP6' },
  // Discretes -> Russian GOST Equivalents
  { pattern: /\b(1N4148|1N914|BAV99|LL4148)\b/i, gostDefId: 'COMP_VD_KD522', gostValue: 'КД522Б', gostTypeName: 'КД522Б', gostPrefix: 'VD', gostPatternId: 'PAT_KD522' },
  { pattern: /\b(1N400[1-7]|M7|S1M)\b/i, gostDefId: 'COMP_VD_KD247', gostValue: 'КД247 (1N4007)', gostTypeName: 'КД247', gostPrefix: 'VD', gostPatternId: 'PAT_KD522' },
  { pattern: /\b(1N581[7-9]|SS14|BAT54|BAT85)\b/i, gostDefId: 'COMP_VD_SHOTTKY', gostValue: 'КД2997 / SS14', gostTypeName: 'Диод Шоттки', gostPrefix: 'VD', gostPatternId: 'PAT_KD522' },
  { pattern: /\b(2N2222|BC547|2N3904|S8050|MMBT2222|BC847)\b/i, gostDefId: 'COMP_VT_KT3102AM', gostValue: 'КТ3102АМ', gostTypeName: 'КТ3102АМ', gostPrefix: 'VT', gostPatternId: 'PAT_KT26_TO92' },
  { pattern: /\b(BC557|2N3906|S8550|MMBT3906|BC857)\b/i, gostDefId: 'COMP_VT_KT3107B', gostValue: 'КТ3107Б', gostTypeName: 'КТ3107Б', gostPrefix: 'VT', gostPatternId: 'PAT_KT26_TO92' },
  { pattern: /\bFDN340P?\b/i, gostDefId: 'COMP_VT_FDN340P', gostValue: 'КП745 / FDN340P', gostTypeName: 'КП745', gostPrefix: 'VT', gostPatternId: 'PAT_KT27_SOT23' },
  { pattern: /\b(2N7002|2N7000|BS170|IRF540|IRFZ44)\b/i, gostDefId: 'COMP_VT_KP501A', gostValue: 'КП501А', gostTypeName: 'КП501А', gostPrefix: 'VT', gostPatternId: 'PAT_KT27_SOT23' },
  { pattern: /\b(POT-?HG|RV\d*|TRIMMER|POTENTIOMETER)\b/i, gostDefId: 'COMP_R_POT_SP3_10K', gostValue: '10 кОм', gostTypeName: 'СП3-38б', gostPrefix: 'R', gostPatternId: 'PAT_POT_SP3_4' },
  { pattern: /\b(ICSP|ISP-?6)\b/i, gostDefId: 'COMP_XP_ICSP_6', gostValue: 'ICSP (ПЛД-6)', gostTypeName: 'ПЛД-6', gostPrefix: 'XP', gostPatternId: 'PAT_PLD_6_ICSP' },
  { pattern: /\b(USBASP|ISP-?10)\b/i, gostDefId: 'COMP_XP_ISP10_USBASP', gostValue: 'ISP-10 (USBasp)', gostTypeName: 'ПЛД-10', gostPrefix: 'XP', gostPatternId: 'PAT_PLD_10_ISP' },
  { pattern: /\b(DB9|DE-?9)\b/i, gostDefId: 'COMP_XS_DB9F_RS232', gostValue: 'DB-9F (RS-232)', gostTypeName: 'DB-9F', gostPrefix: 'XS', gostPatternId: 'PAT_DB9_F' },
  { pattern: /\bUSB[-_ ]?B\b/i, gostDefId: 'COMP_XS_USB_B', gostValue: 'USB Type-B', gostTypeName: 'USB-B', gostPrefix: 'XS', gostPatternId: 'PAT_USB_TYPE_B' },
  { pattern: /\b(DC.?JACK|BARREL.?JACK|POWER.?JACK)\b/i, gostDefId: 'COMP_XS_DC_JACK', gostValue: 'DC 7-12В', gostTypeName: 'DC-005', gostPrefix: 'XS', gostPatternId: 'PAT_DC_JACK_5_5' },
  { pattern: /\b(MF-MSMF|PTC|POLYFUSE)\b/i, gostDefId: 'COMP_F_PTC_500MA', gostValue: '0,5 А', gostTypeName: 'Самовосст.', gostPrefix: 'F', gostPatternId: 'PAT_FUSE_1812' }
];

/** Converts US/IEC reference designator prefix to GOST 2.710-81 Cyrillic/Latin literal prefix. */
export function mapForeignPrefixToGost(rawPrefix: string, hintText = ''): string {
  const p = rawPrefix.toUpperCase().replace(/[^A-ZА-Я]/g, '');
  const h = hintText.toUpperCase();
  if (!p) return 'DA';
  if (['DD', 'DA', 'VT', 'VD', 'HL', 'HG', 'XP', 'XS', 'XT', 'BQ', 'SB', 'SA', 'BA', 'BF', 'FU', 'TV', 'TA', 'KV'].includes(p)) {
    return p;
  }
  if (h.includes('LED') || p === 'LED' || h.includes('DIODE_LED')) return 'HL';
  if (h.includes('LCD') || h.includes('7SEG') || h.includes('DISP')) return 'HG';
  if (h.includes('SERVO') || h.includes('MOTOR')) return 'M';
  if (h.includes('ENCOD')) return 'B';
  if (h.includes('XTAL') || h.includes('CRYSTAL') || h.includes('OSC') || p === 'Y') return 'BQ';
  if (p === 'U' || p === 'IC') {
    if (/(ATMEGA|ATTINY|STM32|PIC|74HC|74LS|CD40|FT232|CH340|MCU|REG|LOGIC|SHIFT)/.test(h)) return 'DD';
    if (/(OPAMP|LM\d|TL07|NE555|7805|7812|1117|LP2985|MAX232|MAX485)/.test(h)) return 'DA';
    return 'DD';
  }
  if (p === 'Q' || p === 'T' || p === 'TR' || p === 'MOS') return 'VT';
  if (p === 'D' || p === 'CR' || p === 'DZ') return 'VD';
  if (p === 'DS' || p === 'LD') return 'HL';
  if (p === 'RV' || p === 'VR' || p === 'POT' || p === 'RN' || p === 'RP') return 'R';
  if (p === 'CN' || p === 'CON' || p === 'J' || p === 'P' || p === 'HDR' || p === 'H' || p === 'JP') return 'XP';
  if (p === 'X') return h.includes('MHZ') || h.includes('KHZ') || h.includes('CRYSTAL') ? 'BQ' : 'XS';
  if (p === 'SW' || p === 'S' || p === 'BTN' || p === 'KEY') return 'SB';
  if (p === 'FB' || p === 'FL' || p === 'EMI') return 'L';
  if (p === 'F') return 'F';
  if (p === 'LS' || p === 'BZ' || p === 'SPK') return 'BA';
  if (p === 'K' || p === 'RLY' || p === 'REL') return 'K';
  if (p === 'R' || p === 'C' || p === 'L' || p === 'M' || p === 'B' || p === 'G') return p;
  return 'DD';
}

/** Converts US/metric shorthand values (10k, 100nF, 22pF, 16MHz) to GOST 2.710-81 text formatting. */
export function convertValueToGost(rawValue: string, gostPrefix: string): string {
  const v = (rawValue || '').trim();
  if (!v) return '';
  if (gostPrefix === 'R') {
    const m = /^([\d.,]+)\s*(R|OHM|Ω|K|KΩ|KOHM|M|MEG|MΩ)?$/i.exec(v);
    if (m) {
      const num = m[1].replace('.', ',');
      const u = (m[2] || '').toUpperCase();
      if (!u || u === 'R' || u === 'OHM' || u === 'Ω') return `${num} Ом`;
      if (u.startsWith('K')) return `${num} кОм`;
      if (u.startsWith('M')) return `${num} МОм`;
    }
    const rNotation = /^(\d+)[kK](\d+)$/.exec(v);
    if (rNotation) return `${rNotation[1]},${rNotation[2]} кОм`;
  }
  if (gostPrefix === 'C') {
    const m = /^([\d.,]+)\s*(p|pF|пФ|n|nF|нФ|u|uF|µF|μF|мкФ|mF)?$/i.exec(v);
    if (m) {
      const num = parseFloat(m[1].replace(',', '.'));
      const u = (m[2] || '').toLowerCase();
      if (u.startsWith('p') || u === 'пф') return `${String(num).replace('.', ',')} пФ`;
      if (u.startsWith('n') || u === 'нф') {
        if (num >= 100) return `${String(num / 1000).replace('.', ',')} мкФ`;
        return `${String(num).replace('.', ',')} нФ`;
      }
      if (u.startsWith('u') || u.startsWith('µ') || u.startsWith('μ') || u === 'мкф') {
        return `${String(num).replace('.', ',')} мкФ`;
      }
    }
  }
  if (gostPrefix === 'L') {
    const m = /^([\d.,]+)\s*(nH|uH|µH|mH|H)$/i.exec(v);
    if (m) {
      const num = m[1].replace('.', ',');
      const u = m[2].toLowerCase();
      if (u === 'nh') return `${num} нГн`;
      if (u === 'uh' || u === 'µh') return `${num} мкГн`;
      if (u === 'mh') return `${num} мГн`;
      return `${num} Гн`;
    }
  }
  if (gostPrefix === 'BQ') {
    return v.replace(/MHz/gi, 'МГц').replace(/KHz/gi, 'кГц');
  }
  return v;
}

/** Maps a foreign footprint/package name to an existing Russian GOST PatternDef ID. */
export function mapForeignPatternToGost(rawPattern: string, pinCount = 2, prefix = ''): string {
  const s = (rawPattern || '').trim();
  const up = s.toUpperCase();

  // Direct match against existing GOST patterns
  const exact = ALL_GOST_PATTERNS.find((p) => p.id === s || p.name.toUpperCase() === up);
  if (exact) return exact.id;

  if (/0402|1005M/i.test(up)) return 'PAT_CHIP_1608M';
  if (/0603|1608M/i.test(up)) return 'PAT_CHIP_1608M';
  if (/0805|2012M/i.test(up)) return 'PAT_CHIP_2012M';
  if (/1206|3216M/i.test(up)) return 'PAT_CHIP_3216M';
  if (/1812|4532M/i.test(up)) return 'PAT_FUSE_1812';
  if (/AXIAL|RES-?400|0207|THROUGH_?HOLE.*RES/i.test(up) || (prefix === 'R' && pinCount === 2 && /THT|DIP/i.test(up))) return 'PAT_MLT_025';
  if (/CAPPR|RADIAL|ELEC|POL_?CAP|D5|D6/i.test(up)) return 'PAT_K50_35_6X11';
  if (/LED.?5|LED_D5|LED-5MM/i.test(up) || prefix === 'HL') return 'PAT_LED_5MM';
  if (/DO-?35|DO-?41|SOD|SMA|DIODE/i.test(up) || prefix === 'VD') return 'PAT_KD522';
  if (/TO-?92/i.test(up)) return 'PAT_KT26_TO92';
  if (/TO-?220/i.test(up)) return 'PAT_KT28_TO220';
  if (/SOT-?223/i.test(up)) return 'PAT_SOT223';
  if (/SOT-?23-?5/i.test(up)) return 'PAT_SOT23_5';
  if (/SOT-?23/i.test(up)) return 'PAT_KT27_SOT23';
  if (/SOIC-?8|SOP-?8/i.test(up)) return 'PAT_SOIC8';
  if (/SOIC-?16|SOP-?16/i.test(up)) return 'PAT_SOIC16_N';
  if (/SSOP-?28|TSSOP-?28/i.test(up)) return 'PAT_SSOP28';
  if (/TQFP-?32|LQFP-?32/i.test(up)) return 'PAT_TQFP32';
  if (/TQFP-?44|LQFP-?44/i.test(up)) return 'PAT_TQFP44';
  if (/LQFP-?48/i.test(up)) return 'PAT_LQFP48';
  if (/LQFP-?64/i.test(up)) return 'PAT_LQFP64';
  if (/QFN-?32/i.test(up)) return 'PAT_QFN32';
  if (/DIP-?6/i.test(up)) return 'PAT_DIP6';
  if (/DIP-?8/i.test(up)) return 'PAT_DIP8';
  if (/DIP-?10/i.test(up)) return 'PAT_DIP10_7SEG';
  if (/DIP-?14/i.test(up)) return 'PAT_DIP14';
  if (/DIP-?16/i.test(up)) return 'PAT_DIP16';
  if (/DIP-?28|SKINNY.*28/i.test(up)) return 'PAT_DIP28_N';
  if (/DIP-?40/i.test(up)) return 'PAT_DIP40';
  if (/HC-?49|XTAL|CRYSTAL/i.test(up) || prefix === 'BQ') return 'PAT_RK169';
  if (/POT|RV|TRIM|SP3/i.test(up)) return 'PAT_POT_SP3_4';
  if (/SW_PUSH|TACT|BUTTON/i.test(up) || prefix === 'SB') return 'PAT_KN_TACT';
  if (/DB9|DE9/i.test(up)) return 'PAT_DB9_F';
  if (/USB.*MINI/i.test(up)) return 'PAT_USB_MINI_B';
  if (/USB.*C|TYPE.?C/i.test(up)) return 'PAT_USBC_16P';
  if (/USB/i.test(up)) return 'PAT_USB_TYPE_B';
  if (/DC.?JACK|BARREL/i.test(up)) return 'PAT_DC_JACK_5_5';
  if (/2X3|ICSP/i.test(up)) return 'PAT_PLD_6_ICSP';
  if (/2X5|ISP.?10/i.test(up)) return 'PAT_PLD_10_ISP';
  if (/LCD.*16/i.test(up)) return 'PAT_LCD_16X2';
  if (/ENC|EC11/i.test(up)) return 'PAT_ENCODER_EC11';

  // Fallback by pin count + prefix
  if (prefix === 'R') return 'PAT_CHIP_2012M';
  if (prefix === 'C') return 'PAT_CHIP_2012M';
  if (prefix === 'L') return 'PAT_CHIP_2012M';
  if (prefix === 'VT') return 'PAT_KT26_TO92';
  if (prefix === 'XP' || prefix === 'XS') {
    if (pinCount <= 3) return 'PAT_PLS_3';
    if (pinCount <= 5) return 'PAT_PLS_5';
    if (pinCount <= 6) return 'PAT_PLS_6';
    if (pinCount <= 8) return 'PAT_PLS_8';
    if (pinCount <= 10) return 'PAT_PLS_10';
    return 'PAT_PLS_16';
  }
  if (pinCount <= 6) return 'PAT_DIP6';
  if (pinCount <= 8) return 'PAT_DIP8';
  if (pinCount <= 14) return 'PAT_DIP14';
  if (pinCount <= 16) return 'PAT_DIP16';
  if (pinCount <= 28) return 'PAT_DIP28_N';
  return 'PAT_DIP40';
}

/** Resolves any foreign component label/refDes into a matching Russian GOST ComponentDef ID or builds a custom GOST UGO definition. */
export function resolveOrBuildGostComponent(opts: {
  rawRef: string;
  rawName: string;
  rawValue: string;
  rawPattern: string;
  pins?: { number: string; name: string; x: number; y: number }[];
  customDefs: Record<string, ComponentDef>;
}): {
  defId: string;
  gostRefPrefix: string;
  gostValue: string;
  gostTypeName: string;
  gostPatternId: string;
  convertedToUgo: boolean;
} {
  const hint = `${opts.rawName} ${opts.rawValue} ${opts.rawPattern}`.trim();
  const rawPrefix = opts.rawRef.replace(/[\d?]+$/g, '');

  // 1. Check direct foreign-to-GOST semiconductor / lab module catalog
  for (const entry of FOREIGN_CROSS_REF) {
    if (entry.pattern.test(hint)) {
      const def = findComponentById(entry.gostDefId, opts.customDefs);
      if (def) {
        return {
          defId: def.id,
          gostRefPrefix: entry.gostPrefix ?? def.refDesPrefix,
          gostValue: entry.gostValue,
          gostTypeName: entry.gostTypeName,
          gostPatternId: entry.gostPatternId ?? def.patternId,
          convertedToUgo: true
        };
      }
    }
  }

  // 2. Determine GOST RefDes prefix
  const gostPrefix = mapForeignPrefixToGost(rawPrefix, hint);
  const gostValue = convertValueToGost(opts.rawValue || opts.rawName, gostPrefix);
  const pinCnt = opts.pins?.length ?? 2;
  const gostPatternId = mapForeignPatternToGost(opts.rawPattern, pinCnt, gostPrefix);

  // Power symbols are global net ports. Preserve their exact net name: VCC is
  // not necessarily +5V, and VSS is not interchangeable with GND.
  const powerName = (opts.rawValue || opts.rawName).trim();
  const isGround = /^(GND|VSS|0V)$/i.test(powerName);
  const isSupply = /^(\+?5V|VCC|VDD|AVCC|\+?3[._]?3V|3V3|\+?12V|VIN)$/i.test(powerName);
  if (isGround || isSupply) {
    const template = findComponentById(isGround ? 'COMP_GND' : 'COMP_VCC_5V', opts.customDefs);
    if (template) {
      const id = `CUST_POWER_${Array.from(powerName).map((ch) => ch.codePointAt(0)!.toString(16)).join('_')}`;
      if (!opts.customDefs[id]) {
        const def = structuredClone(template);
        def.id = id;
        def.name = powerName;
        def.defaultValue = powerName;
        def.portNetName = powerName;
        for (const part of def.parts) {
          part.primitives = part.primitives.map((primitive) => primitive.type === 'text' ? { ...primitive, text: powerName } : primitive);
          part.pins = part.pins.map((pin) => ({ ...pin, name: powerName }));
        }
        opts.customDefs[id] = def;
      }
      return { defId: id, gostRefPrefix: isGround ? '#GND' : '#PWR', gostValue: powerName, gostTypeName: powerName, gostPatternId: '', convertedToUgo: true };
    }
  }
  // 3. Direct passive / diode / transistor / crystal / switch standard GOST UGO mapping.
  if (gostPrefix === 'R' && pinCnt <= 2) {
    return { defId: 'COMP_R_MLT025', gostRefPrefix: 'R', gostValue: gostValue || '10 кОм', gostTypeName: 'МЛТ-0,25', gostPatternId, convertedToUgo: true };
  }
  if (gostPrefix === 'C' && pinCnt <= 2) {
    const isPol = /CP|POL|ELEC|K50|TANT/i.test(hint);
    return {
      defId: isPol ? 'COMP_C_K50_35' : 'COMP_C_K10_17V_0805',
      gostRefPrefix: 'C',
      gostValue: gostValue || '0,1 мкФ',
      gostTypeName: isPol ? 'К50-35' : 'К10-17в',
      gostPatternId,
      convertedToUgo: true
    };
  }
  if (gostPrefix === 'L' && pinCnt <= 2) {
    return { defId: 'COMP_L_DM01', gostRefPrefix: 'L', gostValue: gostValue || '10 мкГн', gostTypeName: 'ДМ-0,1', gostPatternId, convertedToUgo: true };
  }
  if (gostPrefix === 'HL') {
    return { defId: 'COMP_VD_AL307', gostRefPrefix: 'HL', gostValue: gostValue || 'АЛ307БМ', gostTypeName: 'АЛ307БМ', gostPatternId: 'PAT_LED_5MM', convertedToUgo: true };
  }
  if (gostPrefix === 'VD') {
    const isZener = /ZENER|BZX|1N47/i.test(hint);
    return {
      defId: isZener ? 'COMP_VD_KS147' : 'COMP_VD_KD522',
      gostRefPrefix: 'VD',
      gostValue: gostValue || (isZener ? 'КС147А' : 'КД522Б'),
      gostTypeName: isZener ? 'КС147А' : 'КД522Б',
      gostPatternId: 'PAT_KD522',
      convertedToUgo: true
    };
  }
  if (gostPrefix === 'VT') {
    const isPnp = /PNP|BC55|2N3906|КТ361|КТ3107/i.test(hint);
    const isMos = /MOS|FET|IRF|2N700|BS170/i.test(hint);
    return {
      defId: isMos ? 'COMP_VT_KP501A' : isPnp ? 'COMP_VT_KT3107B' : 'COMP_VT_KT3102AM',
      gostRefPrefix: 'VT',
      gostValue: gostValue || (isMos ? 'КП501А' : isPnp ? 'КТ3107Б' : 'КТ3102АМ'),
      gostTypeName: isMos ? 'КП501А' : isPnp ? 'КТ3107Б' : 'КТ3102АМ',
      gostPatternId: isMos ? 'PAT_KT27_SOT23' : 'PAT_KT26_TO92',
      convertedToUgo: true
    };
  }
  if (gostPrefix === 'BQ') {
    return { defId: 'COMP_BQ_RK169', gostRefPrefix: 'BQ', gostValue: gostValue || '16 МГц', gostTypeName: 'РК-169', gostPatternId: 'PAT_RK169', convertedToUgo: true };
  }
  if (gostPrefix === 'SB') {
    return { defId: 'COMP_SB_KN1', gostRefPrefix: 'SB', gostValue: gostValue || 'КМ1-1', gostTypeName: 'КМ1-1', gostPatternId: 'PAT_KN_TACT', convertedToUgo: true };
  }

  // 3.5. Existing custom component definition from embedded CAD library
  if (opts.customDefs[opts.rawName]) {
    const existing = opts.customDefs[opts.rawName];
    return {
      defId: existing.id,
      gostRefPrefix: existing.refDesPrefix || gostPrefix,
      gostValue: existing.defaultValue || gostValue || opts.rawValue,
      gostTypeName: existing.name,
      gostPatternId: existing.patternId || gostPatternId,
      convertedToUgo: false
    };
  }

  // 4. Direct match against any GOST built-in component name/id
  const matchedBuiltIn = ALL_GOST_COMPONENTS.find(
    (c) => c.id === opts.rawName || c.defaultValue.toUpperCase() === opts.rawValue.toUpperCase() || c.name.toUpperCase().includes(opts.rawName.toUpperCase())
  );
  if (matchedBuiltIn) {
    return {
      defId: matchedBuiltIn.id,
      gostRefPrefix: matchedBuiltIn.refDesPrefix,
      gostValue: gostValue || matchedBuiltIn.defaultValue,
      gostTypeName: matchedBuiltIn.name,
      gostPatternId: matchedBuiltIn.patternId || gostPatternId,
      convertedToUgo: false
    };
  }

  // 5. Custom imported IC/Connector -> synthesize pure GOST 2.743 rectangular UGO in project.customComponentDefs
  const normKey = `CUST_GOST_${(opts.rawName || gostPrefix).replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}_${pinCnt}`;
  if (!opts.customDefs[normKey]) {
    const srcPins = opts.pins && opts.pins.length > 0
      ? opts.pins
      : Array.from({ length: Math.max(2, pinCnt) }, (_, i) => ({ number: String(i + 1), name: `P${i + 1}`, x: i < pinCnt / 2 ? -10 : 10, y: i * 5 }));
    const half = Math.ceil(srcPins.length / 2);
    const leftPins = srcPins.slice(0, half).map((p) => ({ num: p.number, name: p.name || p.number }));
    const rightPins = srcPins.slice(half).map((p) => ({ num: p.number, name: p.name || p.number }));

    opts.customDefs[normKey] = {
      id: normKey,
      name: `${opts.rawName || gostValue} (УГО ГОСТ)`,
      library: 'Импортированные (ГОСТ УГО)',
      refDesPrefix: gostPrefix,
      defaultValue: gostValue || opts.rawName || 'ИМС',
      gostStandard: 'ГОСТ 2.743-91 (Автоконверт.)',
      description: `Автоматически сконвертировано из импортированного УГО (${opts.rawName})`,
      manufacturer: 'Импорт → ГОСТ',
      patternId: gostPatternId,
      parts: [
        makeGostRectangularIcPart({
          headerText: (opts.rawName || gostPrefix).slice(0, 14),
          subHeaderText: `${gostPrefix} (${srcPins.length} выв.)`,
          halfWidthMm: 15,
          leftPins,
          rightPins
        })
      ]
    };
  }

  return {
    defId: normKey,
    gostRefPrefix: gostPrefix,
    gostValue: gostValue || opts.rawName || 'ИМС',
    gostTypeName: `${opts.rawName || gostPrefix} (ГОСТ)`,
    gostPatternId,
    convertedToUgo: true
  };
}

/** Applies automatic foreign -> GOST component conversion across an entire imported SchematicProject. */
export function convertImportedSchematicToGost(
  project: SchematicProject,
  sourceFormat: string
): { project: SchematicProject; report: GostConversionReport } {
  const customDefs: Record<string, ComponentDef> = { ...project.customComponentDefs };
  const customPats: Record<string, PatternDef> = { ...project.customPatternDefs };
  const usedRefs = new Set<string>();
  const items: GostConversionItem[] = [];
  let convertedSymbolsToUgo = 0;

  const allocUniqueRef = (prefix: string, origRef: string): string => {
    if (origRef.startsWith('#') || prefix.startsWith('#')) {
      let idx = 1;
      while (usedRefs.has(`${prefix}${idx}`)) idx++;
      const r = `${prefix}${idx}`;
      usedRefs.add(r);
      return r;
    }
    const numMatch = /(\d+)$/.exec(origRef);
    let n = numMatch ? parseInt(numMatch[1], 10) : 1;
    while (usedRefs.has(`${prefix}${n}`)) n++;
    const r = `${prefix}${n}`;
    usedRefs.add(r);
    return r;
  };

  for (const sheet of project.sheets) {
    const nextComps: PlacedComponent[] = [];
    for (const c of sheet.components) {
      const existingCustomDef = customDefs[c.componentDefId] || customDefs[c.typeName] || customDefs[c.value];
      const existingPins: SymbolPin[] = existingCustomDef?.parts[0]?.pins ?? [];
      const res = resolveOrBuildGostComponent({
        rawRef: c.refDes,
        rawName: existingCustomDef?.name || c.typeName || c.value || c.refDes,
        rawValue: c.value || c.typeName || '',
        rawPattern: c.patternId || '',
        pins: existingPins.map((p) => ({ number: p.number, name: p.name, x: p.x, y: p.y })),
        customDefs
      });

      const gostRef = allocUniqueRef(res.gostRefPrefix, c.refDes);
      if (res.convertedToUgo) convertedSymbolsToUgo++;

      items.push({
        originalRef: c.refDes,
        gostRef,
        originalValue: c.value || c.typeName,
        gostValue: res.gostValue,
        originalPattern: c.patternId || '-',
        gostPattern: res.gostPatternId || '-',
        action: `${c.refDes} → ${gostRef} (${res.gostTypeName})`
      });

      nextComps.push({
        ...c,
        componentDefId: res.defId,
        refDes: gostRef,
        value: res.gostValue,
        typeName: res.gostTypeName,
        patternId: res.gostPatternId,
        showRefDes: !gostRef.startsWith('#'),
        showValue: !gostRef.startsWith('#')
      });
    }
    sheet.components = nextComps;
  }

  return {
    project: {
      ...project,
      customComponentDefs: customDefs,
      customPatternDefs: customPats
    },
    report: {
      sourceFormat,
      convertedComponents: items.length,
      convertedSymbolsToUgo,
      convertedPatterns: Object.keys(customPats).length,
      items
    }
  };
}

/** Applies automatic foreign -> GOST component and footprint conversion across an imported PcbProject. */
export function convertImportedPcbToGost(
  pcb: PcbProject,
  sourceFormat: string,
  options?: { preserveEmptyPads?: boolean }
): { pcb: PcbProject; report: GostConversionReport } {
  const customDefs: Record<string, ComponentDef> = {};
  const usedRefs = new Set<string>();
  const items: GostConversionItem[] = [];

  const nextComps: PcbPlacedComponent[] = pcb.components.map((c) => {
    const res = resolveOrBuildGostComponent({
      rawRef: c.refDes,
      rawName: c.typeName || c.value || c.refDes,
      rawValue: c.value || c.typeName || '',
      rawPattern: c.patternId || '',
      pins: c.pads.filter((p) => p.type !== 'MountingHole').map((p) => ({ number: p.number, name: p.number, x: p.x, y: p.y })),
      customDefs
    });

    const numMatch = /(\d+)$/.exec(c.refDes);
    let n = numMatch ? parseInt(numMatch[1], 10) : 1;
    while (usedRefs.has(`${res.gostRefPrefix}${n}`)) n++;
    const gostRef = `${res.gostRefPrefix}${n}`;
    usedRefs.add(gostRef);

    // Keep exact physical pads if imported PCB already had exact geometry, otherwise bind GOST pattern pads
    const matchedPat = findPatternById(res.gostPatternId);
    const useImportedPads = c.pads.length > 0 && c.pads.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    const pads: PadDef[] = useImportedPads || (options?.preserveEmptyPads && c.pads.length === 0)
      ? c.pads
      : matchedPat
        ? structuredClone(matchedPat.pads)
        : [
            { id: 'p1', number: '1', type: 'SMD', shape: 'Rect', x: -0.95, y: 0, width: 1.0, height: 1.3, layer: 'Top' },
            { id: 'p2', number: '2', type: 'SMD', shape: 'Rect', x: 0.95, y: 0, width: 1.0, height: 1.3, layer: 'Top' }
          ];

    items.push({
      originalRef: c.refDes,
      gostRef,
      originalValue: c.value || c.typeName,
      gostValue: res.gostValue,
      originalPattern: c.patternId,
      gostPattern: matchedPat?.name || res.gostPatternId,
      action: `${c.refDes} → ${gostRef} (${matchedPat?.name || res.gostPatternId})`
    });

    return {
      ...c,
      refDes: gostRef,
      value: res.gostValue,
      typeName: res.gostTypeName,
      patternId: matchedPat?.id || res.gostPatternId,
      pads
    };
  });

  return {
    pcb: { ...pcb, components: nextComps },
    report: {
      sourceFormat,
      convertedComponents: items.length,
      convertedSymbolsToUgo: items.length,
      convertedPatterns: items.length,
      items
    }
  };
}

export function sanitizeSymbolPrimitivesToGost(prims: SymbolPrimitive[]): SymbolPrimitive[] {
  const clean: SymbolPrimitive[] = [];
  for (const p of prims) {
    if (p.type === 'polyline' || p.type === 'line' || p.type === 'rect' || p.type === 'circle' || p.type === 'arc' || p.type === 'text') {
      clean.push(p);
    }
  }
  return clean;
}

export function ensureUidPrefix(prefix: string): string {
  return uid(prefix);
}

export function computePinAnchorCenter(pts: Point2D[]): Point2D {
  if (!pts.length) return { x: 0, y: 0 };
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length
  };
}
