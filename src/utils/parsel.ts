// Port of parsel.js - CSS selector parser
// Original: /snip-extension/js/parsel.js (433 lines)
// This is a direct port to ES module with TypeScript types

export interface Token {
  type: string;
  content: string;
  name?: string;
  namespace?: string;
  value?: string;
  operator?: string;
  argument?: string;
  caseSensitive?: string;
  pos: [number, number];
  subtree?: ASTNode;
  index?: string;
}

export type ASTNode =
  | Token
  | { type: 'list'; list: ASTNode[] }
  | { type: 'complex'; combinator: string; left: ASTNode; right: ASTNode }
  | { type: 'relative'; combinator: string; right: ASTNode }
  | { type: 'compound'; list: Token[] };

const TOKENS: Record<string, RegExp> = {
  attribute: /\[\s*(?:(?<namespace>\*|[-\w\P{ASCII}]*)\|)?(?<name>[-\w\P{ASCII}]+)\s*(?:(?<operator>\W?=)\s*(?<value>.+?)\s*(\s(?<caseSensitive>[iIsS]))?\s*)?\]/gu,
  id: /#(?<name>[-\w\P{ASCII}]+)/gu,
  class: /\.(?<name>[-\w\P{ASCII}]+)/gu,
  comma: /\s*,\s*/g,
  combinator: /\s*[\s>+~]\s*/g,
  'pseudo-element': /::(?<name>[-\w\P{ASCII}]+)(?:\((?<argument>\xB6*)\))?/gu,
  'pseudo-class': /:(?<name>[-\w\P{ASCII}]+)(?:\((?<argument>\xB6*)\))?/gu,
  universal: /(?:(?<namespace>\*|[-\w\P{ASCII}]*)\|)?\*/gu,
  type: /(?:(?<namespace>\*|[-\w\P{ASCII}]*)\|)?(?<name>[-\w\P{ASCII}]+)/gu,
};

const TRIM_TOKENS = new Set(['combinator', 'comma']);

export const RECURSIVE_PSEUDO_CLASSES = new Set([
  'not', 'is', 'where', 'has', 'matches',
  '-moz-any', '-webkit-any', 'nth-child', 'nth-last-child',
]);

const nthChildRegExp = /(?<index>[\dn+-]+)\s+of\s+(?<subtree>.+)/;

const RECURSIVE_PSEUDO_CLASSES_ARGS: Record<string, RegExp> = {
  'nth-child': nthChildRegExp,
  'nth-last-child': nthChildRegExp,
};

const getArgumentPatternByType = (type: string): RegExp => {
  switch (type) {
    case 'pseudo-element':
    case 'pseudo-class':
      return new RegExp(TOKENS[type].source.replace('(?<argument>\xB6*)', '(?<argument>.*)'), 'gu');
    default:
      return TOKENS[type];
  }
};

function gobbleParens(text: string, offset: number): string {
  let nesting = 0;
  let result = '';
  for (; offset < text.length; offset++) {
    const char = text[offset];
    if (char === '(') ++nesting;
    else if (char === ')') --nesting;
    result += char;
    if (nesting === 0) return result;
  }
  return result;
}

function tokenizeBy(text: string, grammar: Record<string, RegExp> = TOKENS): (string | Token)[] {
  if (!text) return [];

  const tokens: (string | Token)[] = [text];

  for (const [type, pattern] of Object.entries(grammar)) {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (typeof token !== 'string') continue;

      pattern.lastIndex = 0;
      const match = pattern.exec(token);
      if (!match) continue;

      const from = match.index - 1;
      const args: (string | Token)[] = [];
      const content = match[0];
      const before = token.slice(0, from + 1);
      if (before) args.push(before);

      args.push({
        ...match.groups,
        type,
        content,
        pos: [0, 0],
      } as Token);

      const after = token.slice(from + content.length + 1);
      if (after) args.push(after);

      tokens.splice(i, 1, ...args);
    }
  }

  let offset = 0;
  for (const token of tokens) {
    if (typeof token === 'string') {
      throw new Error(`Unexpected sequence ${token} found at index ${offset}`);
    }
    offset += token.content.length;
    token.pos = [offset - token.content.length, offset];
    if (TRIM_TOKENS.has(token.type)) {
      token.content = token.content.trim() || ' ';
    }
  }

  return tokens;
}

