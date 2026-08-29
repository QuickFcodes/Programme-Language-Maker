import { owllangConfig } from '../src/lib/plm-builtin/owllang';
import { compileSource } from '../src/lib/plm/compiler';
import { runModule } from '../src/lib/qvm/vm';
import { readFileSync } from 'fs';

const src = readFileSync('download/examples/test-addblock.owl', 'utf-8');
const out = compileSource(owllangConfig, src);
if (out.compileErrors.length) console.error('Compile:', out.compileErrors);
if (out.compile) {
  const result = runModule(out.compile.module, { instructionLimit: 100_000_000 });
  console.log('Output:', JSON.stringify(result.output));
  if (result.error) console.error('Error:', result.error);
}
