/**
 * Zero-dependency Microsoft Compound Binary File (OLE2 / CFB) reader
 * used for decoding binary Altium Designer (.SchDoc, .PcbDoc, .SchLib) files.
 */

const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const FREESECT = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;
const FATSECT = 0xfffffffd;
const DIFSECT = 0xfffffffc;

export interface Ole2Stream {
  name: string;
  data: Uint8Array;
}

export function isOle2Binary(bytes: Uint8Array): boolean {
  if (bytes.length < 512) return false;
  for (let i = 0; i < OLE2_MAGIC.length; i++) {
    if (bytes[i] !== OLE2_MAGIC[i]) return false;
  }
  return true;
}

function readU16(view: DataView, off: number): number {
  return off + 2 <= view.byteLength ? view.getUint16(off, true) : 0;
}

function readU32(view: DataView, off: number): number {
  return off + 4 <= view.byteLength ? view.getUint32(off, true) : 0;
}

function decodeUtf16Name(bytes: Uint8Array, byteLen: number): string {
  const usable = Math.min(byteLen, bytes.length);
  let out = '';
  for (let i = 0; i + 1 < usable; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out;
}

function followChain(fat: number[], startSec: number, _sectorSize: number, readSector: (sec: number) => Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  const visited = new Set<number>();
  let sec = startSec;
  let steps = 0;
  while (sec !== ENDOFCHAIN && sec !== FREESECT && sec !== FATSECT && sec !== DIFSECT && steps < 200000) {
    if (visited.has(sec) || sec < 0 || sec >= fat.length) break;
    visited.add(sec);
    chunks.push(readSector(sec));
    sec = fat[sec];
    steps++;
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const res = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const c of chunks) {
    res.set(c, offset);
    offset += c.length;
  }
  return res;
}

/**
 * Extracts all named stream payloads from an OLE2 compound binary buffer.
 */
export function readOle2Streams(bytes: Uint8Array): Map<string, Uint8Array> {
  const result = new Map<string, Uint8Array>();
  if (!isOle2Binary(bytes)) return result;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorShift = readU16(view, 30);
  const miniSectorShift = readU16(view, 32);
  const sectorSize = 1 << Math.max(9, Math.min(12, sectorShift || 9));
  const miniSectorSize = 1 << Math.max(6, Math.min(9, miniSectorShift || 6));

  const numFatSectors = readU32(view, 44);
  const firstDirSector = readU32(view, 48);
  const miniCutoff = readU32(view, 56) || 4096;
  const firstMiniFatSector = readU32(view, 60);
  const firstDifatSector = readU32(view, 68);
  const numDifatSectors = readU32(view, 72);

  const readSector = (sec: number): Uint8Array => {
    const start = 512 + sec * sectorSize;
    if (start < 0 || start >= bytes.length) return new Uint8Array(0);
    return bytes.subarray(start, Math.min(bytes.length, start + sectorSize));
  };

  // Collect FAT sector IDs from header (up to 109) + DIFAT chain
  const fatSectorIds: number[] = [];
  for (let i = 0; i < 109 && fatSectorIds.length < numFatSectors; i++) {
    const id = readU32(view, 76 + i * 4);
    if (id !== FREESECT && id !== ENDOFCHAIN) fatSectorIds.push(id);
  }
  let difatSec = firstDifatSector;
  for (let d = 0; d < numDifatSectors && difatSec !== ENDOFCHAIN && difatSec !== FREESECT && fatSectorIds.length < numFatSectors; d++) {
    const secBytes = readSector(difatSec);
    if (secBytes.length < 4) break;
    const sv = new DataView(secBytes.buffer, secBytes.byteOffset, secBytes.byteLength);
    const entries = Math.floor((secBytes.length - 4) / 4);
    for (let i = 0; i < entries && fatSectorIds.length < numFatSectors; i++) {
      const id = sv.getUint32(i * 4, true);
      if (id !== FREESECT && id !== ENDOFCHAIN) fatSectorIds.push(id);
    }
    difatSec = sv.getUint32(secBytes.length - 4, true);
  }

  // Build full FAT table
  const fat: number[] = [];
  for (const fatSecId of fatSectorIds) {
    const secBytes = readSector(fatSecId);
    const sv = new DataView(secBytes.buffer, secBytes.byteOffset, secBytes.byteLength);
    for (let off = 0; off + 4 <= secBytes.length; off += 4) {
      fat.push(sv.getUint32(off, true));
    }
  }

  // Read Directory stream
  const dirBytes = followChain(fat, firstDirSector, sectorSize, readSector);
  const dirEntryCount = Math.floor(dirBytes.length / 128);

  // Build MiniFAT & MiniStream from Root Entry (entry 0)
  const miniFat: number[] = [];
  if (firstMiniFatSector !== ENDOFCHAIN && firstMiniFatSector !== FREESECT) {
    const miniFatBytes = followChain(fat, firstMiniFatSector, sectorSize, readSector);
    const mv = new DataView(miniFatBytes.buffer, miniFatBytes.byteOffset, miniFatBytes.byteLength);
    for (let off = 0; off + 4 <= miniFatBytes.length; off += 4) {
      miniFat.push(mv.getUint32(off, true));
    }
  }

  let miniStream: Uint8Array = new Uint8Array(0);
  if (dirEntryCount > 0) {
    const rootView = new DataView(dirBytes.buffer, dirBytes.byteOffset, Math.min(dirBytes.length, 128));
    const rootStart = readU32(rootView, 116);
    const rootSize = readU32(rootView, 120);
    if (rootStart !== ENDOFCHAIN && rootStart !== FREESECT) {
      miniStream = followChain(fat, rootStart, sectorSize, readSector).subarray(0, rootSize);
    }
  }

  const visited = new Set<number>();
  function readPayload(ev: DataView, startSec: number, size: number): Uint8Array {
    if (size < miniCutoff && miniStream.length > 0 && miniFat.length > 0) {
      return followChain(miniFat, startSec, miniSectorSize, (ms) => {
        const off = ms * miniSectorSize;
        return miniStream.subarray(off, Math.min(miniStream.length, off + miniSectorSize));
      }).subarray(0, size);
    }
    return followChain(fat, startSec, sectorSize, readSector).subarray(0, size);
  }

  function traverse(entryIdx: number, parentPath: string) {
    if (entryIdx < 0 || entryIdx >= dirEntryCount || visited.has(entryIdx) || entryIdx === 0xffffffff || entryIdx === 0xfffffffe) return;
    visited.add(entryIdx);

    const entry = dirBytes.subarray(entryIdx * 128, (entryIdx + 1) * 128);
    const ev = new DataView(entry.buffer, entry.byteOffset, entry.byteLength);
    const nameLen = readU16(ev, 64);
    const objType = entry[66];
    const name = decodeUtf16Name(entry, nameLen);
    const left = readU32(ev, 68);
    const right = readU32(ev, 72);
    const child = readU32(ev, 76);
    const startSec = readU32(ev, 116);
    const size = readU32(ev, 120);

    // Red-black siblings within the same parent storage
    traverse(left, parentPath);
    traverse(right, parentPath);

    if (objType === 1 || objType === 5) {
      // Storage object (folder)
      const currentPath = objType === 5 ? '' : (parentPath ? `${parentPath}/${name}` : name);
      traverse(child, currentPath);
    } else if (objType === 2) {
      // Stream object (file)
      if (name && size > 0 && startSec !== FREESECT && startSec !== ENDOFCHAIN) {
        const payload = readPayload(ev, startSec, size);
        const fullPath = parentPath ? `${parentPath}/${name}` : name;
        result.set(fullPath, payload);
        if (!result.has(name)) {
          result.set(name, payload);
        }
      }
    }
  }

  traverse(0, '');

  // Fallback flat scan if tree traversal yielded nothing (e.g. corrupted red-black tree links)
  if (result.size === 0) {
    for (let i = 1; i < dirEntryCount; i++) {
      const entry = dirBytes.subarray(i * 128, (i + 1) * 128);
      const ev = new DataView(entry.buffer, entry.byteOffset, entry.byteLength);
      const nameLen = readU16(ev, 64);
      const objType = entry[66];
      if (objType !== 2 || nameLen < 2) continue;
      const name = decodeUtf16Name(entry, nameLen);
      const startSec = readU32(ev, 116);
      const size = readU32(ev, 120);
      if (!name || size === 0 || startSec === FREESECT || startSec === ENDOFCHAIN) continue;

      const payload = readPayload(ev, startSec, size);
      result.set(name, payload);
    }
  }

  return result;
}
