/**
 * Test Brainfuck language.
 */
import { brainfuckConfig } from '../src/lib/plm-builtin/brainfuck';
import { compileSource } from '../src/lib/plm/compiler';
import { runModule } from '../src/lib/qvm/vm';

// Print 'A' (65 increments then output)
const PRINT_A = `+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.`;

// Print "Hi" — H=72, i=105
// H = 72 = 8*9, so ++++++++++[>+++++++++<-]>.
// Then i = 105 = 72+33. We need to add 33 to the same cell.
// Simple: ++++++++++[>+++++++++<-]>+.  (cell0=10, cell1=72, then +1 = 73='I'... not quite)
// Let's just do direct: 72 increments for H, output, then 33 more for i (105), output.
const HI = `+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.`;

console.log('=== Brainfuck: Print A ===');
let out = compileSource(brainfuckConfig, PRINT_A);
if (out.compileErrors.length) console.error('Compile:', out.compileErrors);
if (out.compile) {
  const result = runModule(out.compile.module, { instructionLimit: 100_000_000 });
  console.log('Output:', JSON.stringify(result.output));
  if (result.error) console.error('Error:', result.error);
}

console.log('\n=== Brainfuck: Print Hi (H then i) ===');
out = compileSource(brainfuckConfig, HI);
if (out.compileErrors.length) console.error('Compile:', out.compileErrors);
if (out.compile) {
  const result = runModule(out.compile.module, { instructionLimit: 100_000_000 });
  console.log('Output:', JSON.stringify(result.output));
  if (result.error) console.error('Error:', result.error);
}

// Test loop: print 5 stars
// cell0=5, then loop: cell1 += 1, print, cell0 -= 1
// +++++[>+.<-]
const STARS = `+++++[>+.<-]`;
console.log('\n=== Brainfuck: 5 stars ===');
out = compileSource(brainfuckConfig, STARS);
if (out.compileErrors.length) console.error('Compile:', out.compileErrors);
if (out.compile) {
  const result = runModule(out.compile.module, { instructionLimit: 100_000_000 });
  console.log('Output:', JSON.stringify(result.output));
  if (result.error) console.error('Error:', result.error);
}
