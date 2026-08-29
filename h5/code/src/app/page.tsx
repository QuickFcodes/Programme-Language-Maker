'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { CodeEditor } from '@/components/plm/CodeEditor';
import { ConfigGenerator } from '@/components/plm/ConfigGenerator';
import { BytecodeView } from '@/components/plm/BytecodeView';
import { AstView } from '@/components/plm/AstView';
import { Terminal } from '@/components/plm/Terminal';
import { TokensView } from '@/components/plm/TokensView';
import { compileSource } from '@/lib/plm/compiler';
import { runModule } from '@/lib/qvm/vm';
import { PlmConfig } from '@/lib/plm/config';
import { LANGUAGES, LanguageDef } from '@/lib/languages';
import {
  FileCode,
  Settings2,
  Play,
  TerminalSquare,
  Binary,
  GitBranch,
  Hash,
  Plus,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  Circle,
  CheckCircle2,
  XCircle,
  Code2,
} from 'lucide-react';

type ActivityView = 'explorer' | 'config';
type PanelTab = 'terminal' | 'bytecode' | 'ast' | 'tokens';
type EditorTab = 'source' | 'configJson';
type MobileView = 'editor' | 'output' | 'files';

export default function Home() {
  const [langId, setLangId] = useState('minilang');
  const lang = LANGUAGES.find((l) => l.id === langId)!;

  // Source code state — keyed by language id.
  // We initialize lazily: if a language's source isn't in state yet, use its sample.
  const [sources, setSources] = useState<Record<string, string>>({});
  const source = sources[langId] ?? lang.sample;

  // Config — allow editing, but reset when language changes
  const [configs, setConfigs] = useState<Record<string, PlmConfig>>(() => {
    const init: Record<string, PlmConfig> = {};
    for (const l of LANGUAGES) init[l.id] = l.config;
    return init;
  });
  const config = configs[langId] ?? lang.config;
  const [configJsonText, setConfigJsonText] = useState<string>(() => JSON.stringify(config, null, 2));
  const [configJsonError, setConfigJsonError] = useState<string | null>(null);

  // UI state
  const [activityView, setActivityView] = useState<ActivityView>('explorer');
  const [panelTab, setPanelTab] = useState<PanelTab>('terminal');
  const [editorTab, setEditorTab] = useState<EditorTab>('source');
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  // Mobile state
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>('editor');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Run results
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [output, setOutput] = useState('');
  const [runError, setRunError] = useState<string | null>(null);
  const [compileResult, setCompileResult] = useState<ReturnType<typeof compileSource> | null>(null);
  const [vmResult, setVmResult] = useState<ReturnType<typeof runModule> | null>(null);

  // Update config JSON when language switches — use a ref to track previous langId
  const [prevLangId, setPrevLangId] = useState(langId);
  if (prevLangId !== langId) {
    setPrevLangId(langId);
    setConfigJsonText(JSON.stringify(config, null, 2));
    setConfigJsonError(null);
    setEditorTab('source');
    setActivityView('explorer');
  }

  const updateSource = useCallback(
    (content: string) => {
      setSources((prev) => ({ ...prev, [langId]: content }));
    },
    [langId]
  );

  const handleConfigChange = useCallback(
    (cfg: PlmConfig) => {
      setConfigs((prev) => ({ ...prev, [langId]: cfg }));
      setConfigJsonText(JSON.stringify(cfg, null, 2));
    },
    [langId]
  );

  const handleConfigJsonChange = useCallback(
    (text: string) => {
      setConfigJsonText(text);
      try {
        const parsed = JSON.parse(text);
        setConfigs((prev) => ({ ...prev, [langId]: parsed }));
        setConfigJsonError(null);
      } catch (e: any) {
        setConfigJsonError(e.message);
      }
    },
    [langId]
  );

  const handleRun = useCallback(() => {
    setRunStatus('running');
    setMobileView('output');
    setPanelTab('terminal');
    setRunError(null);
    setOutput('');

    setTimeout(() => {
      try {
        const result = compileSource(config, source);
        setCompileResult(result);
        if (
          result.configErrors.length ||
          result.lexErrors.length ||
          result.parseErrors.length ||
          result.compileErrors.length
        ) {
          const allErrors = [
            ...result.configErrors,
            ...result.lexErrors,
            ...result.parseErrors,
            ...result.compileErrors,
          ];
          setRunError(allErrors.join('\n'));
          setRunStatus('error');
          setVmResult(null);
          return;
        }
        const vm = runModule(result.compile!.module, {
          instructionLimit: 100_000_000,
        });
        setVmResult(vm);
        setOutput(vm.output);
        if (vm.error) {
          setRunError(vm.error + (vm.stackTrace ? '\n' + vm.stackTrace.join('\n') : ''));
          setRunStatus('error');
        } else {
          setRunStatus('done');
        }
      } catch (e: any) {
        setRunError(e.message);
        setRunStatus('error');
      }
    }, 50);
  }, [config, source]);

  const stats = useMemo(() => {
    const lines = source.split('\n').length;
    const chars = source.length;
    return { lines, chars };
  }, [source]);

  // Mobile layout
  if (isMobile) {
    return (
      <MobileLayout
        lang={lang}
        langId={langId}
        onLangChange={setLangId}
        source={source}
        onSourceChange={updateSource}
        config={config}
        onConfigChange={handleConfigChange}
        configJsonText={configJsonText}
        onConfigJsonChange={handleConfigJsonChange}
        configJsonError={configJsonError}
        editorTab={editorTab}
        onEditorTabChange={setEditorTab}
        mobileView={mobileView}
        onMobileViewChange={setMobileView}
        onRun={handleRun}
        runStatus={runStatus}
        output={output}
        runError={runError}
        panelTab={panelTab}
        onPanelTabChange={setPanelTab}
        compileResult={compileResult}
        vmResult={vmResult}
        stats={stats}
      />
    );
  }

  // Desktop layout (VSCode-style)
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#1e1e1e] text-[#cccccc]">
      {/* Title bar */}
      <div className="flex h-8 items-center justify-between bg-[#3c3c3c] px-3 text-[12px] text-[#cccccc]">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-[#ffffff]">PLM</span>
          <span className="hidden text-[#858585] sm:inline">Programming Language Maker</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSelector langId={langId} onChange={setLangId} />
        </div>
      </div>

      {/* Main area */}
      <div className="flex min-h-0 flex-1">
        <ActivityBar
          active={activityView}
          onChange={setActivityView}
          onRun={handleRun}
          runStatus={runStatus}
        />

        <SideBar
          view={activityView}
          lang={lang}
          config={config}
        />

        {/* Editor + Panel column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Editor area */}
          <div className="flex min-h-0 flex-1 flex-col">
            <EditorTabs
              activeTab={editorTab}
              onTabChange={setEditorTab}
              activeFileName={`main.${lang.extension}`}
              languageName={lang.name}
            />
            <div className="min-h-0 flex-1">
              {editorTab === 'source' ? (
                <CodeEditor value={source} onChange={updateSource} config={config} />
              ) : (
                <ConfigJsonEditor
                  value={configJsonText}
                  onChange={handleConfigJsonChange}
                  error={configJsonError}
                />
              )}
            </div>
          </div>

          {/* Config generator */}
          {activityView === 'config' && (
            <div className="h-1/2 border-t border-[#3c3c3c]">
              <ConfigGenerator config={config} onChange={handleConfigChange} />
            </div>
          )}

          {/* Panel */}
          {!panelCollapsed && (
            <div className="flex h-[280px] flex-col border-t border-[#3c3c3c] bg-[#1e1e1e]">
              <PanelTabs
                active={panelTab}
                onChange={setPanelTab}
                onCollapse={() => setPanelCollapsed(true)}
                runStatus={runStatus}
                hasBytecode={!!compileResult?.compile}
                hasAst={!!compileResult?.ast}
                hasTokens={!!compileResult?.tokens}
              />
              <div className="min-h-0 flex-1">
                {panelTab === 'terminal' && (
                  <Terminal output={output} error={runError} status={runStatus} />
                )}
                {panelTab === 'bytecode' && (
                  <BytecodeView result={compileResult?.compile ?? null} />
                )}
                {panelTab === 'ast' && <AstView ast={compileResult?.ast ?? null} />}
                {panelTab === 'tokens' && (
                  <TokensView tokens={compileResult?.tokens ?? null} />
                )}
              </div>
            </div>
          )}
          {panelCollapsed && (
            <button
              className="flex h-6 items-center border-t border-[#3c3c3c] bg-[#252526] px-3 text-[11px] text-[#858585] hover:text-[#cccccc]"
              onClick={() => setPanelCollapsed(false)}
            >
              <ChevronRight className="mr-1 h-3 w-3" /> Show panel
            </button>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex h-6 items-center justify-between bg-[#007acc] px-3 text-[11px] text-[#ffffff]">
        <div className="flex items-center gap-3">
          {runStatus === 'running' && <Circle className="h-3 w-3 animate-pulse" />}
          {runStatus === 'done' && <CheckCircle2 className="h-3 w-3" />}
          {runStatus === 'error' && <XCircle className="h-3 w-3" />}
          <span>PLM — {lang.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Ln {stats.lines}</span>
          <span>{stats.chars} chars</span>
          <span>{lang.name}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Language selector
// ---------------------------------------------------------------------------

function LanguageSelector({ langId, onChange }: { langId: string; onChange: (id: string) => void }) {
  return (
    <select
      value={langId}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-[#3c3c3c] bg-[#3c3c3c] px-2 py-0.5 text-[11px] text-[#cccccc] outline-none focus:border-[#007acc]"
    >
      {LANGUAGES.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Activity bar
// ---------------------------------------------------------------------------

function ActivityBar({
  active,
  onChange,
  onRun,
  runStatus,
}: {
  active: ActivityView;
  onChange: (v: ActivityView) => void;
  onRun: () => void;
  runStatus: 'idle' | 'running' | 'done' | 'error';
}) {
  const items: { id: ActivityView; icon: any; label: string }[] = [
    { id: 'explorer', icon: FileCode, label: 'Explorer' },
    { id: 'config', icon: Settings2, label: 'Language Config' },
  ];
  return (
    <div className="flex w-12 flex-col items-center bg-[#333333] py-1">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            title={item.label}
            onClick={() => onChange(item.id)}
            className={`relative flex h-12 w-12 items-center justify-center ${
              isActive ? 'text-[#ffffff]' : 'text-[#858585] hover:text-[#ffffff]'
            }`}
          >
            {isActive && <span className="absolute left-0 h-full w-0.5 bg-[#ffffff]" />}
            <Icon className="h-6 w-6" />
          </button>
        );
      })}
      <div className="flex-1" />
      <button
        title="Run (compile + execute)"
        onClick={onRun}
        className="flex h-12 w-12 items-center justify-center text-[#858585] hover:text-[#ffffff]"
      >
        {runStatus === 'running' ? (
          <Circle className="h-6 w-6 animate-pulse text-[#dcdcaa]" />
        ) : runStatus === 'error' ? (
          <XCircle className="h-6 w-6 text-[#f48771]" />
        ) : runStatus === 'done' ? (
          <CheckCircle2 className="h-6 w-6 text-[#89d185]" />
        ) : (
          <Play className="h-6 w-6" />
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side bar
// ---------------------------------------------------------------------------

function SideBar({ view, lang, config }: { view: ActivityView; lang: LanguageDef; config: PlmConfig }) {
  const defaultImports = (config as any).defaultImports as string[] | undefined;
  return (
    <div className="w-64 overflow-hidden bg-[#252526]">
      <div className="flex h-9 items-center px-4 text-[11px] font-semibold uppercase tracking-wide text-[#bbbbbb]">
        {view === 'explorer' ? 'Explorer' : 'Config'}
      </div>
      <div className="vsc-scroll h-[calc(100%-2.25rem)] overflow-auto py-1">
        <div className="px-4 py-1 text-[11px] font-semibold uppercase text-[#bbbbbb]">
          Language
        </div>
        <div className="px-4 py-1 text-[13px] text-[#ffffff]">{lang.name}</div>
        <div className="px-4 text-[11px] text-[#858585]">.{lang.extension} files</div>
        <div className="px-4 py-2 text-[11px] text-[#858585]">{lang.description}</div>

        <div className="mt-2 px-4 py-1 text-[11px] font-semibold uppercase text-[#bbbbbb]">
          Quick stats
        </div>
        <div className="px-4 space-y-1 text-[11px] text-[#858585]">
          <div>Tokens: {config.lexer.tokens.length}</div>
          <div>Keywords: {Object.keys(config.lexer.keywords ?? {}).length}</div>
          <div>Grammar rules: {Object.keys(config.grammar.rules).length}</div>
          <div>Codegen templates: {config.codegen.templates.length}</div>
        </div>

        {defaultImports && defaultImports.length > 0 && (
          <>
            <div className="mt-4 px-4 py-1 text-[11px] font-semibold uppercase text-[#bbbbbb]">
              Default packages
            </div>
            <div className="px-4 space-y-1 text-[11px] text-[#858585]">
              {defaultImports.map((p) => (
                <div key={p} className="flex items-center gap-1">
                  <span className="text-[#569cd6]">●</span> {p}
                </div>
              ))}
            </div>
          </>
        )}

        {view === 'config' && (
          <div className="mt-4 px-4 py-2 text-[12px] text-[#cccccc]">
            Edit language settings visually in the panel below, or switch to the JSON tab in the editor.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor tabs
// ---------------------------------------------------------------------------

function EditorTabs({
  activeTab,
  onTabChange,
  activeFileName,
  languageName,
}: {
  activeTab: EditorTab;
  onTabChange: (t: EditorTab) => void;
  activeFileName: string;
  languageName: string;
}) {
  return (
    <div className="flex h-9 items-center border-b border-[#252526] bg-[#252526]">
      <Tab active={activeTab === 'source'} onClick={() => onTabChange('source')}>
        <FileCode className="mr-1.5 h-3.5 w-3.5 text-[#519aba]" />
        {activeFileName}
      </Tab>
      <Tab active={activeTab === 'configJson'} onClick={() => onTabChange('configJson')}>
        <Settings2 className="mr-1.5 h-3.5 w-3.5 text-[#858585]" />
        {languageName.toLowerCase()}.plm.json
      </Tab>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-full items-center px-3 text-[12px] ${
        active
          ? 'border-t-2 border-[#007acc] bg-[#1e1e1e] text-[#ffffff]'
          : 'bg-[#2d2d2d] text-[#858585] hover:bg-[#252526]'
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Config JSON editor
// ---------------------------------------------------------------------------

function ConfigJsonEditor({ value, onChange, error }: { value: string; onChange: (v: string) => void; error: string | null }) {
  return (
    <div className="flex h-full flex-col bg-[#1e1e1e]">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="vsc-scroll flex-1 resize-none overflow-auto bg-[#1e1e1e] p-3 font-mono text-[12px] leading-[18px] text-[#d4d4d4] outline-none"
      />
      {error && (
        <div className="border-t border-[#5a1d1d] bg-[#5a1d1d]/30 px-3 py-2 text-[12px] text-[#f48771]">
          JSON parse error: {error}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel tabs
// ---------------------------------------------------------------------------

function PanelTabs({
  active,
  onChange,
  onCollapse,
  runStatus,
  hasBytecode,
  hasAst,
  hasTokens,
}: {
  active: PanelTab;
  onChange: (t: PanelTab) => void;
  onCollapse: () => void;
  runStatus: 'idle' | 'running' | 'done' | 'error';
  hasBytecode: boolean;
  hasAst: boolean;
  hasTokens: boolean;
}) {
  const tabs: { id: PanelTab; label: string; icon: any; enabled: boolean }[] = [
    { id: 'terminal', label: 'Terminal', icon: TerminalSquare, enabled: true },
    { id: 'bytecode', label: 'Bytecode', icon: Binary, enabled: hasBytecode },
    { id: 'ast', label: 'AST', icon: GitBranch, enabled: hasAst },
    { id: 'tokens', label: 'Tokens', icon: Hash, enabled: hasTokens },
  ];
  return (
    <div className="flex h-9 items-center justify-between border-b border-[#252526] bg-[#252526] pr-2">
      <div className="flex h-full overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => t.enabled && onChange(t.id)}
              disabled={!t.enabled}
              className={`flex h-full shrink-0 items-center gap-1.5 px-3 text-[11px] uppercase tracking-wide ${
                isActive
                  ? 'border-b-2 border-[#007acc] text-[#ffffff]'
                  : t.enabled
                    ? 'text-[#858585] hover:text-[#cccccc]'
                    : 'cursor-not-allowed text-[#5a5a5a]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>
      <button title="Collapse panel" onClick={onCollapse} className="rounded p-1 text-[#858585] hover:text-[#cccccc]">
        <ChevronRight className="h-3.5 w-3.5 rotate-90" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile layout
// ---------------------------------------------------------------------------

function MobileLayout(props: {
  lang: LanguageDef;
  langId: string;
  onLangChange: (id: string) => void;
  source: string;
  onSourceChange: (v: string) => void;
  config: PlmConfig;
  onConfigChange: (c: PlmConfig) => void;
  configJsonText: string;
  onConfigJsonChange: (v: string) => void;
  configJsonError: string | null;
  editorTab: EditorTab;
  onEditorTabChange: (t: EditorTab) => void;
  mobileView: MobileView;
  onMobileViewChange: (v: MobileView) => void;
  onRun: () => void;
  runStatus: 'idle' | 'running' | 'done' | 'error';
  output: string;
  runError: string | null;
  panelTab: PanelTab;
  onPanelTabChange: (t: PanelTab) => void;
  compileResult: ReturnType<typeof compileSource> | null;
  vmResult: ReturnType<typeof runModule> | null;
  stats: { lines: number; chars: number };
}) {
  const {
    lang, langId, onLangChange, source, onSourceChange, config, onConfigChange,
    configJsonText, onConfigJsonChange, configJsonError, editorTab, onEditorTabChange,
    mobileView, onMobileViewChange, onRun, runStatus, output, runError,
    panelTab, onPanelTabChange, compileResult,
  } = props;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#1e1e1e] text-[#cccccc]">
      {/* Mobile header */}
      <div className="flex h-10 items-center justify-between bg-[#3c3c3c] px-3">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-[#007acc]" />
          <span className="text-[13px] font-semibold text-[#ffffff]">PLM</span>
        </div>
        <LanguageSelector langId={langId} onChange={onLangChange} />
        <button
          onClick={onRun}
          className="flex h-8 w-8 items-center justify-center rounded bg-[#0e639c] text-[#ffffff]"
        >
          {runStatus === 'running' ? (
            <Circle className="h-4 w-4 animate-pulse" />
          ) : runStatus === 'error' ? (
            <XCircle className="h-4 w-4" />
          ) : runStatus === 'done' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Editor tabs */}
      <div className="flex h-8 border-b border-[#252526] bg-[#252526]">
        <Tab active={editorTab === 'source'} onClick={() => onEditorTabChange('source')}>
          <FileCode className="mr-1 h-3 w-3 text-[#519aba]" />
          main.{lang.extension}
        </Tab>
        <Tab active={editorTab === 'configJson'} onClick={() => onEditorTabChange('configJson')}>
          <Settings2 className="mr-1 h-3 w-3 text-[#858585]" />
          config.json
        </Tab>
      </div>

      {/* Content area — full height */}
      <div className="min-h-0 flex-1">
        {mobileView === 'editor' && (
          <>
            {editorTab === 'source' ? (
              <CodeEditor value={source} onChange={onSourceChange} config={config} />
            ) : (
              <ConfigJsonEditor value={configJsonText} onChange={onConfigJsonChange} error={configJsonError} />
            )}
          </>
        )}
        {mobileView === 'output' && (
          <div className="flex h-full flex-col">
            {/* Panel tabs */}
            <div className="flex h-8 items-center border-b border-[#252526] bg-[#252526] overflow-x-auto">
              {([
                { id: 'terminal' as const, label: 'Terminal', icon: TerminalSquare, enabled: true },
                { id: 'bytecode' as const, label: 'Bytecode', icon: Binary, enabled: !!compileResult?.compile },
                { id: 'ast' as const, label: 'AST', icon: GitBranch, enabled: !!compileResult?.ast },
                { id: 'tokens' as const, label: 'Tokens', icon: Hash, enabled: !!compileResult?.tokens },
              ]).map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => t.enabled && onPanelTabChange(t.id)}
                    disabled={!t.enabled}
                    className={`flex h-full shrink-0 items-center gap-1 px-3 text-[10px] uppercase ${
                      panelTab === t.id
                        ? 'border-b-2 border-[#007acc] text-[#ffffff]'
                        : t.enabled
                          ? 'text-[#858585]'
                          : 'text-[#5a5a5a]'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {t.label}
                  </button>
                );
              })}
            </div>
            <div className="min-h-0 flex-1">
              {panelTab === 'terminal' && <Terminal output={output} error={runError} status={runStatus} />}
              {panelTab === 'bytecode' && <BytecodeView result={compileResult?.compile ?? null} />}
              {panelTab === 'ast' && <AstView ast={compileResult?.ast ?? null} />}
              {panelTab === 'tokens' && <TokensView tokens={compileResult?.tokens ?? null} />}
            </div>
          </div>
        )}
        {mobileView === 'config' && (
          <ConfigGenerator config={config} onChange={onConfigChange} />
        )}
      </div>

      {/* Bottom navigation */}
      <div className="flex h-12 items-center justify-around border-t border-[#3c3c3c] bg-[#252526]">
        <MobileNavButton active={mobileView === 'editor'} onClick={() => onMobileViewChange('editor')} icon={FileCode} label="Editor" />
        <MobileNavButton active={mobileView === 'output'} onClick={() => onMobileViewChange('output')} icon={TerminalSquare} label="Output" />
        <MobileNavButton active={mobileView === 'config'} onClick={() => onMobileViewChange('config')} icon={Settings2} label="Config" />
      </div>
    </div>
  );
}

function MobileNavButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 ${
        active ? 'text-[#007acc]' : 'text-[#858585]'
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px]">{label}</span>
    </button>
  );
}
