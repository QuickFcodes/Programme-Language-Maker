import { minihaskellConfig } from '../src/lib/plm-builtin/minihaskell';
import { compileSource } from '../src/lib/plm/compiler';

const T = `[1, 2, 3]`;
const out = compileSource(minihaskellConfig, T);
console.log('[1,2,3] parse:', out.parseErrors);

const T2 = `case [1] of [] -> 0;`;
const out2 = compileSource(minihaskellConfig, T2);
console.log('case [1] parse:', out2.parseErrors);

const T3 = `case [1, 2] of [] -> 0;`;
const out3 = compileSource(minihaskellConfig, T3);
console.log('case [1,2] parse:', out3.parseErrors);
