/**
 * Test OwlLang.
 */
import { owllangConfig } from '../src/lib/plm-builtin/owllang';
import { compileSource } from '../src/lib/plm/compiler';
import { runModule } from '../src/lib/qvm/vm';
import { readFileSync } from 'fs';

const src = readFileSync('download/examples/blockchain.owl', 'utf-8');
console.log('=== OwlLang test ===');
const out = compileSource(owllangConfig, src);
if (out.lexErrors.length) console.error('Lex:', out.lexErrors);
if (out.parseErrors.length) console.error('Parse:', out.parseErrors);
if (out.compileErrors.length) console.error('Compile:', out.compileErrors);
if (out.compile) {
  console.log('Functions:', Object.keys(out.compile.module.functions));
  console.log('\nBytecode (__method_init):');
  const init = out.compile.disasm.find(d => d.name === '__method_init');
  if (init) console.log(init.lines.join('\n'));
  console.log('\nBytecode (__class_Animal):');
  const ctor = out.compile.disasm.find(d => d.name === '__class_Animal');
  if (ctor) console.log(ctor.lines.join('\n'));
  const result = runModule(out.compile.module, { instructionLimit: 100_000_000 });
  console.log('\nOutput:', JSON.stringify(result.output));
  if (result.error) console.error('Error:', result.error);
}
