/**
 * QVM code generator driven by PLM codegen templates.
 *
 * Template op language:
 *
 *   Strings:
 *     "EVAL <field>"              Recursively emit code for child <field>
 *     "POP" | "DUP" | "SWAP"      Stack ops
 *     "PUSH_NULL"
 *     "PUSH_BOOL <literal|${field}>"  Push bool
 *     "PUSH_INT ${field}"         Push field's value as int constant
 *     "PUSH_STR ${field}"         Push field's value as string constant
 *     "LOAD_VAR ${field}"         Load variable by name
 *     "STORE_VAR ${field}"
 *     "DECLARE_VAR ${field}"      Declare local slot
 *     "PRINT" | "RET" | "HALT"
 *     "ADD" | "SUB" | "MUL" | "DIV" | "MOD" | "NEG"
 *     "EQ" | "NEQ" | "LT" | "GT" | "LTE" | "GTE"
 *     "AND" | "OR" | "NOT"
 *     "BINOP ${field}"            Emit opcode based on op string in <field>
 *     "CALL ${callee-field} ${args-field}"  Call function; argc = list length
 *     "NEW_LIST <n|${field}>"     n can be a literal or list-field (uses length)
 *     "GET_INDEX" | "SET_INDEX" | "LEN"
 *
 *   Structured ops:
 *     { if:      { cond: [...], then: [...], else?: [...] } }
 *     { while:   { cond: [...], body: [...] } }
 *     { forEach: "${field}", as?: "item", do: [...] }
 *     { block:   "${field}" }       Scoped block (new local scope)
 */

import { AstNode } from './parser';
import { Opcode } from '../qvm/opcodes';
import {
  FunctionBuilder,
  ModuleBuilder,
  QvmModule,
  disassembleFunction,
} from '../qvm/bytecode';
import { CodegenConfig, TemplateOp, CodegenTemplate } from './config';

export interface CompileResult {
  module: QvmModule;
  disasm: { name: string; lines: string[] }[];
  errors: string[];
}

export class CompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompileError';
  }
}

const BINOP_MAP: Record<string, Opcode> = {
  '+': Opcode.ADD,
  '-': Opcode.SUB,
  '*': Opcode.MUL,
  '/': Opcode.DIV,
  '%': Opcode.MOD,
  '<': Opcode.LT,
  '>': Opcode.GT,
  '<=': Opcode.LTE,
  '>=': Opcode.GTE,
  '==': Opcode.EQ,
  '!=': Opcode.NEQ,
  '&&': Opcode.AND,
  '||': Opcode.OR,
};

export class CodeGenerator {
  private templates: Map<string, CodegenTemplate>;
  private module: ModuleBuilder;
  private labelCounter = 0;
  private lambdaCounter = 0;
  private current!: FunctionBuilder;
  private scopes: Array<Map<string, number>> = [];
  private functions = new Set<string>();
  private pending: Array<{
    name: string;
    params: string[];
    body: AstNode;
    /** Whether this function should capture upvalues (for closures). */
    isClosure?: boolean;
    /** Whether to make the closure self-referential (for letrec). */
    isRecursive?: boolean;
  }> = [];

  constructor(private cfg: CodegenConfig) {
    this.templates = new Map();
    for (const t of cfg.templates) this.templates.set(t.nodeType, t);
    this.module = new ModuleBuilder('main');
  }

  compile(root: AstNode): CompileResult {
    this.collectFunctions(root);
    this.current = this.module.main;
    this.scopes = [new Map()];
    this.emitNode(root);
    this.current.emit(Opcode.HALT);

    while (this.pending.length > 0) {
      const { name, params, body, isRecursive } = this.pending.shift()!;
      const fn = this.module.function(name, params.length);
      fn.locals = params.length;
      this.current = fn;
      this.scopes = [new Map()];
      params.forEach((p, i) => this.scopes[0].set(p, i));
      if (isRecursive) {
        // For recursive lambdas, we don't need to do anything special here;
        // the LetRec handler already set up the global binding.
      }
      this.emitNode(body);
      // The body's result is on the stack; just return it.
      this.current.emit(Opcode.RET);
    }

    // After all functions are compiled, fill in recursive aliases.
    // For each alias, copy the lambda's bytecode into the named function.
    for (const { aliasName, lambdaName } of this._recursiveAliases) {
      const lambdaFn = this.module.functions[lambdaName];
      if (lambdaFn) {
        const aliasFn = this.module.function(aliasName, lambdaFn.arity);
        aliasFn.locals = lambdaFn.locals;
        // Deep-copy the code.
        aliasFn['code'] = new Uint8Array(lambdaFn['code']);
        if (lambdaFn['lineMap']) {
          aliasFn['lineMap'] = { ...lambdaFn['lineMap'] };
        }
      }
    }

    const mod = this.module.build();
    const disasm = [{ name: '__main__', lines: this.disasmFn(mod.main, mod.constants) }];
    for (const [name, fn] of Object.entries(mod.functions)) {
      disasm.push({ name, lines: this.disasmFn(fn, mod.constants) });
    }
    return { module: mod, disasm, errors: [] };
  }

  private disasmFn(fn: any, constants: any[]): string[] {
    return disassembleFunction(fn, constants);
  }

  // -----------------------------------------------------------------------
  // Function collection
  // -----------------------------------------------------------------------

