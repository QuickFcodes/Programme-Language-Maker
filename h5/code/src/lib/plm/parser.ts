/**
 * Configurable recursive-descent parser driven by PLM grammar config.
 *
 * Builds an AST whose nodes are shaped like:
 *   { type: "BinaryExpr", fields: { left: <node>, op: "+", right: <node> } }
 * Plus a list of "raw" tokens (for nodes that capture token text directly).
 */

import { Token } from './lexer';
import { GrammarConfig, Rule, Atom, AstSpec } from './config';

export interface AstNode {
  type: string;
  fields?: Record<string, any>;
  /** Source line for error reporting. */
  line?: number;
  /** Source column. */
  col?: number;
}

export class ParseError extends Error {
  constructor(
    message: string,
    public line: number,
    public col: number
  ) {
    super(`Parse error at ${line}:${col}: ${message}`);
    this.name = 'ParseError';
  }
}

interface MatchedChild {
  /** The AST node if it was a non-terminal; null if it was a "skip" token. */
  node: AstNode | null;
  /** For quantifier atoms, the list of matched children. */
  list?: AstNode[];
  /** The raw token if it was a terminal. */
  token?: Token;
  /** Whether this child should be captured into the parent AST. */
  captured: boolean;
}

export class Parser {
  private tokens: Token[];
  private pos = 0;
  private rules: Record<string, Rule>;

  constructor(private grammar: GrammarConfig, tokens: Token[]) {
    this.tokens = tokens;
    this.rules = grammar.rules;
  }

