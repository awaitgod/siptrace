"""Score the fixture contract and reconstruct the actual agent tool sequence."""

import collections
import itertools
import json
import math
import pathlib
import statistics
import sys

from shapely import affinity
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

LAYERS = ['TopCopper', 'Inner1', 'Inner2', 'BottomCopper']
EPSILON = 0.003


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else None


def xy(point):
    return point['x'], point['y']


def polygon(points, holes=()):
    return Polygon([xy(p) for p in points], [[xy(p) for p in hole] for hole in holes])


def pad_geometry(part, pad):
    rx, ry = pad['width'] / 2, pad['height'] / 2
    if pad['shape'] in ('Round', 'Oval'):
        shape = affinity.scale(Point(0, 0).buffer(1, 48), rx, ry)
    elif pad['shape'] == 'RoundedRect':
        radius = min(rx, ry, pad.get('cornerRadius', min(rx, ry) / 4))
        shape = box(-rx+radius, -ry+radius, rx-radius, ry-radius).buffer(radius)
    elif pad['shape'] == 'Polygon':
        shape = polygon(pad['polygonPoints'])
    else:
        shape = box(-rx, -ry, rx, ry)
    mirror = -1 if part['side'] == 'Bottom' else 1
    center = affinity.rotate(Point(mirror*pad['x'], pad['y']), part['angle'], origin=(0, 0))
    shape = affinity.rotate(shape, mirror*part['angle']+pad.get('angle', 0), origin=(0, 0))
    return affinity.translate(shape, part['x']+center.x, part['y']+center.y)


def electrical_geometry(pcb, layers, clearance):
    copper = []
    holes = []

    def add(name, net, span, geom, kind):
        copper.append((name, net, set(span), geom, kind))

    for part in pcb['components']:
        for pad in part['pads']:
            if pad['type'] == 'MountingHole':
                continue
            span = layers if pad['type'] == 'THT' else [part['side']+'Copper']
            add(part['refDes']+'.'+pad['number'], part.get('padNets',{}).get(pad['number']),
                span, pad_geometry(part, pad), 'pad')
    for trace in pcb['traces']:
        path = LineString([xy(p) for p in trace['points']])
        add(trace['id'], trace['netName'], [trace['layer']], path.buffer(trace['width']/2), 'trace')
    for via in pcb['vias']:
        a, b = sorted(LAYERS.index(via[key]) for key in ('startLayer','endLayer'))
        center = Point(xy(via))
        add(via['id'], via['netName'], set(LAYERS[a:b+1]) & set(layers),
            center.buffer(via['outerDiameter']/2, 48), 'via')
        holes.append((via['id'], center.buffer(via['holeDiameter']/2, 48)))
    for pour in pcb['copperPours']:
        if not pour.get('poured'):
            continue
        for i, island in enumerate(pour.get('computedIslands') or []):
            geometry = polygon(island['outer'], island.get('holes',[]))
            if not geometry.is_valid:
                geometry = geometry.buffer(0)
            for k, region in enumerate(geometry.geoms if hasattr(geometry,'geoms') else [geometry]):
                if not region.is_empty:
                    add(pour['id']+f'/{i+1}.{k+1}', pour['netName'], [pour['layer']], region, 'pour')

    links = {i:set() for i in range(len(copper))}
    clearance_issues = []
    for (i,(name,net,span,shape,kind)), (j,(other,other_net,other_span,other_shape,other_kind)) in itertools.combinations(enumerate(copper),2):
        if not span & other_span:
            continue
        distance = shape.distance(other_shape)
        if net and net == other_net and distance <= EPSILON:
            links[i].add(j)
            links[j].add(i)
        elif net != other_net or net is None:
            if distance < clearance-EPSILON:
                clearance_issues.append(f'{name} ({net or "NC"}) ↔ {other} ({other_net or "NC"}): {distance:.3f} мм')

    components = collections.defaultdict(list)
    visited = set()
    isolated = []
    pours_on_net = collections.Counter()
    for start, (name, net, _, _, kind) in enumerate(copper):
        if start in visited or not net:
            continue
        queue = [start]
        visited.add(start)
        for index in queue:
            for neighbor in links[index] - visited:
                visited.add(neighbor)
                queue.append(neighbor)
        pads = sorted(copper[i][0] for i in queue if copper[i][4] == 'pad')
        if pads:
            components[net].append(pads)
            pours_on_net[net] += sum(copper[i][4] == 'pour' for i in queue)
        else:
            isolated.extend(copper[i][0] for i in queue)

    boundary = polygon(pcb['boardOutline'])
    voids = [polygon(cutout['points']) for cutout in pcb['cutouts']]
    safe = boundary.difference(unary_union(voids)).buffer(-pcb['designRules']['clearanceCopperToBoard']+EPSILON)
    material_issues = [name for name, _, _, shape, _ in copper if not safe.covers(shape)]
    smd = [shape for _, _, span, shape, kind in copper if kind == 'pad' and len(span) == 1]
    via_in_pad = [name for name,hole in holes if any(hole.intersects(pad) for pad in smd)]
    return dict(components=dict(components), poursOnNet=dict(pours_on_net), isolated=isolated,
                clearanceIssues=clearance_issues, materialIssues=material_issues, viaInPad=via_in_pad,
                pourKeepout=[name for name,_,span,shape,kind in copper if kind == 'pour' and any(
                    zone['kind']=='PourKeepout' and (zone['layer']=='AllCopper' or zone['layer'] in span)
                    and shape.intersection(polygon(zone['points'])).area > 0.002 for zone in pcb['keepouts'])],
                splitPourSide=[name for name,net,_,shape,kind in copper if kind=='pour' and
                    ((net=='AGND' and shape.bounds[2]>25+EPSILON) or (net=='DGND' and shape.bounds[0]<31-EPSILON))])


