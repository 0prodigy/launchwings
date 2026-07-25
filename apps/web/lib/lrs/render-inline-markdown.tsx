// T4 — extracted from apps/web/components/audit-results-panel.tsx. Small
// inline-markdown renderer that handles `code` and **bold** spans without
// pulling in a markdown dep. Same migration plan as summarise-evidence:
// audit-results-panel can swap to consume this helper later.

import * as React from "react";

export function renderInlineMarkdown(s: string): React.ReactNode {
  const tokens: Array<{ type: "text" | "code" | "bold"; value: string }> = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) tokens.push({ type: "text", value: s.slice(last, m.index) });
    const tok = m[1]!;
    if (tok.startsWith("`")) tokens.push({ type: "code", value: tok.slice(1, -1) });
    else tokens.push({ type: "bold", value: tok.slice(2, -2) });
    last = m.index + tok.length;
  }
  if (last < s.length) tokens.push({ type: "text", value: s.slice(last) });
  return tokens.map((t, i) => {
    if (t.type === "code") {
      return (
        <code key={i} className="rounded bg-white/5 px-1 py-0.5 text-xs">
          {t.value}
        </code>
      );
    }
    if (t.type === "bold") return <strong key={i}>{t.value}</strong>;
    return <span key={i}>{t.value}</span>;
  });
}
