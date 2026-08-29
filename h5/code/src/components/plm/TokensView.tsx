'use client';

interface TokensViewProps {
  tokens: { type: string; text: string; line: number; col: number; value?: any }[] | null;
}

const TOKEN_COLORS: Record<string, string> = {
  NUMBER: 'text-[#b5cea8]',
  STRING: 'text-[#ce9178]',
  IDENT: 'text-[#9cdcfe]',
};

/**
 * Display the raw token stream from the lexer.
 */
export function TokensView({ tokens }: TokensViewProps) {
  if (!tokens || tokens.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-[#858585]">
        No tokens yet.
      </div>
    );
  }
  return (
    <div className="vsc-scroll h-full overflow-auto bg-[#1e1e1e] p-3 font-mono text-[12px] leading-[18px]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[#3c3c3c] text-left text-[#858585]">
            <th className="py-1 pr-3 font-normal">TYPE</th>
            <th className="py-1 pr-3 font-normal">LINE</th>
            <th className="py-1 pr-3 font-normal">COL</th>
            <th className="py-1 pr-3 font-normal">TEXT</th>
            <th className="py-1 font-normal">VALUE</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t, i) => (
            <tr key={i} className="hover:bg-[#2a2d2e]">
              <td className={`py-0.5 pr-3 ${TOKEN_COLORS[t.type] ?? 'text-[#569cd6]'}`}>
                {t.type}
              </td>
              <td className="py-0.5 pr-3 text-[#858585]">{t.line}</td>
              <td className="py-0.5 pr-3 text-[#858585]">{t.col}</td>
              <td className="py-0.5 pr-3 text-[#cccccc]">{JSON.stringify(t.text)}</td>
              <td className="py-0.5 text-[#858585]">
                {t.value !== undefined ? JSON.stringify(t.value) : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
