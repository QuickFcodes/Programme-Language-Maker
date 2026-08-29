'use client';

interface TerminalProps {
  output: string;
  error: string | null;
  status: 'idle' | 'running' | 'done' | 'error';
}

/**
 * VSCode-style terminal panel. Shows program output (stdout) in green-ish
 * text, errors in red. Also shows a fake prompt line at the bottom for
 * aesthetics.
 */
export function Terminal({ output, error, status }: TerminalProps) {
  const lines = output.split('\n');
  // Remove trailing empty line if present.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  return (
    <div className="vsc-scroll h-full overflow-auto bg-[#1e1e1e] p-3 font-mono text-[12px] leading-[18px]">
      {status === 'idle' && lines.length === 0 && !error && (
        <div className="text-[#858585]">
          PLM Terminal — write some code and click Run.
        </div>
      )}
      {status === 'running' && (
        <div className="text-[#dcdcaa]">Running...</div>
      )}
      {lines.map((line, i) => (
        <div key={i} className="text-[#cccccc]">
          {line === '' ? '\u00a0' : line}
        </div>
      ))}
      {error && (
        <div className="mt-2 border-t border-[#5a1d1d] pt-2 text-[#f48771]">
          {error}
        </div>
      )}
      <div className="mt-1 flex items-center">
        <span className="text-[#569cd6]">PLM</span>
        <span className="text-[#cccccc]">&gt;&nbsp;</span>
        <span className="text-[#858585]">_</span>
      </div>
    </div>
  );
}
