/**
 * MiniLisp — a small Lisp/Scheme dialect.
 *
 * Features:
 *   - S-expression syntax: (+ 1 2), (define x 5), (lambda (x) (* x x))
 *   - Atomic types: numbers, symbols (identifiers), strings, booleans (#t #f), nil
 *   - Special forms: define, lambda, if, cond, let, quote, begin
 *   - Built-in functions: + - * / = < > <= >= and or not car cdr cons null? list print display
 *   - Comments: ; line comments
 *   - Lists are QVM lists
 *
 * Example:
 *
 *   (define (fact n)
 *     (if (<= n 1) 1 (* n (fact (- n 1)))))
 *   (print (fact 5))   ; => 120
 *
 * Architecture:
 *   The grammar produces a uniform ListExpr node for every parenthesised
 *   form, plus atom nodes (NumberLit, StringLit, BoolLit, NilLit, Symbol)
 *   and a Quote node for quoted expressions. The codegen dispatches on the
 *   first element of ListExpr to detect special forms (define, lambda, if,
 *   let, cond, begin, quote) — see emitListExpr in codegen.ts. Everything
 *   else is treated as a function application or built-in op.
 */

import { PlmConfig } from '../plm/config';

export const minilispConfig: PlmConfig = {
  language: {
    name: 'MiniLisp',
    version: '1.0.0',
    fileExtension: 'mlisp',
    description:
      'A small Lisp/Scheme dialect with S-expressions, lambdas, and list operations.',
  },
  lexer: {
    whitespace: [' ', '\t', '\n', '\r'],
    comments: { line: ';' },
    tokens: [
      // Punctuation
      { name: 'LPAREN', kind: 'literal', literal: '(' },
      { name: 'RPAREN', kind: 'literal', literal: ')' },
      { name: 'QUOTE', kind: 'literal', literal: "'" },

      // Literals
      { name: 'NUMBER', kind: 'number', digits: '0-9' },
      {
        name: 'STRING',
        kind: 'string',
        startQuote: '"',
        endQuote: '"',
        escape: '\\',
      },

      // Identifiers / symbols — Lisp symbols are very permissive.
      // We allow letters, digits, _, and the common operator/symbol chars.
      // `#` is allowed as a start char so that #t / #f lex as IDENTs that
      // are then converted to BOOL tokens via the keyword table.
      {
        name: 'IDENT',
        kind: 'ident',
        startChars: [
          'a-z', 'A-Z', '_',
          '+', '-', '*', '/', '=',
          '<', '>', '!', '?', '#',
        ],
        continueChars: [
          'a-z', 'A-Z', '0-9', '_',
          '+', '-', '*', '/', '=',
          '<', '>', '!', '?', '#',
        ],
      },
    ],
    keywords: {
      '#t': 'BOOL_T',
      '#f': 'BOOL_F',
      'nil': 'NIL',
    },
  },
  grammar: {
    start: 'program',
    rules: {
      program: {
        type: 'seq',
        items: [{ ref: 'expr', quant: '*' }],
        ast: { type: 'Program', fields: { body: { list: 0 } } },
      },

      expr: {
        type: 'choice',
        options: [
          { ref: 'atom' },
          { ref: 'list' },
          { ref: 'quoted' },
        ],
      },

      atom: {
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
            items: ['BOOL_T'],
            ast: { type: 'BoolLit', fields: { value: 'true' } },
          },
          {
            type: 'seq',
            items: ['BOOL_F'],
            ast: { type: 'BoolLit', fields: { value: 'false' } },
          },
          {
            type: 'seq',
            items: ['NIL'],
            ast: { type: 'NilLit' },
          },
          {
            type: 'seq',
            items: ['IDENT'],
            ast: { type: 'Symbol', fields: { name: { text: 0 } } },
          },
        ],
      },

      list: {
        type: 'seq',
        items: ['LPAREN', { ref: 'expr', quant: '*' }, 'RPAREN'],
        ast: { type: 'ListExpr', fields: { items: { list: 1 } } },
      },

      quoted: {
        type: 'seq',
        items: ['QUOTE', { ref: 'expr' }],
        ast: { type: 'Quote', fields: { expr: 1 } },
      },
    },
  },
  codegen: {
    templates: [
      // Wrapper / pass-through nodes.
      { nodeType: 'Program', ops: ['EVAL ${body}'] },
      { nodeType: '__list__', ops: ['EVAL ${__items__}'] },
      { nodeType: '__seq__', ops: ['EVAL ${__children__}'] },
      { nodeType: '__item__', ops: ['EVAL ${item}'] },

      // Literals.
      { nodeType: 'NumberLit', ops: ['PUSH_INT ${value}'] },
      { nodeType: 'StringLit', ops: ['PUSH_STR ${value}'] },
      { nodeType: 'BoolLit', ops: ['PUSH_BOOL ${value}'] },
      { nodeType: 'NilLit', ops: ['NEW_LIST 0'] },

      // Symbol used as a variable reference.
      // (When a Symbol appears as the first element of a ListExpr, the
      //  codegen's emitListExpr inspects it directly without going through
      //  this template.)
      { nodeType: 'Symbol', ops: ['LOAD_VAR ${name}'] },

      // ListExpr and Quote are handled by special-case code in
      // CodeGenerator.emitNode (see emitListExpr / emitQuoteNode).
      { nodeType: 'ListExpr', ops: [] },
      { nodeType: 'Quote', ops: [] },
    ],
  },
};
