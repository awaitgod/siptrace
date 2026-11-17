from pathlib import Path
import json,collections
root=Path(__file__).resolve().parent
lines=['# Хронология десяти разработок','',
'Время отсчитывается от запуска каждой разработки. Команды с отметкой «Отклонено» не изменили документ через API. Записи API контролёра, аргументы и результаты находятся в run.json и events.ndjson. Независимые снимки аудитора помечены в галерее.','']
for folder in sorted((root/'runs').glob('*/*')):
 p=folder/'run.json'
 if not p.exists():continue
 r=json.loads(p.read_text(encoding='utf-8'))
 events=r['events']
 tools=[e for e in events if e['kind']=='tool' and e.get('source') != 'agent']
 decisions=[e for e in events if e['kind']=='decision']
 lines += ['## '+r['test']['id']+' · '+r['test']['name'],'',r['test']['task'],'',
 'Статус — '+r['draft'].get('report',{}).get('status',r.get('error','нет отчёта'))+'.',
 '', '| Время, с | Команда | Результат |', '|---:|---|---|']
 for e in tools:
  result='OK' if e['ok'] else str(e.get('error','')).replace('\n',' ').replace('|','/').replace('Error: ','')
  if e['name']=='check' and e['ok']:
   out=e['output']; result=f"ERC {len(out['erc'])}, DRC {len(out['drc'])}, связи {out.get('unrouted','—')}, labels {len(out.get('labelIssues',[]))}, blockers {len(out.get('blockers',[]))}"
  if e['name']=='set_frame' and e['ok']: result += ' · '+json.dumps(e['args'],ensure_ascii=False)
  if e['name'] in ('set_targets','delete_schematic','delete_board') and e['ok']:result += ' · '+json.dumps(e['args'],ensure_ascii=False)
  lines.append(f"| {e['ms']/1000:.2f} | {e['name']} | {result} |")
 lines += ['','### Контролёр','', '| Время, с | Выбор | Уверенность | P(задание выполнено) | Вмешательство | ₽ |', '|---:|---|---:|---:|---|---:|']
 for e in decisions:
  a=e['answers']; action=a['action']
  lines.append(f"| {e['ms']/1000:.2f} | {action['choice']} | {action['confidence']:.4f} | {a['taskSatisfied']['noul']:.4f} | {e['enforced']} | {e['usage']['cost_rub']} |")
 errors=[e for e in events if e['kind']=='decision_error']
 for e in errors:lines.append('- Ошибка контролёра — '+e['error'])
 lines += ['','### Последовательность и остаточные дефекты','']
 counts=collections.Counter(e['name'] for e in tools)
 lines += ['Вызовы команд — '+', '.join(f'{name} ×{count}' for name,count in counts.most_common())+'.','']
 mutations=[e for e in tools if e['ok'] and e['name'] not in {'inspect','remember','read_library','search_library','check','screenshot','simulate','bom','finish','set_targets'}]
 checks=[e for e in tools if e['name']=='check' and e['ok']]
 if checks:
  last=checks[-1]
  for key in ('blockers','targetIssues','pcbGeometry','geometryWarnings'):
   if last['output'].get(key): lines += ['- '+key+' — '+json.dumps(last['output'][key],ensure_ascii=False)]
  if mutations and mutations[-1]['ms']>last['ms']:lines += ['- После последней проверки были изменения документа. Финальная ревизия требует повторной проверки.']
 for kind in ('erc','drc'):
  errors=r['independent'].get(kind,[])
  if errors:lines += ['- '+kind.upper()+' — '+', '.join(f'{code} ×{count}' for code,count in collections.Counter(x['code'] for x in errors).items())]
 for net in r['independent'].get('nets',[]):
  if net['pins']: lines.append('- '+net['name']+' — '+', '.join(net['pins']))
 rel=folder.relative_to(root).as_posix()
 lines += ['', '[Полные записи]('+rel+'/run.json) · [Все события]('+rel+'/events.ndjson)','']
 report=r['draft'].get('report')
 if report: lines+=['### Отчёт агента','',report['summary'],'',report['limitations'],'']
(root/'TIMELINES.md').write_text('\n'.join(lines),encoding='utf-8')
