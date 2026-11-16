import { ComponentDef, ComponentLibrary } from '../../../core/types';
import { makeGostRectangularIcPart } from './helpers';

const LCD_16X2_HD44780: ComponentDef = {
  id: 'COMP_HG_LCD1602',
  name: 'ЖКИ 16×2 HD44780 (WH1602A / LM016L)',
  library: 'Индикаторы, датчики и приводы (ГОСТ)',
  refDesPrefix: 'HG',
  defaultValue: 'WH1602A (16×2)',
  gostStandard: 'ГОСТ 2.759-82',
  description: 'Алфавитно-цифровой ЖКИ-дисплей 16×2 с контроллером HD44780 (4/8-битный режим)',
  manufacturer: 'Winstar / МЭЛТ',
  patternId: 'PAT_LCD_16X2',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'HG ЖКИ 16×2',
      subHeaderText: 'HD44780 / WH1602A',
      halfWidthMm: 17.5,
      extraPrimitives: [
        { type: 'rect', x: -7.5, y: -19, w: 15, h: 6.5, width: 0.28 },
        { type: 'text', x: 0, y: -15.7, text: '16×2 LCD', size: 2.0, align: 'center' }
      ],
      leftPins: [
        { num: '1', name: 'VSS (GND)', type: 'Power' },
        { num: '2', name: 'VDD (+5V)', type: 'Power' },
        { num: '3', name: 'V0 (Контраст)', type: 'Passive' },
        { num: '4', name: 'RS', type: 'Input' },
        { num: '5', name: 'R/W', type: 'Input' },
        { num: '6', name: 'E (Строб)', type: 'Input', style: 'Clock' },
        { num: '15', name: 'A (Подсв.+)', type: 'Passive' },
        { num: '16', name: 'K (Подсв.-)', type: 'Passive' }
      ],
      rightPins: [
        { num: '7', name: 'D0', type: 'Bidirectional' },
        { num: '8', name: 'D1', type: 'Bidirectional' },
        { num: '9', name: 'D2', type: 'Bidirectional' },
        { num: '10', name: 'D3', type: 'Bidirectional' },
        { num: '11', name: 'D4', type: 'Bidirectional' },
        { num: '12', name: 'D5', type: 'Bidirectional' },
        { num: '13', name: 'D6', type: 'Bidirectional' },
        { num: '14', name: 'D7', type: 'Bidirectional' }
      ]
    })
  ]
};

const make7SegDef = (id: string, name: string, val: string, commonType: 'ОК (Общ. Катод)' | 'ОА (Общ. Анод)'): ComponentDef => ({
  id,
  name,
  library: 'Индикаторы, датчики и приводы (ГОСТ)',
  refDesPrefix: 'HG',
  defaultValue: val,
  gostStandard: 'ГОСТ 2.730-73 / 2.759-82',
  description: `Одноразрядный 7-сегментный светодиодный индикатор (${commonType}, DIP-10)`,
  manufacturer: 'РФ / Kingbright',
  patternId: 'PAT_DIP10_7SEG',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'HG 7-СЕГМ',
      subHeaderText: commonType,
      halfWidthMm: 15,
      extraPrimitives: [
        // Miniature 7-segment figure '8' glyph inside GOST block (clear of subheader)
        { type: 'line', x1: -2.2, y1: -9.5, x2: 2.2, y2: -9.5, width: 0.45 },
        { type: 'line', x1: 2.2, y1: -9.5, x2: 2.2, y2: -5.5, width: 0.45 },
        { type: 'line', x1: 2.2, y1: -5.5, x2: 2.2, y2: -1.5, width: 0.45 },
        { type: 'line', x1: -2.2, y1: -1.5, x2: 2.2, y2: -1.5, width: 0.45 },
        { type: 'line', x1: -2.2, y1: -5.5, x2: -2.2, y2: -1.5, width: 0.45 },
        { type: 'line', x1: -2.2, y1: -9.5, x2: -2.2, y2: -5.5, width: 0.45 },
        { type: 'line', x1: -2.2, y1: -5.5, x2: 2.2, y2: -5.5, width: 0.45 },
        { type: 'circle', cx: 3.8, cy: -1.7, r: 0.5, fill: true, width: 0.25 }
      ],
      leftPins: [
        { num: '7', name: 'a', type: 'Input' },
        { num: '6', name: 'b', type: 'Input' },
        { num: '4', name: 'c', type: 'Input' },
        { num: '2', name: 'd', type: 'Input' },
        { num: '1', name: 'e', type: 'Input' }
      ],
      rightPins: [
        { num: '9', name: 'f', type: 'Input' },
        { num: '10', name: 'g', type: 'Input' },
        { num: '5', name: 'dp', type: 'Input' },
        { num: '3', name: 'COM1', type: 'Power' },
        { num: '8', name: 'COM2', type: 'Power' }
      ]
    })
  ]
});

