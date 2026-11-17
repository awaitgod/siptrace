import {
  ComponentDef,
  PadDef,
  PadShape,
  PatternDef,
  PatternGraphic,
  PinOrientation,
  SymbolPin,
  SymbolPrimitive
} from '../../../core/types';
import { uid } from '../../../core/geometry';
import { parseMiniXml, xmlFindAll, xmlFindFirst } from '../xmlMiniParser';
import { convertValueToGost, GostConversionItem, GostConversionReport, mapForeignPatternToGost, mapForeignPrefixToGost } from '../gostConverter';

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function mapXmlPadShape(raw: string): PadShape {
  const s = raw.toLowerCase();
  if (s.includes('roundrect') || s.includes('dshape')) return 'RoundedRect';
  if (s.includes('obround') || s.includes('oval')) return 'Oval';
  if (s.includes('ellipse') || s.includes('round') || s.includes('circle')) return 'Round';
  return 'Rect';
}

function mapXmlPinOrient(raw: string): PinOrientation {
  const deg = parseFloat(raw || '0') || 0;
  const norm = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  if (norm === 90) return 270;
  if (norm === 270) return 90;
  return norm as PinOrientation;
}

/** Parses DipTrace XML Libraries (.elixml components and .libxml patterns, v4/v5 mm or inch). */
export function parseDipTraceXmlLibrary(xml: string, filename = 'library.elixml', adaptToGost = true): {
  libraryName: string;
  components: ComponentDef[];
  patterns: PatternDef[];
  report: GostConversionReport;
} {
  const root = parseMiniXml(xml);
  const libNodes = xmlFindAll(root, 'Library');
  const primaryLib = libNodes[0] ?? root;
  const libName = primaryLib?.attrs.Name || filename.replace(/\.[^.]+$/, '') || 'DipTrace XML';
  const unitsMul = (primaryLib?.attrs.Units || '').toLowerCase().includes('inch') ? 25.4 : 1.0;

  // Build PadStyle lookup
  const padStyles = new Map<string, { type: 'SMD' | 'THT'; shape: PadShape; w: number; h: number; hole: number }>();
  for (const ps of xmlFindAll(root, 'PadStyle')) {
    const styleName = ps.attrs.Name || '';
    if (!styleName) continue;
    const isTht = (ps.attrs.Type || '').toLowerCase().includes('through');
    const hole = (parseFloat(ps.attrs.Hole || '0') || 0) * unitsMul;
    const main = xmlFindFirst(ps, 'MainStack');
    const w = (parseFloat(main?.attrs.Width || '1.4') || 1.4) * unitsMul;
    const h = (parseFloat(main?.attrs.Height || '1.4') || 1.4) * unitsMul;
    const shape = mapXmlPadShape(main?.attrs.Shape || 'Rectangle');
    padStyles.set(styleName, { type: isTht ? 'THT' : 'SMD', shape, w, h, hole });
  }

  const patterns: PatternDef[] = [];
  const patByName = new Map<string, PatternDef>();
  const items: GostConversionItem[] = [];

  for (const patNode of xmlFindAll(root, 'Pattern')) {
    const pName = xmlFindFirst(patNode, 'Name')?.text.trim() || patNode.attrs.Name || `Pattern_${patterns.length + 1}`;
    const defPadStyleName = xmlFindFirst(patNode, 'DefPad')?.attrs.Style || '';
    const defStyle = padStyles.get(defPadStyleName) ?? { type: 'SMD' as const, shape: 'Rect' as PadShape, w: 1.4, h: 1.2, hole: 0 };

    const pads: PadDef[] = [];
    for (const pd of xmlFindAll(patNode, 'Pad')) {
      const st = padStyles.get(pd.attrs.Style || '') ?? defStyle;
      const num = xmlFindFirst(pd, 'Number')?.text.trim() || pd.attrs.Id || String(pads.length + 1);
      const x = round3((parseFloat(pd.attrs.X || '0') || 0) * unitsMul);
      const y = round3((parseFloat(pd.attrs.Y || '0') || 0) * unitsMul);
      const ang = parseFloat(pd.attrs.Angle || '0') || 0;
      const isBot = (pd.attrs.Side || '').toLowerCase().includes('bot');
      pads.push({
        id: uid('xpd'),
        number: num,
        type: st.type,
        shape: st.shape,
        x,
        y,
        width: round3(Math.max(0.25, st.w)),
        height: round3(Math.max(0.25, st.h)),
        holeDiameter: st.type === 'THT' ? round3(Math.max(0.2, st.hole || 0.8)) : undefined,
        angle: ang ? ((Math.round(ang) % 360) + 360) % 360 : undefined,
        layer: st.type === 'THT' ? 'All' : (isBot ? 'Bottom' : 'Top')
      });
    }

    const graphics: PatternGraphic[] = [];
    for (const sh of xmlFindAll(patNode, 'Shape')) {
      const stype = (sh.attrs.Type || '').toLowerCase();
      const lay = (sh.attrs.Layer || '').toLowerCase().includes('bot') ? 'BottomSilk' : 'TopSilk';
      const pts = xmlFindAll(sh, 'Point').map((pt) => ({
        x: round3((parseFloat(pt.attrs.X || '0') || 0) * unitsMul),
        y: round3((parseFloat(pt.attrs.Y || '0') || 0) * unitsMul)
      }));
      if ((stype === 'line' || stype === 'polyline') && pts.length >= 2) {
        graphics.push({ type: 'polyline', layer: lay, points: pts, width: 0.15 });
      } else if ((stype === 'rect' || stype === 'rectangle') && pts.length >= 2) {
        graphics.push({
          type: 'rect',
          layer: lay,
          x: round3(Math.min(pts[0].x, pts[1].x)),
          y: round3(Math.min(pts[0].y, pts[1].y)),
          w: round3(Math.abs(pts[1].x - pts[0].x)),
          h: round3(Math.abs(pts[1].y - pts[0].y)),
          width: 0.15
        });
      }
    }

    const xs = pads.flatMap((p) => [p.x - p.width / 2, p.x + p.width / 2]);
    const ys = pads.flatMap((p) => [p.y - p.height / 2, p.y + p.height / 2]);
    const cw = xs.length ? round3(Math.max(2, Math.max(...xs) - Math.min(...xs) + 1.2)) : 8;
    const ch = ys.length ? round3(Math.max(2, Math.max(...ys) - Math.min(...ys) + 1.2)) : 6;
    if (graphics.length === 0) {
      graphics.push({ type: 'rect', layer: 'TopSilk', x: round3(-cw / 2), y: round3(-ch / 2), w: cw, h: ch, width: 0.15 });
    }

    const patId = `PAT_DTXML_${pName.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 30)}_${patterns.length + 1}`;
    const pat: PatternDef = {
      id: patId,
      name: pName,
      library: libName,
      gostName: 'ГОСТ / DipTrace XML',
      description: `Импортировано из DipTrace XML: ${pName}`,
      pads,
      graphics,
      courtyard: { width: cw, height: ch },
      model3d: {
        shape: pads.some((p) => p.type === 'THT') ? 'DIP' : pads.length <= 2 ? 'ChipSMD' : 'SOIC',
        bodyWidth: round3(cw * 0.75),
        bodyLength: round3(ch * 0.75),
        bodyHeight: 1.8,
        color: '#23252b',
        pinCount: pads.length
      }
    };
    patterns.push(pat);
    patByName.set(pName, pat);
    items.push({ originalRef: '-', gostRef: pName, originalValue: '-', gostValue: `${pads.length} падов`, originalPattern: pName, gostPattern: patId, action: `DipTrace XML корпус: ${pName}` });
  }

  const components: ComponentDef[] = [];
  for (const compNode of xmlFindAll(root, 'Component')) {
    const partNodes = xmlFindAll(compNode, 'Part');
    const firstPart = partNodes[0] ?? compNode;
    const name = xmlFindFirst(firstPart, 'Name')?.text.trim() || compNode.attrs.Name || firstPart.attrs.Name || `Comp_${components.length + 1}`;
    const rawRef = xmlFindFirst(firstPart, 'RefDes')?.text.trim() || firstPart.attrs.RefDes || 'U';
    const rawVal = xmlFindFirst(firstPart, 'Value')?.text.trim() || name;
    const patRef = xmlFindFirst(firstPart, 'Pattern')?.text.trim() || firstPart.attrs.Pattern || '';
    const pins: SymbolPin[] = xmlFindAll(firstPart, 'Pin').map((pn, idx) => {
      const pNum = xmlFindFirst(pn, 'Number')?.text.trim() || pn.attrs.Id || String(idx + 1);
      const pName = xmlFindFirst(pn, 'Name')?.text.trim() || pNum;
      const x = round3((parseFloat(pn.attrs.X || '0') || 0) * unitsMul);
      const y = round3((parseFloat(pn.attrs.Y || '0') || 0) * unitsMul);
      const len = Math.max(1.5, round3((parseFloat(pn.attrs.Length || '2.54') || 2.54) * unitsMul));
      return {
        id: `xp_${idx + 1}`,
        number: pNum,
        name: pName,
        x,
        y,
        length: len,
        orientation: mapXmlPinOrient(pn.attrs.Angle || '0'),
        electricalType: 'Passive',
        style: 'Line',
        showName: pName !== pNum,
        showNumber: true,
        padMapping: pNum
      };
    });
    const primitives: SymbolPrimitive[] = [];
    if (pins.length > 0) {
      const xs = pins.map((p) => p.x);
      const ys = pins.map((p) => p.y);
      const w = Math.max(10, Math.max(...xs) - Math.min(...xs) - 4);
      const h = Math.max(10, Math.max(...ys) - Math.min(...ys) + 4);
      primitives.push({ type: 'rect', x: round3(-w / 2), y: round3(-h / 2), w: round3(w), h: round3(h), width: 0.4 });
    }
    const gostPrefix = adaptToGost ? mapForeignPrefixToGost(rawRef, name) : rawRef;
    const gostVal = adaptToGost ? convertValueToGost(rawVal, gostPrefix) : rawVal;
    const patId = patByName.get(patRef)?.id || mapForeignPatternToGost(patRef, pins.length || 2, gostPrefix);
    components.push({
      id: `COMP_DTXML_${name.replace(/[^A-Za-z0-9]/g, '_').slice(0, 26)}_${components.length + 1}`,
      name,
      library: libName,
      refDesPrefix: gostPrefix,
      defaultValue: gostVal || name,
      gostStandard: 'DipTrace XML → ГОСТ 2.710-81',
      description: `Импортировано из DipTrace XML (${libName})`,
      manufacturer: 'DipTrace',
      patternId: patId,
      parts: [{ partIndex: 1, name: 'Секция 1', primitives, pins }]
    });
    items.push({ originalRef: rawRef, gostRef: gostPrefix, originalValue: rawVal, gostValue: gostVal || rawVal, originalPattern: patRef || '-', gostPattern: patId, action: `DipTrace XML компонент: ${name}` });
  }

  return {
    libraryName: libName,
    components,
    patterns,
    report: {
      sourceFormat: `DipTrace XML Library (${filename})`,
      convertedComponents: components.length,
      convertedSymbolsToUgo: components.length,
      convertedPatterns: patterns.length,
      items
    }
  };
}
