#!/usr/bin/env bun
/**
 * PLM CLI — Programming Language Maker command-line interface.
 *
 * Usage:
 *   plm run    <config.json> <source>      Compile & run
 *   plm compile <config.json> <source>     Compile & show bytecode
 *   plm ast    <config.json> <source>      Show AST
 *   plm tokens <config.json> <source>      Show tokens
 *   plm repl   <config.json>               Interactive REPL
 *   plm info   <config.json>               Show config summary
 *   plm demo   [language]                  Run a built-in demo (minilang, minic, pythonic, etc.)
 *   plm list                               List built-in languages
 *   plm init   <name>                      Write a starter config to <name>.plm.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { compileSource, astToJson } from '../src/lib/plm/compiler';
import { runModule } from '../src/lib/qvm/vm';
import { PlmConfig } from '../src/lib/plm/config';
import { LANGUAGES } from '../src/lib/languages';
import { listStdPackages, getStdPackage } from '../src/lib/qvm/stdlib';
import { serializePackage } from '../src/lib/qvm/package';
import * as path from 'path';

function loadConfig(cfgPath: string): PlmConfig {
  const text = readFileSync(cfgPath, 'utf-8');
  return JSON.parse(text);
}

/** Load a built-in language config by name. */
function loadBuiltin(name: string): PlmConfig | null {
  const lang = LANGUAGES.find((l) => l.id === name || l.name.toLowerCase() === name.toLowerCase());
  return lang ? lang.config : null;
}

function cmdRun(cfgPath: string, srcPath: string) {
  const cfg = loadConfig(cfgPath);
  const src = readFileSync(srcPath, 'utf-8');
  const out = compileSource(cfg, src);
  if (out.configErrors.length) {
    console.error('Config errors:');
    for (const e of out.configErrors) console.error('  ' + e);
    process.exit(1);
  }
  if (out.lexErrors.length) {
    console.error('Lex errors:');
    for (const e of out.lexErrors) console.error('  ' + e);
    process.exit(1);
  }
  if (out.parseErrors.length) {
    console.error('Parse errors:');
    for (const e of out.parseErrors) console.error('  ' + e);
    process.exit(1);
  }
  if (out.compileErrors.length) {
    console.error('Compile errors:');
    for (const e of out.compileErrors) console.error('  ' + e);
    process.exit(1);
  }
  const result = runModule(out.compile!.module, { instructionLimit: 100_000_000 });
  process.stdout.write(result.output);
  if (result.error) {
    console.error('Runtime error:', result.error);
    if (result.stackTrace) console.error(result.stackTrace.join('\n'));
    process.exit(1);
  }
}

function cmdCompile(cfgPath: string, srcPath: string) {
  const cfg = loadConfig(cfgPath);
  const src = readFileSync(srcPath, 'utf-8');
  const out = compileSource(cfg, src);
  if (out.compileErrors.length || out.lexErrors.length || out.parseErrors.length) {
    for (const e of [...out.lexErrors, ...out.parseErrors, ...out.compileErrors]) {
      console.error(e);
    }
    process.exit(1);
  }
  for (const fn of out.compile!.disasm) {
    console.log(`\n=== ${fn.name} ===`);
    console.log(fn.lines.join('\n'));
  }
}

function cmdAst(cfgPath: string, srcPath: string) {
  const cfg = loadConfig(cfgPath);
  const src = readFileSync(srcPath, 'utf-8');
  const out = compileSource(cfg, src);
  console.log(astToJson(out.ast));
}

function cmdTokens(cfgPath: string, srcPath: string) {
  const cfg = loadConfig(cfgPath);
  const src = readFileSync(srcPath, 'utf-8');
  const out = compileSource(cfg, src);
  if (out.tokens) {
    for (const t of out.tokens) {
      const val = t.value !== undefined ? ` (${JSON.stringify(t.value)})` : '';
      console.log(`${t.type.padEnd(12)} ${t.line}:${t.col}  "${t.text}"${val}`);
    }
  }
}