const SERVO_SG90: ComponentDef = {
  id: 'COMP_M_SERVO_SG90',
  name: 'Сервопривод SG90 / SG-5010 (ШИМ 50 Гц)',
  library: 'Индикаторы, датчики и приводы (ГОСТ)',
  refDesPrefix: 'M',
  defaultValue: 'SG90',
  gostStandard: 'ГОСТ 2.722-68',
  description: 'Следящий электропривод постоянного тока (4,8–6 В, управление ШИМ 50 Гц 1–2 мс)',
  manufacturer: 'TowerPro',
  patternId: 'PAT_PLS_3',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'Сервопривод',
      halfWidthMm: 12.5,
      extraPrimitives: [
        { type: 'circle', cx: 0, cy: 5, r: 4.5, width: 0.4 },
        { type: 'text', x: 0, y: 5, text: 'M~', size: 2.8, align: 'center', bold: true }
      ],
      leftPins: [
        { num: '1', name: 'PWM', type: 'Input' },
        { num: '2', name: '+5V', type: 'Power' },
        { num: '3', name: 'GND', type: 'Power' }
      ],
      rightPins: []
    })
  ]
};

const ENCODER_EC11: ComponentDef = {
  id: 'COMP_B_ENCODER_EC11',
  name: 'Энкодер инкрементальный EC11 / KY-040',
  library: 'Индикаторы, датчики и приводы (ГОСТ)',
  refDesPrefix: 'B',
  defaultValue: 'EC11 (20 имп/об)',
  gostStandard: 'ГОСТ 2.722-68 / 2.755',
  description: 'Инкрементальный квадратурный датчик угла поворота (выходы A/CLK, B/DT, кнопка SW)',
  manufacturer: 'Alps / Keyes',
  patternId: 'PAT_ENCODER_EC11',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'Энкодер BR',
      subHeaderText: 'A/B + Кнопка',
      halfWidthMm: 12.5,
      leftPins: [
        { num: '4', name: '+5V', type: 'Power' },
        { num: '5', name: 'GND', type: 'Power' }
      ],
      rightPins: [
        { num: '1', name: 'CLK (A)', type: 'Output' },
        { num: '2', name: 'DT (B)', type: 'Output' },
        { num: '3', name: 'SW (Кн.)', type: 'Output' }
      ]
    })
  ]
};

const VIRTUAL_TERMINAL_UART: ComponentDef = {
  id: 'COMP_PI_VIRTUAL_TERMINAL',
  name: 'Терминал UART / RS-232 (Virtual Terminal)',
  library: 'Индикаторы, датчики и приводы (ГОСТ)',
  refDesPrefix: 'P',
  defaultValue: '9600 8N1',
  gostStandard: 'ГОСТ 2.759-82',
  description: 'Виртуальный терминал последовательного порта USART/RS-232 для отладки и симуляции',
  manufacturer: 'SIPTrace Прибор',
  patternId: 'PAT_PLS_4',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'Терминал UART',
      subHeaderText: 'RXD / TXD',
      halfWidthMm: 15,
      leftPins: [
        { num: '1', name: 'RXD', type: 'Input' },
        { num: '2', name: 'TXD', type: 'Output' },
        { num: '3', name: 'RTS', type: 'Output' },
        { num: '4', name: 'CTS', type: 'Input' }
      ],
      rightPins: []
    })
  ]
};

// Communication ICs, LDOs, OpAmps & Connectors required across all lab works
const MAX232_IC: ComponentDef = {
  id: 'COMP_DA_MAX232',
  name: 'MAX232 / КР1181 (Драйвер RS-232)',
  library: 'Микросхемы аналоговые и интерфейсы (ГОСТ)',
  refDesPrefix: 'DA',
  defaultValue: 'MAX232CSE',
  gostStandard: 'ГОСТ 2.743-91',
  description: 'Сдвоенный преобразователь уровней ТТЛ/КМОП ↔ RS-232 (±12 В от +5 В)',
  manufacturer: 'Maxim / TI',
  patternId: 'PAT_SOIC16_N',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'MAX232',
      subHeaderText: 'RS-232 ↔ ТТЛ',
      halfWidthMm: 15,
      leftPins: [
        { num: '1', name: 'C1+', type: 'Passive' },
        { num: '3', name: 'C1-', type: 'Passive' },
        { num: '4', name: 'C2+', type: 'Passive' },
        { num: '5', name: 'C2-', type: 'Passive' },
        { num: '2', name: 'V+', type: 'Passive' },
        { num: '6', name: 'V-', type: 'Passive' },
        { num: '16', name: 'VCC', type: 'Power' },
        { num: '15', name: 'GND', type: 'Power' }
      ],
      rightPins: [
        { num: '11', name: 'T1IN', type: 'Input' },
        { num: '14', name: 'T1OUT', type: 'Output' },
        { num: '12', name: 'R1OUT', type: 'Output' },
        { num: '13', name: 'R1IN', type: 'Input' },
        { num: '10', name: 'T2IN', type: 'Input' },
        { num: '7', name: 'T2OUT', type: 'Output' },
        { num: '9', name: 'R2OUT', type: 'Output' },
        { num: '8', name: 'R2IN', type: 'Input' }
      ]
    })
  ]
};

