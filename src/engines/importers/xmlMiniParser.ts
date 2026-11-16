/**
 * Lightweight zero-dependency XML tree parser working identically in Node.js (Vitest)
 * and Browser environments (for Eagle, DipTrace XML, Proteus XML).
 */

export interface MiniXmlNode {
  tag: string;
  attrs: Record<string, string>;
  text: string;
  children: MiniXmlNode[];
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parseMiniXml(xml: string): MiniXmlNode | null {
  const cleaned = xml
    .replace(/^\uFEFF/, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '');

  const stack: MiniXmlNode[] = [];
  let root: MiniXmlNode | null = null;
  let pos = 0;

  while (pos < cleaned.length) {
    const lt = cleaned.indexOf('<', pos);
    if (lt < 0) break;
    if (lt > pos && stack.length > 0) {
      const txt = cleaned.slice(pos, lt).trim();
      if (txt) stack[stack.length - 1].text += (stack[stack.length - 1].text ? ' ' : '') + decodeXmlEntities(txt);
    }
    const gt = cleaned.indexOf('>', lt + 1);
    if (gt < 0) break;
    const rawTag = cleaned.slice(lt + 1, gt).trim();
    pos = gt + 1;

    if (!rawTag || rawTag.startsWith('!') || rawTag.startsWith('?')) continue;

    if (rawTag.startsWith('/')) {
      const closeName = rawTag.slice(1).trim();
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].tag === closeName) {
          stack.length = k;
          break;
        }
      }
      continue;
    }

    const selfClosing = rawTag.endsWith('/');
    const body = selfClosing ? rawTag.slice(0, -1).trim() : rawTag;
    const spaceIdx = body.search(/[\s\r\n]/);
    const tag = spaceIdx < 0 ? body : body.slice(0, spaceIdx);
    const attrStr = spaceIdx < 0 ? '' : body.slice(spaceIdx + 1);

    const attrs: Record<string, string> = {};
    const attrRe = /([A-Za-z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(attrStr)) !== null) {
      attrs[m[1]] = decodeXmlEntities(m[2] ?? m[3] ?? '');
    }

    const node: MiniXmlNode = { tag, attrs, text: '', children: [] };
    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    } else {
      root = node;
    }
    if (!selfClosing) stack.push(node);
  }
  return root;
}

export function xmlFindAll(node: MiniXmlNode | null, tag: string): MiniXmlNode[] {
  if (!node) return [];
  const out: MiniXmlNode[] = [];
  const visit = (cur: MiniXmlNode) => {
    if (cur.tag === tag) out.push(cur);
    for (const ch of cur.children) visit(ch);
  };
  visit(node);
  return out;
}

export function xmlFindFirst(node: MiniXmlNode | null, tag: string): MiniXmlNode | undefined {
  if (!node) return undefined;
  if (node.tag === tag) return node;
  for (const ch of node.children) {
    const f = xmlFindFirst(ch, tag);
    if (f) return f;
  }
  return undefined;
}
