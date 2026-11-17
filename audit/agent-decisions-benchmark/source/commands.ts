import { z } from 'zod';

const name = z.string().trim().min(1).max(120);
const note = z.string().max(4000);
const titleField = z.string().trim().max(120).optional();
const id = name.refine(value => /^[\p{L}\p{N}_.#-]+$/u.test(value), 'Недопустимый идентификатор');
const mm = z.number().min(-2000).max(2000);
const size = z.number().positive().max(1000);
const point = z.object({ x: mm, y: mm }).strict();
const angle = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
const format = z.enum(['A4_P', 'A4_L', 'A3_L', 'A2_L', 'A1_L', 'A0_L']);
const layer = z.enum(['TopCopper', 'Inner1', 'Inner2', 'BottomCopper']);
const n = z.number().int().min(0);
const terminal = z.object({ ref: id, pin: id }).strict();
const pin = z.object({
  num: id, name, type: z.enum(['Passive', 'Input', 'Output', 'Bidirectional', 'Power', 'OpenCollector', 'TriState', 'NotConnected']),
  side: z.enum(['left', 'right'])
}).strict();
const pad = z.object({
  number: id, x: mm, y: mm, width: size, height: size,
  type: z.enum(['SMD', 'THT']), shape: z.enum(['Rect', 'Round', 'Oval']),
  holeDiameter: size.optional()
}).strict();
const polygon = z.array(point).min(3).max(128);
const path = z.array(point).min(2).max(128);
export const commands = {
  remember: z.object({ plan: note }).strict(),
  set_targets: z.object({
    documents: z.enum(['schematic', 'pcb', 'both']),
    schematicNets: z.record(name, z.array(terminal).min(1)).optional(),
    boardNets: z.record(name, z.array(terminal).min(1)).optional(),
    schematicRefs: z.array(id).optional(),
    boardRefs: z.array(id).optional()
  }).strict(),
  search_library: z.object({ query: z.string().max(120), kind: z.enum(['component', 'pattern']), offset: n.optional() }).strict(),
  read_library: z.object({ id, kind: z.enum(['component', 'pattern']) }).strict(),
  create_schematic: z.object({ name, format: format.optional() }).strict(),
  add_sheet: z.object({ name, format: format.optional() }).strict(),
  set_frame: z.object({
    sheet: id, format: format.optional(), form: z.enum(['Form1', 'Form2', 'Form2a', 'None']).optional(),
    enabled: z.boolean().optional(), showZones: z.boolean().optional(), showCornerStamp26: z.boolean().optional(),
    designation: titleField, name: titleField, organization: titleField,
    developer: titleField, checker: titleField, normControl: titleField,
    scale: titleField, litera: titleField
  }).strict(),
  define_pattern: z.object({
    id, name, source: name, width: size, length: size, height: size, pads: z.array(pad).min(1).max(256)
  }).strict(),
  define_component: z.object({
    id, name, prefix: id, pattern: id.optional(), source: name, pins: z.array(pin).min(1).max(256)
  }).strict(),
  place_component: z.object({
    sheet: id, component: id, ref: id, x: mm, y: mm, angle: angle.optional(),
    value: name.optional(), pattern: id.optional(), part: n.optional()
  }).strict(),
  set_component_labels: z.object({
    sheet: id, ref: id, auto: z.boolean().optional(),
    refDesOffset: point.optional(), valueOffset: point.optional(), labelAngle: angle.optional(),
    showRefDes: z.boolean().optional(), showValue: z.boolean().optional()
  }).strict(),
  move_schematic: z.object({ sheet: id, ids: z.array(id).min(1).max(100), dx: mm, dy: mm }).strict(),
  delete_schematic: z.object({ sheet: id, ids: z.array(id).min(1).max(100), only: z.literal('graphics').optional() }).strict(),
  wire: z.object({
    sheet: id, from: terminal, to: terminal.optional(), points: z.array(point).max(128).optional(),
    net: name.optional(), port: z.enum(['Ground', 'Power', 'PortLeft', 'PortRight', 'OffPageIn', 'OffPageOut']).optional()
  }).strict(),
  add_sheet_text: z.object({ sheet: id, text: name, x: mm, y: mm, size }).strict(),
  mark_no_connect: z.object({ sheet: id, pin: terminal }).strict(),
  restore_verified: z.object({}).strict(),
  inspect: z.object({ sheet: id.optional() }).strict(),
  create_board: z.object({ name: name.optional(), width: size.optional(), height: size.optional(), layers: z.union([z.literal(2), z.literal(4)]).optional(), fromSchematic: z.boolean().optional() }).strict(),
  board_outline: z.object({ points: polygon }).strict(),
  place_footprint: z.object({ pattern: id, ref: id, x: mm, y: mm, nets: z.record(id, name).optional() }).strict(),
  move_footprint: z.object({ ref: id, x: mm, y: mm, angle: z.number().min(-360).max(360).optional(), side: z.enum(['Top', 'Bottom']).optional(), locked: z.boolean().optional() }).strict(),
  board_rules: z.object({
    clearance: size.optional(), traceWidth: size.optional(), thickness: size.optional()
  }).strict(),
  add_keepout: z.object({ layer: z.union([layer, z.literal('AllCopper')]), kind: z.enum(['RouteKeepout', 'PlaceKeepout', 'PourKeepout']), points: polygon }).strict(),
  add_cutout: z.object({ points: polygon }).strict(),
  add_copper_pour: z.object({ layer, net: name, outline: polygon, clearance: size }).strict(),
  refill_copper: z.object({}).strict(),
  bom: z.object({}).strict(),
  simulate: z.object({ mode: z.enum(['DC', 'Transient', 'AC']), stopTimeMs: size.optional() }).strict(),
  auto_place: z.object({}).strict(),
  auto_route: z.object({}).strict(),
  route_trace: z.object({ layer, net: name, width: size, points: path }).strict(),
  add_via: z.object({ x: mm, y: mm, net: name, diameter: size, hole: size, viaInPad: z.boolean().optional() }).strict(),
  delete_board: z.object({ ids: z.array(id).min(1).max(100) }).strict(),
  check: z.object({}).strict(),
  screenshot: z.object({ target: z.enum(['schematic', 'pcb']), sheet: id.optional() }).strict(),
  finish: z.object({ summary: note, limitations: note, status: z.enum(['complete', 'draft']).optional() }).strict()
};

export type CommandName = keyof typeof commands;
export const toolDefinitions = Object.entries(commands).map(([name, schema]) => ({
  type: 'function',
  function: { name, parameters: z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }) }
}));