const FT232RL_IC: ComponentDef = {
  id: 'COMP_DD_FT232RL',
  name: 'FT232RL (Мост USB-UART, SSOP-28)',
  library: 'Микросхемы аналоговые и интерфейсы (ГОСТ)',
  refDesPrefix: 'DD',
  defaultValue: 'FT232RL',
  gostStandard: 'ГОСТ 2.743-91',
  description: 'Интегральный преобразователь интерфейса USB ↔ UART с внутренним генератором',
  manufacturer: 'FTDI',
  patternId: 'PAT_SSOP28',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'FT232RL',
      subHeaderText: 'USB ↔ UART',
      halfWidthMm: 15,
      leftPins: [
        { num: '15', name: 'USBDP', type: 'Bidirectional' },
        { num: '16', name: 'USBDM', type: 'Bidirectional' },
        { num: '20', name: 'VCC', type: 'Power' },
        { num: '4', name: 'VCCIO', type: 'Power' },
        { num: '17', name: '3V3OUT', type: 'Power' },
        { num: '19', name: 'RESET#', type: 'Input', style: 'Inverted' },
        { num: '7', name: 'GND1', type: 'Power' },
        { num: '18', name: 'GND2', type: 'Power' },
        { num: '21', name: 'GND3', type: 'Power' },
        { num: '25', name: 'AGND', type: 'Power' }
      ],
      rightPins: [
        { num: '1', name: 'TXD', type: 'Output' },
        { num: '5', name: 'RXD', type: 'Input' },
        { num: '3', name: 'RTS#', type: 'Output' },
        { num: '11', name: 'CTS#', type: 'Input' },
        { num: '2', name: 'DTR#', type: 'Output' },
        { num: '9', name: 'DSR#', type: 'Input' },
        { num: '10', name: 'DCD#', type: 'Input' },
        { num: '6', name: 'RI#', type: 'Input' },
        { num: '23', name: 'CBUS0/TXLED', type: 'Bidirectional' },
        { num: '22', name: 'CBUS1/RXLED', type: 'Bidirectional' }
      ]
    })
  ]
};

// Extend the existing symbol downwards so previously placed pins retain their
// coordinates and existing wires do not move. NC pins 8 and 24 have no connection.
const ft232rlPart = FT232RL_IC.parts[0];
const ft232rlBody = ft232rlPart.primitives.find((primitive) => primitive.type === 'rect');
if (ft232rlBody?.type === 'rect') ft232rlBody.h += 15;
for (const pin of [
  { number: '26', name: 'TEST', x: -20, y: 30, orientation: 0 as const, electricalType: 'Input' as const },
  { number: '27', name: 'OSCI', x: -20, y: 35, orientation: 0 as const, electricalType: 'Input' as const },
  { number: '28', name: 'OSCO', x: -20, y: 40, orientation: 0 as const, electricalType: 'Output' as const },
  { number: '13', name: 'CBUS2', x: 20, y: 30, orientation: 180 as const, electricalType: 'Bidirectional' as const },
  { number: '14', name: 'CBUS3', x: 20, y: 35, orientation: 180 as const, electricalType: 'Bidirectional' as const },
  { number: '12', name: 'CBUS4', x: 20, y: 40, orientation: 180 as const, electricalType: 'Output' as const }
]) {
  ft232rlPart.pins.push({ ...pin, id: `ft232rl_${pin.number}`, length: 5, style: 'Line', showName: true, showNumber: true, padMapping: pin.number });
}

const CH340G_IC: ComponentDef = {
  id: 'COMP_DD_CH340G',
  name: 'CH340G (Мост USB-UART, SOIC-16)',
  library: 'Микросхемы аналоговые и интерфейсы (ГОСТ)',
  refDesPrefix: 'DD',
  defaultValue: 'CH340G',
  gostStandard: 'ГОСТ 2.743-91',
  description: 'Преобразователь интерфейсов USB ↔ UART (Arduino Nano/Uno)',
  manufacturer: 'WCH',
  patternId: 'PAT_SOIC16_N',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'CH340G',
      subHeaderText: 'USB ↔ UART',
      halfWidthMm: 15,
      leftPins: [
        { num: '16', name: 'VCC', type: 'Power' },
        { num: '4', name: 'V3', type: 'Passive' },
        { num: '1', name: 'GND', type: 'Power' },
        { num: '5', name: 'UD+', type: 'Bidirectional' },
        { num: '6', name: 'UD-', type: 'Bidirectional' },
        { num: '7', name: 'XI', type: 'Input' },
        { num: '8', name: 'XO', type: 'Output' }
      ],
      rightPins: [
        { num: '2', name: 'TXD', type: 'Output' },
        { num: '3', name: 'RXD', type: 'Input' },
        { num: '13', name: 'DTR#', type: 'Output' },
        { num: '14', name: 'RTS#', type: 'Output' },
        { num: '9', name: 'CTS#', type: 'Input' },
        { num: '10', name: 'DSR#', type: 'Input' }
      ]
    })
  ]
};

