/**
 * Pure TypeScript zero-dependency ZIP archive reader and writer.
 * Supports Store (method 0) and Deflate (method 8, using CompressionStream/DecompressionStream or raw fallback).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function writeU16(buf: Uint8Array, offset: number, val: number) {
  buf[offset] = val & 0xff;
  buf[offset + 1] = (val >>> 8) & 0xff;
}

function writeU32(buf: Uint8Array, offset: number, val: number) {
  buf[offset] = val & 0xff;
  buf[offset + 1] = (val >>> 8) & 0xff;
  buf[offset + 2] = (val >>> 16) & 0xff;
  buf[offset + 3] = (val >>> 24) & 0xff;
}

function readU16(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

function readU32(buf: Uint8Array, offset: number): number {
  return (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0;
}

export function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

/** Creates a standard PKZIP binary archive (Store method 0, universally compatible with JLCPCB/PCBWay/Windows/7-Zip). */
export function createZipArchive(files: Record<string, string | Uint8Array>): Uint8Array {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((now.getSeconds() >> 1) & 0x1f);
  const dosDate = (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0x0f) << 5) | (now.getDate() & 0x1f);

  const names = Object.keys(files);
  for (const name of names) {
    const cleanName = name.replace(/^\/+/, '');
    const nameBytes = utf8Encode(cleanName);
    const raw = files[name];
    const data = typeof raw === 'string' ? utf8Encode(raw) : raw;
    const sum = crc32(data);

    // Local file header (30 + nameBytes.length)
    const lfh = new Uint8Array(30 + nameBytes.length);
    writeU32(lfh, 0, 0x04034b50);
    writeU16(lfh, 4, 20); // version needed
    writeU16(lfh, 6, 0x0800); // UTF-8 filename flag
    writeU16(lfh, 8, 0); // Store (0)
    writeU16(lfh, 10, dosTime);
    writeU16(lfh, 12, dosDate);
    writeU32(lfh, 14, sum);
    writeU32(lfh, 18, data.length);
    writeU32(lfh, 22, data.length);
    writeU16(lfh, 26, nameBytes.length);
    writeU16(lfh, 28, 0);
    lfh.set(nameBytes, 30);

    localChunks.push(lfh, data);

    // Central directory header (46 + nameBytes.length)
    const cdh = new Uint8Array(46 + nameBytes.length);
    writeU32(cdh, 0, 0x02014b50);
    writeU16(cdh, 4, 20);
    writeU16(cdh, 6, 20);
    writeU16(cdh, 8, 0x0800);
    writeU16(cdh, 10, 0);
    writeU16(cdh, 12, dosTime);
    writeU16(cdh, 14, dosDate);
    writeU32(cdh, 16, sum);
    writeU32(cdh, 20, data.length);
    writeU32(cdh, 24, data.length);
    writeU16(cdh, 28, nameBytes.length);
    writeU16(cdh, 30, 0);
    writeU16(cdh, 32, 0);
    writeU16(cdh, 34, 0);
    writeU16(cdh, 36, 0);
    writeU32(cdh, 38, 0);
    writeU32(cdh, 42, offset);
    cdh.set(nameBytes, 46);

    centralChunks.push(cdh);
    offset += lfh.length + data.length;
  }

  const centralSize = centralChunks.reduce((acc, b) => acc + b.length, 0);
  const eocd = new Uint8Array(22);
  writeU32(eocd, 0, 0x06054b50);
  writeU16(eocd, 4, 0);
  writeU16(eocd, 6, 0);
  writeU16(eocd, 8, names.length);
  writeU16(eocd, 10, names.length);
  writeU32(eocd, 12, centralSize);
  writeU32(eocd, 16, offset);
  writeU16(eocd, 20, 0);

  const totalLen = offset + centralSize + eocd.length;
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const ch of localChunks) {
    out.set(ch, pos);
    pos += ch.length;
  }
  for (const ch of centralChunks) {
    out.set(ch, pos);
    pos += ch.length;
  }
  out.set(eocd, pos);
  return out;
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('deflate-raw');
    const copy = new Uint8Array(compressed.length);
    copy.set(compressed);
    const stream = new Blob([copy]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }
  throw new Error('DecompressionStream deflate-raw недоступен в текущей среде.');
}

/** Checks if buffer starts with PK\x03\x04 or PK\x05\x06. */
export function isZipBuffer(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05);
}

/** Extracts all non-directory files from a ZIP binary buffer (Store + Deflate). */
export async function extractZipEntries(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  const result: Record<string, Uint8Array> = {};
  if (bytes.length < 22) return result;

  // Locate End of Central Directory (scan backwards from end up to 64KB)
  const searchStart = Math.max(0, bytes.length - 65558);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= searchStart; i--) {
    if (readU32(bytes, i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset >= 0) {
    const totalEntries = readU16(bytes, eocdOffset + 10);
    let cdPos = readU32(bytes, eocdOffset + 16);
    for (let idx = 0; idx < totalEntries && cdPos + 46 <= bytes.length; idx++) {
      if (readU32(bytes, cdPos) !== 0x02014b50) break;
      const method = readU16(bytes, cdPos + 10);
      const compSize = readU32(bytes, cdPos + 20);
      const nameLen = readU16(bytes, cdPos + 28);
      const extraLen = readU16(bytes, cdPos + 30);
      const commentLen = readU16(bytes, cdPos + 32);
      const localOffset = readU32(bytes, cdPos + 42);
      const fileName = utf8Decode(bytes.subarray(cdPos + 46, cdPos + 46 + nameLen));
      cdPos += 46 + nameLen + extraLen + commentLen;

      if (fileName.endsWith('/') || localOffset + 30 > bytes.length) continue;
      if (readU32(bytes, localOffset) !== 0x04034b50) continue;
      const lNameLen = readU16(bytes, localOffset + 26);
      const lExtraLen = readU16(bytes, localOffset + 28);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const slice = bytes.subarray(dataStart, Math.min(bytes.length, dataStart + compSize));

      if (method === 0) {
        result[fileName] = new Uint8Array(slice);
      } else if (method === 8) {
        try {
          result[fileName] = await inflateRawBytes(slice);
        } catch {
          // Ignore unreadable compressed blob while keeping remaining files
        }
      }
    }
    return result;
  }

  // Fallback linear scan of local headers
  let pos = 0;
  while (pos + 30 <= bytes.length && readU32(bytes, pos) === 0x04034b50) {
    const method = readU16(bytes, pos + 8);
    const compSize = readU32(bytes, pos + 18);
    const nameLen = readU16(bytes, pos + 26);
    const extraLen = readU16(bytes, pos + 28);
    const name = utf8Decode(bytes.subarray(pos + 30, pos + 30 + nameLen));
    const dataStart = pos + 30 + nameLen + extraLen;
    const slice = bytes.subarray(dataStart, Math.min(bytes.length, dataStart + compSize));
    if (!name.endsWith('/')) {
      if (method === 0) result[name] = new Uint8Array(slice);
      else if (method === 8) {
        try {
          result[name] = await inflateRawBytes(slice);
        } catch {
          // skip
        }
      }
    }
    pos = dataStart + compSize;
  }
  return result;
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
