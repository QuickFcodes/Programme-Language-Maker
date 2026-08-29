/**
 * MiniLang — a small but practical language that demonstrates PLM.
 *
 * Features:
 *   - Numbers, strings, booleans, null
 *   - Variables (let)
 *   - Arithmetic + - * / %
 *   - Comparison < > <= >= == !=
 *   - Logical and / or / not
 *   - if / else
 *   - while
 *   - Functions (fn name(params) { ... })
 *   - return
 *   - print statement
 *   - Lists
 *
 * Example:
 *
 *   fn fib(n) {
 *     if (n < 2) { return n; }
 *     return fib(n - 1) + fib(n - 2);
 *   }
 *   let i = 0;
 *   while (i < 10) {
 *     print fib(i);
 *     i = i + 1;
 *   }
 */

import { PlmConfig } from '../plm/config';

export const minilangConfig: PlmConfig = {
  language: {
    name: 'MiniLang',
    version: '1.0.0',
    fileExtension: 'ml',
    description:
      'A small imperative language with functions, control flow, lists, and recursion.',
  },
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

      // Operators (longest-first by virtue of literal sort)
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
      { name: 'AND', kind: 'literal', literal: '&&' },
      { name: 'OR', kind: 'literal', literal: '||' },
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
      let: 'LET',
      fn: 'FN',
      return: 'RETURN',
      if: 'IF',
      else: 'ELSE',
      while: 'WHILE',
      true: 'TRUE',
      false: 'FALSE',
      null: 'NULL',
      print: 'PRINT',
      and: 'AND_KW',
      or: 'OR_KW',
      not: 'NOT_KW',
    },
  },
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
          { ref: 'letStmt' },
          { ref: 'fnStmt' },
          { ref: 'returnStmt' },
          { ref: 'ifStmt' },
          { ref: 'whileStmt' },
          { ref: 'printStmt' },
          { ref: 'exprStmt' },
        ],
      },

      letStmt: {
        type: 'seq',
        items: ['LET', 'IDENT', 'EQUAL', { ref: 'expr' }, 'SEMICOLON'],
        ast: {
          type: 'LetStmt',
          fields: { name: { text: 1 }, value: 3 },
        },
      },

      fnStmt: {
        type: 'seq',
        items: [
          'FN',
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

      paramList: {
        type: 'choice',
        options: [
          {
            // 3 params: IDENT, IDENT, IDENT
            type: 'seq',
            items: ['IDENT', 'COMMA', 'IDENT', 'COMMA', 'IDENT'],
            ast: {
              type: '__list__',
              fields: { items: { listMerge: [0, 2, 4] } },
            },
          },
          {
            // 2 params: IDENT, IDENT
            type: 'seq',
            items: ['IDENT', 'COMMA', 'IDENT'],
            ast: {
              type: '__list__',
              fields: { items: { listMerge: [0, 2] } },
            },
          },
          {
            // 1 param
            type: 'seq',
            items: ['IDENT'],
            ast: { type: '__list__', fields: { items: { listMerge: [0] } } },
          },
        ],
      },

      returnStmt: {
        type: 'seq',
        items: ['RETURN', { ref: 'expr', quant: '?' }, 'SEMICOLON'],
        ast: { type: 'ReturnStmt', fields: { value: 1 } },
      },

      ifStmt: {
        type: 'seq',
        items: ['IF', 'LPAREN', { ref: 'expr' }, 'RPAREN', { ref: 'block' }],
        ast: { type: 'IfStmt', fields: { cond: 2, then: 4 } },
      },

      whileStmt: {
        type: 'seq',
        items: ['WHILE', 'LPAREN', { ref: 'expr' }, 'RPAREN', { ref: 'block' }],
        ast: { type: 'WhileStmt', fields: { cond: 2, body: 4 } },
      },

      printStmt: {
        type: 'seq',
        items: ['PRINT', { ref: 'expr' }, 'SEMICOLON'],
        ast: { type: 'PrintStmt', fields: { value: 1 } },
      },

      exprStmt: {
        type: 'seq',
        items: [{ ref: 'expr' }, 'SEMICOLON'],
        ast: { type: 'ExprStmt', fields: { expr: 0 } },
      },

      block: {
        type: 'seq',
        items: ['LBRACE', { ref: 'statement', quant: '*' }, 'RBRACE'],
        ast: { type: 'Block', fields: { body: { list: 1 } } },
      },

      // Expression grammar (precedence climbing via layered rules).
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
        items: [
          'IDENT',
          'LPAREN',
          { ref: 'argList', quant: '?' },
          'RPAREN',
        ],
        ast: {
          type: 'CallExpr',
          fields: { callee: { text: 0 }, args: { list: 2 } },
        },
      },

      argList: {
        type: 'choice',
        options: [
          {
            // 3 args
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
            // 2 args
            type: 'seq',
            items: [{ ref: 'expr' }, 'COMMA', { ref: 'expr' }],
            ast: {
              type: '__list__',
              fields: { items: { listMerge: [0, 2] } },
            },
          },
          {
            // 1 arg
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
          {
            type: 'seq',
            items: ['TRUE'],
            ast: { type: 'BoolLit', fields: { value: 'true' } },
          },
          {
            type: 'seq',
            items: ['FALSE'],
            ast: { type: 'BoolLit', fields: { value: 'false' } },
          },
          {
            type: 'seq',
            items: ['NULL'],
            ast: { type: 'NullLit' },
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
          {
            type: 'seq',
            items: ['LBRACKET', { ref: 'argList', quant: '?' }, 'RBRACKET'],
            ast: { type: 'ListLit', fields: { items: { list: 1 } } },
          },
        ],
      },
    },
  },
  codegen: {
    templates: [
      // Wrapper / pass-through nodes.
      { nodeType: 'Program', ops: ['EVAL ${body}'] },
      { nodeType: 'Block', ops: ['EVAL ${body}'] },
      { nodeType: '__list__', ops: ['EVAL ${__items__}'] },
      { nodeType: '__seq__', ops: ['EVAL ${__children__}'] },
      { nodeType: '__item__', ops: ['EVAL ${item}'] },

      // Statements.
      { nodeType: 'LetStmt', ops: ['DECLARE_VAR ${name}', 'EVAL ${value}', 'STORE_VAR ${name}'] },
      { nodeType: 'ExprStmt', ops: ['EVAL ${expr}', 'POP'] },
      { nodeType: 'PrintStmt', ops: ['EVAL ${value}', 'PRINT'] },
      { nodeType: 'ReturnStmt', ops: ['EVAL ${value}', 'RET'] },
      {
        nodeType: 'IfStmt',
        ops: [
          {
            if: {
              cond: ['EVAL ${cond}'],
              then: ['EVAL ${then}'],
              else: [],
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
      // FuncDecl: declared via collectFunctions; emit nothing here.
      { nodeType: 'FuncDecl', ops: [] },

      // Literals.
      { nodeType: 'NumberLit', ops: ['PUSH_INT ${value}'] },
      { nodeType: 'StringLit', ops: ['PUSH_STR ${value}'] },
      { nodeType: 'BoolLit', ops: ['PUSH_BOOL ${value}'] },
      { nodeType: 'NullLit', ops: ['PUSH_NULL'] },

      // Variables.
      { nodeType: 'VarRef', ops: ['LOAD_VAR ${name}'] },
      { nodeType: 'AssignExpr', ops: ['EVAL ${value}', 'DUP', 'STORE_VAR ${name}'] },
      { nodeType: 'ParenExpr', ops: ['EVAL ${expr}'] },

      // Unary.
      {
        nodeType: 'UnaryExpr',
        ops: [
          // For '-', emit NEG; for '!', emit NOT.
          // We can dispatch via a small if-template using field equality.
          // But our template language doesn't support field equality checks.
          // Instead, we use BINOP-like dispatch via a new op "UNARYOP".
          // For simplicity: hardcode both ops, then NOT pops the value
          // and pushes !value, but for '-' we need NEG. Since only one path
          // is taken at runtime, we use a trick: emit operand, then emit
          // a sentinel op that the codegen resolves based on the op field.
          'EVAL ${operand}',
          'UNARYOP ${op}',
        ],
      },

      // Binary chains. Each chain is:
      //   node = { left: <ast>, rest: [{op, right}, ...] }
      // Reduction: emit left, then for each rest item: emit right, emit binop.
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

      // Call.
      {
        nodeType: 'CallExpr',
        ops: ['CALL ${callee} ${args}'],
      },

      // List literal.
      {
        nodeType: 'ListLit',
        ops: [
          { forEach: '${items}', do: ['EVAL ${item}'] },
          'NEW_LIST ${items}',
        ],
      },
    ],
  },
};
