import { ComponentLibrary } from '../../../core/types';

export const libRussianMcu: ComponentLibrary = {
  id: 'lib_gost_mcu',
  name: 'Микроконтроллеры РФ',
  category: 'Микросхемы',
  description: 'Отечественные микроконтроллеры Миландр (К1986ВЕ92QI) и НИИЭТ (К1921ВК01Т)',
  components: [
    {
      id: 'COMP_DD_K1986VE92QI',
      name: 'К1986ВЕ92QI (Миландр Cortex-M3)',
      library: 'Микроконтроллеры РФ',
      refDesPrefix: 'DD',
      defaultValue: 'К1986ВЕ92QI',
      gostStandard: 'ТСКЯ.431296.001СП',
      description: '32-разрядный микроконтроллер ARM Cortex-M3 (АО «ПКК Миландр», LQFP-64, 2.2–3.6 В)',
      manufacturer: 'АО «ПКК Миландр»',
      patternId: 'PAT_LQFP64',
      parts: [
        {
          partIndex: 1,
          name: 'Секция 1: Система, питание и порты PA/PB/PC',
          primitives: [
            { type: 'rect', x: -20, y: -47.5, w: 40, h: 95, width: 0.45 },
            { type: 'text', x: 0, y: -43.5, text: 'К1986ВЕ92QI', size: 2.6, bold: true, align: 'center' },
            { type: 'text', x: 0, y: -39.5, text: 'DD (LQFP-64, 3.3В)', size: 2.0, align: 'center' }
          ],
          pins: [
            // Left: Reset, Clock, USB, Port A, PC0..1 (17 pins, y = -35..+45 step 5)
            { id: 'p_rst', number: '18', name: 'RESET', x: -25, y: -35, length: 5, orientation: 0, electricalType: 'Input', style: 'Inverted', showName: true, showNumber: true, padMapping: '18' },
            { id: 'p_wkp', number: '17', name: 'WAKEUP', x: -25, y: -30, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true, padMapping: '17' },
            { id: 'p_stb', number: '14', name: 'STANBY', x: -25, y: -25, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true, padMapping: '14' },
            { id: 'p_osci', number: '19', name: 'OSC_IN', x: -25, y: -20, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true, padMapping: '19' },
            { id: 'p_osco', number: '20', name: 'OSC_OUT', x: -25, y: -15, length: 5, orientation: 0, electricalType: 'Output', style: 'Line', showName: true, showNumber: true, padMapping: '20' },
            { id: 'p_dp', number: '9', name: 'USB_DP', x: -25, y: -10, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '9' },
            { id: 'p_dn', number: '10', name: 'USB_DN', x: -25, y: -5, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '10' },
            { id: 'p_pa0', number: '63', name: 'PA0', x: -25, y: 0, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '63' },
            { id: 'p_pa1', number: '62', name: 'PA1', x: -25, y: 5, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '62' },
            { id: 'p_pa2', number: '61', name: 'PA2', x: -25, y: 10, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '61' },
            { id: 'p_pa3', number: '60', name: 'PA3', x: -25, y: 15, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '60' },
            { id: 'p_pa4', number: '59', name: 'PA4', x: -25, y: 20, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '59' },
            { id: 'p_pa5', number: '58', name: 'PA5', x: -25, y: 25, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '58' },
            { id: 'p_pa6', number: '57', name: 'PA6', x: -25, y: 30, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '57' },
            { id: 'p_pa7', number: '56', name: 'PA7', x: -25, y: 35, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '56' },
            { id: 'p_pc0', number: '42', name: 'PC0', x: -25, y: 40, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '42' },
            { id: 'p_pc1', number: '41', name: 'PC1', x: -25, y: 45, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '41' },
            // Right: UCC1..4, GND1, PC2, PB0..PB10 (17 pins, y = -35..+45 step 5)
            { id: 'p_ucc1', number: '12', name: 'UCC1', x: 25, y: -35, length: 5, orientation: 180, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '12' },
            { id: 'p_ucc2', number: '1', name: 'UCC2', x: 25, y: -30, length: 5, orientation: 180, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '1' },
            { id: 'p_ucc3', number: '48', name: 'UCC3', x: 25, y: -25, length: 5, orientation: 180, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '48' },
            { id: 'p_ucc4', number: '38', name: 'UCC4', x: 25, y: -20, length: 5, orientation: 180, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '38' },
            { id: 'p_pb0', number: '43', name: 'PB0', x: 25, y: -15, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '43' },
            { id: 'p_pb1', number: '44', name: 'PB1', x: 25, y: -10, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '44' },
            { id: 'p_pb2', number: '45', name: 'PB2', x: 25, y: -5, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '45' },
            { id: 'p_pb3', number: '46', name: 'PB3', x: 25, y: 0, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '46' },
            { id: 'p_pb4', number: '47', name: 'PB4', x: 25, y: 5, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '47' },
            { id: 'p_pb5', number: '50', name: 'PB5/TDI', x: 25, y: 10, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '50' },
            { id: 'p_pb6', number: '51', name: 'PB6/TDO', x: 25, y: 15, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '51' },
            { id: 'p_pb7', number: '52', name: 'PB7/TCK', x: 25, y: 20, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '52' },
            { id: 'p_pb8', number: '53', name: 'PB8/TMS', x: 25, y: 25, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '53' },
            { id: 'p_pb9', number: '54', name: 'PB9', x: 25, y: 30, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '54' },
            { id: 'p_pb10', number: '55', name: 'PB10', x: 25, y: 35, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '55' },
            { id: 'p_pc2', number: '40', name: 'PC2', x: 25, y: 40, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '40' },
            { id: 'p_gnd1', number: '11', name: 'GND1', x: 25, y: 45, length: 5, orientation: 180, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '11' }
          ]
        },
        {
          partIndex: 2,
          name: 'Секция 2: Порты PD/PE/PF и аналоговое питание',
          primitives: [
            { type: 'rect', x: -20, y: -42.5, w: 40, h: 85, width: 0.45 },
            { type: 'text', x: 0, y: -38.5, text: 'К1986ВЕ92QI (PD–PF)', size: 2.3, bold: true, align: 'center' }
          ],
          pins: [
            // Left: PD0..7, PE0..3, PE6..7, NC (15 pins, y = -30..+40 step 5)
            { id: 'p_pd0', number: '31', name: 'PD0', x: -25, y: -30, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '31' },
            { id: 'p_pd1', number: '32', name: 'PD1', x: -25, y: -25, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '32' },
            { id: 'p_pd2', number: '33', name: 'PD2', x: -25, y: -20, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '33' },
            { id: 'p_pd3', number: '34', name: 'PD3', x: -25, y: -15, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '34' },
            { id: 'p_pd4', number: '30', name: 'PD4', x: -25, y: -10, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '30' },
            { id: 'p_pd5', number: '35', name: 'PD5', x: -25, y: -5, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '35' },
            { id: 'p_pd6', number: '36', name: 'PD6', x: -25, y: 0, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '36' },
            { id: 'p_pd7', number: '29', name: 'PD7', x: -25, y: 5, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '29' },
            { id: 'p_pe0', number: '26', name: 'PE0', x: -25, y: 10, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '26' },
            { id: 'p_pe1', number: '25', name: 'PE1', x: -25, y: 15, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '25' },
            { id: 'p_pe2', number: '22', name: 'PE2', x: -25, y: 20, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '22' },
            { id: 'p_pe3', number: '21', name: 'PE3', x: -25, y: 25, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '21' },
            { id: 'p_pe6', number: '16', name: 'PE6', x: -25, y: 30, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '16' },
            { id: 'p_pe7', number: '15', name: 'PE7', x: -25, y: 35, length: 5, orientation: 0, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '15' },
            { id: 'p_nc', number: '37', name: 'NC', x: -25, y: 40, length: 5, orientation: 0, electricalType: 'NotConnected', style: 'Line', showName: true, showNumber: true, padMapping: '37' },
            // Right: PF0..6, BUCC, AUCC1..2, AGND1..2, GND2..4 (15 pins, y = -30..+40 step 5)
            { id: 'p_pf0', number: '2', name: 'PF0', x: 25, y: -30, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '2' },
            { id: 'p_pf1', number: '3', name: 'PF1', x: 25, y: -25, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '3' },
            { id: 'p_pf2', number: '4', name: 'PF2', x: 25, y: -20, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '4' },
            { id: 'p_pf3', number: '5', name: 'PF3', x: 25, y: -15, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '5' },
            { id: 'p_pf4', number: '6', name: 'PF4', x: 25, y: -10, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '6' },
            { id: 'p_pf5', number: '7', name: 'PF5', x: 25, y: -5, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '7' },
            { id: 'p_pf6', number: '8', name: 'PF6', x: 25, y: 0, length: 5, orientation: 180, electricalType: 'Bidirectional', style: 'Line', showName: true, showNumber: true, padMapping: '8' },
            { id: 'p_bucc', number: '13', name: 'BUCC', x: 25, y: 5, length: 5, orientation: 180, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '13' },
            { id: 'p_aucc1', number: '28', name: 'AUCC1', x: 25, y: 10, length: 5, orientation: 180, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '28' },
            { id: 'p_aucc2', number: '24', name: 'AUCC2', x: 25, y: 15, length: 5, orientation: 180, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '24' },
            { id: 'p_agnd1', number: '27', name: 'AGND1', x: 25, y: 20, length: 5, orientation: 180, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '27' },
            { id: 'p_agnd2', number: '23', name: 'AGND2', x: 25, y: 25, length: 5, orientation: 180, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '23' },
            { id: 'p_gnd2', number: '64', name: 'GND2', x: 25, y: 30, length: 5, orientation: 180, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '64' },
            { id: 'p_gnd3', number: '49', name: 'GND3', x: 25, y: 35, length: 5, orientation: 180, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '49' },
            { id: 'p_gnd4', number: '39', name: 'GND4', x: 25, y: 40, length: 5, orientation: 180, electricalType: 'Power', style: 'Line', showName: true, showNumber: true, padMapping: '39' }
          ]
        }
      ]
    }
  ]
};
