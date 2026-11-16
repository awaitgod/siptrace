import { PlacedComponent, SchematicProject } from '../core/types';
import { extractSchematicNets } from './erc';

export type LabSimMode =
  | 'servo'
  | 'encoder'
  | 'button_led'
  | 'branching_7seg'
  | 'adc_pot'
  | 'lcd1602'
  | 'usart_terminal'
  | 'hex_firmware';

export interface LabComponentBinding {
  refDes: string;
  role: 'mcu' | 'lcd' | 'sevenseg' | 'servo' | 'encoder' | 'terminal' | 'led' | 'button' | 'pot';
  label: string;
  connectedNets: string[];
}

export interface LabCircuitSummary {
  mcus: LabComponentBinding[];
  peripherals: LabComponentBinding[];
  suggestedMode: LabSimMode;
  netCount: number;
}

export interface ParsedHexResult {
  bytes: Uint8Array;
  byteCount: number;
  validRecords: number;
  firstOpcodesHex: string[];
  errors: string[];
}

export interface SevenSegState {
  digitChar: string;
  segments: { a: boolean; b: boolean; c: boolean; d: boolean; e: boolean; f: boolean; g: boolean; dp: boolean };
  commonMode: 'CC' | 'CA';
}

export interface LabSimState {
  mode: LabSimMode;
  running: boolean;
  tickCount: number;
  portB: number;
  portC: number;
  portD: number;
  buttons: [boolean, boolean, boolean, boolean];
  potVoltage: number;
  adcRaw: number;
  servoAngleDeg: number;
  servoPulseMs: number;
  encoderStep: number;
  encoderPhaseA: number;
  encoderPhaseB: number;
  encoderDirection: 'CW' | 'CCW' | 'STOP';
  sevenSeg: SevenSegState;
  lcdLines: [string, string];
  terminalLog: string[];
  hexInfo: {
    loaded: boolean;
    filename: string;
    byteCount: number;
    validRecords: number;
    pc: number;
    registers: number[];
    errors: string[];
    programBytes: Uint8Array | null;
  };
}

const SEVEN_SEG_MAP: Record<string, [number, number, number, number, number, number, number]> = {
  //        a  b  c  d  e  f  g
  '0': [1, 1, 1, 1, 1, 1, 0],
  '1': [0, 1, 1, 0, 0, 0, 0],
  '2': [1, 1, 0, 1, 1, 0, 1],
  '3': [1, 1, 1, 1, 0, 0, 1],
  '4': [0, 1, 1, 0, 0, 1, 1],
  '5': [1, 0, 1, 1, 0, 1, 1],
  '6': [1, 0, 1, 1, 1, 1, 1],
  '7': [1, 1, 1, 0, 0, 0, 0],
  '8': [1, 1, 1, 1, 1, 1, 1],
  '9': [1, 1, 1, 1, 0, 1, 1],
  'A': [1, 1, 1, 0, 1, 1, 1],
  'B': [0, 0, 1, 1, 1, 1, 1],
  'C': [1, 0, 0, 1, 1, 1, 0],
  'D': [0, 1, 1, 1, 1, 0, 1],
  'E': [1, 0, 0, 1, 1, 1, 1],
  'F': [1, 0, 0, 0, 1, 1, 1]
};

const QUADRATURE_STEPS: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1]
];

function classifyComponent(comp: PlacedComponent): LabComponentBinding['role'] | null {
  const id = comp.componentDefId.toUpperCase();
  const tn = `${comp.typeName} ${comp.value}`.toUpperCase();
  if (id.includes('ATMEGA') || id.includes('1986') || tn.includes('ATMEGA')) return 'mcu';
  if (id.includes('LCD') || tn.includes('1602') || tn.includes('HD44780') || tn.includes('WH1602')) return 'lcd';
  if (id.includes('ALS324') || tn.includes('АЛС324') || tn.includes('7SEG')) return 'sevenseg';
  if (id.includes('SERVO') || tn.includes('SG90') || tn.includes('СЕРВО')) return 'servo';
  if (id.includes('ENCODER') || tn.includes('EC11') || tn.includes('ЭНКОДЕР')) return 'encoder';
  if (id.includes('TERMINAL') || tn.includes('ТЕРМИНАЛ') || tn.includes('UART')) return 'terminal';
  if (id.includes('POT') || tn.includes('СП3')) return 'pot';
  if (id.includes('SB_') || comp.refDes.startsWith('SB')) return 'button';
  if (id.includes('AL307') || comp.refDes.startsWith('HL')) return 'led';
  return null;
}

