import { minihaskellConfig } from '../src/lib/plm-builtin/minihaskell';
import { compileSource } from '../src/lib/plm/compiler';

const T = `\\x -> x + 1`;
const out = compileSource(minihaskellConfig, T);
console.log('Bytecode:');
for (const fn of out.compile!.disasm) {
  console.log(`--- ${fn.name} ---`);
  console.log(fn.lines.join('\n'));
}
