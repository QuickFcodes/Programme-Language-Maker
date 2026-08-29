/**
 * Test MiniC — a C-like language.
 *
 * Run with: cd /home/z/my-project && bun run scripts/test-mc.ts
 */

import { minicConfig } from '../src/lib/plm-builtin/minic';
import { compileSource, astToJson } from '../src/lib/plm/compiler';
import { runModule } from '../src/lib/qvm/vm';

interface TestCase {
  name: string;
  src: string;
  expected: string;
  verbose?: boolean;
}

const tests: TestCase[] = [
  {
    name: 'Hello world',
    src: `printf "Hello, World!";`,
    expected: 'Hello, World!\n',
  },
  {
    name: 'Arithmetic (precedence)',
    src: `int x = 1 + 2 * 3; printf x;`,
    expected: '7\n',
  },
  {
    name: 'For loop (desugared to while)',
    src: `for (int i = 0; i < 5; i = i + 1) { printf i; }`,
    expected: '0\n1\n2\n3\n4\n',
  },
  {
    name: 'Functions (recursive add)',
    src: `int add(int a, int b) { return a + b; } printf add(3, 4);`,
    expected: '7\n',
  },
  {
    name: 'Arrays (NEW_LIST + index set/get)',
    src: `int arr[3]; arr[0] = 10; arr[1] = 20; arr[2] = 30; printf arr[0] + arr[1] + arr[2];`,
    expected: '60\n',
  },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  console.log(`=== ${t.name} ===`);
  console.log(`  Source:   ${t.src}`);

  const out = compileSource(minicConfig, t.src);

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
    console.log(astToJson(out.ast).split('\n').map((l) => '    ' + l).join('\n'));
    console.log('  Bytecode:');
    for (const fn of out.compile!.disasm) {
      console.log(`    --- ${fn.name} ---`);
      console.log(fn.lines.map((l) => '    ' + l).join('\n'));
    }
  }

  const result = runModule(out.compile!.module, { instructionLimit: 10_000_000 });

  if (result.error) {
    console.error('  Runtime error:', result.error);
    if (result.stackTrace) console.error('  Stack:', result.stackTrace.join('\n'));
    failed++;
    continue;
  }

  const pass = result.output === t.expected;
  console.log(`  Output:   ${JSON.stringify(result.output)}`);
  console.log(`  Expected: ${JSON.stringify(t.expected)}  ${pass ? '✓ PASS' : '✗ FAIL'}`);

  if (pass) passed++;
  else failed++;
  console.log();
}

console.log(`=== Summary ===`);
console.log(`Passed: ${passed}/${tests.length}`);
console.log(`Failed: ${failed}/${tests.length}`);
process.exit(failed > 0 ? 1 : 0);
