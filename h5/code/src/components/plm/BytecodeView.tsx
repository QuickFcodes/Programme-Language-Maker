'use client';

import { CompileResult } from '@/lib/plm/codegen';

interface BytecodeViewProps {
  result: CompileResult | null;
}

/**
 * Display disassembled bytecode, one function at a time.
 */
export function BytecodeView({ result }: BytecodeViewProps) {
  if (!result || result.disasm.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-[#858585]">
        No bytecode yet. Click <span className="mx-1 rounded bg-[#0e639c] px-2 py-0.5 text-[#ffffff]">Run</span> to compile.
      </div>
    );
  }
  return (
    <div className="vsc-scroll h-full overflow-auto bg-[#1e1e1e] p-3 font-mono text-[12px] leading-[18px]">
      {result.disasm.map((fn) => (
        <div key={fn.name} className="mb-6">
          <div className="mb-2 border-b border-[#3c3c3c] pb-1 text-[13px] text-[#dcdcaa]">
            function <span className="text-[#4ec9b0]">{fn.name}</span>
          </div>
          <pre className="m-0 whitespace-pre text-[#cccccc]">
            {fn.lines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </pre>
        </div>
      ))}
    </div>
  );
}
