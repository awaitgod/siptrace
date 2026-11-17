import collections as c
import json
import pathlib
from decimal import Decimal
import csv

root = pathlib.Path(__file__).resolve().parent
models = ['deepseek-v4.1-flash-1017']
tasks = json.loads((root/'tasks.json').read_text(encoding='utf-8-sig'))
billing = json.loads((root/'billing.json').read_text(encoding='utf-8')) if (root/'billing.json').exists() else {}
names = {'deepseek-v4.1-flash-1017':'DeepSeek + D1.2'}
sheet_ports = {
    1: {'+5V': ['R1'], 'OUT': ['R1','R2'], 'GND': ['R2']},
    2: {'IN': ['R1'], 'OUT': ['R1','C1'], 'GND': ['C1']},
    3: {'+5V': ['R1'], 'GND': ['HL1']},
    4: {'+3V3': ['R1'], 'KEY': ['R1','SB1','C1'], 'GND': ['SB1','C1']},
    5: {'IN': ['R1'], 'LINK': ['R1','R2'], 'GND': ['R2']},
}
pair_nets = {'A': {'R1.1','R2.1'}, 'B': {'R1.2','R2.2'}}
board_expected = {
    6: ({'A': {'XT1.1','R1.1'}, 'B': {'XT1.2','R1.2'}}, (40,30)),
    7: (pair_nets, (45,30)),
    8: (pair_nets, (36,25)),
    9: ({'SIG': {'R1.1','R2.1'}}, (48,32)),
    10: ({'SIG': {'R1.1','R2.1'}, 'GND': {'R1.2','R2.2'}}, (42,30)),
}
def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else None

def canonical(x):
    return str(x).upper().replace(' ', '').replace('–','-')

