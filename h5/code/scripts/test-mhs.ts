/**
 * Test MiniHaskell.
 */
import { minihaskellConfig } from '../src/lib/plm-builtin/minihaskell';
import { compileSource } from '../src/lib/plm/compiler';
import { runModule } from '../src/lib/qvm/vm';

const T1 = `print ((\\x -> x + 1) 41)`;
const T2 = `print (let x = 10 in let y = 20 in x + y)`;
const T3 = `print (if 3 < 5 then 100 else 200)`;
const T4 = `print (case [1, 2, 3] of [] -> 0; (x:xs) -> x;)`;
const T5 = `letrec map = \\f xs -> case xs of [] -> []; (x:xs) -> f x : map f xs; in print (map (\\x -> x * 2) [1, 2, 3, 4])`;
const T6 = `print (1 + 2 * 3)`;

const tests = [
  { name: 'lambda app', src: T1, expected: '42' },
  { name: 'let', src: T2, expected: '30' },
  { name: 'if', src: T3, expected: '100' },
  { name: 'case list', src: T4, expected: '1' },
  { name: 'recursive map', src: T5, expected: '[2, 4, 6, 8]' },
  { name: 'print', src: T6, expected: '7' },
];

for (const t of tests) {
  console.log(`=== ${t.name} ===`);
  const out = compileSource(minihaskellConfig, t.src);
  if (out.lexErrors.length) console.error('  Lex:', out.lexErrors);
  if (out.parseErrors.length) console.error('  Parse:', out.parseErrors);
  if (out.compileErrors.length) console.error('  Compile:', out.compileErrors);
  if (out.compile) {
    const result = runModule(out.compile.module, { instructionLimit: 100_000_000 });
    const actual = result.output.trim();
    const pass = actual === t.expected;
    console.log(`  Output: ${JSON.stringify(result.output)} ${pass ? '✓' : '✗ expected ' + JSON.stringify(t.expected)}`);
    if (result.error) console.error('  Error:', result.error);
  }
  console.log();
}
