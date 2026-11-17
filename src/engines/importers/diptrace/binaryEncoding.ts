import { Point2D } from '../../../core/types';

export type DipTraceBinaryFamily = 'schematic' | 'pcb' | 'component' | 'pattern';

export interface DipTraceBinaryIdentity {
  family: DipTraceBinaryFamily;
  signature: string;
  version: number;
  bodyOffset: number;
  unicodeText: boolean;
  anglesInDegrees: boolean;
  ansiLengthBytes: 1 | 3;
}

const LEGACY_SCH_SIGS: Record<string, number> = {
  'DTSCHEM2.2': 27,
  'DTSCHEM2.21': 28,
  'DTSCHEM2.22': 29
};

const LEGACY_PCB_SIGS: Record<string, number> = {
  'DTBOARD2.2': 31,
  'DTBOARD2.21': 32,
  'DTBOARD2.22': 33
};

// Windows-1252 high-byte table (0x80..0x9F) for ANSI DipTrace files
const CP1252_HIGH: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
  0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018,
  0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc,
  0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178
};

function decodeCp1252(raw: Uint8Array): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i];
    out += String.fromCharCode(b >= 0x80 && b <= 0x9f ? (CP1252_HIGH[b] ?? b) : b);
  }
  return out;
}

function decodeCp1251(raw: Uint8Array): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else if (b >= 0xc0 && b <= 0xff) {
      out += String.fromCharCode(0x0410 + (b - 0xc0));
    } else if (b === 0xa8) {
      out += '\u0401';
    } else if (b === 0xb8) {
      out += '\u0451';
    } else if (b === 0xb0) {
      out += '\u00b0';
    } else if (b === 0xb5) {
      out += '\u00b5';
    } else if (b === 0xb1) {
      out += '\u00b1';
    } else if (b === 0x96) {
      out += '\u2013';
    } else if (b === 0x97) {
      out += '\u2014';
    } else if (b === 0xab) {
      out += '\u00ab';
    } else if (b === 0xbb) {
      out += '\u00bb';
    } else {
      out += String.fromCharCode(CP1252_HIGH[b] ?? b);
    }
  }
  return out;
}

/** Decodes raw ANSI (CP1251/CP1252) or UTF-8 DipTrace string bytes. */
export function decodeAnsiOrUtf8(raw: Uint8Array): string {
  let hasHigh = false;
  let hasCyrillicHigh = false;
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i];
    if (b >= 0x80) {
      hasHigh = true;
      if ((b >= 0xc0 && b <= 0xff) || b === 0xa8 || b === 0xb8) {
        hasCyrillicHigh = true;
      }
    }
  }
  if (!hasHigh) {
    let out = '';
    for (let i = 0; i < raw.length; i++) out += String.fromCharCode(raw[i]);
    return out;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    if (hasCyrillicHigh) return decodeCp1251(raw);
    return decodeCp1252(raw);
  }
}

function decodeUtf16Be(raw: Uint8Array): string {
  const units = Math.floor(raw.length / 2);
  const chars: string[] = [];
  for (let i = 0; i < units; i++) {
    const code = (raw[i * 2] << 8) | raw[i * 2 + 1];
    chars.push(String.fromCharCode(code));
  }
  return chars.join('');
}

function readBiasedInt24(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2]) - 1_000_000;
}

/** Detects whether a byte buffer is a native DipTrace binary file (.dch, .dip, .eli, .lib). */
export function detectDipTraceBinaryFormat(bytes: Uint8Array): DipTraceBinaryIdentity | null {
  if (!bytes || bytes.length < 4) return null;
  const sigLen = bytes[0];
  if (sigLen < 5 || sigLen > 24 || 1 + sigLen > bytes.length) return null;
  let signature = '';
  for (let i = 0; i < sigLen; i++) {
    const c = bytes[1 + i];
    if (c < 0x20 || c > 0x7e) return null;
    signature += String.fromCharCode(c);
  }
  let bodyOffset = 1 + sigLen;

  if (signature === 'DTSCHEM') {
    if (bytes.length < bodyOffset + 3) return null;
    const version = readBiasedInt24(bytes, bodyOffset);
    bodyOffset += 3;
    return {
      family: 'schematic',
      signature,
      version,
      bodyOffset,
      unicodeText: version >= 32,
      anglesInDegrees: version < 40,
      ansiLengthBytes: 3
    };
  }
  if (signature in LEGACY_SCH_SIGS) {
    return {
      family: 'schematic',
      signature,
      version: LEGACY_SCH_SIGS[signature],
      bodyOffset,
      unicodeText: false,
      anglesInDegrees: true,
      ansiLengthBytes: 3
    };
  }
  if (signature === 'DTBOARD') {
    if (bytes.length < bodyOffset + 3) return null;
    const version = readBiasedInt24(bytes, bodyOffset);
    bodyOffset += 3;
    return {
      family: 'pcb',
      signature,
      version,
      bodyOffset,
      unicodeText: version >= 38,
      anglesInDegrees: false,
      ansiLengthBytes: 3
    };
  }
  if (signature in LEGACY_PCB_SIGS) {
    return {
      family: 'pcb',
      signature,
      version: LEGACY_PCB_SIGS[signature],
      bodyOffset,
      unicodeText: false,
      anglesInDegrees: false,
      ansiLengthBytes: 3
    };
  }
  if (signature === 'DTELIB') {
    if (bytes.length < bodyOffset + 3) return null;
    const version = readBiasedInt24(bytes, bodyOffset);
    bodyOffset += 3;
    return {
      family: 'component',
      signature,
      version,
      bodyOffset,
      unicodeText: version >= 24,
      anglesInDegrees: false,
      ansiLengthBytes: 1
    };
  }
  const legacyEliM = /^DTELIB(\d+)$/.exec(signature);
  if (legacyEliM) {
    return {
      family: 'component',
      signature,
      version: parseInt(legacyEliM[1], 10),
      bodyOffset,
      unicodeText: false,
      anglesInDegrees: false,
      ansiLengthBytes: 1
    };
  }
  if (signature === 'DTCLIB') {
    if (bytes.length < bodyOffset + 3) return null;
    const version = readBiasedInt24(bytes, bodyOffset);
    bodyOffset += 3;
    return {
      family: 'pattern',
      signature,
      version,
      bodyOffset,
      unicodeText: version >= 18,
      anglesInDegrees: false,
      ansiLengthBytes: 1
    };
  }
  const legacyLibM = /^DTCLIB(\d+)$/.exec(signature);
  if (legacyLibM) {
    return {
      family: 'pattern',
      signature,
      version: parseInt(legacyLibM[1], 10),
      bodyOffset,
      unicodeText: false,
      anglesInDegrees: false,
      ansiLengthBytes: 1
    };
  }
  return null;
}

