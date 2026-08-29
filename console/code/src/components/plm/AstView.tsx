'use client';

import { AstNode } from '@/lib/plm/parser';

interface AstViewProps {
  ast: AstNode | null;
}

/**
 * Display the AST as an expandable tree.
 */
export function AstView({ ast }: AstViewProps) {
  if (!ast) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-[#858585]">
        No AST yet. Click <span className="mx-1 rounded bg-[#0e639c] px-2 py-0.5 text-[#ffffff]">Run</span> to parse.
      </div>
    );
  }
  return (
    <div className="vsc-scroll h-full overflow-auto bg-[#1e1e1e] p-3 font-mono text-[12px] leading-[18px]">
      <AstTreeNode node={ast} depth={0} />
    </div>
  );
}

function AstTreeNode({ node, depth }: { node: AstNode; depth: number }) {
  if (depth > 30) return <div>...</div>;

  // Unwrap wrapper nodes.
  if (
    node.type === '__seq__' ||
    node.type === '__list__' ||
    node.type === '__item__'
  ) {
    const items = node.fields?.__items__ ?? node.fields?.__children__;
    if (Array.isArray(items)) {
      return (
        <>
          {items.map((it: AstNode, i: number) => (
            <AstTreeNode key={i} node={it} depth={depth} />
          ))}
        </>
      );
    }
    if (node.fields?.item) {
      return <AstTreeNode node={node.fields.item} depth={depth} />;
    }
    if (node.fields?.__child__) {
      return <AstTreeNode node={node.fields.__child__} depth={depth} />;
    }
    return null;
  }

  const indent = '  '.repeat(depth);
  const fields = node.fields ?? {};
  const fieldEntries = Object.entries(fields).filter(
    ([k]) => !k.startsWith('__')
  );

  return (
    <div>
      <div>
        <span className="text-[#858585]">{indent}</span>
        <span className="text-[#dcdcaa]">{node.type}</span>
        {fieldEntries.length === 0 && (
          <span className="text-[#858585]">()</span>
        )}
      </div>
      {fieldEntries.length > 0 && (
        <div>
          {fieldEntries.map(([k, v]) => (
            <FieldView key={k} name={k} value={v} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldView({
  name,
  value,
  depth,
}: {
  name: string;
  value: any;
  depth: number;
}) {
  const indent = '  '.repeat(depth);
  if (Array.isArray(value)) {
    return (
      <div>
        <div>
          <span className="text-[#858585]">{indent}</span>
          <span className="text-[#9cdcfe]">{name}</span>
          <span className="text-[#858585]">: [{value.length}]</span>
        </div>
        {value.map((it, i) => (
          <AstTreeNode key={i} node={it} depth={depth + 1} />
        ))}
      </div>
    );
  }
  if (value && typeof value === 'object' && value.type) {
    return (
      <div>
        <div>
          <span className="text-[#858585]">{indent}</span>
          <span className="text-[#9cdcfe]">{name}</span>
          <span className="text-[#858585]">:</span>
        </div>
        <AstTreeNode node={value as AstNode} depth={depth + 1} />
      </div>
    );
  }
  // Primitive value
  const v =
    typeof value === 'string' ? (
      <span className="text-[#ce9178]">{JSON.stringify(value)}</span>
    ) : (
      <span className="text-[#b5cea8]">{String(value)}</span>
    );
  return (
    <div>
      <span className="text-[#858585]">{indent}</span>
      <span className="text-[#9cdcfe]">{name}</span>
      <span className="text-[#858585]">: </span>
      {v}
    </div>
  );
}