function cmdInfo(cfgPath: string) {
  const cfg = loadConfig(cfgPath);
  console.log(`Language: ${cfg.language.name} v${cfg.language.version ?? '1.0'}`);
  console.log(`Extension: ${cfg.language.fileExtension ?? '?'}`);
  if (cfg.language.description) console.log(`Description: ${cfg.language.description}`);
  console.log(`\nTokens (${cfg.lexer.tokens.length}):`);
  for (const t of cfg.lexer.tokens) {
    console.log(`  ${t.name.padEnd(12)} ${t.kind}${t.literal ? ` "${t.literal}"` : ''}`);
  }
  const kwCount = cfg.lexer.keywords ? Object.keys(cfg.lexer.keywords).length : 0;
  console.log(`\nKeywords (${kwCount}):`);
  if (cfg.lexer.keywords) {
    for (const [k, v] of Object.entries(cfg.lexer.keywords)) {
      console.log(`  ${k.padEnd(12)} -> ${v}`);
    }
  }
  const ruleCount = Object.keys(cfg.grammar.rules).length;
  console.log(`\nGrammar: ${ruleCount} rules, start = ${cfg.grammar.start}`);
  console.log(`Codegen: ${cfg.codegen.templates.length} templates`);
}

function cmdDemo(langName?: string) {
  // If a language name is given, run that language's sample.
  // Otherwise, run a default MiniLang demo.
  if (langName) {
    const lang = LANGUAGES.find(
      (l) => l.id === langName || l.name.toLowerCase() === langName.toLowerCase()
    );
    if (!lang) {
      console.error(`Unknown language: ${langName}`);
      console.error('Available: ' + LANGUAGES.map((l) => l.id).join(', '));
      process.exit(1);
    }
    const out = compileSource(lang.config, lang.sample);
    if (out.compileErrors.length) {
      for (const e of out.compileErrors) console.error(e);
      process.exit(1);
    }
    const result = runModule(out.compile!.module, { instructionLimit: 100_000_000 });
    process.stdout.write(result.output);
    return;
  }

  // Default MiniLang demo
  const demo = `
// MiniLang demo — recursive Fibonacci
fn fib(n) {
  if (n < 2) { return n; }
  return fib(n - 1) + fib(n - 2);
}

print "Fibonacci sequence:";
let i = 0;
while (i < 15) {
  print fib(i);
  i = i + 1;
}

print "";
print "Arithmetic:";
print 1 + 2 * 3;
print (1 + 2) * 3;
print 10 / 3;
print 10 % 3;

print "";
print "Logic:";
print !false;
print true && false;
print 3 < 5 && 5 > 1;
`;
  const cfg = loadBuiltin('minilang')!;
  const out = compileSource(cfg, demo);
  if (out.compileErrors.length) {
    for (const e of out.compileErrors) console.error(e);
    process.exit(1);
  }
  const result = runModule(out.compile!.module, { instructionLimit: 100_000_000 });
  process.stdout.write(result.output);
}

function cmdList() {
  console.log('Built-in languages:');
  console.log('');
  for (const lang of LANGUAGES) {
    console.log(`  ${lang.id.padEnd(12)} ${lang.name.padEnd(14)} .${lang.extension.padEnd(5)} ${lang.description}`);
  }
  console.log('');
  console.log('Usage:');
  console.log('  plm demo <language-id>    Run the sample program for a language');
  console.log('  plm run <config.json> <source>   Run with a custom config');
}

function cmdPackages(pkgName?: string) {
  if (pkgName) {
    // Export a specific package to stdout as JSON.
    const pkg = getStdPackage(pkgName);
    if (!pkg) {
      console.error(`Unknown package: ${pkgName}`);
      console.error('Available: ' + listStdPackages().join(', '));
      process.exit(1);
    }
    process.stdout.write(serializePackage(pkg));
    return;
  }
  // List all packages.
  const pkgs = listStdPackages();
  console.log('Standard QVM packages:');
  console.log('');
  for (const name of pkgs) {
    const pkg = getStdPackage(name)!;
    const fns = pkg.exports ?? Object.keys(pkg.module.functions);
    console.log(`  ${name.padEnd(16)} v${pkg.version ?? '1.0.0'}`);
    console.log(`    ${pkg.description}`);
    console.log(`    Functions: ${fns.join(', ')}`);
    console.log('');
  }
  console.log('Usage:');
  console.log('  plm packages <name>    Export a package as JSON to stdout');
  console.log('  plm packages <name> > pkg.qvmpkg   Save to file');
}

