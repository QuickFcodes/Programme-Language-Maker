/**
 * Top-level PLM compiler: takes a config + source code, returns bytecode.
 *
 * Supports:
 *   - Default imports (built-in function libraries via cfg.defaultImports)
 *   - Explicit package imports (via the `packages` option)
 *   - Automatic merging of package functions into the compiled module
 */

import { Lexer } from './lexer';
import { Parser, AstNode } from './parser';
import { CodeGenerator, CompileResult } from './codegen';
import { PlmConfig, validateConfig } from './config';
import { QvmPackage, mergePackages } from '../qvm/package';
import { getStdPackages } from '../qvm/stdlib';
import { disassembleFunction } from '../qvm/bytecode';

export interface CompileOptions {
  /** Additional packages to merge into the compiled module. */
  packages?: QvmPackage[];
}

export interface PlmCompileOutput {
  ast?: AstNode;
  compile?: CompileResult;
  lexErrors: string[];
  parseErrors: string[];
  compileErrors: string[];
  configErrors: string[];
  tokens?: { type: string; text: string; line: number; col: number; value?: any }[];
  /** Names of packages that were merged into the module. */
  importedPackages?: string[];
}

export function compileSource(
  cfg: PlmConfig,
  source: string,
  opts?: CompileOptions
): PlmCompileOutput {
  const out: PlmCompileOutput = {
    lexErrors: [],
    parseErrors: [],
    compileErrors: [],
    configErrors: [],
  };

  // Validate config.
  const cfgErrors = validateConfig(cfg);
  if (cfgErrors.length > 0) {
    out.configErrors = cfgErrors.map((e) => `${e.path}: ${e.message}`);
    return out;
  }

  // Lex.
  const lexer = new Lexer(cfg.lexer);
  let tokens;
  try {
    tokens = lexer.tokenize(source);
    out.tokens = tokens.map((t) => ({
      type: t.type,
      text: t.text,
      line: t.line,
      col: t.col,
      value: t.value,
    }));
  } catch (e: any) {
    out.lexErrors.push(e.message);
    return out;
  }

  // Parse.
  const parser = new Parser(cfg.grammar, tokens);
  let ast: AstNode | null = null;
  try {
    ast = parser.parse();
    out.ast = ast ?? undefined;
  } catch (e: any) {
    out.parseErrors.push(e.message);
    return out;
  }

  // Codegen.
  try {
    const gen = new CodeGenerator(cfg.codegen);
    out.compile = gen.compile(ast!);

    // Merge default imports from config.
    const defaultImports = (cfg as any).defaultImports as string[] | undefined;
    const allPackages: QvmPackage[] = [];

    // 1. Config-specified default imports (by package name).
    if (defaultImports && defaultImports.length > 0) {
      const stdPkgs = getStdPackages(defaultImports);
      allPackages.push(...stdPkgs);
    }

    // 2. Explicit packages passed via options.
    if (opts?.packages) {
      allPackages.push(...opts.packages);
    }

    // 3. Language config can also carry inline packages (pre-built).
    const inlinePkgs = (cfg as any).inlinePackages as QvmPackage[] | undefined;
    if (inlinePkgs) {
      allPackages.push(...inlinePkgs);
    }

    if (allPackages.length > 0 && out.compile) {
      const merged = mergePackages(out.compile.module, allPackages);
      out.importedPackages = allPackages.map((p) => p.name);
      // Rebuild disasm to include merged functions.
      out.compile.disasm = [
        { name: '__main__', lines: disassembleFunction(out.compile.module.main, out.compile.module.constants) },
        ...Object.entries(out.compile.module.functions).map(([name, fn]) => ({
          name,
          lines: disassembleFunction(fn, out.compile.module.constants),
        })),
      ];
    }
  } catch (e: any) {
    out.compileErrors.push(e.message);
  }

  return out;
}

// ---------------------------------------------------------------------------
// AST pretty-print (for the AST viewer panel)
// ---------------------------------------------------------------------------

export function astToJson(node: AstNode | null | undefined, depth = 0): string {
  if (!node) return 'null';
  if (depth > 50) return '...';
  if (node.type === 'Token') {
    const t = node.fields?.tokenType;
    const v = node.fields?.value;
    if (v !== undefined && v !== null) {
      return `{Token ${t}: ${JSON.stringify(v)}}`;
    }
    return `{Token ${t}: ${JSON.stringify(node.fields?.text)}}`;
  }
  if (node.type === '__list__' || node.type === '__seq__') {
    const items = node.fields?.__items__ ?? node.fields?.__children__;
    if (Array.isArray(items)) {
      const ind = '  '.repeat(depth + 1);
      const indEnd = '  '.repeat(depth);
      const body = items.map((it: AstNode) => ind + astToJson(it, depth + 1)).join(',\n');
      return `[\n${body}\n${indEnd}]`;
    }
    const child = node.fields?.__child__;
    if (child) return astToJson(child, depth);
    return '[]';
  }
  const ind = '  '.repeat(depth + 1);
  const indEnd = '  '.repeat(depth);
  const fieldParts: string[] = [];
  if (node.fields) {
    for (const [k, v] of Object.entries(node.fields)) {
      if (k === '__children__' || k === '__items__' || k === '__child__') continue;
      if (Array.isArray(v)) {
        const body = v.map((it: AstNode) => ind + '  ' + astToJson(it, depth + 2)).join(',\n');
        fieldParts.push(`${ind}"${k}": [\n${body}\n${ind}]`);
      } else if (v && typeof v === 'object' && (v as AstNode).type) {
        fieldParts.push(`${ind}"${k}": ${astToJson(v as AstNode, depth + 1)}`);
      } else {
        fieldParts.push(`${ind}"${k}": ${JSON.stringify(v)}`);
      }
    }
  }
  if (fieldParts.length === 0) return `{${node.type}}`;
  return `{\n${ind}"type": "${node.type}",\n${fieldParts.join(',\n')}\n${indEnd}}`;
}