/** Scans active schematic sheet and extracted nets for AVR/Lab peripherals and determines optimal simulation mode. */
export function analyzeLabCircuit(project: SchematicProject): LabCircuitSummary {
  const sheet = project.sheets.find((s) => s.id === project.activeSheetId) ?? project.sheets[0];
  const nets = extractSchematicNets(project);

  const compNetsMap = new Map<string, Set<string>>();
  for (const net of nets) {
    for (const pin of net.pins) {
      if (!compNetsMap.has(pin.compId)) compNetsMap.set(pin.compId, new Set());
      compNetsMap.get(pin.compId)!.add(`${pin.pinName}:${net.netName}`);
    }
  }

  const mcus: LabComponentBinding[] = [];
  const peripherals: LabComponentBinding[] = [];

  for (const c of sheet?.components ?? []) {
    const role = classifyComponent(c);
    if (!role) continue;
    const binding: LabComponentBinding = {
      refDes: c.refDes,
      role,
      label: `${c.refDes} (${c.value || c.typeName})`,
      connectedNets: Array.from(compNetsMap.get(c.id) ?? [])
    };
    if (role === 'mcu') mcus.push(binding);
    else peripherals.push(binding);
  }

  const roles = new Set(peripherals.map((p) => p.role));
  let suggestedMode: LabSimMode = 'button_led';
  if (roles.has('servo')) suggestedMode = 'servo';
  else if (roles.has('encoder')) suggestedMode = 'encoder';
  else if (roles.has('terminal')) suggestedMode = 'usart_terminal';
  else if (roles.has('lcd')) suggestedMode = 'lcd1602';
  else if (roles.has('sevenseg')) suggestedMode = 'branching_7seg';
  else if (roles.has('pot')) suggestedMode = 'adc_pot';

  return { mcus, peripherals, suggestedMode, netCount: nets.length };
}

/** Parses Intel HEX (.hex) AVR firmware binary with record checksum validation. */
export function parseIntelHex(hexText: string): ParsedHexResult {
  const mem = new Uint8Array(32768);
  mem.fill(0xff);
  let maxAddr = 0;
  let validRecords = 0;
  const errors: string[] = [];
  let extAddr = 0;

  for (const rawLine of hexText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!line.startsWith(':')) continue;
    if (line.length < 11) {
      errors.push(`Короткая строка HEX: ${line}`);
      continue;
    }

    const len = parseInt(line.slice(1, 3), 16);
    const addr = parseInt(line.slice(3, 7), 16);
    const recType = parseInt(line.slice(7, 9), 16);
    const dataHex = line.slice(9, 9 + len * 2);
    const chk = parseInt(line.slice(9 + len * 2, 11 + len * 2), 16);

    if (!Number.isFinite(len) || !Number.isFinite(addr) || !Number.isFinite(recType) || !Number.isFinite(chk)) {
      errors.push(`Ошибка разбора HEX: ${line}`);
      continue;
    }

    let sum = len + ((addr >> 8) & 0xff) + (addr & 0xff) + recType;
    const recBytes: number[] = [];
    for (let i = 0; i < len; i++) {
      const b = parseInt(dataHex.slice(i * 2, i * 2 + 2), 16);
      recBytes.push(b);
      sum += b;
    }
    const calcChk = ((~sum + 1) & 0xff);
    if (calcChk !== chk) {
      errors.push(`Ошибка КС (ожидалось ${calcChk.toString(16).toUpperCase()}, получено ${chk.toString(16).toUpperCase()})`);
      continue;
    }

    validRecords++;
    if (recType === 0x00) {
      const base = extAddr + addr;
      for (let i = 0; i < recBytes.length; i++) {
        if (base + i < mem.length) {
          mem[base + i] = recBytes[i];
          if (base + i + 1 > maxAddr) maxAddr = base + i + 1;
        }
      }
    } else if (recType === 0x01) {
      break;
    } else if (recType === 0x02 && recBytes.length >= 2) {
      extAddr = ((recBytes[0] << 8) | recBytes[1]) << 4;
    } else if (recType === 0x04 && recBytes.length >= 2) {
      extAddr = ((recBytes[0] << 8) | recBytes[1]) << 16;
    }
  }

  const trimmed = mem.slice(0, maxAddr);
  const firstOpcodesHex: string[] = [];
  for (let i = 0; i + 1 < Math.min(trimmed.length, 16); i += 2) {
    const word = trimmed[i] | (trimmed[i + 1] << 8);
    firstOpcodesHex.push(`0x${word.toString(16).toUpperCase().padStart(4, '0')}`);
  }

  return {
    bytes: trimmed,
    byteCount: maxAddr,
    validRecords,
    firstOpcodesHex,
    errors
  };
}

