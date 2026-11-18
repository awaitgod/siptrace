import { z } from 'zod';
import type { ColorSchemeId, ComponentDef, PatternDef, PcbProject, Point2D, SchNetPort, SchematicProject, SchematicSheet } from '../../../../core/models';
import {
  buildDefaultNewProjectOptions, createBlankPcbProject, createBlankSchematicProject,
  loadUserComponents, loadUserPatterns, type RecentProjectSnapshot
} from '../../../../core/store';
import { dist, uid, polygonBounds } from '../../../../core/geometry';
import { allIds, collections, commitWire, deleteEntities, entityBounds, labelId, transformEntities } from '../../../../core/schematic/editing';
import { ALL_GOST_COMPONENTS } from '../../../../gost/libraries/gostComponents';
import { ALL_GOST_PATTERNS } from '../../../../gost/libraries/gostPatterns';
import { makeGostRectangularIcPart } from '../../../../gost/libraries/components/helpers';
import { getGostFrameRect } from '../../../../gost/gostTitleBlock';
import { extractSchematicNets, getComponentWorldPins, runSchematicErc } from '../../../../engines/erc';
import { computeUnroutedRatlines, getWorldPads, pointToPadDistance, runPcbDrc } from '../../../../engines/drc';
import { comparePcbToSchematic } from '../../../../engines/netlist/pcbCompareAndAnnotate';
import { convertSchematicToPcb } from '../../../../engines/netlist/schematicToPcbConverter';
import { runAutoplacer } from '../../../../engines/autoplacer';
import { updateAllCopperPours } from '../../../../engines/copperPour';
import { generateGostBom } from '../../../../gost/bom/bomGenerator';
import { runBuiltInSpiceSimulation } from '../../../../engines/spice/mnaSimulator';
import { DEFAULT_AUTOROUTER_SETTINGS, runAutorouter, type AutorouteScope } from '../../../../engines/autorouter';
import { drawLauncherPreview } from '../drawLauncherPreview';
import { defaultComponentLabels, findLabelOverlaps } from '../../../../core/schematic/componentLabels';
import { commands, type CommandName } from './commands';
import { evaluateRequirements, extendTargets, missingTargetFields } from './requirements';
import { boundaryIssue, RouteConflict, validateNewCopper, validateTrace } from './pcbChecks';
import { checkSheetLayout, layoutIssue, portBounds, sheetWorkspace } from './schematicLayout';

type Targets = z.output<typeof commands.set_targets>;

function compareTargets(targets: Targets | undefined, documents: RecentProjectSnapshot, nets: { name: string; pins: string[]; wires: string[] }[]) {
  if (!targets) return ['Укажите обязательные документы, компоненты и сети через set_targets.'];
  const { schematic: sch, pcb } = documents;
  const issues: string[] = [];
  if (Boolean(sch) !== (targets.documents !== 'pcb')) issues.push(sch ? 'В комплекте лишняя схема.' : 'Отсутствует обязательная схема.');
  if (Boolean(pcb) !== (targets.documents !== 'schematic')) issues.push(pcb ? 'В комплекте лишняя плата.' : 'Отсутствует обязательная плата.');
  const boardNets = new Map<string, string[]>();
  for (const pad of pcb ? getWorldPads(pcb) : []) {
    if (pad.netName) boardNets.set(pad.netName, [...(boardNets.get(pad.netName) ?? []), pad.refDes + '.' + pad.pad.number]);
  }
  for (const { kind, required, groups, refs, present } of [
    { kind: 'Схема', required: targets.schematicNets, groups: nets, refs: targets.schematicRefs, present: sch?.sheets.flatMap(item => item.components.map(comp => comp.refDes)) ?? [] },
    { kind: 'Плата', required: targets.boardNets, groups: [...boardNets].map(([name, pins]) => ({ name, pins })), refs: targets.boardRefs, present: pcb?.components.map(item => item.refDes) ?? [] }
  ]) {
    for (const ref of refs ?? []) if (!present.includes(ref)) issues.push(kind + ': отсутствует ' + ref);
    if (refs) for (const ref of new Set(present)) if (!refs.includes(ref) && !ref.startsWith('#')) issues.push(kind + ': лишняя позиция ' + ref);
    if (required) for (const group of groups) {
      const singleOpenPin = kind === 'Схема' && group.pins.length === 1 && /^Net_\d+$/.test(group.name) &&
        'wires' in group && Array.isArray(group.wires) && group.wires.length === 0;
      if (!Object.hasOwn(required, group.name) && !singleOpenPin) issues.push(kind + ': лишняя цепь ' + group.name);
    }
    for (const [name, pins] of Object.entries(required ?? {})) {
      const expected = [...new Set(pins.map(pin => pin.ref + '.' + pin.pin))].sort().join(', ');
      const actual = groups.filter(group => group.name === name).map(group => [...new Set(group.pins)].sort().join(', '));
      if (actual.length !== 1 || actual[0] !== expected) {
        issues.push(kind + ': цепь ' + name + ' ожидает [' + expected + '], получено ' + (actual.map(group => '[' + group + ']').join(' / ') || 'нет цепи'));
      }
    }
  }
  return issues;
}

export interface AgentDraft {
  documents: RecentProjectSnapshot;
  plan: string;
  targets?: Targets;
  progress?: {
    phase: string;
    lastIssue?: string;
    recent: { name: string; ok: boolean; error?: string }[];
  };
  report?: { summary: string; limitations: string; verification?: string; status?: 'complete' | 'draft' };
  checks?: {
    erc: number; drc: number; outsideFrame: number; unrouted?: number; inSync?: boolean;
    errors?: number; warnings?: number; blockers?: string[];
    requirements?: ReturnType<typeof evaluateRequirements>; revision?: number
  };
}

export interface AgentCapture {
  id: string;
  label: string;
  url: string;
  revision?: number;
}

