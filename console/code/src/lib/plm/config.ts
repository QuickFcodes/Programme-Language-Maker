/**
 * PLM configuration schema.
 *
 * A PLM config describes:
 *  - lexer:   how to break source code into tokens
 *  - grammar: how to parse tokens into an AST
 *  - codegen: how to translate AST nodes into QVM bytecode
 *
 * No regex anywhere. Lexer rules use explicit character classes.
 */

// ---------------------------------------------------------------------------
// Lexer configuration
// ---------------------------------------------------------------------------

export type CharClass = string | string[];
// A CharClass is either:
//   - a single literal character (e.g. "+")
//   - a 2-char range like "a-z"
//   - an array of the above

export interface TokenRule {
  /** Token name (e.g. "NUMBER", "IDENT", "PLUS"). */
  name: string;
  /** What kind of token this is. */
  kind: 'literal' | 'number' | 'string' | 'ident';
  /**
   * For 'literal': the exact literal string to match (e.g. "+", "==").
   * For 'number': digits char class (default "0-9"), optional fractional part.
   * For 'string': start quote char, end quote char, escape char.
   * For 'ident':  start chars + continuation chars.
   */
  literal?: string;
  digits?: CharClass;
  startQuote?: string;
  endQuote?: string;
  escape?: string;
  /** For 'ident': characters that may start the identifier. */
  startChars?: CharClass;
  /** For 'ident': characters that may continue the identifier (defaults to startChars + digits). */
  continueChars?: CharClass;
  /** Ignore this token (e.g. whitespace, comments). Defaults to false. */
  ignore?: boolean;
  /** Optional human-readable description. */
  description?: string;
}

export interface CommentRule {
  /** Line comment start. */
  line?: string;
  /** Block comment start. */
  blockStart?: string;
  /** Block comment end. */
  blockEnd?: string;
}

