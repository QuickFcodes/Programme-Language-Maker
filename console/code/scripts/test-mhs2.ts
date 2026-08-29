import { minihaskellConfig } from '../src/lib/plm-builtin/minihaskell';
import { compileSource, astToJson } from '../src/lib/plm/compiler';

const T1 = `(\\x -> x) 41`;
const out = compileSource(minihaskellConfig, T1);
console.log('AST:');
console.log(astToJson(out.ast));
