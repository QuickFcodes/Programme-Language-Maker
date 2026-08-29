/**
 * Build a fully standalone HTML file with a vanilla-JS UI (no React dependency).
 * This creates a working PLM IDE that runs entirely in the browser.
 */

import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { build } from 'bun';

console.log('Building standalone HTML (full UI)...');

// Build the core library — use a custom entry that exports everything we need
const entryContent = `
export { LANGUAGES, getLanguage } from '${process.cwd()}/src/lib/languages';
export { compileSource, astToJson } from '${process.cwd()}/src/lib/plm/compiler';
export { runModule, QVM } from '${process.cwd()}/src/lib/qvm/vm';
export { listStdPackages, getStdPackage, getAllStdPackages, getStdPackages, buildStdIo, buildStdList, buildStdString, buildStdMath, buildStdFunc } from '${process.cwd()}/src/lib/qvm/stdlib';
export { serializePackage, deserializePackage, mergePackages, PackageBuilder } from '${process.cwd()}/src/lib/qvm/package';
export { Opcode, OPCODE_NAMES, OPCODE_HAS_OPERAND } from '${process.cwd()}/src/lib/qvm/opcodes';
export { disassembleFunction, formatValue, ModuleBuilder, FunctionBuilder } from '${process.cwd()}/src/lib/qvm/bytecode';
`;
const { writeFileSync: wf } = await import('fs');
wf('/tmp/plm-entry.ts', entryContent);

const result = await build({
  entrypoints: ['/tmp/plm-entry.ts'],
  outdir: '/tmp/plm-build2',
  target: 'browser',
  format: 'iife',
  naming: 'plm-core.js',
  minify: false,
  external: [],
});

const coreJs = readFileSync('/tmp/plm-build2/plm-core.js', 'utf-8');

// The IIFE bundle doesn't export to globalThis. We need to append exports.
// The bundle defines everything in a closure. We need to modify it to export.
// Simplest: wrap it to capture the return value.
const exportCode = `
// Export to global scope
window.LANGUAGES = LANGUAGES;
window.getLanguage = getLanguage;
window.compileSource = compileSource;
window.astToJson = astToJson;
window.runModule = runModule;
window.QVM = QVM;
window.listStdPackages = listStdPackages;
window.getStdPackage = getStdPackage;
window.getStdPackages = getStdPackages;
window.getAllStdPackages = getAllStdPackages;
window.buildStdIo = buildStdIo;
window.buildStdList = buildStdList;
window.buildStdString = buildStdString;
window.buildStdMath = buildStdMath;
window.buildStdFunc = buildStdFunc;
window.serializePackage = serializePackage;
window.deserializePackage = deserializePackage;
window.mergePackages = mergePackages;
window.PackageBuilder = PackageBuilder;
window.Opcode = Opcode;
window.OPCODE_NAMES = OPCODE_NAMES;
window.OPCODE_HAS_OPERAND = OPCODE_HAS_OPERAND;
window.disassembleFunction = disassembleFunction;
window.formatValue = formatValue;
window.ModuleBuilder = ModuleBuilder;
window.FunctionBuilder = FunctionBuilder;
`;

// Insert export code before the closing of the IIFE
const modifiedCoreJs = coreJs.replace(/\}\)\(\);[\s]*$/, exportCode + '})();');