const LDO_NCP1117_5V: ComponentDef = {
  id: 'COMP_DA_NCP1117_5V',
  name: 'NCP1117ST50 / AMS1117-5.0 (Стаб. +5 В, SOT-223)',
  library: 'Микросхемы аналоговые и интерфейсы (ГОСТ)',
  refDesPrefix: 'DA',
  defaultValue: 'AMS1117-5.0',
  gostStandard: 'ГОСТ 2.743-91',
  description: 'Линейный LDO-стабилизатор напряжения +5 В, 1 А (в т.ч. плата Arduino Uno)',
  manufacturer: 'ON Semi / AMS',
  patternId: 'PAT_SOT223',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'U (+5V)',
      halfWidthMm: 12.5,
      leftPins: [{ num: '3', name: 'IN', type: 'Power' }],
      rightPins: [
        { num: '2', name: 'OUT', type: 'Power' },
        { num: '1', name: 'GND', type: 'Power' },
        { num: '4', name: 'TAB', type: 'Power' }
      ]
    })
  ]
};

const LDO_LP2985_33: ComponentDef = {
  id: 'COMP_DA_LP2985_33',
  name: 'LP2985-3.3 (Стаб. +3,3 В, SOT-23-5)',
  library: 'Микросхемы аналоговые и интерфейсы (ГОСТ)',
  refDesPrefix: 'DA',
  defaultValue: 'LP2985-33DBVR',
  gostStandard: 'ГОСТ 2.743-91',
  description: 'Малошумящий LDO-стабилизатор +3,3 В, 150 мА',
  manufacturer: 'Texas Instruments',
  patternId: 'PAT_SOT23_5',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'U (+3,3V)',
      halfWidthMm: 12.5,
      leftPins: [
        { num: '1', name: 'VIN', type: 'Power' },
        { num: '3', name: 'ON/OFF', type: 'Input' },
        { num: '2', name: 'GND', type: 'Power' }
      ],
      rightPins: [
        { num: '5', name: 'VOUT', type: 'Power' },
        { num: '4', name: 'BYP', type: 'Passive' }
      ]
    })
  ]
};

const TIMER_KR1006VI1: ComponentDef = {
  id: 'COMP_DA_KR1006VI1',
  name: 'КР1006ВИ1 (NE555 таймер, DIP-8)',
  library: 'Микросхемы аналоговые и интерфейсы (ГОСТ)',
  refDesPrefix: 'DA',
  defaultValue: 'КР1006ВИ1',
  gostStandard: 'ГОСТ 2.743-91',
  description: 'Интегральный аналого-цифровой таймер (отечественный аналог NE555)',
  manufacturer: 'Интеграл / РФ',
  patternId: 'PAT_DIP8',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'КР1006ВИ1',
      subHeaderText: 'Таймер (555)',
      halfWidthMm: 12.5,
      leftPins: [
        { num: '2', name: 'TRIG', type: 'Input' },
        { num: '6', name: 'THR', type: 'Input' },
        { num: '4', name: 'RST', type: 'Input', style: 'Inverted' },
        { num: '5', name: 'CVOLT', type: 'Passive' }
      ],
      rightPins: [
        { num: '8', name: 'VCC', type: 'Power' },
        { num: '3', name: 'OUT', type: 'Output' },
        { num: '7', name: 'DIS', type: 'OpenCollector' },
        { num: '1', name: 'GND', type: 'Power' }
      ]
    })
  ]
};

const SHIFT_REG_74HC595: ComponentDef = {
  id: 'COMP_DD_K555IR23_595',
  name: 'К555ИР23 / 74HC595 (Сдвиговый регистр 8 бит)',
  library: 'Микросхемы аналоговые и интерфейсы (ГОСТ)',
  refDesPrefix: 'DD',
  defaultValue: '74HC595D',
  gostStandard: 'ГОСТ 2.743-91',
  description: '8-разрядный сдвиговый регистр с защёлкой и 3 состояниями (расширитель выводов МК)',
  manufacturer: 'РФ / NXP',
  patternId: 'PAT_SOIC16_N',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'RG (74HC595)',
      subHeaderText: 'Сдвиг + Защ.',
      halfWidthMm: 15,
      leftPins: [
        { num: '14', name: 'DS', type: 'Input' },
        { num: '11', name: 'SHCP', type: 'Input', style: 'Clock' },
        { num: '12', name: 'STCP', type: 'Input', style: 'Clock' },
        { num: '10', name: 'MR#', type: 'Input', style: 'Inverted' },
        { num: '13', name: 'OE#', type: 'Input', style: 'Inverted' },
        { num: '16', name: 'VCC', type: 'Power' },
        { num: '8', name: 'GND', type: 'Power' },
        { num: '9', name: 'Q7S', type: 'Output' }
      ],
      rightPins: [
        { num: '15', name: 'Q0', type: 'Output' },
        { num: '1', name: 'Q1', type: 'Output' },
        { num: '2', name: 'Q2', type: 'Output' },
        { num: '3', name: 'Q3', type: 'Output' },
        { num: '4', name: 'Q4', type: 'Output' },
        { num: '5', name: 'Q5', type: 'Output' },
        { num: '6', name: 'Q6', type: 'Output' },
        { num: '7', name: 'Q7', type: 'Output' }
      ]
    })
  ]
};

