'use client';

import { PlmConfig, TokenRule } from '@/lib/plm/config';
import { useState } from 'react';

interface ConfigGeneratorProps {
  config: PlmConfig;
  onChange: (cfg: PlmConfig) => void;
}

/**
 * Graphical editor for PLM language configs.
 *
 * Lets the user:
 *   - Edit language metadata (name, version, extension, description)
 *   - Add / edit / remove token rules (with all four kinds)
 *   - Add / edit / remove keywords
 *   - Edit comment and whitespace settings
 *   - View grammar rules (read-only for now — grammar editing is too complex
 *     for a simple form; users can edit the JSON directly)
 *   - View codegen templates (read-only)
 *
 * The form is rendered as a multi-section card grid, similar to VSCode's
 * Settings UI but adapted for PLM.
 */
export function ConfigGenerator({ config, onChange }: ConfigGeneratorProps) {
  const update = (patch: Partial<PlmConfig>) => {
    onChange({ ...config, ...patch });
  };

  return (
    <div className="vsc-scroll h-full overflow-auto bg-[#1e1e1e] p-4 text-[13px] text-[#cccccc]">
      <div className="mx-auto max-w-4xl space-y-6">
        <h2 className="text-base font-semibold text-[#ffffff]">
          Language configuration
        </h2>
        <p className="text-[12px] text-[#858585]">
          Edit your PLM config visually. Changes apply immediately to the editor and compiler.
        </p>

        {/* Language metadata */}
        <Section title="Language metadata">
          <Field label="Name">
            <input
              className={inputCls}
              value={config.language.name}
              onChange={(e) => update({ language: { ...config.language, name: e.target.value } })}
            />
          </Field>
          <Field label="Version">
            <input
              className={inputCls}
              value={config.language.version ?? ''}
              onChange={(e) => update({ language: { ...config.language, version: e.target.value } })}
            />
          </Field>
          <Field label="File extension">
            <input
              className={inputCls}
              value={config.language.fileExtension ?? ''}
              onChange={(e) => update({ language: { ...config.language, fileExtension: e.target.value } })}
            />
          </Field>
          <Field label="Description" full>
            <input
              className={inputCls}
              value={config.language.description ?? ''}
              onChange={(e) => update({ language: { ...config.language, description: e.target.value } })}
            />
          </Field>
        </Section>

        {/* Lexer: whitespace + comments */}
        <Section title="Whitespace and comments">
          <Field label="Whitespace chars" full>
            <input
              className={inputCls}
              placeholder="e.g. space, tab, newline"
              value={(config.lexer.whitespace as string[] | undefined)?.join(', ') ?? ''}
              onChange={(e) => {
                const chars = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                update({ lexer: { ...config.lexer, whitespace: chars } });
              }}
            />
          </Field>
          <Field label="Line comment">
            <input
              className={inputCls}
              placeholder="e.g. //"
              value={config.lexer.comments?.line ?? ''}
              onChange={(e) => update({ lexer: { ...config.lexer, comments: { ...config.lexer.comments, line: e.target.value } } })}
            />
          </Field>
          <Field label="Block comment start">
            <input
              className={inputCls}
              placeholder="e.g. /*"
              value={config.lexer.comments?.blockStart ?? ''}
              onChange={(e) => update({ lexer: { ...config.lexer, comments: { ...config.lexer.comments, blockStart: e.target.value } } })}
            />
          </Field>
          <Field label="Block comment end">
            <input
              className={inputCls}
              placeholder="e.g. */"
              value={config.lexer.comments?.blockEnd ?? ''}
              onChange={(e) => update({ lexer: { ...config.lexer, comments: { ...config.lexer.comments, blockEnd: e.target.value } } })}
            />
          </Field>
        </Section>

        {/* Token rules */}
        <Section title={`Token rules (${config.lexer.tokens.length})`}>
          <div className="col-span-2 space-y-2">
            {config.lexer.tokens.map((t, i) => (
              <TokenRuleEditor
                key={i}
                rule={t}
                onChange={(newRule) => {
                  const tokens = [...config.lexer.tokens];
                  tokens[i] = newRule;
                  update({ lexer: { ...config.lexer, tokens } });
                }}
                onDelete={() => {
                  const tokens = config.lexer.tokens.filter((_, j) => j !== i);
                  update({ lexer: { ...config.lexer, tokens } });
                }}
              />
            ))}
            <button
              className="mt-2 rounded border border-[#3c3c3c] bg-[#2d2d2d] px-3 py-1 text-[12px] text-[#cccccc] hover:bg-[#37373d]"
              onClick={() => {
                const tokens = [...config.lexer.tokens];
                tokens.push({ name: 'NEW_TOKEN', kind: 'literal', literal: '' });
                update({ lexer: { ...config.lexer, tokens } });
              }}
            >
              + Add token rule
            </button>
          </div>
        </Section>

        {/* Keywords */}
        <Section title={`Keywords (${Object.keys(config.lexer.keywords ?? {}).length})`}>
          <div className="col-span-2 space-y-1">
            {Object.entries(config.lexer.keywords ?? {}).map(([word, type]) => (
              <div key={word} className="flex items-center gap-2">
                <input
                  className={`${inputCls} flex-1`}
                  value={word}
                  onChange={(e) => {
                    const keywords = { ...config.lexer.keywords };
                    delete keywords[word];
                    keywords[e.target.value] = type;
                    update({ lexer: { ...config.lexer, keywords } });
                  }}
                />
                <span className="text-[#858585]">→</span>
                <input
                  className={`${inputCls} flex-1`}
                  value={type as string}
                  onChange={(e) => {
                    const keywords = { ...config.lexer.keywords };
                    keywords[word] = e.target.value;
                    update({ lexer: { ...config.lexer, keywords } });
                  }}
                />
                <button
                  className="rounded px-2 py-1 text-[#f48771] hover:bg-[#5a1d1d]"
                  onClick={() => {
                    const keywords = { ...config.lexer.keywords };
                    delete keywords[word];
                    update({ lexer: { ...config.lexer, keywords } });
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              className="mt-2 rounded border border-[#3c3c3c] bg-[#2d2d2d] px-3 py-1 text-[12px] text-[#cccccc] hover:bg-[#37373d]"
              onClick={() => {
                const keywords = { ...config.lexer.keywords };
                keywords['newkw'] = 'NEW_KW';
                update({ lexer: { ...config.lexer, keywords } });
              }}
            >
              + Add keyword
            </button>
          </div>
        </Section>

        {/* Grammar rules — read-only summary */}
        <Section title={`Grammar rules (${Object.keys(config.grammar.rules).length})`}>
          <div className="col-span-2 max-h-60 overflow-auto rounded border border-[#3c3c3c] bg-[#252526] p-2 font-mono text-[11px]">
            <div className="text-[#858585]">
              Start rule: <span className="text-[#dcdcaa]">{config.grammar.start}</span>
            </div>
            <div className="mt-1 space-y-0.5">
              {Object.keys(config.grammar.rules).map((name) => (
                <div key={name} className="text-[#9cdcfe]">
                  {name}
                  <span className="text-[#858585]"> = ...</span>
                </div>
              ))}
            </div>
          </div>
          <p className="col-span-2 text-[11px] text-[#858585]">
            Grammar rules are edited as JSON in the config file directly. The graphical editor focuses on the lexer for clarity.
          </p>
        </Section>

        {/* Codegen templates — read-only summary */}
        <Section title={`Codegen templates (${config.codegen.templates.length})`}>
          <div className="col-span-2 max-h-60 overflow-auto rounded border border-[#3c3c3c] bg-[#252526] p-2 font-mono text-[11px]">
            {config.codegen.templates.map((t) => (
              <div key={t.nodeType} className="text-[#4ec9b0]">
                {t.nodeType}
                <span className="text-[#858585]"> — {t.ops.length} ops</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

const inputCls =
  'rounded border border-[#3c3c3c] bg-[#3c3c3c] px-2 py-1 text-[12px] text-[#cccccc] outline-none focus:border-[#007acc]';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-[#3c3c3c] bg-[#252526] p-4">
      <h3 className="mb-3 text-[13px] font-semibold text-[#ffffff]">{title}</h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="mb-1 block text-[11px] uppercase text-[#858585]">
        {label}
      </label>
      {children}
    </div>
  );
}

function TokenRuleEditor({
  rule,
  onChange,
  onDelete,
}: {
  rule: TokenRule;
  onChange: (r: TokenRule) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const kindLabels: Record<string, string> = {
    literal: 'Literal',
    number: 'Number',
    string: 'String',
    ident: 'Identifier',
  };

  return (
    <div className="rounded border border-[#3c3c3c] bg-[#2d2d2d] p-2">
      <div className="flex items-center gap-2">
        <button
          className="text-[#858585] hover:text-[#cccccc]"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '▼' : '▶'}
        </button>
        <span className="font-mono text-[12px] text-[#569cd6]">{rule.name}</span>
        <span className="text-[11px] text-[#858585]">— {kindLabels[rule.kind]}</span>
        {rule.kind === 'literal' && rule.literal && (
          <span className="font-mono text-[12px] text-[#ce9178]">"{rule.literal}"</span>
        )}
        <button
          className="ml-auto rounded px-2 py-0.5 text-[11px] text-[#f48771] hover:bg-[#5a1d1d]"
          onClick={onDelete}
        >
          ✕
        </button>
      </div>
      {expanded && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[10px] uppercase text-[#858585]">Name</label>
            <input
              className={inputCls}
              value={rule.name}
              onChange={(e) => onChange({ ...rule, name: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase text-[#858585]">Kind</label>
            <select
              className={inputCls}
              value={rule.kind}
              onChange={(e) => onChange({ ...rule, kind: e.target.value as TokenRule['kind'] })}
            >
              <option value="literal">Literal</option>
              <option value="number">Number</option>
              <option value="string">String</option>
              <option value="ident">Identifier</option>
            </select>
          </div>
          {rule.kind === 'literal' && (
            <div className="col-span-2">
              <label className="mb-1 block text-[10px] uppercase text-[#858585]">Literal value</label>
              <input
                className={inputCls}
                value={rule.literal ?? ''}
                onChange={(e) => onChange({ ...rule, literal: e.target.value })}
              />
            </div>
          )}
          {rule.kind === 'number' && (
            <div>
              <label className="mb-1 block text-[10px] uppercase text-[#858585]">Digits char class</label>
              <input
                className={inputCls}
                value={Array.isArray(rule.digits) ? rule.digits.join(', ') : (rule.digits as string) ?? ''}
                onChange={(e) => {
                  const chars = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                  onChange({ ...rule, digits: chars });
                }}
              />
            </div>
          )}
          {rule.kind === 'string' && (
            <>
              <div>
                <label className="mb-1 block text-[10px] uppercase text-[#858585]">Start quote</label>
                <input
                  className={inputCls}
                  value={rule.startQuote ?? ''}
                  onChange={(e) => onChange({ ...rule, startQuote: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase text-[#858585]">End quote</label>
                <input
                  className={inputCls}
                  value={rule.endQuote ?? ''}
                  onChange={(e) => onChange({ ...rule, endQuote: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase text-[#858585]">Escape char</label>
                <input
                  className={inputCls}
                  value={rule.escape ?? ''}
                  onChange={(e) => onChange({ ...rule, escape: e.target.value })}
                />
              </div>
            </>
          )}
          {rule.kind === 'ident' && (
            <>
              <div>
                <label className="mb-1 block text-[10px] uppercase text-[#858585]">Start chars</label>
                <input
                  className={inputCls}
                  value={Array.isArray(rule.startChars) ? rule.startChars.join(', ') : (rule.startChars as string) ?? ''}
                  onChange={(e) => {
                    const chars = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                    onChange({ ...rule, startChars: chars });
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase text-[#858585]">Continue chars (optional)</label>
                <input
                  className={inputCls}
                  value={Array.isArray(rule.continueChars) ? rule.continueChars.join(', ') : (rule.continueChars as string) ?? ''}
                  onChange={(e) => {
                    const chars = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                    onChange({ ...rule, continueChars: chars });
                  }}
                />
              </div>
            </>
          )}
          <div className="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id={`ignore-${rule.name}`}
              checked={rule.ignore ?? false}
              onChange={(e) => onChange({ ...rule, ignore: e.target.checked })}
            />
            <label htmlFor={`ignore-${rule.name}`} className="text-[11px] text-[#cccccc]">
              Ignore (skip — e.g. for whitespace tokens)
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
