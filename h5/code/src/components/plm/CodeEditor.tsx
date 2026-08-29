'use client';

import { useRef, useEffect, useCallback } from 'react';
import { highlightSource, tokensToHtml } from './highlight';
import { PlmConfig } from '@/lib/plm/config';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  config: PlmConfig;
  /** Number of spaces to insert on Tab. Default 2. */
  tabSize?: number;
}

/**
 * A lightweight code editor with VSCode-style syntax highlighting.
 * Implementation: a transparent textarea overlaid on a highlight <pre>.
 * The two layers share scroll position and font metrics.
 */
export function CodeEditor({ value, onChange, config, tabSize = 2 }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    const pre = preRef.current;
    const ln = lineNumbersRef.current;
    if (!ta || !pre) return;
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
    if (ln) ln.scrollTop = ta.scrollTop;
  }, []);

  useEffect(() => {
    syncScroll();
  }, [value, syncScroll]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const spaces = ' '.repeat(tabSize);
      const newValue = value.slice(0, start) + spaces + value.slice(end);
      onChange(newValue);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + tabSize;
      });
    }
  };

  const tokens = highlightSource(value, config);
  const html = tokensToHtml(tokens);
  const lineCount = value.split('\n').length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-[#1e1e1e]">
      {/* Line numbers */}
      <div
        ref={lineNumbersRef}
        className="vsc-scroll select-none overflow-hidden py-2 pr-2 pl-2 text-right font-mono text-[11px] leading-[20px] text-[#858585] sm:text-[13px] sm:pl-4"
        style={{ minWidth: '40px' }}
        aria-hidden
      >
        <pre className="m-0 whitespace-pre">{lineNumbers}</pre>
      </div>

      {/* Highlighted code layer */}
      <pre
        ref={preRef}
        className="vsc-editor-highlight vsc-scroll absolute left-[40px] top-0 m-0 overflow-auto p-2 text-[11px] leading-[20px] text-[#d4d4d4] sm:left-[60px] sm:text-[13px] sm:pl-2"
        style={{ right: 0, bottom: 0 }}
        aria-hidden
        dangerouslySetInnerHTML={{ __html: html + '\n' }}
      />

      {/* Transparent textarea on top */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="vsc-editor-textarea absolute left-[40px] top-0 m-0 w-[calc(100%-40px)] overflow-auto p-2 text-[11px] leading-[20px] sm:left-[60px] sm:w-[calc(100%-60px)] sm:text-[13px] sm:pl-2"
        style={{
          right: 0,
          bottom: 0,
        }}
      />
    </div>
  );
}
