/**
 * MiniC — a small C-like imperative language that demonstrates PLM.
 *
 * Features:
 *   - C-like syntax with `int` keyword as a (dynamically-typed) declaration marker
 *   - Variables: `int x = 5;` or `int x;`
 *   - Arithmetic + - * / %
 *   - Comparison < > <= >= == !=
 *   - Logical && || !
 *   - if / else
 *   - while
 *   - for (init; cond; update) — desugars to a while loop in codegen
 *   - Functions: `int add(int a, int b) { return a + b; }`
 *   - Arrays: `int arr[5];` — initialized to a list of N zeros
 *   - arr[i] read / arr[i] = v write
 *   - i++ / i-- post-increment (new-value semantics)
 *   - printf statement (built-in)
 *   - C-style comments: line (`//`) and block (`/* ... *` + `/`)
 *   - C-style strings with escapes
 *
 * Example:
 *
 *   int fib(int n) {
 *     if (n < 2) { return n; }
 *     return fib(n - 1) + fib(n - 2);
 *   }
 *
 *   int main() {
 *     for (int i = 0; i < 10; i++) {
 *       printf fib(i);
 *     }
 *     return 0;
 *   }
 *
 * Pointers are intentionally omitted.
 */

import { PlmConfig } from '../plm/config';

export const minicConfig: PlmConfig = {
  language: {
    name: 'MiniC',
    version: '1.0.0',
    fileExtension: 'mc',
    description:
      'A C-like imperative language with functions, control flow, arrays, and recursion. Types are dynamically-typed (the `int` keyword is sugar).',
  },

  // -------------------------------------------------------------------------
  // Lexer — character-class based, no regex.
  // -------------------------------------------------------------------------
  lexer: {
    whitespace: [' ', '\t', '\n', '\r'],
    comments: { line: '//', blockStart: '/*', blockEnd: '*/' },
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

      // Operators — multi-char literals first (lexer sorts by length desc,
      // so "++" beats "+", "==" beats "=", etc.).
      { name: 'PLUS_PLUS', kind: 'literal', literal: '++' },
      { name: 'MINUS_MINUS', kind: 'literal', literal: '--' },
      { name: 'EQEQ', kind: 'literal', literal: '==' },
      { name: 'NEQ', kind: 'literal', literal: '!=' },
      { name: 'LTE', kind: 'literal', literal: '<=' },
      { name: 'GTE', kind: 'literal', literal: '>=' },
      { name: 'AND', kind: 'literal', literal: '&&' },
      { name: 'OR', kind: 'literal', literal: '||' },
      { name: 'PLUS', kind: 'literal', literal: '+' },
      { name: 'MINUS', kind: 'literal', literal: '-' },
      { name: 'STAR', kind: 'literal', literal: '*' },
      { name: 'SLASH', kind: 'literal', literal: '/' },
      { name: 'PERCENT', kind: 'literal', literal: '%' },
      { name: 'EQUAL', kind: 'literal', literal: '=' },
      { name: 'LT', kind: 'literal', literal: '<' },
      { name: 'GT', kind: 'literal', literal: '>' },
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
      int: 'INT',
      if: 'IF',
      else: 'ELSE',
      while: 'WHILE',
      for: 'FOR',
      return: 'RETURN',
      printf: 'PRINTF',
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
        items: [{ ref: 'declaration', quant: '*' }],
        ast: { type: 'Program', fields: { body: { list: 0 } } },
      },

      // declaration = funcDecl | varDecl | statement
      declaration: {
        type: 'choice',
        options: [
          { ref: 'funcDecl' },
          { ref: 'varDecl' },
          { ref: 'statement' },
        ],
      },

      // funcDecl = 'int' IDENT '(' params? ')' block
      funcDecl: {
        type: 'seq',
        items: [
          'INT',
          'IDENT',
          'LPAREN',
          { ref: 'paramList', quant: '?' },
          'RPAREN',
          { ref: 'block' },
        ],
        ast: {
          type: 'FuncDecl',
          fields: {
            name: { text: 1 },
            params: { list: 3 },
            body: 5,
          },
        },
      },

      // paramList — supports up to 3 typed params: `int a, int b, int c`
      // (each `int` keyword is consumed but not captured).
      paramList: {
        type: 'choice',
        options: [
          {
            type: 'seq',
            items: ['INT', 'IDENT', 'COMMA', 'INT', 'IDENT', 'COMMA', 'INT', 'IDENT'],
            ast: { type: '__list__', fields: { items: { listMerge: [1, 4, 7] } } },
          },
          {
            type: 'seq',
            items: ['INT', 'IDENT', 'COMMA', 'INT', 'IDENT'],
            ast: { type: '__list__', fields: { items: { listMerge: [1, 4] } } },
          },
          {
            type: 'seq',
            items: ['INT', 'IDENT'],
            ast: { type: '__list__', fields: { items: { listMerge: [1] } } },
          },
        ],
      },

      // varDecl — three forms (tried in order: array, init, plain).
      varDecl: {
        type: 'choice',
        options: [
          // Array decl: int arr[5];
          {
            type: 'seq',
            items: ['INT', 'IDENT', 'LBRACKET', 'NUMBER', 'RBRACKET', 'SEMICOLON'],
            ast: {
              type: 'ArrayVarDecl',
              fields: { name: { text: 1 }, size: { value: 3 } },
            },
          },
          // With init: int x = expr;
          {
            type: 'seq',
            items: ['INT', 'IDENT', 'EQUAL', { ref: 'expr' }, 'SEMICOLON'],
            ast: { type: 'VarDecl', fields: { name: { text: 1 }, value: 3 } },
          },
          // No init: int x;
          {
            type: 'seq',
            items: ['INT', 'IDENT', 'SEMICOLON'],
            ast: { type: 'VarDecl', fields: { name: { text: 1 } } },
          },
        ],
      },

      // statement
      statement: {
        type: 'choice',
        options: [
          { ref: 'ifStmt' },
          { ref: 'whileStmt' },
          { ref: 'forStmt' },
          { ref: 'returnStmt' },
          { ref: 'printfStmt' },
          { ref: 'exprStmt' },
          { ref: 'block' },
        ],
      },

      // ifStmt — try the with-else form first, fall back to no-else.
      ifStmt: {
        type: 'choice',
        options: [{ ref: 'ifElseStmt' }, { ref: 'ifThenStmt' }],
      },
      ifElseStmt: {
        type: 'seq',
        items: [
          'IF',
          'LPAREN',
          { ref: 'expr' },
          'RPAREN',
          { ref: 'block' },
          'ELSE',
          { ref: 'block' },
        ],
        ast: {
          type: 'IfStmt',
          fields: { cond: 2, then: 4, else: 6 },
        },
      },
      ifThenStmt: {
        type: 'seq',
        items: ['IF', 'LPAREN', { ref: 'expr' }, 'RPAREN', { ref: 'block' }],
        ast: { type: 'IfStmt', fields: { cond: 2, then: 4 } },
      },

      // whileStmt
      whileStmt: {
        type: 'seq',
        items: ['WHILE', 'LPAREN', { ref: 'expr' }, 'RPAREN', { ref: 'block' }],
        ast: { type: 'WhileStmt', fields: { cond: 2, body: 4 } },
      },

      // forStmt — four forms covering all combos of optional cond/update.
      forStmt: {
        type: 'choice',
        options: [
          { ref: 'forFull' },
          { ref: 'forNoCond' },
          { ref: 'forNoUpdate' },
          { ref: 'forBare' },
        ],
      },
      // for (init; cond; update) body
      forFull: {
        type: 'seq',
        items: [
          'FOR',
          'LPAREN',
          { ref: 'forInit' },
          { ref: 'expr' },
          'SEMICOLON',
          { ref: 'expr' },
          'RPAREN',
          { ref: 'block' },
        ],
        ast: {
          type: 'ForStmt',
          fields: { init: 2, cond: 3, update: 5, body: 7 },
        },
      },
      // for (init; ; update) body
      forNoCond: {
        type: 'seq',
        items: [
          'FOR',
          'LPAREN',
          { ref: 'forInit' },
          'SEMICOLON',
          { ref: 'expr' },
          'RPAREN',
          { ref: 'block' },
        ],
        ast: {
          type: 'ForStmtNoCond',
          fields: { init: 2, update: 4, body: 6 },
        },
      },
      // for (init; cond;) body
      forNoUpdate: {
        type: 'seq',
        items: [
          'FOR',
          'LPAREN',
          { ref: 'forInit' },
          { ref: 'expr' },
          'SEMICOLON',
          'RPAREN',
          { ref: 'block' },
        ],
        ast: {
          type: 'ForStmtNoUpdate',
          fields: { init: 2, cond: 3, body: 5 },
        },
      },
      // for (init;;) body
      forBare: {
        type: 'seq',
        items: [
          'FOR',
          'LPAREN',
          { ref: 'forInit' },
          'SEMICOLON',
          'RPAREN',
          { ref: 'block' },
        ],
        ast: { type: 'ForStmtBare', fields: { init: 2, body: 4 } },
      },
      // forInit = varDecl | exprStmt (both consume their own ';')
      forInit: {
        type: 'choice',
        options: [{ ref: 'varDecl' }, { ref: 'exprStmt' }],
      },

      // returnStmt = 'return' expr? ';'
      returnStmt: {
        type: 'seq',
        items: ['RETURN', { ref: 'expr', quant: '?' }, 'SEMICOLON'],
        ast: { type: 'ReturnStmt', fields: { value: 1 } },
      },

      // printfStmt — built-in print statement.
      printfStmt: {
        type: 'seq',
        items: ['PRINTF', { ref: 'expr' }, 'SEMICOLON'],
        ast: { type: 'PrintfStmt', fields: { value: 1 } },
      },

      // exprStmt = expr ';'
      exprStmt: {
        type: 'seq',
        items: [{ ref: 'expr' }, 'SEMICOLON'],
        ast: { type: 'ExprStmt', fields: { expr: 0 } },
      },

      // block = '{' statement* '}'
      block: {
        type: 'seq',
        items: ['LBRACE', { ref: 'statement', quant: '*' }, 'RBRACE'],
        ast: { type: 'Block', fields: { body: { list: 1 } } },
      },

      // -----------------------------------------------------------------
      // Expression grammar — C precedence (lowest to highest):
      //   assignment → logic-or → logic-and → equality → comparison
      //   → additive → multiplicative → unary → postfix → primary
      // -----------------------------------------------------------------

      expr: {
        type: 'choice',
        options: [{ ref: 'assign' }, { ref: 'logicOr' }],
      },

      // assign — try array-assign, then var-assign, then fall through.
      assign: {
        type: 'choice',
        options: [
          { ref: 'arrAssign' },
          { ref: 'varAssign' },
          { ref: 'logicOr' },
        ],
      },

      // arr[i] = value
      arrAssign: {
        type: 'seq',
        items: [
          'IDENT',
          'LBRACKET',
          { ref: 'expr' },
          'RBRACKET',
          'EQUAL',
          { ref: 'expr' },
        ],
        ast: {
          type: 'IndexAssignExpr',
          fields: { name: { text: 0 }, index: 2, value: 5 },
        },
      },

      // x = value (right-associative via recursion back to expr)
      varAssign: {
        type: 'seq',
        items: ['IDENT', 'EQUAL', { ref: 'expr' }],
        ast: { type: 'AssignExpr', fields: { name: { text: 0 }, value: 2 } },
      },

      logicOr: {
        type: 'seq',
        items: [{ ref: 'logicAnd' }, { ref: 'orRest', quant: '*' }],
        ast: { type: 'LogicOr', fields: { left: 0, rest: { list: 1 } } },
      },
      orRest: {
        type: 'seq',
        items: ['OR', { ref: 'logicAnd' }],
        ast: { type: 'BinRest', fields: { op: '||', right: 1 } },
      },

      logicAnd: {
        type: 'seq',
        items: [{ ref: 'equality' }, { ref: 'andRest', quant: '*' }],
        ast: { type: 'LogicAnd', fields: { left: 0, rest: { list: 1 } } },
      },
      andRest: {
        type: 'seq',
        items: ['AND', { ref: 'equality' }],
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
        items: [{ ref: 'additive' }, { ref: 'cmpRest', quant: '*' }],
        ast: { type: 'Comparison', fields: { left: 0, rest: { list: 1 } } },
      },
      cmpRest: {
        type: 'choice',
        options: [
          {
            type: 'seq',
            items: ['LT', { ref: 'additive' }],
            ast: { type: 'BinRest', fields: { op: '<', right: 1 } },
          },
          {
            type: 'seq',
            items: ['GT', { ref: 'additive' }],
            ast: { type: 'BinRest', fields: { op: '>', right: 1 } },
          },
          {
            type: 'seq',
            items: ['LTE', { ref: 'additive' }],
            ast: { type: 'BinRest', fields: { op: '<=', right: 1 } },
          },
          {
            type: 'seq',
            items: ['GTE', { ref: 'additive' }],
            ast: { type: 'BinRest', fields: { op: '>=', right: 1 } },
          },
        ],
      },

      additive: {
        type: 'seq',
        items: [{ ref: 'multiplicative' }, { ref: 'addRest', quant: '*' }],
        ast: { type: 'Additive', fields: { left: 0, rest: { list: 1 } } },
      },
      addRest: {
        type: 'choice',
        options: [
          {
            type: 'seq',
            items: ['PLUS', { ref: 'multiplicative' }],
            ast: { type: 'BinRest', fields: { op: '+', right: 1 } },
          },
          {
            type: 'seq',
            items: ['MINUS', { ref: 'multiplicative' }],
            ast: { type: 'BinRest', fields: { op: '-', right: 1 } },
          },
        ],
      },

      multiplicative: {
        type: 'seq',
        items: [{ ref: 'unary' }, { ref: 'mulRest', quant: '*' }],
        ast: { type: 'Multiplicative', fields: { left: 0, rest: { list: 1 } } },
      },
      mulRest: {
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
            items: ['BANG', { ref: 'unary' }],
            ast: { type: 'UnaryExpr', fields: { op: '!', operand: 1 } },
          },
          { ref: 'postfix' },
        ],
      },

      // postfix — single suffix (call OR index OR ++/--). Multiple-chained
      // suffixes (e.g. `f()[0]`) are not supported.
      postfix: {
        type: 'choice',
        options: [
          { ref: 'callExpr' },
          { ref: 'indexExpr' },
          { ref: 'postInc' },
          { ref: 'postDec' },
          { ref: 'primary' },
        ],
      },

      // name(args...)
      callExpr: {
        type: 'seq',
        items: ['IDENT', 'LPAREN', { ref: 'argList', quant: '?' }, 'RPAREN'],
        ast: {
          type: 'CallExpr',
          fields: { callee: { text: 0 }, args: { list: 2 } },
        },
      },

      // name[index]
      indexExpr: {
        type: 'seq',
        items: ['IDENT', 'LBRACKET', { ref: 'expr' }, 'RBRACKET'],
        ast: { type: 'IndexExpr', fields: { name: { text: 0 }, index: 2 } },
      },

      // name++  (new-value semantics: leaves incremented value on stack)
      postInc: {
        type: 'seq',
        items: ['IDENT', 'PLUS_PLUS'],
        ast: { type: 'PostIncExpr', fields: { name: { text: 0 } } },
      },
      // name--
      postDec: {
        type: 'seq',
        items: ['IDENT', 'MINUS_MINUS'],
        ast: { type: 'PostDecExpr', fields: { name: { text: 0 } } },
      },

      // argList — up to 3 args.
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
            ast: { type: '__list__', fields: { items: { listMerge: [0, 2, 4] } } },
          },
          {
            type: 'seq',
            items: [{ ref: 'expr' }, 'COMMA', { ref: 'expr' }],
            ast: { type: '__list__', fields: { items: { listMerge: [0, 2] } } },
          },
          {
            type: 'seq',
            items: [{ ref: 'expr' }],
            ast: { type: '__list__', fields: { items: { listMerge: [0] } } },
          },
        ],
      },

      // primary
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
  // Codegen templates
  // -------------------------------------------------------------------------
  codegen: {
    templates: [
      // Wrapper / pass-through nodes.
      { nodeType: 'Program', ops: ['EVAL ${body}'] },
      { nodeType: 'Block', ops: ['EVAL ${body}'] },
      { nodeType: '__list__', ops: ['EVAL ${__items__}'] },
      { nodeType: '__seq__', ops: ['EVAL ${__children__}'] },
      { nodeType: '__item__', ops: ['EVAL ${item}'] },

      // FuncDecl: declared via collectFunctions; emit nothing at the call site.
      { nodeType: 'FuncDecl', ops: [] },

      // ---- Variable declarations ----------------------------------------

      // int x = expr;  →  DECLARE_VAR x; EVAL expr; STORE_VAR x
      {
        nodeType: 'VarDecl',
        ops: [
          'DECLARE_VAR ${name}',
          'EVAL ${value}',
          'STORE_VAR ${name}',
        ],
      },

      // int arr[N];  →  declare arr as [] then fill with N zeros in a loop
      // using a scratch counter named __i (re-used across declarations).
      {
        nodeType: 'ArrayVarDecl',
        ops: [
          'DECLARE_VAR ${name}',
          'NEW_LIST 0',
          'STORE_VAR ${name}',
          'DECLARE_VAR __i',
          'PUSH_INT 0',
          'STORE_VAR __i',
          {
            while: {
              cond: ['LOAD_VAR __i', 'PUSH_INT ${size}', 'LT'],
              body: [
                'LOAD_VAR ${name}',
                'LOAD_VAR __i',
                'PUSH_INT 0',
                'SET_INDEX',
                'POP',
                'LOAD_VAR __i',
                'INC',
                'STORE_VAR __i',
              ],
            },
          },
        ],
      },

      // ---- Statements ---------------------------------------------------

      // exprStmt — evaluate then discard.
      { nodeType: 'ExprStmt', ops: ['EVAL ${expr}', 'POP'] },

      // printf expr;  →  EVAL expr; PRINT
      { nodeType: 'PrintfStmt', ops: ['EVAL ${value}', 'PRINT'] },

      // return expr?;  →  EVAL expr?; RET  (RET handles empty stack)
      { nodeType: 'ReturnStmt', ops: ['EVAL ${value}', 'RET'] },

      // if (cond) { then } [else { else }]
      // If `else` is absent, the else-branch is empty (EVAL undefined → noop).
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

      // while (cond) { body }
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

      // for (init; cond; update) body — desugar to:
      //   init; while (cond) { body; update; POP; }
      {
        nodeType: 'ForStmt',
        ops: [
          'EVAL ${init}',
          {
            while: {
              cond: ['EVAL ${cond}'],
              body: ['EVAL ${body}', 'EVAL ${update}', 'POP'],
            },
          },
        ],
      },
      // for (init; ; update) body — infinite loop
      {
        nodeType: 'ForStmtNoCond',
        ops: [
          'EVAL ${init}',
          {
            while: {
              cond: ['PUSH_BOOL true'],
              body: ['EVAL ${body}', 'EVAL ${update}', 'POP'],
            },
          },
        ],
      },
      // for (init; cond;) body
      {
        nodeType: 'ForStmtNoUpdate',
        ops: [
          'EVAL ${init}',
          {
            while: {
              cond: ['EVAL ${cond}'],
              body: ['EVAL ${body}'],
            },
          },
        ],
      },
      // for (init;;) body
      {
        nodeType: 'ForStmtBare',
        ops: [
          'EVAL ${init}',
          {
            while: {
              cond: ['PUSH_BOOL true'],
              body: ['EVAL ${body}'],
            },
          },
        ],
      },

      // ---- Literals -----------------------------------------------------

      { nodeType: 'NumberLit', ops: ['PUSH_INT ${value}'] },
      { nodeType: 'StringLit', ops: ['PUSH_STR ${value}'] },

      // ---- Variables ----------------------------------------------------

      { nodeType: 'VarRef', ops: ['LOAD_VAR ${name}'] },
      // x = expr  →  EVAL expr; DUP; STORE_VAR x   (leaves new value on stack)
      {
        nodeType: 'AssignExpr',
        ops: ['EVAL ${value}', 'DUP', 'STORE_VAR ${name}'],
      },
      { nodeType: 'ParenExpr', ops: ['EVAL ${expr}'] },

      // ---- Postfix: index, call, ++ / -- --------------------------------

      // arr[i]  →  LOAD_VAR arr; EVAL i; GET_INDEX
      {
        nodeType: 'IndexExpr',
        ops: ['LOAD_VAR ${name}', 'EVAL ${index}', 'GET_INDEX'],
      },
      // arr[i] = v  →  LOAD_VAR arr; EVAL i; EVAL v; SET_INDEX
      // (SET_INDEX leaves the list on the stack; ExprStmt's POP removes it)
      {
        nodeType: 'IndexAssignExpr',
        ops: [
          'LOAD_VAR ${name}',
          'EVAL ${index}',
          'EVAL ${value}',
          'SET_INDEX',
        ],
      },
      // f(args)  →  push args; push "f"; CALL argc
      {
        nodeType: 'CallExpr',
        ops: ['CALL ${callee} ${args}'],
      },
      // i++  →  LOAD_VAR i; INC; DUP; STORE_VAR i  (new-value semantics)
      {
        nodeType: 'PostIncExpr',
        ops: ['LOAD_VAR ${name}', 'INC', 'DUP', 'STORE_VAR ${name}'],
      },
      // i--
      {
        nodeType: 'PostDecExpr',
        ops: ['LOAD_VAR ${name}', 'DEC', 'DUP', 'STORE_VAR ${name}'],
      },

      // ---- Unary --------------------------------------------------------

      {
        nodeType: 'UnaryExpr',
        ops: ['EVAL ${operand}', 'UNARYOP ${op}'],
      },

      // ---- Binary chains ------------------------------------------------
      // Each chain: emit left, then for each rest item, emit right + binop.
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
        nodeType: 'Additive',
        ops: [
          'EVAL ${left}',
          { forEach: '${rest}', do: ['EVAL ${item.right}', 'BINOP ${item.op}'] },
        ],
      },
      {
        nodeType: 'Multiplicative',
        ops: [
          'EVAL ${left}',
          { forEach: '${rest}', do: ['EVAL ${item.right}', 'BINOP ${item.op}'] },
        ],
      },
    ],
  },
};
