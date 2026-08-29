/**
 * QVM — the bytecode virtual machine.
 *
 * Stack-based, with a single value stack, a call frame stack, and a
 * global variable table. Functions live in modules; CALL looks up the
 * function by name in the current module.
 */

import { Opcode } from './opcodes';
import {
  QvmModule,
  QvmFunction,
  QvmValue,
  FunctionBuilder,
  ModuleBuilder,
  formatValue,
} from './bytecode';

export interface QvmRunResult {
  output: string;
  exitCode: number;
  error?: string;
  stackTrace?: string[];
  /** Final value stack (mostly for debugging). */
  finalStack?: QvmValue[];
}

export interface QvmOptions {
  /** Max instructions before forced halt (anti-infinite-loop). */
  instructionLimit?: number;
  /** Max call-stack depth. */
  maxCallDepth?: number;
  /** Capture stdout via PRINT. */
  captureOutput?: boolean;
  /** Input string for READ_CHAR / PEEK_CHAR (Brainfuck-style stdin). */
  input?: string;
}

const DEFAULTS: Required<QvmOptions> = {
  instructionLimit: 10_000_000,
  maxCallDepth: 4096,
  captureOutput: true,
  input: '',
};

interface Frame {
  fn: QvmFunction;
  pc: number;
  /** Base of this frame's locals on the value stack. */
  base: number;
  /** Captured upvalues (for closures). */
  upvalues?: QvmValue[];
}

export class QvmError extends Error {
  constructor(message: string, public stackTrace?: string[]) {
    super(message);
    this.name = 'QvmError';
  }
}

export class QVM {
  private module: QvmModule;
  private opts: Required<QvmOptions>;
  private stack: QvmValue[] = [];
  private frames: Frame[] = [];
  private globals: Map<number, QvmValue> = new Map();
  private output: string[] = [];
  private instructionCount = 0;
  private halted = false;
  /** Input cursor for READ_CHAR/PEEK_CHAR. */
  private inputCursor = 0;
  /** Heap for ref cells (so they have identity). */
  private refs: QvmValue[] = [];

  constructor(module: QvmModule, opts: QvmOptions = {}) {
    this.module = module;
    this.opts = { ...DEFAULTS, ...opts };
  }

  /** Look up a constant by its index. */
  private const(idx: number): QvmValue {
    const v = this.module.constants[idx];
    if (v === undefined) throw new QvmError(`Constant index out of range: ${idx}`);
    return v;
  }

  private currentFrame(): Frame {
    const f = this.frames[this.frames.length - 1];
    if (!f) throw new QvmError('No active frame');
    return f;
  }

  run(): QvmRunResult {
    try {
      // Push __main__ as the initial frame.
      this.frames.push({ fn: this.module.main, pc: 0, base: 0 });
      // Allocate locals for main.
      for (let i = 0; i < this.module.main.locals; i++) this.stack.push(null);

      while (!this.halted) {
        const frame = this.currentFrame();
        if (frame.pc >= frame.fn.code.length) {
          // Implicit return at end of main.
          if (this.frames.length === 1) break;
          this.doReturn(null);
          continue;
        }
        if (this.instructionCount >= this.opts.instructionLimit) {
          throw new QvmError(
            `Instruction limit exceeded (${this.opts.instructionLimit}). Possible infinite loop.`
          );
        }
        this.instructionCount++;

        const op = frame.fn.code[frame.pc++];
        this.execute(op);
      }

      return {
        output: this.output.join(''),
        exitCode: 0,
        finalStack: this.stack.slice(),
      };
    } catch (e: any) {
      const trace: string[] = [];
      for (let i = this.frames.length - 1; i >= 0; i--) {
        const f = this.frames[i];
        const line = f.fn.lineMap?.[f.pc];
        trace.push(`  at ${f.fn.name}${line !== undefined ? `:${line}` : ''}`);
      }
      return {
        output: this.output.join(''),
        exitCode: 1,
        error: e?.message ?? String(e),
        stackTrace: trace,
      };
    }
  }

