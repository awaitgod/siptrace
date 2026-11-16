/**
 * Zero-dependency S-Expression parser supporting DipTrace ASCII (.asc/.dch/.dip/.eli/.lib),
 * KiCad S-expression (.kicad_sch/.kicad_pcb/.kicad_sym/.kicad_mod), and P-CAD/OrCAD EDIF formats.
 */

export type SExprNode = string | SExprList;
export type SExprList = SExprNode[];

export function parseSExpressions(input: string): SExprList[] {
  const roots: SExprList[] = [];
  const stack: SExprList[] = [];
  let i = 0;
  const n = input.length;

  const pushAtom = (atom: string) => {
    if (stack.length > 0) {
      stack[stack.length - 1].push(atom);
    }
  };

  while (i < n) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i++;
      continue;
    }
    if (ch === ';') {
      while (i < n && input[i] !== '\n') i++;
      continue;
    }
    if (ch === '(') {
      const list: SExprList = [];
      if (stack.length > 0) {
        stack[stack.length - 1].push(list);
      } else {
        roots.push(list);
      }
      stack.push(list);
      i++;
      continue;
    }
    if (ch === ')') {
      if (stack.length > 0) stack.pop();
      i++;
      continue;
    }
    if (ch === '"') {
      i++;
      let s = '';
      while (i < n) {
        const c = input[i];
        if (c === '\\' && i + 1 < n) {
          const nxt = input[i + 1];
          s += nxt === 'n' ? '\n' : nxt === 't' ? '\t' : nxt;
          i += 2;
          continue;
        }
        if (c === '"') {
          i++;
          break;
        }
        s += c;
        i++;
      }
      pushAtom(s);
      continue;
    }
    let atom = '';
    while (i < n) {
      const c = input[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '(' || c === ')') break;
      atom += c;
      i++;
    }
    if (atom.length > 0) pushAtom(atom);
  }
  return roots;
}

export function sxTag(node: SExprNode | undefined): string {
  return Array.isArray(node) && typeof node[0] === 'string' ? node[0] : '';
}

export function sxFind(list: SExprList, tag: string): SExprList | undefined {
  for (const child of list) {
    if (Array.isArray(child) && child[0] === tag) return child;
  }
  return undefined;
}

export function sxFindAll(list: SExprList, tag: string): SExprList[] {
  const out: SExprList[] = [];
  for (const child of list) {
    if (Array.isArray(child) && child[0] === tag) out.push(child);
  }
  return out;
}

export function sxStr(list: SExprList | undefined, index = 1, fallback = ''): string {
  if (!list || index >= list.length) return fallback;
  const v = list[index];
  return typeof v === 'string' ? v : fallback;
}

export function sxNum(list: SExprList | undefined, index = 1, fallback = 0): number {
  const s = sxStr(list, index, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
}

export function sxWalk(node: SExprNode, visitor: (list: SExprList) => void): void {
  if (!Array.isArray(node)) return;
  visitor(node);
  for (const ch of node) {
    if (Array.isArray(ch)) sxWalk(ch, visitor);
  }
}
