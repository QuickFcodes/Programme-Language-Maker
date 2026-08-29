/**
 * Built-in language configurations registry.
 */

import { PlmConfig } from './plm/config';
import { minilangConfig } from './plm-builtin/minilang';
import { brainfuckConfig } from './plm-builtin/brainfuck';
import { minihaskellConfig } from './plm-builtin/minihaskell';
import { minicConfig } from './plm-builtin/minic';
import { minilispConfig } from './plm-builtin/minilisp';
import { pythonicConfig } from './plm-builtin/pythonic';
import { owllangConfig } from './plm-builtin/owllang';

/**
 * Enhance a language config with default imports.
 * Returns a new config with defaultImports set.
 */
function withDefaults(cfg: PlmConfig, imports: string[]): PlmConfig {
  return { ...cfg, defaultImports: imports };
}

// Common default imports for all imperative-style languages.
const IO_IMPORTS = ['std.io'];
const FULL_IMPORTS = ['std.io', 'std.list', 'std.string', 'std.math', 'std.func'];

export interface LanguageDef {
  id: string;
  name: string;
  extension: string;
  description: string;
  config: PlmConfig;
  /** Sample program to show in the editor by default. */
  sample: string;
}

export const LANGUAGES: LanguageDef[] = [
  {
    id: 'minilang',
    name: 'MiniLang',
    extension: 'ml',
    description: 'Imperative language with functions, while loops, if/else',
    config: withDefaults(minilangConfig, FULL_IMPORTS),
    sample: `// MiniLang — using std.math functions
// abs, min, max are available via default imports
print abs(-42);
print min(3, 7);
print max(3, 7);

// Recursive Fibonacci
fn fib(n) {
  if (n < 2) {
    return n;
  }
  return fib(n - 1) + fib(n - 2);
}

let i = 0;
while (i < 10) {
  print fib(i);
  i = i + 1;
}
`,
  },
  {
    id: 'minic',
    name: 'MiniC',
    extension: 'mc',
    description: 'C-like language with arrays, for loops, typed declarations',
    config: withDefaults(minicConfig, FULL_IMPORTS),
    sample: `// MiniC — arrays and for loops
int sum = 0;
int arr[5];
arr[0] = 10;
arr[1] = 20;
arr[2] = 30;
arr[3] = 40;
arr[4] = 50;

for (int i = 0; i < 5; i = i + 1) {
  sum = sum + arr[i];
}

printf sum;
`,
  },
  {
    id: 'pythonic',
    name: 'Pythonic',
    extension: 'py',
    description: 'Python-like syntax with def, for-in-range, True/False/None',
    config: withDefaults(pythonicConfig, FULL_IMPORTS),
    sample: `# Pythonic — Fibonacci
def fib(n): {
    if n < 2: {
        return n
    }
    return fib(n - 1) + fib(n - 2)
}

for i in range(10): {
    print(fib(i))
}
`,
  },
  {
    id: 'minihaskell',
    name: 'MiniHaskell',
    extension: 'mhs',
    description: 'Functional language with lambdas, let, case/pattern matching',
    config: withDefaults(minihaskellConfig, FULL_IMPORTS),
    sample: `-- MiniHaskell — lambda and case
print ((\\x -> x + 1) 41)

print (let x = 10 in let y = 20 in x + y)

print (case [1, 2, 3] of
  [] -> 0;
  (x:xs) -> x;)
`,
  },
  {
    id: 'minilisp',
    name: 'MiniLisp',
    extension: 'lisp',
    description: 'Lisp/Scheme dialect with S-expressions, lambda, define',
    config: withDefaults(minilispConfig, FULL_IMPORTS),
    sample: `; MiniLisp — S-expressions
(print (+ 1 2))
(define x 10)
(print (+ x 5))
(print ((lambda (x) (* x x)) 5))
(print (if (> 3 2) 100 200))
`,
  },
  {
    id: 'owllang',
    name: 'OwlLang',
    extension: 'owl',
    description: 'Object-oriented language with classes, methods, exceptions',
    config: withDefaults(owllangConfig, FULL_IMPORTS),
    sample: `// OwlLang — Classes and objects
class Animal {
  fn init(name) {
    this.name = name;
  }
  fn speak() {
    print this.name;
  }
}

let a = new Animal("Rex");
a.speak();

// Using std.math functions
let n = 0 - 42;
let r = abs(n);
print r;
let m = max(3, 7);
print m;
`,
  },
  {
    id: 'brainfuck',
    name: 'Brainfuck',
    extension: 'bf',
    description: 'Esoteric language with 8 commands: > < + - . , [ ]',
    config: withDefaults(brainfuckConfig, []),  // Brainfuck has its own I/O model
    sample: `++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.-.>>+.>++.`,
  },
];

export function getLanguage(id: string): LanguageDef | undefined {
  return LANGUAGES.find((l) => l.id === id);
}
