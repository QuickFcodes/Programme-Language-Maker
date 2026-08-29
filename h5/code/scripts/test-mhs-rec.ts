import { minihaskellConfig } from '../src/lib/plm-builtin/minihaskell';
import { compileSource } from '../src/lib/plm/compiler';
import { runModule } from '../src/lib/qvm/vm';

const T = `letrec map = \\f xs -> case xs of [] -> []; (x:xs) -> f x : map f xs; in print (map (\\x -> x * 2) [1, 2])`;
const out = compileSource(minihaskellConfig, T);
if (out.compileErrors.length) console.error('Compile:', out.compileErrors);
if (out.compile) {
  console.log('Functions:', Object.keys(out.compile.module.functions));
  console.log('\nBytecode (__main__):');
  console.log(out.compile.disasm[0].lines.join('\n'));
  console.log('\nBytecode (__lambda_0):');
  const lam = out.compile.disasm.find(d => d.name === '__lambda_0');
  if (lam) console.log(lam.lines.join('\n'));
  const result = runModule(out.compile.module, { instructionLimit: 100_000_000 });
  console.log('\nOutput:', JSON.stringify(result.output));
  console.log('Error:', result.error);
}
