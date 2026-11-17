import csv, io, json, os, pathlib, urllib.request
root = pathlib.Path(__file__).resolve().parent
url = 'https://api.aitunnel.ru/v1/aitunnel/requests/export?from=2026-11-17&to=2026-11-18&timezone=Europe%2FMoscow'
ids = set()
for p in (root/'runs').glob('*/*/events.ndjson'):
    if p.parent.name == 'gpt-6-luna-pro': continue
    for line in p.read_text(encoding='utf-8').splitlines():
        try: item = json.loads(line)
        except ValueError: continue
        if item.get('kind') == 'api' and item.get('id') and item.get('http') == 200: ids.add(item['id'])
req = urllib.request.Request(url, headers={'Authorization':'Bearer '+os.environ['SIPTRACE_BENCH_KEY']})
with urllib.request.urlopen(req, timeout=45) as res:
    rows = {row['RequestId']: row for row in csv.DictReader(io.StringIO(res.read().decode('utf-8-sig'))) if row.get('RequestId') in ids}
(root/'billing.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'{len(rows)}/{len(ids)} billing entries')