function buildSevenSegState(valueHex: string, commonMode: 'CC' | 'CA' = 'CC'): SevenSegState {
  const ch = valueHex.toUpperCase().slice(0, 1);
  const vec = SEVEN_SEG_MAP[ch] ?? SEVEN_SEG_MAP['0'];
  return {
    digitChar: ch,
    segments: {
      a: Boolean(vec[0]),
      b: Boolean(vec[1]),
      c: Boolean(vec[2]),
      d: Boolean(vec[3]),
      e: Boolean(vec[4]),
      f: Boolean(vec[5]),
      g: Boolean(vec[6]),
      dp: false
    },
    commonMode
  };
}

function pad16(s: string): string {
  return s.slice(0, 16).padEnd(16, ' ');
}

function formatStateLcd(s: LabSimState): [string, string] {
  switch (s.mode) {
    case 'servo':
      return [pad16(`SERVO SG90 PWM`), pad16(`ANG:${String(Math.round(s.servoAngleDeg)).padStart(3)} ${s.servoPulseMs.toFixed(2)}ms`)];
    case 'encoder':
      return [pad16(`ENCODER EC11`), pad16(`CNT:${String(s.encoderStep).padStart(4)} ${s.encoderDirection}`)];
    case 'adc_pot':
      return [pad16(`ADC=${String(s.adcRaw).padStart(4, '0')} 10bit`), pad16(`U=${s.potVoltage.toFixed(2)} V (REF 5V)`)];
    case 'branching_7seg':
      return [pad16(`ALS324 SEG=${s.sevenSeg.digitChar}`), pad16(`PORTB=0x${s.portB.toString(16).toUpperCase().padStart(2, '0')}`)];
    case 'usart_terminal':
      return [pad16(`USART 9600 8N1`), pad16(`PB=0x${s.portB.toString(16).toUpperCase().padStart(2, '0')} ANG=${Math.round(s.servoAngleDeg)}`)];
    case 'hex_firmware':
      return [pad16(`HEX AVR: ${s.hexInfo.byteCount}B`), pad16(`PB=${s.portB.toString(2).padStart(8, '0')}`)];
    default:
      return [pad16(`GOSTTRACE AVR`), pad16(`PORTB=${s.portB.toString(2).padStart(8, '0')}`)];
  }
}

