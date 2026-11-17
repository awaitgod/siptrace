import { pointToSegmentDist, transformPoint } from '../../../core/geometry';
import { loadUserPatterns } from '../../../core/store';
import { PatternDef, PlacedComponent, Point2D, SchematicProject, SymbolPin, SymbolPrimitive } from '../../../core/types';
import { buildGostFrameAndStampGeometry, SHEET_FORMATS } from '../../../gost/gostTitleBlock';
import { findPatternById } from '../../../gost/libraries/gostPatterns';
import { extractSchematicNets, resolveComponentDef } from '../../erc';
import {
  padDefaults, pageDefaults, partDefaults, patternDefaults, pinDefaults,
  schematicDefaults, schematicFooter, settingsDefaults
} from './nativeSchematicDefaults';

// DipTrace stores schematic and pattern coordinates at three units per millimetre.
const coord = (mm: number) => {
  if (!Number.isFinite(mm)) throw new Error('Недопустимая координата в схеме');
  return Math.round(mm * 3e6) / 1e6;
};
const quote = (value: string) => '"' + value.replace(/[\u0000-\u001f]/g, ' ').replace(/"/g, '″') + '"';
const yes = (value: boolean) => value ? '"Y"' : '"N"';
const xy = ({ x, y }: Point2D) => `${coord(x)} ${coord(y)}`;
const pt = (point: Point2D) => `(pt ${xy(point)})`;

function block(header: string, children: string[] = []): string {
  const body = children.filter(Boolean).flatMap(child => child.split('\n')).map(line => '  ' + line);
  return ['(' + header, ...body, ')'].join('\n');
}

function fields(defaults: string, values: Record<string, string | number>): string {
  return defaults.replace(/^\(([A-Za-z0-9_]+) [^\n]*\)$/gm, (line, key: string) =>
    Object.hasOwn(values, key) ? `(${key} ${values[key]})` : line);
}

interface Drawing {
  points: Point2D[];
  width: number;
  text?: string;
  size?: number;
  angle?: number;
  align?: 'left' | 'center' | 'right';
  baseline?: 'top' | 'middle';
  maxWidth?: number;
}

function drawings(primitive: SymbolPrimitive, convert: (point: Point2D) => Point2D): Drawing[] {
  const width = 'width' in primitive ? primitive.width ?? 0.25 : 0.25;
  let points: Point2D[];
  switch (primitive.type) {
    case 'line':
      points = [{ x: primitive.x1, y: primitive.y1 }, { x: primitive.x2, y: primitive.y2 }];
      break;
    case 'polyline':
      points = primitive.closed && primitive.points.length ? [...primitive.points, primitive.points[0]] : primitive.points;
      break;
    case 'rect': {
      const { x, y, w, h } = primitive;
      points = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }];
      break;
    }
    case 'circle':
    case 'arc': {
      const start = primitive.type === 'circle' ? 0 : primitive.startAngle;
      const end = primitive.type === 'circle' ? 360 : primitive.endAngle;
      const sweep = end < start ? end - start + 360 : end - start;
      const count = Math.max(1, Math.ceil(sweep / 15));
      points = Array.from({ length: count + 1 }, (_, i) => {
        const angle = (start + sweep * i / count) * Math.PI / 180;
        return { x: primitive.cx + primitive.r * Math.cos(angle), y: primitive.cy + primitive.r * Math.sin(angle) };
      });
      break;
    }
    case 'text':
      return [{ points: [convert(primitive)], width, size: primitive.size, text: primitive.text, align: primitive.align }];
  }
  const converted = points.map(convert);
  return converted.slice(1).map((point, i) => ({ points: [converted[i], point], width }));
}

