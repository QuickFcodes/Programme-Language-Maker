/**
 * MiniHaskell — a small lazy-ish functional language.
 *
 * Features:
 *   - Integers, booleans
 *   - Lambda expressions: \x -> expr   (also \x y z -> expr)
 *   - Function application: f x y   (left-associative, juxtaposition)
 *   - Let bindings: let x = expr in body
 *   - Letrec: letrec name = \args -> body in rest
 *   - If: if cond then a else b
 *   - List literals: [1, 2, 3]
 *   - Cons: x : xs
 *   - Pattern matching on lists: case xs of [] -> a ; (x:xs) -> b
 *   - Built-in arithmetic, comparison
 *
 * Note: True laziness is not implemented (eager evaluation), but the
 * surface syntax and semantics are Haskell-like.
 *
 * Example:
 *   let map = \f xs ->
 *     case xs of
 *       [] -> []
 *       (x:xs) -> f x : map f xs
 *   in
 *   map (\x -> x * 2) [1, 2, 3, 4]
 */

import { PlmConfig } from '../plm/config';

export const minihaskellConfig: PlmConfig = {
  language: {
    name: 'MiniHaskell',
    version: '1.0.0',
    fileExtension: 'mhs',
    description:
      'A small functional language with lambdas, let, pattern matching, and list operations.',
  },
  lexer: {
    whitespace: [' ', '\t', '\n', '\r'],
    comments: { line: '--', blockStart: '{-', blockEnd: '-}' },
    tokens: [
      // Punctuation
      { name: 'LPAREN', kind: 'literal', literal: '(' },
      { name: 'RPAREN', kind: 'literal', literal: ')' },
      { name: 'LBRACKET', kind: 'literal', literal: '[' },
      { name: 'RBRACKET', kind: 'literal', literal: ']' },
      { name: 'COMMA', kind: 'literal', literal: ',' },
      { name: 'SEMICOLON', kind: 'literal', literal: ';' },
      { name: 'ARROW', kind: 'literal', literal: '->' },
      { name: 'LAMBDA', kind: 'literal', literal: '\\' },
      { name: 'EQUAL', kind: 'literal', literal: '=' },
      { name: 'PIPE', kind: 'literal', literal: '|' },
      { name: 'COLON', kind: 'literal', literal: ':' },

      // Operators
      { name: 'PLUS', kind: 'literal', literal: '+' },
      { name: 'MINUS', kind: 'literal', literal: '-' },
      { name: 'STAR', kind: 'literal', literal: '*' },
      { name: 'SLASH', kind: 'literal', literal: '/' },
      { name: 'EQEQ', kind: 'literal', literal: '==' },
      { name: 'NEQ', kind: 'literal', literal: '/=' },
      { name: 'LT', kind: 'literal', literal: '<' },
      { name: 'GT', kind: 'literal', literal: '>' },
      { name: 'LTE', kind: 'literal', literal: '<=' },
      { name: 'GTE', kind: 'literal', literal: '>=' },
      { name: 'AND', kind: 'literal', literal: '&&' },
      { name: 'OR', kind: 'literal', literal: '||' },

      // Literals
      { name: 'NUMBER', kind: 'number', digits: '0-9' },

      // Identifiers
      {
        name: 'IDENT',
        kind: 'ident',
        startChars: ['a-z', 'A-Z', '_'],
        continueChars: ['a-z', 'A-Z', '0-9', '_', "'"],
      },
    ],
    keywords: {
      let: 'LET',
      in: 'IN',
      letrec: 'LETREC',
      if: 'IF',
      then: 'THEN',
      else: 'ELSE',
      true: 'TRUE',
      false: 'FALSE',
      case: 'CASE',
      of: 'OF',
    },
  },
  grammar: {
    start: 'program',
    rules: {
      program: {
        type: 'seq',
        items: [{ ref: 'expr' }],
        ast: { type: 'Program', fields: { body: 0 } },
      },

      expr: {
        type: 'choice',
        options: [
          { ref: 'letExpr' },
          { ref: 'letrecExpr' },
          { ref: 'ifExpr' },
          { ref: 'caseExpr' },
          { ref: 'lambda' },
          { ref: 'binExpr' },
        ],
      },

      letExpr: {
        type: 'seq',
        items: ['LET', 'IDENT', 'EQUAL', { ref: 'expr' }, 'IN', { ref: 'expr' }],
        ast: { type: 'Let', fields: { name: { text: 1 }, value: 3, body: 5 } },
      },

      letrecExpr: {
        type: 'seq',
        items: ['LETREC', 'IDENT', 'EQUAL', { ref: 'expr' }, 'IN', { ref: 'expr' }],
        ast: { type: 'LetRec', fields: { name: { text: 1 }, value: 3, body: 5 } },
      },

      ifExpr: {
        type: 'seq',
        items: ['IF', { ref: 'expr' }, 'THEN', { ref: 'expr' }, 'ELSE', { ref: 'expr' }],
        ast: { type: 'If', fields: { cond: 1, then: 3, else: 5 } },
      },

      caseExpr: {
        type: 'seq',
        items: [
          'CASE',
          { ref: 'atom' },
          'OF',
          { ref: 'caseBranches' },
        ],
        ast: { type: 'Case', fields: { scrutinee: 1, branches: { list: 3 } } },
      },

      caseBranches: {
        type: 'seq',
        items: [{ ref: 'caseBranch', quant: '*' }],
        ast: { type: '__list__', fields: { items: { list: 0 } } },
      },

      caseBranch: {
        type: 'choice',
        options: [
          // [] -> expr
          {
            type: 'seq',
            items: ['LBRACKET', 'RBRACKET', 'ARROW', { ref: 'expr' }, 'SEMICOLON'],
            ast: { type: 'Branch', fields: { pat: 'nil', body: 3 } },
          },
          // (x:xs) -> expr
          {
            type: 'seq',
            items: ['LPAREN', 'IDENT', 'COLON', 'IDENT', 'RPAREN', 'ARROW', { ref: 'expr' }, 'SEMICOLON'],
            ast: { type: 'Branch', fields: { pat: 'cons', head: { text: 1 }, tail: { text: 3 }, body: 6 } },
          },
          // (x) -> expr  (single element list pattern)
          {
            type: 'seq',
            items: ['LPAREN', 'IDENT', 'RPAREN', 'ARROW', { ref: 'expr' }, 'SEMICOLON'],
            ast: { type: 'Branch', fields: { pat: 'var', name: { text: 1 }, body: 4 } },
          },
          // IDENT -> expr  (variable pattern)
          {
            type: 'seq',
            items: ['IDENT', 'ARROW', { ref: 'expr' }, 'SEMICOLON'],
            ast: { type: 'Branch', fields: { pat: 'var', name: { text: 0 }, body: 2 } },
          },
        ],
      },

      lambda: {
        type: 'seq',
        items: ['LAMBDA', { ref: 'lambdaParams' }, 'ARROW', { ref: 'expr' }],
        ast: { type: 'Lambda', fields: { params: { list: 1 }, body: 3 } },
      },

      lambdaParams: {
        type: 'seq',
        items: [{ ref: 'IDENT', quant: '*' }],
        ast: { type: '__list__', fields: { items: { list: 0 } } },
      },

      // Binary operator expression with precedence:
      //   comparison < logic or || logic and && comparison
      //   additive + - multiplicative * /
      //   cons : (lowest, right-assoc)
      //   application (juxtaposition, highest)
      binExpr: { type: 'choice', options: [{ ref: 'consExpr' }] },

      consExpr: {
        type: 'seq',
        items: [{ ref: 'orExpr' }, { ref: 'consRest', quant: '?' }],
        ast: { type: 'ConsChain', fields: { left: 0, rest: 1 } },
      },
      consRest: {
        type: 'seq',
        items: ['COLON', { ref: 'consExpr' }],
        ast: { type: 'ConsRest', fields: { right: 1 } },
      },

      orExpr: {
        type: 'seq',
        items: [{ ref: 'andExpr' }, { ref: 'orRest', quant: '*' }],
        ast: { type: 'BinChain', fields: { left: 0, rest: { list: 1 } } },
      },
      orRest: {
        type: 'seq',
        items: ['OR', { ref: 'andExpr' }],
        ast: { type: 'BinTerm', fields: { op: '||', right: 1 } },
      },

      andExpr: {
        type: 'seq',
        items: [{ ref: 'cmpExpr' }, { ref: 'andRest', quant: '*' }],
        ast: { type: 'BinChain', fields: { left: 0, rest: { list: 1 } } },
      },
      andRest: {
        type: 'seq',
        items: ['AND', { ref: 'cmpExpr' }],
        ast: { type: 'BinTerm', fields: { op: '&&', right: 1 } },
      },

      cmpExpr: {
        type: 'seq',
        items: [{ ref: 'addExpr' }, { ref: 'cmpRest', quant: '?' }],
        ast: { type: 'CmpChain', fields: { left: 0, rest: 1 } },
      },
      cmpRest: {
        type: 'choice',
        options: [
          { type: 'seq', items: ['LT', { ref: 'addExpr' }], ast: { type: 'CmpTerm', fields: { op: '<', right: 1 } } },
          { type: 'seq', items: ['GT', { ref: 'addExpr' }], ast: { type: 'CmpTerm', fields: { op: '>', right: 1 } } },
          { type: 'seq', items: ['LTE', { ref: 'addExpr' }], ast: { type: 'CmpTerm', fields: { op: '<=', right: 1 } } },
          { type: 'seq', items: ['GTE', { ref: 'addExpr' }], ast: { type: 'CmpTerm', fields: { op: '>=', right: 1 } } },
          { type: 'seq', items: ['EQEQ', { ref: 'addExpr' }], ast: { type: 'CmpTerm', fields: { op: '==', right: 1 } } },
          { type: 'seq', items: ['NEQ', { ref: 'addExpr' }], ast: { type: 'CmpTerm', fields: { op: '!=', right: 1 } } },
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
        items: [{ ref: 'appExpr' }, { ref: 'mulRest', quant: '*' }],
        ast: { type: 'BinChain', fields: { left: 0, rest: { list: 1 } } },
      },
      mulRest: {
        type: 'choice',
        options: [
          { type: 'seq', items: ['STAR', { ref: 'appExpr' }], ast: { type: 'BinTerm', fields: { op: '*', right: 1 } } },
          { type: 'seq', items: ['SLASH', { ref: 'appExpr' }], ast: { type: 'BinTerm', fields: { op: '/', right: 1 } } },
        ],
      },

      // Function application: f x y  (juxtaposition, left-assoc)
      appExpr: {
        type: 'seq',
        items: [{ ref: 'atom' }, { ref: 'atom', quant: '*' }],
        ast: { type: 'App', fields: { func: 0, args: { list: 1 } } },
      },

      atom: {
        type: 'choice',
        options: [
          { type: 'seq', items: ['NUMBER'], ast: { type: 'IntLit', fields: { value: { value: 0 } } } },
          { type: 'seq', items: ['TRUE'], ast: { type: 'BoolLit', fields: { value: 'true' } } },
          { type: 'seq', items: ['FALSE'], ast: { type: 'BoolLit', fields: { value: 'false' } } },
          { type: 'seq', items: ['IDENT'], ast: { type: 'Var', fields: { name: { text: 0 } } } },
          { type: 'seq', items: ['LPAREN', { ref: 'expr' }, 'RPAREN'], ast: { type: 'Paren', fields: { expr: 1 } } },
          { type: 'seq', items: ['LBRACKET', { ref: 'listElems', quant: '?' }, 'RBRACKET'], ast: { type: 'ListLit', fields: { items: { list: 1 } } } },
        ],
      },

      listElems: {
        type: 'seq',
        items: [
          { ref: 'addExpr' },
          { ref: 'listElemRest', quant: '*' },
        ],
        ast: { type: '__list__', fields: { items: { listMerge: [0, 1] } } },
      },
      listElemRest: {
        type: 'seq',
        items: ['COMMA', { ref: 'addExpr' }],
        ast: { type: '__item__', fields: { item: 1 } },
      },
    },
  },
  codegen: {
    templates: [
      { nodeType: 'Program', ops: ['EVAL ${body}', 'POP'] },
      { nodeType: 'Paren', ops: ['EVAL ${expr}'] },
      { nodeType: '__list__', ops: ['EVAL ${__items__}'] },
      { nodeType: '__seq__', ops: ['EVAL ${__children__}'] },
      { nodeType: '__item__', ops: ['EVAL ${item}'] },

      // Literals
      { nodeType: 'IntLit', ops: ['PUSH_INT ${value}'] },
      { nodeType: 'BoolLit', ops: ['PUSH_BOOL ${value}'] },

      // Variable
      { nodeType: 'Var', ops: ['LOAD_VAR ${name}'] },

      // If
      { nodeType: 'If', ops: [{
        if: { cond: ['EVAL ${cond}'], then: ['EVAL ${then}'], else: ['EVAL ${else}'] },
      }] },

      // Let: declare local, bind value, eval body
      { nodeType: 'Let', ops: [
        'EVAL ${value}',
        'DECLARE_VAR ${name}',
        'STORE_VAR ${name}',
        'EVAL ${body}',
      ] },

      // LetRec: create a ref, bind it, eval value (which can reference the ref),
      // then update the ref with the actual value.
      // Simplification: for recursive functions, we use MAKE_CLOSURE_REC.
      { nodeType: 'LetRec', ops: [
        // The value should be a Lambda. We compile it as a recursive closure.
        // For simplicity, we declare the name first, then if value is a Lambda
        // we use MAKE_CLOSURE_REC; otherwise just eval and store.
        'DECLARE_VAR ${name}',
        'EVAL ${value}',
        'STORE_VAR ${name}',
        'EVAL ${body}',
      ] },

      // Lambda — compile as a closure.
      // We need to generate a unique function name and compile the body.
      // For simplicity, we require the codegen to handle Lambda specially.
      // Here we emit MAKE_CLOSURE with a generated name.
      // But our template system can't generate unique names...
      // Instead, we use a convention: lambdas are named __lambda_<counter>.
      // The codegen's emitNode for Lambda will handle this specially.
      { nodeType: 'Lambda', ops: [] },  // handled in codegen.emitNode

      // Application: handled by emitApp in codegen.ts
      { nodeType: 'App', ops: [] },

      // Binary chains
      { nodeType: 'BinChain', ops: [
        'EVAL ${left}',
        { forEach: '${rest}', do: ['EVAL ${item.right}', 'BINOP ${item.op}'] },
      ] },
      { nodeType: 'BinTerm', ops: [] },  // placeholder, used by forEach above

      // Comparison chain (single optional)
      { nodeType: 'CmpChain', ops: [
        'EVAL ${left}',
        { forEach: '${rest}', do: ['EVAL ${item.right}', 'BINOP ${item.op}'] },
      ] },
      { nodeType: 'CmpTerm', ops: [] },

      // Cons chain: left : rest
      { nodeType: 'ConsChain', ops: [
        'EVAL ${left}',
        { forEach: '${rest}', do: ['EVAL ${item.right}', 'LIST_CONS'] },
      ] },
      { nodeType: 'ConsRest', ops: [] },

      // List literal
      { nodeType: 'ListLit', ops: [
        { forEach: '${items}', do: ['EVAL ${item}'] },
        'NEW_LIST ${items}',
      ] },

      // Case (pattern matching)
      { nodeType: 'Case', ops: [
        'EVAL ${scrutinee}',
        // The scrutinee is on the stack. We need to match against branches.
        // This is complex — we handle it in emitNode specially.
        'CASE_MATCH ${branches}',
      ] },

      { nodeType: 'Branch', ops: [] },
    ],
  },
};