const STRING_PATTERN = /(['"])([^\\\n]+?)\1/g;
const ESCAPE_PATTERN = /\\./g;

export function tokenize(selector: string, grammar: Record<string, RegExp> = TOKENS): Token[] {
  selector = selector.trim();
  if (selector === '') return [];

  const replacements: { value: string; offset: number }[] = [];

  selector = selector.replace(ESCAPE_PATTERN, (value, offset) => {
    replacements.push({ value, offset });
    return '\uE000'.repeat(value.length);
  });

  selector = selector.replace(STRING_PATTERN, (value, _quote, content, offset) => {
    replacements.push({ value, offset });
    return `${_quote}${'\uE001'.repeat(content.length)}${_quote}`;
  });

  {
    let pos = 0;
    let offset;
    while ((offset = selector.indexOf('(', pos)) > -1) {
      const value = gobbleParens(selector, offset);
      replacements.push({ value, offset });
      selector = `${selector.substring(0, offset)}(${'¶'.repeat(value.length - 2)})${selector.substring(offset + value.length)}`;
      pos = offset + value.length;
    }
  }

  const tokens = tokenizeBy(selector, grammar) as Token[];

  const changedTokens = new Set<Token>();
  for (const replacement of replacements.reverse()) {
    for (const token of tokens) {
      const { offset, value } = replacement;
      if (!(token.pos[0] <= offset && offset + value.length <= token.pos[1])) continue;

      const { content } = token;
      const tokenOffset = offset - token.pos[0];
      token.content = content.slice(0, tokenOffset) + value + content.slice(tokenOffset + value.length);
      if (token.content !== content) changedTokens.add(token);
    }
  }

  for (const token of changedTokens) {
    const pattern = getArgumentPatternByType(token.type);
    if (!pattern) throw new Error(`Unknown token type: ${token.type}`);
    pattern.lastIndex = 0;
    const match = pattern.exec(token.content);
    if (!match) throw new Error(`Unable to parse content for ${token.type}: ${token.content}`);
    Object.assign(token, match.groups);
  }

  return tokens;
}

function nestTokens(tokens: Token[], { list = true } = {}): ASTNode {
  if (list && tokens.find(t => t.type === 'comma')) {
    const selectors: ASTNode[] = [];
    const temp: Token[] = [];
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'comma') {
        if (temp.length === 0) throw new Error('Incorrect comma at ' + i);
        selectors.push(nestTokens(temp, { list: false }));
        temp.length = 0;
      } else {
        temp.push(tokens[i]);
      }
    }
    if (temp.length === 0) throw new Error('Trailing comma');
    selectors.push(nestTokens(temp, { list: false }));
    return { type: 'list', list: selectors };
  }

  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    if (token.type === 'combinator') {
      const left = tokens.slice(0, i);
      const right = tokens.slice(i + 1);
      if (left.length === 0) {
        return { type: 'relative', combinator: token.content, right: nestTokens(right) };
      }
      return {
        type: 'complex',
        combinator: token.content,
        left: nestTokens(left),
        right: nestTokens(right),
      };
    }
  }

  switch (tokens.length) {
    case 0: throw new Error('Could not build AST.');
    case 1: return tokens[0];
    default: return { type: 'compound', list: [...tokens] };
  }
}