const makeLinearHeaderComp = (id: string, name: string, val: string, patternId: string, pins: { num: string; label: string }[]): ComponentDef => ({
  id,
  name,
  library: 'Соединители и коммутация (Лаб. AVR)',
  refDesPrefix: 'XP',
  defaultValue: val,
  gostStandard: 'ГОСТ 2.755-87',
  description: `Вилка штыревая ${pins.length}-контактная по ГОСТ 2.755-87`,
  manufacturer: 'РФ / Connfly',
  patternId,
  parts: [
    makeGostRectangularIcPart({
      headerText: val,
      halfWidthMm: 10,
      leftPins: pins.map((p) => ({ num: p.num, name: p.label, type: 'Passive' })),
      rightPins: []
    })
  ]
});

const POTENTIOMETER_SP3_38: ComponentDef = {
  id: 'COMP_R_POT_SP3_10K',
  name: 'СП3-38б / СП3-4 10 кОм (Потенциометр)',
  library: 'Соединители и коммутация (Лаб. AVR)',
  refDesPrefix: 'R',
  defaultValue: '10 кОм',
  gostStandard: 'ГОСТ 2.728-74',
  description: 'Переменный / подстроечный резистор 10 кОм с отводом (в т.ч. для задания напряжения АЦП)',
  manufacturer: 'ОАО «Резистор-НН»',
  patternId: 'PAT_POT_SP3_4',
  parts: [
    {
      partIndex: 1,
      name: 'Part 1',
      primitives: [
        { type: 'rect', x: -5, y: -2, w: 10, h: 4, width: 0.35 },
        { type: 'line', x1: 0, y1: -5, x2: 0, y2: -2.2, width: 0.32 },
        { type: 'line', x1: -1.1, y1: -3.5, x2: 0, y2: -2.0, width: 0.32 },
        { type: 'line', x1: 1.1, y1: -3.5, x2: 0, y2: -2.0, width: 0.32 }
      ],
      pins: [
        { id: 'p1', number: '1', name: '1', x: -10, y: 0, length: 5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '1' },
        { id: 'p2', number: '2', name: 'W', x: 0, y: -7.5, length: 2.5, orientation: 90, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '2' },
        { id: 'p3', number: '3', name: '3', x: 10, y: 0, length: 5, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '3' }
      ]
    }
  ]
};

const FUSE_PTC_500MA: ComponentDef = {
  id: 'COMP_F_PTC_500MA',
  name: 'Предохранитель самовосст. 500 мА (MF-MSMF050)',
  library: 'Соединители и коммутация (Лаб. AVR)',
  refDesPrefix: 'F',
  defaultValue: '0,5 А',
  gostStandard: 'ГОСТ 2.727-68',
  description: 'Самовосстанавливающийся полимерный предохранитель питания USB (500 мА)',
  manufacturer: 'Bourns / РФ',
  patternId: 'PAT_FUSE_1812',
  parts: [
    {
      partIndex: 1,
      name: 'Part 1',
      primitives: [
        { type: 'rect', x: -5, y: -2, w: 10, h: 4, width: 0.35 },
        { type: 'line', x1: -5, y1: 0, x2: 5, y2: 0, width: 0.35 }
      ],
      pins: [
        { id: 'p1', number: '1', name: '1', x: -10, y: 0, length: 5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '1' },
        { id: 'p2', number: '2', name: '2', x: 10, y: 0, length: 5, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '2' }
      ]
    }
  ]
};

const ICSP_6_HEADER = makeLinearHeaderComp(
  'COMP_XP_ICSP_6',
  'Разъём ПЛД-6 (AVR ICSP 2×3)',
  'ICSP (ПЛД-6)',
  'PAT_PLD_6_ICSP',
  [
    { num: '1', label: 'MISO' },
    { num: '2', label: '+5V (VCC)' },
    { num: '3', label: 'SCK' },
    { num: '4', label: 'MOSI' },
    { num: '5', label: 'RESET' },
    { num: '6', label: 'GND' }
  ]
);

const USBASP_10_HEADER = makeLinearHeaderComp(
  'COMP_XP_ISP10_USBASP',
  'Разъём ПЛД-10 (Программатор USBasp)',
  'ISP-10 (USBasp)',
  'PAT_PLD_10_ISP',
  [
    { num: '1', label: 'MOSI' },
    { num: '2', label: '+5V (VCC)' },
    { num: '3', label: 'NC' },
    { num: '4', label: 'GND' },
    { num: '5', label: 'RESET' },
    { num: '6', label: 'GND2' },
    { num: '7', label: 'SCK' },
    { num: '8', label: 'GND3' },
    { num: '9', label: 'MISO' },
    { num: '10', label: 'GND4' }
  ]
);

