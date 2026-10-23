"use client";

import { useMemo } from "react";

function tokenize(line: string, lang: "typescript" | "python" | "md" | "env") {
  // lightweight, safe tokenization for display only
  const kw =
    lang === "python"
      ? /\b(class|def|import|from|return|True|False|None|str|int|bool|float)\b/g
      : lang === "md"
        ? /(#+|\||`)/g
        : /\b(export|const|function|interface|class|type|return|import|from|number|string|boolean)\b/g;
  return line.replace(/(\b(?:export|const|function|interface|class|type|def|import|from|return)\b)/g, "«$1»");
}

export function CodePane({
  path,
  label,
  content,
  lang,
  highlightLines = [],
  tone = "code",
  className,
  maxHeight = 380,
}: {
  path: string;
  label: string;
  content: string;
  lang: "typescript" | "python" | "md" | "env";
  highlightLines?: number[];
  tone?: "code" | "docs";
  className?: string;
  maxHeight?: number;
}) {
  const lines = useMemo(() => content.split("\n"), [content]);
  const hl = useMemo(() => new Set(highlightLines), [highlightLines]);

  return (
    <div className={`glass overflow-hidden rounded-2xl ${className ?? ""}`}>
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5470]/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#f7c948]/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-drift-mint/60" />
          </span>
          <span className="font-mono text-[11px] text-fog">{path}</span>
        </div>
        <span
          className={`rounded-full border px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em] ${
            tone === "docs"
              ? "border-drift-amber/30 bg-drift-amber/10 text-drift-amber"
              : "border-drift-ember/30 bg-drift-ember/10 text-drift-ember"
          }`}
        >
          {label}
        </span>
      </div>

      <div className="scroll-thin overflow-auto" style={{ maxHeight }}>
        <table className="w-full border-collapse font-mono text-[12px] leading-[1.75]">
          <tbody>
            {lines.map((line, i) => {
              const n = i + 1;
              const isHl = hl.has(n);
              return (
                <tr
                  key={n}
                  className={isHl ? "bg-drift-ember/[0.07]" : undefined}
                >
                  <td className="w-10 select-none border-r border-line/60 px-2 text-right align-top text-[10.5px] text-fog/40">
                    {n}
                  </td>
                  <td
                    className={`whitespace-pre px-3.5 align-top ${
                      isHl ? "text-mist" : "text-fog/90"
                    }`}
                  >
                    {tokenize(line, lang) || "\u00A0"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
