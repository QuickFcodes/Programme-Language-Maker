import { minihaskellConfig } from '../src/lib/plm-builtin/minihaskell';
import { compileSource } from '../src/lib/plm/compiler';
import { runModule } from '../src/lib/qvm/vm';

const T = `case [1] of (x:xs) -> x;`;
const out = compileSource(minihaskellConfig, T);
console.log('Bytecode:');
console.log(out.compile!.disasm[0].lines.join('\n'));
const result = runModule(out.compile!.module);
console.log('Output:', JSON.stringify(result.output));
console.log('Error:', result.error);