def audit(n, run, folder):
    test = run['test']
    sch = load(folder/'schematic.gostsch')
    pcb = load(folder/'board.gostpcb')
    rows = []
    demand = lambda label, passed, weight: rows.append((label, bool(passed), weight))
    demand('Точный комплект документов', bool(sch) == (test['type'] != 'pcb') and bool(pcb) == (test['type'] != 'schematic'), 10)
    independent = run['independent']
    nets = independent.get('nets', [])
    by_name = c.defaultdict(list)
    port_refs = {item['refDes'] for sh in (sch or {}).get('sheets', []) for item in sh['components']
                 if (sch or {}).get('customComponentDefs', {}).get(item['componentDefId'], {}).get('isNetPort')}
    for net in nets:
        net = {**net, 'pins': [pin for pin in net['pins'] if pin.split('.')[0] not in port_refs]}
        by_name[canonical(net['name'])].append(set(net['pins']))
    parts = {item['refDes']: item for sheet in (sch or {}).get('sheets', []) for item in sheet['components']}
    ports = {canonical(item['netName']) for sheet in (sch or {}).get('sheets', []) for item in sheet['netPorts']}
    ports.update(canonical((sch or {}).get('customComponentDefs', {}).get(item['componentDefId'], {}).get('portNetName') or item['value'])
                 for sh in (sch or {}).get('sheets', []) for item in sh['components'] if item['refDes'] in port_refs)
    if n <= 5:
        for name, refs in sheet_ports[n].items():
            demand(name + ' · порт, точный состав выводов', name in ports and len(by_name[name]) == 1 and
                    sorted(p.split('.')[0] for p in by_name[name][0]) == sorted(refs), 7)
    if n == 3:
        lamp = parts.get('HL1') or {}
        definition = (sch or {}).get('customComponentDefs', {}).get(lamp.get('componentDefId'), {})
        pin_names = {p['number']: canonical(p['name']) for part in definition.get('parts', []) for p in part['pins']}
        kat = {num for num,name in pin_names.items() if name in {'K','К','CATHODE','КАТОД'}}
        an = {num for num,name in pin_names.items() if name in {'A','А','ANODE','АНОД'}}
        demand('HL1 · катод на GND, анод с R1', any('HL1.'+num in group for group in by_name['GND'] for num in kat)
               and any(len(group['pins']) == 2 and any(pin.startswith('R1.') for pin in group['pins'])
                       and any('HL1.'+num in group['pins'] for num in an) for group in nets), 12)
    if test['type'] != 'pcb':
        sheets = (sch or {}).get('sheets', [])
        des = f'ТЕСТ.0000{n:02} Э3'
        demand('Штамп: обозначение, рамка, порядок листов', len(sheets) == (2 if n == 5 else 1) and all(
            canonical(sheet['titleBlock']['designation']) == canonical(des) and sheet['titleBlock']['enabled']
            and sheet['titleBlock']['form'] == ('Form1' if index == 0 else 'Form2a')
            and sheet['titleBlock']['sheetNumber'] == index+1 and sheet['titleBlock']['totalSheets'] == len(sheets)
            and (n > 4 or sheet['format'] == 'A4_L') for index,sheet in enumerate(sheets)), 8)
        expect_values = {
            1: {'R1':['10К','10K','10КОМ','10KΩ','10KOHM','10000'], 'R2':['10К','10K','10КОМ','10KΩ','10KOHM','10000']},
            2: {'R1':['1К','1K','1КОМ','1KΩ','1KOHM','1000'], 'C1':['100НФ','100NF','0,1МКФ','0.1UF','0.1ΜF','0.1ΜФ']},
            3: {'R1':['330','330ОМ','330Ω','330OHM','330R']},
            4: {'R1':['10К','10K','10КОМ','10KΩ','10KOHM','10000'], 'C1':['100НФ','100NF','0,1МКФ','0.1UF','0.1ΜF','0.1ΜФ']},
            5: {'R1':['1К','1K','1КОМ','1KΩ','1KOHM','1000'], 'R2':['2К','2K','2КОМ','2KΩ','2KOHM','2000']},
            6: {'R1':['1К','1K','1КОМ','1KΩ','1KOHM','1000']},
            7: {'R1':['1К','1K','1КОМ','1KΩ','1KOHM','1000'], 'R2':['2К','2K','2КОМ','2KΩ','2KOHM','2000']}
        }
        for ref, options in expect_values[n].items():
            demand(ref+' · номинал', canonical(parts.get(ref, {}).get('value','')) in options, 4)
        demand('ERC без сообщений', bool(sch) and not independent.get('erc') and not independent.get('error'), 8)
    if n in board_expected:
        expected, dims = board_expected[n]
        outline = (pcb or {}).get('boardOutline', [])
        width = max((p['x'] for p in outline), default=0) - min((p['x'] for p in outline), default=0)
        height = max((p['y'] for p in outline), default=0) - min((p['y'] for p in outline), default=0)
        demand('Габариты и два слоя', (width,height) == dims and pcb['layerCount'] == 2, 7)
        padnets = c.defaultdict(set)
        for part in (pcb or {}).get('components', []):
            for pad, net in part['padNets'].items():
                padnets[canonical(net)].add(part['refDes']+'.'+pad)
        demand('Точное назначение всех цепей площадок', dict(padnets) == expected, 15)
        demand('Связность платы без ratlines', bool(pcb) and not independent.get('ratlines') and dict(padnets) == expected, 10)
        demand('DRC без сообщений', bool(pcb) and not independent.get('drc') and not independent.get('error'), 8)
    if n == 5:
        demand('Листы названы «Источник» и «Нагрузка»', [sh['name'] for sh in (sch or {}).get('sheets', [])] == ['Источник','Нагрузка'], 4)
    if n in (6,7):
        expected = board_expected[n][0]
        demand('Схема: точный состав цепей', all(by_name[net] == [pins] for net,pins in expected.items()), 14)
        demand('Плата совпадает со схемой', run['draft'].get('checks', {}).get('inSync') is True, 5)
    if n == 6:
        defs = (sch or {}).get('customPatternDefs', {})
        patt = defs.get(parts.get('XT1',{}).get('patternId'), {})
        pads = sorted(patt.get('pads', []), key=lambda p:p['number'])
        demand('Свой XT1, координаты, сверло и тело', patt.get('model3d', {}).get('bodyHeight') == 5
               and patt.get('courtyard') == {'width':6,'height':4}
               and [(p['number'],p['x'],p['y'],p['type'],p['width'],p['height'],p.get('holeDiameter')) for p in pads]
                   == [('1',-1.27,0,'THT',1.8,1.8,.9),('2',1.27,0,'THT',1.8,1.8,.9)], 10)
    if n == 8:
        demand('Зазоры ≥0,25 мм', min(((pcb or {}).get('designRules',{}).get(k,0) for k in
            ['clearanceTraceToTrace','clearanceTraceToPad','clearancePadToPad','clearanceViaToAny'])) >= .25, 8)
    if n == 9:
        demand('Запрет RouteKeepout на всех слоях', any(z['kind']=='RouteKeepout' and z['layer']=='AllCopper'
            and {(p['x'],p['y']) for p in z['points']} == {(21,8),(27,8),(27,24),(21,24)} for z in (pcb or {}).get('keepouts',[])), 10)
        locate = {part['refDes']:part for part in (pcb or {}).get('components',[])}
        demand('R1 и R2 на заданных позициях', all(abs(locate.get(ref,{}).get('x',0)-x)<=2 and abs(locate.get(ref,{}).get('y',0)-16)<=2
               for ref,x in [('R1',12),('R2',36)]), 7)
    if n == 10:
        demand('Полигон GND, верх, зазор ≥0,25', any(p['poured'] and p['layer']=='TopCopper' and p['netName']=='GND'
               and p['clearance']>=.25 and p.get('computedIslands') for p in (pcb or {}).get('copperPours',[])), 10)
    count = (2 if n in (5,6,7) else 1)
    demand('Финальные PNG, check и отчёт', len(run['captures']) == count and
           bool(run['draft'].get('checks')) and bool(run['draft'].get('report')) and not run.get('error'), 15)
    return rows, sch, pcb