function shape(drawing: Drawing, index: number, page?: number): string {
  const isText = drawing.text !== undefined;
  const text = quote(drawing.text ?? '');
  const [p] = drawing.points;
  const caption = (drawing.text ?? '').split(/\r?\n/);
  const fontWidth = Math.max(1, ...caption.map(line => Array.from(line).length)) * 0.85;
  const size = Math.min(drawing.size ?? 2, (drawing.maxWidth ?? Infinity) / fontWidth);
  const horz = drawing.align === 'center' ? 0 : drawing.align === 'right' ? 1 : -1;
  const vert = drawing.baseline === 'middle' ? 0 : -1;
  const height = size * 1.5 * caption.length;
  const left = p.x - (horz + 1) * size * fontWidth / 2;
  const top = p.y - (vert + 1) * height / 2;
  const bounds = isText ? [{ x: left, y: top }, { x: left + size * fontWidth, y: top + height }] : drawing.points;
  return block(page === undefined ? `Shape ${index}` : 'Shape', [
    '(Enabled "Y")', '(Orientation 0)', `(Type ${isText ? 10 : 1})`,
    `(FontSize ${coord(size)})`, '(FontColor 0)', '(FontType 1)', '(FontName "Tahoma")',
    `(Name ${text})`, `(PenWidth ${coord(drawing.width)})`, block('Points', bounds.map(pt)),
    `(TextAngle ${drawing.angle ?? 0})`, `(TextHorz ${isText ? horz : -1})`, `(TextVert ${isText ? vert : -1})`,
    '(TextAlign -1)', '(LineSpacing 1.2)', '(Group -1)', '(ShowPart "N")', '(MarkingGenerated "N")',
    block('TextLine', caption.map(line => `(pt ${quote(line)})`)), block('Points_New', drawing.points.map(pt)),
    ...(page === undefined ? [] : [`(Page ${page})`, '(Selected "N")', '(Color 0)', '(BrushColor 16777215)',
      '(RelatedNet -1)', '(RelatedBus -1)', '(BitmapIndex 0)']),
    '(Locked "N")', '(VectorFont "N")', '(FontWidth -2)', '(FontScale 1)'
  ]);
}

const padShapes = { Round: 0, Oval: 1, Rect: 2, Polygon: 3, RoundedRect: 4 };
function patternRecord(pattern?: PatternDef): string {
  if (!pattern?.pads.length) return block('Pattern ""', [patternDefaults]);
  const pads = pattern.pads.map((pad, i) => {
    const index = i + 1;
    const code = padShapes[pad.shape];
    const hole = coord(pad.holeDiameter ?? 0);
    const values = fields(padDefaults, {
      Number: index, Number_New: index, PadWidth: coord(pad.width), PadHeight: coord(pad.height),
      PadWidth_New: coord(pad.width), PadHeight_New: coord(pad.height), SurfacePad: yes(pad.type === 'SMD'),
      PadHole: hole, PadHoleH: hole, PadShape: code, PadShape_New: code,
      PadAngle: pad.angle ?? 0, PadCorner: coord(pad.cornerRadius ?? 0), Standard: '"N"'
    }).replace('(Points\n)', () => block('Points', (pad.polygonPoints ?? []).map(pt)));
    return block(`Pad ${index} ${quote(pad.number)} ${quote(pad.number)} ${xy(pad)}`, [values]);
  });
  const outline = pattern.graphics.filter(graphic => graphic.layer === 'TopSilk' || graphic.layer === 'BottomSilk')
    .flatMap(graphic => drawings(graphic, point => point).filter(drawing => !drawing.text)
      .map(({ points, width }) => {
        const normalized = points.map(({ x, y }) => `(pt ${x / (pattern.courtyard.width || 1)} ${y / (pattern.courtyard.height || 1)})`);
        return block('Shape 1 "N" 0 0 0 0 0 0 0 "" "" "N" 0 0 0 0 0.381 0', [
          block('Points', normalized), `(Width ${coord(width)})`, `(Layer ${graphic.layer === 'TopSilk' ? 0 : 1})`,
          '(TextHorz 0)', '(TextVert 0)', '(TextAlign -1)', '(LineSpacing 1.2)', '(TextAngle 0)',
          block('Points_New', points.map(pt)), '(AllLayers "N")', '(Group -1)'
        ]);
      }));
  return block(`Pattern ${quote(pattern.name)}`, [fields(patternDefaults, {
    Width: coord(pattern.courtyard.width), Height: coord(pattern.courtyard.height),
    Name_Description: quote(pattern.description), Name_Unique: quote(pattern.name)
  }).replace('(Pads\n)', () => block('Pads', pads)).replace('(Shapes\n)', () => block('Shapes', outline))]);
}

