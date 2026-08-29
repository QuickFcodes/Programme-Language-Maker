import { minihaskellConfig } from '../src/lib/plm-builtin/minihaskell';
import { compileSource } from '../src/lib/plm/compiler';
import { runModule } from '../src/lib/qvm/vm';

const T1 = `(\\x -> x) 41`;
const out = compileSource(minihaskellConfig, T1);
console.log('Bytecode:');
for (const fn of out.compile!.disasm) {
  console.log(`--- ${fn.name} ---`);
  console.log(fn.lines.join('\n'));
}
const result = runModule(out.compile!.module);
console.log('Output:', JSON.stringify(result.output));
console.log('Error:', result.error);