/** Creates initial simulator state seeded from detected circuit peripherals. */
export function createInitialLabSimState(circuit: LabCircuitSummary): LabSimState {
  const hasCa = circuit.peripherals.some((p) => p.label.includes('АЛС324Б'));
  const base: LabSimState = {
    mode: circuit.suggestedMode,
    running: false,
    tickCount: 0,
    portB: 0b00000001,
    portC: 0,
    portD: 0,
    buttons: [false, false, false, false],
    potVoltage: 2.5,
    adcRaw: 512,
    servoAngleDeg: 90,
    servoPulseMs: 1.5,
    encoderStep: 0,
    encoderPhaseA: 0,
    encoderPhaseB: 0,
    encoderDirection: 'STOP',
    sevenSeg: buildSevenSegState('0', hasCa ? 'CA' : 'CC'),
    lcdLines: ['GOST-TRACE AVR  ', 'READY 16.0 MHz  '],
    terminalLog: ['[USART 9600 8N1] Готов. Введите HELP, STATUS, ADC, SERVO 45, LED 255'],
    hexInfo: {
      loaded: false,
      filename: '',
      byteCount: 0,
      validRecords: 0,
      pc: 0,
      registers: new Array(32).fill(0),
      errors: [],
      programBytes: null
    }
  };
  base.lcdLines = formatStateLcd(base);
  return base;
}

export type LabSimAction =
  | { type: 'setMode'; mode: LabSimMode }
  | { type: 'toggleRunning' }
  | { type: 'tick' }
  | { type: 'toggleButton'; index: 0 | 1 | 2 | 3 }
  | { type: 'setPotVoltage'; voltage: number }
  | { type: 'setServoAngle'; angleDeg: number }
  | { type: 'encoderCw' }
  | { type: 'encoderCcw' }
  | { type: 'encoderPush' }
  | { type: 'setSevenSegDigit'; digit: string }
  | { type: 'sendUart'; text: string }
  | { type: 'loadHex'; filename: string; hexText: string }
  | { type: 'reset' };

function executeAvrHexStep(state: LabSimState): Partial<LabSimState> {
  const prog = state.hexInfo.programBytes;
  if (!prog || prog.length < 2) return {};
  const regs = [...state.hexInfo.registers];
  let pc = state.hexInfo.pc;
  let portB = state.portB;
  let portC = state.portC;
  let portD = state.portD;

  // Execute up to 16 instructions per simulation step
  for (let steps = 0; steps < 16; steps++) {
    if (pc * 2 + 1 >= prog.length) pc = 0;
    const opcode = prog[pc * 2] | (prog[pc * 2 + 1] << 8);
    pc++;

    if ((opcode & 0xf000) === 0xe000) {
      // LDI Rd (r16..r31), K
      const rd = 16 + ((opcode >> 4) & 0x0f);
      const k = ((opcode & 0x0f00) >> 4) | (opcode & 0x0f);
      regs[rd] = k & 0xff;
    } else if ((opcode & 0xf800) === 0xb800) {
      // OUT A, Rr (PORTB=0x18/0x05, PORTC=0x15/0x08, PORTD=0x12/0x0B)
      const rr = (opcode >> 4) & 0x1f;
      const a = ((opcode & 0x0600) >> 5) | (opcode & 0x0f);
      const val = regs[rr] & 0xff;
      if (a === 0x18 || a === 0x05) portB = val;
      else if (a === 0x15 || a === 0x08) portC = val;
      else if (a === 0x12 || a === 0x0b) portD = val;
    } else if ((opcode & 0xff00) === 0x9a00) {
      // SBI A, b
      const a = (opcode >> 3) & 0x1f;
      const b = opcode & 0x07;
      if (a === 0x18 || a === 0x05) portB |= 1 << b;
      else if (a === 0x12 || a === 0x0b) portD |= 1 << b;
    } else if ((opcode & 0xff00) === 0x9800) {
      // CBI A, b
      const a = (opcode >> 3) & 0x1f;
      const b = opcode & 0x07;
      if (a === 0x18 || a === 0x05) portB &= ~(1 << b);
      else if (a === 0x12 || a === 0x0b) portD &= ~(1 << b);
    } else if ((opcode & 0xf000) === 0xc000) {
      // RJMP k
      let k = opcode & 0x0fff;
      if (k & 0x0800) k -= 0x1000;
      pc = Math.max(0, pc + k);
    }
  }

  return {
    portB: portB & 0xff,
    portC: portC & 0xff,
    portD: portD & 0xff,
    hexInfo: { ...state.hexInfo, pc, registers: regs }
  };
}

