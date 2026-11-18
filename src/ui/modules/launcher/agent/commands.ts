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
const copperLayers = z.array(layer).min(1).max(4);
const n = z.number().int().min(0);
const terminal = z.object({ ref: id, pin: id }).strict();
const side = z.enum(['Top', 'Bottom']);
const rotation = z.number().min(-360).max(360);
const portStyle = z.enum(['Ground','Power','PortLeft','PortRight','OffPageIn','OffPageOut']);
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
const footprintPlacement = z.object({
  pattern: id, ref: id, x: mm, y: mm, nets: z.record(id, name).optional(),
  angle: rotation.optional(), side: side.optional(), locked: z.boolean().optional()
}).strict();
const routeScope = z.object({ net: name.optional(), layers: copperLayers.optional(), width: size.optional() }).strict();
const routeRequirement = z.object({
  minWidth: size.optional(), width: size.optional(), allowedLayers: copperLayers.optional(),
  requiredLayers: copperLayers.optional(), minVias: n.optional(),
  crossing: z.object({ axis: z.enum(['x','y']), at: mm, layer }).strict().optional()
}).strict();
export const commands = {
  remember: z.object({ plan: note }).strict(),
  set_targets: z.object({
    documents: z.enum(['schematic', 'pcb', 'both']),
    schematicNets: z.record(name, z.array(terminal).min(1)).optional(),
    boardNets: z.record(name, z.array(terminal).min(1)).optional(),
    schematicRefs: z.array(id).optional(),
    boardRefs: z.array(id).optional(),
    designation: name.optional(),
    sheets: z.array(z.object({
      name, format: format.optional(), form: z.enum(['Form1','Form2','Form2a','None']).optional(),
      refs: z.array(id).optional(),
      ports: z.array(z.object({ net: name, style: portStyle.optional() }).strict()).optional()
    }).strict()).optional(),
    values: z.record(id, name).optional(),
    board: z.object({
      width: size, height: size, layers: z.union([z.literal(2), z.literal(4)]),
      allowViaInPad: z.boolean().optional(),
      clearance: size.optional(),
      outline: polygon.optional(),
      cutouts: z.array(polygon).optional(),
      keepouts: z.array(z.object({
        layer: z.union([layer, z.literal('AllCopper')]), kind: z.enum(['RouteKeepout','PlaceKeepout','PourKeepout']), points: polygon
      }).strict()).optional(),
      pours: z.array(z.object({ net: name, layer, clearance: size.optional(), outline: polygon.optional() }).strict()).optional(),
      positions: z.array(z.object({
        ref: id, x: mm, y: mm, tolerance: z.number().min(0).max(10).optional(),
        angle: rotation.optional(), side: side.optional(), locked: z.boolean().optional()
      }).strict()).optional(),
      routes: z.record(name, routeRequirement).optional()
    }).strict().optional()
  }).strict(),
  configure_document: z.object({
    designation: name, title: name.optional(), organization: titleField, developer: titleField,
    sheets: z.array(z.object({ sheet: id, name, format: format.optional(), form: z.enum(['Form1','Form2','Form2a','None']).optional() }).strict()).min(1)
  }).strict(),
  compare_requirements: z.object({}).strict(),
  finalize_project: z.object({ detail: z.enum(['summary','full']).optional() }).strict(),
  query_library: z.object({
    query: z.string().max(120), kind: z.enum(['component','pattern']), pins: z.number().int().positive().optional(),
    pattern: z.string().max(120).optional(), limit: z.number().int().min(1).max(10).optional(),
    detail: z.enum(['summary','full']).optional()
  }).strict(),
  connect_net: z.object({
    sheet: id, net: name, terminals: z.array(terminal).min(1).max(64),
    port: portStyle.optional(), portPosition: point.optional()
  }).strict(),
  route_between_pads: z.object({
    from: terminal, to: terminal, net: name, layer, width: size, waypoints: z.array(point).max(128).optional()
  }).strict(),
  replace_component_pattern: z.object({ ref: id, pattern: id }).strict(),
  render_review: z.object({ target: z.enum(['schematic','pcb']), sheet: id.optional(), focusIds: z.array(id).min(1).max(30).optional() }).strict(),
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
    id, name, source: z.string().trim().min(1).max(4000), width: size, length: size, height: size, pads: z.array(pad).min(1).max(256)
  }).strict(),
  define_component: z.object({
    id, name, prefix: id, pattern: id.optional(), source: z.string().trim().min(1).max(4000), pins: z.array(pin).min(1).max(256)
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
  set_component_values: z.object({ values: z.record(id, name) }).strict(),
  rename_net: z.object({ from: name, to: name }).strict(),
  move_schematic: z.object({ sheet: id, ids: z.array(id).min(1).max(100), dx: mm, dy: mm }).strict(),
  delete_schematic: z.object({ sheet: id, ids: z.array(id).min(1).max(100), only: z.literal('graphics').optional() }).strict(),
  wire: z.object({
    sheet: id, from: terminal, to: terminal.optional(), points: z.array(point).max(128).optional(),
    net: name.optional(), port: portStyle.optional()
  }).strict(),
  add_sheet_text: z.object({ sheet: id, text: name, x: mm, y: mm, size }).strict(),
  mark_no_connect: z.object({ sheet: id, pin: terminal }).strict(),
  restore_verified: z.object({}).strict(),
  inspect: z.object({ sheet: id.optional(), pcbNet: name.optional(), detail: z.enum(['summary', 'full']).optional() }).strict(),
  create_board: z.object({
    name: name.optional(), width: size.optional(), height: size.optional(), outline: polygon.optional(),
    layers: z.union([z.literal(2), z.literal(4)]).optional(), fromSchematic: z.boolean().optional()
  }).strict(),
  sync_board_from_schematic: z.object({}).strict(),
  board_outline: z.object({ points: polygon }).strict(),
  place_footprint: footprintPlacement,
  place_footprints: z.object({ items: z.array(footprintPlacement).min(1).max(100) }).strict(),
  place_target_footprints: z.object({
    patterns: z.record(id, id), defaultPattern: id.optional()
  }).strict(),
  sync_target_pad_nets: z.object({}).strict(),
  move_footprint: z.object({ ref: id, x: mm, y: mm, angle: z.number().min(-360).max(360).optional(), side: z.enum(['Top', 'Bottom']).optional(), locked: z.boolean().optional() }).strict(),
  board_rules: z.object({
    clearance: size.optional(), traceWidth: size.optional(), thickness: size.optional()
  }).strict(),
  set_net_class: z.object({
    name, nets: z.array(name).min(1), width: size, minWidth: size.optional(), maxWidth: size.optional(),
    clearance: size.optional()
  }).strict(),
  add_keepout: z.object({ layer: z.union([layer, z.literal('AllCopper')]), kind: z.enum(['RouteKeepout', 'PlaceKeepout', 'PourKeepout']), points: polygon }).strict(),
  add_cutout: z.object({ points: polygon }).strict(),
  add_copper_pour: z.object({ layer, net: name, outline: polygon, clearance: size }).strict(),
  refill_copper: z.object({}).strict(),
  bom: z.object({}).strict(),
  simulate: z.object({ mode: z.enum(['DC', 'Transient', 'AC']), stopTimeMs: size.optional() }).strict(),
  auto_place: z.object({}).strict(),
  auto_route: routeScope,
  route_remaining: z.object({ limit: z.number().int().min(1).max(12).optional() }).strict(),
  route_net: routeScope.extend({
    net: name, pair: z.tuple([terminal, terminal]).optional(),
    replace: z.array(id).max(100).optional(), preview: z.boolean().optional()
  }).strict(),
  route_nets: z.object({
    nets: z.array(z.object({ net: name, replace: z.array(id).max(100).optional() }).strict()).min(2).max(12)
  }).strict(),
  commit_route: z.object({ previewId: id }).strict(),
  route_trace: z.object({ layer, net: name, width: size, points: path }).strict(),
  add_via: z.object({ x: mm, y: mm, net: name, diameter: size, hole: size, viaInPad: z.boolean().optional() }).strict(),
  delete_board: z.object({ ids: z.array(id).min(1).max(100) }).strict(),
  check: z.object({ detail: z.enum(['summary','full']).optional() }).strict(),
  screenshot: z.object({ target: z.enum(['schematic', 'pcb']), sheet: id.optional() }).strict(),
  finish: z.object({ summary: note, limitations: note, status: z.enum(['complete', 'draft']).optional() }).strict()
};

export type CommandName = keyof typeof commands;
const toolDescriptions: Partial<Record<CommandName, string>> = {
  inspect: 'Для обзора используй detail:summary. Для правки листа укажи sheet, для ремонта сети — pcbNet. Без фильтра и detail возвращается вся геометрия платы.',
  set_component_values: 'Меняет номиналы существующих позиций на схеме и связанной плате одним пакетом, сохраняя ID, выводы, провода и медь.',
  rename_net: 'Переименовывает одну существующую явно именованную цепь в свободное имя на схеме и плате, сохраняя геометрию, ID и межлистовые порты. Не объединяет цепи.',
  sync_board_from_schematic: 'Применяет изменения схемы к существующей плате. Сохраняет размещение и медь, ставит новые корпуса по заданным координатам и сообщает ID старой меди затронутых сетей. Применяй после изменения топологии схемы.',
  route_net: 'Разводит одну сеть. Для локальной переразводки передай ID старых незакреплённых дорожек/via этой сети в replace. Применяется атомарно. Используй preview, только если нужно сравнить варианты.',
  route_nets: 'Разводит несколько указанных сетей атомарно по контракту. Передай affectedNets из синхронизации/смены корпуса как {net, replace:[...traces,...vias]}. При отказе одной сети весь пакет отменяется.',
  check: 'Промежуточная диагностика текущей ревизии. detail:full возвращает все записи ERC/DRC, координаты и сравнения.',
  finalize_project: 'Одним вызовом проверяет текущую ревизию и отправляет PNG всех документов. Предварительные check и screenshot не требуются.',
  route_remaining: 'Разводит пакет открытых сетей по контракту. Возвращает число закрытых связей, оставшиеся пары и конфликты.',
  finish: 'Отчёт по просмотренным документам. Укажи результат и существенные ограничения, включая нерешённые пункты ТЗ.'
};
export const toolDefinitions = Object.entries(commands).map(([name, schema]) => ({
  type: 'function',
  function: { name, description: toolDescriptions[name as CommandName], parameters: z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }) }
}));
