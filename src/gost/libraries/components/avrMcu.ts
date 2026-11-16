import { ComponentDef, ComponentLibrary } from '../../../core/types';
import { makeGostRectangularIcPart } from './helpers';

const ATMEGA8_DIP28: ComponentDef = {
  id: 'COMP_DD_ATMEGA8_PU',
  name: 'ATmega8 / ATmega8A-PU (DIP-28)',
  library: 'Микроконтроллеры AVR (ГОСТ)',
  refDesPrefix: 'DD',
  defaultValue: 'ATmega8A-PU',
  gostStandard: 'ГОСТ 2.743-91',
  description: '8-разрядный AVR микроконтроллер 8 КБ Flash, АЦП, USART, ШИМ (DIP-28)',
  manufacturer: 'Atmel / Microchip',
  patternId: 'PAT_DIP28_N',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'ATmega8A-PU',
      subHeaderText: 'МПК (AVR 8-бит)',
      halfWidthMm: 17.5,
      leftPins: [
        { num: '1', name: 'PC6/RESET', type: 'Input', style: 'Inverted' },
        { num: '7', name: 'VCC', type: 'Power' },
        { num: '8', name: 'GND', type: 'Power' },
        { num: '20', name: 'AVCC', type: 'Power' },
        { num: '21', name: 'AREF', type: 'Passive' },
        { num: '22', name: 'GND', type: 'Power' },
        { num: '9', name: 'PB6/XTAL1', type: 'Input' },
        { num: '10', name: 'PB7/XTAL2', type: 'Output' },
        { num: '14', name: 'PB0/ICP1', type: 'Bidirectional' },
        { num: '15', name: 'PB1/OC1A', type: 'Bidirectional' },
        { num: '16', name: 'PB2/SS/OC1B', type: 'Bidirectional' },
        { num: '17', name: 'PB3/MOSI/OC2', type: 'Bidirectional' },
        { num: '18', name: 'PB4/MISO', type: 'Bidirectional' },
        { num: '19', name: 'PB5/SCK', type: 'Bidirectional' }
      ],
      rightPins: [
        { num: '23', name: 'PC0/ADC0', type: 'Bidirectional' },
        { num: '24', name: 'PC1/ADC1', type: 'Bidirectional' },
        { num: '25', name: 'PC2/ADC2', type: 'Bidirectional' },
        { num: '26', name: 'PC3/ADC3', type: 'Bidirectional' },
        { num: '27', name: 'PC4/ADC4/SDA', type: 'Bidirectional' },
        { num: '28', name: 'PC5/ADC5/SCL', type: 'Bidirectional' },
        { num: '2', name: 'PD0/RXD', type: 'Bidirectional' },
        { num: '3', name: 'PD1/TXD', type: 'Bidirectional' },
        { num: '4', name: 'PD2/INT0', type: 'Bidirectional' },
        { num: '5', name: 'PD3/INT1', type: 'Bidirectional' },
        { num: '6', name: 'PD4/T0', type: 'Bidirectional' },
        { num: '11', name: 'PD5/T1', type: 'Bidirectional' },
        { num: '12', name: 'PD6/AIN0', type: 'Bidirectional' },
        { num: '13', name: 'PD7/AIN1', type: 'Bidirectional' }
      ]
    })
  ]
};

