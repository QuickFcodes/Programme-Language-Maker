/**
 * Pythonic — a Python-flavored language that compiles via PLM.
 *
 * Design compromise: Pythonic *looks* Python-like (def, if/elif/else, while,
 * for-in-range, # comments, no type declarations, True/False/None, and/or/not)
 * but uses explicit `{ }` braces for blocks. This sidesteps the INDENT/DEDENT
 * tracking that the PLM character-stream lexer cannot natively express.
 *
 * Statement separators (`;`) are *optional* — they may be used to put multiple
 * statements on one line, but a bare newline (whitespace) also separates them
 * at the lexical level. Newlines are treated as whitespace, so the grammar
 * uses a trailing `SEMICOLON?` on statement rules to make semicolons optional.
 *
 * Grammar sketch:
 *
 *   program     = statement*
 *   statement   = defStmt | ifStmt | whileStmt | forStmt
 *               | returnStmt | printStmt | exprStmt
 *   defStmt     = 'def' IDENT '(' params? ')' ':' block
 *   ifStmt      = 'if' expr ':' block elsePart?
 *   elsePart    = 'elif' expr ':' block elsePart?   (-> nested IfStmt)
 *               | 'else' ':' block                  (-> Block)
 *   whileStmt   = 'while' expr ':' block
 *   forStmt     = 'for' IDENT 'in' 'range' '(' expr ')' ':' block
 *   returnStmt  = 'return' expr? ';'?
 *   printStmt   = 'print' expr ';'?
 *   exprStmt    = expr ';'?
 *   block       = '{' statement* '}'
 *   expr        = assign | logicOr
 *   assign      = IDENT '=' expr
 *   logicOr     = logicAnd ('or' logicAnd)*
 *   logicAnd    = equality ('and' equality)*
 *   equality    = comparison (('==' | '!=') comparison)*
 *   comparison  = term (('<' | '>' | '<=' | '>=') term)*
 *   term        = factor (('+' | '-') factor)*
 *   factor      = unary (('*' | '/' | '%') unary)*
 *   unary       = '-' unary | 'not' unary | '!' unary | call
 *   call        = IDENT '(' args? ')' | primary
 *   primary     = NUMBER | STRING | 'True' | 'False' | 'None'
 *               | IDENT | '(' expr ')'
 *
 * Example:
 *
 *   def fib(n):
 *     if n < 2:
 *       return n
 *     return fib(n - 1) + fib(n - 2)
 *
 *   for i in range(10):
 *     print(fib(i))
 *
 * Known limitations vs. real Python:
 *   - Blocks use braces, not indentation.
 *   - `True` / `False` / `None` are encoded as their Pythonic *display strings*
 *     ("True" / "False" / "None") so `print(True)` produces the expected
 *     capitalized output. This means `if False:` would (incorrectly) be truthy
 *     because non-empty strings are truthy in the VM. Use `0`/`1` for
 *     boolean-like conditionals if you need correct falsiness.
 *   - `range(N)` is only supported inside `for` headers (not as a general
 *     expression).
 *   - `not` has unary precedence (higher than comparisons), unlike Python.
 *   - Param/arg lists support 1–3 elements (sufficient for typical use).
 */

import { PlmConfig } from '../plm/config';

