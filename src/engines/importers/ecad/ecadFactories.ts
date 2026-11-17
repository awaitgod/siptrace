import {
  ComponentDef,
  Model3DRef,
  PadDef,
  PadShape,
  PatternDef,
  PatternGraphic,
  PatternLayer,
  PcbCopperPour,
  PcbLayerId,
  PcbPlacedComponent,
  PcbProject,
  PcbShape,
  PcbTrace,
  PcbVia,
  PinElectricalType,
  PinOrientation,
  PlacedComponent,
  Point2D,
  SchBus,
  SchJunction,
  SchNetPort,
  SchShape,
  SchWire,
  SchematicProject,
  SymbolPin,
  SymbolPrimitive
} from '../../../core/types';
import { uid } from '../../../core/geometry';
import { createImportedPcbProject, createImportedSchematicProject } from '../projectShells';

export function snapAngle90(deg: number): PinOrientation {
  return (((Math.round(deg / 90) * 90) % 360 + 360) % 360) as PinOrientation;
}

export function makeSymbolPin(opts: {
  number: string;
  name?: string;
  x: number;
  y: number;
  length?: number;
  orientation: PinOrientation;
  electricalType?: PinElectricalType;
  showName?: boolean;
  showNumber?: boolean;
}): SymbolPin {
  return {
    id: uid('pin'),
    number: opts.number,
    name: opts.name ?? opts.number,
    x: Math.round(opts.x * 1000) / 1000,
    y: Math.round(opts.y * 1000) / 1000,
    length: opts.length ?? 2.54,
    orientation: opts.orientation,
    electricalType: opts.electricalType ?? 'Passive',
    style: 'Line',
    showName: opts.showName ?? true,
    showNumber: opts.showNumber ?? true
  };
}

export function makeComponentDef(opts: {
  id?: string;
  name: string;
  library?: string;
  refDesPrefix?: string;
  defaultValue?: string;
  gostStandard?: string;
  description?: string;
  manufacturer?: string;
  patternId?: string;
  pins: SymbolPin[];
  primitives: SymbolPrimitive[];
  attributes?: Record<string, string>;
}): ComponentDef {
  return {
    id: opts.id ?? uid('cdef'),
    name: opts.name,
    library: opts.library ?? 'Импорт ECAD',
    refDesPrefix: opts.refDesPrefix ?? 'U',
    defaultValue: opts.defaultValue ?? opts.name,
    gostStandard: opts.gostStandard ?? 'ГОСТ 2.743-91',
    description: opts.description ?? opts.name,
    manufacturer: opts.manufacturer,
    patternId: opts.patternId ?? 'DIP-8',
    parts: [
      {
        partIndex: 0,
        name: 'Part 1',
        primitives: opts.primitives,
        pins: opts.pins
      }
    ],
    attributes: opts.attributes
  };
}

export function makeChipComponentDef(name: string, pinCount = 4, refPrefix = 'U', library = 'Импорт ECAD'): ComponentDef {
  const count = Math.max(2, Math.min(64, pinCount));
  const half = Math.ceil(count / 2);
  const hw = count <= 2 ? 4 : 6;
  const hh = Math.max(3.5, half * 1.4);
  const pins: SymbolPin[] = [];

  for (let i = 0; i < count; i++) {
    const left = i < half;
    const row = left ? i : i - half;
    const py = -((half - 1) * 2.54) / 2 + row * 2.54;
    pins.push(
      makeSymbolPin({
        number: `${i + 1}`,
        name: `${i + 1}`,
        x: left ? -(hw + 2.54) : hw + 2.54,
        y: Math.round(py * 100) / 100,
        length: 2.54,
        orientation: left ? 0 : 180,
        showName: count > 2,
        showNumber: true
      })
    );
  }

  return makeComponentDef({
    name,
    library,
    refDesPrefix: refPrefix,
    defaultValue: name,
    pins,
    primitives: [{ type: 'rect', x: -hw, y: -hh, w: hw * 2, h: hh * 2, width: 0.35 }]
  });
}

export function placeDefOnSheet(opts: {
  def: ComponentDef;
  customDefs: Record<string, ComponentDef>;
  refDes: string;
  value?: string;
  x: number;
  y: number;
  angle?: PinOrientation;
  flipX?: boolean;
  flipY?: boolean;
  showValue?: boolean;
}): PlacedComponent {
  opts.customDefs[opts.def.id] = opts.def;
  return {
    id: uid('comp'),
    componentDefId: opts.def.id,
    libraryId: opts.def.library || 'Импорт ECAD',
    refDes: opts.refDes,
    value: opts.value ?? opts.def.defaultValue,
    typeName: opts.def.name,
    partIndex: 0,
    x: Math.round(opts.x * 1000) / 1000,
    y: Math.round(opts.y * 1000) / 1000,
    angle: opts.angle ?? 0,
    flipX: Boolean(opts.flipX),
    flipY: Boolean(opts.flipY),
    patternId: opts.def.patternId || 'DIP-8',
    refDesOffset: { x: 0, y: -5 },
    valueOffset: { x: 0, y: 5 },
    showRefDes: true,
    showValue: opts.showValue ?? Boolean(opts.value)
  };
}