  private collectFunctions(node: AstNode | AstNode[] | undefined): void {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const n of node) this.collectFunctions(n);
      return;
    }
    if (node.type === 'FuncDecl') {
      const name = this.getText(node.fields?.name);
      if (name) {
        this.functions.add(name);
        const paramsNode = node.fields?.params;
        const params: string[] = [];
        if (Array.isArray(paramsNode)) {
          for (const p of paramsNode) {
            params.push(this.getText(p) ?? `arg${params.length}`);
          }
        }
        this.pending.push({ name, params, body: node.fields?.body });
      }
    }
    if (node.fields) {
      for (const v of Object.values(node.fields)) {
        this.collectFunctions(v as any);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Scope helpers
  // -----------------------------------------------------------------------

  private declareLocal(name: string): number {
    const scope = this.scopes[this.scopes.length - 1];
    if (scope.has(name)) return scope.get(name)!;
    const slot = this.current.locals;
    this.current.locals++;
    scope.set(name, slot);
    return slot;
  }

  private resolveLocal(name: string): number | null {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) return this.scopes[i].get(name)!;
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Node emission
  // -----------------------------------------------------------------------

  private emitNode(node: AstNode | undefined): void {
    if (!node) return;
    // Unwrap transparent wrapper nodes.
    if (
      node.type === '__seq__' ||
      node.type === '__list__' ||
      node.type === '__item__'
    ) {
      const items = node.fields?.__items__ ?? node.fields?.__children__;
      if (Array.isArray(items)) {
        for (const it of items) this.emitNode(it);
        return;
      }
      if (node.fields?.item) {
        this.emitNode(node.fields.item);
        return;
      }
      if (node.fields?.__child__) {
        this.emitNode(node.fields.__child__);
        return;
      }
      return;
    }
    if (node.type === 'Token') {
      const tokenType = node.fields?.tokenType;
      const value = node.fields?.value;
      if (tokenType === 'NUMBER' || typeof value === 'number') {
        const idx = this.module.addConstant(value);
        this.current.emit(Opcode.PUSH_INT, idx);
      } else if (tokenType === 'STRING' || typeof value === 'string') {
        const idx = this.module.addConstant(value);
        this.current.emit(Opcode.PUSH_STR, idx);
      } else if (tokenType === 'TRUE') {
        this.current.emit(Opcode.PUSH_BOOL, 1);
      } else if (tokenType === 'FALSE') {
        this.current.emit(Opcode.PUSH_BOOL, 0);
      } else {
        const name = node.fields?.text;
        if (name) this.emitLoadVar(name);
      }
      return;
    }

    // Special handling for Lambda — generate a unique function and emit MAKE_CLOSURE.
    if (node.type === 'Lambda') {
      this.emitLambda(node);
      return;
    }

    // Special handling for LetRec — recursive bindings.
    if (node.type === 'LetRec') {
      this.emitLetRec(node);
      return;
    }

    // Special handling for Case — pattern matching.
    if (node.type === 'Case') {
      this.emitCase(node);
      return;
    }

    // Special handling for App — need to count args for CALL_VALUE.
    if (node.type === 'App') {
      this.emitApp(node);
      return;
    }

    // === OwlLang special handlers ===
    // These check for OwlLang-specific field names to avoid intercepting
    // other languages' nodes with the same type name.
    if (node.type === 'ClassDecl') { this.emitClassDecl(node); return; }
    if (node.type === 'NewExpr') {
      const tpl = this.templates.get('NewExpr');
      if (tpl && tpl.ops.length === 0) { this.emitNewExpr(node); return; }
    }
    if (node.type === 'Postfix') {
      const tpl = this.templates.get('Postfix');
      if (tpl && tpl.ops.length === 0) { this.emitPostfix(node); return; }
    }
    // IfStmt: only intercept if it has 'elifs' field (OwlLang-specific)
    if (node.type === 'IfStmt' && node.fields?.elifs !== undefined) { this.emitIfStmt(node); return; }
    if (node.type === 'WhileStmt' && node.fields?.body !== undefined) {
      // OwlLang WhileStmt has 'body', MiniLang also has 'body'. Check if it's OwlLang
      // by seeing if the template exists. If the config has an IfStmt template, use it.
      // Actually, just check if 'then' field exists (OwlLang uses 'then', MiniLang uses 'then' too).
      // Safer: check if this is OwlLang by looking at the presence of 'elifs'.
      // Since we already checked IfStmt above, WhileStmt is ambiguous. Let's use a different approach:
      // Only intercept if the template is empty (OwlLang's is).
      const tpl = this.templates.get('WhileStmt');
      if (tpl && tpl.ops.length === 0) { this.emitWhileStmt(node); return; }
    }
    if (node.type === 'ForStmt') {
      const tpl = this.templates.get('ForStmt');
      if (tpl && tpl.ops.length === 0) { this.emitForStmt(node); return; }
    }
    // OwlLang AssignExpr with field/index targets needs special handling.
    if (node.type === 'AssignExpr') {
      const target = node.fields?.target as AstNode;
      if (target?.type === 'Postfix' && target.fields?.ops && target.fields.ops.length > 0) {
        this.emitAssignExpr(node);
        return;
      }
    }

    // Special handling for ListExpr (MiniLisp) — inspect the first element
    // to detect special forms (define, lambda, if, let, cond, begin, quote).
    // Otherwise treat the list as a function application or built-in op.
    if (node.type === 'ListExpr') {
      this.emitListExpr(node);
      return;
    }

    // Special handling for Quote (MiniLisp `'expr`) — equivalent to
    // (quote expr): push the literal datum without evaluating it.
    if (node.type === 'Quote') {
      this.emitQuoteNode(node);
      return;
    }

    const tpl = this.templates.get(node.type);
    if (!tpl) {
      if (node.fields?.__child__) {
        this.emitNode(node.fields.__child__);
        return;
      }
      if (node.fields?.__items__) {
        for (const it of node.fields.__items__) this.emitNode(it);
        return;
      }
      throw new CompileError(
        `No codegen template for AST node type: ${node.type}`
      );
    }
    this.emitOps(tpl.ops, node);
  }

  // -----------------------------------------------------------------------
  // Lambda emission — generate a unique function and emit MAKE_CLOSURE
  // -----------------------------------------------------------------------
  private emitLambda(node: AstNode): void {
    const params = (node.fields?.params ?? []) as AstNode[];
    const paramNames = params.map((p) => this.getText(p) ?? `arg${params.length}`);
    const body = node.fields?.body as AstNode;
    const name = `__lambda_${this.lambdaCounter++}`;
    this.functions.add(name);
    this.pending.push({ name, params: paramNames, body, isClosure: true });
    // Emit: MAKE_CLOSURE <name>
    const idx = this.module.addConstant(name);
    this.current.emit(Opcode.MAKE_CLOSURE, idx);
  }

  // -----------------------------------------------------------------------
  // LetRec emission — recursive bindings via global variables
  // -----------------------------------------------------------------------
  private emitLetRec(node: AstNode): void {
    const name = node.fields?.name as string;
    const valueNode = node.fields?.value as AstNode;
    const bodyNode = node.fields?.body as AstNode;

    // Strategy: register `name` as a global variable. Compile the value
    // (which is typically a Lambda). The Lambda's body will reference `name`
    // via LOAD_GLOBAL, which works because we STORE_GLOBAL before calling.
    //
    // For a Lambda value, we compile it as a normal closure (MAKE_CLOSURE),
    // then store it as a global. When the lambda body references `name`,
    // emitLoadVar will find it in neither local nor upvalue scope, so it
    // falls back to LOAD_GLOBAL — which finds the stored closure.

    // Register `name` as a known function so collectFunctions doesn't complain.
    this.functions.add(name);

    // If the value is a Lambda, compile it specially: generate the lambda
    // function, but also make the lambda's body able to reference `name`.
    if (valueNode && valueNode.type === 'Lambda') {
      const params = (valueNode.fields?.params ?? []) as AstNode[];
      const paramNames = params.map((p) => this.getText(p) ?? `arg${params.length}`);
      const lambdaBody = valueNode.fields?.body as AstNode;
      const lambdaFnName = `__lambda_${this.lambdaCounter++}`;
      this.functions.add(lambdaFnName);

      // Push to pending with the name registered as a "recursive alias".
      // We use a special marker so that when compiling the lambda body,
      // references to `name` resolve to LOAD_GLOBAL.
      this.pending.push({
        name: lambdaFnName,
        params: paramNames,
        body: lambdaBody,
        isClosure: true,
        isRecursive: true,
      });

      // Also register `name` -> maps to this lambda, so calls by name work.
      // We do this by creating an alias function.
      // Actually, simpler: just store the closure as a global with key `name`.
      // Then LOAD_GLOBAL(name) will return the closure, and CALL_VALUE works.

      // Emit: MAKE_CLOSURE <lambdaFnName>, then STORE_GLOBAL <name>
      const lambdaIdx = this.module.addConstant(lambdaFnName);
      this.current.emit(Opcode.MAKE_CLOSURE, lambdaIdx);
      const nameIdx = this.module.addConstant(name);
      this.current.emit(Opcode.STORE_GLOBAL, nameIdx);

      // Also create a named function alias so CALL by name works too.
      // We register the lambda under `name` as well.
      this.module.function(name, paramNames.length);
      // Copy the lambda function's code into the named alias.
      // This is done lazily — we'll fill it in after the lambda is compiled.
      // For now, just mark it as pending.
      this._recursiveAliases.push({ aliasName: name, lambdaName: lambdaFnName });
    } else {
      // Non-lambda value: just eval and store as global.
      this.emitNode(valueNode);
      const nameIdx = this.module.addConstant(name);
      this.current.emit(Opcode.STORE_GLOBAL, nameIdx);
    }

    // Eval body
    this.emitNode(bodyNode);
  }

  /** Track recursive aliases to fill in after lambda compilation. */
  private _recursiveAliases: Array<{ aliasName: string; lambdaName: string }> = [];

  // -----------------------------------------------------------------------
  // Application emission
  // -----------------------------------------------------------------------
  private emitApp(node: AstNode): void {
    const funcNode = node.fields?.func as AstNode;
    const args = (node.fields?.args ?? []) as AstNode[];
    // If no args, just eval the function value (it's a plain variable reference).
    if (args.length === 0) {
      this.emitNode(funcNode);
      return;
    }
    // Check for built-in print function.
    if (
      funcNode.type === 'Var' &&
      (funcNode.fields?.name === 'print' || funcNode.fields?.name === 'println')
    ) {
      // Eval the arg, DUP it, PRINT one copy, leave the other on stack.
      this.emitNode(args[0]);
      this.current.emit(Opcode.DUP);
      this.current.emit(Opcode.PRINT);
      return;
    }
    // VM convention: caller pushes [arg0, ..., argN-1, closure] then CALL_VALUE argc.
    // So push args first, then the function value.
    for (const a of args) this.emitNode(a);
    this.emitNode(funcNode);
    // CALL_VALUE argc
    this.current.emit(Opcode.CALL_VALUE, args.length);
  }

  // -----------------------------------------------------------------------
  // OwlLang: Class declaration
  // -----------------------------------------------------------------------
  private classCounter = 0;
  private emitClassDecl(node: AstNode): void {
    const className = node.fields?.name as string;
    const parent = node.fields?.parent;
    const members = (node.fields?.members ?? []) as AstNode[];

    // Collect fields and methods
    const fields: string[] = [];
    const methods: Array<{ name: string; params: string[]; body: AstNode }> = [];
    for (const m of members) {
      if (m.type === 'FieldDecl') {
        fields.push(m.fields?.name as string);
      } else if (m.type === 'MethodDecl') {
        const mname = m.fields?.name as string;
        const rawParams = (m.fields?.params ?? []) as any[];
        let paramArray: any[] = [];
        if (rawParams.length === 1 && rawParams[0]?.type === '__list__') {
          paramArray = rawParams[0].fields?.items ?? rawParams[0].fields?.__items__ ?? [];
        } else {
          paramArray = rawParams;
        }
        const params: string[] = [];
        for (const p of paramArray) {
          if (typeof p === 'string') params.push(p);
          else if (p?.type === '__item__') params.push(p.fields?.item as string);
          else if (p?.fields?.text) params.push(p.fields.text as string);
        }
        methods.push({ name: mname, params, body: m.fields?.body as AstNode });
      }
    }

    // Compile each method as a standalone function: __method_<ClassName>_<methodName>
    for (const method of methods) {
      const methodFnName = `__method_${className}_${method.name}`;
      this.functions.add(methodFnName);
      const methodBuilder = this.module.function(methodFnName, method.params.length + 1);
      methodBuilder.locals = method.params.length + 1;
      const mSavedCurrent = this.current;
      const mSavedScopes = this.scopes;
      this.current = methodBuilder;
      this.scopes = [new Map()];
      method.params.forEach((p, i) => this.scopes[0].set(p, i));
      this.scopes[0].set('this', method.params.length);

      this.emitNode(method.body);
      this.current.emit(Opcode.PUSH_NULL);
      this.current.emit(Opcode.RET);

      this.current = mSavedCurrent;
      this.scopes = mSavedScopes;
    }

    // Generate constructor: __class_<ClassName>(args...)
    // Creates a record, stores all methods as closures, calls init.
    const ctorName = `__class_${className}`;
    this.functions.add(ctorName);
    const initMethod = methods.find((m) => m.name === 'init');
    const ctorArity = initMethod ? initMethod.params.length : 0;

    const ctorBuilder = this.module.function(ctorName, ctorArity);
    ctorBuilder.locals = ctorArity;
    const savedCurrent = this.current;
    const savedScopes = this.scopes;
    this.current = ctorBuilder;
    this.scopes = [new Map()];

    const thisSlot = ctorBuilder.locals++;
    this.scopes[0].set('this', thisSlot);

    // Create empty record
    this.current.emit(Opcode.NEW_MAP);
    this.current.emit(Opcode.STORE_LOCAL, thisSlot);

    // Store all methods as closures in the record.
    // Each method is stored with key = method name, value = closure.
    for (const method of methods) {
      const methodFnName = `__method_${className}_${method.name}`;
      // Push 'this' (the record)
      this.current.emit(Opcode.LOAD_LOCAL, thisSlot);
      // Push method name
      const nameIdx = this.module.addConstant(method.name);
      this.current.emit(Opcode.PUSH_STR, nameIdx);
      // Push closure (MAKE_CLOSURE for the method function)
      const fnIdx = this.module.addConstant(methodFnName);
      this.current.emit(Opcode.MAKE_CLOSURE, fnIdx);
      // SET_FIELD: pops val, field, target
      this.current.emit(Opcode.SET_FIELD);
      // SET_FIELD pushes the updated record, but we already have 'this' in local.
      // Pop the returned record (it's the same object, mutated in place).
      this.current.emit(Opcode.POP);
    }

    // Call init if present
    if (initMethod) {
      // The init method is stored as a closure in this.init.
      // We call it by: LOAD this, LOAD "init" field, push args, CALL_VALUE.
      // But init is stored as a closure, so we use CALL_VALUE.
      // Stack: [this, args..., closure]
      // But CALL_VALUE expects [args..., closure].
      // We need to get this.init, then call it with args + this.

      // Actually, the method closure doesn't have 'this' bound.
      // We pass 'this' as the last arg (slot N).
      // So: push args, push this, push closure (from this.init), CALL_VALUE (argc+1)

      // Push args
      for (let i = 0; i < ctorArity; i++) {
        this.current.emit(Opcode.LOAD_LOCAL, i);
      }
      // Push 'this' (as the last arg)
      this.current.emit(Opcode.LOAD_LOCAL, thisSlot);
      // Push closure = this.init
      this.current.emit(Opcode.LOAD_LOCAL, thisSlot);
      const initNameIdx = this.module.addConstant('init');
      this.current.emit(Opcode.PUSH_STR, initNameIdx);
      this.current.emit(Opcode.GET_FIELD);
      // CALL_VALUE with argc = ctorArity + 1 (args + this)
      this.current.emit(Opcode.CALL_VALUE, ctorArity + 1);
      // Pop return value
      this.current.emit(Opcode.POP);
    }

    // Return 'this'
    this.current.emit(Opcode.LOAD_LOCAL, thisSlot);
    this.current.emit(Opcode.RET);

    this.current = savedCurrent;
    this.scopes = savedScopes;

    // At the class declaration site, store the constructor name as a global.
    const classNameConstIdx = this.module.addConstant(ctorName);
    this.current.emit(Opcode.PUSH_STR, classNameConstIdx);
    const globalIdx = this.module.addConstant(`__class_${className}`);
    this.current.emit(Opcode.STORE_GLOBAL, globalIdx);
  }

  // -----------------------------------------------------------------------
  // OwlLang: New expression — new ClassName(args)
  // -----------------------------------------------------------------------
  private emitNewExpr(node: AstNode): void {
    const className = node.fields?.className as string;
    const args = (node.fields?.args ?? []) as AstNode[];

    // Push args
    for (const a of args) this.emitNode(a);
    // Push constructor name
    const ctorName = `__class_${className}`;
    const nameIdx = this.module.addConstant(ctorName);
    this.current.emit(Opcode.PUSH_STR, nameIdx);
    // CALL with argc
    this.current.emit(Opcode.CALL, args.length);
  }

  // -----------------------------------------------------------------------
  // OwlLang: Postfix — method calls and field access
  // -----------------------------------------------------------------------
  private emitPostfix(node: AstNode): void {
    const base = node.fields?.base as AstNode;
    const ops = (node.fields?.ops ?? []) as AstNode[];

    // Emit base
    this.emitNode(base);

    // Apply each postfix op
    for (const op of ops) {
      if (op.type === 'MethodCall') {
        const methodName = op.fields?.name as string;
        const args = (op.fields?.args ?? []) as AstNode[];
        // Stack: [obj]
        // Store obj in temp local
        const tempSlot = this.current.locals++;
        this.current.emit(Opcode.STORE_LOCAL, tempSlot);
        // Push args
        for (const a of args) this.emitNode(a);
        // Push obj (as 'this' arg — last param)
        this.current.emit(Opcode.LOAD_LOCAL, tempSlot);
        // Push closure = obj.methodName (GET_FIELD)
        this.current.emit(Opcode.LOAD_LOCAL, tempSlot);
        const nameIdx = this.module.addConstant(methodName);
        this.current.emit(Opcode.PUSH_STR, nameIdx);
        this.current.emit(Opcode.GET_FIELD);
        // CALL_VALUE with argc = args.length + 1 (args + this)
        this.current.emit(Opcode.CALL_VALUE, args.length + 1);
      } else if (op.type === 'FieldAccess') {
        const fieldName = op.fields?.name as string;
        // Stack: [obj]
        // Push field name, then GET_FIELD
        const nameIdx = this.module.addConstant(fieldName);
        this.current.emit(Opcode.PUSH_STR, nameIdx);
        this.current.emit(Opcode.GET_FIELD);
      } else if (op.type === 'IndexAccess') {
        // Stack: [obj]
        // Emit index, then GET_INDEX
        const index = op.fields?.index as AstNode;
        this.emitNode(index);
        this.current.emit(Opcode.GET_INDEX);
      }
    }
  }

  // -----------------------------------------------------------------------
  // OwlLang: If statement with elif/else
  // -----------------------------------------------------------------------
  private emitIfStmt(node: AstNode): void {
    const cond = node.fields?.cond as AstNode;
    const then = node.fields?.then as AstNode;
    const elifs = (node.fields?.elifs ?? []) as AstNode[];
    const elseClause = node.fields?.else as AstNode | null;

    const endLabel = this.newLabel();

    // if (cond) { then }
    const elseLabel = this.newLabel();
    this.emitNode(cond);
    this.current.emit(Opcode.JMP_IF_FALSE, this.resolveLabel(elseLabel));
    this.emitNode(then);
    this.current.emit(Opcode.POP); // then block leaves a value
    this.current.emit(Opcode.JMP, this.resolveLabel(endLabel));

    this.emitLabel(elseLabel);

    // elif clauses
    for (const elif of elifs) {
      const elifCond = elif.fields?.cond as AstNode;
      const elifBody = elif.fields?.body as AstNode;
      const nextLabel = this.newLabel();
      this.emitNode(elifCond);
      this.current.emit(Opcode.JMP_IF_FALSE, this.resolveLabel(nextLabel));
      this.emitNode(elifBody);
      this.current.emit(Opcode.POP);
      this.current.emit(Opcode.JMP, this.resolveLabel(endLabel));
      this.emitLabel(nextLabel);
    }

    // else clause
    if (elseClause) {
      this.emitNode(elseClause.fields?.body as AstNode);
      this.current.emit(Opcode.POP);
    }

    this.emitLabel(endLabel);
    // Push null as the if statement's value
    this.current.emit(Opcode.PUSH_NULL);
  }

  // -----------------------------------------------------------------------
  // OwlLang: While statement
  // -----------------------------------------------------------------------
  private emitWhileStmt(node: AstNode): void {
    const cond = node.fields?.cond as AstNode;
    const body = node.fields?.body as AstNode;

    const startLabel = this.newLabel();
    const endLabel = this.newLabel();

    this.emitLabel(startLabel);
    this.emitNode(cond);
    this.current.emit(Opcode.JMP_IF_FALSE, this.resolveLabel(endLabel));
    this.emitNode(body);
    this.current.emit(Opcode.POP); // body leaves a value
    this.current.emit(Opcode.JMP, this.resolveLabel(startLabel));
    this.emitLabel(endLabel);

    this.current.emit(Opcode.PUSH_NULL);
  }

  // -----------------------------------------------------------------------
  // OwlLang: For-in statement (iterate over list)
  // -----------------------------------------------------------------------
  private emitForStmt(node: AstNode): void {
    const varName = node.fields?.var as string;
    const iterable = node.fields?.iterable as AstNode;
    const body = node.fields?.body as AstNode;

    // Evaluate iterable, store in temp local
    this.emitNode(iterable);
    const listSlot = this.current.locals++;
    this.current.emit(Opcode.STORE_LOCAL, listSlot);

    // Declare loop variable
    this.declareLocal(varName);
    const varSlot = this.resolveLocal(varName)!;

    // Index variable
    const idxSlot = this.current.locals++;
    this.current.emit(Opcode.PUSH_INT, this.module.addConstant(0));
    this.current.emit(Opcode.STORE_LOCAL, idxSlot);

    const startLabel = this.newLabel();
    const endLabel = this.newLabel();

    this.emitLabel(startLabel);
    // Check: idx < len(list)
    this.current.emit(Opcode.LOAD_LOCAL, idxSlot);
    this.current.emit(Opcode.LOAD_LOCAL, listSlot);
    this.current.emit(Opcode.LEN);
    this.current.emit(Opcode.LT);
    this.current.emit(Opcode.JMP_IF_FALSE, this.resolveLabel(endLabel));

    // var = list[idx]
    this.current.emit(Opcode.LOAD_LOCAL, listSlot);
    this.current.emit(Opcode.LOAD_LOCAL, idxSlot);
    this.current.emit(Opcode.GET_INDEX);
    this.current.emit(Opcode.STORE_LOCAL, varSlot);

    // Body
    this.emitNode(body);
    this.current.emit(Opcode.POP);

    // idx++
    this.current.emit(Opcode.LOAD_LOCAL, idxSlot);
    this.current.emit(Opcode.INC);
    this.current.emit(Opcode.STORE_LOCAL, idxSlot);

    this.current.emit(Opcode.JMP, this.resolveLabel(startLabel));
    this.emitLabel(endLabel);

    this.current.emit(Opcode.PUSH_NULL);
  }

  // -----------------------------------------------------------------------
  // OwlLang: AssignExpr — handles both simple vars and field/index assignment
  // -----------------------------------------------------------------------
  private emitAssignExpr(node: AstNode): void {
    const target = node.fields?.target as AstNode;
    const value = node.fields?.value as AstNode;

    // If target is a Postfix with a single FieldAccess op, emit SET_FIELD.
    // If target is a Postfix with a single IndexAccess op, emit SET_INDEX.
    if (target.type === 'Postfix') {
      const base = target.fields?.base as AstNode;
      const ops = (target.fields?.ops ?? []) as AstNode[];
      if (ops.length === 1) {
        const op = ops[0];
        if (op.type === 'FieldAccess') {
          const fieldName = op.fields?.name as string;
          // Emit value first, store in temp local.
          this.emitNode(value);
          const valSlot = this.current.locals++;
          this.current.emit(Opcode.STORE_LOCAL, valSlot);
          // Now emit: base, field_name, value, SET_FIELD
          this.emitNode(base);       // [obj]
          const nameIdx = this.module.addConstant(fieldName);
          this.current.emit(Opcode.PUSH_STR, nameIdx);  // [obj, name]
          this.current.emit(Opcode.LOAD_LOCAL, valSlot);  // [obj, name, value]
          this.current.emit(Opcode.SET_FIELD);  // [updated_obj]
          this.current.emit(Opcode.POP);  // []  — the statement value
          // Push the value back as the expression result
          this.current.emit(Opcode.LOAD_LOCAL, valSlot);
          return;
        }
        if (op.type === 'IndexAccess') {
          const index = op.fields?.index as AstNode;
          // Emit value first, store in temp.
          this.emitNode(value);
          const valSlot = this.current.locals++;
          this.current.emit(Opcode.STORE_LOCAL, valSlot);
          // Emit: base, index, value, SET_INDEX
          this.emitNode(base);   // [obj]
          this.emitNode(index);  // [obj, idx]
          this.current.emit(Opcode.LOAD_LOCAL, valSlot);  // [obj, idx, val]
          this.current.emit(Opcode.SET_INDEX);  // [updated_obj]
          this.current.emit(Opcode.POP);
          this.current.emit(Opcode.LOAD_LOCAL, valSlot);
          return;
        }
      }
    }

    // Simple variable assignment: var = value
    // If target is a Postfix with no ops, it's a bare variable.
    let varName = '';
    if (target.type === 'Postfix') {
      const base = target.fields?.base as AstNode;
      if (base.type === 'VarRef') {
        varName = base.fields?.name as string;
      }
    } else if (target.type === 'VarRef') {
      varName = target.fields?.name as string;
    } else {
      varName = this.getText(target) ?? '';
    }
    this.emitNode(value);
    this.current.emit(Opcode.DUP);
    this.emitStoreVar(varName);
  }
  private emitCase(node: AstNode): void {
    const scrutinee = node.fields?.scrutinee as AstNode;
    const branches = (node.fields?.branches ?? []) as AstNode[];

    // Eval scrutinee, leave on stack.
    this.emitNode(scrutinee);

    // For each branch, generate: DUP, check pattern, if match -> pop scrutinee, bind, eval body, JMP end.
    // Patterns supported:
    //   pat='nil'  -> LIST_IS_EMPTY
    //   pat='cons' -> not empty, then HEAD -> bind head, TAIL -> bind tail
    //   pat='var'  -> always match, bind name to scrutinee
    const endLabel = this.newLabel();
    let hasCatchAll = false;

    for (const branch of branches) {
      const pat = branch.fields?.pat;
      const nextLabel = this.newLabel();
      // DUP scrutinee so we can keep it for next branch if no match.
      this.current.emit(Opcode.DUP);

      if (pat === 'nil') {
        // Check if list is empty.
        this.current.emit(Opcode.LIST_IS_EMPTY);
        this.current.emit(Opcode.JMP_IF_FALSE, this.resolveLabel(nextLabel));
        // Matched. Pop the dup (we don't need the value for nil pattern).
        this.current.emit(Opcode.POP);
        // Eval body.
        this.emitNode(branch.fields?.body as AstNode);
        this.current.emit(Opcode.JMP, this.resolveLabel(endLabel));
      } else if (pat === 'cons') {
        // Check if list is non-empty.
        this.current.emit(Opcode.LIST_IS_EMPTY);
        this.current.emit(Opcode.JMP_IF_TRUE, this.resolveLabel(nextLabel));
        // Matched. The stack has the scrutinee list (the DUP'd copy).
        this.current.emit(Opcode.DUP); // [list, list]
        this.current.emit(Opcode.LIST_HEAD); // [list, head]
        // Bind head.
        const headName = branch.fields?.head as string;
        this.declareLocal(headName);
        this.emitStoreVar(headName); // [list]
        // Now get tail.
        this.current.emit(Opcode.LIST_TAIL); // [tail]
        const tailName = branch.fields?.tail as string;
        this.declareLocal(tailName);
        this.emitStoreVar(tailName); // []
        // Eval body.
        this.emitNode(branch.fields?.body as AstNode);
        this.current.emit(Opcode.JMP, this.resolveLabel(endLabel));
      } else if (pat === 'var') {
        // Always match. Bind name to scrutinee.
        const varName = branch.fields?.name as string;
        this.declareLocal(varName);
        this.emitStoreVar(varName);
        this.emitNode(branch.fields?.body as AstNode);
        this.current.emit(Opcode.JMP, this.resolveLabel(endLabel));
        hasCatchAll = true;
      }
      this.emitLabel(nextLabel);
    }

    // If no catch-all, pop the leftover scrutinee and push null.
    if (!hasCatchAll) {
      this.current.emit(Opcode.POP);
      this.current.emit(Opcode.PUSH_NULL);
    }
    this.emitLabel(endLabel);
  }

  // -----------------------------------------------------------------------
  // MiniLisp ListExpr emission — dispatch on the first element to detect
  // special forms (define, lambda, if, let, cond, begin, quote). Anything
  // else is treated as a function application or built-in op.
  // -----------------------------------------------------------------------

  private static readonly LISP_SPECIAL_FORMS = new Set([
    'define',
    'lambda',
    'if',
    'let',
    'cond',
    'begin',
    'quote',
  ]);

  /** Map of binary built-in operators to their QVM opcodes. */
  private static readonly LISP_BINOPS: Record<string, Opcode> = {
    '+': Opcode.ADD,
    '-': Opcode.SUB,
    '*': Opcode.MUL,
    '/': Opcode.DIV,
    '=': Opcode.EQ,
    '<': Opcode.LT,
    '>': Opcode.GT,
    '<=': Opcode.LTE,
    '>=': Opcode.GTE,
    and: Opcode.AND,
    or: Opcode.OR,
    cons: Opcode.LIST_CONS,
  };

  /** Map of unary built-in operators to their QVM opcodes. */
  private static readonly LISP_UNOPS: Record<string, Opcode> = {
    not: Opcode.NOT,
    car: Opcode.LIST_HEAD,
    cdr: Opcode.LIST_TAIL,
    'null?': Opcode.LIST_IS_EMPTY,
  };

  /** Extract the textual name of a Symbol/Token node, if any. */
  private getSymbolName(node: AstNode | undefined): string | undefined {
    if (!node) return undefined;
    if (node.type === 'Symbol') return node.fields?.name;
    if (node.type === 'Token') return node.fields?.text;
    return undefined;
  }

  private emitListExpr(node: AstNode): void {
    const items = (node.fields?.items ?? []) as AstNode[];
    if (items.length === 0) {
      // () is the empty list / nil.
      this.current.emit(Opcode.NEW_LIST, 0);
      return;
    }

    const first = items[0];
    const firstName = this.getSymbolName(first);

    if (
      firstName &&
      CodeGenerator.LISP_SPECIAL_FORMS.has(firstName)
    ) {
      switch (firstName) {
        case 'define':
          this.emitLispDefine(items);
          return;
        case 'lambda':
          this.emitLispLambda(items);
          return;
        case 'if':
          this.emitLispIf(items);
          return;
        case 'let':
          this.emitLispLet(items);
          return;
        case 'cond':
          this.emitLispCond(items);
          return;
        case 'begin':
          this.emitLispBegin(items);
          return;
        case 'quote':
          this.emitLispQuote(items.slice(1));
          return;
      }
    }

    this.emitLispApplication(items);
  }

  /** Quote node from `'expr` — equivalent to (quote expr). */
  private emitQuoteNode(node: AstNode): void {
    const expr = node.fields?.expr as AstNode;
    this.emitLispQuote([expr]);
  }

  /**
   * Push a literal datum onto the stack without evaluating it.
   * Used by (quote datum) and `'datum`.
   */
  private emitLispQuote(items: AstNode[]): void {
    if (items.length === 0) {
      this.current.emit(Opcode.NEW_LIST, 0);
      return;
    }
    if (items.length === 1) {
      this.emitQuotedDatum(items[0]);
      return;
    }
    // (quote a b c) — non-standard, but build a list of the quoted items.
    for (const it of items) this.emitQuotedDatum(it);
    this.current.emit(Opcode.NEW_LIST, items.length);
  }

  private emitQuotedDatum(node: AstNode | undefined): void {
    if (!node) {
      this.current.emit(Opcode.NEW_LIST, 0);
      return;
    }
    switch (node.type) {
      case 'NumberLit': {
        const idx = this.module.addConstant(node.fields?.value);
        this.current.emit(Opcode.PUSH_INT, idx);
        return;
      }
      case 'StringLit': {
        const idx = this.module.addConstant(node.fields?.value);
        this.current.emit(Opcode.PUSH_STR, idx);
        return;
      }
      case 'BoolLit':
        this.current.emit(
          Opcode.PUSH_BOOL,
          node.fields?.value === 'true' ? 1 : 0
        );
        return;
      case 'NilLit':
        this.current.emit(Opcode.NEW_LIST, 0);
        return;
      case 'Symbol': {
        const idx = this.module.addConstant(node.fields?.name);
        this.current.emit(Opcode.PUSH_STR, idx);
        return;
      }
      case 'ListExpr': {
        const subItems = (node.fields?.items ?? []) as AstNode[];
        for (const it of subItems) this.emitQuotedDatum(it);
        this.current.emit(Opcode.NEW_LIST, subItems.length);
        return;
      }
      case 'Quote': {
        // Nested quote — push as a list (quote <datum>).
        const inner = node.fields?.expr as AstNode;
        // Push the symbol "quote".
        const symIdx = this.module.addConstant('quote');
        this.current.emit(Opcode.PUSH_STR, symIdx);
        this.emitQuotedDatum(inner);
        this.current.emit(Opcode.NEW_LIST, 2);
        return;
      }
      case 'Token': {
        // Fallback for raw token nodes.
        const tokenType = node.fields?.tokenType;
        const value = node.fields?.value;
        if (tokenType === 'NUMBER' || typeof value === 'number') {
          const idx = this.module.addConstant(value);
          this.current.emit(Opcode.PUSH_INT, idx);
        } else if (tokenType === 'STRING' || typeof value === 'string') {
          const idx = this.module.addConstant(value);
          this.current.emit(Opcode.PUSH_STR, idx);
        } else {
          const idx = this.module.addConstant(node.fields?.text);
          this.current.emit(Opcode.PUSH_STR, idx);
        }
        return;
      }
      default: {
        // Unknown — push null.
        this.current.emit(Opcode.PUSH_NULL);
        return;
      }
    }
  }

  // --- Special form: define -------------------------------------------
  //
  //   (define name value)            ; bind `name` to evaluated value
  //   (define (f a b) body...)       ; sugar for (define f (lambda (a b) body...))

  private emitLispDefine(items: AstNode[]): void {
    const target = items[1];
    if (!target) throw new CompileError('define: missing name');

    // Function-shorthand: (define (name params...) body...)
    if (target.type === 'ListExpr') {
      const sigItems = (target.fields?.items ?? []) as AstNode[];
      const funcName = this.getSymbolName(sigItems[0]);
      if (!funcName) throw new CompileError('define: missing function name');
      const paramNodes = sigItems.slice(1);
      const paramNames = paramNodes.map(
        (p, i) => this.getSymbolName(p) ?? `arg${i}`
      );
      const bodyExprs = items.slice(2);
      const body = this.makeBeginWrap(bodyExprs);
      this.functions.add(funcName);
      this.pending.push({
        name: funcName,
        params: paramNames,
        body,
        isClosure: true,
      });
      const idx = this.module.addConstant(funcName);
      this.current.emit(Opcode.MAKE_CLOSURE, idx);
      this.emitStoreVar(funcName);
      return;
    }

    // Simple form: (define name value)
    const name = this.getSymbolName(target);
    if (!name) throw new CompileError('define: missing name');
    const valueNode = items[2];
    if (!valueNode) throw new CompileError('define: missing value');
    this.emitNode(valueNode);
    this.emitStoreVar(name);
  }

  // --- Special form: lambda -------------------------------------------
  //
  //   (lambda (params...) body...)   ; create a closure

  private emitLispLambda(items: AstNode[]): void {
    const paramsList = items[1];
    if (!paramsList) throw new CompileError('lambda: missing parameter list');
    const paramNodes = (paramsList.fields?.items ?? []) as AstNode[];
    const paramNames = paramNodes.map(
      (p, i) => this.getSymbolName(p) ?? `arg${i}`
    );
    const bodyExprs = items.slice(2);
    const body = this.makeBeginWrap(bodyExprs);
    const name = `__lambda_${this.lambdaCounter++}`;
    this.functions.add(name);
    this.pending.push({ name, params: paramNames, body, isClosure: true });
    const idx = this.module.addConstant(name);
    this.current.emit(Opcode.MAKE_CLOSURE, idx);
  }

  /** Wrap a list of body expressions as a single node (begin if multiple). */
  private makeBeginWrap(exprs: AstNode[]): AstNode {
    if (exprs.length === 0) {
      return { type: 'NilLit' };
    }
    if (exprs.length === 1) {
      return exprs[0];
    }
    return {
      type: 'ListExpr',
      fields: {
        items: [
          { type: 'Symbol', fields: { name: 'begin' } },
          ...exprs,
        ],
      },
    };
  }

  // --- Special form: if -----------------------------------------------
  //
  //   (if cond then else?)   — JMP_IF_FALSE pattern.

  private emitLispIf(items: AstNode[]): void {
    const cond = items[1];
    const thenExpr = items[2];
    const elseExpr = items[3];
    if (!cond || !thenExpr) {
      throw new CompileError('if: requires (if cond then else?)');
    }
    const elseLabel = this.newLabel();
    const endLabel = this.newLabel();
    this.emitNode(cond);
    this.current.emit(Opcode.JMP_IF_FALSE, this.resolveLabel(elseLabel));
    this.emitNode(thenExpr);
    this.current.emit(Opcode.JMP, this.resolveLabel(endLabel));
    this.emitLabel(elseLabel);
    if (elseExpr) {
      this.emitNode(elseExpr);
    } else {
      this.current.emit(Opcode.NEW_LIST, 0);
    }
    this.emitLabel(endLabel);
  }

  // --- Special form: let ----------------------------------------------
  //
  //   (let ((name val) ...) body...)  — sequential binding in a new scope.

  private emitLispLet(items: AstNode[]): void {
    const bindingsList = items[1];
    const bodyExprs = items.slice(2);
    if (!bindingsList) {
      throw new CompileError('let: missing binding list');
    }
    const bindings = (bindingsList.fields?.items ?? []) as AstNode[];
    this.scopes.push(new Map());
    for (const binding of bindings) {
      const bindingItems = (binding.fields?.items ?? []) as AstNode[];
      const name = this.getSymbolName(bindingItems[0]);
      const value = bindingItems[1];
      if (!name) throw new CompileError('let: missing binding name');
      if (!value) throw new CompileError(`let: missing value for ${name}`);
      this.emitNode(value);
      this.declareLocal(name);
      this.emitStoreVar(name);
    }
    // Body is an implicit begin.
    if (bodyExprs.length === 0) {
      this.current.emit(Opcode.NEW_LIST, 0);
    } else {
      for (let i = 0; i < bodyExprs.length; i++) {
        this.emitNode(bodyExprs[i]);
        if (i < bodyExprs.length - 1) this.current.emit(Opcode.POP);
      }
    }
    this.scopes.pop();
  }

  // --- Special form: cond ---------------------------------------------
  //
  //   (cond (test expr)... [(else expr)])  — chain of if-else.

  private emitLispCond(items: AstNode[]): void {
    const clauses = items.slice(1);
    const endLabel = this.newLabel();
    let hasElse = false;
    for (const clause of clauses) {
      const clauseItems = (clause.fields?.items ?? []) as AstNode[];
      const test = clauseItems[0];
      const body = clauseItems[1];
      const testName = this.getSymbolName(test);
      if (testName === 'else') {
        if (body) this.emitNode(body);
        else this.current.emit(Opcode.NEW_LIST, 0);
        this.current.emit(Opcode.JMP, this.resolveLabel(endLabel));
        hasElse = true;
        break;
      }
      const nextLabel = this.newLabel();
      this.emitNode(test);
      this.current.emit(Opcode.JMP_IF_FALSE, this.resolveLabel(nextLabel));
      if (body) this.emitNode(body);
      else this.current.emit(Opcode.NEW_LIST, 0);
      this.current.emit(Opcode.JMP, this.resolveLabel(endLabel));
      this.emitLabel(nextLabel);
    }
    if (!hasElse) {
      this.current.emit(Opcode.NEW_LIST, 0);
    }
    this.emitLabel(endLabel);
  }

  // --- Special form: begin --------------------------------------------
  //
  //   (begin e1 e2 ... eN)  — eval all, return last.

  private emitLispBegin(items: AstNode[]): void {
    const exprs = items.slice(1);
    if (exprs.length === 0) {
      this.current.emit(Opcode.NEW_LIST, 0);
      return;
    }
    for (let i = 0; i < exprs.length; i++) {
      this.emitNode(exprs[i]);
      if (i < exprs.length - 1) this.current.emit(Opcode.POP);
    }
  }

  // --- Function application / built-in ops ----------------------------

  private emitLispApplication(items: AstNode[]): void {
    const funcNode = items[0];
    const args = items.slice(1);
    const funcName = this.getSymbolName(funcNode);

    // Unary minus: (- x)
    if (funcName === '-' && args.length === 1) {
      this.emitNode(args[0]);
      this.current.emit(Opcode.NEG);
      return;
    }

    // `and` / `or` — short-circuit with proper Lisp semantics:
    //   (and a b c) → if any is false, return false; else return last value.
    //   (or  a b c) → return first truthy value; else return last value.
    if (funcName === 'and' || funcName === 'or') {
      this.emitLispShortCircuit(funcName, args);
      return;
    }

    // Variadic folding operators: + *
    if (funcName === '+' || funcName === '*') {
      const op = funcName === '+' ? Opcode.ADD : Opcode.MUL;
      if (args.length === 0) {
        const ident = funcName === '+' ? 0 : 1;
        const idx = this.module.addConstant(ident);
        this.current.emit(Opcode.PUSH_INT, idx);
        return;
      }
      this.emitNode(args[0]);
      for (let i = 1; i < args.length; i++) {
        this.emitNode(args[i]);
        this.current.emit(op);
      }
      return;
    }

    // Binary operators: - / = < > <= >= cons
    if (funcName && CodeGenerator.LISP_BINOPS[funcName]) {
      const op = CodeGenerator.LISP_BINOPS[funcName];
      if (args.length < 2) {
        throw new CompileError(
          `${funcName}: requires at least 2 args, got ${args.length}`
        );
      }
      this.emitNode(args[0]);
      for (let i = 1; i < args.length; i++) {
        this.emitNode(args[i]);
        this.current.emit(op);
      }
      return;
    }

    // Unary operators: not car cdr null?
    if (funcName && CodeGenerator.LISP_UNOPS[funcName]) {
      const op = CodeGenerator.LISP_UNOPS[funcName];
      if (args.length !== 1) {
        throw new CompileError(
          `${funcName}: requires 1 arg, got ${args.length}`
        );
      }
      this.emitNode(args[0]);
      this.current.emit(op);
      return;
    }

    // list: variadic — push args, then NEW_LIST argc.
    if (funcName === 'list') {
      for (const arg of args) this.emitNode(arg);
      this.current.emit(Opcode.NEW_LIST, args.length);
      return;
    }

    // print / display — eval arg, DUP, PRINT (consumes one copy, leaves the
    // other on the stack so the print expression still yields a value).
    if (funcName === 'print' || funcName === 'display') {
      if (args.length !== 1) {
        throw new CompileError(
          `${funcName}: requires 1 arg, got ${args.length}`
        );
      }
      this.emitNode(args[0]);
      this.current.emit(Opcode.DUP);
      this.current.emit(
        funcName === 'print' ? Opcode.PRINT : Opcode.PRINT_RAW
      );
      return;
    }

    // User-defined function application:
    // Push args, push function value (as a closure), CALL_VALUE argc.
    for (const arg of args) this.emitNode(arg);
    this.emitNode(funcNode);
    this.current.emit(Opcode.CALL_VALUE, args.length);
  }

  /**
   * Short-circuit `and` / `or` with proper Lisp return semantics:
   *   (and a b c) → return false on first false, else last value.
   *   (or  a b c) → return first truthy value, else last value.
   *
   * Note: this also short-circuits evaluation — later args are not evaluated
   * once the result is determined.
   */
  private emitLispShortCircuit(
    kind: 'and' | 'or',
    args: AstNode[]
  ): void {
    if (args.length === 0) {
      // (and) → #t, (or) → #f
      this.current.emit(Opcode.PUSH_BOOL, kind === 'and' ? 1 : 0);
      return;
    }
    if (args.length === 1) {
      this.emitNode(args[0]);
      return;
    }
    const endLabel = this.newLabel();
    for (let i = 0; i < args.length - 1; i++) {
      this.emitNode(args[i]);
      // DUP so we can test without consuming the value.
      this.current.emit(Opcode.DUP);
      if (kind === 'and') {
        // If false, jump to end (leaving the false on the stack).
        this.current.emit(Opcode.JMP_IF_FALSE, this.resolveLabel(endLabel));
      } else {
        // If true, jump to end (leaving the truthy value on the stack).
        this.current.emit(Opcode.JMP_IF_TRUE, this.resolveLabel(endLabel));
      }
      // Pop the dup (we're continuing to the next argument).
      this.current.emit(Opcode.POP);
    }
    // Last argument: just evaluate and leave on the stack.
    this.emitNode(args[args.length - 1]);
    this.emitLabel(endLabel);
  }

  private getText(v: any): string | undefined {
    if (v == null) return undefined;
    if (typeof v === 'string') return v;
    if (typeof v === 'object') {
      if (v.fields?.text) return v.fields.text;
      if (v.fields?.value !== undefined) return String(v.fields.value);
      if (v.type === 'Token') return v.fields?.text;
    }
    return undefined;
  }

  private emitOps(ops: TemplateOp[], node: AstNode): void {
    for (const op of ops) this.emitOp(op, node);
  }

  private emitOp(op: TemplateOp, node: AstNode): void {
    if (typeof op === 'string') {
      this.emitStringOp(op, node);
      return;
    }
    if (op.while) {
      const startLabel = this.newLabel();
      const endLabel = this.newLabel();
      this.emitLabel(startLabel);
      this.emitOps(op.while.cond, node);
      this.current.emit(Opcode.JMP_IF_FALSE, this.resolveLabel(endLabel));
      this.emitOps(op.while.body, node);
      this.current.emit(Opcode.JMP, this.resolveLabel(startLabel));
      this.emitLabel(endLabel);
      return;
    }
    if (op.if) {
      const elseLabel = this.newLabel();
      const endLabel = this.newLabel();
      this.emitOps(op.if.cond, node);
      this.current.emit(Opcode.JMP_IF_FALSE, this.resolveLabel(elseLabel));
      this.emitOps(op.if.then, node);
      this.current.emit(Opcode.JMP, this.resolveLabel(endLabel));
      this.emitLabel(elseLabel);
      if (op.if.else) this.emitOps(op.if.else, node);
      this.emitLabel(endLabel);
      return;
    }
    if (op.block) {
      this.scopes.push(new Map());
      const bodyNode = this.resolveField(op.block.body, node);
      if (Array.isArray(bodyNode)) {
        for (const it of bodyNode) this.emitNode(it);
      } else {
        this.emitNode(bodyNode as AstNode);
      }
      this.scopes.pop();
      return;
    }
    if (op.loop) {
      const list = this.resolveField(op.loop.list, node);
      if (!Array.isArray(list)) return;
      for (const item of list) {
        this.emitTemplateWithItem(op.loop.body, node, item as AstNode);
      }
      return;
    }
    if (op.forEach && op.do) {
      const list = this.resolveField(op.forEach, node);
      // Support both arrays and single objects (for optional quantifiers).
      if (Array.isArray(list)) {
        for (const item of list) {
          this.emitTemplateWithItem(op.do, node, item as AstNode);
        }
      } else if (list && typeof list === 'object' && (list as any).type) {
        // Single node — treat as a one-element list.
        this.emitTemplateWithItem(op.do, node, list as AstNode);
      }
      return;
    }
    if (op.func) {
      // Function declarations produce no code at the call site.
      return;
    }
  }

  /** Like emitOps, but inside a forEach body, `${item}` resolves to the current item. */
  private emitTemplateWithItem(
    ops: TemplateOp[],
    parentNode: AstNode,
    item: AstNode
  ): void {
    // Save the current item in a synthetic scope so field refs to "item" work.
    const prevItem = this._currentItem;
    this._currentItem = item;
    for (const op of ops) this.emitOp(op, parentNode);
    this._currentItem = prevItem;
  }

  private _currentItem: AstNode | null = null;

  private emitStringOp(op: string, node: AstNode): void {
    const parts = op.trim().split(/\s+/);
    const cmd = parts[0].toUpperCase();
    const fb = this.current;

    const resolveFieldRef = (ref: string): any => {
      const m = ref.match(/^\$\{([^}]+)\}$/);
      if (!m) return ref;
      const path = m[1].split('.');
      // Special: ${item} or ${item.xxx}
      if (path[0] === 'item' && this._currentItem) {
        let v: any = this._currentItem;
        for (let i = 1; i < path.length; i++) {
          if (v == null) return undefined;
          v = v.fields?.[path[i]] ?? v[path[i]];
        }
        return v;
      }
      let v: any = node;
      for (const seg of path) {
        if (v == null) return undefined;
        v = v.fields?.[seg] ?? (v[seg] !== undefined ? v[seg] : undefined);
      }
      return v;
    };

    switch (cmd) {
      case 'EVAL': {
        const target = parts[1];
        const child = this.resolveField(target, node);
        if (Array.isArray(child)) {
          for (const it of child) this.emitNode(it as AstNode);
        } else {
          this.emitNode(child as AstNode);
        }
        return;
      }
      case 'PUSH_INT': {
        const v = resolveFieldRef(parts[1]);
        const n = typeof v === 'number' ? v : parseInt(v, 10);
        const idx = this.module.addConstant(n);
        fb.emit(Opcode.PUSH_INT, idx);
        return;
      }
      case 'PUSH_STR': {
        const v = resolveFieldRef(parts[1]);
        const s = typeof v === 'string' ? v : String(v ?? '');
        const idx = this.module.addConstant(s);
        fb.emit(Opcode.PUSH_STR, idx);
        return;
      }
      case 'PUSH_BOOL': {
        // Resolve ${field} references so templates like
        // `PUSH_BOOL ${value}` actually read the node's field.
        const raw = parts[1];
        let v: string;
        if (raw.startsWith('${')) {
          const resolved = resolveFieldRef(raw);
          v = String(resolved ?? '').toLowerCase();
        } else {
          v = raw.toLowerCase();
        }
        fb.emit(Opcode.PUSH_BOOL, v === 'true' || v === '1' ? 1 : 0);
        return;
      }
      case 'PUSH_NULL':
        fb.emit(Opcode.PUSH_NULL);
        return;
      case 'POP':
        fb.emit(Opcode.POP);
        return;
      case 'DUP':
        fb.emit(Opcode.DUP);
        return;
      case 'SWAP':
        fb.emit(Opcode.SWAP);
        return;
      case 'PRINT':
        fb.emit(Opcode.PRINT);
        return;
      case 'PRINT_RAW':
        fb.emit(Opcode.PRINT_RAW);
        return;
      case 'ADD':
        fb.emit(Opcode.ADD);
        return;
      case 'SUB':
        fb.emit(Opcode.SUB);
        return;
      case 'MUL':
        fb.emit(Opcode.MUL);
        return;
      case 'DIV':
        fb.emit(Opcode.DIV);
        return;
      case 'MOD':
        fb.emit(Opcode.MOD);
        return;
      case 'NEG':
        fb.emit(Opcode.NEG);
        return;
      case 'EQ':
        fb.emit(Opcode.EQ);
        return;
      case 'NEQ':
        fb.emit(Opcode.NEQ);
        return;
      case 'LT':
        fb.emit(Opcode.LT);
        return;
      case 'GT':
        fb.emit(Opcode.GT);
        return;
      case 'LTE':
        fb.emit(Opcode.LTE);
        return;
      case 'GTE':
        fb.emit(Opcode.GTE);
        return;
      case 'AND':
        fb.emit(Opcode.AND);
        return;
      case 'OR':
        fb.emit(Opcode.OR);
        return;
      case 'NOT':
        fb.emit(Opcode.NOT);
        return;
      case 'HALT':
        fb.emit(Opcode.HALT);
        return;
      case 'RET':
        fb.emit(Opcode.RET);
        return;
      case 'BINOP': {
        const opStr = resolveFieldRef(parts[1]);
        const oc = BINOP_MAP[opStr];
        if (oc === undefined) {
          throw new CompileError(`Unknown binop: ${opStr}`);
        }
        fb.emit(oc);
        return;
      }
      case 'UNARYOP': {
        const opStr = resolveFieldRef(parts[1]);
        if (opStr === '-') fb.emit(Opcode.NEG);
        else if (opStr === '!') fb.emit(Opcode.NOT);
        else throw new CompileError(`Unknown unary op: ${opStr}`);
        return;
      }
      case 'CALL': {
        // CALL ${callee} ${args}
        const calleeName = resolveFieldRef(parts[1]);
        const argsField = parts[2];
        let argc = 0;
        if (argsField) {
          const argVal = this.resolveField(argsField, node);
          if (Array.isArray(argVal)) {
            argc = argVal.length;
            // Push args in order.
            for (const a of argVal) this.emitNode(a as AstNode);
          } else if (argVal) {
            argc = 1;
            this.emitNode(argVal as AstNode);
          }
        }
        // Push function name as string constant.
        const nameIdx = this.module.addConstant(String(calleeName));
        fb.emit(Opcode.PUSH_STR, nameIdx);
        fb.emit(Opcode.CALL, argc);
        return;
      }
      case 'NEW_LIST': {
        const arg = parts[1];
        let n = 0;
        if (arg.startsWith('${')) {
          const v = this.resolveField(arg, node);
          n = Array.isArray(v) ? v.length : 0;
        } else {
          n = parseInt(arg, 10);
        }
        // Items should already be on the stack (via prior EVAL ops).
        fb.emit(Opcode.NEW_LIST, n);
        return;
      }
      case 'LOAD_VAR': {
        const name = resolveFieldRef(parts[1]);
        this.emitLoadVar(String(name));
        return;
      }
      case 'STORE_VAR': {
        const name = resolveFieldRef(parts[1]);
        this.emitStoreVar(String(name));
        return;
      }
      case 'DECLARE_VAR': {
        const name = resolveFieldRef(parts[1]);
        this.declareLocal(String(name));
        return;
      }
      case 'LOAD_LOCAL':
        fb.emit(Opcode.LOAD_LOCAL, parseInt(parts[1], 10));
        return;
      case 'STORE_LOCAL':
        fb.emit(Opcode.STORE_LOCAL, parseInt(parts[1], 10));
        return;
      case 'LEN':
        fb.emit(Opcode.LEN);
        return;
      case 'GET_INDEX':
        fb.emit(Opcode.GET_INDEX);
        return;
      case 'SET_INDEX':
        fb.emit(Opcode.SET_INDEX);
        return;
      case 'LABEL':
        this.emitLabel(parts[1]);
        return;
      case 'JMP':
        fb.emit(Opcode.JMP, this.resolveLabel(parts[1]));
        return;
      case 'JMP_IF_FALSE':
        fb.emit(Opcode.JMP_IF_FALSE, this.resolveLabel(parts[1]));
        return;
      case 'JMP_IF_TRUE':
        fb.emit(Opcode.JMP_IF_TRUE, this.resolveLabel(parts[1]));
        return;
      // === New: stack manipulation ===
      case 'ROT3':
        fb.emit(Opcode.ROT3);
        return;
      case 'OVER':
        fb.emit(Opcode.OVER);
        return;
      case 'INC':
        fb.emit(Opcode.INC);
        return;
      case 'DEC':
        fb.emit(Opcode.DEC);
        return;
      case 'ABS':
        fb.emit(Opcode.ABS);
        return;
      case 'MIN':
        fb.emit(Opcode.MIN);
        return;
      case 'MAX':
        fb.emit(Opcode.MAX);
        return;
      case 'IS_ZERO':
        fb.emit(Opcode.IS_ZERO);
        return;
      // === New: constants ===
      case 'PUSH_UNIT':
        fb.emit(Opcode.PUSH_UNIT);
        return;
      case 'PUSH_CHAR': {
        const v = resolveFieldRef(parts[1]);
        const s = typeof v === 'string' ? v : String(v ?? ' ');
        const idx = this.module.addConstant(s[0] ?? ' ');
        fb.emit(Opcode.PUSH_CHAR, idx);
        return;
      }
      // === New: closures ===
      case 'MAKE_CLOSURE': {
        const name = resolveFieldRef(parts[1]);
        const idx = this.module.addConstant(String(name));
        fb.emit(Opcode.MAKE_CLOSURE, idx);
        return;
      }
      case 'MAKE_CLOSURE_REC': {
        const name = resolveFieldRef(parts[1]);
        const idx = this.module.addConstant(String(name));
        fb.emit(Opcode.MAKE_CLOSURE_REC, idx);
        return;
      }
      case 'CALL_VALUE': {
        // CALL_VALUE <argc>
        // Caller has pushed: args, then closure on top.
        const argc = parseInt(parts[1] ?? '0', 10);
        fb.emit(Opcode.CALL_VALUE, argc);
        return;
      }
      case 'TAIL_CALL': {
        // TAIL_CALL ${callee} ${args}
        const calleeName = resolveFieldRef(parts[1]);
        const argsField = parts[2];
        let argc = 0;
        if (argsField) {
          const argVal = this.resolveField(argsField, node);
          if (Array.isArray(argVal)) {
            argc = argVal.length;
            for (const a of argVal) this.emitNode(a as AstNode);
          } else if (argVal) {
            argc = 1;
            this.emitNode(argVal as AstNode);
          }
        }
        const nameIdx = this.module.addConstant(String(calleeName));
        fb.emit(Opcode.PUSH_STR, nameIdx);
        fb.emit(Opcode.TAIL_CALL, argc);
        return;
      }
      // === New: upvalues ===
      case 'LOAD_UPVALUE':
        fb.emit(Opcode.LOAD_UPVALUE, parseInt(parts[1], 10));
        return;
      case 'STORE_UPVALUE':
        fb.emit(Opcode.STORE_UPVALUE, parseInt(parts[1], 10));
        return;
      // === New: list ops ===
      case 'LIST_CONS':
        fb.emit(Opcode.LIST_CONS);
        return;
      case 'LIST_HEAD':
        fb.emit(Opcode.LIST_HEAD);
        return;
      case 'LIST_TAIL':
        fb.emit(Opcode.LIST_TAIL);
        return;
      case 'LIST_IS_EMPTY':
        fb.emit(Opcode.LIST_IS_EMPTY);
        return;
      // === New: type checks ===
      case 'IS_NULL':
        fb.emit(Opcode.IS_NULL);
        return;
      case 'IS_BOOL':
        fb.emit(Opcode.IS_BOOL);
        return;
      case 'IS_INT':
        fb.emit(Opcode.IS_INT);
        return;
      case 'IS_STR':
        fb.emit(Opcode.IS_STR);
        return;
      case 'IS_LIST':
        fb.emit(Opcode.IS_LIST);
        return;
      case 'IS_CLOSURE':
        fb.emit(Opcode.IS_CLOSURE);
        return;
      case 'IS_CHAR':
        fb.emit(Opcode.IS_CHAR);
        return;
      case 'IS_TUPLE':
        fb.emit(Opcode.IS_TUPLE);
        return;
      case 'TYPE_TAG':
        fb.emit(Opcode.TYPE_TAG);
        return;
      // === New: tuples ===
      case 'NEW_TUPLE': {
        const arg = parts[1];
        let n = 0;
        if (arg.startsWith('${')) {
          const v = this.resolveField(arg, node);
          n = Array.isArray(v) ? v.length : 0;
        } else {
          n = parseInt(arg, 10);
        }
        fb.emit(Opcode.NEW_TUPLE, n);
        return;
      }
      case 'TUPLE_GET':
        fb.emit(Opcode.TUPLE_GET, parseInt(parts[1], 10));
        return;
      case 'NEW_RECORD': {
        const arg = parts[1];
        let n = 0;
        if (arg.startsWith('${')) {
          const v = this.resolveField(arg, node);
          n = Array.isArray(v) ? v.length : 0;
        } else {
          n = parseInt(arg, 10);
        }
        fb.emit(Opcode.NEW_RECORD, n);
        return;
      }
      case 'RECORD_GET':
        fb.emit(Opcode.RECORD_GET);
        return;
      case 'RECORD_HAS':
        fb.emit(Opcode.RECORD_HAS);
        return;
      // === New: refs ===
      case 'NEW_REF':
        fb.emit(Opcode.NEW_REF);
        return;
      case 'DEREF':
        fb.emit(Opcode.DEREF);
        return;
      case 'REF_SET':
        fb.emit(Opcode.REF_SET);
        return;
      case 'IS_REF':
        fb.emit(Opcode.IS_REF);
        return;
      // === New: char I/O ===
      case 'READ_CHAR':
        fb.emit(Opcode.READ_CHAR, parseInt(parts[1] ?? '0', 10));
        return;
      case 'PEEK_CHAR':
        fb.emit(Opcode.PEEK_CHAR, parseInt(parts[1] ?? '0', 10));
        return;
      case 'WRITE_CHAR':
        fb.emit(Opcode.WRITE_CHAR, parseInt(parts[1] ?? '0', 10));
        return;
      case 'EMIT_CHAR':
        fb.emit(Opcode.EMIT_CHAR);
        return;
      case 'CHAR_TO_INT':
        fb.emit(Opcode.CHAR_TO_INT);
        return;
      case 'INT_TO_CHAR':
        fb.emit(Opcode.INT_TO_CHAR);
        return;
      default:
        throw new CompileError(`Unknown codegen op: ${cmd}`);
    }
  }

  private emitLoadVar(name: string): void {
    const slot = this.resolveLocal(name);
    if (slot !== null) {
      this.current.emit(Opcode.LOAD_LOCAL, slot);
      return;
    }
    const idx = this.module.addConstant(name);
    this.current.emit(Opcode.LOAD_GLOBAL, idx);
  }

  private emitStoreVar(name: string): void {
    const slot = this.resolveLocal(name);
    if (slot !== null) {
      this.current.emit(Opcode.STORE_LOCAL, slot);
      return;
    }
    const idx = this.module.addConstant(name);
    this.current.emit(Opcode.STORE_GLOBAL, idx);
  }

  // -----------------------------------------------------------------------
  // Field resolution
  // -----------------------------------------------------------------------

  private resolveField(ref: string, node: AstNode): any {
    if (!ref) return undefined;
    const m = ref.match(/^\$\{([^}]+)\}$/);
    if (!m) return ref;
    const path = m[1].split('.');
    if (path[0] === 'item' && this._currentItem) {
      let v: any = this._currentItem;
      for (let i = 1; i < path.length; i++) {
        if (v == null) return undefined;
        v = v.fields?.[path[i]] ?? v[path[i]];
      }
      return v;
    }
    let v: any = node;
    for (const seg of path) {
      if (v == null) return undefined;
      v = v.fields?.[seg] ?? (v[seg] !== undefined ? v[seg] : undefined);
    }
    return v;
  }

  // -----------------------------------------------------------------------
  // Labels (with backpatching)
  // -----------------------------------------------------------------------

  private newLabel(): string {
    return `L${this.labelCounter++}`;
  }
  private labelTargets: Map<string, number> = new Map();
  private labelPatches: Map<string, Array<{ at: number }>> = new Map();

  private emitLabel(label: string): void {
    const target = this.current.offset;
    this.labelTargets.set(label, target);
    const patches = this.labelPatches.get(label);
    if (patches) {
      for (const p of patches) this.current.patchOperand(p.at, target);
      this.labelPatches.delete(label);
    }
  }

  private resolveLabel(label: string): number {
    const target = this.labelTargets.get(label);
    if (target !== undefined) return target;
    if (!this.labelPatches.has(label)) this.labelPatches.set(label, []);
    // `at` is the offset of the OPCODE that will be emitted next.
    // patchOperand(at, value) patches at+1, at+2, at+3 (the operand bytes).
    const at = this.current.offset;
    this.labelPatches.get(label)!.push({ at });
    return 0;
  }
}