def acceptance(req, result, pcb, schematic):
    independent = result['independent']
    checks = []

    def test(label, condition, expected=None, actual=None):
        checks.append(dict(requirement=label, passed=bool(condition), expected=expected, actual=actual))

    def same(label, expected, actual):
        test(label, expected==actual, expected, actual)

    same('Комплект документов', ['PCB','SCH'] if 'sheets' in req else ['PCB'],
         ['PCB']*bool(pcb)+['SCH']*bool(schematic))
    if schematic and 'sheets' in req:
        sheets = schematic['sheets']
        same('Листы (имя, формат, форма)', [[s['name'],s['format'],s['form']] for s in req['sheets']],
             [[s['name'],s['format'],s['titleBlock'].get('form')] for s in sheets])
        same('Обозначение всех листов', [req['designation']]*len(sheets),[s['titleBlock']['designation'] for s in sheets])
        parts = [p for s in sheets for p in s['components'] if not p['refDes'].startswith('#')]
        same('Позиции схемы', sorted(req['refs']),sorted(p['refDes'] for p in parts))
        if req.get('sheetRefs'):
            same('Разбиение по листам', [sorted(refs) for refs in req['sheetRefs']],
                 [sorted(p['refDes'] for p in s['components'] if p['refDes'] in req['refs']) for s in sheets])
        if req['id']=='01-dual-rc':
            same('Именованные порты', ['GND','IN_A','IN_B','OUT_A','OUT_B'],
                 sorted({port['netName'] for s in sheets for port in s['netPorts']}))
        if req['id']=='07-two-sheet-chain':
            same('Межлистовые порты LINK', [['Вход','OffPageOut'],['Выход','OffPageIn']],
                 [[s['name'],p['style']] for s in sheets for p in s['netPorts'] if p['netName']=='LINK'])
            same('Внешние порты', ['IN','OUT'],
                 sorted({p['netName'] for s in sheets for p in s['netPorts'] if p['netName']!='LINK'}))
        for ref, value in req.get('values',{}).items():
            same('Номинал '+ref,value,next((p['value'] for p in parts if p['refDes']==ref),None))
        names = collections.defaultdict(list)
        for net in independent.get('nets',[]):
            terminals = sorted(set(net['pins']) & {pin for pins in req['nets'].values() for pin in pins})
            if terminals:
                names[net['name']].append(terminals)
        same('Точные группы выводов схемы', {k:[sorted(v)] for k,v in req['nets'].items()}, dict(names))
        same('ERC Error',[],[issue['code'] for issue in independent.get('erc',[]) if issue['severity']=='Error'])
        same('Сверка связанной платы',True,independent.get('comparison',{}).get('inSync'))
    if not pcb:
        return checks, {}
    parts = {p['refDes']:p for p in pcb['components']}
    same('Позиции платы', sorted(req['refs']),sorted(parts))
    passive_patterns = {ref:p['patternId'] for ref,p in parts.items() if ref.startswith(('R','C'))}
    test('Посадочные места пассивных компонентов 0805',
         all('0805' in pat or '2012' in pat for pat in passive_patterns.values()), '0805 / 2012', passive_patterns)
    layers = [layer for layer in LAYERS if any(l['id']==layer and l['enabled'] for l in pcb['layers'])]
    same('Активные слои', LAYERS if req['board']['layers']==4 else LAYERS[::3],layers)
    outline = polygon(pcb['boardOutline'])
    target_outline = polygon(req['outline'])
    test('Форма и абсолютные координаты контура', outline.is_valid and outline.symmetric_difference(target_outline).area <= 0.01,
         req['outline'],pcb['boardOutline'])
    for position in req.get('positions',[]):
        ref = position['ref']
        actual = parts.get(ref,{})
        valid = bool(actual) and math.dist(xy(position),xy(actual)) <= 0.100001 and actual['side']==position['side'] and (
            abs((actual['angle']-position['angle']+180)%360-180)<0.001) and actual.get('locked')
        test('Закреплённая позиция '+ref,valid,position,{k:actual.get(k) for k in ('x','y','side','angle','locked')})
    for key in ('keepouts','cutouts'):
        def shape_matches(expected, actual):
            points = expected if key=='cutouts' else expected['points']
            return (key=='cutouts' or all(expected[k]==actual[k] for k in ('kind','layer'))) and (
                polygon(points).symmetric_difference(polygon(actual['points'])).area <= 0.01)
        expected = req.get(key,[])
        test(key, len(expected)==len(pcb[key]) and all(any(shape_matches(e,a) for a in pcb[key]) for e in expected),
             expected,[{k:v for k,v in row.items() if k!='id'} for row in pcb[key]])
    expected_pins = {pin:net for net,pins in req['nets'].items() for pin in pins}
    actual_pins = {ref+'.'+pin:net for ref,p in parts.items() for pin,net in p.get('padNets',{}).items() if net}
    same('Точные назначения площадок',expected_pins,actual_pins)
    rule_set = ('clearanceTraceToTrace','clearanceTraceToPad','clearancePadToPad','clearanceViaToAny')
    min_clearance = req['board']['clearance']
    actual_clearances = {k:pcb['designRules'][k] for k in rule_set}
    test('Заданные зазоры в правилах',min(actual_clearances.values()) >= min_clearance-EPSILON,min_clearance,actual_clearances)
    expected_pours = {(row['net'],row['layer']):row['clearance'] for row in req.get('pours',[])}
    actual_pours = {(p['netName'],p['layer']):p for p in pcb['copperPours']}
    same('Комплект заливок',sorted(expected_pours),sorted(actual_pours))
    for pair, clearance in expected_pours.items():
        pour = actual_pours.get(pair,{})
        test('Пересчитанная заливка '+pair[0], pour.get('poured') and pour.get('computedIslands')
             and pour['clearance'] >= clearance-EPSILON,clearance,pour.get('clearance'))
    for ref in req.get('customRefs',[]):
        pads = sorted(parts.get(ref,{}).get('pads',[]),key=lambda pad:pad['number'])
        expected = [[str(i+1),x,0,1.8,1.8,0.9,'THT','Round'] for i,x in enumerate([-3.81,-1.27,1.27,3.81])]
        same('THT-геометрия '+ref,expected,[[p.get(k) for k in ('number','x','y','width','height','holeDiameter','type','shape')] for p in pads])
    for net,rules in req.get('routeRules',{}).items():
        traces = [t for t in pcb['traces'] if t['netName']==net]
        used = {t['layer'] for t in traces}
        vias = sum(v['netName']==net for v in pcb['vias'])
        if 'layers' in rules:
            target = set(rules['layers'])
            test('Слои трасс '+net, used==target if rules.get('onlyLayers') else target<=used, sorted(target),sorted(used))
        if 'crossLayer' in rules:
            test('Пересечение x=24 '+net,any(t['layer']==rules['crossLayer'] and
                 min(p['x'] for p in t['points'])<24<max(p['x'] for p in t['points']) for t in traces))
        if 'minVias' in rules:
            test('Количество via '+net,vias>=rules['minVias'],rules['minVias'],vias)
        if 'minWidth' in rules or 'targetWidth' in rules:
            widths = sorted({t['width'] for t in traces})
            valid = all(w>=rules['minWidth']-EPSILON if 'minWidth' in rules else
                        abs(w-rules['targetWidth'])<=EPSILON for w in widths)
            test('Ширина трасс '+net,widths and valid,rules.get('minWidth',rules.get('targetWidth')),widths)
    errors = [issue for issue in independent.get('drc',[]) if issue['severity']=='Error' or issue['code']=='DRC-EDGE']
    same('DRC Error и DRC-EDGE',[],[issue['message'] for issue in errors])
    same('Неразведённые связи SIPTrace',0,len(independent.get('ratlines',[])))
    geometry = electrical_geometry(pcb,layers,min_clearance)
    for net, pins in req['nets'].items():
        same('Физическая связность '+net,[sorted(pins)],geometry['components'].get(net,[]))
    for net, _ in expected_pours:
        test('Заливка соединена с площадками '+net,geometry['poursOnNet'].get(net,0)>0)
    for label in ('clearanceIssues','materialIssues','viaInPad','pourKeepout'):
        same(label,[],geometry[label])
    if req['id']=='06-split-pours':
        same('Заливка осталась на своей стороне',[],geometry['splitPourSide'])
    return checks, geometry


