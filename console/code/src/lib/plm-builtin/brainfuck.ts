/**
 * Brainfuck — the classic esoteric language.
 *
 * Only 8 commands: > < + - . , [ ]
 * All other characters are ignored (treated as comments).
 *
 * Memory is a 30,000-cell tape of bytes (we use 0..255 mod).
 * Pointer starts at cell 0.
 *
 * Compiles to QVM bytecode using a list as the tape.
 */

import { PlmConfig } from '../plm/config';

export const brainfuckConfig: PlmConfig = {
  language: {
    name: 'Brainfuck',
    version: '1.0.0',
    fileExtension: 'bf',
    description:
      'The classic esoteric language with 8 single-character commands. Memory is a 30,000-cell byte tape.',
  },
  lexer: {
    // No whitespace skipping — instead, unknown chars are silently ignored
    // by the lexer itself (we mark them as ignore tokens).
    tokens: [
      { name: 'INC_PTR', kind: 'literal', literal: '>' },
      { name: 'DEC_PTR', kind: 'literal', literal: '<' },
      { name: 'INC_VAL', kind: 'literal', literal: '+' },
      { name: 'DEC_VAL', kind: 'literal', literal: '-' },
      { name: 'OUTPUT', kind: 'literal', literal: '.' },
      { name: 'INPUT', kind: 'literal', literal: ',' },
      { name: 'LOOP_START', kind: 'literal', literal: '[' },
      { name: 'LOOP_END', kind: 'literal', literal: ']' },
      // Any other character — ignored.
      {
        name: 'OTHER',
        kind: 'ident',
        startChars: [
          'a-z', 'A-Z', '0-9', ' ', '\t', '\n', '\r', '!', '"', '#', '$',
          '%', '&', "'", '(', ')', '*', '/', ':', ';', '=', '?', '@', '^',
          '_', '`', '{', '|', '}', '~', '\\',
        ],
        ignore: true,
      },
    ],
  },
  grammar: {
    start: 'program',
    rules: {
      program: {
        type: 'seq',
        items: [{ ref: 'command', quant: '*' }],
        ast: { type: 'Program', fields: { body: { list: 0 } } },
      },
      command: {
        type: 'choice',
        options: [
          { ref: 'incPtr' },
          { ref: 'decPtr' },
          { ref: 'incVal' },
          { ref: 'decVal' },
          { ref: 'output' },
          { ref: 'input' },
          { ref: 'loop' },
        ],
      },
      incPtr: {
        type: 'seq',
        items: ['INC_PTR'],
        ast: { type: 'IncPtr' },
      },
      decPtr: {
        type: 'seq',
        items: ['DEC_PTR'],
        ast: { type: 'DecPtr' },
      },
      incVal: {
        type: 'seq',
        items: ['INC_VAL'],
        ast: { type: 'IncVal' },
      },
      decVal: {
        type: 'seq',
        items: ['DEC_VAL'],
        ast: { type: 'DecVal' },
      },
      output: {
        type: 'seq',
        items: ['OUTPUT'],
        ast: { type: 'Output' },
      },
      input: {
        type: 'seq',
        items: ['INPUT'],
        ast: { type: 'Input' },
      },
      loop: {
        type: 'seq',
        items: ['LOOP_START', { ref: 'command', quant: '*' }, 'LOOP_END'],
        ast: { type: 'Loop', fields: { body: { list: 1 } } },
      },
    },
  },
  codegen: {
    templates: [
      { nodeType: 'Program', ops: [
        // Initialize: tape = list of 100 zeros (smaller for performance)
        'NEW_LIST 0',
        'DECLARE_VAR __tape',
        'STORE_VAR __tape',
        'DECLARE_VAR __i',
        'PUSH_INT 0',
        'STORE_VAR __i',
        {
          while: {
            cond: [
              'LOAD_VAR __i',
              'PUSH_INT 100',
              'LT',
            ],
            body: [
              'LOAD_VAR __tape',
              'PUSH_INT 0',
              'NEW_LIST 1',
              'ADD',
              'STORE_VAR __tape',
              'LOAD_VAR __i',
              'INC',
              'STORE_VAR __i',
            ],
          },
        },
        // ptr = 0
        'DECLARE_VAR __ptr',
        'PUSH_INT 0',
        'STORE_VAR __ptr',
        // Eval body
        'EVAL ${body}',
      ] },
      { nodeType: 'IncPtr', ops: [
        'LOAD_VAR __ptr', 'INC', 'STORE_VAR __ptr',
      ] },
      { nodeType: 'DecPtr', ops: [
        'LOAD_VAR __ptr',
        {
          if: {
            cond: ['IS_ZERO'],
            then: [],
            else: ['DEC', 'STORE_VAR __ptr'],
          },
        },
      ] },
      { nodeType: 'IncVal', ops: [
        // Read tape[ptr], +1 mod 256, write back
        'LOAD_VAR __tape',
        'LOAD_VAR __ptr',
        'GET_INDEX',
        'INC',
        'PUSH_INT 256',
        'MOD',
        // Stack: [new_val]. Now build: tape[ptr] = new_val
        // SET_INDEX: pops val, idx, target. We need [target, idx, val].
        // So push target, idx, then we already have val on top.
        // Currently stack: [val]. Push tape, ptr, then swap to get [tape, ptr, val].
        'LOAD_VAR __tape',
        'LOAD_VAR __ptr',
        // Stack: [val, tape, ptr]. We need [tape, ptr, val].
        // Use ROT3: [a,b,c] -> [b,c,a]. Here a=val, b=tape, c=ptr.
        // After ROT3: [tape, ptr, val]. Correct!
        'ROT3',
        'SET_INDEX',
        'STORE_VAR __tape',
      ] },
      { nodeType: 'DecVal', ops: [
        // Stack ops: we want tape[ptr] = (tape[ptr] - 1) % 256
        // 1. Load tape, ptr, GET_INDEX -> [val]
        // 2. DEC, MOD 256 -> [new_val]
        // 3. Load tape, ptr -> [new_val, tape, ptr]
        // 4. ROT3 -> [tape, ptr, new_val]
        // 5. SET_INDEX (pops val=new_val, idx=ptr, target=tape)
        'LOAD_VAR __tape',
        'LOAD_VAR __ptr',
        'GET_INDEX',
        'DEC',
        'PUSH_INT 256',
        'MOD',
        'LOAD_VAR __tape',
        'LOAD_VAR __ptr',
        'ROT3',
        'SET_INDEX',
        'STORE_VAR __tape',
      ] },
      { nodeType: 'Output', ops: [
        'LOAD_VAR __tape',
        'LOAD_VAR __ptr',
        'GET_INDEX',
        'EMIT_CHAR',
      ] },
      { nodeType: 'Input', ops: [
        'READ_CHAR 0',
        'DUP',
        'PUSH_INT 0', 'LT',
        {
          if: {
            cond: [],
            then: ['POP', 'PUSH_INT 0'],
            else: [],
          },
        },
        'LOAD_VAR __tape',
        'LOAD_VAR __ptr',
        'ROT3',
        'SET_INDEX',
        'STORE_VAR __tape',
      ] },
      { nodeType: 'Loop', ops: [
        {
          while: {
            cond: [
              'LOAD_VAR __tape',
              'LOAD_VAR __ptr',
              'GET_INDEX',
              'IS_ZERO',
              'NOT',
            ],
            body: ['EVAL ${body}'],
          },
        },
      ] },
      { nodeType: '__list__', ops: ['EVAL ${__items__}'] },
      { nodeType: '__seq__', ops: ['EVAL ${__children__}'] },
    ],
  },
};
