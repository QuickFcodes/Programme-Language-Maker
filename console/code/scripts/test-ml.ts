/**
 * Test MiniLisp — a small Lisp/Scheme dialect.
 *
 * Run with: cd /home/z/my-project && bun run scripts/test-ml.ts
 */

import { minilispConfig } from '../src/lib/plm-builtin/minilisp';
import { compileSource, astToJson } from '../src/lib/plm/compiler';
import { runModule } from '../src/lib/qvm/vm';

interface TestCase {
  name: string;
  src: string;
  /** Expected stdout (trimmed). */
  expected: string;
  verbose?: boolean;
}

const tests: TestCase[] = [
  {
    name: '1. arithmetic (+ 1 2)',
    src: `(print (+ 1 2))`,
    expected: '3',
  },
  {
    name: '2. define + arithmetic',
    src: `(define x 10) (print (+ x 5))`,
    expected: '15',
  },
  {
    name: '3. lambda application',
    src: `(print ((lambda (x) (* x x)) 5))`,
    expected: '25',
  },
  {
    name: '4. if expression',
    src: `(print (if (> 3 2) 100 200))`,
    expected: '100',
  },
  {
    name: '5. car / cons / nil',
    src: `(print (car (cons 1 (cons 2 nil))))`,
    expected: '1',
  },
  {
    name: '6. print string',
    src: `(print "hello")`,
    expected: 'hello',
  },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  console.log(`=== ${t.name} ===`);
  console.log(`  Source:   ${t.src}`);

  const out = compileSource(minilispConfig, t.src);

  if (out.configErrors.length) {
    console.error('  Config errors:', out.configErrors);
    failed++;
    continue;
  }
  if (out.lexErrors.length) {
    console.error('  Lex errors:', out.lexErrors);
    failed++;
    continue;
  }
  if (out.parseErrors.length) {
    console.error('  Parse errors:', out.parseErrors);
    failed++;
    continue;
  }
  if (out.compileErrors.length) {
    console.error('  Compile errors:', out.compileErrors);
    failed++;
    continue;
  }

  if (t.verbose) {
    console.log('  AST:');
    console.log(
      astToJson(out.ast)
        .split('\n')
        .map((l) => '    ' + l)
        .join('\n')
    );
    console.log('  Bytecode:');
    for (const fn of out.compile!.disasm) {
      console.log(`    --- ${fn.name} ---`);
      console.log(
        fn.lines
          .map((l) => '    ' + l)
          .join('\n')
      );
    }
  }

  const result = runModule(out.compile!.module, {
    instructionLimit: 10_000_000,
  });

  if (result.error) {
    console.error('  Runtime error:', result.error);
    if (result.stackTrace) console.error('  Stack:', result.stackTrace.join('\n'));
    failed++;
    continue;
  }

  const actual = result.output.trim();
  const pass = actual === t.expected;
  console.log(`  Output:   ${JSON.stringify(result.output)}`);
  console.log(
    `  Expected: ${JSON.stringify(t.expected)}  ${pass ? '✓ PASS' : '✗ FAIL'}`
  );

  if (pass) passed++;
  else {
    console.log(`  Final stack: ${JSON.stringify(result.finalStack)}`);
    failed++;
  }
  console.log();
}

console.log(`=== Summary ===`);
console.log(`Passed: ${passed}/${tests.length}`);
console.log(`Failed: ${failed}/${tests.length}`);
process.exit(failed > 0 ? 1 : 0);