def timing(events):
    calls = [e for e in events if e['kind']=='tool']
    executions = [e for e in events if e['kind']=='execution']
    responses = [e for e in events if e['kind']=='response']
    chat = [e for e in responses if e['endpoint']=='chat']
    dec = [e for e in responses if e['endpoint']=='decisions']
    failures = collections.Counter(e['name'] for e in calls if not e['ok'] and not e.get('intercepted'))
    change = [e for e in executions if e.get('after',0)>e.get('before',0)]
    by_revision = collections.Counter((e['name'],e.get('before')) for e in executions if e['ok'])
    verification = [e for e in executions if e['ok'] and e['name'] in ('check','compare_requirements','finalize_project')]
    def report(e):
        detail = e.get('detail') or {}
        return detail.get('report',detail)
    clean = [e for e in verification if not report(e).get('blockers')]
    final_revision = change[-1]['after'] if change else 0
    return dict(
        requests=len(chat), decisions=len(dec), apiMs=sum(e['msApi'] for e in responses),
        noToolAnswers=sum(not (e.get('message') or {}).get('tool_calls') for e in events if e['kind']=='chat'),
        lengthResponses=sum(e.get('finishReason')=='length' for e in chat),
        lengthMs=sum(e['msApi'] for e in chat if e.get('finishReason')=='length'),
        chatMs=sum(e['msApi'] for e in chat), decisionMs=sum(e['msApi'] for e in dec),
        p50ChatMs=round(statistics.median(e['msApi'] for e in chat)) if chat else None,
        peakChatMs=max((e['msApi'] for e in chat),default=0),
        decisionCost=sum(((e.get('usage') or {}).get('cost_rub') or 0) for e in dec),
        chatCostsReported=sum('cost_rub' in (e.get('usage') or {}) for e in chat),
        chatCost=sum(((e.get('usage') or {}).get('cost_rub') or 0) for e in chat),
        tokens=sum(((e.get('usage') or {}).get('total_tokens') or 0) for e in chat),
        inputTokens=sum(((e.get('usage') or {}).get('prompt_tokens') or 0) for e in chat),
        completionTokens=sum(((e.get('usage') or {}).get('completion_tokens') or 0) for e in chat),
        reasoningTokens=sum((((e.get('usage') or {}).get('completion_tokens_details') or {}).get('reasoning_tokens') or 0) for e in chat),
        cachedTokens=sum((((e.get('usage') or {}).get('prompt_tokens_details') or {}).get('cached_tokens') or 0) for e in chat),
        failures=dict(failures), failureCount=sum(failures.values()), tools=len(calls),
        callCounts=dict(collections.Counter(e['name'] for e in calls)), mutations=len(change),
        intercepted=sum(bool(e.get('intercepted')) for e in calls),
        hardDecisions=sum(e.get('enforced',False) for e in events if e['kind']=='decision'),
        decisionErrors=sum(e['kind']=='decision_error' for e in events),
        visualRequests=sum(e['kind']=='request' and e.get('imageCount',0)>0 for e in events),
        imageTransmissions=sum(e.get('imageCount',0) for e in events if e['kind']=='request'),
        repeatedReview=sum(n-1 for (name,_),n in by_revision.items() if name in ('check','compare_requirements','finalize_project','screenshot','render_review') and n>1),
        firstCleanMs=clean[0]['ms'] if clean else None,
        cleanFinalRevisionMs=next((e['ms'] for e in clean if e['after']==final_revision),None),
        lastRevision=final_revision,
        localToolMs=round(sum(e['msLocal'] for e in executions),2),
        httpCodes=dict(collections.Counter(e.get('http','network') for e in responses)))