const ATMEGA8_TQFP32: ComponentDef = {
  id: 'COMP_DD_ATMEGA8_AU',
  name: 'ATmega8A-AU (TQFP-32)',
  library: 'Микроконтроллеры AVR (ГОСТ)',
  refDesPrefix: 'DD',
  defaultValue: 'ATmega8A-AU',
  gostStandard: 'ГОСТ 2.743-91',
  description: '8-разрядный AVR микроконтроллер 8 КБ Flash в планарном корпусе TQFP-32',
  manufacturer: 'Atmel / Microchip',
  patternId: 'PAT_TQFP32',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'ATmega8A-AU',
      subHeaderText: 'МПК TQFP-32',
      halfWidthMm: 17.5,
      leftPins: [
        { num: '29', name: 'PC6/RESET', type: 'Input', style: 'Inverted' },
        { num: '4', name: 'VCC', type: 'Power' },
        { num: '6', name: 'VCC2', type: 'Power' },
        { num: '18', name: 'AVCC', type: 'Power' },
        { num: '20', name: 'AREF', type: 'Passive' },
        { num: '3', name: 'GND', type: 'Power' },
        { num: '5', name: 'GND2', type: 'Power' },
        { num: '21', name: 'GND', type: 'Power' },
        { num: '7', name: 'PB6/XTAL1', type: 'Input' },
        { num: '8', name: 'PB7/XTAL2', type: 'Output' },
        { num: '12', name: 'PB0', type: 'Bidirectional' },
        { num: '13', name: 'PB1/OC1A', type: 'Bidirectional' },
        { num: '14', name: 'PB2/SS/OC1B', type: 'Bidirectional' },
        { num: '15', name: 'PB3/MOSI', type: 'Bidirectional' },
        { num: '16', name: 'PB4/MISO', type: 'Bidirectional' },
        { num: '17', name: 'PB5/SCK', type: 'Bidirectional' }
      ],
      rightPins: [
        { num: '23', name: 'PC0/ADC0', type: 'Bidirectional' },
        { num: '24', name: 'PC1/ADC1', type: 'Bidirectional' },
        { num: '25', name: 'PC2/ADC2', type: 'Bidirectional' },
        { num: '26', name: 'PC3/ADC3', type: 'Bidirectional' },
        { num: '27', name: 'PC4/ADC4', type: 'Bidirectional' },
        { num: '28', name: 'PC5/ADC5', type: 'Bidirectional' },
        { num: '19', name: 'ADC6', type: 'Input' },
        { num: '22', name: 'ADC7', type: 'Input' },
        { num: '30', name: 'PD0/RXD', type: 'Bidirectional' },
        { num: '31', name: 'PD1/TXD', type: 'Bidirectional' },
        { num: '32', name: 'PD2/INT0', type: 'Bidirectional' },
        { num: '1', name: 'PD3/INT1', type: 'Bidirectional' },
        { num: '2', name: 'PD4', type: 'Bidirectional' },
        { num: '9', name: 'PD5', type: 'Bidirectional' },
        { num: '10', name: 'PD6', type: 'Bidirectional' },
        { num: '11', name: 'PD7', type: 'Bidirectional' }
      ]
    })
  ]
};

const ATMEGA328P_PU: ComponentDef = {
  id: 'COMP_DD_ATMEGA328P_PU',
  name: 'ATmega328P-PU (DIP-28 / Arduino Uno)',
  library: 'Микроконтроллеры AVR (ГОСТ)',
  refDesPrefix: 'DD',
  defaultValue: 'ATmega328P-PU',
  gostStandard: 'ГОСТ 2.743-91',
  description: 'AVR микроконтроллер 32 КБ Flash (платформа Arduino Uno, ШИМ OC1A/OC1B, SPI, USART)',
  manufacturer: 'Atmel / Microchip',
  patternId: 'PAT_DIP28_N',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'ATmega328P-PU',
      subHeaderText: 'МПК 32 КБ (AVR)',
      halfWidthMm: 17.5,
      leftPins: ATMEGA8_DIP28.parts[0].pins
        .filter((p) => p.x < 0)
        .map((p) => ({ num: p.number, name: p.name.replace('OC1A', 'OC1A/D9'), type: p.electricalType, style: p.style })),
      rightPins: ATMEGA8_DIP28.parts[0].pins
        .filter((p) => p.x > 0)
        .map((p) => ({ num: p.number, name: p.name, type: p.electricalType, style: p.style }))
    })
  ]
};

const ATMEGA328P_AU: ComponentDef = {
  id: 'COMP_DD_ATMEGA328P_AU',
  name: 'ATmega328P-AU (TQFP-32)',
  library: 'Микроконтроллеры AVR (ГОСТ)',
  refDesPrefix: 'DD',
  defaultValue: 'ATmega328P-AU',
  gostStandard: 'ГОСТ 2.743-91',
  description: 'AVR микроконтроллер 32 КБ Flash в планарном корпусе TQFP-32',
  manufacturer: 'Atmel / Microchip',
  patternId: 'PAT_TQFP32',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'ATmega328P-AU',
      subHeaderText: 'МПК TQFP-32',
      halfWidthMm: 17.5,
      leftPins: ATMEGA8_TQFP32.parts[0].pins.filter((p) => p.x < 0).map((p) => ({ num: p.number, name: p.name, type: p.electricalType, style: p.style })),
      rightPins: ATMEGA8_TQFP32.parts[0].pins.filter((p) => p.x > 0).map((p) => ({ num: p.number, name: p.name, type: p.electricalType, style: p.style }))
    })
  ]
};

