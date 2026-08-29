import { owllangConfig } from '../src/lib/plm-builtin/owllang';
import { compileSource } from '../src/lib/plm/compiler';

// Test progressively more complex pieces
const tests = [
  `class Block { fn init(index) { this.index = index; } }`,
  `class Block { fn init(index, data) { this.index = index; } fn display() { print this.index; } }`,
  `class Block { fn computeHash() { let h = this.index * 31; return h; } }`,
  `class Blockchain { fn init() { this.chain = []; } }`,
  `let bc = new Blockchain();`,
  `for (b in this.chain) { b.display(); }`,
];

for (let i = 0; i < tests.length; i++) {
  const out = compileSource(owllangConfig, tests[i]);
  console.log(`Test ${i+1}: ${out.parseErrors.length ? 'FAIL ' + out.parseErrors[0] : 'OK'}`);
}
