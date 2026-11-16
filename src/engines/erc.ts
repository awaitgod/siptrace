import { ComponentDef, ErcError, PlacedComponent, Point2D, SchematicProject } from '../core/types';
import { dist, pointToSegmentDist, transformPoint } from '../core/geometry';
import { loadUserComponents } from '../core/store';
import { findComponentById } from '../gost/libraries/gostComponents';

function resolveComponentDef(
  compDefId: string,
  customDefs?: Record<string, ComponentDef>
): ComponentDef | undefined {
  return findComponentById(compDefId, customDefs) ?? loadUserComponents().find((c) => c.id === compDefId);
}

export interface PinWorld {
  compId: string;
  refDes: string;
  pinNumber: string;
  pinName: string;
  electricalType: string;
  x: number;
  y: number;
  isHiddenPower?: boolean;
}

export interface NetGraphNode {
  netName: string;
  pins: PinWorld[];
  wireIds: string[];
  portNames: string[];
}

export function getComponentWorldPins(
  comp: PlacedComponent,
  customDefs?: Record<string, ComponentDef>
): PinWorld[] {
  const def = resolveComponentDef(comp.componentDefId, customDefs);
  if (!def) return [];
  const part = def.parts.find((p) => p.partIndex === comp.partIndex) ?? def.parts[0];
  if (!part) return [];
  return part.pins.map((pin) => {
    const pt = transformPoint(pin.x, pin.y, comp.x, comp.y, comp.angle, comp.flipX, comp.flipY);
    return {
      compId: comp.id,
      refDes: comp.refDes,
      pinNumber: pin.number,
      pinName: pin.name,
      electricalType: pin.electricalType,
      x: Math.round(pt.x * 1000) / 1000,
      y: Math.round(pt.y * 1000) / 1000,
      isHiddenPower: pin.isHiddenPower
    };
  });
}

