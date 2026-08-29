/**
 * QVM Bytecode module + function representation.
 *
 * A QVM "program" is a set of named modules. Each module contains:
 *  - A constant pool (numbers, strings, booleans, etc.)
 *  - A list of functions
 *
 * Each function has:
 *  - name
 *  - arity (number of expected arguments)
 *  - locals (number of local variable slots, including args)
 *  - code (Uint8Array of opcodes + operands)
 *  - constantPoolIndex (which pool it uses, default 0)
 *  - debugInfo (optional line mappings)
 */

import { Opcode, OPCODE_NAMES, OPCODE_HAS_OPERAND } from './opcodes';

export interface QvmFunction {
  name: string;
  arity: number;
  locals: number;
  code: Uint8Array;
  /** Line numbers, indexed by bytecode offset. Optional, for debugging. */
  lineMap?: Record<number, number>;
}

export interface QvmModule {
  /** Module name. */
  name: string;
  /** Constant pool — array of strings, numbers, booleans. */
  constants: QvmValue[];
  /** Top-level code (the implicit "main" entry). */
  main: QvmFunction;
  /** Additional named functions. */
  functions: Record<string, QvmFunction>;
}

export type QvmValue =
  | null
  | boolean
  | number
  | string
  | QvmValue[]
  | { __map: true; entries: Array<[QvmValue, QvmValue]> }
  | { __tuple: true; items: QvmValue[] }
  | { __record: true; fields: Record<string, QvmValue> }
  | { __char: true; code: number }
  | { __ref: true; value: QvmValue }
  | { __closure: true; fnName: string; upvalues: QvmValue[]; name?: string }
  | { __unit: true };

export interface QvmProgram {
  modules: QvmModule[];
}

// ---------------------------------------------------------------------------
// Assembler-style builder. Used by the PLM code generator.
// ---------------------------------------------------------------------------

export class FunctionBuilder {
  private code: number[] = [];
  private lineMap: Record<number, number> = {};
  locals = 0;

  constructor(
    public name: string,
    public arity: number
  ) {}

  /** Returns the current code offset (used for jump labels). */
  get offset(): number {
    return this.code.length;
  }

  emit(op: Opcode, operand?: number, line?: number): void {
    if (line !== undefined) this.lineMap[this.code.length] = line;
    this.code.push(op);
    if (OPCODE_HAS_OPERAND.has(op)) {
      if (operand === undefined) {
        throw new Error(`Opcode ${OPCODE_NAMES[op]} requires an operand`);
      }
      // Operands are stored as 24-bit unsigned (3 bytes little-endian).
      this.code.push(operand & 0xff);
      this.code.push((operand >> 8) & 0xff);
      this.code.push((operand >> 16) & 0xff);
    } else if (operand !== undefined) {
      throw new Error(`Opcode ${OPCODE_NAMES[op]} does not take an operand`);
    }
  }

  /** Patch the operand at the given offset (for backpatching jumps). */
  patchOperand(atOffset: number, value: number): void {
    this.code[atOffset + 1] = value & 0xff;
    this.code[atOffset + 2] = (value >> 8) & 0xff;
    this.code[atOffset + 3] = (value >> 16) & 0xff;
  }

  build(): QvmFunction {
    return {
      name: this.name,
      arity: this.arity,
      locals: this.locals,
      code: new Uint8Array(this.code),
      lineMap: { ...this.lineMap },
    };
  }
}

export class ModuleBuilder {
  constants: QvmValue[] = [];
  private constIndex = new Map<string, number>();
  functions: Record<string, FunctionBuilder> = {};
  main: FunctionBuilder;

  constructor(public name: string = 'main') {
    this.main = new FunctionBuilder('__main__', 0);
  }

  /** Add a constant and return its index in the pool. */
  addConstant(value: QvmValue): number {
    // Use a stable string key. Strings/numbers/booleans dedupe.
    const key =
      value === null
        ? 'n:'
        : typeof value === 'string'
          ? `s:${value}`
          : typeof value === 'number'
            ? `f:${value}`
            : typeof value === 'boolean'
              ? `b:${value}`
              : `o:${JSON.stringify(value)}`;
    const existing = this.constIndex.get(key);
    if (existing !== undefined) return existing;
    const idx = this.constants.length;
    this.constants.push(value);
    this.constIndex.set(key, idx);
    return idx;
  }

