import { minihaskellConfig } from '../src/lib/plm-builtin/minihaskell';
import { compileSource } from '../src/lib/plm/compiler';

const T = `letrec map = \\f xs -> case xs of [] -> [] in map`;
const out = compileSource(minihaskellConfig, T);
console.log('Test 1:', out.parseErrors);

const T2 = `letrec map = \\f xs -> case xs of (x:xs) -> x in map`;
const out2 = compileSource(minihaskellConfig, T2);
console.log('Test 2:', out2.parseErrors);

const T3 = `letrec map = \\f xs -> case xs of [] -> [] (x:xs) -> x in map`;
const out3 = compileSource(minihaskellConfig, T3);
console.log('Test 3:', out3.parseErrors);

const T4 = `letrec map = \\f xs -> case xs of [] -> []; (x:xs) -> x; in map`;
const out4 = compileSource(minihaskellConfig, T4);
console.log('Test 4:', out4.parseErrors);
