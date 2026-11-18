import { PcbLayerId, PinElectricalType, PinOrientation, SymbolPin, SymbolPrimitive } from '../../../core/types';
import { makeSymbolPin, snapAngle90 } from '../ecad/ecadFactories';
import { SExprList, sxFind, sxFindAll, sxNum, sxStr } from '../sexprParser';

/** Extracts KiCad S-expression pin electrical type into internal PinElectricalType. */
export function mapKicadPinElectrical(raw: string): PinElectricalType {
  switch (raw) {
    case 'input': return 'Input';
    case 'output':
    case 'tri_state':
    case 'open_collector':
    case 'open_emitter': return 'Output';
    case 'bidirectional': return 'Bidirectional';
    case 'power_in':
    case 'power_out': return 'Power';
    case 'no_connect': return 'NotConnected';
    default: return 'Passive';
  }
}

/** Parses KiCad symbol sub-nodes into SymbolPin[] and SymbolPrimitive[]. */
export function extractKicadSymbolGeometry(symNodes: SExprList[], scale = 1.0): {
  pins: SymbolPin[];
  primitives: SymbolPrimitive[];
} {
  const pins: SymbolPin[] = [];
  const primitives: SymbolPrimitive[] = [];

  const collectFromNode = (node: SExprList) => {
    for (const p of sxFindAll(node, 'pin')) {
      const etype = sxStr(p, 1);
      const at = sxFind(p, 'at');
      const px = sxNum(at, 1, 0) * scale;
      const py = -sxNum(at, 2, 0) * scale;
      const kicadRot = snapAngle90(sxNum(at, 3, 0));
      // KiCad: 0=Right(+X), 90=Up(-Y screen), 180=Left(-X), 270=Down(+Y screen)
      // SymbolPin.orientation: 0=right, 180=left, 90=down, 270=up
      const orientation: PinOrientation =
        kicadRot === 90 ? 270 : kicadRot === 270 ? 90 : kicadRot;
      const lenNode = sxFind(p, 'length');
      const len = Math.max(1.5, sxNum(lenNode, 1, 2.54) * scale * 0.7);
      const pinName = sxStr(sxFind(p, 'name'), 1) || '';
      const pinNum = sxStr(sxFind(p, 'number'), 1) || `${pins.length + 1}`;

      pins.push(makeSymbolPin({
        number: pinNum,
        name: pinName === '~' ? pinNum : pinName,
        x: px,
        y: py,
        length: len,
        orientation,
        electricalType: mapKicadPinElectrical(etype),
        showName: pinName !== '' && pinName !== '~',
        showNumber: true
      }));
    }

    for (const r of sxFindAll(node, 'rectangle')) {
      const s = sxFind(r, 'start');
      const e = sxFind(r, 'end');
      if (s && e) {
        const x1 = sxNum(s, 1) * scale, y1 = -sxNum(s, 2) * scale;
        const x2 = sxNum(e, 1) * scale, y2 = -sxNum(e, 2) * scale;
        primitives.push({ type: 'rect', x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(0.5, Math.abs(x2 - x1)), h: Math.max(0.5, Math.abs(y2 - y1)), width: 0.3 });
      }
    }

    for (const c of sxFindAll(node, 'circle')) {
      const center = sxFind(c, 'center');
      const radius = sxFind(c, 'radius');
      if (center && radius) {
        primitives.push({ type: 'circle', cx: sxNum(center, 1) * scale, cy: -sxNum(center, 2) * scale, r: Math.max(0.4, sxNum(radius, 1, 2) * scale), width: 0.3 });
      }
    }

    for (const poly of sxFindAll(node, 'polyline')) {
      const ptsNode = sxFind(poly, 'pts');
      if (!ptsNode) continue;
      const pts = sxFindAll(ptsNode, 'xy').map((xy) => ({ x: sxNum(xy, 1) * scale, y: -sxNum(xy, 2) * scale }));
      if (pts.length >= 2) primitives.push({ type: 'polyline', points: pts, width: 0.25 });
    }
  };

  for (const sn of symNodes) {
    collectFromNode(sn);
    for (const sub of sxFindAll(sn, 'symbol')) {
      const unitMatch = /_(\d+)_(\d+)$/.exec(sxStr(sub, 1));
      // Collect normal body style (0 or 1) across all units so multi-unit ICs keep all physical pins
      if (!unitMatch || unitMatch[2] === '0' || unitMatch[2] === '1') {
        collectFromNode(sub);
      }
    }
  }

  return { pins, primitives };
}

/** Maps a KiCad PCB layer name to DipTrace/GOST PcbLayerId. */
export function mapKicadLayer(layerName: string): PcbLayerId {
  const l = (layerName || '').trim();
  if (l === 'B.Cu' || l === 'Bottom') return 'BottomCopper';
  if (l === 'In1.Cu' || l === 'Inner1') return 'Inner1';
  if (l === 'In2.Cu' || l === 'Inner2') return 'Inner2';
  if (/^In\d+\.Cu$/i.test(l)) return 'Inner2';
  if (l === 'F.SilkS' || l === 'F.Silkscreen' || l === 'TopSilk') return 'TopSilk';
  if (l === 'B.SilkS' || l === 'B.Silkscreen' || l === 'BottomSilk') return 'BottomSilk';
  if (l === 'F.Mask' || l === 'TopMask') return 'TopMask';
  if (l === 'B.Mask' || l === 'BottomMask') return 'BottomMask';
  if (l === 'F.Paste' || l === 'TopPaste') return 'TopPaste';
  if (l === 'B.Paste' || l === 'BottomPaste') return 'BottomPaste';
  if (l === 'F.Fab' || l === 'TopAssembly') return 'TopAssembly';
  if (l === 'B.Fab' || l === 'BottomAssembly') return 'BottomAssembly';
  if (l === 'F.CrtYd' || l === 'B.CrtYd' || /Courtyard/i.test(l)) return 'Courtyard';
  if (l === 'Edge.Cuts' || l === 'Margin' || l === 'BoardOutline') return 'BoardOutline';
  if (/Keepout/i.test(l)) return 'Keepout';
  return 'TopCopper';
}