const USB_B_CONN: ComponentDef = {
  id: 'COMP_XS_USB_B',
  name: 'Разъём USB Type-B (Питание и шина)',
  library: 'Соединители и коммутация (Лаб. AVR)',
  refDesPrefix: 'XS',
  defaultValue: 'USB-B',
  gostStandard: 'ГОСТ 2.755-87',
  description: 'Гнездо USB Type-B (VBUS +5V, D-, D+, GND)',
  manufacturer: 'Connfly / РФ',
  patternId: 'PAT_USB_TYPE_B',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'USB-B',
      halfWidthMm: 10,
      leftPins: [
        { num: '1', name: 'VBUS (+5V)', type: 'Power' },
        { num: '2', name: 'D-', type: 'Bidirectional' },
        { num: '3', name: 'D+', type: 'Bidirectional' },
        { num: '4', name: 'GND', type: 'Power' }
      ],
      rightPins: []
    })
  ]
};

const DC_JACK_CONN: ComponentDef = {
  id: 'COMP_XS_DC_JACK',
  name: 'Гнездо питания DC-005 (7–12 В)',
  library: 'Соединители и коммутация (Лаб. AVR)',
  refDesPrefix: 'XS',
  defaultValue: 'DC 7-12В',
  gostStandard: 'ГОСТ 2.755-87',
  description: 'Цилиндрическое гнездо внешнего питания 5,5×2,1 мм',
  manufacturer: 'Connfly',
  patternId: 'PAT_DC_JACK_5_5',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'Пит. DC',
      halfWidthMm: 10,
      leftPins: [
        { num: '1', name: '+VIN (центр)', type: 'Power' },
        { num: '2', name: 'GND (контакт)', type: 'Power' },
        { num: '3', name: 'GND (корп.)', type: 'Power' }
      ],
      rightPins: []
    })
  ]
};

const DB9F_RS232: ComponentDef = {
  id: 'COMP_XS_DB9F_RS232',
  name: 'Разъём DB-9F (ОНЦ RS-232 COM)',
  library: 'Соединители и коммутация (Лаб. AVR)',
  refDesPrefix: 'XS',
  defaultValue: 'DB-9F RS-232',
  gostStandard: 'ГОСТ 2.755-87',
  description: '9-контактный соединитель последовательного порта RS-232 (COM)',
  manufacturer: 'РФ / Connfly',
  patternId: 'PAT_DB9_F',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'RS-232 DB9F',
      halfWidthMm: 10,
      leftPins: [
        { num: '2', name: 'RXD', type: 'Output' },
        { num: '3', name: 'TXD', type: 'Input' },
        { num: '5', name: 'GND', type: 'Power' },
        { num: '7', name: 'RTS', type: 'Input' },
        { num: '8', name: 'CTS', type: 'Output' }
      ],
      rightPins: []
    })
  ]
};

export const libIndicatorsAndSensors: ComponentLibrary = {
  id: 'lib_gost_ind_sensors',
  name: 'Индикаторы, датчики и приводы (ГОСТ)',
  category: 'Индикаторы и приводы',
  description: 'ЖКИ 16×2 HD44780, 7-сегм. АЛС324А/Б, сервопривод SG90, энкодер EC11, терминал UART',
  components: [
    LCD_16X2_HD44780,
    make7SegDef('COMP_HG_ALS324A_CC', 'Индикатор АЛС324А (7-сегм. Общ. Катод)', 'АЛС324А (ОК)', 'ОК (Общ. Катод)'),
    make7SegDef('COMP_HG_ALS324B_CA', 'Индикатор АЛС324Б (7-сегм. Общ. Анод)', 'АЛС324Б (ОА)', 'ОА (Общ. Анод)'),
    SERVO_SG90,
    ENCODER_EC11,
    VIRTUAL_TERMINAL_UART
  ]
};

const RES_NET_4X1K: ComponentDef = {
  id: 'COMP_R_ARRAY_4X1K',
  name: 'Матрица резисторная НР1-4 (4×1 кОм)',
  library: 'Интерфейсы, питание и соединители (AVR / Лаб.)',
  refDesPrefix: 'R',
  defaultValue: '4×1 кОм',
  gostStandard: 'ГОСТ 2.728-74',
  description: 'Сборка из 4 независимых резисторов (например, RN1–RN4 / CAY16)',
  manufacturer: 'РФ / Bourns',
  patternId: 'PAT_RES_NET_4',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'НР1-4 (4×R)',
      halfWidthMm: 10,
      leftPins: [
        { num: '1', name: 'R1.1', type: 'Passive' },
        { num: '2', name: 'R2.1', type: 'Passive' },
        { num: '3', name: 'R3.1', type: 'Passive' },
        { num: '4', name: 'R4.1', type: 'Passive' }
      ],
      rightPins: [
        { num: '8', name: 'R1.2', type: 'Passive' },
        { num: '7', name: 'R2.2', type: 'Passive' },
        { num: '6', name: 'R3.2', type: 'Passive' },
        { num: '5', name: 'R4.2', type: 'Passive' }
      ]
    })
  ]
};

