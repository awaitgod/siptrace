from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont
import html,json
root=Path(__file__).resolve().parent
tasks=json.loads((root/'tasks.json').read_text(encoding='utf-8-sig'))
models=['claude-haiku-5.5','deepseek-v4.1-flash-1017']
cards=['<!doctype html><meta charset="utf-8"><title>SIPTrace · Сравнение схем и плат</title><style>body{font:16px system-ui;margin:24px;background:#15191e;color:#e6edf3}section{border-top:1px solid #45505d;margin-top:24px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}img{display:block;width:100%;background:#fff}figure{margin:8px 0}a{color:#9dc9fb}</style><h1>Схемы и платы двух моделей</h1>']
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',22)
for group in (0,1):
    image=Image.new('RGB',(1200, len(tasks[group*5:group*5+5])*395),'#182028')
    canvas=ImageDraw.Draw(image)
    for index,task in enumerate(tasks[group*5:group*5+5]):
        y=index*395
        canvas.text((10,y+4),task['id']+' · '+task['name'],font=font,fill='white')
        cards.append('<section><h2>'+html.escape(task['name'])+'</h2><main>')
        for col,model in enumerate(models):
            folder=root/'runs'/task['id']/model
            result=folder/'run.json'
            captures=json.loads(result.read_text(encoding='utf-8')).get('captures',[]) if result.exists() else []
            audit = folder/'audit-captures.json'
            if audit.exists():
                captures += [dict(item, label=item['label']+' · снимок аудита') for item in json.loads(audit.read_text(encoding='utf-8'))]
            canvas.text((10+600*col,y+32),model,font=font,fill='white')
            cards.append('<article><h3>'+model+'</h3>')
            if not captures:
                cards.append('<p>Финальный снимок отсутствует.</p>')
                canvas.text((10+600*col,y+70),'Финальный снимок отсутствует',font=font,fill='#f2bf8a')
            for n,c in enumerate(captures):
                p=folder/c['file']
                if not p.exists():continue
                src=p.relative_to(root).as_posix()
                label=html.escape(c['label'])
                cards.append(f'<figure><a href="{src}"><img loading="lazy" src="{src}" alt="{label}"></a><figcaption>{label}</figcaption></figure>')
                w=580//len(captures)
                thumbnail=ImageOps.contain(Image.open(p).convert('RGB'),(w-4,326))
                image.paste(thumbnail,(10+600*col+w*n,y+62))
                if 'audit-final' in c['file']:
                    canvas.text((10+600*col+w*n,y+62),'Аудит',font=font,fill='#146839',stroke_width=1,stroke_fill='white')
            for f,label in [('schematic.gostsch','Схема'),('board.gostpcb','Плата'),('run.json','Журнал')]:
                p=folder/f
                if p.exists():cards.append(f'<a href="{p.relative_to(root).as_posix()}">{label}</a> · ')
            cards.append('</article>')
        cards.append('</main></section>')
    image.save(root/f'overview-{group+1}.png')
(root/'GALLERY.html').write_text('\n'.join(cards),encoding='utf-8')
