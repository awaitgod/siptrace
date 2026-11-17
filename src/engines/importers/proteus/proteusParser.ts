import { ComponentDef, PlacedComponent, SchNetPort, SchWire, SchematicProject } from '../../../core/types';
import { uid } from '../../../core/geometry';
import { extractZipEntries, isZipBuffer } from '../../../core/utils/zipArchive';
import { convertImportedSchematicToGost, GostConversionReport } from '../gostConverter';
import { makeChipComponentDef, makeEcadSchematicProject, placeDefOnSheet } from '../ecad/ecadFactories';

function extractAsciiTokens(buf: Uint8Array, minLen = 2): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < buf.length; i++) {
    const ch = buf[i];
    if (ch >= 32 && ch <= 126) cur += String.fromCharCode(ch);
    else {
      if (cur.length >= minLen) out.push(cur);
      cur = '';
    }
  }
  if (cur.length >= minLen) out.push(cur);
  return out;
}

function parseProteusCdbComponents(cdbBytes: Uint8Array): { refs: Array<{ refDes: string; partName: string }>; nets: string[] } {
  const tokens = extractAsciiTokens(cdbBytes, 2);
  const refs: Array<{ refDes: string; partName: string }> = [];
  const seenRefs = new Set<string>();
  const nets: string[] = [];
  const seenNets = new Set<string>();

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].trim();
    if (/^[A-Z]{1,4}\d{1,4}$/.test(t) && !/^V\d+$/.test(t) && !seenRefs.has(t)) {
      const prev = tokens[i - 1]?.trim() || '';
      const next = tokens[i + 1]?.trim() || '';
      const partName = /^[A-Za-z0-9_.\-/]{3,28}$/.test(next) && !/^[A-Z]{1,4}\d+$/.test(next)
        ? next : (/^[A-Za-z0-9_.\-/]{3,28}$/.test(prev) ? prev : t.replace(/\d+$/, ''));
      seenRefs.add(t);
      refs.push({ refDes: t, partName });
    } else if (/^(GND|VCC|VDD|VSS|3V3|5V|12V|SDA|SCL|TX|RX|CLK)$/.test(t) && !seenNets.has(t) && nets.length < 24) {
      seenNets.add(t);
      nets.push(t);
    }
  }
  return { refs: refs.slice(0, 120), nets };
}

function buildProteusFromBinaryTokens(buf: Uint8Array, name: string, sourceLabel: string): {
  project: SchematicProject;
  report: GostConversionReport;
} {
  const parsed = parseProteusCdbComponents(buf);
  const customDefs: Record<string, ComponentDef> = {};
  const comps: PlacedComponent[] = parsed.refs.map((r, idx) => {
    const def = makeChipComponentDef(r.partName || 'IC', 4, r.refDes.replace(/\d+.*$/, '') || 'U', 'Proteus');
    return placeDefOnSheet({ def, customDefs, refDes: r.refDes, value: r.partName, x: 45 + (idx % 6) * 58, y: 45 + Math.floor(idx / 6) * 42 });
  });
  const netPorts: SchNetPort[] = parsed.nets.map((net, ni) => ({
    id: uid('prnp'), netName: net, style: /GND|VSS/i.test(net) ? 'Ground' : 'Power', x: 35 + (ni % 8) * 42, y: 255, angle: 0
  }));
  return convertImportedSchematicToGost(makeEcadSchematicProject({ name, components: comps, wires: [], customDefs, netPorts }), sourceLabel);
}

function parseProteusXmlSchematic(xmlText: string, name: string): {
  project: SchematicProject;
  report: GostConversionReport;
} {
  const customDefs: Record<string, ComponentDef> = {};
  const comps: PlacedComponent[] = [];
  const wires: SchWire[] = [];

  for (const m of xmlText.matchAll(/<(?:PART|COMPONENT|INSTANCE)\b([^>]+)>/gi)) {
    const attrs = m[1];
    const ref = (/ref(?:erence|des)?\s*=\s*"([^"]+)"/i.exec(attrs)?.[1]) || `U${comps.length + 1}`;
    const val = (/val(?:ue)?\s*=\s*"([^"]+)"/i.exec(attrs)?.[1]) || (/part\s*=\s*"([^"]+)"/i.exec(attrs)?.[1]) || 'Part';
    const x = parseFloat(/x\s*=\s*"([-\d.]+)"/i.exec(attrs)?.[1] || `${45 + (comps.length % 5) * 60}`);
    const y = parseFloat(/y\s*=\s*"([-\d.]+)"/i.exec(attrs)?.[1] || `${45 + Math.floor(comps.length / 5) * 45}`);
    const def = makeChipComponentDef(val, 4, ref.replace(/\d+.*$/, '') || 'U', 'Proteus XML');
    comps.push(placeDefOnSheet({ def, customDefs, refDes: ref, value: val, x: Math.abs(x) % 380, y: Math.abs(y) % 260 }));
  }

  for (const m of xmlText.matchAll(/<WIRE\b([^>]+)>/gi)) {
    const a = m[1];
    const x1 = parseFloat(/x1\s*=\s*"([-\d.]+)"/i.exec(a)?.[1] || '0');
    const y1 = parseFloat(/y1\s*=\s*"([-\d.]+)"/i.exec(a)?.[1] || '0');
    const x2 = parseFloat(/x2\s*=\s*"([-\d.]+)"/i.exec(a)?.[1] || '0');
    const y2 = parseFloat(/y2\s*=\s*"([-\d.]+)"/i.exec(a)?.[1] || '0');
    if (x1 !== x2 || y1 !== y2) {
      wires.push({ id: uid('prxw'), points: [{ x: Math.abs(x1) % 390, y: Math.abs(y1) % 270 }, { x: Math.abs(x2) % 390, y: Math.abs(y2) % 270 }], netName: '' });
    }
  }

  return convertImportedSchematicToGost(makeEcadSchematicProject({ name, components: comps, wires, customDefs }), 'Proteus XML');
}

/** Parses Labcenter Proteus .pdsprj (ZIP container) and .DSN / XML circuit files. */
export async function parseProteusInput(input: string | Uint8Array, name = 'Proteus_Project'): Promise<{
  project: SchematicProject;
  report: GostConversionReport;
}> {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('<')) return parseProteusXmlSchematic(trimmed, name);
    return buildProteusFromBinaryTokens(new TextEncoder().encode(input), name, 'Proteus (.DSN)');
  }

  if (isZipBuffer(input)) {
    const files = await extractZipEntries(input);
    const xmlEntry = Object.entries(files).find(([k]) => /\.(xml|sec|sdf)$/i.test(k));
    if (xmlEntry) {
      const xmlStr = new TextDecoder('utf-8', { fatal: false }).decode(xmlEntry[1]);
      if (/<(?:PART|COMPONENT|INSTANCE)/i.test(xmlStr)) return parseProteusXmlSchematic(xmlStr, name);
    }
    const cdbEntry = files['ROOT.CDB'] ?? Object.entries(files).find(([k]) => k.toUpperCase().endsWith('.CDB'))?.[1];
    const dsnEntry = files['ROOT.DSN'] ?? Object.entries(files).find(([k]) => k.toUpperCase().endsWith('.DSN'))?.[1];
    return buildProteusFromBinaryTokens(cdbEntry ?? dsnEntry ?? input, name, 'Proteus (.pdsprj)');
  }

  return buildProteusFromBinaryTokens(input, name, 'Proteus (.DSN)');
}