const LMV358_DUAL_OPAMP: ComponentDef = {
  id: 'COMP_DA_LMV358',
  name: 'К140УД20 / LMV358 (Сдвоенный ОУ, SOIC-8)',
  library: 'Интерфейсы, питание и соединители (AVR / Лаб.)',
  refDesPrefix: 'DA',
  defaultValue: 'LMV358ID',
  gostStandard: 'ГОСТ 2.743-91',
  description: 'Двухсекционный низковольтный операционный усилитель (компаратор питания Arduino Uno)',
  manufacturer: 'РФ / TI',
  patternId: 'PAT_SOIC8',
  parts: [
    {
      partIndex: 1,
      name: 'Секция A (DA.1)',
      primitives: [
        { type: 'rect', x: -7.5, y: -7.5, w: 15, h: 15, width: 0.4 },
        { type: 'text', x: -4.5, y: -2.5, text: '+', size: 2.6, align: 'center' },
        { type: 'text', x: -4.5, y: 2.5, text: '−', size: 2.6, align: 'center' },
        { type: 'text', x: 0, y: 0, text: '▷', size: 3.0, align: 'center' }
      ],
      pins: [
        { id: 'oa1_p', number: '3', name: '+IN', x: -12.5, y: -2.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: false, showNumber: true, padMapping: '3' },
        { id: 'oa1_m', number: '2', name: '-IN', x: -12.5, y: 2.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: false, showNumber: true, padMapping: '2' },
        { id: 'oa1_o', number: '1', name: 'OUT', x: 12.5, y: 0, length: 5, orientation: 180, electricalType: 'Output', style: 'Line', showName: false, showNumber: true, padMapping: '1' },
        { id: 'oa1_vp', number: '8', name: 'VCC', x: 0, y: -10, length: 2.5, orientation: 90, electricalType: 'Power', style: 'Line', showName: false, showNumber: true, padMapping: '8' },
        { id: 'oa1_vn', number: '4', name: 'GND', x: 0, y: 10, length: 2.5, orientation: 270, electricalType: 'Power', style: 'Line', showName: false, showNumber: true, padMapping: '4' }
      ]
    },
    {
      partIndex: 2,
      name: 'Секция B (DA.2)',
      primitives: [
        { type: 'rect', x: -7.5, y: -7.5, w: 15, h: 15, width: 0.4 },
        { type: 'text', x: -4.5, y: -2.5, text: '+', size: 2.6, align: 'center' },
        { type: 'text', x: -4.5, y: 2.5, text: '−', size: 2.6, align: 'center' },
        { type: 'text', x: 0, y: 0, text: '▷', size: 3.0, align: 'center' }
      ],
      pins: [
        { id: 'oa2_p', number: '5', name: '+IN', x: -12.5, y: -2.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: false, showNumber: true, padMapping: '5' },
        { id: 'oa2_m', number: '6', name: '-IN', x: -12.5, y: 2.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: false, showNumber: true, padMapping: '6' },
        { id: 'oa2_o', number: '7', name: 'OUT', x: 12.5, y: 0, length: 5, orientation: 180, electricalType: 'Output', style: 'Line', showName: false, showNumber: true, padMapping: '7' }
      ]
    }
  ]
};

const PMOS_FDN340P: ComponentDef = {
  id: 'COMP_VT_FDN340P',
  name: 'КП745 / FDN340P (P-МОП транзистор, SOT-23)',
  library: 'Интерфейсы, питание и соединители (AVR / Лаб.)',
  refDesPrefix: 'VT',
  defaultValue: 'FDN340P',
  gostStandard: 'ГОСТ 2.730-73',
  description: 'Силовой P-канальный МОП-транзистор переключения питания (20 В, 2 А)',
  manufacturer: 'РФ / ON Semi',
  patternId: 'PAT_KT27_SOT23',
  parts: [
    {
      partIndex: 1,
      name: 'Part 1',
      primitives: [
        { type: 'circle', cx: 0, cy: 0, r: 5.5, width: 0.35 },
        { type: 'line', x1: -2.2, y1: -3.2, x2: -2.2, y2: 3.2, width: 0.38 },
        { type: 'line', x1: -0.5, y1: -3.4, x2: -0.5, y2: -1.3, width: 0.4 },
        { type: 'line', x1: -0.5, y1: -0.8, x2: -0.5, y2: 0.8, width: 0.4 },
        { type: 'line', x1: -0.5, y1: 1.3, x2: -0.5, y2: 3.4, width: 0.4 },
        { type: 'line', x1: -0.5, y1: 0, x2: 2.5, y2: 0, width: 0.32 },
        { type: 'line', x1: -0.5, y1: 2.5, x2: 2.5, y2: 2.5, width: 0.32 },
        { type: 'line', x1: -0.5, y1: -2.5, x2: 2.5, y2: -2.5, width: 0.32 },
        // P-channel outward substrate arrow
        { type: 'polyline', points: [{ x: 1.8, y: 0 }, { x: 0.3, y: -0.8 }, { x: 0.3, y: 0.8 }], closed: true, fill: true }
      ],
      pins: [
        { id: 'g', number: '1', name: 'З (G)', x: -10, y: 0, length: 7.8, orientation: 0, electricalType: 'Input', style: 'Line', showName: false, showNumber: true, padMapping: '1' },
        { id: 's', number: '2', name: 'И (S)', x: 2.5, y: -10, length: 7.5, orientation: 90, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '2' },
        { id: 'd', number: '3', name: 'С (D)', x: 2.5, y: 10, length: 7.5, orientation: 270, electricalType: 'Passive', style: 'Line', showName: false, showNumber: true, padMapping: '3' }
      ]
    }
  ]
};