def detail(events):
    lines = ['| № | Секунды | Событие | Детали |','|---:|---:|---|---|']
    for e in events:
        kind = e['kind']
        if kind=='response':
            info = f"{e.get('http','network')} · {e['msApi']/1000:.2f} с · id {e.get('id','—')} · {e.get('error') or ''}"
            label = e['endpoint']
        elif kind=='execution':
            label = e['name']
            info = e.get('error') or f"ревизия {e['before']} → {e.get('after',e['before'])} · {e['msLocal']:.1f} мс"
            result = e.get('detail') or {}
            result = result.get('report',result)
            if 'blockers' in result:
                info += ' · блокеры: ' + ('; '.join(result['blockers']) or 'нет')
        elif kind=='tool':
            if e['name']!='inspect' and e.get('ok'):
                continue
            label, info = e['name'], 'OK' if e['ok'] else json.dumps(e.get('output'),ensure_ascii=False)
        elif kind=='decision':
            label = 'Decisions'
            answer = e['answers']['action']
            info = f"{answer['choice']} · confidence {answer['confidence']:.3f} · p={answer['probabilities'].get(answer['choice'],0):.3f} · применено {e['enforced']} · taskSatisfied {e['answers']['taskSatisfied']['noul']:.3f}"
        elif kind in ('checkpoint','decision_error','end'):
            label, info = kind, e.get('intervention') or e.get('error') or '—'
        else:
            continue
        lines.append(f"| {e['seq']} | {e['ms']/1000:.2f} | `{label}` | {info.replace('|','&#124;').replace(chr(10),' ')} |")
    return '\n'.join(lines)