async function cmdRepl(cfgPath: string) {
  const cfg = loadConfig(cfgPath);
  console.log(`PLM REPL — ${cfg.language.name} v${cfg.language.version ?? '1.0'}`);
  console.log('Type :help for commands, :quit to exit.\n');

  // Accumulate top-level statements across REPL lines.
  let buffer = '';
  while (true) {
    process.stdout.write(buffer.length > 0 ? '... > ' : `${cfg.language.name}> `);
    let line: string;
    try {
      line = await readLine();
    } catch {
      break;
    }
    if (line === null) break;
    if (line.trim() === ':quit' || line.trim() === ':q') break;
    if (line.trim() === ':help') {
      console.log('Commands:');
      console.log('  :quit, :q   Exit REPL');
      console.log('  :help       Show this help');
      console.log('  :reset      Reset buffer');
      console.log('  :show       Show accumulated source');
      console.log('');
      continue;
    }
    if (line.trim() === ':reset') {
      buffer = '';
      continue;
    }
    if (line.trim() === ':show') {
      console.log(buffer);
      continue;
    }
    buffer += line + '\n';
    // Try to compile & run the accumulated buffer.
    try {
      const out = compileSource(cfg, buffer);
      if (out.lexErrors.length || out.parseErrors.length) {
        // Wait for more input.
        continue;
      }
      if (out.compileErrors.length) {
        for (const e of out.compileErrors) console.error('  ' + e);
        buffer = '';
        continue;
      }
      const result = runModule(out.compile!.module, { instructionLimit: 10_000_000 });
      process.stdout.write(result.output);
      if (result.error) console.error('  Error:', result.error);
      buffer = '';
    } catch (e: any) {
      console.error('  Error:', e.message);
      buffer = '';
    }
  }
}

function readLine(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.resume();
    const onData = (chunk: string) => {
      data += chunk;
      if (data.includes('\n')) {
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stdin.removeListener('end', onEnd);
        resolve(data.slice(0, data.indexOf('\n')));
      }
    };
    const onEnd = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.removeListener('end', onEnd);
      resolve(data);
    };
    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const cmd = args[0];

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(`PLM — Programming Language Maker

Usage:
  plm run      <config.json> <source>   Compile and run a source file
  plm compile  <config.json> <source>   Compile and show disassembled bytecode
  plm ast      <config.json> <source>   Show the parsed AST as JSON
  plm tokens   <config.json> <source>   Show the token stream
  plm info     <config.json>            Show a summary of the language config
  plm repl     <config.json>            Interactive REPL
  plm demo     [language]               Run a built-in language demo
  plm list                              List built-in languages
  plm packages [name]                   List packages, or export one as JSON
  plm init     <name>                   Write a starter config to <name>.plm.json
`);
  process.exit(0);
}

switch (cmd) {
  case 'run':
    if (args.length < 3) {
      console.error('Usage: plm run <config.json> <source>');
      process.exit(1);
    }
    cmdRun(args[1], args[2]);
    break;
  case 'compile':
    if (args.length < 3) {
      console.error('Usage: plm compile <config.json> <source>');
      process.exit(1);
    }
    cmdCompile(args[1], args[2]);
    break;
  case 'ast':
    if (args.length < 3) {
      console.error('Usage: plm ast <config.json> <source>');
      process.exit(1);
    }
    cmdAst(args[1], args[2]);
    break;
  case 'tokens':
    if (args.length < 3) {
      console.error('Usage: plm tokens <config.json> <source>');
      process.exit(1);
    }
    cmdTokens(args[1], args[2]);
    break;
  case 'info':
    if (args.length < 2) {
      console.error('Usage: plm info <config.json>');
      process.exit(1);
    }
    cmdInfo(args[1]);
    break;
  case 'repl':
    if (args.length < 2) {
      console.error('Usage: plm repl <config.json>');
      process.exit(1);
    }
    cmdRepl(args[1]);
    break;
  case 'demo':
    cmdDemo(args[1]);
    break;
  case 'list':
    cmdList();
    break;
  case 'packages':
    cmdPackages(args[1]);
    break;
  case 'init': {
    const name = args[1] ?? 'minilang';
    const cfg = loadBuiltin(name) ?? loadBuiltin('minilang')!;
    const outPath = path.resolve(process.cwd(), `${name}.plm.json`);
    writeFileSync(outPath, JSON.stringify(cfg, null, 2));
    console.log(`Wrote starter config to ${outPath}`);
    break;
  }
  default:
    console.error(`Unknown command: ${cmd}`);
    console.error('Run "plm help" for usage.');
    process.exit(1);
}
