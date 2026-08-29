import { minihaskellConfig } from '../src/lib/plm-builtin/minihaskell';
import { compileSource, astToJson } from '../src/lib/plm/compiler';

const T = `\\x -> x + 1`;
const out = compileSource(minihaskellConfig, T);
console.log(astToJson(out.ast));
