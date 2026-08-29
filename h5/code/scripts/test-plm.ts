/**
 * Quick smoke test for the PLM + QVM pipeline.
 * Run with: bun /home/z/my-project/scripts/test-plm.ts
 */

import { minilangConfig } from '../src/lib/plm-builtin/minilang';
import { compileSource, astToJson } from '../src/lib/plm/compiler';
import { runModule } from '../src/lib/qvm/vm';

const SAMPLE = `
  // Fibonacci — recursive
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

  print "hello, world";
  print 1 + 2 * 3;
  print 10 - 3 - 2;
  print (1 + 2) * 3;
  print !false;
  print 5 == 5;
  print 5 != 5;
  print 3 < 5 && 5 > 1;
`;

console.log('=== Lex + Parse + Codegen ===');
const out = compileSource(minilangConfig, SAMPLE);

if (out.configErrors.length) {
  console.error('Config errors:', out.configErrors);
  process.exit(1);
}
if (out.lexErrors.length) {
  console.error('Lex errors:', out.lexErrors);
  process.exit(1);
}
if (out.parseErrors.length) {
  console.error('Parse errors:', out.parseErrors);
  process.exit(1);
}
if (out.compileErrors.length) {
  console.error('Compile errors:', out.compileErrors);
  process.exit(1);
}

console.log('=== AST ===');
console.log(astToJson(out.ast));

console.log('\n=== Bytecode ===');
for (const fn of out.compile!.disasm) {
  console.log(`\n--- ${fn.name} ---`);
  console.log(fn.lines.join('\n'));
}

console.log('\n=== Run ===');
const result = runModule(out.compile!.module, { instructionLimit: 10_000_000 });
console.log('Output:');
console.log(result.output);
if (result.error) {
  console.error('Error:', result.error);
  if (result.stackTrace) console.error('Stack:', result.stackTrace.join('\n'));
}
console.log('Exit code:', result.exitCode);
