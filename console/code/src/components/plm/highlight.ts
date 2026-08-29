/**
 * Syntax highlighter for PLM languages.
 * Tokenizes source based on the language's lexer config and produces
 * HTML spans with token-class names.
 *
 * We deliberately DON'T use a regex-driven highlighter (to stay consistent
 * with PLM's "no regex" philosophy). Instead, we use a small character-based
 * state machine.
 */

import { PlmConfig } from '@/lib/plm/config';

export interface HighlightToken {
  text: string;
  className: string;
}

const KEYWORD_CLASS = 'tok-keyword';
const DEFAULT_CLASS = 'tok-op';

/**
 * Highlight source code based on a PLM config's token rules.
 */
export function highlightSource(src: string, cfg: PlmConfig): HighlightToken[] {
  const result: HighlightToken[] = [];
  const literalTokens = cfg.lexer.tokens
    .filter((t) => t.kind === 'literal' && t.literal)
    .sort((a, b) => (b.literal!.length - a.literal!.length));
  const keywords = cfg.lexer.keywords ?? {};
  const wsChars = expandChars(cfg.lexer.whitespace ?? [' ', '\t', '\n', '\r']);
  const lineComment = cfg.lexer.comments?.line;
  const blockStart = cfg.lexer.comments?.blockStart;
  const blockEnd = cfg.lexer.comments?.blockEnd;

  // Collect all identifier start chars and continue chars from ident rules.
  let identStart = '';
  let identCont = '';
  for (const t of cfg.lexer.tokens) {
    if (t.kind === 'ident') {
      identStart += charsToString(t.startChars);
      identCont += charsToString(t.continueChars ?? t.startChars);
    }
  }

  const classify = (tokenName: string, text: string): string => {
    // Check keywords first.
    if (text in keywords) return KEYWORD_CLASS;
    const lower = text.toLowerCase();
    // Common keyword-like tokens.
    if (['true', 'false', 'null', 'nil', 'none', 'let', 'fn', 'func', 'def', 'return', 'if', 'else', 'elif', 'while', 'for', 'in', 'range', 'case', 'of', 'lambda', 'define', 'begin', 'cond', 'quote', 'and', 'or', 'not', 'int', 'break', 'continue', 'pass', 'import', 'from', 'class', 'struct'].includes(lower)) {
      return KEYWORD_CLASS;
    }
    if (tokenName === 'NUMBER') return 'tok-number';
    if (tokenName === 'STRING') return 'tok-string';
    if (tokenName === 'IDENT' || tokenName === 'SYMBOL') return 'tok-var';
    // Operators
    if (['PLUS','MINUS','STAR','SLASH','PERCENT','EQUAL','EQEQ','NEQ','LT','GT','LTE','GTE','AND','OR','BANG','ARROW','LAMBDA','PLUSPLUS','MINUSMINUS'].includes(tokenName)) return 'tok-op';
    // Punctuation
    if (['LPAREN','RPAREN','LBRACE','RBRACE','LBRACKET','RBRACKET','COMMA','SEMICOLON','COLON','DOT','PIPE','QUOTE'].includes(tokenName)) return 'tok-punct';
    // Boolean literals
    if (tokenName === 'TRUE' || tokenName === 'FALSE' || tokenName === 'BOOL_T' || tokenName === 'BOOL_F') return KEYWORD_CLASS;
    if (tokenName === 'NULL' || tokenName === 'NIL' || tokenName === 'NONE') return KEYWORD_CLASS;
    // Brainfuck commands
    if (['INC_PTR','DEC_PTR','INC_VAL','DEC_VAL','OUTPUT','INPUT','LOOP_START','LOOP_END'].includes(tokenName)) return KEYWORD_CLASS;
    return DEFAULT_CLASS;
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i];

    // Whitespace
    if (wsChars.has(c.charCodeAt(0))) {
      let j = i + 1;
      while (j < src.length && wsChars.has(src.charCodeAt(j))) j++;
      result.push({ text: src.slice(i, j), className: '' });
      i = j;
      continue;
    }

    // Line comment
    if (lineComment && src.startsWith(lineComment, i)) {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? src.length : end;
      result.push({ text: src.slice(i, stop), className: 'tok-comment' });
      i = stop;
      continue;
    }

    // Block comment
    if (blockStart && src.startsWith(blockStart, i)) {
      const endIdx = blockEnd ? src.indexOf(blockEnd, i + blockStart.length) : -1;
      const stop = endIdx < 0 ? src.length : endIdx + blockEnd!.length;
      result.push({ text: src.slice(i, stop), className: 'tok-comment' });
      i = stop;
      continue;
    }

    // Literal tokens (longest first)
    let matched = false;
    for (const t of literalTokens) {
      if (src.startsWith(t.literal!, i)) {
        result.push({ text: t.literal!, className: classify(t.name, t.literal!) });
        i += t.literal!.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Number
    if (c >= '0' && c <= '9') {
      let j = i + 1;
      while (j < src.length && src[j] >= '0' && src[j] <= '9') j++;
      if (src[j] === '.' && src[j + 1] >= '0' && src[j + 1] <= '9') {
        j++;
        while (j < src.length && src[j] >= '0' && src[j] <= '9') j++;
      }
      result.push({ text: src.slice(i, j), className: 'tok-number' });
      i = j;
      continue;
    }

    // String (both " and ')
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      while (j < src.length && src[j] !== q) {
        if (src[j] === '\\') j++;
        j++;
      }
      j++;
      result.push({ text: src.slice(i, Math.min(j, src.length)), className: 'tok-string' });
      i = j;
      continue;
    }

    // Identifier / keyword
    if (identStart.includes(c) || isAlpha(c)) {
      let j = i + 1;
      while (j < src.length && (identCont.includes(src[j]) || isAlphaNum(src[j]))) j++;
      const text = src.slice(i, j);
      result.push({ text, className: classify('IDENT', text) });
      i = j;
      continue;
    }

    // Single unknown char
    result.push({ text: c, className: DEFAULT_CLASS });
    i++;
  }

  return result;
}

function isAlpha(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}

function isAlphaNum(c: string): boolean {
  return isAlpha(c) || (c >= '0' && c <= '9');
}

function charsToString(cc: any): string {
  if (!cc) return '';
  const parts = Array.isArray(cc) ? cc : [cc];
  let result = '';
  for (const p of parts) {
    if (typeof p !== 'string') continue;
    if (p.length === 3 && p[1] === '-') {
      const lo = p.charCodeAt(0);
      const hi = p.charCodeAt(2);
      for (let c = lo; c <= hi; c++) result += String.fromCharCode(c);
    } else {
      result += p;
    }
  }
  return result;
}

function expandChars(cc: any): Set<number> {
  const set = new Set<number>();
  const parts = Array.isArray(cc) ? cc : [cc];
  for (const p of parts) {
    if (typeof p !== 'string') continue;
    if (p.length === 3 && p[1] === '-') {
      const lo = p.charCodeAt(0);
      const hi = p.charCodeAt(2);
      for (let c = lo; c <= hi; c++) set.add(c);
    } else {
      for (let i = 0; i < p.length; i++) set.add(p.charCodeAt(i));
    }
  }
  return set;
}

/**
 * Convert tokens to an HTML string for dangerouslySetInnerHTML.
 */
export function tokensToHtml(tokens: HighlightToken[]): string {
  return tokens
    .map((t) => {
      const cls = t.className ? ` class="${t.className}"` : '';
      return `<span${cls}>${escapeHtml(t.text)}</span>`;
    })
    .join('');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