const electricalTypes = { NotConnected: 0, Passive: 1, Input: 2, Output: 3, Bidirectional: 4, OpenCollector: 5, TriState: 9, Power: 10 };
const pinStyles = { Line: 0, Inverted: 1, Clock: 13, InvertedClock: 1, OpenCollector: 5, TriState: 8, Schmitt: 0, Bidirectional: 0 };

interface Terminal {
  part: number;
  pin: number;
  page: number;
  point: Point2D;
}

interface Path {
  page: number;
  points: Point2D[];
}

const epsilon = 0.001;
const near = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y) < epsilon;

function netLines(paths: Path[], terminals: Terminal[], net: number, nextRegion: () => number, nextBranch: () => number): string[] {
  const lines: Array<Path & { region: number }> = [];
  const branches = new Map<string, number>();
  const pending = paths.filter(path => path.points.length > 1);
  const terminalAt = (page: number, point: Point2D) =>
    terminals.find(t => t.page === page && near(t.point, point));
  const ends = ({ points }: Path) => [points[0], points[points.length - 1]];
  const terminalCount = (path: Path) => ends(path).filter(point => terminalAt(path.page, point)).length;
  const branchAt = (page: number, point: Point2D) => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.page !== page) continue;
      const segment = line.points.findIndex((end, j) => j > 0 && pointToSegmentDist(point, line.points[j - 1], end) < epsilon);
      if (segment > 0) return { line: i, segment, region: line.region };
    }
  };
  const result: string[] = [];
  while (pending.length) {
    const attached = pending.findIndex(path => ends(path).some(point => branchAt(path.page, point)));
    // Prefer a pin-to-pin trunk when starting a region, even if its tap was drawn first.
    const root = attached >= 0 ? attached : pending.reduce((best, path, i) =>
      terminalCount(path) > terminalCount(pending[best]) ? i : best, 0);
    const [path] = pending.splice(root, 1);
    const first = path.points[0];
    const last = path.points[path.points.length - 1];
    const parent = branchAt(path.page, first) ?? branchAt(path.page, last);
    const region = parent?.region ?? nextRegion();
    function end(point: Point2D) {
      const terminal = terminalAt(path.page, point);
      if (terminal) return { index: terminal.part, local: terminal.pin, branch: -1, mode: 0 };
      const tap = branchAt(path.page, point);
      if (!tap) return { index: -1, local: -1, branch: -1, mode: 0 };
      const key = `${tap.line}:${tap.segment}`;
      if (!branches.has(key)) branches.set(key, nextBranch());
      return { index: tap.line, local: tap.segment, branch: branches.get(key)!, mode: 1 };
    }
    const start = end(first);
    const finish = end(last);
    const axes = path.points.slice(1).map((point, i) => Math.abs(point.y - path.points[i].y) < epsilon ? 1 : 0);
    const points = path.points.map((point, i) => {
      const flag = i === 0 && axes[0] === 0 ? -1 : axes[i] ?? 1 - axes[axes.length - 1];
      return `(pt ${xy(point)} ${flag})`;
    });
    result.push(block('Line', [
      `(Connect1 ${start.index})`, `(Connect2 ${finish.index})`, `(ConnectL1 ${start.local})`, `(ConnectL2 ${finish.local})`,
      `(ConnectB1 ${start.branch})`, `(ConnectB2 ${finish.branch})`, `(Page ${path.page})`,
      `(ConnectMode1 ${start.mode})`, `(ConnectMode2 ${finish.mode})`, `(NetNumber ${net})`,
      `(Region ${region})`, `(Number ${lines.length})`, '(Hidden "N")', block('Points', points),
      '(Selected "N")', '(Group -1)', '(CanUnhide "N")', '(Arrows 0)'
    ]));
    lines.push({ ...path, region });
  }
  return result;
}

