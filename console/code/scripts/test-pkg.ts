/**
 * Test package management and default imports.
 */
import { minilangConfig } from '../src/lib/plm-builtin/minilang';
import { compileSource } from '../src/lib/plm/compiler';
import { runModule } from '../src/lib/qvm/vm';
import { getStdPackage, listStdPackages, buildStdIo } from '../src/lib/qvm/stdlib';
import { serializePackage, deserializePackage, mergePackages } from '../src/lib/qvm/package';

console.log('=== Standard packages ===');
console.log('Available:', listStdPackages());

console.log('\n=== std.io package ===');
const stdIo = getStdPackage('std.io')!;
console.log('Name:', stdIo.name);
console.log('Exports:', stdIo.exports);
console.log('Functions:', Object.keys(stdIo.module.functions));

console.log('\n=== Test default imports ===');
// MiniLang with defaultImports should have access to std.io functions.
const cfg = { ...minilangConfig, defaultImports: ['std.io', 'std.math'] };

// Use the `abs` function from std.math
const src = `
print abs(-42);
`;
const out = compileSource(cfg, src);
if (out.compileErrors.length) {
  console.error('Compile errors:', out.compileErrors);
} else {
  console.log('Imported packages:', out.importedPackages);
  const result = runModule(out.compile!.module, { instructionLimit: 100_000_000 });
  console.log('Output:', JSON.stringify(result.output));
  console.log('Error:', result.error);
}

console.log('\n=== Test package serialization ===');
const pkg = buildStdIo();
const json = serializePackage(pkg);
console.log('Serialized length:', json.length);
const restored = deserializePackage(json);
console.log('Restored name:', restored.name);
console.log('Restored exports:', restored.exports);
console.log('Restored functions:', Object.keys(restored.module.functions));

console.log('\n=== Test mergePackages ===');
const stdMath = getStdPackage('std.math')!;
const target = out.compile!.module;
const before = Object.keys(target.functions).length;
const merged = mergePackages(target, [stdMath]);
const after = Object.keys(target.functions).length;
console.log(`Functions before: ${before}, after: ${after}`);
console.log('Merged:', merged);