  function(name: string, arity: number): FunctionBuilder {
    if (!this.functions[name]) {
      this.functions[name] = new FunctionBuilder(name, arity);
    }
    return this.functions[name];
  }

  build(): QvmModule {
    const fns: Record<string, QvmFunction> = {};
    for (const [name, b] of Object.entries(this.functions)) {
      fns[name] = b.build();
    }
    return {
      name: this.name,
      constants: this.constants,
      main: this.main.build(),
      functions: fns,
    };
  }
}

// ---------------------------------------------------------------------------
// Disassembler — pretty-print bytecode for the bytecode viewer.
// ---------------------------------------------------------------------------

export function disassembleFunction(fn: QvmFunction, constants: QvmValue[]): string[] {
  const lines: string[] = [];
  const code = fn.code;
  let pc = 0;
  while (pc < code.length) {
    const op = code[pc];
    const name = OPCODE_NAMES[op] ?? `0x${op.toString(16)}`;
    let line = `${pc.toString().padStart(4, ' ')}  ${name.padEnd(14, ' ')}`;
    if (OPCODE_HAS_OPERAND.has(op)) {
      const operand =
        code[pc + 1] | (code[pc + 2] << 8) | (code[pc + 3] << 16);
      line += operand.toString().padStart(6, ' ');
      // Show constant value when applicable.
      if (
        op === Opcode.PUSH_INT ||
        op === Opcode.PUSH_FLOAT ||
        op === Opcode.PUSH_STR ||
        op === Opcode.PUSH_CHAR ||
        op === Opcode.LOAD_GLOBAL ||
        op === Opcode.STORE_GLOBAL ||
        op === Opcode.MAKE_CLOSURE ||
        op === Opcode.MAKE_CLOSURE_REC
      ) {
        const v = constants[operand];
        line += `    ; ${formatValue(v)}`;
      } else if (op === Opcode.PUSH_BOOL) {
        line += `    ; ${operand ? 'true' : 'false'}`;
      } else if (op === Opcode.JMP || op === Opcode.JMP_IF_FALSE || op === Opcode.JMP_IF_TRUE) {
        line += `    ; -> ${operand}`;
      } else if (
        op === Opcode.CALL ||
        op === Opcode.TAIL_CALL ||
        op === Opcode.CALL_CLOSURE ||
        op === Opcode.CALL_VALUE
      ) {
        line += `    ; argc=${operand}`;
      } else if (
        op === Opcode.NEW_LIST ||
        op === Opcode.NEW_TUPLE ||
        op === Opcode.NEW_RECORD
      ) {
        line += `    ; n=${operand}`;
      } else if (
        op === Opcode.LOAD_LOCAL ||
        op === Opcode.STORE_LOCAL ||
        op === Opcode.LOAD_UPVALUE ||
        op === Opcode.STORE_UPVALUE ||
        op === Opcode.TUPLE_GET
      ) {
        line += `    ; idx=${operand}`;
      }
      pc += 4;
    } else {
      pc += 1;
    }
    if (fn.lineMap && fn.lineMap[pc - 1] !== undefined) {
      // line annotation already shown
    }
    lines.push(line);
  }
  return lines;
}

export function formatValue(v: QvmValue): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) {
    return '[' + v.map(formatValue).join(', ') + ']';
  }
  if (v && typeof v === 'object') {
    if ((v as any).__unit) return '()';
    if ((v as any).__map) {
      const entries = (v as any).entries as Array<[QvmValue, QvmValue]>;
      return '{' + entries.map(([k, val]) => `${formatValue(k)}: ${formatValue(val)}`).join(', ') + '}';
    }
    if ((v as any).__tuple) {
      const items = (v as any).items as QvmValue[];
      return '(' + items.map(formatValue).join(', ') + ')';
    }
    if ((v as any).__record) {
      const fields = (v as any).fields as Record<string, QvmValue>;
      return '{ ' + Object.entries(fields).map(([k, val]) => `${k}: ${formatValue(val)}`).join(', ') + ' }';
    }
    if ((v as any).__char) {
      const code = (v as any).code as number;
      return `'${String.fromCodePoint(code)}'`;
    }
    if ((v as any).__ref) {
      return `ref(${formatValue((v as any).value)})`;
    }
    if ((v as any).__closure) {
      const c = v as any;
      return `<closure ${c.fnName}${c.upvalues?.length ? '/' + c.upvalues.length : ''}>`;
    }
  }
  return String(v);
}