// Builds exact electrical connectivity graph across all sheets (including global netPorts, power symbols, buses, junctions)
export function extractSchematicNets(project: SchematicProject): NetGraphNode[] {
  const SNAP_EPS = 0.25; // mm tolerance for pin-to-wire or wire-to-wire vertex contact

  type Item =
    | { kind: 'pin'; pin: PinWorld; sheetId: string }
    | { kind: 'wire'; wireId: string; points: Point2D[]; netName: string; sheetId: string }
    | { kind: 'port'; x: number; y: number; netName: string; sheetId: string; isGlobal: boolean };

  const items: Item[] = [];

  for (const sheet of project.sheets) {
    for (const comp of sheet.components) {
      const def = resolveComponentDef(comp.componentDefId, project.customComponentDefs);
      const pins = getComponentWorldPins(comp, project.customComponentDefs);
      for (const pin of pins) {
        items.push({ kind: 'pin', pin, sheetId: sheet.id });
        if (def?.isNetPort && def.portNetName) {
          items.push({
            kind: 'port',
            x: pin.x,
            y: pin.y,
            netName: comp.value || def.portNetName,
            sheetId: sheet.id,
            isGlobal: true
          });
        }
      }
    }
    for (const wire of sheet.wires) {
      items.push({ kind: 'wire', wireId: wire.id, points: wire.points, netName: wire.netName, sheetId: sheet.id });
    }
    for (const port of sheet.netPorts) {
      items.push({
        kind: 'port',
        x: port.x,
        y: port.y,
        netName: port.netName,
        sheetId: sheet.id,
        isGlobal: port.style === 'Power' || port.style === 'Ground' || port.style === 'OffPageIn' || port.style === 'OffPageOut'
      });
    }
  }

  // Disjoint Set Union
  const parent = items.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // Connect items on the same sheet touching spatially
  const pointTouchesWire = (pt: Point2D, wirePts: Point2D[]): boolean => {
    if (wirePts.length < 2) return false;
    // Endpoints always connect
    if (dist(pt, wirePts[0]) < SNAP_EPS || dist(pt, wirePts[wirePts.length - 1]) < SNAP_EPS) return true;
    // A wire endpoint touching another wire forms a T connection. A crossing
    // of two segment interiors remains disconnected without a junction.
    for (let k = 1; k < wirePts.length; k++) {
      if (pointToSegmentDist(pt, wirePts[k - 1], wirePts[k]) < SNAP_EPS) {
        return true;
      }
    }
    return false;
  };

  for (const sheet of project.sheets) {
    const sheetIndices = items
      .map((item, idx) => ({ item, idx }))
      .filter((x) => x.item.sheetId === sheet.id);

    for (let i = 0; i < sheetIndices.length; i++) {
      const a = sheetIndices[i];
      for (let j = i + 1; j < sheetIndices.length; j++) {
        const b = sheetIndices[j];
        if (a.item.kind === 'pin' && b.item.kind === 'pin') {
          if (dist(a.item.pin, b.item.pin) < SNAP_EPS) union(a.idx, b.idx);
        } else if (a.item.kind === 'pin' && b.item.kind === 'wire') {
          if (pointTouchesWire(a.item.pin, b.item.points)) union(a.idx, b.idx);
        } else if (b.item.kind === 'pin' && a.item.kind === 'wire') {
          if (pointTouchesWire(b.item.pin, a.item.points)) union(a.idx, b.idx);
        } else if (a.item.kind === 'port' && b.item.kind === 'wire') {
          if (pointTouchesWire(a.item, b.item.points)) union(a.idx, b.idx);
        } else if (b.item.kind === 'port' && a.item.kind === 'wire') {
          if (pointTouchesWire(b.item, a.item.points)) union(a.idx, b.idx);
        } else if (a.item.kind === 'port' && b.item.kind === 'pin') {
          if (dist(a.item, b.item.pin) < SNAP_EPS) union(a.idx, b.idx);
        } else if (b.item.kind === 'port' && a.item.kind === 'pin') {
          if (dist(b.item, a.item.pin) < SNAP_EPS) union(a.idx, b.idx);
        } else if (a.item.kind === 'wire' && b.item.kind === 'wire') {
          const ptsA = a.item.points;
          const ptsB = b.item.points;
          let connected = false;
          if (ptsA.length >= 2 && ptsB.length >= 2) {
            if (
              pointTouchesWire(ptsA[0], ptsB) ||
              pointTouchesWire(ptsA[ptsA.length - 1], ptsB) ||
              pointTouchesWire(ptsB[0], ptsA) ||
              pointTouchesWire(ptsB[ptsB.length - 1], ptsA)
            ) {
              connected = true;
            } else {
              // Check explicit junctions on both wires
              for (const jn of sheet.junctions) {
                if (pointTouchesWire(jn, ptsA) && pointTouchesWire(jn, ptsB)) {
                  connected = true;
                  break;
                }
              }
            }
          }
          if (connected) union(a.idx, b.idx);
        }
      }
    }
  }

  // Connect global ports/named wires across sheets by matching explicit netName
  const byExplicitName = new Map<string, number[]>();
  items.forEach((item, idx) => {
    const name =
      item.kind === 'port'
        ? item.netName
        : item.kind === 'wire' && item.netName && !item.netName.startsWith('Net_')
          ? item.netName
          : '';
    if (name) {
      if (!byExplicitName.has(name)) byExplicitName.set(name, []);
      byExplicitName.get(name)!.push(idx);
    }
  });
  for (const idxs of byExplicitName.values()) {
    for (let k = 1; k < idxs.length; k++) union(idxs[0], idxs[k]);
  }

  // Group by root
  const groups = new Map<number, { pins: PinWorld[]; wireIds: string[]; portNames: string[]; explicitNames: string[] }>();
  items.forEach((item, idx) => {
    const r = find(idx);
    if (!groups.has(r)) groups.set(r, { pins: [], wireIds: [], portNames: [], explicitNames: [] });
    const g = groups.get(r)!;
    if (item.kind === 'pin') {
      g.pins.push(item.pin);
    } else if (item.kind === 'wire') {
      g.wireIds.push(item.wireId);
      if (item.netName && !item.netName.startsWith('Net_')) g.explicitNames.push(item.netName);
    } else if (item.kind === 'port') {
      g.portNames.push(item.netName);
      g.explicitNames.push(item.netName);
    }
  });

  let autoIdx = 1;
  const result: NetGraphNode[] = [];
  for (const g of groups.values()) {
    if (g.pins.length === 0 && g.wireIds.length === 0) continue;
    const chosenName =
      g.explicitNames.find((n) => n === 'GND') ??
      g.explicitNames[0] ??
      `Net_${autoIdx++}`;
    result.push({
      netName: chosenName,
      pins: g.pins,
      wireIds: g.wireIds,
      portNames: Array.from(new Set(g.portNames))
    });
  }

  return result;
}