export function* flatten(node: ASTNode, parent?: ASTNode): Generator<[Token, ASTNode | undefined]> {
  switch (node.type) {
    case 'list':
      for (const child of (node as { type: 'list'; list: ASTNode[] }).list) {
        yield* flatten(child, node);
      }
      break;
    case 'complex':
      yield* flatten((node as any).left, node);
      yield* flatten((node as any).right, node);
      break;
    case 'relative':
      yield* flatten((node as any).right, node);
      break;
    case 'compound':
      for (const token of (node as { type: 'compound'; list: Token[] }).list) {
        yield [token, node];
      }
      break;
    default:
      yield [node as Token, parent];
  }
}

export function walk(node: ASTNode, visit: (token: Token, ast: ASTNode | undefined) => void, parent?: ASTNode): void {
  if (!node) return;
  for (const [token, ast] of flatten(node, parent)) {
    visit(token, ast);
  }
}

export function parse(selector: string, { recursive = true, list = true } = {}): ASTNode | undefined {
  const tokens = tokenize(selector);
  if (!tokens || tokens.length === 0) return undefined;

  const ast = nestTokens(tokens, { list });

  if (!recursive) return ast;

  for (const [token] of flatten(ast)) {
    if (token.type !== 'pseudo-class' || !token.argument) continue;
    if (!RECURSIVE_PSEUDO_CLASSES.has(token.name || '')) continue;

    let argument = token.argument;
    const childArg = RECURSIVE_PSEUDO_CLASSES_ARGS[token.name || ''];
    if (childArg) {
      const match = childArg.exec(argument);
      if (!match) continue;
      Object.assign(token, match.groups);
      argument = match.groups?.['subtree'] || '';
    }
    if (!argument) continue;

    Object.assign(token, {
      subtree: parse(argument, { recursive: true, list: true }),
    });
  }

  return ast;
}

export function stringify(listOrNode: Token[] | ASTNode): string {
  if (Array.isArray(listOrNode)) {
    return listOrNode.map(token => token.content).join('');
  }

  switch (listOrNode.type) {
    case 'list':
      return (listOrNode as { type: 'list'; list: ASTNode[] }).list.map(stringify).join(',');
    case 'relative':
      return (listOrNode as any).combinator + stringify((listOrNode as any).right);
    case 'complex':
      return stringify((listOrNode as any).left) + (listOrNode as any).combinator + stringify((listOrNode as any).right);
    case 'compound':
      return (listOrNode as { type: 'compound'; list: Token[] }).list.map(stringify).join('');
    default:
      return (listOrNode as Token).content;
  }
}

export function specificityToNumber(spec: number[], base?: number): number {
  base = base || Math.max(...spec) + 1;
  return spec[0] * (base << 1) + spec[1] * base + spec[2];
}

export function specificity(selector: string | ASTNode): number[] {
  let ast = selector;
  if (typeof ast === 'string') {
    ast = parse(ast, { recursive: true })!;
  }
  if (!ast) return [];

  if (ast.type === 'list' && 'list' in ast) {
    let base = 10;
    const listNode = ast as { type: 'list'; list: ASTNode[] };
    const specificities = listNode.list.map(a => {
      const sp = specificity(a);
      base = Math.max(base, ...specificity(a));
      return sp;
    });
    const numbers = specificities.map(s => specificityToNumber(s, base));
    return specificities[numbers.indexOf(Math.max(...numbers))];
  }

  const ret = [0, 0, 0];

  for (const [token] of flatten(ast)) {
    switch (token.type) {
      case 'id':
        ret[0]++;
        break;
      case 'class':
      case 'attribute':
        ret[1]++;
        break;
      case 'pseudo-element':
      case 'type':
        ret[2]++;
        break;
      case 'pseudo-class':
        if (token.name === 'where') break;
        if (!RECURSIVE_PSEUDO_CLASSES.has(token.name || '') || !token.subtree) {
          ret[1]++;
          break;
        }
        const sub = specificity(token.subtree);
        sub.forEach((s, i) => (ret[i] += s));
        if (token.name === 'nth-child' || token.name === 'nth-last-child') {
          ret[1]++;
        }
    }
  }

  return ret;
}