function portSymbol(style: string, label: string): { orientation: SymbolPin['orientation']; length: number; primitives: SymbolPrimitive[] } {
  const line = (x1: number, y1: number, x2: number, y2: number): SymbolPrimitive => ({ type: 'line', x1, y1, x2, y2 });
  if (style === 'Ground') return {
    orientation: 90, length: 3,
    primitives: [line(-2.6, 3, 2.6, 3), line(-1.6, 4.2, 1.6, 4.2), line(-0.7, 5.4, 0.7, 5.4),
      ...(label === 'GND' ? [] : [{ type: 'text' as const, x: 3.4, y: 3, text: label }])]
  };
  if (style === 'Power') return {
    orientation: 270, length: 3.5,
    primitives: [line(-2.4, -3.5, 2.4, -3.5), { type: 'text', x: -label.length * 0.6, y: -5, text: label }]
  };
  const dir = style === 'PortLeft' || style === 'OffPageIn' ? -1 : 1;
  return {
    orientation: dir < 0 ? 180 : 0, length: 2.5,
    primitives: [{ type: 'polyline', closed: true, points: [
      { x: 0, y: 0 }, { x: dir * 2.5, y: -1.5 }, { x: dir * 8.5, y: -1.5 },
      { x: dir * 8.5, y: 1.5 }, { x: dir * 2.5, y: 1.5 }
    ] }, { type: 'text', x: dir * 9.5 - (dir < 0 ? label.length * 1.2 : 0), y: 0, text: label }]
  };
}