export const pythonicConfig: PlmConfig = {
  language: {
    name: 'Pythonic',
    version: '1.0.0',
    fileExtension: 'py',
    description:
      'A Python-flavored language with def/if-elif-else/while/for-range, ' +
      'no type declarations, # comments, and brace-delimited blocks.',
  },

  // -------------------------------------------------------------------------
  // Lexer
  // -------------------------------------------------------------------------
  lexer: {
    whitespace: [' ', '\t', '\n', '\r'],
    comments: { line: '#' },
    tokens: [
      // Punctuation
      { name: 'LPAREN', kind: 'literal', literal: '(' },
      { name: 'RPAREN', kind: 'literal', literal: ')' },
      { name: 'LBRACE', kind: 'literal', literal: '{' },
      { name: 'RBRACE', kind: 'literal', literal: '}' },
      { name: 'LBRACKET', kind: 'literal', literal: '[' },
      { name: 'RBRACKET', kind: 'literal', literal: ']' },
      { name: 'COMMA', kind: 'literal', literal: ',' },
      { name: 'SEMICOLON', kind: 'literal', literal: ';' },
      { name: 'COLON', kind: 'literal', literal: ':' },

      // Operators. Lexer sorts literals longest-first, so '==' beats '='.
      { name: 'PLUS', kind: 'literal', literal: '+' },
      { name: 'MINUS', kind: 'literal', literal: '-' },
      { name: 'STAR', kind: 'literal', literal: '*' },
      { name: 'SLASH', kind: 'literal', literal: '/' },
      { name: 'PERCENT', kind: 'literal', literal: '%' },
      { name: 'EQUAL', kind: 'literal', literal: '=' },
      { name: 'EQEQ', kind: 'literal', literal: '==' },
      { name: 'NEQ', kind: 'literal', literal: '!=' },
      { name: 'LT', kind: 'literal', literal: '<' },
      { name: 'GT', kind: 'literal', literal: '>' },
      { name: 'LTE', kind: 'literal', literal: '<=' },
      { name: 'GTE', kind: 'literal', literal: '>=' },
      { name: 'BANG', kind: 'literal', literal: '!' },

      // Literals
      { name: 'NUMBER', kind: 'number', digits: '0-9' },
      {
        name: 'STRING',
        kind: 'string',
        startQuote: '"',
        endQuote: '"',
        escape: '\\',
      },

      // Identifiers
      {
        name: 'IDENT',
        kind: 'ident',
        startChars: ['a-z', 'A-Z', '_'],
        continueChars: ['a-z', 'A-Z', '0-9', '_'],
      },
    ],
    keywords: {
      def: 'DEF',
      if: 'IF',
      elif: 'ELIF',
      else: 'ELSE',
      while: 'WHILE',
      for: 'FOR',
      in: 'IN',
      range: 'RANGE',
      return: 'RETURN',
      print: 'PRINT',
      True: 'TRUE',
      False: 'FALSE',
      None: 'NONE',
      and: 'AND_KW',
      or: 'OR_KW',
      not: 'NOT_KW',
    },
  },

  // -------------------------------------------------------------------------
  // Grammar
  // -------------------------------------------------------------------------
  grammar: {
    start: 'program',
    rules: {
      program: {
        type: 'seq',
        items: [{ ref: 'statement', quant: '*' }],
        ast: { type: 'Program', fields: { body: { list: 0 } } },
      },

      statement: {
        type: 'choice',
        options: [
          { ref: 'defStmt' },
          { ref: 'ifStmt' },
          { ref: 'whileStmt' },
          { ref: 'forStmt' },
          { ref: 'returnStmt' },
          { ref: 'printStmt' },
          { ref: 'exprStmt' },
        ],
      },

      // def add(a, b): { ... }
      defStmt: {
        type: 'seq',
        items: [
          'DEF',
          'IDENT',
          'LPAREN',
          { ref: 'paramList', quant: '?' },
          'RPAREN',
          'COLON',
          { ref: 'block' },
        ],
        ast: {
          type: 'FuncDecl',
          fields: {
            name: { text: 1 },
            params: { list: 3 },
            body: 6,
          },
        },
      },

      // 1–3 params (keeps the grammar finite; add more if needed).
      paramList: {
        type: 'choice',
        options: [
          {
            type: 'seq',
            items: ['IDENT', 'COMMA', 'IDENT', 'COMMA', 'IDENT'],
            ast: {
              type: '__list__',
              fields: { items: { listMerge: [0, 2, 4] } },
            },
          },
          {
            type: 'seq',
            items: ['IDENT', 'COMMA', 'IDENT'],
            ast: {
              type: '__list__',
              fields: { items: { listMerge: [0, 2] } },
            },
          },
          {
            type: 'seq',
            items: ['IDENT'],
            ast: { type: '__list__', fields: { items: { listMerge: [0] } } },
          },
        ],
      },

      // if cond: { ... } elif cond2: { ... } else: { ... }
      // elif chains are desugared into nested IfStmt nodes at parse time.
      ifStmt: {
        type: 'seq',
        items: [
          'IF',
          { ref: 'expr' },
          'COLON',
          { ref: 'block' },
          { ref: 'elsePart', quant: '?' },
        ],
        ast: { type: 'IfStmt', fields: { cond: 1, then: 3, else: 4 } },
      },

      elsePart: {
        type: 'choice',
        options: [
          {
            // elif -> nested IfStmt
            type: 'seq',
            items: [
              'ELIF',
              { ref: 'expr' },
              'COLON',
              { ref: 'block' },
              { ref: 'elsePart', quant: '?' },
            ],
            ast: {
              type: 'IfStmt',
              fields: { cond: 1, then: 3, else: 4 },
            },
          },
          {
            // else -> Block (may double-wrap; harmless)
            type: 'seq',
            items: ['ELSE', 'COLON', { ref: 'block' }],
            ast: { type: 'Block', fields: { body: { list: 2 } } },
          },
        ],
      },

      whileStmt: {
        type: 'seq',
        items: ['WHILE', { ref: 'expr' }, 'COLON', { ref: 'block' }],
        ast: { type: 'WhileStmt', fields: { cond: 1, body: 3 } },
      },

      // for i in range(N): { ... }
      forStmt: {
        type: 'seq',
        items: [
          'FOR',
          'IDENT',
          'IN',
          'RANGE',
          'LPAREN',
          { ref: 'expr' },
          'RPAREN',
          'COLON',
          { ref: 'block' },
        ],
        ast: {
          type: 'ForStmt',
          fields: { var: { text: 1 }, count: 5, body: 8 },
        },
      },

      returnStmt: {
        type: 'seq',
        items: ['RETURN', { ref: 'expr', quant: '?' }, 'SEMICOLON?'],
        ast: { type: 'ReturnStmt', fields: { value: 1 } },
      },

      printStmt: {
        type: 'seq',
        items: ['PRINT', { ref: 'expr' }, 'SEMICOLON?'],
        ast: { type: 'PrintStmt', fields: { value: 1 } },
      },

      exprStmt: {
        type: 'seq',
        items: [{ ref: 'expr' }, 'SEMICOLON?'],
        ast: { type: 'ExprStmt', fields: { expr: 0 } },
      },

      block: {
        type: 'seq',
        items: ['LBRACE', { ref: 'statement', quant: '*' }, 'RBRACE'],
        ast: { type: 'Block', fields: { body: { list: 1 } } },
      },

      // ---- Expression grammar (precedence climbing via layered rules) ----
      expr: {
        type: 'choice',
        options: [{ ref: 'assign' }, { ref: 'logicOr' }],
      },

      assign: {
        type: 'seq',
        items: ['IDENT', 'EQUAL', { ref: 'expr' }],
        ast: {
          type: 'AssignExpr',
          fields: { name: { text: 0 }, value: 2 },
        },
      },

      logicOr: {
        type: 'seq',
        items: [{ ref: 'logicAnd' }, { ref: 'orRest', quant: '*' }],
        ast: { type: 'LogicOr', fields: { left: 0, rest: { list: 1 } } },
      },
      // Map `or` keyword to `||` so BINOP_MAP can resolve it.
      orRest: {
        type: 'seq',
        items: ['OR_KW', { ref: 'logicAnd' }],
        ast: { type: 'BinRest', fields: { op: '||', right: 1 } },
      },

      logicAnd: {
        type: 'seq',
        items: [{ ref: 'equality' }, { ref: 'andRest', quant: '*' }],
        ast: { type: 'LogicAnd', fields: { left: 0, rest: { list: 1 } } },
      },
      andRest: {
        type: 'seq',
        items: ['AND_KW', { ref: 'equality' }],
        ast: { type: 'BinRest', fields: { op: '&&', right: 1 } },
      },

      equality: {
        type: 'seq',
        items: [{ ref: 'comparison' }, { ref: 'eqRest', quant: '*' }],
        ast: { type: 'Equality', fields: { left: 0, rest: { list: 1 } } },
      },
      eqRest: {
        type: 'choice',
        options: [
          {
            type: 'seq',
            items: ['EQEQ', { ref: 'comparison' }],
            ast: { type: 'BinRest', fields: { op: '==', right: 1 } },
          },
          {
            type: 'seq',
            items: ['NEQ', { ref: 'comparison' }],
            ast: { type: 'BinRest', fields: { op: '!=', right: 1 } },
          },
        ],
      },

      comparison: {
        type: 'seq',
        items: [{ ref: 'term' }, { ref: 'cmpRest', quant: '*' }],
        ast: { type: 'Comparison', fields: { left: 0, rest: { list: 1 } } },
      },
      cmpRest: {
        type: 'choice',
        options: [
          {
            type: 'seq',
            items: ['LT', { ref: 'term' }],
            ast: { type: 'BinRest', fields: { op: '<', right: 1 } },
          },
          {
            type: 'seq',
            items: ['GT', { ref: 'term' }],
            ast: { type: 'BinRest', fields: { op: '>', right: 1 } },
          },
          {
            type: 'seq',
            items: ['LTE', { ref: 'term' }],
            ast: { type: 'BinRest', fields: { op: '<=', right: 1 } },
          },
          {
            type: 'seq',
            items: ['GTE', { ref: 'term' }],
            ast: { type: 'BinRest', fields: { op: '>=', right: 1 } },
          },
        ],
      },

      term: {
        type: 'seq',
        items: [{ ref: 'factor' }, { ref: 'termRest', quant: '*' }],
        ast: { type: 'Term', fields: { left: 0, rest: { list: 1 } } },
      },
      termRest: {
        type: 'choice',
        options: [
          {
            type: 'seq',
            items: ['PLUS', { ref: 'factor' }],
            ast: { type: 'BinRest', fields: { op: '+', right: 1 } },
          },
          {
            type: 'seq',
            items: ['MINUS', { ref: 'factor' }],
            ast: { type: 'BinRest', fields: { op: '-', right: 1 } },
          },
        ],
      },

      factor: {
        type: 'seq',
        items: [{ ref: 'unary' }, { ref: 'factorRest', quant: '*' }],
        ast: { type: 'Factor', fields: { left: 0, rest: { list: 1 } } },
      },
      factorRest: {
        type: 'choice',
        options: [
          {
            type: 'seq',
            items: ['STAR', { ref: 'unary' }],
            ast: { type: 'BinRest', fields: { op: '*', right: 1 } },
          },
          {
            type: 'seq',
            items: ['SLASH', { ref: 'unary' }],
            ast: { type: 'BinRest', fields: { op: '/', right: 1 } },
          },
          {
            type: 'seq',
            items: ['PERCENT', { ref: 'unary' }],
            ast: { type: 'BinRest', fields: { op: '%', right: 1 } },
          },
        ],
      },

      unary: {
        type: 'choice',
        options: [
          {
            type: 'seq',
            items: ['MINUS', { ref: 'unary' }],
            ast: { type: 'UnaryExpr', fields: { op: '-', operand: 1 } },
          },
          {
            type: 'seq',
            items: ['NOT_KW', { ref: 'unary' }],
            ast: { type: 'UnaryExpr', fields: { op: '!', operand: 1 } },
          },
          {
            type: 'seq',
            items: ['BANG', { ref: 'unary' }],
            ast: { type: 'UnaryExpr', fields: { op: '!', operand: 1 } },
          },
          { ref: 'call' },
        ],
      },

      call: {
        type: 'choice',
        options: [{ ref: 'callExpr' }, { ref: 'primary' }],
      },

      callExpr: {
        type: 'seq',
        items: ['IDENT', 'LPAREN', { ref: 'argList', quant: '?' }, 'RPAREN'],
        ast: {
          type: 'CallExpr',
          fields: { callee: { text: 0 }, args: { list: 2 } },
        },
      },

      argList: {
        type: 'choice',
        options: [
          {
            type: 'seq',
            items: [
              { ref: 'expr' },
              'COMMA',
              { ref: 'expr' },
              'COMMA',
              { ref: 'expr' },
            ],
            ast: {
              type: '__list__',
              fields: { items: { listMerge: [0, 2, 4] } },
            },
          },
          {
            type: 'seq',
            items: [{ ref: 'expr' }, 'COMMA', { ref: 'expr' }],
            ast: {
              type: '__list__',
              fields: { items: { listMerge: [0, 2] } },
            },
          },
          {
            type: 'seq',
            items: [{ ref: 'expr' }],
            ast: { type: '__list__', fields: { items: { listMerge: [0] } } },
          },
        ],
      },

      primary: {
        type: 'choice',
        options: [
          {
            type: 'seq',
            items: ['NUMBER'],
            ast: { type: 'NumberLit', fields: { value: { value: 0 } } },
          },
          {
            type: 'seq',
            items: ['STRING'],
            ast: { type: 'StringLit', fields: { value: { value: 0 } } },
          },
          // True / False / None are emitted as their Pythonic display strings
          // so `print(True)` yields "True" (capitalized) rather than the
          // VM's default lowercase "true".
          {
            type: 'seq',
            items: ['TRUE'],
            ast: { type: 'StringLit', fields: { value: 'True' } },
          },
          {
            type: 'seq',
            items: ['FALSE'],
            ast: { type: 'StringLit', fields: { value: 'False' } },
          },
          {
            type: 'seq',
            items: ['NONE'],
            ast: { type: 'StringLit', fields: { value: 'None' } },
          },
          {
            type: 'seq',
            items: ['IDENT'],
            ast: { type: 'VarRef', fields: { name: { text: 0 } } },
          },
          {
            type: 'seq',
            items: ['LPAREN', { ref: 'expr' }, 'RPAREN'],
            ast: { type: 'ParenExpr', fields: { expr: 1 } },
          },
        ],
      },
    },
  },

  // -------------------------------------------------------------------------
  // Codegen
  // -------------------------------------------------------------------------
  codegen: {
    templates: [
      // Pass-through wrappers.
      { nodeType: 'Program', ops: ['EVAL ${body}'] },
      { nodeType: 'Block', ops: ['EVAL ${body}'] },
      { nodeType: '__list__', ops: ['EVAL ${__items__}'] },
      { nodeType: '__seq__', ops: ['EVAL ${__children__}'] },
      { nodeType: '__item__', ops: ['EVAL ${item}'] },

      // Statements.
      { nodeType: 'ExprStmt', ops: ['EVAL ${expr}', 'POP'] },
      { nodeType: 'PrintStmt', ops: ['EVAL ${value}', 'PRINT'] },
      { nodeType: 'ReturnStmt', ops: ['EVAL ${value}', 'RET'] },
      // FuncDecl emits nothing at the call site; bodies are collected
      // separately by collectFunctions.
      { nodeType: 'FuncDecl', ops: [] },

      {
        nodeType: 'IfStmt',
        ops: [
          {
            if: {
              cond: ['EVAL ${cond}'],
              then: ['EVAL ${then}'],
              else: ['EVAL ${else}'],
            },
          },
        ],
      },
      {
        nodeType: 'WhileStmt',
        ops: [
          {
            while: {
              cond: ['EVAL ${cond}'],
              body: ['EVAL ${body}'],
            },
          },
        ],
      },
      // for VAR in range(COUNT): BODY
      //   ->  __for_i = 0
      //       while __for_i < COUNT:
      //         VAR = __for_i
      //         BODY
      //         __for_i = __for_i + 1
      {
        nodeType: 'ForStmt',
        ops: [
          'PUSH_INT 0',
          'DECLARE_VAR __for_i',
          'STORE_VAR __for_i',
          {
            while: {
              cond: ['LOAD_VAR __for_i', 'EVAL ${count}', 'LT'],
              body: [
                'LOAD_VAR __for_i',
                'DECLARE_VAR ${var}',
                'STORE_VAR ${var}',
                'EVAL ${body}',
                'LOAD_VAR __for_i',
                'PUSH_INT 1',
                'ADD',
                'STORE_VAR __for_i',
              ],
            },
          },
        ],
      },

      // Literals.
      { nodeType: 'NumberLit', ops: ['PUSH_INT ${value}'] },
      { nodeType: 'StringLit', ops: ['PUSH_STR ${value}'] },

      // Variables.
      { nodeType: 'VarRef', ops: ['LOAD_VAR ${name}'] },
      { nodeType: 'AssignExpr', ops: ['EVAL ${value}', 'DUP', 'STORE_VAR ${name}'] },
      { nodeType: 'ParenExpr', ops: ['EVAL ${expr}'] },

      // Unary.
      {
        nodeType: 'UnaryExpr',
        ops: ['EVAL ${operand}', 'UNARYOP ${op}'],
      },

      // Binary chains — each chain is { left, rest: [{op, right}, ...] }.
      // Emit left, then for each rest item: emit right, emit binop.
      {
        nodeType: 'LogicOr',
        ops: [
          'EVAL ${left}',
          { forEach: '${rest}', do: ['EVAL ${item.right}', 'BINOP ${item.op}'] },
        ],
      },
      {
        nodeType: 'LogicAnd',
        ops: [
          'EVAL ${left}',
          { forEach: '${rest}', do: ['EVAL ${item.right}', 'BINOP ${item.op}'] },
        ],
      },
      {
        nodeType: 'Equality',
        ops: [
          'EVAL ${left}',
          { forEach: '${rest}', do: ['EVAL ${item.right}', 'BINOP ${item.op}'] },
        ],
      },
      {
        nodeType: 'Comparison',
        ops: [
          'EVAL ${left}',
          { forEach: '${rest}', do: ['EVAL ${item.right}', 'BINOP ${item.op}'] },
        ],
      },
      {
        nodeType: 'Term',
        ops: [
          'EVAL ${left}',
          { forEach: '${rest}', do: ['EVAL ${item.right}', 'BINOP ${item.op}'] },
        ],
      },
      {
        nodeType: 'Factor',
        ops: [
          'EVAL ${left}',
          { forEach: '${rest}', do: ['EVAL ${item.right}', 'BINOP ${item.op}'] },
        ],
      },

      // Function call.
      {
        nodeType: 'CallExpr',
        ops: ['CALL ${callee} ${args}'],
      },
    ],
  },
};