export function makeEcadSchematicProject(opts: {
  name: string;
  components: PlacedComponent[];
  wires: SchWire[];
  customDefs: Record<string, ComponentDef>;
  buses?: SchBus[];
  junctions?: SchJunction[];
  netPorts?: SchNetPort[];
  shapes?: SchShape[];
}): SchematicProject {
  const proj = createImportedSchematicProject({
    filePath: `${opts.name}.gostsch`,
    projectName: opts.name,
    titleName: opts.name,
    components: opts.components,
    wires: opts.wires,
    customDefs: opts.customDefs
  });
  const sheet = proj.sheets[0];
  if (opts.buses?.length) sheet.buses = opts.buses;
  if (opts.junctions?.length) sheet.junctions = opts.junctions;
  if (opts.netPorts?.length) sheet.netPorts = opts.netPorts;
  if (opts.shapes?.length) sheet.shapes = opts.shapes;
  return proj;
}

export function makePadDef(opts: {
  number: string;
  isTht?: boolean;
  shape?: PadShape;
  x: number;
  y: number;
  width: number;
  height: number;
  holeDiameter?: number;
  angle?: number;
  layer?: 'Top' | 'Bottom' | 'All';
}): PadDef {
  return {
    id: uid('pad'),
    number: opts.number,
    type: opts.isTht ? 'THT' : 'SMD',
    shape: opts.shape ?? 'Rect',
    x: Math.round(opts.x * 1000) / 1000,
    y: Math.round(opts.y * 1000) / 1000,
    width: Math.max(0.15, Math.round(opts.width * 1000) / 1000),
    height: Math.max(0.15, Math.round(opts.height * 1000) / 1000),
    holeDiameter: opts.isTht ? Math.max(0.2, opts.holeDiameter ?? 0.8) : 0,
    angle: opts.angle ?? 0,
    layer: opts.layer ?? (opts.isTht ? 'All' : 'Top')
  };
}

export function makePatternGraphicLine(
  layer: PatternLayer,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width = 0.15
): PatternGraphic {
  return { type: 'line', layer, x1, y1, x2, y2, width };
}

export function makePatternGraphicCircle(
  layer: PatternLayer,
  cx: number,
  cy: number,
  r: number,
  width = 0.15
): PatternGraphic {
  return { type: 'circle', layer, cx, cy, r, width };
}

export function makePcbShapeLine(layer: PcbLayerId, x1: number, y1: number, x2: number, y2: number, width = 0.15): PcbShape {
  return { id: uid('pshl'), layer, type: 'line', x1, y1, x2, y2, width };
}

export function makePcbShapeCircle(layer: PcbLayerId, cx: number, cy: number, r: number, width = 0.15): PcbShape {
  return { id: uid('pshc'), layer, type: 'circle', x1: cx, y1: cy, r, width };
}

export function makePcbShapeRect(layer: PcbLayerId, x1: number, y1: number, x2: number, y2: number, width = 0.15): PcbShape {
  return { id: uid('pshr'), layer, type: 'rect', x1, y1, x2, y2, w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), width };
}

export function makeDefaultModel3D(pkgName: string): Model3DRef {
  return {
    shape: /SOIC|SOP/i.test(pkgName) ? 'SOIC' : /QFP|LQFP/i.test(pkgName) ? 'QFP' : /QFN|LGA/i.test(pkgName) ? 'QFN' : /DIP/i.test(pkgName) ? 'DIP' : 'Box',
    bodyWidth: 4,
    bodyLength: 3,
    bodyHeight: 1.5,
    color: '#2d3748'
  };
}

export function makePcbPlacedComp(opts: {
  refDes: string;
  value?: string;
  typeName: string;
  side?: 'Top' | 'Bottom';
  x: number;
  y: number;
  angle?: number;
  pads: PadDef[];
  padNets?: Record<string, string>;
  graphics?: PatternGraphic[];
}): PcbPlacedComponent {
  return {
    id: uid('pcbc'),
    refDes: opts.refDes,
    value: opts.value ?? '',
    typeName: opts.typeName,
    patternId: opts.typeName || uid('pat'),
    side: opts.side ?? 'Top',
    x: Math.round(opts.x * 1000) / 1000,
    y: Math.round(opts.y * 1000) / 1000,
    angle: opts.angle ?? 0,
    showRefDes: true,
    showValue: Boolean(opts.value),
    refDesOffset: { x: 0, y: -2.5 },
    pads: opts.pads,
    padNets: opts.padNets ?? {},
    graphics: opts.graphics ?? [],
    courtyard: { width: 5, height: 4 },
    model3d: makeDefaultModel3D(opts.typeName)
  };
}

export function makePatternDef(opts: {
  name: string;
  library: string;
  description: string;
  pads: PadDef[];
  graphics?: PatternGraphic[];
}): PatternDef {
  return {
    id: uid('pat'),
    name: opts.name,
    library: opts.library,
    description: opts.description,
    pads: opts.pads,
    graphics: opts.graphics ?? [],
    courtyard: { width: 6, height: 5 },
    model3d: makeDefaultModel3D(opts.name)
  };
}

export function makeEcadPcbProject(opts: {
  name: string;
  components?: PcbPlacedComponent[];
  traces?: PcbTrace[];
  vias?: PcbVia[];
  shapes?: PcbShape[];
  copperPours?: PcbCopperPour[];
  boardOutline: Point2D[];
}): PcbProject {
  const pcb = createImportedPcbProject({
    filePath: `${opts.name}.gostpcb`,
    projectName: opts.name,
    components: opts.components ?? []
  });
  if (opts.traces) pcb.traces = opts.traces;
  if (opts.vias) pcb.vias = opts.vias;
  if (opts.shapes) pcb.shapes = opts.shapes;
  if (opts.copperPours) pcb.copperPours = opts.copperPours;
  pcb.boardOutline = opts.boardOutline;
  return pcb;
}
