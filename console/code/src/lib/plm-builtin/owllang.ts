/**
 * OwlLang — a feature-rich object-oriented language.
 *
 * Features:
 *   - Classes with fields, methods, constructors
 *   - Inheritance (single inheritance)
 *   - Method calls: obj.method(args)
 *   - Field access: obj.field
 *   - Exception handling: try/catch/throw
 *   - Closures (lambdas)
 *   - Lists and dictionaries
 *   - String operations
 *   - for-in loops over lists
 *   - Arithmetic, comparison, logical operators
 *   - Default imports (std.io, std.math, std.list, std.string)
 *
 * This is deliberately complex to stress-test the PLM toolchain.
 */

import { PlmConfig } from '../plm/config';

export const owllangConfig: PlmConfig = {
  language: {
    name: 'OwlLang',
    version: '1.0.0',
    fileExtension: 'owl',
    description:
      'Object-oriented language with classes, inheritance, exceptions, and closures.',
  },
  defaultImports: ['std.io', 'std.math', 'std.list', 'std.string'],
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
      { name: 'DOT', kind: 'literal', literal: '.' },
      { name: 'COLON', kind: 'literal', literal: ':' },

      // Operators (longest first)
      { name: 'EQEQ', kind: 'literal', literal: '==' },
      { name: 'NEQ', kind: 'literal', literal: '!=' },
      { name: 'LTE', kind: 'literal', literal: '<=' },
      { name: 'GTE', kind: 'literal', literal: '>=' },
      { name: 'AND', kind: 'literal', literal: '&&' },
      { name: 'OR', kind: 'literal', literal: '||' },
      { name: 'ARROW', kind: 'literal', literal: '->' },
      { name: 'EQUAL', kind: 'literal', literal: '=' },
      { name: 'LT', kind: 'literal', literal: '<' },
      { name: 'GT', kind: 'literal', literal: '>' },
      { name: 'PLUS', kind: 'literal', literal: '+' },
      { name: 'MINUS', kind: 'literal', literal: '-' },
      { name: 'STAR', kind: 'literal', literal: '*' },
      { name: 'SLASH', kind: 'literal', literal: '/' },
      { name: 'PERCENT', kind: 'literal', literal: '%' },
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
      class: 'CLASS',
      extends: 'EXTENDS',
      new: 'NEW',
      this: 'THIS',
      super: 'SUPER',
      fn: 'FN',
      return: 'RETURN',
      if: 'IF',
      else: 'ELSE',
      elif: 'ELIF',
      while: 'WHILE',
      for: 'FOR',
      in: 'IN',
      break: 'BREAK',
      continue: 'CONTINUE',
      try: 'TRY',
      catch: 'CATCH',
      throw: 'THROW',
      let: 'LET',
      true: 'TRUE',
      false: 'FALSE',
      null: 'NULL',
      print: 'PRINT',
      len: 'LEN',
    },
  },
  grammar: {
    start: 'program',
    rules: {
      program: {
        type: 'seq',
        items: [{ ref: 'declaration', quant: '*' }],
        ast: { type: 'Program', fields: { body: { list: 0 } } },
      },

      declaration: {
        type: 'choice',
        options: [{ ref: 'classDecl' }, { ref: 'funcDecl' }, { ref: 'statement' }],
      },

      // class Name { field* method* }
      classDecl: {
        type: 'seq',
        items: [
          'CLASS',
          'IDENT',
          { ref: 'extendsClause', quant: '?' },
          'LBRACE',
          { ref: 'classMember', quant: '*' },
          'RBRACE',
        ],
        ast: {
          type: 'ClassDecl',
          fields: {
            name: { text: 1 },
            parent: 2,
            members: { list: 4 },
          },
        },
      },

      extendsClause: {
        type: 'seq',
        items: ['EXTENDS', 'IDENT'],
        ast: { type: 'Extends', fields: { parent: { text: 1 } } },
      },

      classMember: {
        type: 'choice',
        options: [{ ref: 'fieldDecl' }, { ref: 'methodDecl' }],
      },

      // field: IDENT ;
      fieldDecl: {
        type: 'seq',
        items: ['IDENT', 'SEMICOLON'],
        ast: { type: 'FieldDecl', fields: { name: { text: 0 } } },
      },

      // method: fn name(params) { body }
      methodDecl: {
        type: 'seq',
        items: ['FN', 'IDENT', 'LPAREN', { ref: 'paramList', quant: '?' }, 'RPAREN', { ref: 'block' }],
        ast: {
          type: 'MethodDecl',
          fields: { name: { text: 1 }, params: { list: 3 }, body: 5 },
        },
      },

      funcDecl: {
        type: 'seq',
        items: ['FN', 'IDENT', 'LPAREN', { ref: 'paramList', quant: '?' }, 'RPAREN', { ref: 'block' }],
        ast: {
          type: 'FuncDecl',
          fields: { name: { text: 1 }, params: { list: 3 }, body: 5 },
        },
      },

      paramList: {
        type: 'seq',
        items: [
          'IDENT',
          { ref: 'paramRest', quant: '*' },
        ],
        ast: { type: '__list__', fields: { items: { listMerge: [0, 1] } } },
      },
      paramRest: {
        type: 'seq',
        items: ['COMMA', 'IDENT'],
        ast: { type: '__item__', fields: { item: { text: 1 } } },
      },

      statement: {
        type: 'choice',
        options: [
          { ref: 'letStmt' },
          { ref: 'ifStmt' },
          { ref: 'whileStmt' },
          { ref: 'forStmt' },
          { ref: 'returnStmt' },
          { ref: 'printStmt' },
          { ref: 'tryStmt' },
          { ref: 'throwStmt' },
          { ref: 'breakStmt' },
          { ref: 'continueStmt' },
          { ref: 'exprStmt' },
          { ref: 'block' },
        ],
      },

      letStmt: {
        type: 'seq',
        items: ['LET', 'IDENT', 'EQUAL', { ref: 'expr' }, 'SEMICOLON'],
        ast: { type: 'LetStmt', fields: { name: { text: 1 }, value: 3 } },
      },

      ifStmt: {
        type: 'seq',
        items: ['IF', 'LPAREN', { ref: 'expr' }, 'RPAREN', { ref: 'block' }, { ref: 'elifClause', quant: '*' }, { ref: 'elseClause', quant: '?' }],
        ast: { type: 'IfStmt', fields: { cond: 2, then: 4, elifs: { list: 5 }, else: 6 } },
      },
      elifClause: {
        type: 'seq',
        items: ['ELIF', 'LPAREN', { ref: 'expr' }, 'RPAREN', { ref: 'block' }],
        ast: { type: 'ElifClause', fields: { cond: 2, body: 4 } },
      },
      elseClause: {
        type: 'seq',
        items: ['ELSE', { ref: 'block' }],
        ast: { type: 'ElseClause', fields: { body: 1 } },
      },

      whileStmt: {
        type: 'seq',
        items: ['WHILE', 'LPAREN', { ref: 'expr' }, 'RPAREN', { ref: 'block' }],
        ast: { type: 'WhileStmt', fields: { cond: 2, body: 4 } },
      },

      forStmt: {
        type: 'seq',
        items: ['FOR', 'LPAREN', 'IDENT', 'IN', { ref: 'expr' }, 'RPAREN', { ref: 'block' }],
        ast: { type: 'ForStmt', fields: { var: { text: 2 }, iterable: 4, body: 6 } },
      },

      returnStmt: {
        type: 'choice',
        options: [
          { type: 'seq', items: ['RETURN', { ref: 'expr' }, 'SEMICOLON'], ast: { type: 'ReturnStmt', fields: { value: 1 } } },
          { type: 'seq', items: ['RETURN', 'SEMICOLON'], ast: { type: 'ReturnStmt', fields: { value: 'null' } } },
        ],
      },

      printStmt: {
        type: 'seq',
        items: ['PRINT', { ref: 'expr' }, 'SEMICOLON'],
        ast: { type: 'PrintStmt', fields: { value: 1 } },
      },

      tryStmt: {
        type: 'seq',
        items: ['TRY', { ref: 'block' }, 'CATCH', 'LPAREN', 'IDENT', 'RPAREN', { ref: 'block' }],
        ast: { type: 'TryStmt', fields: { body: 1, catchVar: { text: 4 }, catchBody: 6 } },
      },

      throwStmt: {
        type: 'seq',
        items: ['THROW', { ref: 'expr' }, 'SEMICOLON'],
        ast: { type: 'ThrowStmt', fields: { value: 1 } },
      },

      breakStmt: {
        type: 'seq',
        items: ['BREAK', 'SEMICOLON'],
        ast: { type: 'BreakStmt' },
      },
      continueStmt: {
        type: 'seq',
        items: ['CONTINUE', 'SEMICOLON'],
        ast: { type: 'ContinueStmt' },
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

      // Expression grammar
      expr: { type: 'choice', options: [{ ref: 'assign' }, { ref: 'lambda' }, { ref: 'logicOr' }] },

      assign: {
        type: 'seq',
        items: [{ ref: 'postfix' }, 'EQUAL', { ref: 'expr' }],
        ast: { type: 'AssignExpr', fields: { target: 0, value: 2 } },
      },

      lambda: {
        type: 'seq',
        items: ['FN', 'LPAREN', { ref: 'paramList', quant: '?' }, 'RPAREN', { ref: 'block' }],
        ast: { type: 'Lambda', fields: { params: { list: 2 }, body: 4 } },
      },

      logicOr: {
        type: 'seq',
        items: [{ ref: 'logicAnd' }, { ref: 'orRest', quant: '*' }],
        ast: { type: 'BinChain', fields: { left: 0, rest: { list: 1 } } },
      },
      orRest: {
        type: 'seq',
        items: ['OR', { ref: 'logicAnd' }],
        ast: { type: 'BinTerm', fields: { op: '||', right: 1 } },
      },

      logicAnd: {
        type: 'seq',
        items: [{ ref: 'equality' }, { ref: 'andRest', quant: '*' }],
        ast: { type: 'BinChain', fields: { left: 0, rest: { list: 1 } } },
      },
      andRest: {
        type: 'seq',
        items: ['AND', { ref: 'equality' }],
        ast: { type: 'BinTerm', fields: { op: '&&', right: 1 } },
      },

      equality: {
        type: 'seq',
        items: [{ ref: 'comparison' }, { ref: 'eqRest', quant: '*' }],
        ast: { type: 'BinChain', fields: { left: 0, rest: { list: 1 } } },
      },
      eqRest: {
        type: 'choice',
        options: [
          { type: 'seq', items: ['EQEQ', { ref: 'comparison' }], ast: { type: 'BinTerm', fields: { op: '==', right: 1 } } },
          { type: 'seq', items: ['NEQ', { ref: 'comparison' }], ast: { type: 'BinTerm', fields: { op: '!=', right: 1 } } },
        ],
      },

      comparison: {
        type: 'seq',
        items: [{ ref: 'addExpr' }, { ref: 'cmpRest', quant: '*' }],
        ast: { type: 'BinChain', fields: { left: 0, rest: { list: 1 } } },
      },
      cmpRest: {
        type: 'choice',
        options: [
          { type: 'seq', items: ['LT', { ref: 'addExpr' }], ast: { type: 'BinTerm', fields: { op: '<', right: 1 } } },
          { type: 'seq', items: ['GT', { ref: 'addExpr' }], ast: { type: 'BinTerm', fields: { op: '>', right: 1 } } },
          { type: 'seq', items: ['LTE', { ref: 'addExpr' }], ast: { type: 'BinTerm', fields: { op: '<=', right: 1 } } },
          { type: 'seq', items: ['GTE', { ref: 'addExpr' }], ast: { type: 'BinTerm', fields: { op: '>=', right: 1 } } },
        ],
      },

      addExpr: {
        type: 'seq',
        items: [{ ref: 'mulExpr' }, { ref: 'addRest', quant: '*' }],
        ast: { type: 'BinChain', fields: { left: 0, rest: { list: 1 } } },
      },
      addRest: {
        type: 'choice',
        options: [
          { type: 'seq', items: ['PLUS', { ref: 'mulExpr' }], ast: { type: 'BinTerm', fields: { op: '+', right: 1 } } },
          { type: 'seq', items: ['MINUS', { ref: 'mulExpr' }], ast: { type: 'BinTerm', fields: { op: '-', right: 1 } } },
        ],
      },

      mulExpr: {
        type: 'seq',
        items: [{ ref: 'unary' }, { ref: 'mulRest', quant: '*' }],
        ast: { type: 'BinChain', fields: { left: 0, rest: { list: 1 } } },
      },
      mulRest: {
        type: 'choice',
        options: [
          { type: 'seq', items: ['STAR', { ref: 'unary' }], ast: { type: 'BinTerm', fields: { op: '*', right: 1 } } },
          { type: 'seq', items: ['SLASH', { ref: 'unary' }], ast: { type: 'BinTerm', fields: { op: '/', right: 1 } } },
          { type: 'seq', items: ['PERCENT', { ref: 'unary' }], ast: { type: 'BinTerm', fields: { op: '%', right: 1 } } },
        ],
      },

      unary: {
        type: 'choice',
        options: [
          { type: 'seq', items: ['MINUS', { ref: 'unary' }], ast: { type: 'UnaryExpr', fields: { op: '-', operand: 1 } } },
          { type: 'seq', items: ['BANG', { ref: 'unary' }], ast: { type: 'UnaryExpr', fields: { op: '!', operand: 1 } } },
          { ref: 'newExpr' },
          { ref: 'postfix' },
        ],
      },

      // new ClassName(args)
      newExpr: {
        type: 'seq',
        items: ['NEW', 'IDENT', 'LPAREN', { ref: 'argList', quant: '?' }, 'RPAREN'],
        ast: { type: 'NewExpr', fields: { className: { text: 1 }, args: { list: 3 } } },
      },

      // Postfix: method calls and field access
      // obj.method(args)  or  obj.field
      postfix: {
        type: 'seq',
        items: [{ ref: 'primary' }, { ref: 'postfixOp', quant: '*' }],
        ast: { type: 'Postfix', fields: { base: 0, ops: { list: 1 } } },
      },
      postfixOp: {
        type: 'choice',
        options: [
          // .method(args)
          {
            type: 'seq',
            items: ['DOT', 'IDENT', 'LPAREN', { ref: 'argList', quant: '?' }, 'RPAREN'],
            ast: { type: 'MethodCall', fields: { name: { text: 1 }, args: { list: 3 } } },
          },
          // .field
          {
            type: 'seq',
            items: ['DOT', 'IDENT'],
            ast: { type: 'FieldAccess', fields: { name: { text: 1 } } },
          },
          // [index]
          {
            type: 'seq',
            items: ['LBRACKET', { ref: 'expr' }, 'RBRACKET'],
            ast: { type: 'IndexAccess', fields: { index: 1 } },
          },
        ],
      },

      primary: {
        type: 'choice',
        options: [
          { type: 'seq', items: ['NUMBER'], ast: { type: 'NumberLit', fields: { value: { value: 0 } } } },
          { type: 'seq', items: ['STRING'], ast: { type: 'StringLit', fields: { value: { value: 0 } } } },
          { type: 'seq', items: ['TRUE'], ast: { type: 'BoolLit', fields: { value: 'true' } } },
          { type: 'seq', items: ['FALSE'], ast: { type: 'BoolLit', fields: { value: 'false' } } },
          { type: 'seq', items: ['NULL'], ast: { type: 'NullLit' } },
          { type: 'seq', items: ['THIS'], ast: { type: 'ThisExpr' } },
          // Function call: IDENT(args)
          { type: 'seq', items: ['IDENT', 'LPAREN', { ref: 'argList', quant: '?' }, 'RPAREN'], ast: { type: 'CallExpr', fields: { callee: { text: 0 }, args: { list: 2 } } } },
          { type: 'seq', items: ['IDENT'], ast: { type: 'VarRef', fields: { name: { text: 0 } } } },
          { type: 'seq', items: ['LPAREN', { ref: 'expr' }, 'RPAREN'], ast: { type: 'ParenExpr', fields: { expr: 1 } } },
          { type: 'seq', items: ['LBRACKET', { ref: 'argList', quant: '?' }, 'RBRACKET'], ast: { type: 'ListLit', fields: { items: { list: 1 } } } },
          { type: 'seq', items: ['LEN', 'LPAREN', { ref: 'expr' }, 'RPAREN'], ast: { type: 'LenExpr', fields: { value: 2 } } },
        ],
      },

      argList: {
        type: 'seq',
        items: [
          { ref: 'expr' },
          { ref: 'argRest', quant: '*' },
        ],
        ast: { type: '__list__', fields: { items: { listMerge: [0, 1] } } },
      },
      argRest: {
        type: 'seq',
        items: ['COMMA', { ref: 'expr' }],
        ast: { type: '__item__', fields: { item: 1 } },
      },
    },
  },
  codegen: {
    templates: [
      // Pass-through nodes
      { nodeType: 'Program', ops: ['EVAL ${body}'] },
      { nodeType: 'Block', ops: ['EVAL ${body}'] },
      { nodeType: '__list__', ops: ['EVAL ${__items__}'] },
      { nodeType: '__seq__', ops: ['EVAL ${__children__}'] },
      { nodeType: '__item__', ops: ['EVAL ${item}'] },
      { nodeType: 'ParenExpr', ops: ['EVAL ${expr}'] },

      // Class declaration — register as a factory function
      { nodeType: 'ClassDecl', ops: [] },
      { nodeType: 'Extends', ops: [] },
      { nodeType: 'FieldDecl', ops: [] },
      { nodeType: 'MethodDecl', ops: [] },

      // Function declaration
      { nodeType: 'FuncDecl', ops: [] },

      // Lambda
      { nodeType: 'Lambda', ops: [] },

      // Statements
      { nodeType: 'LetStmt', ops: ['DECLARE_VAR ${name}', 'EVAL ${value}', 'STORE_VAR ${name}'] },
      { nodeType: 'ExprStmt', ops: ['EVAL ${expr}', 'POP'] },
      { nodeType: 'PrintStmt', ops: ['EVAL ${value}', 'PRINT'] },

      // Return — emit RET
      { nodeType: 'ReturnStmt', ops: ['EVAL ${value}', 'RET'] },

      // If/elif/else
      { nodeType: 'IfStmt', ops: [] },
      { nodeType: 'ElifClause', ops: [] },
      { nodeType: 'ElseClause', ops: [] },

      // While
      { nodeType: 'WhileStmt', ops: [] },

      // For-in
      { nodeType: 'ForStmt', ops: [] },

      // Try/catch/throw — simplified (catch is best-effort)
      { nodeType: 'TryStmt', ops: ['EVAL ${body}', 'POP'] },
      { nodeType: 'ThrowStmt', ops: ['EVAL ${value}', 'POP'] },

      // Break/continue — simplified (no-op for now, would need loop labels)
      { nodeType: 'BreakStmt', ops: [] },
      { nodeType: 'ContinueStmt', ops: [] },

      // Expressions
      { nodeType: 'NumberLit', ops: ['PUSH_INT ${value}'] },
      { nodeType: 'StringLit', ops: ['PUSH_STR ${value}'] },
      { nodeType: 'BoolLit', ops: ['PUSH_BOOL ${value}'] },
      { nodeType: 'NullLit', ops: ['PUSH_NULL'] },
      { nodeType: 'ThisExpr', ops: ['LOAD_VAR this'] },
      { nodeType: 'VarRef', ops: ['LOAD_VAR ${name}'] },
      { nodeType: 'LenExpr', ops: ['EVAL ${value}', 'LEN'] },

      // Assign — only used for simple var assignment (field/index handled in codegen)
      { nodeType: 'AssignExpr', ops: ['EVAL ${value}', 'DUP', 'STORE_VAR ${target.base.name}'] },

      // Function call: IDENT(args)
      { nodeType: 'CallExpr', ops: ['CALL ${callee} ${args}'] },

      // Binary chains
      { nodeType: 'BinChain', ops: [
        'EVAL ${left}',
        { forEach: '${rest}', do: ['EVAL ${item.right}', 'BINOP ${item.op}'] },
      ] },
      { nodeType: 'BinTerm', ops: [] },

      // Unary
      { nodeType: 'UnaryExpr', ops: ['EVAL ${operand}', 'UNARYOP ${op}'] },

      // New expression — create an object (record)
      { nodeType: 'NewExpr', ops: [] },

      // Postfix — method calls and field access
      { nodeType: 'Postfix', ops: [] },

      // Method call
      { nodeType: 'MethodCall', ops: [] },

      // Field access
      { nodeType: 'FieldAccess', ops: [] },

      // Index access
      { nodeType: 'IndexAccess', ops: [] },

      // List literal
      { nodeType: 'ListLit', ops: [
        { forEach: '${items}', do: ['EVAL ${item}'] },
        'NEW_LIST ${items}',
      ] },
    ],
  },
};
