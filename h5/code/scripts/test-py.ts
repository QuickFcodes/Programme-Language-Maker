/**
 * Test Pythonic — a Python-flavored language with brace-delimited blocks.
 *
 * Run with: cd /home/z/my-project && bun run scripts/test-py.ts
 */

import { pythonicConfig } from '../src/lib/plm-builtin/pythonic';
import { compileSource, astToJson } from '../src/lib/plm/compiler';
import { runModule } from '../src/lib/qvm/vm';

interface TestCase {
  name: string;
  src: string;
  /** Expected stdout (trimmed). */
  expected: string;
  /** Print AST + bytecode for debugging. */
  verbose?: boolean;
}

const tests: TestCase[] = [
  {
    name: '1. arithmetic precedence: print(1 + 2 * 3)',
    src: `print(1 + 2 * 3)`,
    expected: '7',
  },
  {
    name: '2. variable assignment + addition',
    src: `x = 10; y = 20; print(x + y)`,
    expected: '30',
  },
  {
    name: '3. def + return + call',
    src: `def add(a, b): { return a + b; } print(add(3, 4))`,
    expected: '7',
  },
  {
    name: '4. for-in-range loop',
    src: `for i in range(5): { print(i); }`,
    expected: '0\n1\n2\n3\n4',
  },
  {
    name: '5. if/else with True/False',
    src: `if 3 > 2: { print(True); } else: { print(False); }`,
    expected: 'True',
  },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  console.log(`=== ${t.name} ===`);
  console.log(`  Source:   ${t.src}`);

  const out = compileSource(pythonicConfig, t.src);

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
