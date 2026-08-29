/**
 * Standard QVM packages — built-in function libraries available to all
 * PLM-generated languages.
 *
 * These packages are automatically available via `defaultImports` in
 * language configs, or can be explicitly imported via `import "std.io"`.
 */

import { PackageBuilder } from './package';
import { Opcode } from './opcodes';
import { QvmPackage } from './package';

// ---------------------------------------------------------------------------
// std.io — input/output functions
// ---------------------------------------------------------------------------

export function buildStdIo(): QvmPackage {
  const pb = new PackageBuilder('std.io', '1.0.0', 'Input/output functions');

  // print(x) — print value with newline, return x
  const print = pb.function('print', 1);
  print.emit(Opcode.LOAD_LOCAL, 0);
  print.emit(Opcode.DUP);
  print.emit(Opcode.PRINT);
  print.emit(Opcode.RET);

  // println(x) — alias of print
  const println = pb.function('println', 1);
  println.emit(Opcode.LOAD_LOCAL, 0);
  println.emit(Opcode.DUP);
  println.emit(Opcode.PRINT);
  println.emit(Opcode.RET);

  // print_raw(x) — print without newline, return x
  const printRaw = pb.function('print_raw', 1);
  printRaw.emit(Opcode.LOAD_LOCAL, 0);
  printRaw.emit(Opcode.DUP);
  printRaw.emit(Opcode.PRINT_RAW);
  printRaw.emit(Opcode.RET);

  // input() — read a line from stdin (returns string)
  // For now, returns empty string since we don't have line-buffered input.
  const input = pb.function('input', 0);
  input.emit(Opcode.PUSH_STR, pb.addConstant(''));
  input.emit(Opcode.RET);

  return pb.build();
}

// ---------------------------------------------------------------------------
// std.list — list manipulation functions
// ---------------------------------------------------------------------------

export function buildStdList(): QvmPackage {
  const pb = new PackageBuilder('std.list', '1.0.0', 'List manipulation functions');

  // head(list) — first element
  const head = pb.function('head', 1);
  head.emit(Opcode.LOAD_LOCAL, 0);
  head.emit(Opcode.LIST_HEAD);
  head.emit(Opcode.RET);

  // tail(list) — list without first element
  const tail = pb.function('tail', 1);
  tail.emit(Opcode.LOAD_LOCAL, 0);
  tail.emit(Opcode.LIST_TAIL);
  tail.emit(Opcode.RET);

  // cons(head, tail) — prepend head to tail
  const cons = pb.function('cons', 2);
  cons.emit(Opcode.LOAD_LOCAL, 0);
  cons.emit(Opcode.LOAD_LOCAL, 1);
  cons.emit(Opcode.LIST_CONS);
  cons.emit(Opcode.RET);

  // is_empty(list) — true if list is empty
  const isEmpty = pb.function('is_empty', 1);
  isEmpty.emit(Opcode.LOAD_LOCAL, 0);
  isEmpty.emit(Opcode.LIST_IS_EMPTY);
  isEmpty.emit(Opcode.RET);

  // length(list) — number of elements
  const length = pb.function('length', 1);
  length.emit(Opcode.LOAD_LOCAL, 0);
  length.emit(Opcode.LEN);
  length.emit(Opcode.RET);

  // reverse(list) — reverse a list
  // Implemented as: result = []; for each item in list, result = [item] + result
  // Since we don't have loops in bytecode directly, we use a helper approach.
  // Actually, we can't easily implement reverse without iteration.
  // Let's skip it for now and add it when we have a better mechanism.

  return pb.build();
}

// ---------------------------------------------------------------------------
// std.string — string functions
// ---------------------------------------------------------------------------

export function buildStdString(): QvmPackage {
  const pb = new PackageBuilder('std.string', '1.0.0', 'String functions');

  // str_length(s) — length of string
  const strLen = pb.function('str_length', 1);
  strLen.emit(Opcode.LOAD_LOCAL, 0);
  strLen.emit(Opcode.LEN);
  strLen.emit(Opcode.RET);

  // concat(a, b) — string concatenation
  const concat = pb.function('concat', 2);
  concat.emit(Opcode.LOAD_LOCAL, 0);
  concat.emit(Opcode.LOAD_LOCAL, 1);
  concat.emit(Opcode.ADD);
  concat.emit(Opcode.RET);

  return pb.build();
}

// ---------------------------------------------------------------------------
// std.math — math functions
// ---------------------------------------------------------------------------

export function buildStdMath(): QvmPackage {
  const pb = new PackageBuilder('std.math', '1.0.0', 'Math functions');

  // abs(n) — absolute value
  const abs = pb.function('abs', 1);
  abs.emit(Opcode.LOAD_LOCAL, 0);
  abs.emit(Opcode.ABS);
  abs.emit(Opcode.RET);

  // min(a, b)
  const min = pb.function('min', 2);
  min.emit(Opcode.LOAD_LOCAL, 0);
  min.emit(Opcode.LOAD_LOCAL, 1);
  min.emit(Opcode.MIN);
  min.emit(Opcode.RET);

  // max(a, b)
  const max = pb.function('max', 2);
  max.emit(Opcode.LOAD_LOCAL, 0);
  max.emit(Opcode.LOAD_LOCAL, 1);
  max.emit(Opcode.MAX);
  max.emit(Opcode.RET);

  // Constants: PI, E
  // These are stored as globals in the package's main function.
  // We add them as constants so LOAD_GLOBAL can access them.
  pb.addConstant(Math.PI);
  pb.addConstant(Math.E);

  return pb.build();
}

// ---------------------------------------------------------------------------
// std.func — functional programming helpers
// ---------------------------------------------------------------------------

export function buildStdFunc(): QvmPackage {
  const pb = new PackageBuilder('std.func', '1.0.0', 'Functional programming helpers');

  // identity(x) — returns x
  const identity = pb.function('identity', 1);
  identity.emit(Opcode.LOAD_LOCAL, 0);
  identity.emit(Opcode.RET);

  // compose(f, g) — returns a closure that computes f(g(x))
  // This is complex — we'd need to create a closure.
  // Skip for now.

  return pb.build();
}

// ---------------------------------------------------------------------------
// Registry of all standard packages
// ---------------------------------------------------------------------------

let _registry: Record<string, QvmPackage> | null = null;

function ensureRegistry(): Record<string, QvmPackage> {
  if (_registry) return _registry;
  _registry = {};
  const packages = [
    buildStdIo(),
    buildStdList(),
    buildStdString(),
    buildStdMath(),
    buildStdFunc(),
  ];
  for (const pkg of packages) {
    _registry[pkg.name] = pkg;
  }
  return _registry;
}

/**
 * Get a standard package by name (e.g. "std.io").
 */
export function getStdPackage(name: string): QvmPackage | null {
  return ensureRegistry()[name] ?? null;
}

/**
 * List all available standard package names.
 */
export function listStdPackages(): string[] {
  return Object.keys(ensureRegistry());
}

/**
 * Get all standard packages.
 */
export function getAllStdPackages(): QvmPackage[] {
  return Object.values(ensureRegistry());
}

/**
 * Get multiple standard packages by name.
 * Returns only packages that exist (silently skips unknown names).
 */
export function getStdPackages(names: string[]): QvmPackage[] {
  const reg = ensureRegistry();
  return names.map((n) => reg[n]).filter(Boolean) as QvmPackage[];
}
