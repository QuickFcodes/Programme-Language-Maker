/**
 * Configurable lexer driven by PLM config.
 *
 * No regex anywhere. We use explicit character-class matching.
 */

import { LexerConfig, TokenRule, CharClass } from './config';

export interface Token {
  type: string;
  /** Raw source text. */
  text: string;
  /** For STRING tokens, the unescaped string value. */
  value?: string | number | boolean;
  line: number;
  col: number;
  offset: number;
}

export class LexError extends Error {
  constructor(
    message: string,
    public line: number,
    public col: number,
    public offset: number
  ) {
    super(`Lex error at ${line}:${col}: ${message}`);
    this.name = 'LexError';
  }
}

// ---------------------------------------------------------------------------
// Char class utilities
// ---------------------------------------------------------------------------

/** Expand a CharClass into a Set<number> of char codes. */
function expandClass(cc: CharClass): Set<number> {
  const set = new Set<number>();
  const parts = Array.isArray(cc) ? cc : [cc];
  for (const p of parts) {
    if (typeof p !== 'string') continue;
    // Range form: "a-z"
    if (p.length === 3 && p[1] === '-') {
      const lo = p.charCodeAt(0);
      const hi = p.charCodeAt(2);
      for (let c = lo; c <= hi; c++) set.add(c);
    } else {
      // Literal characters in the string.
      for (let i = 0; i < p.length; i++) set.add(p.charCodeAt(i));
    }
  }
  return set;
}

function inClass(cc: Set<number>, ch: string): boolean {
  if (!ch) return false;
  return cc.has(ch.charCodeAt(0));
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

export class Lexer {
  private ws: Set<number> | null;
  private commentLine: string | null;
  private commentBlockStart: string | null;
  private commentBlockEnd: string | null;
  private literals: { name: string; text: string }[];
  private ruleMap: TokenRule[];
  private keywords: Record<string, string>;

  constructor(private cfg: LexerConfig) {
    this.ws = cfg.whitespace ? expandClass(cfg.whitespace) : null;
    this.commentLine = cfg.comments?.line ?? null;
    this.commentBlockStart = cfg.comments?.blockStart ?? null;
    this.commentBlockEnd = cfg.comments?.blockEnd ?? null;
    this.keywords = cfg.keywords ?? {};
    this.literals = cfg.tokens
      .filter((t) => t.kind === 'literal' && t.literal)
      .map((t) => ({ name: t.name, text: t.literal! }))
      // Longer literals first so "==" beats "=".
      .sort((a, b) => b.text.length - a.text.length);
    this.ruleMap = cfg.tokens;
  }

  tokenize(src: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    let line = 1;
    let col = 1;

    const advance = (n: number) => {
      for (let k = 0; k < n; k++) {
        const c = src[i + k];
        if (c === '\n') {
          line++;
          col = 1;
        } else {
          col++;
        }
      }
      i += n;
    };

    while (i < src.length) {
      // Whitespace
      if (this.ws && inClass(this.ws, src[i])) {
        advance(1);
        continue;
      }
      // Line comment
      if (this.commentLine && src.startsWith(this.commentLine, i)) {
        const end = src.indexOf('\n', i);
        if (end < 0) {
          advance(src.length - i);
        } else {
          advance(end - i + 1);
        }
        continue;
      }
      // Block comment
      if (this.commentBlockStart && src.startsWith(this.commentBlockStart, i)) {
        const endIdx = this.commentBlockEnd
          ? src.indexOf(this.commentBlockEnd, i + this.commentBlockStart.length)
          : -1;
        if (endIdx < 0) {
          throw new LexError('Unterminated block comment', line, col, i);
        }
        advance(endIdx + this.commentBlockEnd!.length - i);
        continue;
      }

      const startLine = line;
      const startCol = col;
      const startOff = i;

      // Try literals first (longest match wins).
      let matched: Token | null = null;
      for (const lit of this.literals) {
        if (src.startsWith(lit.text, i)) {
          matched = {
            type: lit.name,
            text: lit.text,
            line: startLine,
            col: startCol,
            offset: startOff,
          };
          advance(lit.text.length);
          break;
        }
      }
      if (matched) {
        tokens.push(matched);
        continue;
      }

      // Try each non-literal rule.
      let handled = false;
      for (const rule of this.ruleMap) {
        if (rule.kind === 'literal') continue;
        const result = this.tryMatch(src, i, rule, startLine, startCol, startOff);
        if (result) {
          advance(result.consumed);
          if (!rule.ignore) {
            tokens.push(result.token);
          }
          handled = true;
          break;
        }
      }
      if (!handled) {
        // Skip unknown char to make progress, but report an error.
        throw new LexError(
          `Unexpected character '${src[i]}' (0x${src.charCodeAt(i).toString(16)})`,
          line,
          col,
          i
        );
      }
    }

    // EOF token
    tokens.push({
      type: 'EOF',
      text: '',
      line,
      col,
      offset: i,
    });
    return tokens;
  }

  private tryMatch(
    src: string,
    i: number,
    rule: TokenRule,
    line: number,
    col: number,
    offset: number
  ): { token: Token; consumed: number } | null {
    if (rule.kind === 'number') {
      const digits = rule.digits ? expandClass(rule.digits) : expandClass('0-9');
      let j = i;
      while (j < src.length && inClass(digits, src[j])) j++;
      if (j === i) return null;
      // Optional fractional part: "." digits
      if (src[j] === '.' && inClass(digits, src[j + 1] ?? '')) {
        j++;
        while (j < src.length && inClass(digits, src[j])) j++;
      }
      const text = src.slice(i, j);
      const value = text.includes('.') ? parseFloat(text) : parseInt(text, 10);
      // Check for keyword replacement (numbers can't be keywords, but for safety skip).
      return {
        token: { type: rule.name, text, value, line, col, offset },
        consumed: j - i,
      };
    }

    if (rule.kind === 'string') {
      const startQ = rule.startQuote!;
      if (!src.startsWith(startQ, i)) return null;
      const endQ = rule.endQuote ?? startQ;
      const esc = rule.escape ?? '\\';
      let j = i + startQ.length;
      let value = '';
      while (j < src.length) {
        if (src.startsWith(endQ, j)) {
          j += endQ.length;
          return {
            token: {
              type: rule.name,
              text: src.slice(i, j),
              value,
              line,
              col,
              offset,
            },
            consumed: j - i,
          };
        }
        if (src[j] === esc) {
          const next = src[j + 1];
          if (next === 'n') value += '\n';
          else if (next === 't') value += '\t';
          else if (next === 'r') value += '\r';
          else if (next === '\\') value += '\\';
          else if (next === endQ[0]) value += endQ[0];
          else value += next ?? '';
          j += 2;
          continue;
        }
        if (src[j] === '\n') {
          throw new LexError(`Unterminated string`, line, col, offset);
        }
        value += src[j];
        j++;
      }
      throw new LexError(`Unterminated string`, line, col, offset);
    }

    if (rule.kind === 'ident') {
      const startChars = rule.startChars ? expandClass(rule.startChars) : null;
      if (!startChars || !inClass(startChars, src[i])) return null;
      const contChars = rule.continueChars
        ? expandClass(rule.continueChars)
        : startChars;
      let j = i + 1;
      while (j < src.length && inClass(contChars, src[j])) j++;
      const text = src.slice(i, j);
      // Keyword check
      const keywordType = this.keywords[text];
      const type = keywordType ?? rule.name;
      return {
        token: { type, text, value: text, line, col, offset },
        consumed: j - i,
      };
    }

    return null;
  }
}
