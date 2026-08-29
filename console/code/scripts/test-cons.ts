import { minihaskellConfig } from '../src/lib/plm-builtin/minihaskell';
import { compileSource, astToJson } from '../src/lib/plm/compiler';

const T = `1 : 2 : []`;
const out = compileSource(minihaskellConfig, T);
console.log(astToJson(out.ast));