/** Pure reducer advancing interactive AVR/Lab simulation state. */
export function stepLabSimulation(state: LabSimState, action: LabSimAction): LabSimState {
  let next = { ...state };

  switch (action.type) {
    case 'setMode':
      next.mode = action.mode;
      break;
    case 'toggleRunning':
      next.running = !state.running;
      break;
    case 'toggleButton': {
      const btns: [boolean, boolean, boolean, boolean] = [...state.buttons];
      btns[action.index] = !btns[action.index];
      next.buttons = btns;
      next.portD = btns.reduce((acc, on, i) => (on ? acc | (1 << (i + 2)) : acc), 0);
      if (next.mode === 'button_led') {
        next.portB = btns[0] ? ((state.portB << 1) | (state.portB >> 7)) & 0xff : state.portB ^ (1 << action.index);
        if (next.portB === 0) next.portB = 1;
      } else if (next.mode === 'branching_7seg') {
        const idx = btns.findIndex(Boolean);
        next.sevenSeg = buildSevenSegState(idx >= 0 ? String(idx + 1) : '0', state.sevenSeg.commonMode);
      } else if (next.mode === 'servo') {
        const angle = btns[0] ? 0 : btns[1] ? 90 : btns[2] ? 180 : state.servoAngleDeg;
        next.servoAngleDeg = angle;
        next.servoPulseMs = 0.5 + (angle / 180) * 2.0;
      }
      break;
    }
    case 'setPotVoltage': {
      const v = Math.max(0, Math.min(5, action.voltage));
      const adc = Math.round((v / 5) * 1023);
      const bars = Math.round((v / 5) * 8);
      next.potVoltage = v;
      next.adcRaw = adc;
      next.portB = (1 << bars) - 1;
      next.sevenSeg = buildSevenSegState(Math.min(15, Math.floor((adc / 1024) * 16)).toString(16), state.sevenSeg.commonMode);
      break;
    }
    case 'setServoAngle': {
      const ang = Math.max(0, Math.min(180, action.angleDeg));
      next.servoAngleDeg = ang;
      next.servoPulseMs = Math.round((0.5 + (ang / 180) * 2.0) * 1000) / 1000;
      break;
    }
    case 'encoderCw': {
      const step = state.encoderStep + 1;
      const [a, b] = QUADRATURE_STEPS[((step % 4) + 4) % 4];
      next.encoderStep = step;
      next.encoderPhaseA = a;
      next.encoderPhaseB = b;
      next.encoderDirection = 'CW';
      next.portB = step & 0xff;
      next.sevenSeg = buildSevenSegState((((step % 16) + 16) % 16).toString(16), state.sevenSeg.commonMode);
      next.servoAngleDeg = Math.max(0, Math.min(180, state.servoAngleDeg + 15));
      next.servoPulseMs = 0.5 + (next.servoAngleDeg / 180) * 2.0;
      break;
    }
    case 'encoderCcw': {
      const step = state.encoderStep - 1;
      const [a, b] = QUADRATURE_STEPS[((step % 4) + 4) % 4];
      next.encoderStep = step;
      next.encoderPhaseA = a;
      next.encoderPhaseB = b;
      next.encoderDirection = 'CCW';
      next.portB = step & 0xff;
      next.sevenSeg = buildSevenSegState((((step % 16) + 16) % 16).toString(16), state.sevenSeg.commonMode);
      next.servoAngleDeg = Math.max(0, Math.min(180, state.servoAngleDeg - 15));
      next.servoPulseMs = 0.5 + (next.servoAngleDeg / 180) * 2.0;
      break;
    }
    case 'encoderPush': {
      next.encoderStep = 0;
      next.encoderDirection = 'STOP';
      next.portB = 0;
      next.sevenSeg = buildSevenSegState('0', state.sevenSeg.commonMode);
      break;
    }
    case 'setSevenSegDigit': {
      next.sevenSeg = buildSevenSegState(action.digit, state.sevenSeg.commonMode);
      const digitVal = parseInt(action.digit, 16);
      next.portB = Number.isFinite(digitVal) ? digitVal : 0;
      break;
    }
    case 'sendUart': {
      const cmd = action.text.trim();
      if (!cmd) break;
      const upper = cmd.toUpperCase();
      const log = [...state.terminalLog, `TX> ${cmd}`];
      if (upper === 'HELP') {
        log.push(`RX< Команды МК: STATUS, ADC, LED ON, LED OFF, LED <0..255>, SERVO <0..180>, LCD <текст>`);
      } else if (upper === 'STATUS') {
        log.push(`RX< PORTB=0x${state.portB.toString(16).toUpperCase().padStart(2, '0')} ADC=${state.adcRaw} SERVO=${state.servoAngleDeg}deg`);
      } else if (upper === 'ADC') {
        log.push(`RX< ADMUX=0x40 U=${state.potVoltage.toFixed(2)}V ADC=${state.adcRaw}`);
      } else if (upper === 'LED ON') {
        next.portB = 0xff;
        log.push(`RX< OK: PORTB=0xFF`);
      } else if (upper === 'LED OFF') {
        next.portB = 0x00;
        log.push(`RX< OK: PORTB=0x00`);
      } else if (/^LED\s+(\d+)$/.test(upper)) {
        const val = Math.max(0, Math.min(255, parseInt(upper.split(/\s+/)[1], 10)));
        next.portB = val;
        log.push(`RX< OK: PORTB=${val} (0x${val.toString(16).toUpperCase()})`);
      } else if (/^SERVO\s+(-?\d+)$/.test(upper)) {
        const deg = Math.max(0, Math.min(180, parseInt(upper.split(/\s+/)[1], 10)));
        next.servoAngleDeg = deg;
        next.servoPulseMs = 0.5 + (deg / 180) * 2.0;
        log.push(`RX< OK: OCR1A -> ${deg} deg (${next.servoPulseMs.toFixed(2)} ms)`);
      } else if (upper.startsWith('LCD ')) {
        const msg = cmd.slice(4);
        next.lcdLines = [pad16('USART -> LCD1602'), pad16(msg)];
        log.push(`RX< OK: LCD="${msg}"`);
        next.terminalLog = log.slice(-24);
        return next;
      } else {
        log.push(`RX< ECHO: ${cmd}`);
      }
      next.terminalLog = log.slice(-24);
      break;
    }
    case 'loadHex': {
      const parsed = parseIntelHex(action.hexText);
      next.mode = 'hex_firmware';
      next.hexInfo = {
        loaded: true,
        filename: action.filename,
        byteCount: parsed.byteCount,
        validRecords: parsed.validRecords,
        pc: 0,
        registers: new Array(32).fill(0),
        errors: parsed.errors,
        programBytes: parsed.bytes
      };
      next.terminalLog = [
        ...state.terminalLog,
        `[HEX] Загружен файл ${action.filename}: ${parsed.byteCount} байт (${parsed.validRecords} записей)`
      ].slice(-24);
      break;
    }
    case 'tick': {
      next.tickCount = state.tickCount + 1;
      if (state.mode === 'hex_firmware' && state.hexInfo.loaded) {
        Object.assign(next, executeAvrHexStep(state));
      } else if (state.mode === 'button_led') {
        const rotated = ((state.portB << 1) | (state.portB >> 7)) & 0xff;
        next.portB = rotated === 0 ? 1 : rotated;
      } else if (state.mode === 'branching_7seg') {
        const digits = '0123456789ABCDEF';
        const d = digits[next.tickCount % digits.length];
        next.sevenSeg = buildSevenSegState(d, state.sevenSeg.commonMode);
        next.portB = next.tickCount % digits.length;
      } else if (state.mode === 'servo') {
        const seq = [0, 45, 90, 135, 180, 90];
        const ang = seq[next.tickCount % seq.length];
        next.servoAngleDeg = ang;
        next.servoPulseMs = 0.5 + (ang / 180) * 2.0;
      }
      break;
    }
    case 'reset':
      return {
        ...createInitialLabSimState({ mcus: [], peripherals: [], suggestedMode: state.mode, netCount: 0 }),
        mode: state.mode
      };
  }

  next.lcdLines = formatStateLcd(next);
  return next;
}