def main(root):
    metrics = []
    pages = ['# Хронология десяти прогонов','Числа в первой колонке совпадают с `seq` в полном журнале. Записи execution показывают изменение ревизии.']
    for task in read_json(root/'tasks.json'):
        run = root/task['id']
        result = read_json(run/'result.json')
        if result is None:
            continue
        events = [json.loads(line) for line in (run/'events.ndjson').read_text(encoding='utf-8').splitlines()]
        checks, geometry = acceptance(task['requirement'],result,read_json(run/'board.gostpcb'),read_json(run/'schematic.gostsch'))
        summary = dict(id=task['id'],name=task['name'],status=result['status'],error=result.get('error'),
                       durationMs=result['durationMs'], passed=all(row['passed'] for row in checks),
                       checks=checks, geometry=geometry, **timing(events))
        metrics.append(summary)
        pages += ['## '+task['id']+' · '+task['name'],
                  f"[Полный журнал]({task['id']}/events.ndjson) · [Финальная проверка]({task['id']}/result.json)",
                  detail(events)]
    (root/'metrics.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2),encoding='utf-8')
    (root/'TIMELINES.md').write_text('\n\n'.join(pages)+'\n',encoding='utf-8')
    probes = read_json(root/'PROBES.json')
    if probes:
        for probe in probes:
            if 'boardFile' in probe:
                pcb = read_json(root/probe['boardFile'])
                layers = [layer['id'] for layer in pcb['layers'] if layer['enabled'] and layer['id'] in LAYERS]
                probe['geometry'] = electrical_geometry(pcb,layers,pcb['designRules']['clearanceTraceToPad'])
        (root/'PROBE-GEOMETRY.json').write_text(json.dumps(probes,ensure_ascii=False,indent=2),encoding='utf-8')
    for m in metrics:
        print(m['id'],m['status'],m['requests'],m['failureCount'],len([x for x in m['checks'] if not x['passed']]))


if __name__ == '__main__':
    main(pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(__file__).parent/'runs')