export function createAgentWorkspace(initial: AgentDraft, theme: ColorSchemeId) {
  const draft = structuredClone(initial);
  const captures = new Map<string, AgentCapture>();
  let checked = false;
  let blockers: string[] = [];
  let verified: RecentProjectSnapshot | undefined;
  let revision = 0;
  let targetsLocked = false;
  let lastPreview: { id: string; revision: number; pcb: PcbProject } | undefined;
  const detailCaptures = new Map<string, AgentCapture>();

  function resetTargets(targets: Targets) {
    draft.targets = targets;
    revision++;
    verified = undefined;
    checked = false;
    lastPreview = undefined;
    captures.clear();
    detailCaptures.clear();
    delete draft.report;
    delete draft.checks;
  }

  function setUserTargets(raw: unknown) {
    const targets = commands.set_targets.parse(raw);
    if (targets.board) targets.board.allowViaInPad ??= false;
    resetTargets(targets);
    targetsLocked = true;
  }

  function planRouting(pcb: PcbProject, options: AutorouteScope) {
    const bounds = polygonBounds(pcb.boardOutline);
    if ((bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY) > 65_000) {
      throw new Error('Для этого контура используйте ручную прокладку route_trace.');
    }
    if (options.net && !pcb.components.some(item => Object.values(item.padNets).includes(options.net!))) {
      throw new Error('Цепь отсутствует на плате.');
    }
    const required = options.net ? draft.targets?.board?.routes?.[options.net] : undefined;
    const layers = options.layers ?? required?.allowedLayers;
    const width = options.width ?? required?.width ?? required?.minWidth;
    if (layers?.some(layer => required?.allowedLayers && !required.allowedLayers.includes(layer))) {
      throw new Error('Запрошенный слой не разрешён контрактом этой цепи.');
    }
    if (width !== undefined && ((required?.width !== undefined && Math.abs(width - required.width) >= 0.001) ||
      (required?.minWidth !== undefined && width + 0.001 < required.minWidth))) {
      throw new Error('Ширина не соответствует контракту этой цепи.');
    }
    if (width !== undefined && (width < pcb.designRules.minTraceWidth || width > pcb.designRules.maxTraceWidth)) {
      throw new Error('Ширина дорожки вне допустимого диапазона правил платы.');
    }
    if (layers?.some(layer => !pcb.layers.some(item => item.id === layer && item.enabled))) {
      throw new Error('В списке есть отключённый слой.');
    }
    return runAutorouter(pcb, { ...DEFAULT_AUTOROUTER_SETTINGS, enableInnerLayers: pcb.layerCount === 4 },
      { ...options, layers, width, crossing: required?.crossing });
  }

  function targetPadNets(targets: Targets) {
    const netsByRef = new Map((targets.boardRefs ?? []).map(ref => [ref, Object.create(null) as Record<string, string>]));
    for (const [net, pins] of Object.entries(targets.boardNets ?? {})) {
      for (const { ref, pin } of pins) {
        const nets = netsByRef.get(ref);
        if (!nets) throw new Error('В контракте отсутствует позиция ' + ref + ' для цепи ' + net + '.');
        if (Object.hasOwn(nets, pin) && nets[pin] !== net) throw new Error('Несколько цепей на площадке ' + ref + '.' + pin + '.');
        nets[pin] = net;
      }
    }
    return netsByRef;
  }

  function schematic(): SchematicProject {
    if (!draft.documents.schematic) throw new Error('Сначала создайте или загрузите схему.');
    return draft.documents.schematic;
  }

  function board(): PcbProject {
    if (!draft.documents.pcb) throw new Error('Сначала создайте или загрузите плату.');
    return draft.documents.pcb;
  }

  function syncBoard(ref?: string) {
    const project = schematic();
    const previous = board();
    const converted = convertSchematicToPcb(project, previous);
    const byRef = new Map(previous.components.map(component => [component.refDes, component]));
    const required = project.sheets.flatMap(item => item.components).filter(item =>
      (!ref || item.refDes === ref) && !item.doNotMount && !item.refDes.startsWith('#'));
    const missing = required.filter(item => !converted.components.some(component => component.refDes === item.refDes));
    if (missing.length) throw new Error('Нет посадочного места: ' + missing.map(item => item.refDes).join(', '));

    const added: string[] = [];
    const changedNets = new Set<string>();
    const components = converted.components.filter(item => !ref || item.refDes === ref).map(next => {
      const old = byRef.get(next.refDes);
      if (!old) added.push(next.refDes);
      for (const pin of new Set([...Object.keys(old?.padNets ?? {}), ...Object.keys(next.padNets)])) {
        const from = old?.padNets[pin];
        const to = next.padNets[pin];
        if (from === to && old?.patternId === next.patternId) continue;
        if (from) changedNets.add(from);
        if (to) changedNets.add(to);
      }
      if (old?.patternId === next.patternId &&
          Object.keys(next.padNets).some(pin => !old.pads.some(pad => pad.number === pin))) {
        throw new Error('В существующем корпусе нет нужной площадки: ' + next.refDes);
      }
      if (old) return {
        ...(old.patternId === next.patternId ? old : { ...next, showRefDes: old.showRefDes, showValue: old.showValue }),
        value: next.value, typeName: next.typeName, padNets: next.padNets
      };
      const position = draft.targets?.board?.positions?.find(item => item.ref === next.refDes);
      if (position) {
        next.x = position.x;
        next.y = position.y;
        next.angle = position.angle ?? next.angle;
        next.side = position.side ?? next.side;
        next.locked = position.locked ?? next.locked;
      }
      return next;
    });
    const replacements = new Map(components.map(item => [item.refDes, item]));
    const boardRefs = draft.targets?.boardRefs;
    const removed = ref || !boardRefs ? [] : previous.components.filter(item =>
      !replacements.has(item.refDes) && !boardRefs.includes(item.refDes));
    const removedRefs = new Set(removed.map(item => item.refDes));
    for (const item of removed) for (const net of Object.values(item.padNets)) changedNets.add(net);
    const kept = previous.components.flatMap(old => {
      return removedRefs.has(old.refDes) ? [] : [replacements.get(old.refDes) ?? old];
    });
    draft.documents.pcb = {
      ...previous,
      components: [...kept, ...components.filter(item => !byRef.has(item.refDes))]
    };
    return {
      added, removed: removed.map(item => item.refDes),
      affectedNets: [...changedNets].map(net => ({
        net,
        traces: previous.traces.filter(item => item.netName === net).map(item => item.id),
        vias: previous.vias.filter(item => item.netName === net).map(item => item.id)
      }))
    };
  }

  function getProgress() {
    const { schematic, pcb } = draft.documents;
    const missing = missingTargetFields(draft.targets);
    const blocks = draft.checks?.blockers ?? [];
    const unrouted = pcb ? computeUnroutedRatlines(pcb).slice(0, 8) : [];
    let phase = 'requirements';
    if (draft.targets) {
      if (draft.targets.documents !== 'pcb' && !schematic) phase = 'create_schematic';
      else if (draft.targets.documents !== 'schematic' && !pcb) phase = schematic ? 'schematic' : 'create_board';
      else if (draft.targets.documents === 'pcb' && pcb && draft.targets.boardRefs?.some(ref =>
        !pcb.components.some(component => component.refDes === ref))) phase = 'placement';
      else if (unrouted.length) phase = 'routing';
      else if (!checked || blocks.length) phase = 'check';
      else phase = 'review';
    }
    return { phase, revision, missing, blockers: blocks.slice(0, 12), unrouted,
      documents: { schematic: schematic?.sheets.map(sheet => sheet.id) ?? [], pcb: Boolean(pcb) },
      checked: checked && draft.checks?.revision === revision };
  }

  function sheet(id: string): SchematicSheet {
    const found = schematic().sheets.find(item => item.id === id);
    if (!found) throw new Error('Лист не найден. Используйте inspect.');
    return found;
  }

  function resolvePin(current: SchematicSheet, terminal: { ref: string; pin: string }) {
    const { ref, pin } = terminal;
    const candidates = current.components.filter(item => item.refDes === ref)
      .flatMap(item => getComponentWorldPins(item, schematic().customComponentDefs)).filter(item => item.pinNumber === pin);
    if (candidates.length !== 1) throw new Error('Вывод не найден или неоднозначен: ' + ref + '.' + pin);
    return { x: candidates[0].x, y: candidates[0].y };
  }

  function replaceSheet(next: SchematicSheet) {
    const project = schematic();
    project.sheets = project.sheets.map(item => item.id === next.id ? next : item);
  }

  function library(kind: 'component'): ComponentDef[];
  function library(kind: 'pattern'): PatternDef[];
  function library(kind: 'component' | 'pattern'): (ComponentDef | PatternDef)[];
  function library(kind: 'component' | 'pattern') {
    const sch = draft.documents.schematic;
    return kind === 'component'
      ? [...new Map([...ALL_GOST_COMPONENTS, ...loadUserComponents(), ...Object.values(sch?.customComponentDefs ?? {})].map(item => [item.id, item])).values()]
      : [...new Map([...ALL_GOST_PATTERNS, ...loadUserPatterns(), ...Object.values(sch?.customPatternDefs ?? {})].map(item => [item.id, item])).values()];
  }

  function lookup(kind: 'component', id: string): ComponentDef;
  function lookup(kind: 'pattern', id: string): PatternDef;
  function lookup(kind: 'component' | 'pattern', id: string): ComponentDef | PatternDef;
  function lookup(kind: 'component' | 'pattern', id: string) {
    const found = library(kind).find(item => item.id === id);
    if (!found) throw new Error('Определение не найдено. Используйте search_library.');
    return found;
  }

  function renderCapture(target: 'schematic' | 'pcb', id: string | undefined, focus: { minX: number; minY: number; maxX: number; maxY: number } | undefined, key: string): AgentCapture {
      const frame = document.createElement('div');
      frame.style.cssText = 'position:fixed;left:-3000px;top:0;width:1600px;height:1100px;pointer-events:none';
      const canvas = document.createElement('canvas');
      frame.append(canvas);
      document.body.append(frame);
      try {
        drawLauncherPreview(canvas, frame, draft.documents, target === 'pcb', theme, id, focus);
        const compressed = document.createElement('canvas');
        compressed.width = 1600;
        compressed.height = 1100;
        const ctx = compressed.getContext('2d');
        if (!ctx) throw new Error('Canvas недоступен.');
        ctx.drawImage(canvas, 0, 0, compressed.width, compressed.height);
        const capture = { id: key, label: target === 'pcb' ? 'Печатная плата' : sheet(id ?? schematic().activeSheetId).name, url: compressed.toDataURL('image/png'), revision };
        return capture;
      } finally {
        frame.remove();
      }
  }

  const handlers: { [K in CommandName]: (args: z.output<(typeof commands)[K]>) => unknown } = {
    remember: ({ plan }) => {
      draft.plan = plan;
      return { plan };
    },
    set_targets: update => {
      const targets = draft.targets ? extendTargets(draft.targets, update, targetsLocked) : update;
      targetsLocked = true;
      if (JSON.stringify(draft.targets) === JSON.stringify(targets)) return { targets, unchanged: true, missing: missingTargetFields(targets) };
      resetTargets(targets);
      return { targets, missing: missingTargetFields(targets) };
    },
    configure_document: ({ designation, title, organization, developer, sheets }) => {
      const project = schematic();
      if (new Set(sheets.map(item => item.sheet)).size !== sheets.length) throw new Error('Повтор ID листа.');
      for (const item of sheets) sheet(item.sheet);
      const fullDesignation = /\sЭ3$/iu.test(designation) ? designation : designation + ' Э3';
      project.sheets = project.sheets.map((current, index) => {
        const options = sheets.find(item => item.sheet === current.id);
        return {
          ...current, name: options?.name ?? current.name, format: options?.format ?? current.format,
          titleBlock: {
            ...current.titleBlock, enabled: true, designation: fullDesignation,
            ...(title === undefined ? {} : { name: title }),
            ...(organization === undefined ? {} : { organization }),
            ...(developer === undefined ? {} : { developer }),
            form: options?.form ?? current.titleBlock.form,
            sheetNumber: index + 1, totalSheets: project.sheets.length
          }
        };
      });
      return project.sheets.map(item => ({ sheet: item.id, name: item.name, format: item.format, titleBlock: item.titleBlock }));
    },
    compare_requirements: () => handlers.check({}),
    finalize_project: ({ detail }) => {
      const { schematic, pcb } = draft.documents;
      if (draft.targets && ((!schematic && draft.targets.documents !== 'pcb') || (!pcb && draft.targets.documents !== 'schematic'))) {
        throw new Error('Сначала создайте обязательные документы. Для промежуточной проверки используйте check.');
      }
      const report = handlers.check({ detail });
      const images: AgentCapture[] = [];
      for (const item of draft.documents.schematic?.sheets ?? []) {
        images.push(handlers.screenshot({ target: 'schematic', sheet: item.id }) as AgentCapture);
      }
      if (draft.documents.pcb) images.push(handlers.screenshot({ target: 'pcb' }) as AgentCapture);
      const missing = missingTargetFields(draft.targets);
      return { report, captures: images, revision, missing,
        next: !blockers.length && !missing.length ? 'Если на PNG нет существенных дефектов, вызовите finish следующим ответом.' :
          'Исправьте перечисленные блокеры или сохраните draft через finish с конкретными ограничениями.' };
    },
    query_library: ({ query, kind, pins, pattern, limit = 5, detail = 'summary' }) => {
      const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const patterns = new Map(library('pattern').map(item => [item.id, item]));
      const normalize = (value: string) => value.toLocaleLowerCase().replace(/0805|2012м|2012m/g, '2012');
      const matches = library(kind).flatMap<unknown>(definition => {
        const footprint = 'parts' in definition ? patterns.get(definition.patternId) : definition;
        const text = normalize([definition.id, definition.name, definition.description, definition.library,
          footprint?.name, footprint?.ipcName, footprint?.id].join(' '));
        const pinCount = 'parts' in definition ? definition.parts.flatMap(part => part.pins).length : definition.pads.length;
        if (!words.every(word => text.includes(normalize(word))) || (pins !== undefined && pinCount !== pins) ||
          (pattern && !normalize([footprint?.id, footprint?.name, footprint?.ipcName].join(' ')).includes(normalize(pattern)))) return [];
        if (detail === 'full') return [{ definition, footprint }];
        const pads = footprint?.pads.map(({number, x, y, type}) => ({number, x, y, type}));
        return [{ id: definition.id, name: definition.name, library: definition.library, pattern: footprint?.id,
          pinCount, pins: 'parts' in definition ? definition.parts.flatMap(part =>
            part.pins.map(pin => ({ part: part.partIndex, number: pin.number, name: pin.name, type: pin.electricalType }))) : undefined, pads }];
      });
      return { total: matches.length, items: matches.slice(0, limit) };
    },
    connect_net: ({ sheet: id, net, terminals, port, portPosition }) => {
      const tag = (terminal: typeof terminals[number]) => terminal.ref + '.' + terminal.pin;
      if (new Set(terminals.map(tag)).size !== terminals.length) throw new Error('Повтор вывода сети.');
      if ((port && !portPosition) || (terminals.length === 1 && !port)) {
        throw new Error('Для одного вывода задайте порт, а для порта укажите portPosition.');
      }
      const current = sheet(id);
      const points = terminals.map(item => resolvePin(current, item));
      const prior = extractSchematicNets(schematic()).filter(group => group.netName === net);
      const allowed = new Set([...terminals.map(tag), ...prior.flatMap(group =>
        group.pins.map(pin => pin.refDes + '.' + pin.pinNumber))]);
      const strategies = [
        (a: Point2D, b: Point2D) => [{ x: b.x, y: a.y }],
        (a: Point2D, b: Point2D) => [{ x: a.x, y: b.y }],
        ...[5, 10, 15, 20].flatMap(offset => [
          (a: Point2D, b: Point2D) => [a, b].map(point => ({ x: point.x, y: Math.min(a.y, b.y) - offset })),
          (a: Point2D, b: Point2D) => [a, b].map(point => ({ x: point.x, y: Math.max(a.y, b.y) + offset })),
          (a: Point2D, b: Point2D) => [a, b].map(point => ({ x: Math.min(a.x, b.x) - offset, y: point.y })),
          (a: Point2D, b: Point2D) => [a, b].map(point => ({ x: Math.max(a.x, b.x) + offset, y: point.y }))
        ])
      ];
      let conflict = '';
      for (const path of strategies) {
        replaceSheet(current);
        try {
          for (let i = 1; i < terminals.length; i++) {
            let nearest = 0;
            for (let j = 1; j < i; j++) if (dist(points[j], points[i]) < dist(points[nearest], points[i])) nearest = j;
            const connected = extractSchematicNets(schematic()).some(group => group.netName === net &&
              [terminals[nearest], terminals[i]].every(terminal => group.pins.some(pin =>
                pin.refDes === terminal.ref && pin.pinNumber === terminal.pin)));
            if (!connected) handlers.wire({ sheet: id, from: terminals[nearest], to: terminals[i], net, points: path(points[nearest], points[i]) });
          }
          if (port && portPosition) handlers.wire({
            sheet: id, from: terminals[0], net, port, points: [...path(points[0], portPosition), portPosition]
          });
          const groups = extractSchematicNets(schematic()).filter(group => group.netName === net);
          const actual = groups.length === 1 ? groups[0].pins.map(pin => pin.refDes + '.' + pin.pinNumber) : [];
          const unexpected = actual.find(pin => !allowed.has(pin));
          const missing = terminals.map(tag).filter(pin => !actual.includes(pin));
          if (unexpected || missing.length) throw new Error(unexpected ? 'Затронут чужой вывод ' + unexpected : 'Отдельные выводы: ' + missing.join(', '));
          const previousWires = new Set(current.wires.map(item => item.id));
          const previousPorts = new Set(current.netPorts.map(item => item.id));
          const changed = sheet(id);
          const obstacle = checkSheetLayout({ ...changed, components: [], wires: changed.wires.filter(item => !previousWires.has(item.id)),
            netPorts: changed.netPorts.filter(item => !previousPorts.has(item.id)) }, schematic().customComponentDefs)
            .find(issue => changed.wires.some(wire => wire.id === issue.id) || changed.netPorts.some(port => port.id === issue.id));
          if (obstacle) throw new Error(obstacle.issue);
          return { net, pins: actual };
        } catch (error) {
          conflict ||= error instanceof Error ? error.message : String(error);
        }
      }
      replaceSheet(current);
      throw new Error(`Не найден маршрут сети ${net} (${terminals.map(tag).join(', ')}). ${conflict} Выберите обход через wire с points.`);
    },
    route_between_pads: ({ from, to, net, layer, width, waypoints = [] }) => {
      const pads = getWorldPads(board());
      const resolve = (terminal: typeof from) => {
        const pad = pads.find(item => item.refDes === terminal.ref && item.pad.number === terminal.pin);
        if (!pad || pad.netName !== net) throw new Error('Целевая площадка отсутствует или принадлежит другой цепи: ' + terminal.ref + '.' + terminal.pin);
        return { x: pad.x, y: pad.y };
      };
      return handlers.route_trace({ net, layer, width, points: [resolve(from), ...waypoints, resolve(to)] });
    },
    replace_component_pattern: ({ ref, pattern }) => {
      const project = schematic();
      const footprint = lookup('pattern', pattern);
      const placed = project.sheets.flatMap(item => item.components).filter(item => item.refDes === ref);
      if (!placed.length) throw new Error('Компонент схемы не найден.');
      for (const item of placed) {
        const definition = lookup('component', item.componentDefId);
        const numbers = definition.parts.flatMap(part => part.pins.map(pin => pin.padMapping ?? pin.number));
        if (numbers.some(number => !footprint.pads.some(pad => pad.number === number))) throw new Error('Новый корпус не покрывает выводы компонента.');
        item.patternId = footprint.id;
      }
      project.customPatternDefs = { ...project.customPatternDefs, [footprint.id]: footprint };
      const sync = draft.documents.pcb && syncBoard(ref);
      return { ref, pattern: footprint.id, ...sync };
    },
    render_review: ({ target, sheet: id, focusIds }) => {
      if (!focusIds?.length) return handlers.screenshot({ target, sheet: id });
      const cacheKey = JSON.stringify({ target, id, focusIds });
      const cached = detailCaptures.get(cacheKey);
      if (cached) return cached;
      let bounds;
      if (target === 'schematic') {
        const current = sheet(id ?? schematic().activeSheetId);
        if (focusIds.some(key => !allIds(current).includes(key))) throw new Error('Объект для крупного плана не найден.');
        const boxes = focusIds.map(key => entityBounds(current, key, schematic().customComponentDefs));
        bounds = { minX: Math.min(...boxes.map(b => b.minX)) - 12, maxX: Math.max(...boxes.map(b => b.maxX)) + 12,
          minY: Math.min(...boxes.map(b => b.minY)) - 12, maxY: Math.max(...boxes.map(b => b.maxY)) + 12 };
      } else {
        const components = board().components.filter(item => focusIds.includes(item.id) || focusIds.includes(item.refDes));
        if (!components.length) throw new Error('Компоненты крупного плана не найдены.');
        bounds = { minX: Math.min(...components.map(c => c.x - c.courtyard.width)) - 5,
          maxX: Math.max(...components.map(c => c.x + c.courtyard.width)) + 5,
          minY: Math.min(...components.map(c => c.y - c.courtyard.height)) - 5,
          maxY: Math.max(...components.map(c => c.y + c.courtyard.height)) + 5 };
      }
      const capture = renderCapture(target, id, bounds, 'detail:' + cacheKey);
      detailCaptures.set(cacheKey, capture);
      return capture;
    },
    search_library: ({ kind, query, offset = 0 }) => {
      const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const matches = library(kind).filter(item => {
        const fields = [item.id, item.name, item.library, 'defaultValue' in item ? item.defaultValue : item.ipcName].join(' ').toLocaleLowerCase();
        return words.every(word => fields.includes(word));
      });
      return { total: matches.length, offset,
        items: matches.slice(offset, offset + 25).map(item => ({
          id: item.id, name: item.name, library: item.library,
          ...('patternId' in item ? { pattern: item.patternId, prefix: item.refDesPrefix, value: item.defaultValue } : {})
        })) };
    },
    read_library: ({ id, kind }) => lookup(kind, id),
    create_schematic: ({ name, format }) => {
      if (draft.documents.schematic) throw new Error('В черновике уже есть схема.');
      const options = buildDefaultNewProjectOptions();
      const project = createBlankSchematicProject({
        ...options, projectName: name, titleName: name, sheetFormat: format ?? options.sheetFormat,
        developer: '', checker: '', normControl: '', organization: ''
      });
      Object.assign(project.sheets[0].titleBlock, { designation: '', approver: '', litera: '' });
      draft.documents.schematic = project;
      return { sheet: project.activeSheetId, format: project.sheets[0].format };
    },
    add_sheet: ({ name, format }) => {
      const project = schematic();
      if (project.sheets.length >= 24) throw new Error('Достигнут предел листов черновика.');
      const first = project.sheets[0];
      const next: SchematicSheet = {
        id: uid('sheet'), name, format: format ?? first.format,
        titleBlock: { ...first.titleBlock, form: 'Form2a' },
        components: [], wires: [], buses: [], busTaps: [], junctions: [], netPorts: [],
        diffPairs: [], hierarchyBlocks: [], shapes: []
      };
      project.sheets = [...project.sheets, next].map((item, index, sheets) => ({
        ...item, titleBlock: { ...item.titleBlock, sheetNumber: index + 1, totalSheets: sheets.length }
      }));
      return { sheet: next.id };
    },
    set_frame: ({ sheet: id, format, ...titleBlock }) => {
      const current = sheet(id);
      replaceSheet({ ...current, format: format ?? current.format, titleBlock: { ...current.titleBlock, ...titleBlock } });
      return { sheet: id, frame: getGostFrameRect(format ?? current.format) };
    },
    define_pattern: ({ id, name, source, width, length, height, pads }) => {
      const project = schematic();
      if (library('pattern').some(item => item.id === id)) throw new Error('Такой ID корпуса уже используется.');
      if (new Set(pads.map(item => item.number)).size !== pads.length ||
          pads.some(item => item.type === 'THT' && (!item.holeDiameter || item.holeDiameter >= Math.min(item.width, item.height)))) {
        throw new Error('Проверьте уникальность номеров площадок и диаметры отверстий.');
      }
      project.customPatternDefs = { ...project.customPatternDefs, [id]: {
        id, name, description: source, library: 'lib_user',
        pads: pads.map(item => ({ ...item, id: uid('pad'), layer: item.type === 'THT' ? 'All' : 'Top' })),
        graphics: [], courtyard: { width, height: length },
        model3d: { shape: 'Box', bodyWidth: width, bodyLength: length, bodyHeight: height, color: '#343941' }
      } };
      return { id };
    },
    define_component: ({ id, name, prefix, pattern, source, pins }) => {
      const project = schematic();
      if (library('component').some(item => item.id === id)) throw new Error('Такой ID компонента уже используется.');
      const footprint = pattern && lookup('pattern', pattern);
      if (new Set(pins.map(item => item.num)).size !== pins.length ||
          (footprint && pins.some(pin => !footprint.pads.some(pad => pad.number === pin.num)))) {
        throw new Error('Проверьте уникальность номеров выводов и соответствие площадкам.');
      }
      const part = makeGostRectangularIcPart({
        name, partIndex: 0,
        leftPins: pins.filter(item => item.side === 'left'),
        rightPins: pins.filter(item => item.side === 'right')
      });
      project.customComponentDefs = { ...project.customComponentDefs, [id]: {
        id, name, defaultValue: name, refDesPrefix: prefix, patternId: pattern ?? '',
        description: source, library: 'lib_user', gostStandard: '', parts: [part],
        attributes: { datasheet: source }
      } };
      return { id };
    },
    place_component: ({ sheet: id, component, ref, x, y, angle = 0, value, pattern, part }) => {
      const current = sheet(id);
      const project = schematic();
      const definition = lookup('component', component);
      const section = part === undefined ? definition.parts[0] : definition.parts.find(item => item.partIndex === part);
      if (!section) throw new Error('Секция компонента не найдена.');
      const existing = project.sheets.flatMap(item => item.components).filter(item => item.refDes === ref);
      const patternId = pattern ?? definition.patternId;
      if (existing.some(item => item.partIndex === section.partIndex || item.componentDefId !== component || item.patternId !== patternId)) {
        throw new Error('Позиционное обозначение занято.');
      }
      const footprint = patternId ? lookup('pattern', patternId) : undefined;
      const placed = {
        id: uid('comp'), componentDefId: definition.id, libraryId: definition.library, refDes: ref,
        instanceId: existing[0]?.instanceId ?? existing[0]?.id ?? uid('pkg'),
        value: value ?? existing[0]?.value ?? definition.defaultValue, typeName: definition.name,
        partIndex: section.partIndex, x, y, angle, flipX: false, flipY: false, patternId,
        refDesOffset: { x: 0, y: 0 }, valueOffset: { x: 0, y: 0 }, showRefDes: true, showValue: true
      };
      Object.assign(placed, defaultComponentLabels(placed, definition), {
        showRefDes: !definition.isNetPort, showValue: !definition.isNetPort
      });
      project.customComponentDefs = { ...project.customComponentDefs, [definition.id]: definition };
      if (footprint) project.customPatternDefs = { ...project.customPatternDefs, [footprint.id]: footprint };
      replaceSheet({ ...current, components: [...current.components, placed] });
      return { component: placed.id, pins: getComponentWorldPins(placed, project.customComponentDefs) };
    },
    set_component_labels: ({ sheet: id, ref, auto, ...labels }) => {
      const current = sheet(id);
      const components = current.components.filter(item => item.refDes === ref);
      if (!components.length) throw new Error('Компонент не найден: ' + ref);
      replaceSheet({ ...current, components: current.components.map(item => {
        if (item.refDes !== ref) return item;
        const defaults = auto ? defaultComponentLabels(item, lookup('component', item.componentDefId)) : {};
        return { ...item, ...defaults, ...labels };
      }) });
      return { components: components.map(item => item.id),
        labelIssues: findLabelOverlaps(sheet(id), schematic().customComponentDefs) };
    },
    set_component_values: ({ values }) => {
      const components = schematic().sheets.flatMap(item => item.components);
      const byRef = new Set(components.map(item => item.refDes));
      const entries = Object.entries(values);
      if (!entries.length || entries.some(([ref]) => ref.startsWith('#') || !byRef.has(ref))) {
        throw new Error('Укажите номиналы существующих физических позиций схемы.');
      }
      for (const part of [...components, ...(draft.documents.pcb?.components ?? [])]) {
        if (Object.hasOwn(values, part.refDes)) part.value = values[part.refDes];
      }
      return { values };
    },
    rename_net: ({ from, to }) => {
      const { schematic: project, pcb } = draft.documents;
      if (!project && !pcb) throw new Error('Сначала загрузите документ.');
      const copper = pcb ? [...pcb.traces, ...pcb.vias, ...pcb.copperPours] : [];
      const labels = project?.sheets.flatMap(item => [...item.wires, ...item.netPorts, ...item.junctions]) ?? [];
      const pads = pcb?.components.flatMap(item => Object.values(item.padNets)) ?? [];
      const before = project ? extractSchematicNets(project) : [];
      const pairs = [...(project?.sheets.flatMap(item => item.diffPairs) ?? []), ...(pcb?.diffPairs ?? [])];
      const taps = project?.sheets.flatMap(item => item.busTaps) ?? [];
      const assignments = [project?.netClassAssignments, pcb?.netClassAssignments];
      const names = [...labels, ...copper, ...before].map(item => item.netName).concat(pads,
        pairs.flatMap(item => [item.posNet, item.negNet]), taps.map(item => item.signalName),
        assignments.flatMap(item => Object.keys(item ?? {})));
      if (from === to) return { from, to, unchanged: true };
      if (!labels.some(item => item.netName === from) && !pads.includes(from) && !copper.some(item => item.netName === from)) {
        throw new Error('Именованная цепь не найдена: ' + from);
      }
      if (names.includes(to)) throw new Error('Имя уже занято: ' + to);
      for (const item of [...labels, ...copper]) if (item.netName === from) item.netName = to;
      for (const item of project?.sheets.flatMap(s => s.netPorts) ?? []) {
        if (item.netName === to && item.label === from) item.label = to;
      }
      for (const item of taps) if (item.signalName === from) item.signalName = to;
      for (const item of pairs) {
        if (item.posNet === from) item.posNet = to;
        if (item.negNet === from) item.negNet = to;
      }
      for (const item of pcb?.components ?? []) {
        item.padNets = Object.fromEntries(Object.entries(item.padNets).map(([pin, net]) => [pin, net === from ? to : net]));
      }
      for (const record of assignments) {
        if (!record || !Object.hasOwn(record, from)) continue;
        Object.defineProperty(record, to, { value: record[from], enumerable: true, writable: true, configurable: true });
        delete record[from];
      }
      if (project) {
        const signature = (groups: typeof before, renamed: boolean) => groups.map(group => JSON.stringify([
          renamed && group.netName === from ? to : group.netName,
          group.pins.map(pin => [pin.compId, pin.refDes, pin.pinNumber].join(':')).sort(),
          [...group.wireIds].sort()
        ])).sort();
        if (JSON.stringify(signature(before, true)) !== JSON.stringify(signature(extractSchematicNets(project), false))) {
          throw new Error('Переименование изменило связность или имя задаётся другим объектом (например, глобальным символом питания).');
        }
      }
      return { from, to, traces: copper.filter(item => item.netName === to).length };
    },
    move_schematic: ({ sheet: id, ids, dx, dy }) => {
      const current = sheet(id);
      replaceSheet(transformEntities(current, ids, { dx, dy }, schematic().customComponentDefs));
      return { sheet: id };
    },
    delete_schematic: ({ sheet: id, ids, only }) => {
      const current = sheet(id);
      const available = new Map(collections.flatMap(kind => current[kind].map(item => [item.id, kind] as const)));
      const labels = new Set(current.components.flatMap(item => [
        ...(item.showRefDes ? [labelId(item.id, 'refDes')] : []), ...(item.showValue ? [labelId(item.id, 'value')] : [])
      ]));
      const missing = ids.filter(key => !available.has(key) && !labels.has(key));
      if (missing.length) throw new Error('Объекты схемы не найдены: ' + missing.join(', '));
      if (only === 'graphics' && ids.some(key => available.get(key) !== 'shapes' && !labels.has(key))) {
        throw new Error('Режим only:graphics запрещает удаление компонентов и электрических объектов.');
      }
      replaceSheet(deleteEntities(current, ids));
      return { sheet: id, removed: [...new Set(ids)].map(key => ({ id: key, kind: available.get(key) ?? 'label' })) };
    },
    wire: ({ sheet: id, from, to, points = [], net, port }) => {
      const current = sheet(id);
      const start = resolvePin(current, from);
      if (port && (!net || to)) throw new Error('Порт требует имя цепи и свободный конец провода.');
      const end = to ? resolvePin(current, to) : points.pop();
      if (!end) throw new Error('Укажите вывод назначения или конечную координату.');
      const polyline = [start, ...points, end];
      const orthogonal = polyline.flatMap((point, index) => {
        const prev = polyline[index - 1];
        return prev && prev.x !== point.x && prev.y !== point.y ? [{ x: point.x, y: prev.y }, point] : [point];
      });
      const next = commitWire(current, orthogonal, false, net);
      const newWire = next.wires.find(wire => !current.wires.some(item => item.id === wire.id));
      if (!newWire) throw new Error('Провод нулевой длины или дубликат.');
      if (port && net) {
        const symbol: SchNetPort = { id: uid('port'), ...end, angle: 0, netName: net, style: port };
        const issue = layoutIssue(portBounds(symbol), sheetWorkspace(current));
        if (issue) throw new Error('Порт ' + net + ': ' + issue + '. Сместите конец провода внутрь рабочего поля.');
        next.netPorts = [...next.netPorts, symbol];
      }
      const namedWires = new Map(schematic().sheets.flatMap(item => item.wires.map(wire => [wire.id, wire.netName] as const)));
      namedWires.set(newWire.id, newWire.netName);
      const before = extractSchematicNets(schematic());
      const after = extractSchematicNets({ ...schematic(), sheets: schematic().sheets.map(item => item.id === id ? next : item) });
      const connected = after.find(group => group.wireIds.includes(newWire.id));
      if (connected) {
        const groups = before.filter(group => group.wireIds.some(id => connected.wireIds.includes(id)));
        const names = new Set([newWire.netName, ...groups.flatMap(group => group.wireIds.map(id => namedWires.get(id)))].filter(Boolean));
        if (names.size > 1) throw new Error('Маршрут объединяет провода разных цепей: ' + [...names].join(', ') + '. Выберите обход через points.');
      }
      replaceSheet(next);
      return { sheet: id, wires: next.wires.length };
    },
    add_sheet_text: ({ sheet: id, ...shape }) => {
      const current = sheet(id);
      const shapeId = uid('text');
      replaceSheet({ ...current, shapes: [...current.shapes, { ...shape, id: shapeId, type: 'text' }] });
      return { id: shapeId };
    },
    mark_no_connect: ({ sheet: id, pin }) => {
      const current = sheet(id);
      const { x, y } = resolvePin(current, pin);
      const existing = current.shapes.find(shape => shape.type === 'text' && shape.text === '× NC' && shape.x === x && shape.y === y);
      if (existing) return { id: existing.id, unchanged: true };
      const marker = uid('nc');
      replaceSheet({ ...current, shapes: [...current.shapes, { id: marker, type: 'text', x, y, text: '× NC', size: 2.5 }] });
      return { id: marker };
    },
    restore_verified: () => {
      if (!verified) throw new Error('В текущем запуске нет версии с пройденным check.');
      draft.documents = structuredClone(verified);
      return { restored: true };
    },
    inspect: ({ sheet: id, pcbNet, detail }) => {
      const project = draft.documents.schematic;
      const pcb = draft.documents.pcb;
      if (pcbNet !== undefined) {
        if (id) throw new Error('Выберите лист или сеть платы для инспекции.');
        const current = board();
        const pads = getWorldPads(current).filter(pad => pad.netName === pcbNet);
        if (!pads.length) throw new Error('На плате нет площадок сети ' + pcbNet);
        return { revision, net: pcbNet, requirements: draft.targets?.board?.routes?.[pcbNet],
          pads: pads.map(({ refDes, pad, x, y, effectiveLayer }) => ({ ref: refDes, pin: pad.number, x, y, layer: effectiveLayer })),
          traces: current.traces.filter(item => item.netName === pcbNet), vias: current.vias.filter(item => item.netName === pcbNet),
          remaining: computeUnroutedRatlines(current).filter(item => item.netName === pcbNet),
          outline: current.boardOutline, cutouts: current.cutouts, keepouts: current.keepouts };
      }
      const current = id ? sheet(id) : undefined;
      if (detail === 'summary' && !current) {
        return {
          revision, canRestoreVerified: Boolean(verified),
          sheets: project?.sheets.map(item => ({
            id: item.id, name: item.name, format: item.format,
            refs: item.components.map(part => part.refDes),
            ports: item.netPorts.map(({id, netName, style}) => ({id, netName, style}))
          })),
          pcb: pcb && {
            outline: pcb.boardOutline, layers: pcb.layerCount,
            components: pcb.components.map(({refDes, value, patternId, x, y, angle, side, locked}) => ({
              ref: refDes, value, pattern: patternId, x, y, angle, side, locked
            })),
            copper: { traces: pcb.traces.length, vias: pcb.vias.length, pours: pcb.copperPours.length },
            cutouts: pcb.cutouts.length, keepouts: pcb.keepouts.length
          }
        };
      }
      return {
        plan: draft.plan, targets: draft.targets, revision, currentChecks: draft.checks, canRestoreVerified: Boolean(verified),
        sheets: project?.sheets.map(item => ({ id: item.id, name: item.name, format: item.format, ...sheetWorkspace(item), components: item.components.length })),
        sheet: current && {
          ...current, components: current.components.map(item => ({ ...item, pins: getComponentWorldPins(item, project?.customComponentDefs) }))
        },
        pcb: pcb && {
          outline: pcb.boardOutline, origin: pcb.origin,
          pads: getWorldPads(pcb).map(({ refDes, pad, x, y, effectiveLayer, netName }) => ({ ref: refDes, number: pad.number, x, y, layer: effectiveLayer, net: netName, width: pad.width, height: pad.height })),
          rules: pcb.designRules, layers: pcb.layers.filter(item => item.enabled),
          components: pcb.components.map(({ id, refDes, value, x, y, angle, side, locked, patternId, padNets }) => ({ id, refDes, value, x, y, angle, side, locked, patternId, padNets })),
          traces: pcb.traces.map(({ id, netName, layer, width, points }) => ({ id, netName, layer, width, points })),
          vias: pcb.vias, cutouts: pcb.cutouts, keepouts: pcb.keepouts,
          pours: pcb.copperPours.map(({ id, layer, netName, poured, unpouredReason }) => ({ id, layer, netName, poured, unpouredReason }))
        }
      };
    },
    create_board: ({ name, width, height, layers, outline, fromSchematic = draft.targets?.documents !== 'pcb' }) => {
      const project = fromSchematic ? schematic() : undefined;
      const previous = draft.documents.pcb;
      if (previous && !fromSchematic) throw new Error('В черновике уже есть плата.');
      const options = buildDefaultNewProjectOptions();
      const template = previous ?? createBlankPcbProject({
        ...options, projectName: name ?? project?.projectName ?? 'Плата',
        boardWidthMm: width ?? draft.targets?.board?.width,
        boardHeightMm: height ?? draft.targets?.board?.height,
        boardLayers: layers ?? draft.targets?.board?.layers, boardCornerRadiusMm: 0
      });
      const next = project ? convertSchematicToPcb(project, template) : template;
      const missing = project?.sheets.flatMap(item => item.components).filter(item =>
        !item.doNotMount && !item.refDes.startsWith('#') && !next.components.some(component => component.refDes === item.refDes));
      if (missing?.length) throw new Error('Нет посадочного места: ' + missing.map(item => item.refDes).join(', '));
      const targetOutline = outline ?? (!previous ? draft.targets?.board?.outline : undefined);
      if (targetOutline) next.boardOutline = targetOutline;
      draft.documents.pcb = next;
      return { components: next.components.length, outline: next.boardOutline };
    },
    sync_board_from_schematic: () => syncBoard(),
    board_outline: ({ points }) => {
      board().boardOutline = points;
      return { points: points.length };
    },
    place_footprint: ({ pattern, ref, x, y, nets = {}, angle = 0, side = 'Top', locked = false }) => {
      const pcb = board();
      if (pcb.components.some(item => item.refDes === ref)) throw new Error('Позиционное обозначение занято.');
      const footprint = lookup('pattern', pattern);
      if (Object.keys(nets).some(number => !footprint.pads.some(item => item.number === number))) {
        throw new Error('Указана несуществующая площадка.');
      }
      const id = uid('pcbcomp');
      pcb.components.push({
        id, refDes: ref, value: footprint.name, typeName: footprint.name, patternId: pattern, x, y, angle, side, locked,
        showRefDes: true, showValue: false, refDesOffset: { x: 0, y: -footprint.courtyard.height / 2 - 1.5 },
        pads: structuredClone(footprint.pads), padNets: nets, graphics: structuredClone(footprint.graphics),
        courtyard: { ...footprint.courtyard }, model3d: { ...footprint.model3d }
      });
      return { id };
    },
    place_footprints: ({ items }) => items.map(item => handlers.place_footprint(item)),
    place_target_footprints: ({ patterns, defaultPattern }) => {
      const pcb = board();
      const { targets } = draft;
      if (targets?.documents !== 'pcb' || !targets.boardRefs || !targets.boardNets || !targets.board?.positions) {
        throw new Error('Нужен контракт самостоятельной платы с позициями, корпусами и цепями.');
      }
      const netsByRef = targetPadNets(targets);
      const positions = targets.board.positions;
      const added = targets.boardRefs.filter(ref => !pcb.components.some(item => item.refDes === ref)).map(ref => {
        const position = positions.find(item => item.ref === ref);
        const pattern = Object.hasOwn(patterns, ref) ? patterns[ref] : defaultPattern;
        if (!position || !pattern) throw new Error('Нужны позиция и корпус для ' + ref + '.');
        const { x, y, side, angle, locked } = position;
        return handlers.place_footprint({ ref, x, y, side, angle, locked, pattern, nets: netsByRef.get(ref) });
      });
      return { added: added.length };
    },
    sync_target_pad_nets: () => {
      const pcb = board();
      const { targets } = draft;
      if (targets?.documents !== 'pcb' || !targets.boardRefs || !targets.boardNets) {
        throw new Error('Нужен контракт самостоятельной платы с точным составом цепей.');
      }
      const byRef = targetPadNets(targets);
      const changes = [];
      const copperNets = new Set([...pcb.traces, ...pcb.vias, ...pcb.copperPours].map(item => item.netName));
      for (const part of pcb.components) {
        const expected = byRef.get(part.refDes);
        if (!expected) continue;
        const pads = new Set(part.pads.map(pad => pad.number));
        for (const pin of Object.keys(expected)) {
          if (!pads.has(pin)) throw new Error('Нет площадки ' + part.refDes + '.' + pin);
        }
        for (const pin of new Set([...Object.keys(part.padNets), ...Object.keys(expected)])) {
          const current = Object.hasOwn(part.padNets, pin) ? part.padNets[pin] : undefined;
          const next = expected[pin];
          if (current === next) continue;
          if ((current && copperNets.has(current)) || (next && copperNets.has(next))) {
            throw new Error('Нельзя менять ' + part.refDes + '.' + pin + ': сеть уже содержит медь.');
          }
          changes.push({ ref: part.refDes, pin, previous: current, net: next });
        }
        part.padNets = { ...expected };
      }
      return { changes };
    },
    move_footprint: ({ ref, ...coordinates }) => {
      const found = board().components.find(item => item.refDes === ref);
      if (!found) throw new Error('Компонент на плате не найден.');
      Object.assign(found, coordinates);
      return { id: found.id };
    },
    board_rules: ({ clearance, traceWidth, thickness }) => {
      const pcb = board();
      if (traceWidth !== undefined && traceWidth > pcb.designRules.maxTraceWidth) {
        throw new Error('Ширина превышает максимум правил платы.');
      }
      if (clearance !== undefined) {
        Object.assign(pcb.designRules, {
          clearanceTraceToTrace: clearance, clearanceTraceToPad: clearance,
          clearancePadToPad: clearance, clearanceViaToAny: clearance
        });
      }
      if (traceWidth !== undefined) {
        pcb.designRules.minTraceWidth = traceWidth;
        pcb.designRules.defaultTraceWidth = traceWidth;
      }
      if (thickness !== undefined) pcb.boardThickness = thickness;
      return pcb.designRules;
    },
    set_net_class: ({ name, nets, width, minWidth = width, maxWidth = width, clearance }) => {
      const pcb = board();
      if (width < minWidth || width > maxWidth || minWidth < pcb.designRules.minTraceWidth || maxWidth > pcb.designRules.maxTraceWidth) {
        throw new Error('Ширина класса выходит за пределы правил платы.');
      }
      if (nets.some(net => !pcb.components.some(part => Object.values(part.padNets).includes(net)))) {
        throw new Error('Класс можно назначить только существующим цепям платы.');
      }
      const id = pcb.netClasses.find(item => item.name === name)?.id ?? uid('netclass');
      const value = { id, name, traceWidth: width, minWidth, maxWidth,
        clearance: clearance ?? pcb.designRules.clearanceTraceToTrace,
        viaOuterDiameter: pcb.designRules.minViaOuter, viaHoleDiameter: pcb.designRules.minViaHole };
      pcb.netClasses = [...pcb.netClasses.filter(item => item.id !== id), value];
      for (const net of nets) pcb.netClassAssignments[net] = id;
      return value;
    },
    add_keepout: (zone) => {
      const id = uid('keepout');
      board().keepouts.push({ id, ...zone });
      return { id };
    },
    add_cutout: ({ points }) => {
      const id = uid('cutout');
      board().cutouts.push({ id, points });
      return { id };
    },
    add_copper_pour: ({ layer, net, outline, clearance }) => {
      const pcb = board();
      if (!pcb.layers.some(item => item.id === layer && item.enabled)) throw new Error('Слой отключён.');
      if (!pcb.components.some(item => Object.values(item.padNets).includes(net))) throw new Error('Цепь отсутствует в списке площадок.');
      if (boundaryIssue(outline, pcb.boardOutline, pcb.designRules.clearanceCopperToBoard)) {
        throw new Error('Полигон должен лежать внутри платы с зазором до фрезеруемого края ' + pcb.designRules.clearanceCopperToBoard + ' мм.');
      }
      const id = uid('pour');
      pcb.copperPours.push({
        id, layer, netName: net, outline, clearance, boardClearance: pcb.designRules.clearanceCopperToBoard,
        dependOnBoardOutline: false, fillType: 'Solid', lineWidth: pcb.designRules.defaultTraceWidth,
        lineSpacing: clearance, thermalType: '4Spoke', thermalSpokeWidth: pcb.designRules.defaultTraceWidth,
        thermalGap: clearance, removeIslands: true, priority: pcb.copperPours.length, poured: false
      });
      return { id };
    },
    refill_copper: () => {
      draft.documents.pcb = updateAllCopperPours(board());
      const conflicts = runPcbDrc(board()).filter(issue => issue.code === 'DRC-POUR-CLEARANCE');
      if (conflicts.length) throw new RouteConflict(conflicts);
      return board().copperPours.map(({ id, poured, unpouredReason }) => ({ id, poured, unpouredReason }));
    },
    bom: () => generateGostBom(schematic()),
    simulate: ({ mode, stopTimeMs }) => {
      const project = schematic();
      if (extractSchematicNets(project).length > 100) throw new Error('Встроенный симулятор агента ограничен 100 цепями.');
      const { converged, message, dcNodes, spiceNetlist, frequencies, acMagnitudeDb } = runBuiltInSpiceSimulation(project, mode, stopTimeMs);
      return { converged, message, dcNodes, spiceNetlist, ...(mode === 'AC' ? { frequencies, acMagnitudeDb } : {}),
        stimulusNote: 'MNA при отсутствии источника добавляет внутреннее тестовое возбуждение 5 В DC / 1 В AC. Экспортная сетка не содержит этот искусственный источник.' };
    },
    auto_place: () => {
      draft.documents.pcb = runAutoplacer(board());
      return { components: board().components.length };
    },
    auto_route: options => {
      const { pcb, report } = planRouting(board(), options);
      draft.documents.pcb = pcb;
      return report;
    },
    route_remaining: ({ limit = 12 }) => {
      let pcb = board();
      const requirements = draft.targets?.board?.routes ?? {};
      const unrouted = computeUnroutedRatlines(pcb);
      const nets = [...new Set(unrouted.map(item => item.netName))].sort((a, b) =>
        Number(Object.hasOwn(requirements, b)) - Number(Object.hasOwn(requirements, a)));
      const results = nets.slice(0, limit).map(net => {
        const before = computeUnroutedRatlines(pcb).filter(item => item.netName === net).length;
        try {
          const { pcb: candidate, report } = planRouting(pcb, { net });
          const remaining = computeUnroutedRatlines(candidate).filter(item => item.netName === net).length;
          if (remaining >= before) return { net, before, remaining: before, conflicts: report.conflicts?.slice(0, 3) };
          pcb = candidate;
          return { net, before, remaining, traces: report.addedTraces, vias: report.addedVias };
        } catch (error) {
          if (!(error instanceof Error)) throw error;
          return { net, before, remaining: before, error: error.message };
        }
      });
      draft.documents.pcb = pcb;
      const remaining = computeUnroutedRatlines(pcb);
      return { results, closed: unrouted.length - remaining.length, remaining: remaining.length, nextPairs: remaining.slice(0, 8) };
    },
    route_net: ({ net, layers, width, pair, replace = [], preview }) => {
      const pcb = board();
      const label = (terminal: {ref: string; pin: string}) => terminal.ref + '.' + terminal.pin;
      const originalUnrouted = computeUnroutedRatlines(pcb).filter(rat => rat.netName === net).length;
      const removable = [...pcb.traces, ...pcb.vias].filter(item => item.netName === net && !item.locked);
      if (replace.some(id => !removable.some(item => item.id === id))) throw new Error('Заменять можно только незакреплённые дорожки и via этой цепи.');
      const source = replace.length ? {
        ...pcb, traces: pcb.traces.filter(item => !replace.includes(item.id)),
        vias: pcb.vias.filter(item => !replace.includes(item.id))
      } : pcb;
      const { pcb: result, report } = planRouting(source, { net, layers, width, pair: pair && [label(pair[0]), label(pair[1])] });
      const remaining = computeUnroutedRatlines(result).filter(rat => rat.netName === net);
      if (!report.addedTraces || (replace.length && (report.failedConnections || remaining.length > originalUnrouted))) {
        return { ...report, applied: false, remaining, next: 'Измените ограничения, выберите конкретную пару или задайте маршрут вручную.' };
      }
      if (preview) {
        const id = uid('route');
        lastPreview = { id, revision, pcb: result };
        return { ...report, applied: false, previewId: id, remaining,
          traces: result.traces.filter(trace => !source.traces.some(item => item.id === trace.id)),
          vias: result.vias.filter(via => !source.vias.some(item => item.id === via.id)) };
      }
      draft.documents.pcb = result;
      const oldTraces = new Set(source.traces.map(item => item.id));
      const added = result.traces.filter(item => !oldTraces.has(item.id));
      return { ...report, applied: true, remaining, route: added.length ? {
        layers: [...new Set(added.map(item => item.layer))],
        bounds: polygonBounds(added.flatMap(item => item.points))
      } : undefined };
    },
    route_nets: ({ nets }) => {
      if (new Set(nets.map(item => item.net)).size !== nets.length) throw new Error('Повтор цепи в пакете.');
      return nets.map(item => {
        const result = handlers.route_net(item) as { applied: boolean; remaining: unknown[] };
        if (!result.applied || result.remaining.length) {
          throw new Error('Пакет не применён. Не удалось полностью развести ' + item.net + '. ' + JSON.stringify(result));
        }
        return { net: item.net, ...result };
      });
    },
    commit_route: ({ previewId }) => {
      if (!lastPreview || lastPreview.id !== previewId || lastPreview.revision !== revision) {
        throw new Error('Предпросмотр устарел. Повторите route_net с preview:true.');
      }
      draft.documents.pcb = lastPreview.pcb;
      lastPreview = undefined;
      return { applied: true };
    },
    route_trace: ({ net, ...trace }) => {
      const pcb = board();
      const required = draft.targets?.board?.routes?.[net];
      if (required?.allowedLayers && !required.allowedLayers.includes(trace.layer)) {
        throw new Error('Слой не разрешён контрактом для цепи ' + net + '.');
      }
      if ((required?.width !== undefined && Math.abs(trace.width - required.width) >= 0.001) ||
          (required?.minWidth !== undefined && trace.width + 0.001 < required.minWidth)) {
        throw new Error('Ширина не соответствует контракту для цепи ' + net + '.');
      }
      const crossing = required?.crossing;
      if (crossing && trace.layer !== crossing.layer && trace.points.some((point, i) => i > 0 &&
        (point[crossing.axis] < crossing.at) !== (trace.points[i - 1][crossing.axis] < crossing.at))) {
        throw new Error('Пересечение разрешено только на слое ' + crossing.layer + '.');
      }
      const route = { netName: net, ...trace };
      validateTrace(pcb, route);
      const id = uid('trace');
      pcb.traces.push({ id, ...route });
      validateNewCopper(pcb, id);
      return { id };
    },
    add_via: ({ x, y, net, diameter, hole, viaInPad = false }) => {
      const pcb = board();
      if (viaInPad && !draft.targets?.board?.allowViaInPad) throw new Error('Для via-in-pad нужно явное разрешение технологии в ТЗ. Используйте переход вне площадки либо укажите ограничение в черновике.');
      if (hole >= diameter) throw new Error('Диаметр отверстия должен быть меньше наружного.');
      if (!pcb.components.some(item => Object.values(item.padNets).includes(net))) throw new Error('Цепь отсутствует в списке площадок.');
      const smd = getWorldPads(pcb).find(item => item.pad.type === 'SMD' &&
        pointToPadDistance({ x, y }, item) < hole / 2 && (!viaInPad || item.netName !== net));
      if (smd) {
        throw new Error('Отверстие пересекает SMD-площадку ' + smd.refDes + '.' + smd.pad.number + '. Сместите via за площадку; viaInPad допустим только для той же цепи и согласованной технологии.');
      }
      const id = uid('via');
      pcb.vias.push({ id, x, y, netName: net, outerDiameter: diameter, holeDiameter: hole, startLayer: 'TopCopper', endLayer: 'BottomCopper', viaStyle: 'Through', ...(viaInPad ? { viaInPad: true } : {}) });
      validateNewCopper(pcb, id);
      return { id };
    },
    delete_board: ({ ids }) => {
      const pcb = board();
      const available = new Map(Object.entries({
        traces: pcb.traces, vias: pcb.vias, components: pcb.components, copperPours: pcb.copperPours,
        keepouts: pcb.keepouts, cutouts: pcb.cutouts
      }).flatMap(([kind, items]) => items.map(item => [item.id, kind] as const)));
      const missing = ids.filter(id => !available.has(id));
      if (missing.length) throw new Error('Объекты платы не найдены: ' + missing.join(', '));
      pcb.traces = pcb.traces.filter(item => !ids.includes(item.id));
      pcb.vias = pcb.vias.filter(item => !ids.includes(item.id));
      pcb.components = pcb.components.filter(item => !ids.includes(item.id));
      pcb.copperPours = pcb.copperPours.filter(item => !ids.includes(item.id));
      pcb.keepouts = pcb.keepouts.filter(item => !ids.includes(item.id));
      pcb.cutouts = pcb.cutouts.filter(item => !ids.includes(item.id));
      return { remaining: pcb.components.length, removed: [...new Set(ids)].map(id => ({ id, kind: available.get(id) })) };
    },
    check: ({ detail }) => {
      const { schematic: sch, pcb } = draft.documents;
      if (!sch && !pcb) throw new Error('Черновик пуст.');
      const erc = sch ? runSchematicErc(sch) : [];
      const drc = pcb ? runPcbDrc({ ...pcb, drcWaivers: {}, designRules: { ...pcb.designRules, checkUnroutedNets: true } }) : [];
      const layout = sch?.sheets.flatMap(item => checkSheetLayout(item, sch.customComponentDefs)) ?? [];
      const nets = sch?.sheets.length ? extractSchematicNets(sch).map(net => ({
        name: net.netName, pins: net.pins.map(item => item.refDes + '.' + item.pinNumber), wires: net.wireIds
      })) : [];
      const labelIssues = sch?.sheets.flatMap(item =>
        findLabelOverlaps(item, sch.customComponentDefs).map(issue => ({ sheet: item.id, ...issue }))) ?? [];
      const comparison = sch && pcb ? comparePcbToSchematic(sch, pcb) : undefined;
      const ratlines = pcb ? computeUnroutedRatlines(pcb) : [];
      const unrouted = pcb ? ratlines.length : undefined;
      draft.checks = { erc: erc.length, drc: drc.length, outsideFrame: layout.length, unrouted, inSync: comparison?.inSync };
      const unfilledPours = pcb?.copperPours.filter(item => !item.poured).map(item => item.id) ?? [];
      const pcbGeometry = pcb ? [
        ...pcb.copperPours.filter(pour => (pour.computedIslands ?? []).some(island =>
          boundaryIssue(island.outer, pcb.boardOutline, pcb.designRules.clearanceCopperToBoard)))
          .map(pour => 'Заливка ' + pour.id + ' нарушает зазор до края платы.')
      ] : [];
      const geometryWarnings = pcb?.keepouts.filter(zone => boundaryIssue(zone.points, pcb.boardOutline, 0))
        .map(zone => 'Зона запрета ' + zone.id + ' выходит за контур или касается его. Сверьте с механическим ТЗ.') ?? [];
      const requirements = evaluateRequirements(draft.targets, draft.documents);
      const targetIssues = [
        ...compareTargets(draft.targets, draft.documents, nets),
        ...requirements.filter(row => !row.pass).map(row => row.requirement + ': ожидалось ' + JSON.stringify(row.expected) + ', получено ' + JSON.stringify(row.actual))
      ];
      Object.assign(draft.checks!, { requirements, revision, errors: erc.filter(row => row.severity === 'Error').length + drc.filter(row => row.severity === 'Error').length,
        warnings: erc.filter(row => row.severity === 'Warning').length + drc.filter(row => row.severity === 'Warning').length });
      blockers = [...targetIssues, ...pcbGeometry];
      if (pcb?.vias.some(item => item.viaInPad) && !draft.targets?.board?.allowViaInPad) {
        blockers.push('Плата использует via-in-pad без согласования технологии в ТЗ.');
      }
      if (pcb && pcb.components.length === 0) blockers.push('Плата не содержит компонентов.');
      if (sch && sch.sheets.every(sheet => sheet.components.length === 0)) blockers.push('Схема не содержит компонентов.');
      if (comparison && !comparison.inSync) blockers.push('Схема и плата расходятся.');
      if (erc.some(issue => issue.severity === 'Error')) blockers.push('Есть ошибки ERC.');
      if (drc.some(issue => issue.severity === 'Error')) blockers.push('Есть ошибки DRC.');
      if (drc.some(issue => issue.code === 'DRC-EDGE')) blockers.push('Нарушен зазор до края платы.');
      if (layout.length) blockers.push('Есть объекты за рамкой или в области штампа. См. layout.');
      if (labelIssues.length) blockers.push('Есть наложения подписей компонентов. Исправьте через set_component_labels.');
      if (unrouted) blockers.push('Неразведённых связей: ' + unrouted);
      if (unfilledPours.length) blockers.push('Есть незалитые полигоны.');
      draft.checks!.blockers = blockers;
      checked = true;
      if (!blockers.length) verified = structuredClone(draft.documents);
      if (detail === 'summary' && !blockers.length) {
        const diagnostics = (issues: typeof erc | typeof drc) => {
          const byCode: Record<string, { count: number; severity: string; example: string }> = {};
          for (const issue of issues) {
            const group = byCode[issue.code] ??= { count: 0, severity: issue.severity, example: issue.message };
            group.count++;
          }
          return { count: issues.length, byCode };
        };
        return {
          revision, blockers, missing: missingTargetFields(draft.targets), checkedRequirements: requirements.length,
          schematic: sch ? { sheets: sch.sheets.length, erc: diagnostics(erc) } : undefined,
          pcb: pcb ? { components: pcb.components.length, layers: pcb.layerCount, traces: pcb.traces.length,
            vias: pcb.vias.length, viaInPad: pcb.vias.filter(item => item.viaInPad).length,
            unfilledPours, unrouted, drc: diagnostics(drc) } : undefined,
          inSync: comparison?.inSync, geometryWarnings
        };
      }
      return { erc, drc, layout, labelIssues, nets, comparison, unrouted, ratlines, unfilledPours, pcbGeometry, geometryWarnings, targetIssues, requirements, revision, blockers };
    },
    screenshot: ({ target, sheet: id }) => {
      const current = target === 'schematic' ? sheet(id ?? schematic().activeSheetId) : undefined;
      if (target === 'pcb') board();
      const key = current?.id ?? 'pcb';
      const cached = captures.get(key);
      if (cached) return cached;
      const capture = renderCapture(target, current?.id, undefined, key);
      captures.set(key, capture);
      return capture;
    },

    finish: ({ summary, limitations, status = 'complete' }) => {
      if (draft.documents.schematic || draft.documents.pcb) {
        const missing = draft.documents.schematic?.sheets.filter(item => !captures.has(item.id)).map(item => item.id) ?? [];
        if (draft.documents.pcb && !captures.has('pcb')) missing.push('pcb');
        if (!checked || missing.length) throw new Error('Для финальной версии нужны check и screenshot: ' + missing.join(', '));
      }
      if (status === 'complete') {
        if (!draft.documents.schematic && !draft.documents.pcb) throw new Error('Готовый результат должен содержать документ.');
        const missing = missingTargetFields(draft.targets);
        if (missing.length) throw new Error('Завершение заблокировано: дополните контракт ТЗ: ' + missing.join(', ') + '.');
        if (blockers.length) throw new Error('Завершение заблокировано: ' + blockers.join(' ') + ' Исправьте дефекты или укажите status:draft.');
      } else if (!limitations.trim()) {
        throw new Error('Для незавершённого черновика укажите в limitations оставшиеся проблемы.');
      }
      const checks = draft.checks;
      const verification = checked && checks?.revision === revision ? [
        'Ошибок: ' + checks.errors, 'предупреждений: ' + checks.warnings,
        'блокеров: ' + blockers.length,
        ...(checks.unrouted === undefined ? [] : ['неразведённых связей: ' + checks.unrouted]),
        ...(checks.inSync === undefined ? [] : [checks.inSync ? 'плата соответствует схеме' : 'плата расходится со схемой'])
      ].join(' · ') : undefined;
      draft.report = { summary, limitations, status, verification };
      return draft.report;
    }
  };

  const readOnly = new Set<CommandName>(['remember', 'set_targets', 'query_library', 'compare_requirements', 'finalize_project', 'render_review', 'simulate', 'bom', 'search_library', 'read_library', 'inspect', 'check', 'screenshot', 'finish']);

  function execute<K extends CommandName>(name: K, raw: unknown) {
    const args = commands[name].parse(raw) as z.output<(typeof commands)[K]>;
    if (readOnly.has(name)) return handlers[name](args);
    const previous = draft.documents;
    draft.documents = structuredClone(previous);
    try {
      const result = handlers[name](args);
      if (JSON.stringify(previous) === JSON.stringify(draft.documents)) {
        draft.documents = previous;
        return result;
      }
      revision++;
      lastPreview = undefined;
      checked = false;
      captures.clear();
      detailCaptures.clear();
      delete draft.report;
      delete draft.checks;
      if (draft.documents.pcb && name !== 'refill_copper' && ['board_outline', 'create_board', 'place_footprint', 'move_footprint',
        'board_rules', 'set_net_class', 'place_footprints', 'place_target_footprints', 'sync_target_pad_nets', 'sync_board_from_schematic', 'route_net', 'route_nets', 'commit_route', 'add_keepout', 'add_cutout', 'add_copper_pour', 'auto_place', 'auto_route', 'route_remaining', 'route_trace', 'route_between_pads', 'replace_component_pattern', 'add_via', 'delete_board'].some(command => command === name)) {
        for (const pour of draft.documents.pcb.copperPours) {
          pour.poured = false;
          delete pour.computedIslands;
        }
      }
      return result;
    } catch (error) {
      draft.documents = previous;
      throw error;
    }
  }

  return { draft, captures, execute, getProgress, setUserTargets, get revision() { return revision; } };
}
