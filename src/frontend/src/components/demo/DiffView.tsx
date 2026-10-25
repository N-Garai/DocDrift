"use client";

import { useMemo, useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * Minimal unified-diff renderer: colors +/-/@@ lines and shows the
 * target file header. Handles the patches emitted by the engine.
 */
export function DiffView({ diff }: { diff: string }) {
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => diff.split("\n"), [diff]);
  const hasContent = diff.trim().length > 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(diff);
      setCopied(true);
      toast.success("Patch copied to clipboard");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Clipboard unavailable in this browser");
    }
  }

  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <p className="font-mono text-[11px] text-fog">suggested patch · unified diff</p>
        {(hasContent ? (
          <button
            onClick={copy}
            className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-fog transition-colors hover:border-drift-ember/40 hover:text-mist"
            aria-label="Copy patch to clipboard"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-drift-mint" /> copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> copy
              </>
            )}
          </button>
        ) : null)}
      </div>

      {hasContent ? (
        <div className="scroll-thin max-h-[420px] overflow-auto">
        <table className="w-full border-collapse font-mono text-[12px] leading-[1.7]">
          <tbody>
            {lines.map((line, i) => {
              const kind = line.startsWith("+++") || line.startsWith("---")
                ? "file"
                : line.startsWith("@@")
                  ? "hunk"
                  : line.startsWith("+")
                    ? "add"
                    : line.startsWith("-")
                      ? "del"
                      : "ctx";
              const cls =
                kind === "add"
                  ? "bg-drift-mint/[0.08] text-drift-mint"
                  : kind === "del"
                    ? "bg-[#ff5470]/[0.08] text-[#ff8fa3]"
                    : kind === "hunk"
                      ? "bg-drift-amber/[0.07] text-drift-amber"
                      : kind === "file"
                        ? "text-mist font-semibold"
                        : "text-fog/85";
              return (
                <tr key={i} className={cls}>
                  <td className="w-8 select-none px-2 text-right align-top text-[10px] text-fog/30">
                    {i + 1}
                  </td>
                  <td className="whitespace-pre-wrap break-all px-3 align-top">
                    {line || "\u00A0"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      ) : (
        <p className="px-4 py-6 font-mono text-[11.5px] leading-relaxed text-fog/70">
          no patch rendered — the engine drafted no direct edits for these findings.
        </p>
      )}
    </div>
  );
}