  private readOperand(): number {
    const frame = this.currentFrame();
    const code = frame.fn.code;
    const lo = code[frame.pc++];
    const mid = code[frame.pc++];
    const hi = code[frame.pc++];
    return lo | (mid << 8) | (hi << 16);
  }

  private push(v: QvmValue): void {
    this.stack.push(v);
  }

  private pop(): QvmValue {
    const v = this.stack.pop();
    if (v === undefined) throw new QvmError('Value stack underflow');
    return v;
  }

  private peek(n = 0): QvmValue {
    return this.stack[this.stack.length - 1 - n];
  }

  private execute(op: number): void {
    switch (op) {
      case Opcode.PUSH_NULL:
        this.push(null);
        break;
      case Opcode.PUSH_BOOL: {
        const v = this.readOperand();
        this.push(v !== 0);
        break;
      }
      case Opcode.PUSH_INT: {
        const idx = this.readOperand();
        this.push(this.const(idx));
        break;
      }
      case Opcode.PUSH_FLOAT: {
        const idx = this.readOperand();
        this.push(this.const(idx));
        break;
      }
      case Opcode.PUSH_STR: {
        const idx = this.readOperand();
        this.push(this.const(idx));
        break;
      }
      case Opcode.POP:
        this.pop();
        break;
      case Opcode.DUP:
        this.push(this.peek());
        break;
      case Opcode.SWAP: {
        const a = this.pop();
        const b = this.pop();
        this.push(a);
        this.push(b);
        break;
      }
      case Opcode.LOAD_LOCAL: {
        const slot = this.readOperand();
        const frame = this.currentFrame();
        this.push(this.stack[frame.base + slot]);
        break;
      }
      case Opcode.STORE_LOCAL: {
        const slot = this.readOperand();
        const frame = this.currentFrame();
        this.stack[frame.base + slot] = this.pop();
        break;
      }
      case Opcode.LOAD_GLOBAL: {
        const idx = this.readOperand();
        if (!this.globals.has(idx)) throw new QvmError(`Undefined global: ${this.const(idx)}`);
        this.push(this.globals.get(idx)!);
        break;
      }
      case Opcode.STORE_GLOBAL: {
        const idx = this.readOperand();
        this.globals.set(idx, this.pop());
        break;
      }
      case Opcode.ADD:
        this.binOp((a, b) => {
          if (typeof a === 'string' || typeof b === 'string') {
            return String(anyToString(a)) + String(anyToString(b));
          }
          if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
          return (a as number) + (b as number);
        });
        break;
      case Opcode.SUB:
        this.binOp((a, b) => (a as number) - (b as number));
        break;
      case Opcode.MUL:
        this.binOp((a, b) => {
          if (typeof a === 'string' && typeof b === 'number') return a.repeat(b);
          return (a as number) * (b as number);
        });
        break;
      case Opcode.DIV:
        this.binOp((a, b) => {
          if ((b as number) === 0) throw new QvmError('Division by zero');
          // Integer division when both are integer-valued.
          if (Number.isInteger(a) && Number.isInteger(b)) {
            return Math.trunc((a as number) / (b as number));
          }
          return (a as number) / (b as number);
        });
        break;
      case Opcode.MOD:
        this.binOp((a, b) => {
          if ((b as number) === 0) throw new QvmError('Modulo by zero');
          return (a as number) % (b as number);
        });
        break;
      case Opcode.NEG: {
        const v = this.pop();
        this.push(-(v as number));
        break;
      }
      case Opcode.EQ:
        this.binOp((a, b) => a === b);
        break;
      case Opcode.NEQ:
        this.binOp((a, b) => a !== b);
        break;
      case Opcode.LT:
        this.binOp((a, b) => (a as number) < (b as number));
        break;
      case Opcode.GT:
        this.binOp((a, b) => (a as number) > (b as number));
        break;
      case Opcode.LTE:
        this.binOp((a, b) => (a as number) <= (b as number));
        break;
      case Opcode.GTE:
        this.binOp((a, b) => (a as number) >= (b as number));
        break;
      case Opcode.AND:
        this.binOp((a, b) => Boolean(a) && Boolean(b));
        break;
      case Opcode.OR:
        this.binOp((a, b) => Boolean(a) || Boolean(b));
        break;
      case Opcode.NOT:
        this.push(!Boolean(this.pop()));
        break;
      case Opcode.JMP: {
        const target = this.readOperand();
        this.currentFrame().pc = target;
        break;
      }
      case Opcode.JMP_IF_FALSE: {
        const target = this.readOperand();
        if (!truthy(this.pop())) this.currentFrame().pc = target;
        break;
      }
      case Opcode.JMP_IF_TRUE: {
        const target = this.readOperand();
        if (truthy(this.pop())) this.currentFrame().pc = target;
        break;
      }
      case Opcode.CALL: {
        const argc = this.readOperand();
        // Convention: caller pushes [arg0, arg1, ..., argN-1, name] then CALL N.
        // So name is on top of the stack.
        const name = this.pop();
        const fn = this.module.functions[name as string];
        if (!fn) throw new QvmError(`Unknown function: ${name}`);
        if (argc !== fn.arity) {
          throw new QvmError(
            `Function ${name} expects ${fn.arity} args, got ${argc}`
          );
        }
        if (this.frames.length >= this.opts.maxCallDepth) {
          throw new QvmError('Call stack overflow');
        }
        // Args are already on the stack in order [arg0, ..., argN-1].
        const base = this.stack.length - argc;
        // Allocate locals (slots beyond the args).
        for (let i = 0; i < fn.locals - argc; i++) this.stack.push(null);
        this.frames.push({ fn, pc: 0, base });
        break;
      }
      case Opcode.RET: {
        const v = this.stack.length > 0 ? this.pop() : null;
        this.doReturn(v);
        break;
      }
      case Opcode.HALT:
        this.halted = true;
        break;
      case Opcode.PRINT: {
        const v = this.pop();
        const s = anyToString(v) + '\n';
        this.output.push(s);
        break;
      }
      case Opcode.PRINT_RAW: {
        const v = this.pop();
        const s = anyToString(v);
        this.output.push(s);
        break;
      }
      case Opcode.NEW_LIST: {
        const n = this.readOperand();
        const items: QvmValue[] = [];
        for (let i = 0; i < n; i++) items.unshift(this.pop());
        this.push(items);
        break;
      }
      case Opcode.NEW_MAP: {
        this.push({ __map: true, entries: [] } as QvmValue);
        break;
      }
      case Opcode.GET_INDEX: {
        const idx = this.pop();
        const target = this.pop();
        if (Array.isArray(target)) {
          if (typeof idx !== 'number')
            throw new QvmError('List index must be a number');
          if (idx < 0 || idx >= target.length)
            throw new QvmError(`List index out of bounds: ${idx}`);
          this.push(target[idx]);
        } else if (target && typeof target === 'object' && (target as any).__map) {
          const entries = (target as any).entries as Array<[QvmValue, QvmValue]>;
          const entry = entries.find(([k]) => k === idx);
          this.push(entry ? entry[1] : null);
        } else {
          throw new QvmError(`Cannot index value of type ${typeof target}`);
        }
        break;
      }
      case Opcode.SET_INDEX: {
        const val = this.pop();
        const idx = this.pop();
        const target = this.pop();
        if (Array.isArray(target)) {
          if (typeof idx !== 'number')
            throw new QvmError('List index must be a number');
          while (target.length <= idx) target.push(null);
          target[idx] = val;
          this.push(target);
        } else if (target && typeof target === 'object' && (target as any).__map) {
          const entries = (target as any).entries as Array<[QvmValue, QvmValue]>;
          const entry = entries.find(([k]) => k === idx);
          if (entry) entry[1] = val;
          else entries.push([idx, val]);
          this.push(target);
        } else if (target && typeof target === 'object' && (target as any).__record) {
          const fields = (target as any).fields as Record<string, QvmValue>;
          fields[String(idx)] = val;
          this.push(target);
        } else {
          throw new QvmError(`Cannot index value of type ${typeof target}`);
        }
        break;
      }
      case Opcode.GET_FIELD: {
        const field = this.pop();
        const target = this.pop();
        if (target && typeof target === 'object' && (target as any).__map) {
          const entries = (target as any).entries as Array<[QvmValue, QvmValue]>;
          const entry = entries.find(([k]) => k === field);
          this.push(entry ? entry[1] : null);
        } else {
          this.push(null);
        }
        break;
      }
      case Opcode.SET_FIELD: {
        const val = this.pop();
        const field = this.pop();
        let target = this.pop();
        if (!target || typeof target !== 'object' || !(target as any).__map) {
          target = { __map: true, entries: [] } as QvmValue;
        }
        const entries = (target as any).entries as Array<[QvmValue, QvmValue]>;
        const entry = entries.find(([k]) => k === field);
        if (entry) entry[1] = val;
        else entries.push([field, val]);
        this.push(target);
        break;
      }
      case Opcode.LEN: {
        const v = this.pop();
        if (Array.isArray(v)) this.push(v.length);
        else if (v && typeof v === 'object' && (v as any).__map)
          this.push((v as any).entries.length);
        else if (typeof v === 'string') this.push(v.length);
        else throw new QvmError(`Cannot take length of ${typeof v}`);
        break;
      }

      // === New: stack manipulation ===
      case Opcode.PUSH_CHAR: {
        const idx = this.readOperand();
        const ch = this.const(idx);
        // Stored as a string of length 1 in the constant pool.
        const code = typeof ch === 'string' ? ch.codePointAt(0) ?? 0 : (ch as number);
        this.push({ __char: true, code });
        break;
      }
      case Opcode.PUSH_UNIT:
        this.push({ __unit: true });
        break;
      case Opcode.ROT3: {
        const c = this.pop();
        const b = this.pop();
        const a = this.pop();
        this.push(b);
        this.push(c);
        this.push(a);
        break;
      }
      case Opcode.OVER: {
        const b = this.pop();
        const a = this.pop();
        this.push(a);
        this.push(b);
        this.push(a);
        break;
      }

      // === New: arithmetic extras ===
      case Opcode.INC: {
        const v = this.pop();
        this.push((v as number) + 1);
        break;
      }
      case Opcode.DEC: {
        const v = this.pop();
        this.push((v as number) - 1);
        break;
      }
      case Opcode.ABS: {
        const v = this.pop();
        this.push(Math.abs(v as number));
        break;
      }
      case Opcode.MIN: {
        const b = this.pop();
        const a = this.pop();
        this.push(Math.min(a as number, b as number));
        break;
      }
      case Opcode.MAX: {
        const b = this.pop();
        const a = this.pop();
        this.push(Math.max(a as number, b as number));
        break;
      }

      // === New: comparison extras ===
      case Opcode.IS_ZERO: {
        const v = this.pop();
        this.push(v === 0);
        break;
      }

      // === New: upvalues (closures) ===
      case Opcode.LOAD_UPVALUE: {
        const idx = this.readOperand();
        const frame = this.currentFrame();
        const uv = frame.upvalues;
        if (!uv || idx >= uv.length) throw new QvmError(`Upvalue out of range: ${idx}`);
        this.push(uv[idx]);
        break;
      }
      case Opcode.STORE_UPVALUE: {
        const idx = this.readOperand();
        const frame = this.currentFrame();
        const uv = frame.upvalues;
        if (!uv || idx >= uv.length) throw new QvmError(`Upvalue out of range: ${idx}`);
        const v = this.pop();
        uv[idx] = v;
        break;
      }

      // === New: closures ===
      case Opcode.MAKE_CLOSURE: {
        const idx = this.readOperand();
        const fnName = this.const(idx);
        // Capture the current frame's upvalues (if any).
        const frame = this.currentFrame();
        const upvalues = frame.upvalues ? [...frame.upvalues] : [];
        this.push({ __closure: true, fnName: fnName as string, upvalues });
        break;
      }
      case Opcode.MAKE_CLOSURE_REC: {
        const idx = this.readOperand();
        const fnName = this.const(idx);
        const frame = this.currentFrame();
        const upvalues = frame.upvalues ? [...frame.upvalues] : [];
        const closure: QvmValue = {
          __closure: true,
          fnName: fnName as string,
          upvalues,
          name: fnName as string,
        };
        // Self-reference for recursive lambdas.
        upvalues.unshift(closure);
        (closure as any).upvalues = upvalues;
        this.push(closure);
        break;
      }
      case Opcode.CALL_VALUE: {
        const argc = this.readOperand();
        // Caller pushed: [arg0, ..., argN-1, closure]
        const closure = this.pop();
        if (!closure || typeof closure !== 'object' || !(closure as any).__closure) {
          throw new QvmError(`Cannot call non-closure value: ${formatValue(closure)}`);
        }
        const c = closure as any;
        const fn = this.module.functions[c.fnName];
        if (!fn) throw new QvmError(`Unknown function in closure: ${c.fnName}`);
        if (argc !== fn.arity) {
          throw new QvmError(`Closure ${c.fnName} expects ${fn.arity} args, got ${argc}`);
        }
        if (this.frames.length >= this.opts.maxCallDepth) {
          throw new QvmError('Call stack overflow');
        }
        const base = this.stack.length - argc;
        for (let i = 0; i < fn.locals - argc; i++) this.stack.push(null);
        this.frames.push({ fn, pc: 0, base, upvalues: c.upvalues });
        break;
      }
      case Opcode.CALL_CLOSURE: {
        // Same as CALL_VALUE — alias.
        const argc = this.readOperand();
        const closure = this.pop();
        if (!closure || typeof closure !== 'object' || !(closure as any).__closure) {
          throw new QvmError(`Cannot call non-closure value`);
        }
        const c = closure as any;
        const fn = this.module.functions[c.fnName];
        if (!fn) throw new QvmError(`Unknown function in closure: ${c.fnName}`);
        if (argc !== fn.arity) {
          throw new QvmError(`Closure ${c.fnName} expects ${fn.arity} args, got ${argc}`);
        }
        if (this.frames.length >= this.opts.maxCallDepth) {
          throw new QvmError('Call stack overflow');
        }
        const base = this.stack.length - argc;
        for (let i = 0; i < fn.locals - argc; i++) this.stack.push(null);
        this.frames.push({ fn, pc: 0, base, upvalues: c.upvalues });
        break;
      }
      case Opcode.TAIL_CALL: {
        const argc = this.readOperand();
        const name = this.pop();
        const fn = this.module.functions[name as string];
        if (!fn) throw new QvmError(`Unknown function: ${name}`);
        if (argc !== fn.arity) {
          throw new QvmError(`Function ${name} expects ${fn.arity} args, got ${argc}`);
        }
        // Move args to the current frame's base, then reuse the frame.
        const frame = this.currentFrame();
        const argStart = this.stack.length - argc;
        for (let i = 0; i < argc; i++) {
          this.stack[frame.base + i] = this.stack[argStart + i];
        }
        this.stack.length = frame.base + fn.locals;
        for (let i = argc; i < fn.locals; i++) this.stack[frame.base + i] = null;
        frame.fn = fn;
        frame.pc = 0;
        break;
      }

      // === New: list ops ===
      case Opcode.LIST_CONS: {
        const tail = this.pop();
        const head = this.pop();
        if (!Array.isArray(tail)) throw new QvmError('CONS tail must be a list');
        this.push([head, ...tail]);
        break;
      }
      case Opcode.LIST_HEAD: {
        const v = this.pop();
        if (!Array.isArray(v) || v.length === 0) throw new QvmError('HEAD of empty list');
        this.push(v[0]);
        break;
      }
      case Opcode.LIST_TAIL: {
        const v = this.pop();
        if (!Array.isArray(v) || v.length === 0) throw new QvmError('TAIL of empty list');
        this.push(v.slice(1));
        break;
      }
      case Opcode.LIST_IS_EMPTY: {
        const v = this.pop();
        this.push(!Array.isArray(v) || v.length === 0);
        break;
      }

      // === New: type checks ===
      case Opcode.IS_NULL:
        this.push(this.pop() === null);
        break;
      case Opcode.IS_BOOL:
        this.push(typeof this.pop() === 'boolean');
        break;
      case Opcode.IS_INT:
        this.push(typeof this.pop() === 'number');
        break;
      case Opcode.IS_STR:
        this.push(typeof this.pop() === 'string');
        break;
      case Opcode.IS_LIST:
        this.push(Array.isArray(this.pop()));
        break;
      case Opcode.IS_CLOSURE: {
        const v = this.pop();
        this.push(!!(v && typeof v === 'object' && (v as any).__closure));
        break;
      }
      case Opcode.IS_CHAR: {
        const v = this.pop();
        this.push(!!(v && typeof v === 'object' && (v as any).__char));
        break;
      }
      case Opcode.IS_TUPLE: {
        const v = this.pop();
        this.push(!!(v && typeof v === 'object' && (v as any).__tuple));
        break;
      }
      case Opcode.TYPE_TAG: {
        const v = this.pop();
        if (v === null) this.push('null');
        else if (typeof v === 'boolean') this.push('bool');
        else if (typeof v === 'number') this.push('int');
        else if (typeof v === 'string') this.push('str');
        else if (Array.isArray(v)) this.push('list');
        else if ((v as any).__closure) this.push('fn');
        else if ((v as any).__char) this.push('char');
        else if ((v as any).__tuple) this.push('tuple');
        else if ((v as any).__record) this.push('record');
        else if ((v as any).__ref) this.push('ref');
        else if ((v as any).__unit) this.push('unit');
        else this.push('unknown');
        break;
      }

      // === New: tuples / records ===
      case Opcode.NEW_TUPLE: {
        const n = this.readOperand();
        const items: QvmValue[] = [];
        for (let i = 0; i < n; i++) items.unshift(this.pop());
        this.push({ __tuple: true, items });
        break;
      }
      case Opcode.TUPLE_GET: {
        const idx = this.readOperand();
        const v = this.pop();
        if (!v || typeof v !== 'object' || !(v as any).__tuple) {
          throw new QvmError('TUPLE_GET on non-tuple');
        }
        const items = (v as any).items as QvmValue[];
        if (idx < 0 || idx >= items.length) throw new QvmError(`Tuple index out of bounds: ${idx}`);
        this.push(items[idx]);
        break;
      }
      case Opcode.NEW_RECORD: {
        const n = this.readOperand();
        const fields: Record<string, QvmValue> = {};
        for (let i = 0; i < n; i++) {
          const val = this.pop();
          const key = this.pop();
          fields[String(key)] = val;
        }
        this.push({ __record: true, fields });
        break;
      }
      case Opcode.RECORD_GET: {
        const key = this.pop();
        const target = this.pop();
        if (!target || typeof target !== 'object' || !(target as any).__record) {
          this.push(null);
          break;
        }
        const fields = (target as any).fields as Record<string, QvmValue>;
        this.push(fields[String(key)] ?? null);
        break;
      }
      case Opcode.RECORD_HAS: {
        const key = this.pop();
        const target = this.pop();
        if (!target || typeof target !== 'object' || !(target as any).__record) {
          this.push(false);
          break;
        }
        const fields = (target as any).fields as Record<string, QvmValue>;
        this.push(Object.prototype.hasOwnProperty.call(fields, String(key)));
        break;
      }

      // === New: ref cells ===
      case Opcode.NEW_REF: {
        const v = this.pop();
        this.push({ __ref: true, value: v });
        break;
      }
      case Opcode.DEREF: {
        const v = this.pop();
        if (!v || typeof v !== 'object' || !(v as any).__ref) {
          throw new QvmError('DEREF on non-ref');
        }
        this.push((v as any).value);
        break;
      }
      case Opcode.REF_SET: {
        const v = this.pop();
        const r = this.pop();
        if (!r || typeof r !== 'object' || !(r as any).__ref) {
          throw new QvmError('REF_SET on non-ref');
        }
        (r as any).value = v;
        this.push(v);
        break;
      }
      case Opcode.IS_REF: {
        const v = this.pop();
        this.push(!!(v && typeof v === 'object' && (v as any).__ref));
        break;
      }

      // === New: char stream I/O (Brainfuck-style) ===
      case Opcode.READ_CHAR: {
        this.readOperand(); // port idx, ignored for now
        if (this.inputCursor >= this.opts.input.length) {
          this.push(-1);
        } else {
          const ch = this.opts.input[this.inputCursor++];
          this.push(ch.codePointAt(0) ?? 0);
        }
        break;
      }
      case Opcode.PEEK_CHAR: {
        this.readOperand();
        if (this.inputCursor >= this.opts.input.length) {
          this.push(-1);
        } else {
          const ch = this.opts.input[this.inputCursor];
          this.push(ch.codePointAt(0) ?? 0);
        }
        break;
      }
      case Opcode.WRITE_CHAR: {
        this.readOperand();
        const code = this.pop() as number;
        this.output.push(String.fromCodePoint(code));
        break;
      }
      case Opcode.EMIT_CHAR: {
        const code = this.pop() as number;
        this.output.push(String.fromCodePoint(code));
        break;
      }
      case Opcode.CHAR_TO_INT: {
        const v = this.pop();
        if (v && typeof v === 'object' && (v as any).__char) {
          this.push((v as any).code);
        } else if (typeof v === 'string') {
          this.push(v.codePointAt(0) ?? 0);
        } else if (typeof v === 'number') {
          this.push(v);
        } else {
          throw new QvmError('CHAR_TO_INT on non-char');
        }
        break;
      }
      case Opcode.INT_TO_CHAR: {
        const code = this.pop() as number;
        this.push({ __char: true, code });
        break;
      }

      // === New: debug ===
      case Opcode.DEBUG_STACK:
        // No-op in production; could log to a debug channel.
        break;
      case Opcode.BREAKPOINT:
        // No-op marker.
        break;

      default:
        throw new QvmError(`Unknown opcode: 0x${op.toString(16)}`);
    }
  }

  private binOp(fn: (a: QvmValue, b: QvmValue) => QvmValue): void {
    const b = this.pop();
    const a = this.pop();
    this.push(fn(a, b));
  }

  private doReturn(v: QvmValue): void {
    const frame = this.frames.pop()!;
    // Drop this frame's locals + args.
    this.stack.length = frame.base;
    this.push(v);
  }
}

function truthy(v: QvmValue): boolean {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === 'object' && (v as any).__map)
    return (v as any).entries.length > 0;
  return Boolean(v);
}

function anyToString(v: QvmValue): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return '[' + v.map(formatValue).join(', ') + ']';
  return formatValue(v);
}

// ---------------------------------------------------------------------------
// Convenience: build + run a module in one shot.
// ---------------------------------------------------------------------------

export function runModule(module: QvmModule, opts?: QvmOptions): QvmRunResult {
  const vm = new QVM(module, opts);
  return vm.run();
}

export { FunctionBuilder, ModuleBuilder, formatValue };
