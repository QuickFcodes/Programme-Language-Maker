import { brainfuckConfig } from '../src/lib/plm-builtin/brainfuck';
import { compileSource } from '../src/lib/plm/compiler';
import { runModule } from '../src/lib/qvm/vm';

const T = `++.`;
const out = compileSource(brainfuckConfig, T);
console.log('Bytecode:');
console.log(out.compile!.disasm[0].lines.join('\n'));
const result = runModule(out.compile!.module);
console.log('Output:', JSON.stringify(result.output));