const html = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>PLM — Programming Language Maker</title>
<style>
:root {
  --vsc-bg: #1e1e1e;
  --vsc-bg-alt: #252526;
  --vsc-bg-alt2: #2d2d2d;
  --vsc-bg-active: #094771;
  --vsc-bg-hover: #2a2d2e;
  --vsc-bg-statusbar: #007acc;
  --vsc-bg-activity: #333333;
  --vsc-text: #cccccc;
  --vsc-text-dim: #858585;
  --vsc-text-bright: #ffffff;
  --vsc-border: #3c3c3c;
  --vsc-accent: #007acc;
  --vsc-syn-keyword: #569cd6;
  --vsc-syn-string: #ce9178;
  --vsc-syn-number: #b5cea8;
  --vsc-syn-comment: #6a9955;
  --vsc-syn-func: #dcdcaa;
  --vsc-syn-var: #9cdcfe;
  --vsc-syn-op: #d4d4d4;
  --vsc-syn-punct: #d4d4d4;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--vsc-bg); color: var(--vsc-text); overflow: hidden; height: 100vh; }
#app { display: flex; flex-direction: column; height: 100vh; }

/* Title bar */
.titlebar { height: 32px; background: #3c3c3c; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; font-size: 12px; }
.titlebar .left { display: flex; align-items: center; gap: 16px; }
.titlebar .brand { font-weight: 600; color: #fff; }
.titlebar select { background: #3c3c3c; color: #ccc; border: 1px solid #3c3c3c; font-size: 11px; padding: 2px 6px; border-radius: 2px; }

/* Main layout */
.main { display: flex; flex: 1; min-height: 0; }

/* Activity bar */
.activity { width: 48px; background: var(--vsc-bg-activity); display: flex; flex-direction: column; align-items: center; padding: 4px 0; }
.activity button { width: 48px; height: 48px; background: none; border: none; color: #858585; cursor: pointer; display: flex; align-items: center; justify-content: center; position: relative; }
.activity button:hover { color: #fff; }
.activity button.active { color: #fff; }
.activity button.active::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: #fff; }
.activity .spacer { flex: 1; }
.activity .run-btn { color: #858585; }
.activity .run-btn.running { color: #dcdcaa; }
.activity .run-btn.done { color: #89d185; }
.activity .run-btn.error { color: #f48771; }

/* Sidebar */
.sidebar { width: 240px; background: var(--vsc-bg-alt); overflow-y: auto; }
.sidebar .header { height: 36px; display: flex; align-items: center; padding: 0 16px; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #bbb; }
.sidebar .section { padding: 4px 0; }
.sidebar .section-title { padding: 4px 16px; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #bbb; }
.sidebar .section-content { padding: 0 16px; font-size: 12px; color: #858585; }
.sidebar .lang-name { padding: 4px 16px; font-size: 13px; color: #fff; }
.sidebar .pkg-item { padding: 2px 16px; font-size: 11px; color: #858585; display: flex; gap: 4px; }
.sidebar .pkg-item::before { content: '●'; color: #569cd6; }

/* Editor area */
.editor-area { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.editor-tabs { height: 36px; background: var(--vsc-bg-alt); display: flex; border-bottom: 1px solid var(--vsc-bg-alt); }
.editor-tab { padding: 0 12px; height: 100%; display: flex; align-items: center; gap: 6px; font-size: 12px; color: #858585; background: var(--vsc-bg-alt2); border: none; border-top: 2px solid transparent; cursor: pointer; }
.editor-tab.active { background: var(--vsc-bg); color: #fff; border-top-color: var(--vsc-accent); }
.editor-tab:hover:not(.active) { background: var(--vsc-bg-alt); }
.editor-container { flex: 1; position: relative; overflow: hidden; background: var(--vsc-bg); }

/* Code editor */
.code-editor { position: relative; width: 100%; height: 100%; display: flex; }
.line-numbers { padding: 8px 8px 8px 16px; text-align: right; font-family: ui-monospace, monospace; font-size: 13px; line-height: 20px; color: #858585; user-select: none; overflow: hidden; min-width: 40px; }
.code-highlight { position: absolute; left: 56px; top: 0; right: 0; bottom: 0; padding: 8px; font-family: ui-monospace, monospace; font-size: 13px; line-height: 20px; color: #d4d4d4; pointer-events: none; white-space: pre; overflow: auto; }
.code-textarea { position: absolute; left: 56px; top: 0; right: 0; bottom: 0; padding: 8px; font-family: ui-monospace, monospace; font-size: 13px; line-height: 20px; color: transparent; caret-color: #aeafad; background: transparent; border: none; outline: none; resize: none; overflow: auto; white-space: pre; }
.code-textarea::selection { background: rgba(38, 79, 120, 0.7); }

/* JSON editor */
.json-editor { width: 100%; height: 100%; background: var(--vsc-bg); color: #d4d4d4; border: none; outline: none; resize: none; padding: 8px; font-family: ui-monospace, monospace; font-size: 12px; line-height: 18px; }

/* Panel */
.panel { height: 280px; display: flex; flex-direction: column; border-top: 1px solid var(--vsc-border); background: var(--vsc-bg); }
.panel-tabs { height: 36px; background: var(--vsc-bg-alt); display: flex; align-items: center; padding-right: 8px; border-bottom: 1px solid var(--vsc-bg-alt); }
.panel-tab { padding: 0 12px; height: 100%; display: flex; align-items: center; gap: 6px; font-size: 11px; text-transform: uppercase; color: #858585; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; }
.panel-tab.active { color: #fff; border-bottom-color: var(--vsc-accent); }
.panel-tab:disabled { color: #5a5a5a; cursor: not-allowed; }
.panel-tab:hover:not(:disabled):not(.active) { color: #ccc; }
.panel-content { flex: 1; overflow: auto; padding: 8px; }

/* Terminal */
.terminal { font-family: ui-monospace, monospace; font-size: 12px; line-height: 18px; color: #ccc; white-space: pre-wrap; }
.terminal .error { color: #f48771; }
.terminal .prompt { color: #569cd6; }

/* Bytecode view */
.bytecode { font-family: ui-monospace, monospace; font-size: 12px; line-height: 18px; color: #ccc; white-space: pre; }
.bytecode .fn-name { color: #dcdcaa; }
.bytecode .comment { color: #6a9955; }

/* AST view */
.ast-view { font-family: ui-monospace, monospace; font-size: 12px; line-height: 18px; color: #ccc; white-space: pre; }

/* Token view */
.tokens-table { width: 100%; border-collapse: collapse; font-family: ui-monospace, monospace; font-size: 12px; }
.tokens-table th { text-align: left; padding: 4px 8px; color: #858585; border-bottom: 1px solid var(--vsc-border); font-weight: normal; }
.tokens-table td { padding: 2px 8px; }
.tokens-table tr:hover { background: var(--vsc-bg-hover); }
.tok-type-keyword { color: #569cd6; }
.tok-type-number { color: #b5cea8; }
.tok-type-string { color: #ce9178; }
.tok-type-ident { color: #9cdcfe; }

/* Status bar */
.statusbar { height: 24px; background: var(--vsc-bg-statusbar); color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; font-size: 11px; }
.statusbar .left, .statusbar .right { display: flex; gap: 12px; align-items: center; }

/* Mobile */
@media (max-width: 768px) {
  .sidebar { display: none; }
  .activity { width: 40px; }
  .activity button { width: 40px; height: 40px; }
  .code-highlight, .code-textarea { left: 40px; font-size: 11px; }
  .line-numbers { min-width: 30px; font-size: 11px; padding: 8px 4px 8px 8px; }
  .panel { height: 200px; }
  .titlebar { font-size: 11px; padding: 0 8px; }
  .titlebar .left span:not(.brand) { display: none; }
}

/* Scrollbar */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #424242; }
::-webkit-scrollbar-thumb:hover { background: #4f4f4f; }
</style>
</head>
<body>
<div id="app">
  <div class="titlebar">
    <div class="left">
      <span class="brand">PLM</span>
      <span style="color:#858585;">Programming Language Maker</span>
    </div>
    <div>
      <select id="langSelect"></select>
      <button id="runBtn" style="background:#0e639c;color:#fff;border:none;padding:4px 12px;border-radius:3px;cursor:pointer;font-size:11px;">▶ Run</button>
    </div>
  </div>
  <div class="main">
    <div class="activity">
      <button id="tabEditor" class="active" title="Editor">📁</button>
      <button id="tabConfig" title="Config">⚙</button>
      <div class="spacer"></div>
      <button id="runBtn2" class="run-btn" title="Run">▶</button>
    </div>
    <div class="sidebar" id="sidebar">
      <div class="header">Explorer</div>
      <div class="section">
        <div class="section-title">Language</div>
        <div class="lang-name" id="langName"></div>
        <div class="section-content" id="langDesc"></div>
      </div>
      <div class="section">
        <div class="section-title">Quick stats</div>
        <div class="section-content" id="stats"></div>
      </div>
      <div class="section">
        <div class="section-title">Default packages</div>
        <div id="packages"></div>
      </div>
    </div>
    <div class="editor-area">
      <div class="editor-tabs">
        <button class="editor-tab active" id="sourceTab"><span>📄</span> <span id="fileName">main.ml</span></button>
        <button class="editor-tab" id="configTab"><span>⚙</span> <span>config.json</span></button>
      </div>
      <div class="editor-container" id="editorContainer">
        <div class="code-editor" id="codeEditor">
          <div class="line-numbers" id="lineNumbers">1</div>
          <pre class="code-highlight" id="codeHighlight"></pre>
          <textarea class="code-textarea" id="codeTextarea" spellcheck="false" autocomplete="off" autocorrect="off"></textarea>
        </div>
        <textarea class="json-editor" id="jsonEditor" spellcheck="false" style="display:none;"></textarea>
      </div>
      <div class="panel">
        <div class="panel-tabs">
          <button class="panel-tab active" id="termTab">Terminal</button>
          <button class="panel-tab" id="bcTab" disabled>Bytecode</button>
          <button class="panel-tab" id="astTab" disabled>AST</button>
          <button class="panel-tab" id="tokTab" disabled>Tokens</button>
        </div>
        <div class="panel-content" id="panelContent">
          <div class="terminal" id="terminal">PLM Terminal — write some code and click Run.</div>
        </div>
      </div>
    </div>
  </div>
  <div class="statusbar">
    <div class="left"><span id="statusLang">PLM</span></div>
    <div class="right"><span id="statusLines">Ln 1</span><span id="statusChars">0 chars</span></div>
  </div>
</div>

<script>
// === PLM Core Library (inlined) ===
${modifiedCoreJs}

// === UI Logic ===
(function() {
  const LANGUAGES = globalThis.LANGUAGES || [];
  const compileSource = globalThis.compileSource;
  const runModule = globalThis.runModule;
  
  let currentLangId = 'minilang';
  let sources = {};
  let configs = {};
  
  // Initialize sources and configs
  for (const lang of LANGUAGES) {
    sources[lang.id] = lang.sample;
    configs[lang.id] = JSON.parse(JSON.stringify(lang.config));
  }
  
  // DOM elements
  const langSelect = document.getElementById('langSelect');
  const runBtn = document.getElementById('runBtn');
  const runBtn2 = document.getElementById('runBtn2');
  const codeTextarea = document.getElementById('codeTextarea');
  const codeHighlight = document.getElementById('codeHighlight');
  const lineNumbers = document.getElementById('lineNumbers');
  const jsonEditor = document.getElementById('jsonEditor');
  const terminal = document.getElementById('terminal');
  const panelContent = document.getElementById('panelContent');
  const sourceTab = document.getElementById('sourceTab');
  const configTab = document.getElementById('configTab');
  const codeEditor = document.getElementById('codeEditor');
  const langName = document.getElementById('langName');
  const langDesc = document.getElementById('langDesc');
  const stats = document.getElementById('stats');
  const packages = document.getElementById('packages');
  const fileName = document.getElementById('fileName');
  const statusLang = document.getElementById('statusLang');
  const statusLines = document.getElementById('statusLines');
  const statusChars = document.getElementById('statusChars');
  
  let currentEditorMode = 'source';
  let currentPanel = 'terminal';
  let compileResult = null;
  
  // Populate language selector
  for (const lang of LANGUAGES) {
    const opt = document.createElement('option');
    opt.value = lang.id;
    opt.textContent = lang.name;
    langSelect.appendChild(opt);
  }
  
  // Simple syntax highlighter
  function highlight(code, lang) {
    const cfg = configs[lang.id] || lang.config;
    const tokens = [];
    const literalTokens = (cfg.lexer.tokens || [])
      .filter(t => t.kind === 'literal' && t.literal)
      .sort((a, b) => b.literal.length - a.literal.length);
    const keywords = cfg.lexer.keywords || {};
    
    let i = 0;
    while (i < code.length) {
      const c = code[i];
      // Whitespace
      if (c === ' ' || c === '\\t' || c === '\\n' || c === '\\r') {
        let j = i + 1;
        while (j < code.length && ' \\t\\n\\r'.includes(code[j])) j++;
        tokens.push({ text: code.slice(i, j), cls: '' });
        i = j;
        continue;
      }
      // Comments
      if (cfg.lexer.comments) {
        if (cfg.lexer.comments.line && code.startsWith(cfg.lexer.comments.line, i)) {
          let end = code.indexOf('\\n', i);
          if (end < 0) end = code.length;
          tokens.push({ text: code.slice(i, end), cls: 'tok-comment' });
          i = end;
          continue;
        }
        if (cfg.lexer.comments.blockStart && code.startsWith(cfg.lexer.comments.blockStart, i)) {
          let end = code.indexOf(cfg.lexer.comments.blockEnd || '', i + cfg.lexer.comments.blockStart.length);
          if (end < 0) end = code.length;
          else end += (cfg.lexer.comments.blockEnd || '').length;
          tokens.push({ text: code.slice(i, end), cls: 'tok-comment' });
          i = end;
          continue;
        }
      }
      // Literals
      let matched = false;
      for (const t of literalTokens) {
        if (code.startsWith(t.literal, i)) {
          const cls = (keywords[t.literal] ? 'tok-keyword' : 'tok-op');
          tokens.push({ text: t.literal, cls });
          i += t.literal.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;
      // Number
      if (c >= '0' && c <= '9') {
        let j = i + 1;
        while (j < code.length && code[j] >= '0' && code[j] <= '9') j++;
        if (code[j] === '.' && code[j+1] >= '0' && code[j+1] <= '9') {
          j++;
          while (j < code.length && code[j] >= '0' && code[j] <= '9') j++;
        }
        tokens.push({ text: code.slice(i, j), cls: 'tok-number' });
        i = j;
        continue;
      }
      // String
      if (c === '"' || c === "'") {
        const q = c;
        let j = i + 1;
        while (j < code.length && code[j] !== q) {
          if (code[j] === '\\\\') j++;
          j++;
        }
        j++;
        tokens.push({ text: code.slice(i, Math.min(j, code.length)), cls: 'tok-string' });
        i = j;
        continue;
      }
      // Identifier
      if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
        let j = i + 1;
        while (j < code.length && /[a-zA-Z0-9_]/.test(code[j])) j++;
        const text = code.slice(i, j);
        const cls = keywords[text] ? 'tok-keyword' : 'tok-var';
        tokens.push({ text, cls });
        i = j;
        continue;
      }
      tokens.push({ text: c, cls: 'tok-op' });
      i++;
    }
    
    return tokens.map(t => t.cls ? '<span class="' + t.cls + '">' + escapeHtml(t.text) + '</span>' : escapeHtml(t.text)).join('');
  }
  
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  
  function updateEditor() {
    const lang = LANGUAGES.find(l => l.id === currentLangId);
    if (!lang) return;
    const src = sources[currentLangId] ?? lang.sample;
    codeTextarea.value = src;
    codeHighlight.innerHTML = highlight(src, lang) + '\\n';
    lineNumbers.textContent = src.split('\\n').map((_, i) => i + 1).join('\\n');
    fileName.textContent = 'main.' + lang.extension;
    statusLines.textContent = 'Ln ' + src.split('\\n').length;
    statusChars.textContent = src.length + ' chars';
  }
  
  function updateSidebar() {
    const lang = LANGUAGES.find(l => l.id === currentLangId);
    if (!lang) return;
    const cfg = configs[currentLangId] || lang.config;
    langName.textContent = lang.name;
    langDesc.textContent = lang.description;
    stats.innerHTML = 
      '<div>Tokens: ' + (cfg.lexer.tokens || []).length + '</div>' +
      '<div>Keywords: ' + Object.keys(cfg.lexer.keywords || {}).length + '</div>' +
      '<div>Grammar rules: ' + Object.keys(cfg.grammar.rules || {}).length + '</div>' +
      '<div>Templates: ' + (cfg.codegen.templates || []).length + '</div>';
    const di = cfg.defaultImports || [];
    packages.innerHTML = di.map(p => '<div class="pkg-item">' + p + '</div>').join('') || '<div class="section-content">None</div>';
    statusLang.textContent = 'PLM — ' + lang.name;
    jsonEditor.value = JSON.stringify(cfg, null, 2);
  }
  
  function syncScroll() {
    codeHighlight.scrollTop = codeTextarea.scrollTop;
    codeHighlight.scrollLeft = codeTextarea.scrollLeft;
    lineNumbers.scrollTop = codeTextarea.scrollTop;
  }
  
  function run() {
    const lang = LANGUAGES.find(l => l.id === currentLangId);
    if (!lang) return;
    const cfg = configs[currentLangId] || lang.config;
    const src = sources[currentLangId] ?? lang.sample;
    
    runBtn.textContent = '⏳ Running...';
    runBtn2.className = 'run-btn running';
    terminal.innerHTML = '<span style="color:#dcdcaa;">Running...</span>';
    
    setTimeout(() => {
      try {
        const result = compileSource(cfg, src);
        compileResult = result;
        
        if (result.configErrors.length || result.lexErrors.length || result.parseErrors.length || result.compileErrors.length) {
          const errs = [...result.configErrors, ...result.lexErrors, ...result.parseErrors, ...result.compileErrors];
          terminal.innerHTML = '<span class="error">' + escapeHtml(errs.join('\\n')) + '</span>';
          runBtn.textContent = '▶ Run';
          runBtn2.className = 'run-btn error';
          enablePanels(result);
          return;
        }
        
        const vm = runModule(result.compile.module, { instructionLimit: 100_000_000 });
        const out = vm.output || '';
        if (vm.error) {
          terminal.innerHTML = escapeHtml(out) + '<span class="error">' + escapeHtml(vm.error) + '</span>';
          runBtn.textContent = '▶ Run';
          runBtn2.className = 'run-btn error';
        } else {
          terminal.innerHTML = escapeHtml(out) + '<span class="prompt">PLM&gt; _</span>';
          runBtn.textContent = '▶ Run';
          runBtn2.className = 'run-btn done';
        }
        enablePanels(result);
      } catch (e) {
        terminal.innerHTML = '<span class="error">' + escapeHtml(e.message) + '</span>';
        runBtn.textContent = '▶ Run';
        runBtn2.className = 'run-btn error';
      }
    }, 50);
  }
  
  function enablePanels(result) {
    document.getElementById('bcTab').disabled = !result.compile;
    document.getElementById('astTab').disabled = !result.ast;
    document.getElementById('tokTab').disabled = !result.tokens;
  }
  
  function showPanel(name) {
    currentPanel = name;
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(name + 'Tab').classList.add('active');
    
    if (!compileResult) {
      panelContent.innerHTML = '<div class="terminal">No data yet. Click Run.</div>';
      return;
    }
    
    if (name === 'terminal') {
      panelContent.innerHTML = '<div class="terminal">' + terminal.innerHTML + '</div>';
    } else if (name === 'bc' && compileResult.compile) {
      let html = '';
      for (const fn of compileResult.compile.disasm) {
        html += '<div class="bytecode"><span class="fn-name">function ' + fn.name + '</span>\\n' + escapeHtml(fn.lines.join('\\n')) + '\\n\\n</div>';
      }
      panelContent.innerHTML = html;
    } else if (name === 'ast' && compileResult.ast) {
      panelContent.innerHTML = '<div class="ast-view">' + escapeHtml(JSON.stringify(compileResult.ast, null, 2)) + '</div>';
    } else if (name === 'tok' && compileResult.tokens) {
      let html = '<table class="tokens-table"><tr><th>TYPE</th><th>LINE</th><th>COL</th><th>TEXT</th></tr>';
      for (const t of compileResult.tokens) {
        const cls = 'tok-type-' + (t.type === 'NUMBER' ? 'number' : t.type === 'STRING' ? 'string' : t.type === 'IDENT' ? 'ident' : 'keyword');
        html += '<tr><td class="' + cls + '">' + t.type + '</td><td>' + t.line + '</td><td>' + t.col + '</td><td>' + escapeHtml(t.text) + '</td></tr>';
      }
      html += '</table>';
      panelContent.innerHTML = html;
    }
  }
  
  // Event listeners
  langSelect.addEventListener('change', (e) => {
    currentLangId = e.target.value;
    updateEditor();
    updateSidebar();
  });
  
  codeTextarea.addEventListener('input', (e) => {
    sources[currentLangId] = e.target.value;
    const lang = LANGUAGES.find(l => l.id === currentLangId);
    codeHighlight.innerHTML = highlight(e.target.value, lang) + '\\n';
    lineNumbers.textContent = e.target.value.split('\\n').map((_, i) => i + 1).join('\\n');
    statusLines.textContent = 'Ln ' + e.target.value.split('\\n').length;
    statusChars.textContent = e.target.value.length + ' chars';
  });
  
  codeTextarea.addEventListener('scroll', syncScroll);
  codeTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = codeTextarea.selectionStart;
      const end = codeTextarea.selectionEnd;
      codeTextarea.value = codeTextarea.value.slice(0, start) + '  ' + codeTextarea.value.slice(end);
      codeTextarea.selectionStart = codeTextarea.selectionEnd = start + 2;
      codeTextarea.dispatchEvent(new Event('input'));
    }
  });
  
  jsonEditor.addEventListener('input', (e) => {
    try {
      const parsed = JSON.parse(e.target.value);
      configs[currentLangId] = parsed;
    } catch (err) {
      // Ignore parse errors while typing
    }
  });
  
  runBtn.addEventListener('click', run);
  runBtn2.addEventListener('click', run);
  
  sourceTab.addEventListener('click', () => {
    currentEditorMode = 'source';
    sourceTab.classList.add('active');
    configTab.classList.remove('active');
    codeEditor.style.display = 'flex';
    jsonEditor.style.display = 'none';
  });
  
  configTab.addEventListener('click', () => {
    currentEditorMode = 'config';
    configTab.classList.add('active');
    sourceTab.classList.remove('active');
    codeEditor.style.display = 'none';
    jsonEditor.style.display = 'block';
  });
  
  document.getElementById('termTab').addEventListener('click', () => showPanel('terminal'));
  document.getElementById('bcTab').addEventListener('click', () => showPanel('bc'));
  document.getElementById('astTab').addEventListener('click', () => showPanel('ast'));
  document.getElementById('tokTab').addEventListener('click', () => showPanel('tok'));
  
  // Initialize
  langSelect.value = currentLangId;
  updateEditor();
  updateSidebar();
  
  console.log('PLM loaded. Languages:', LANGUAGES.map(l => l.name).join(', '));
})();
</script>
</body>
</html>`;

mkdirSync('download', { recursive: true });
writeFileSync('download/plm.html', html);
console.log('Standalone HTML written to download/plm.html');
console.log('Size:', (html.length / 1024).toFixed(1), 'KB');