export interface LexerConfig {
  /** Characters treated as whitespace (skipped). */
  whitespace?: CharClass;
  /** Comment rules. */
  comments?: CommentRule;
  /** Token rules, in priority order. Longest match wins; literals are matched before idents. */
  tokens: TokenRule[];
  /** Reserved words — idents matching these become keyword tokens instead. */
  keywords?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Grammar configuration
// ---------------------------------------------------------------------------

/**
 * A grammar production like:
 *   expr   = term (("+" | "-") term)*
 *
 * We model it as:
 *   - a sequence of "atoms" (refs to other rules or literal token names)
 *   - with optional quantifiers (* + ?)
 *   - and choices (|)
 *
 * Format:
 *
 *   rule: {
 *     type: "seq", items: [Atom, Atom, ...]
 *   }
 *   rule: { type: "choice", options: [Seq, Seq, ...] }
 *   rule: Atom (shorthand for a single-atom seq)
 *
 * Atom (string):
 *   "IDENT"          — match a token of type IDENT
 *   "expr"           — match a non-terminal named "expr"
 *   "expr*"          — match zero or more
 *   "expr+"          — match one or more
 *   "expr?"          — match zero or one
 *   "\"literal\""    — match a literal token whose text equals "literal"
 *                     (the corresponding literal token must be defined in lexer)
 *
 * Each rule may also declare what AST node it produces, and which matched
 * children get included in the node:
 *
 *   rule: {
 *     type: "seq",
 *     items: [...],
 *     ast: { type: "BinaryExpr", fields: { left: 0, op: 1, right: 2 } }
 *   }
 *
 *   rule: {
 *     type: "seq",
 *     items: ["LPAREN", "expr", "RPAREN"],
 *     ast: { type: "ParenExpr", fields: { expr: 1 } }
 *   }
 *
 *   rule: {
 *     type: "seq",
 *     items: ["expr", "PLUS", "expr"],
 *     ast: { type: "BinaryExpr", fields: { left: 0, op: "+", right: 2 } }
 *     // op can also be a literal value to inject
 *   }
 *
 * For lists (quantifier *):
 *   rule: {
 *     type: "seq",
 *     items: [{ ref: "statement", quant: "*", astAs: "body" }],
 *     ast: { type: "Block", fields: { body: { list: 0 } } }
 *   }
 *
 * Or more simply: { list: "body" } means "child 0 is a list; capture as body".
 */

export type Atom =
  | string
  | {
      ref: string;
      quant?: '*' | '+' | '?';
      /** When inside a seq, name to use for AST capture. */
      astAs?: string;
      /** When this atom is matched, treat its raw text as the AST value (for tokens). */
      captureText?: boolean;
    };

export interface SeqRule {
  type: 'seq';
  items: Atom[];
  ast?: AstSpec;
}

export interface ChoiceRule {
  type: 'choice';
  options: Atom[]; // each option is itself an atom (usually a seq, but atoms can be nested)
  ast?: AstSpec;
}

export type Rule = SeqRule | ChoiceRule | Atom;

export interface AstSpec {
  /** AST node type name. */
  type: string;
  /**
   * Field name -> source.
   * Source can be:
   *   - number: index into matched children
   *   - string: literal value to inject
   *   - { list: number }: take child N as a list
   *   - { listMerge: number[] }: merge multiple children into one list (some may be single nodes, some lists)
   *   - { text: number }: take child N's raw token text
   *   - { value: number }: take child N's token value (for STRING/NUMBER tokens, the parsed value)
   *   - { ref: number }: take child N as a node reference
   */
  fields?: Record<string, number | string | { list: number } | { listMerge: number[] } | { text: number } | { value: number } | { ref: number }>;
}

export interface GrammarConfig {
  /** The start rule name. */
  start: string;
  rules: Record<string, Rule>;
}

// ---------------------------------------------------------------------------
// Codegen configuration
// ---------------------------------------------------------------------------

/**
 * Code generation is driven by templates per AST node type.
 *
 * A template is a list of "ops" (strings). Each op is one of:
 *   - "EVAL <field>"   — recursively emit code for AST child <field>
 *   - "PUSH_INT <field.text>"
 *   - "PUSH_STR <field.text>"
 *   - "PUSH_BOOL true|false"
 *   - "ADD" | "SUB" | ...   — emit a QVM opcode
 *   - "STORE_LOCAL <n>"
 *   - "LOAD_LOCAL <n>"
 *   - "CALL <fn-name> <argc>"
 *   - "JMP <label>"
 *   - "JMP_IF_FALSE <label>"
 *   - "JMP_IF_TRUE <label>"
 *   - "LABEL <label>"
 *   - "PRINT"
 *   - "POP"
 *   - "DUP"
 *   - "HALT"
 *
 *   Special control flow:
 *   - "WHILE { cond: <template>, body: <template> }"
 *   - "IF { cond: <template>, then: <template>, else?: <template> }"
 *   - "FUNC { name: <field.text>, params: <field.list>, body: <field> }"
 *   - "BLOCK { body: <field> }"
 *
 * Templates can also reference fields of the current node via ${field}
 *   e.g. "PUSH_STR ${value}"   — pushes the node's `value` field as a string
 *
 * Or use field.text to push the raw source text of a token field.
 */
export interface CodegenTemplate {
  /** AST node type this template handles. */
  nodeType: string;
  /** The template ops, executed in order. */
  ops: TemplateOp[];
}

export type TemplateOp =
  | string
  | {
      while?: { cond: TemplateOp[]; body: TemplateOp[] };
      if?: {
        cond: TemplateOp[];
        then: TemplateOp[];
        else?: TemplateOp[];
      };
      func?: {
        name: string;
        params: string;
        body: string;
      };
      block?: { body: string };
      loop?: {
        list: string;
        body: TemplateOp[];
        separator?: TemplateOp[];
      };
      /** Alias for loop with a friendlier name. */
      forEach?: string;
      do?: TemplateOp[];
    };

export interface CodegenConfig {
  templates: CodegenTemplate[];
}

// ---------------------------------------------------------------------------
// Top-level config
// ---------------------------------------------------------------------------

export interface PlmConfig {
  language: {
    name: string;
    version?: string;
    fileExtension?: string;
    description?: string;
  };
  lexer: LexerConfig;
  grammar: GrammarConfig;
  codegen: CodegenConfig;
  /**
   * Default package imports — names of standard packages (e.g. "std.io")
   * that are automatically merged into every compiled module.
   * These provide built-in functions available to all programs.
   */
  defaultImports?: string[];
}

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

export interface ConfigError {
  path: string;
  message: string;
}

export function validateConfig(cfg: PlmConfig): ConfigError[] {
  const errors: ConfigError[] = [];
  if (!cfg.language?.name) {
    errors.push({ path: 'language.name', message: 'Language name is required' });
  }
  if (!cfg.lexer?.tokens || cfg.lexer.tokens.length === 0) {
    errors.push({ path: 'lexer.tokens', message: 'At least one token rule is required' });
  }
  if (!cfg.grammar?.start) {
    errors.push({ path: 'grammar.start', message: 'Start rule is required' });
  }
  if (!cfg.grammar?.rules || !cfg.grammar.rules[cfg.grammar.start]) {
    errors.push({
      path: 'grammar.rules',
      message: `Start rule "${cfg.grammar?.start}" is not defined`,
    });
  }
  if (!cfg.codegen?.templates || cfg.codegen.templates.length === 0) {
    errors.push({ path: 'codegen.templates', message: 'At least one codegen template is required' });
  }
  // Check token rule fields
  cfg.lexer?.tokens?.forEach((t, i) => {
    if (!t.name) errors.push({ path: `lexer.tokens[${i}].name`, message: 'Token name is required' });
    if (t.kind === 'literal' && !t.literal) {
      errors.push({ path: `lexer.tokens[${i}].literal`, message: `Literal value required for token ${t.name}` });
    }
    if (t.kind === 'string' && !t.startQuote) {
      errors.push({ path: `lexer.tokens[${i}].startQuote`, message: `startQuote required for string token ${t.name}` });
    }
    if (t.kind === 'ident' && !t.startChars) {
      errors.push({ path: `lexer.tokens[${i}].startChars`, message: `startChars required for ident token ${t.name}` });
    }
  });
  return errors;
}