/** Sequential cursor for DipTrace's big-endian biased binary scalar stream. */
export class DipBinaryReader {
  public pos: number;
  public unicodeText: boolean;
  public ansiLengthBytes: 1 | 3;
  private readonly view: DataView;

  constructor(
    public readonly data: Uint8Array,
    public readonly identity: DipTraceBinaryIdentity
  ) {
    this.pos = identity.bodyOffset;
    this.unicodeText = identity.unicodeText;
    this.ansiLengthBytes = identity.ansiLengthBytes;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  get remaining(): number {
    return this.data.length - this.pos;
  }

  take(length: number): Uint8Array {
    if (length < 0 || this.pos + length > this.data.length) {
      throw new Error(`DipTrace binary truncated at 0x${this.pos.toString(16)}: need ${length}, have ${this.remaining}`);
    }
    const slice = this.data.subarray(this.pos, this.pos + length);
    this.pos += length;
    return slice;
  }

  byte(): number {
    if (this.pos >= this.data.length) {
      throw new Error(`DipTrace binary EOF at 0x${this.pos.toString(16)}`);
    }
    return this.data[this.pos++];
  }

  integer(): number {
    if (this.pos + 3 > this.data.length) {
      throw new Error(`DipTrace binary truncated integer at 0x${this.pos.toString(16)}`);
    }
    const val = readBiasedInt24(this.data, this.pos);
    this.pos += 3;
    return val;
  }

  /** Decodes 4-byte BE biased fixed-point number (1e-4 precision). */
  number(): number {
    if (this.pos + 4 > this.data.length) {
      throw new Error(`DipTrace binary truncated number at 0x${this.pos.toString(16)}`);
    }
    const raw = this.view.getUint32(this.pos, false);
    this.pos += 4;
    return (raw - 1_000_000_000) / 10_000;
  }

  /** Decodes shared length (3 DipTrace shared units = 1 mm) into millimetres. */
  mm(): number {
    return this.number() / 3;
  }

  boolean(): boolean {
    const b = this.byte();
    if (b !== 0 && b !== 1) {
      throw new Error(`Invalid DipTrace boolean ${b} at 0x${(this.pos - 1).toString(16)}`);
    }
    return b === 1;
  }

  color(): number {
    const raw = this.take(3);
    return raw[0] | (raw[1] << 8) | (raw[2] << 16);
  }

  text(forceLongAnsi = false): string {
    if (this.unicodeText) {
      const lenBytes = this.take(2);
      const len = (lenBytes[0] << 8) | lenBytes[1];
      return decodeUtf16Be(this.take(len * 2));
    }
    const len = (forceLongAnsi || this.ansiLengthBytes === 3) ? this.integer() : this.byte();
    if (len < 0 || len > this.remaining) {
      throw new Error(`Invalid DipTrace ANSI string length ${len} at 0x${this.pos.toString(16)}`);
    }
    return decodeAnsiOrUtf8(this.take(len));
  }

  count(label = 'items'): number {
    const start = this.pos;
    const v = this.integer();
    if (v < 0 || v > this.remaining) {
      throw new Error(`Invalid DipTrace ${label} count ${v} at 0x${start.toString(16)}`);
    }
    return v;
  }

  pointsMm(count: number): Point2D[] {
    const pts: Point2D[] = [];
    for (let i = 0; i < count; i++) {
      pts.push({ x: this.mm(), y: this.mm() });
    }
    return pts;
  }
}