export interface ErcSettings {
  checkUnconnectedPins: boolean;
  checkOutputConflicts: boolean;
  checkSinglePinNets: boolean;
  checkDuplicateRefDes: boolean;
  checkMissingPattern: boolean;
  checkFloatingInputs: boolean;
}

export const DEFAULT_ERC_SETTINGS: ErcSettings = {
  checkUnconnectedPins: true,
  checkOutputConflicts: true,
  checkSinglePinNets: true,
  checkDuplicateRefDes: true,
  checkMissingPattern: true,
  checkFloatingInputs: true
};

// Electrical Rule Check (ERC) for Schematic Capture
export function runSchematicErc(
  project: SchematicProject,
  settings: ErcSettings = DEFAULT_ERC_SETTINGS
): ErcError[] {
  const errors: ErcError[] = [];
  let errIdx = 1;

  // 1. Duplicate RefDes & missing pattern check
  const refCounts = new Map<string, { sheetId: string; comp: PlacedComponent }[]>();
  for (const sheet of project.sheets) {
    for (const comp of sheet.components) {
      if (comp.refDes && !comp.refDes.startsWith('#')) {
        if (!refCounts.has(comp.refDes)) refCounts.set(comp.refDes, []);
        refCounts.get(comp.refDes)!.push({ sheetId: sheet.id, comp });
      }
      if (settings.checkMissingPattern) {
        const def = resolveComponentDef(comp.componentDefId, project.customComponentDefs);
        if (def && !def.isNetPort && !comp.patternId) {
          errors.push({
            id: `erc_${errIdx++}`,
            severity: 'Warning',
            sheetId: sheet.id,
            x: comp.x,
            y: comp.y,
            code: 'ERC-PAT',
            message: `Компонент ${comp.refDes} (${comp.typeName}) не имеет привязанного посадочного места (корпуса).`,
            objectId: comp.id
          });
        }
      }
    }
  }

  if (settings.checkDuplicateRefDes) {
    for (const [ref, list] of refCounts) {
      if (list.length > 1) {
        for (const item of list) {
          errors.push({
            id: `erc_${errIdx++}`,
            severity: 'Error',
            sheetId: item.sheetId,
            x: item.comp.x,
            y: item.comp.y,
            code: 'ERC-DUP',
            message: `Дублирующееся позиционное обозначение «${ref}» (встречается ${list.length} раз).`,
            objectId: item.comp.id
          });
        }
      }
    }
  }

  // 2. Connectivity & Pin Matrix Rules
  const nets = extractSchematicNets(project);
  const pinToSheet = new Map<string, string>();
  for (const sheet of project.sheets) {
    for (const comp of sheet.components) {
      pinToSheet.set(comp.id, sheet.id);
    }
  }

  for (const net of nets) {
    // Check power/ground rail short circuit (e.g. +5V shorted to GND or +3V3)
    const distinctPowerNames = Array.from(
      new Set(
        net.portNames.filter((pn) => /^(GND|0|VCC|VDD|VSS|\+?\d[\d.,]*V?|\+3V3|\+5V|\+12V|\+24V|-?\d+V)$/i.test(pn.trim()))
      )
    );
    if (distinctPowerNames.length > 1) {
      const firstPin = net.pins[0];
      errors.push({
        id: `erc_${errIdx++}`,
        severity: 'Error',
        sheetId: firstPin ? (pinToSheet.get(firstPin.compId) ?? project.activeSheetId) : project.activeSheetId,
        x: firstPin?.x ?? 0,
        y: firstPin?.y ?? 0,
        code: 'ERC-PWR-SHORT',
        message: `Короткое замыкание цепей питания/земли: ${distinctPowerNames.join(' ↔ ')}.`,
        objectId: firstPin?.compId
      });
    }

    // Exclude #GND / #PWR port dummy components from pin count when checking single-pin nets
    const realPins = net.pins.filter((p) => !p.refDes.startsWith('#'));

    if (settings.checkSinglePinNets && realPins.length === 1 && net.wireIds.length > 0 && net.portNames.length === 0) {
      const p = realPins[0];
      errors.push({
        id: `erc_${errIdx++}`,
        severity: 'Warning',
        sheetId: pinToSheet.get(p.compId) ?? project.activeSheetId,
        x: p.x,
        y: p.y,
        code: 'ERC-1PIN',
        message: `Цепь «${net.netName}» подключена только к одному выводу (${p.refDes}.${p.pinNumber}).`,
        objectId: p.compId
      });
    }

    if (settings.checkOutputConflicts) {
      const outputs = realPins.filter((p) => p.electricalType === 'Output');
      if (outputs.length > 1) {
        const p = outputs[0];
        errors.push({
          id: `erc_${errIdx++}`,
          severity: 'Error',
          sheetId: pinToSheet.get(p.compId) ?? project.activeSheetId,
          x: p.x,
          y: p.y,
          code: 'ERC-OUT',
          message: `Конфликт выходов в цепи «${net.netName}»: соединены выходы ${outputs.map((o) => `${o.refDes}.${o.pinNumber}`).join(', ')}.`,
          objectId: p.compId
        });
      }
    }

    if (realPins.length === 1 && net.wireIds.length === 0 && net.portNames.length === 0) {
      const p = realPins[0];
      if (p.electricalType === 'Input' && settings.checkFloatingInputs) {
        errors.push({
          id: `erc_${errIdx++}`,
          severity: 'Warning',
          sheetId: pinToSheet.get(p.compId) ?? project.activeSheetId,
          x: p.x,
          y: p.y,
          code: 'ERC-FLOAT',
          message: `Неподключённый входной вывод ${p.refDes}.${p.pinNumber}${p.pinName ? ` (${p.pinName})` : ''}.`,
          objectId: p.compId
        });
      } else if (settings.checkUnconnectedPins && p.electricalType !== 'NotConnected') {
        errors.push({
          id: `erc_${errIdx++}`,
          severity: 'Warning',
          sheetId: pinToSheet.get(p.compId) ?? project.activeSheetId,
          x: p.x,
          y: p.y,
          code: 'ERC-UNCON',
          message: `Висячий неподключённый вывод ${p.refDes}.${p.pinNumber}.`,
          objectId: p.compId
        });
      }
    }
  }

  // Warn when multi-component schematic with ICs has neither GND nor VCC/power net
  const realComps = project.sheets.flatMap((s) => s.components.filter((c) => !c.refDes.startsWith('#')));
  const hasIc = realComps.some((c) => /^(DA|DD|U)\d+/i.test(c.refDes));
  const hasAnyPowerOrGnd = nets.some((n) => n.portNames.length > 0 || /^(GND|0|VCC|VDD|\+\d)/i.test(n.netName));
  if (realComps.length >= 2 && hasIc && !hasAnyPowerOrGnd) {
    errors.push({
      id: `erc_${errIdx++}`,
      severity: 'Warning',
      sheetId: project.activeSheetId,
      x: realComps[0].x,
      y: realComps[0].y,
      code: 'ERC-NO-PWR',
      message: 'На схеме с микросхемами не найдено портов питания (+5V/+3V3/VCC) и земли (GND).',
      objectId: realComps[0].id
    });
  }

  return errors;
}

// Автонумерация позиционных обозначений (слева направо, сверху вниз по листам)
export function renumberSchematicComponents(project: SchematicProject): SchematicProject {
  const next = structuredClone(project);
  const counters = new Map<string, number>();

  for (const sheet of next.sheets) {
    const sorted = [...sheet.components]
      .filter((c) => !c.refDes.startsWith('#'))
      .sort((a, b) => {
        const rowDiff = Math.round(a.y / 10) - Math.round(b.y / 10);
        if (rowDiff !== 0) return rowDiff;
        return a.x - b.x;
      });

    for (const comp of sorted) {
      const def = findComponentById(comp.componentDefId, next.customComponentDefs);
      const m = /^([A-Za-zА-Яа-я]+)/.exec(comp.refDes);
      const prefix = def?.refDesPrefix ?? (m ? m[1] : 'U');
      const idx = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, idx);
      comp.refDes = `${prefix}${idx}`;
    }
  }
  return next;
}