const ATMEGA16_PU: ComponentDef = {
  id: 'COMP_DD_ATMEGA16_PU',
  name: 'ATmega16 / ATmega16A (DIP-40)',
  library: 'Микроконтроллеры AVR (ГОСТ)',
  refDesPrefix: 'DD',
  defaultValue: 'ATmega16A-PU',
  gostStandard: 'ГОСТ 2.743-91',
  description: 'AVR микроконтроллер 16 КБ Flash, 32 линии ввода-вывода (PA/PB/PC/PD), USART, ШИМ OC1A/OC1B (DIP-40)',
  manufacturer: 'Atmel / Microchip',
  patternId: 'PAT_DIP40',
  parts: [
    makeGostRectangularIcPart({
      headerText: 'ATmega16A-PU',
      subHeaderText: 'МПК 40 выв. (AVR)',
      halfWidthMm: 20,
      leftPins: [
        { num: '9', name: 'RESET', type: 'Input', style: 'Inverted' },
        { num: '10', name: 'VCC', type: 'Power' },
        { num: '30', name: 'AVCC', type: 'Power' },
        { num: '32', name: 'AREF', type: 'Passive' },
        { num: '11', name: 'GND', type: 'Power' },
        { num: '31', name: 'GND', type: 'Power' },
        { num: '13', name: 'XTAL1', type: 'Input' },
        { num: '12', name: 'XTAL2', type: 'Output' },
        { num: '40', name: 'PA0/ADC0', type: 'Bidirectional' },
        { num: '39', name: 'PA1/ADC1', type: 'Bidirectional' },
        { num: '38', name: 'PA2/ADC2', type: 'Bidirectional' },
        { num: '37', name: 'PA3/ADC3', type: 'Bidirectional' },
        { num: '36', name: 'PA4/ADC4', type: 'Bidirectional' },
        { num: '35', name: 'PA5/ADC5', type: 'Bidirectional' },
        { num: '34', name: 'PA6/ADC6', type: 'Bidirectional' },
        { num: '33', name: 'PA7/ADC7', type: 'Bidirectional' },
        { num: '1', name: 'PB0/T0', type: 'Bidirectional' },
        { num: '2', name: 'PB1/T1', type: 'Bidirectional' },
        { num: '3', name: 'PB2/INT2', type: 'Bidirectional' },
        { num: '4', name: 'PB3/OC0', type: 'Bidirectional' }
      ],
      rightPins: [
        { num: '5', name: 'PB4/SS', type: 'Bidirectional' },
        { num: '6', name: 'PB5/MOSI', type: 'Bidirectional' },
        { num: '7', name: 'PB6/MISO', type: 'Bidirectional' },
        { num: '8', name: 'PB7/SCK', type: 'Bidirectional' },
        { num: '22', name: 'PC0/SCL', type: 'Bidirectional' },
        { num: '23', name: 'PC1/SDA', type: 'Bidirectional' },
        { num: '24', name: 'PC2/TCK', type: 'Bidirectional' },
        { num: '25', name: 'PC3/TMS', type: 'Bidirectional' },
        { num: '26', name: 'PC4/TDO', type: 'Bidirectional' },
        { num: '27', name: 'PC5/TDI', type: 'Bidirectional' },
        { num: '28', name: 'PC6/TOSC1', type: 'Bidirectional' },
        { num: '29', name: 'PC7/TOSC2', type: 'Bidirectional' },
        { num: '14', name: 'PD0/RXD', type: 'Bidirectional' },
        { num: '15', name: 'PD1/TXD', type: 'Bidirectional' },
        { num: '16', name: 'PD2/INT0', type: 'Bidirectional' },
        { num: '17', name: 'PD3/INT1', type: 'Bidirectional' },
        { num: '18', name: 'PD4/OC1B', type: 'Bidirectional' },
        { num: '19', name: 'PD5/OC1A', type: 'Bidirectional' },
        { num: '20', name: 'PD6/ICP1', type: 'Bidirectional' },
        { num: '21', name: 'PD7/OC2', type: 'Bidirectional' }
      ]
    })
  ]
};

export const libAvrMcu: ComponentLibrary = {
  id: 'lib_gost_avr_mcu',
  name: 'Микроконтроллеры AVR (ГОСТ)',
  category: 'Микросхемы',
  description: 'УГО ГОСТ 2.743-91 для микроконтроллеров AVR: ATmega8, ATmega16, ATmega328P',
  components: [ATMEGA8_DIP28, ATMEGA8_TQFP32, ATMEGA16_PU, ATMEGA328P_PU, ATMEGA328P_AU]
};
