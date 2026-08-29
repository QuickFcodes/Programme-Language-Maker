/**
 * Debug test — print AST and bytecode for a tiny program.
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

console.log('=== Source ===');
console.log(SAMPLE);

const out = compileSource(minilangConfig, SAMPLE);
console.log('\n=== Tokens ===');
console.log(out.tokens);

console.log('\n=== AST ===');
console.log(astToJson(out.ast));

console.log('\n=== Bytecode ===');
for (const fn of out.compile!.disasm) {
  console.log(`\n--- ${fn.name} ---`);
  console.log(fn.lines.join('\n'));
}

console.log('\n=== Run ===');
const result = runModule(out.compile!.module);
console.log('Output:', JSON.stringify(result.output));
console.log('Error:', result.error);