  parse(): AstNode {
    const result = this.applyRule(this.grammar.start);
    if (this.peek().type !== 'EOF') {
      throw new ParseError(
        `Unexpected token ${this.peek().type} ('${this.peek().text}')`,
        this.peek().line,
        this.peek().col
      );
    }
    if (!result) {
      throw new ParseError(`Expected ${this.grammar.start}`, 0, 0);
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // Token helpers
  // -----------------------------------------------------------------------

  private peek(): Token {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  private matchToken(type: string, text?: string): Token | null {
    const t = this.peek();
    if (t.type === type && (text === undefined || t.text === text)) {
      return this.consume();
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Rule application
  // -----------------------------------------------------------------------

  private applyRule(name: string): AstNode | null {
    const rule = this.rules[name];
    if (!rule) {
      throw new ParseError(`Undefined grammar rule: ${name}`, 0, 0);
    }
    return this.applyRuleBody(name, rule);
  }

  private applyRuleBody(name: string, rule: Rule): AstNode | null {
    // Normalize rule to either Seq or Choice.
    if (typeof rule === 'string') {
      // Shorthand: a single atom. Wrap into a seq.
      return this.applySeq(name, { type: 'seq', items: [rule] }, [rule]);
    }
    if (rule.type === 'seq') {
      return this.applySeq(name, rule, rule.items);
    }
    if (rule.type === 'choice') {
      return this.applyChoice(name, rule);
    }
    return null;
  }

  private applyChoice(name: string, rule: any): AstNode | null {
    const start = this.pos;
    for (const option of rule.options) {
      const items = Array.isArray(option) ? option : [option];
      try {
        let node: AstNode | null;
        if (option && typeof option === 'object' && option.type === 'seq' && option.ast) {
          node = this.applySeq(name, option, option.items);
        } else if (
          option &&
          typeof option === 'object' &&
          !option.type &&
          option.ref &&
          !option.quant
        ) {
          // Single atom ref — pass through directly (no __seq__ wrapper).
          const m = this.applyAtom(option);
          node = m?.node ?? null;
        } else if (typeof option === 'string' && !option.endsWith('*') && !option.endsWith('+') && !option.endsWith('?')) {
          // Bare string atom — could be a rule ref or token. Try as rule first.
          if (this.rules[option]) {
            node = this.applyRule(option);
          } else {
            const m = this.applyAtom(option);
            node = m?.node ?? (m?.token ? this.tokenToNode(m.token) : null);
          }
        } else {
          node = this.trySeq(items);
        }
        if (node !== null) {
          if (rule.ast) {
            return this.buildAst(rule.ast, [{ node, captured: true }]);
          }
          return node;
        }
      } catch (e) {
        this.pos = start;
      }
    }
    this.pos = start;
    return null;
  }

  private trySeq(items: Atom[]): AstNode | null {
    const start = this.pos;
    const children: MatchedChild[] = [];
    let allMatched = true;
    for (const atom of items) {
      const m = this.applyAtom(atom);
      if (m === null) {
        // Atom didn't match.
        // If it was a * or ? quantifier, that's fine.
        // But applyAtom already handles quantifiers internally, so null here
        // means a required atom failed.
        allMatched = false;
        break;
      }
      children.push(m);
    }
    if (!allMatched) {
      this.pos = start;
      return null;
    }
    // Build a synthetic AST node from the seq itself.
    return this.buildSeqNode(children);
  }

  private buildSeqNode(children: MatchedChild[]): AstNode {
    // Collect captured children into a list.
    const captured: MatchedChild[] = children.filter((c) => c.captured);
    return {
      type: '__seq__',
      fields: {
        __children__: captured.map((c) => c.node ?? (c.token ? this.tokenToNode(c.token) : null)),
      },
    };
  }

  private tokenToNode(t: Token): AstNode {
    return {
      type: 'Token',
      fields: {
        tokenType: t.type,
        text: t.text,
        value: t.value,
      },
      line: t.line,
      col: t.col,
    };
  }

  private applySeq(
    ruleName: string,
    rule: any,
    items: Atom[]
  ): AstNode | null {
    const start = this.pos;
    const children: MatchedChild[] = [];
    for (const atom of items) {
      const m = this.applyAtom(atom);
      if (m === null) {
        this.pos = start;
        return null;
      }
      children.push(m);
    }
    // If the rule has an AST spec, build it.
    if (rule.ast) {
      return this.buildAst(rule.ast, children);
    }
    // Default: build a node named after the rule, with captured children
    // as positional fields.
    const captured = children.filter((c) => c.captured);
    if (captured.length === 1 && captured[0].node) {
      // Pass through single-child nodes (for transparent rules).
      // But tag the node with this rule's name for clarity.
      const child = captured[0].node!;
      if (child.type === '__seq__') {
        // Unwrap.
        child.type = ruleName;
        return child;
      }
      // Otherwise, wrap the single child.
      return {
        type: ruleName,
        fields: { __child__: child },
      };
    }
    // Multiple (or zero) children.
    return {
      type: ruleName,
      fields: {
        __children__: captured.map((c) => c.node ?? (c.token ? this.tokenToNode(c.token) : null)),
      },
    };
  }

  // -----------------------------------------------------------------------
  // Atom application
  // -----------------------------------------------------------------------

  private applyAtom(atom: Atom): MatchedChild | null {
    if (typeof atom === 'string') {
      return this.applyAtomStr(atom, undefined);
    }
    const ref = atom.ref;
    const quant = atom.quant;
    if (quant === '*' || quant === '+') {
      const list: AstNode[] = [];
      let matchedOne = false;
      // Avoid infinite loops on empty matches.
      let lastPos = -1;
      while (true) {
        const m = this.applyAtomStr(ref, atom.astAs);
        if (m === null) break;
        if (this.pos === lastPos) break;
        lastPos = this.pos;
        if (m.node) {
          list.push(m.node);
        } else if (m.token) {
          list.push(this.tokenToNode(m.token));
        }
        matchedOne = true;
      }
      if (quant === '+' && !matchedOne) return null;
      return {
        node: { type: '__list__', fields: { __items__: list } },
        list,
        captured: true,
      };
    }
    if (quant === '?') {
      const m = this.applyAtomStr(ref, atom.astAs);
      if (m === null) {
        return { node: null, captured: false };
      }
      return m;
    }
    return this.applyAtomStr(ref, atom.astAs);
  }

  private applyAtomStr(atom: string, astAs?: string): MatchedChild | null {
    // Check for literal token syntax: "literal"
    if (
      atom.length >= 2 &&
      atom.startsWith('"') &&
      atom.endsWith('"')
    ) {
      const lit = atom.slice(1, -1);
      const t = this.matchToken(undefined as any, lit);
      if (t) {
        return { node: null, token: t, captured: false };
      }
      return null;
    }
    // Quantifier suffix?
    let refName = atom;
    let quant: '*' | '+' | '?' | undefined;
    const lastChar = atom[atom.length - 1];
    if (lastChar === '*' || lastChar === '+' || lastChar === '?') {
      quant = lastChar as any;
      refName = atom.slice(0, -1);
    }
    if (quant) {
      // Recurse with an object atom.
      return this.applyAtom({ ref: refName, quant });
    }
    // Is it a non-terminal rule?
    if (this.rules[refName]) {
      const node = this.applyRule(refName);
      if (node === null) return null;
      return { node, captured: true };
    }
    // Otherwise, treat as a terminal token name.
    const t = this.matchToken(refName);
    if (t) {
      return { node: null, token: t, captured: true };
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // AST construction from AstSpec
  // -----------------------------------------------------------------------

  private buildAst(spec: AstSpec, children: MatchedChild[]): AstNode {
    const fields: Record<string, any> = {};
    if (spec.fields) {
      for (const [name, source] of Object.entries(spec.fields)) {
        if (typeof source === 'number') {
          const child = children[source];
          if (!child) continue;
          if (child.node && child.node.type === '__list__') {
            fields[name] = child.node.fields?.__items__ ?? [];
          } else if (child.list) {
            fields[name] = child.list;
          } else if (child.node) {
            fields[name] = child.node;
          } else if (child.token) {
            fields[name] = this.tokenToNode(child.token);
          }
        } else if (typeof source === 'string') {
          // Literal value injection.
          fields[name] = source;
        } else if (typeof source === 'object' && 'list' in source) {
          const child = children[source.list];
          if (child?.list) {
            fields[name] = child.list;
          } else if (child?.node?.type === '__list__') {
            // __list__ nodes wrap their items in an array-valued field
            // (typically 'items' or '__items__'). Find the first array field.
            const f = child.node.fields ?? {};
            let arr: any[] | undefined;
            for (const v of Object.values(f)) {
              if (Array.isArray(v)) {
                arr = v as any[];
                break;
              }
            }
            fields[name] = arr ?? [];
          } else if (child?.node) {
            fields[name] = [child.node];
          } else if (child?.token) {
            fields[name] = [this.tokenToNode(child.token)];
          } else {
            fields[name] = [];
          }
        } else if (typeof source === 'object' && 'listMerge' in source) {
          const merged: AstNode[] = [];
          for (const idx of source.listMerge) {
            const child = children[idx];
            if (!child) continue;
            if (child.list) merged.push(...child.list);
            else if (child.node?.type === '__list__') {
              const f = child.node.fields ?? {};
              for (const v of Object.values(f)) {
                if (Array.isArray(v)) {
                  merged.push(...(v as any[]));
                  break;
                }
              }
            } else if (child.node) merged.push(child.node);
            else if (child.token) merged.push(this.tokenToNode(child.token));
          }
          fields[name] = merged;
        } else if (typeof source === 'object' && 'text' in source) {
          const child = children[source.text];
          if (child?.token) fields[name] = child.token.text;
          else if (child?.node?.fields?.text) fields[name] = child.node.fields.text;
          else fields[name] = '';
        } else if (typeof source === 'object' && 'value' in source) {
          const child = children[source.value];
          if (child?.token?.value !== undefined) fields[name] = child.token.value;
          else if (child?.token?.text !== undefined) fields[name] = child.token.text;
          else if (child?.node?.fields?.value !== undefined) fields[name] = child.node.fields.value;
          else fields[name] = '';
        } else if (typeof source === 'object' && 'ref' in source) {
          const child = children[source.ref];
          if (child?.node) fields[name] = child.node;
        }
      }
    }
    return { type: spec.type, fields };
  }
}
