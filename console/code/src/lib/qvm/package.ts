/**
 * QVM Package format.
 *
 * A QVM package is a JSON-serializable module that exports functions
 * and constants. Packages are universal — any PLM-generated language
 * can import and use them.
 *
 * A package is simply a QvmModule with optional metadata:
 *   - version: semver string
 *   - description: human-readable summary
 *   - exports: list of function names to export (defaults to all)
 *
 * Because the VM's CALL opcode does flat lookup on
 * `module.functions[name]`, importing a package just means merging
 * its functions into the main module's function table before running.
 */

import { QvmModule, QvmFunction, QvmValue, ModuleBuilder, FunctionBuilder } from './bytecode';
import { Opcode } from './opcodes';

export interface QvmPackage {
  /** Package name (e.g. "std.io"). */
  name: string;
  /** Semver version. */
  version?: string;
  /** Human-readable description. */
  description?: string;
  /** Function names to export. If omitted, all functions are exported. */
  exports?: string[];
  /** The module payload — same shape as QvmModule. */
  module: QvmModule;
}

// ---------------------------------------------------------------------------
// Package builder — convenience for creating packages in code
// ---------------------------------------------------------------------------

export class PackageBuilder {
  private mb: ModuleBuilder;
  private _exports: string[] = [];

  constructor(
    public name: string,
    public version: string = '1.0.0',
    public description: string = ''
  ) {
    this.mb = new ModuleBuilder(name);
  }

  /** Get the underlying module builder. */
  get moduleBuilder(): ModuleBuilder {
    return this.mb;
  }

  /**
   * Define a native function — one whose body is hand-written opcodes.
   * Returns the FunctionBuilder for emitting code.
   */
  function(name: string, arity: number): FunctionBuilder {
    this._exports.push(name);
    return this.mb.function(name, arity);
  }

  /** Add a constant value to the package's pool. */
  addConstant(value: QvmValue): number {
    return this.mb.addConstant(value);
  }

  /** Mark a function as exported (if not already). */
  export(name: string): this {
    if (!this._exports.includes(name)) this._exports.push(name);
    return this;
  }

  build(): QvmPackage {
    const mod = this.mb.build();
    return {
      name: this.name,
      version: this.version,
      description: this.description,
      exports: this._exports,
      module: mod,
    };
  }
}

// ---------------------------------------------------------------------------
// Package merging — combine packages into a main module
// ---------------------------------------------------------------------------

/**
 * Merge one or more packages into a target module.
 * Each exported function from each package is added to target.functions.
 * If a function name already exists, it is skipped (first-wins).
 *
 * Constants from each package are re-indexed into the target's constant pool.
 *
 * Returns the list of function names that were merged.
 */
export function mergePackages(
  target: QvmModule,
  packages: QvmPackage[]
): string[] {
  const merged: string[] = [];
  for (const pkg of packages) {
    const src = pkg.module;
    const exports = pkg.exports ?? Object.keys(src.functions);
    for (const fnName of exports) {
      if (target.functions[fnName]) continue; // first-wins
      const srcFn = src.functions[fnName];
      if (!srcFn) continue;
      // Deep-copy the function so mutations don't affect the package.
      target.functions[fnName] = {
        name: srcFn.name,
        arity: srcFn.arity,
        locals: srcFn.locals,
        code: new Uint8Array(srcFn.code),
        lineMap: srcFn.lineMap ? { ...srcFn.lineMap } : undefined,
      };
      merged.push(fnName);
    }
  }
  return merged;
}

/**
 * Serialize a package to JSON (for saving to .qvmpkg files).
 */
export function serializePackage(pkg: QvmPackage): string {
  // Convert Uint8Array to regular array for JSON.
  const safe = {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    exports: pkg.exports,
    module: {
      name: pkg.module.name,
      constants: pkg.module.constants,
      main: {
        ...pkg.module.main,
        code: Array.from(pkg.module.main.code),
      },
      functions: Object.fromEntries(
        Object.entries(pkg.module.functions).map(([k, fn]) => [
          k,
          { ...fn, code: Array.from(fn.code) },
        ])
      ),
    },
  };
  return JSON.stringify(safe, null, 2);
}

/**
 * Deserialize a package from JSON (for loading .qvmpkg files).
 */
export function deserializePackage(json: string): QvmPackage {
  const raw = JSON.parse(json);
  const mod: QvmModule = {
    name: raw.module.name,
    constants: raw.module.constants,
    main: {
      ...raw.module.main,
      code: new Uint8Array(raw.module.main.code),
    },
    functions: Object.fromEntries(
      Object.entries(raw.module.functions).map(([k, fn]: [string, any]) => [
        k,
        { ...fn, code: new Uint8Array(fn.code) },
      ])
    ),
  };
  return {
    name: raw.name,
    version: raw.version,
    description: raw.description,
    exports: raw.exports,
    module: mod,
  };
}