/** Serializes the project as native DipTrace schematic ASCII v46. */
export function exportDipTraceAsciiSchematic(project: SchematicProject): string {
  const customComponentDefs = { ...project.customComponentDefs };
  // Give ports and hierarchy pins a physical terminal in the file and in the connectivity graph.
  const sheets = project.sheets.map(sheet => {
    const makePart = (id: string, name: string, geometry: Pick<typeof sheet.components[number], 'x' | 'y' | 'angle' | 'flipX' | 'flipY'>,
      pins: SymbolPin[], primitives: SymbolPrimitive[], isNetPort: boolean): PlacedComponent => {
      const componentDefId = 'asc:' + id;
      customComponentDefs[componentDefId] = {
        id: componentDefId, name, library: '', refDesPrefix: '#', defaultValue: name,
        gostStandard: '', description: '', patternId: '', isNetPort,
        parts: [{ partIndex: 0, name, pins, primitives }]
      };
      return {
        id, componentDefId, ...geometry, typeName: name, value: name, refDes: '#ASC' + Object.keys(customComponentDefs).length,
        libraryId: '', patternId: '', partIndex: 0, refDesOffset: { x: 0, y: 0 },
        valueOffset: { x: 0, y: 0 }, showValue: false, showRefDes: false
      };
    };
    const portParts = sheet.netPorts.map(port => {
      const symbol = portSymbol(port.style, port.label ?? port.netName);
      return makePart(port.id, port.netName, { ...port, flipX: false, flipY: false }, [{
        id: 'port', number: '1', name: port.netName, x: 0, y: 0, orientation: symbol.orientation, length: symbol.length,
        electricalType: port.electricalType ?? 'Passive', style: 'Line', showName: false, showNumber: false
      }], symbol.primitives, true);
    });
    const blocks = sheet.hierarchyBlocks.map(item => makePart(item.id, item.name, {
      ...item, angle: (item.angle ?? 0) as 0 | 90 | 180 | 270, flipX: !!item.flipX, flipY: !!item.flipY
    }, item.pins.map((pin, i) => ({
      id: pin.id, number: String(i + 1), name: pin.name, x: pin.side === 'right' ? item.w : 0, y: pin.offset,
      orientation: pin.side === 'right' ? 180 : 0, length: 1, electricalType: 'Passive',
      style: 'Line', showName: true, showNumber: false
    })), [{ type: 'rect', x: 0, y: 0, w: item.w, h: item.h },
      { type: 'text', x: 1, y: 2, text: item.name }], false));
    return { ...sheet, components: [...sheet.components, ...portParts, ...blocks] };
  });
  const nets = extractSchematicNets({ ...project, sheets, customComponentDefs })
    .filter(net => net.wireIds.length || net.pins.length > 1 || net.portNames.length);
  const pinKey = (id: string, number: string) => JSON.stringify([id, number]);
  const netByPin = new Map<string, number>();
  const netByWire = new Map<string, number>();
  nets.forEach((net, i) => {
    for (const pin of net.pins) {
      const key = pinKey(pin.compId, pin.pinNumber);
      if (netByPin.has(key) && netByPin.get(key) !== i) {
        throw new Error('DipTrace ASCII: не удалось однозначно подключить вывод ' + pin.refDes + ':' + pin.pinNumber);
      }
      netByPin.set(key, i);
    }
    for (const id of net.wireIds) {
      if (netByWire.has(id) && netByWire.get(id) !== i) {
        throw new Error('DipTrace ASCII: несколько экземпляров иерархического листа используют один провод');
      }
      netByWire.set(id, i);
    }
  });
  const terminals: Terminal[][] = nets.map(() => []);
  const paths: Path[][] = nets.map(() => []);
  const userPatterns = new Map(loadUserPatterns().map(pattern => [pattern.id, pattern]));
  const names = new Set<string>();
  function uniqueName(name: string) {
    let unique = name.trim().replace(/"/g, '″') || 'Net';
    for (let n = 2; names.has(unique.toLowerCase()); n++) unique = `${name}_${n}`;
    names.add(unique.toLowerCase());
    return unique;
  }

  const pages = sheets.map((sheet, page) => {
    const format = SHEET_FORMATS[sheet.format];
    return block('Page ' + quote(sheet.name), [fields(pageDefaults, {
      PageWidth: coord(format.widthMm), PageHeight: coord(format.heightMm), PageScale: 0.7,
      PageHiddenId: page
    })]);
  });
  let partIndex = 0;
  const components = sheets.flatMap((sheet, page) => {
    const format = SHEET_FORMATS[sheet.format];
    return sheet.components.map(component => {
      const index = partIndex++;
      const def = resolveComponentDef(component.componentDefId, customComponentDefs);
      const part = def?.parts.find(p => p.partIndex === component.partIndex) ?? def?.parts[0];
      if (!def || !part) throw new Error(`У компонента ${component.refDes} отсутствует УГО (${component.componentDefId})`);
      const orient = (point: Point2D) => transformPoint(point.x, point.y, 0, 0, component.angle, component.flipX, component.flipY);
      const origin = { x: component.x - format.widthMm / 2, y: component.y - format.heightMm / 2 };
      const pattern = userPatterns.get(component.patternId) ?? findPatternById(component.patternId, project.customPatternDefs);
      const pins = part.pins.map((pin, local) => {
        const net = netByPin.get(pinKey(component.id, pin.number)) ?? -1;
        const tip = orient(pin);
        const angle = pin.orientation * Math.PI / 180;
        const direction = orient({ x: Math.cos(angle), y: Math.sin(angle) });
        const nativeOrientation = (Math.round(Math.atan2(direction.y, direction.x) / (Math.PI / 2)) + 4) % 4;
        const body = { x: tip.x + direction.x * pin.length, y: tip.y + direction.y * pin.length };
        if (net >= 0) terminals[net].push({ part: index, pin: local, page, point: { x: origin.x + tip.x, y: origin.y + tip.y } });
        const pad = pattern?.pads.findIndex(p => p.number === (pin.padMapping || pin.number)) ?? -1;
        return block(`Pin ${local} ${xy(body)}`, [fields(pinDefaults, {
          Orientation: nativeOrientation, Type: pinStyles[pin.style], Number: pad < 0 ? -1 : pad + 1,
          NetNumber: net, Length: coord(pin.length), Name: quote(pin.name), StringNumber: quote(pin.number),
          ElectricType: electricalTypes[pin.electricalType], ShowName: yes(pin.showName), Hidden: yes(!!pin.isHiddenPower)
        })]);
      });
      const graphics = part.primitives.flatMap(primitive => drawings(primitive, orient));
      const bounds = graphics.flatMap(graphic => graphic.points);
      const extent = (axis: 'x' | 'y') => Math.max(1, ...bounds.map(p => p[axis])) - Math.min(-1, ...bounds.map(p => p[axis]));
      const name = component.typeName || def.name;
      const label = (visible: boolean, offset: Point2D) => `${visible ? 1 : 2} 0 ${xy(offset)} 0 0 0 0`;
      const defaults = fields(partDefaults, {
        Value: quote(component.value), BaseName: quote(def.name), BaseRefDes: quote(def.refDesPrefix),
        X: coord(origin.x), Y: coord(origin.y), Number: index, Page: page, PageHiddenId: page,
        Width: coord(extent('x')), Height: coord(extent('y')), HiddenId: 20000 + index,
        PartType: def.isNetPort ? 2 : 0, PartName: quote(part.name),
        AllowParts: yes(def.parts.length > 1), PartNumber: Math.max(0, def.parts.indexOf(part)),
        PartDescriptor: quote(String(component.partIndex)), Manufacturer: quote(component.manufacturer ?? def.manufacturer ?? ''),
        Component_CategoryName: quote(def.isNetPort ? 'Symbols' : ''), Component_CategoryIndex: def.isNetPort ? 0 : -1,
        ShowRefDes: label(component.showRefDes, component.refDesOffset),
        ShowValue: label(component.showValue, component.valueOffset),
        ShowNumbers: part.pins.some(pin => pin.showNumber) ? 0 : 2
      });
      return block(`Part ${quote(name)} ${quote(component.refDes)}`, [
        defaults, block('Pins', pins), block('Shapes', graphics.map((drawing, i) => shape(drawing, i))), patternRecord(pattern)
      ]);
    });
  });
  const shapes = sheets.flatMap((sheet, page) => {
    const format = SHEET_FORMATS[sheet.format];
    const center = (point: Point2D) => ({ x: point.x - format.widthMm / 2, y: point.y - format.heightMm / 2 });
    const frame = buildGostFrameAndStampGeometry(sheet.format, sheet.titleBlock);
    const graphics: Drawing[] = frame.lines.map(line => ({
      points: [center({ x: line.x1, y: line.y1 }), center({ x: line.x2, y: line.y2 })],
      width: line.thick ? 0.45 : 0.2
    }));
    for (const label of frame.texts) {
      if (!label.text) continue;
      graphics.push({
        points: [center(label)], width: 0.25, text: label.text, size: label.sizeMm, align: label.align,
        baseline: 'middle', angle: label.rotateDeg, maxWidth: label.maxWidthMm
      });
    }
    for (const wire of sheet.wires) {
      const net = netByWire.get(wire.id);
      if (net === undefined) continue;
      const points = wire.points.map(center).filter((point, i, all) => !i || !near(point, all[i - 1]));
      if (points.length < 2) continue;
      const localTerminals = terminals[net].filter(terminal => terminal.page === page);
      // Snap pin contacts to the same coordinates written in the Part record.
      const snapped = points.map(point => {
        const terminal = localTerminals.reduce<Terminal | undefined>((best, candidate) => {
          const distance = Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y);
          if (distance >= 0.25) return best;
          return !best || distance < Math.hypot(best.point.x - point.x, best.point.y - point.y) ? candidate : best;
        }, undefined);
        return terminal?.point ?? point;
      });
      const cuts = [...localTerminals.map(t => t.point), ...sheet.junctions.map(center)];
      let current = [snapped[0]];
      for (let i = 1; i < snapped.length; i++) {
        const a = snapped[i - 1];
        const b = snapped[i];
        const internal = cuts.filter(p => !near(p, a) && !near(p, b) && pointToSegmentDist(p, a, b) < epsilon)
          .sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y));
        for (const point of [...internal, b]) {
          if (near(point, current[current.length - 1])) continue;
          current.push(point);
          if (cuts.some(cut => near(cut, point))) {
            paths[net].push({ page, points: current });
            current = [point];
          }
        }
      }
      if (current.length > 1) paths[net].push({ page, points: current });
    }
    for (const item of sheet.shapes) {
      if (item.type === 'table') {
        const convert = ({ x, y }: Point2D) =>
          center(transformPoint(x, y, item.x, item.y, item.angle ?? 0, item.flipX, item.flipY));
        const columns = [0];
        for (const width of item.colWidths) columns.push(columns[columns.length - 1] + width);
        const tableWidth = columns[columns.length - 1];
        const tableHeight = item.rows.length * item.rowHeight;
        const grid = (a: Point2D, b: Point2D) => graphics.push({ points: [convert(a), convert(b)], width: 0.25 });
        for (const x of columns) grid({ x, y: 0 }, { x, y: tableHeight });
        for (let r = 0; r <= item.rows.length; r++) {
          const y = r * item.rowHeight;
          grid({ x: 0, y }, { x: tableWidth, y });
        }
        item.rows.forEach((row, r) => {
          item.colWidths.forEach((width, col) => {
            const text = row[col]?.replace(/[\r\n]+/g, ' ');
            if (!text || width <= 2) return;
            const centerCell = item.source === 'bom' && (col === 0 || col === 2);
            graphics.push({
              points: [convert({ x: columns[col] + (centerCell ? width / 2 : 1), y: (r + 0.5) * item.rowHeight })],
              width: 0.25, text, size: Math.min(2.5, item.rowHeight * 0.55), maxWidth: width - 2,
              angle: item.angle, align: centerCell ? 'center' : 'left', baseline: 'middle'
            });
          });
        });
      } else {
        const convert = (point: Point2D) => {
          const origin = item.type === 'line' ? { x: item.x1, y: item.y1 } : item.type === 'circle' ? { x: item.cx, y: item.cy } : item;
          return center(transformPoint(point.x - origin.x, point.y - origin.y, origin.x, origin.y, item.angle ?? 0, item.flipX, item.flipY));
        };
        graphics.push(...drawings(item, convert).map(drawing => ({ ...drawing, angle: item.angle })));
      }
    }
    for (const bus of sheet.buses) {
      graphics.push(...drawings({ type: 'polyline', points: bus.points, width: 0.7 }, center));
      if (bus.points.length) graphics.push(...drawings({ type: 'text', ...bus.points[0], text: bus.busName }, center));
    }
    return graphics.map((drawing, i) => shape(drawing, i, page));
  });
  let region = 0;
  let branch = 0;
  const netRecords = nets.map((net, i) => block(`Net ${quote(uniqueName(net.netName))}`, [
    '(Enabled "Y")', '(UniteByName "N")', '(ConnectPinByName "N")', '(Locked "N")',
    '(ActiveLine 0)', '(ActivePoint 0)', `(Number ${i})`, '(Width -1)', '(Clearance -1)',
    '(NetClass 0)', '(CustomColor "N")', '(WireColor 0)', '(Global "N")',
    block('Parts', terminals[i].map(t => `(pt ${t.part} ${t.pin})`)),
    block('Lines', netLines(paths[i], terminals[i], i, () => region++, () => branch++))
  ]));
  const content = block('Schematic', [
    block('Pages', pages), fields(schematicDefaults, { PartFontVector: '"N"' }), block('Components', components), block('PageConnectors'),
    block('Shapes', shapes), block('Nets', netRecords), block('Buses'), block('Groups'), block('Tables'),
    block('Settings', [fields(settingsDefaults, { GridSize: coord(project.gridSize), UnitsMM: '"Y"', UnitsINCH: '"N"' })]),
    schematicFooter
  ]);
  return ['(Source "DipTrace-Schematic" 46)', '(Units "mm")', '(Scale 70%)', '(Xpos 19)', '(Ypos 21)', content, ''].join('\n').replace(/\n/g, '\r\n');
}