results = []
detail = ['# Разбор прогонов', '', 'Критерии и баллы отражают условия тестовых заданий. Электрические связи взяты из штатного экстрактора, маршруты — из DRC и списка ratlines. Баллы нормированы на максимум конкретного задания.']
for n, task in enumerate(tasks,1):
    for model in models:
        folder = root/'runs'/task['id']/model
        run = load(folder/'run.json')
        if not run: continue
        criteria, sch, pcb = audit(n, run, folder)
        valid = [r for r in run['requests'] if r.get('http') == 200]
        found = [billing[r['id']] for r in valid if r.get('id') in billing]
        decisions = [event for event in run['events'] if event['kind']=='decision']
        decision_cost = sum(Decimal(str(event['usage']['cost_rub'])) for event in decisions)
        cost = sum((Decimal(r['Cost'] or '0') for r in found), Decimal(0)) if found else None
        tools = [e for e in run['events'] if e['kind']=='tool' and e.get('source') != 'agent']
        rejected = [e for e in tools if not e['ok']]
        tool_order = [e['name'] + (' ✗' if not e['ok'] else '') for e in tools]
        score = round(100*sum(weight for _, passed, weight in criteria if passed)/sum(weight for _,_,weight in criteria),1)
        record = dict(decisions=len(decisions), interventions=sum(event['enforced'] for event in decisions), decision_cost=str(decision_cost), total_cost=str((cost or Decimal(0))+decision_cost), task=task['id'], name=task['name'], model=names[model], score=score, report=bool(run['draft'].get('report')),
                      seconds=round(run['durationMs']/1000,1), requests=len(run['requests']), billed=len(found), responses=len(valid),
                      tools=len(tools), rejected=sum(item.get('step','').startswith('Ошибка ·') for item in run['events']),
                      mutations=sum(e['ok'] and e['name'] not in {'inspect','check','finish','screenshot','remember','bom','simulate','search_library','read_library'} for e in tools),
                      screenshot_calls=sum(e['ok'] and e['name']=='screenshot' for e in tools),
                      check_calls=sum(e['ok'] and e['name']=='check' for e in tools),
                      prompt_tokens=sum(int(row.get('PromptTokens') or 0) for row in found),
                      completion_tokens=sum(int(row.get('CompletionTokens') or 0) for row in found),
                      cached_tokens=sum(int(row.get('CachedTokens') or 0) for row in found),
                      reasoning_tokens=sum(int(row.get('ReasoningTokens') or 0) for row in found),
                      docs_match=criteria[0][1], pcb_created=bool(pcb), schematic_created=bool(sch),
                      trace_count=len(pcb.get('traces',[])) if pcb else None, via_count=len(pcb.get('vias',[])) if pcb else None,
                      drc_errors=sum(item.get('severity') == 'Error' for item in run['independent'].get('drc',[])) if pcb else None,
                      cost=str(cost) if cost is not None else '', erc=len(run['independent'].get('erc',[])) if sch else None,
                      drc=len(run['independent'].get('drc',[])) if pcb else None, unrouted=len(run['independent'].get('ratlines',[])) if pcb else None)
        finalcheck = next((event['output'] for event in reversed(run['events']) if event['kind']=='tool' and event.get('name')=='check' and event.get('ok') and event.get('source') != 'agent'), {})
        record['label_issues'] = len(finalcheck.get('labelIssues',[]))
        record['blockers'] = len(finalcheck.get('blockers',[]))
        record['status'] = run['draft'].get('report',{}).get('status','unfinished')
        results.append(record)
        rel = folder.relative_to(root).as_posix()
        artifact_links = ['[JSON журнала]('+rel+'/run.json)', '[NDJSON событий]('+rel+'/events.ndjson)']
        if sch: artifact_links.append('[Схема]('+rel+'/schematic.gostsch)')
        if pcb: artifact_links.append('[Плата]('+rel+'/board.gostpcb)')
        artifact_links.extend('['+image['label']+']('+rel+'/'+image['file']+')' for image in run['captures'])
        detail.extend(['',f"## {task['id']} · {task['name']} · {names[model]}", '',
                       f"Балл {score:.1f}/100 · {record['seconds']} с · {record['requests']} запросов · "
                       f"{record['tools']} вызовов · отклонено {record['rejected']} · {cost if cost is not None else 'нет данных'} ₽ · журнал {len(found)}/{len(valid)}", '',
                       ' · '.join(artifact_links),''])
        if run.get('error'): detail.extend(['Остановка — '+run['error'],''])
        detail.extend(['- '+('✓' if passed else '✗')+' '+label for label,passed,_ in criteria])
        detail.extend(['','**Хронология команд**','', ' → '.join(tool_order), ''])
        for err in rejected:
            msg = err['error'].replace('\n',' ').replace('|','/')
            detail.append(f"- {err['ms']/1000:.1f} с, `{err['name']}` — {msg}")
        if run['independent'].get('nets'):
            detail.extend(['','**Извлечённые цепи**',''] + [
                "- "+net['name']+" — "+', '.join(net['pins']) for net in run['independent']['nets'] if net['pins']
            ])
        for kind in ['erc','drc']:
            if run['independent'].get(kind):
                cnt = c.Counter((e['code'],e['message']) for e in run['independent'][kind])
                detail.extend(['', '**'+kind.upper()+'**',''] + [f'- {code} ×{num} — {message}' for (code,message),num in cnt.items()])
        report = run['draft'].get('report')
        if report: detail.extend(['','**Итог модели**','',report['summary'],'',report['limitations']])
(root/'DETAILS.md').write_text('\n'.join(detail)+'\n',encoding='utf-8')
(root/'metrics.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
if results:
    with (root/'metrics.csv').open('w',encoding='utf-8-sig',newline='') as out:
        writer = csv.DictWriter(out, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)
for r in results:
    print(*(r[k] for k in ['task','model','score','report','seconds','cost','billed','responses','rejected','erc','drc','unrouted']),sep=' | ')