const DIODE_KD247_1N4007: ComponentDef = {
  id: 'COMP_VD_KD247',
  name: 'КД247 / 1N4007 (Выпрямительный диод 1000 В, 1 А)',
  library: 'Интерфейсы, питание и соединители (AVR / Лаб.)',
  refDesPrefix: 'VD',
  defaultValue: 'КД247 (1N4007)',
  gostStandard: 'ГОСТ 2.730-73',
  description: 'Выпрямительный кремниевый диод защиты по питанию 1000 В, 1 А',
  manufacturer: 'РФ / Vishay',
  patternId: 'PAT_KD522',
  parts: [
    {
      partIndex: 1,
      name: 'Part 1',
      primitives: [
        { type: 'polyline', points: [{ x: -2.5, y: -3 }, { x: 2.5, y: 0 }, { x: -2.5, y: 3 }], closed: true, width: 0.35 },
        { type: 'line', x1: 2.5, y1: -3.2, x2: 2.5, y2: 3.2, width: 0.45 },
        { type: 'line', x1: -2.5, y1: 0, x2: 2.5, y2: 0, width: 0.3 }
      ],
      pins: [
        { id: 'a', number: '1', name: 'A', x: -10, y: 0, length: 7.5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '1' },
        { id: 'k', number: '2', name: 'K', x: 10, y: 0, length: 7.5, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '2' }
      ]
    }
  ]
};

export const libLabInterfacesAndPower: ComponentLibrary = {
  id: 'lib_gost_lab_if_pwr',
  name: 'Интерфейсы, питание и соединители (AVR / Лаб.)',
  category: 'Микросхемы',
  description: 'MAX232, FT232RL, CH340G, NCP1117-5.0, LP2985-3.3, К140УД20, КР1006ВИ1, 74HC595, КД247, FDN340P, НР1-4, ICSP, USBasp, СП3-38, DB-9',
  components: [
    MAX232_IC,
    FT232RL_IC,
    CH340G_IC,
    LDO_NCP1117_5V,
    LDO_LP2985_33,
    LMV358_DUAL_OPAMP,
    TIMER_KR1006VI1,
    SHIFT_REG_74HC595,
    PMOS_FDN340P,
    DIODE_KD247_1N4007,
    POTENTIOMETER_SP3_38,
    RES_NET_4X1K,
    FUSE_PTC_500MA,
    ICSP_6_HEADER,
    USBASP_10_HEADER,
    makeLinearHeaderComp('COMP_XP_PLS_3', 'Вилка ПЛС-3 (Серво / датчик)', 'ПЛС-3', 'PAT_PLS_3', [
      { num: '1', label: '1' }, { num: '2', label: '2' }, { num: '3', label: '3' }
    ]),
    makeLinearHeaderComp('COMP_XP_PLS_6', 'Вилка ПЛС-6 (Порт A0–A5)', 'ПЛС-6', 'PAT_PLS_6', [
      { num: '1', label: '1' }, { num: '2', label: '2' }, { num: '3', label: '3' },
      { num: '4', label: '4' }, { num: '5', label: '5' }, { num: '6', label: '6' }
    ]),
    makeLinearHeaderComp('COMP_XP_PLS_8', 'Вилка ПЛС-8 (Порт D0–D7)', 'ПЛС-8', 'PAT_PLS_8', [
      { num: '1', label: '1' }, { num: '2', label: '2' }, { num: '3', label: '3' }, { num: '4', label: '4' },
      { num: '5', label: '5' }, { num: '6', label: '6' }, { num: '7', label: '7' }, { num: '8', label: '8' }
    ]),
    makeLinearHeaderComp('COMP_XP_PLS_10', 'Вилка ПЛС-10 (Arduino D8..AREF)', 'ПЛС-10', 'PAT_PLS_10', Array.from({ length: 10 }, (_, i) => ({ num: String(i + 1), label: String(i + 1) }))),
    makeLinearHeaderComp('COMP_XP_PLS_16', 'Вилка ПЛС-16 (Разъём ЖКИ 1602)', 'ПЛС-16', 'PAT_PLS_16', Array.from({ length: 16 }, (_, i) => ({ num: String(i + 1), label: String(i + 1) }))),
    USB_B_CONN,
    DC_JACK_CONN,
    DB9F_RS232
  ]
};
