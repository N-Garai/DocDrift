"use client";

import { motion } from "framer-motion";
import { ShieldCheck, ShieldAlert, FileCode2, BookOpenText } from "lucide-react";
import type { DriftFinding, Severity } from "@/lib/api";

const SEV_STYLE: Record<Severity, { chip: string; label: string }> = {
  critical: {
    chip: "border-[#ff5470]/40 bg-[#ff5470]/10 text-[#ff8fa3]",
    label: "critical",
  },
  major: {
    chip: "border-[#f7c948]/40 bg-[#f7c948]/10 text-[#f7d77f]",
    label: "major",
  },
  minor: {
    chip: "border-drift-ember/30 bg-drift-ember/10 text-drift-ember",
    label: "minor",
  },
};

export function DriftList({ drifts }: { drifts: DriftFinding[] }) {
  if (drifts.length === 0) {
    return (
      <p className="rounded-xl border border-drift-mint/30 bg-drift-mint/[0.06] px-4 py-3 font-mono text-[12px] text-drift-mint">
        no drift found — docs match the code. the sloth approves.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {drifts.map((d, i) => (
        <article
          key={d.id}
          className="animate-rise glass rounded-2xl p-4.5 p-5"
          style={{ animationDelay: `${i * 90}ms` }}
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`rounded-full border px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em] ${SEV_STYLE[d.severity].chip}`}
            >
              {SEV_STYLE[d.severity].label}
            </span>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fog/70">
              {d.kind}
            </span>
            <span className="ml-auto flex items-center gap-1.5 font-mono text-[10.5px]">
              {d.verified ? (
                <>
                  <ShieldCheck className="h-3.5 w-3.5 text-drift-mint" />
                  <span className="text-drift-mint">verified</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-3.5 w-3.5 text-[#f7d77f]" />
                  <span className="text-[#f7d77f]">unverified</span>
                </>
              )}
            </span>
          </div>

          <p className="mt-2.5 text-[14px] leading-relaxed text-mist">
            <span className="font-mono text-drift-ember">{d.symbol}</span>
            <span className="text-fog"> — {d.message}</span>
          </p>

          <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
            <Evidence
              icon={<FileCode2 className="h-3 w-3 text-drift-ember" />}
              head={`code · ${d.codeEvidence.file}:${d.codeEvidence.line}`}
              snippet={d.codeEvidence.snippet}
              tone="add"
            />
            {d.docEvidence ? (
              <Evidence
                icon={<BookOpenText className="h-3 w-3 text-drift-amber" />}
                head={`docs · ${d.docEvidence.file}:${d.docEvidence.line}`}
                snippet={d.docEvidence.snippet}
                tone="del"
              />
            ) : (
              <Evidence
                icon={<BookOpenText className="h-3 w-3 text-fog" />}
                head="docs · not found"
                snippet="(no documentation target matched this symbol)"
                tone="mute"
              />
            )}
          </div>

          <p className="mt-3 border-l-2 border-drift-mint/40 pl-3 text-[12.5px] leading-relaxed text-fog">
            {d.suggestion}
          </p>
          {d.validatorNotes && (
            <p className="mt-1.5 pl-3 font-mono text-[10.5px] text-fog/60">
              validators: {d.validatorNotes}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

function Evidence({
  icon,
  head,
  snippet,
  tone,
}: {
  icon: React.ReactNode;
  head: string;
  snippet: string;
  tone: "add" | "del" | "mute";
}) {
  const color =
    tone === "add"
      ? "border-drift-mint/30 bg-drift-mint/[0.05]"
      : tone === "del"
        ? "border-[#ff5470]/30 bg-[#ff5470]/[0.05]"
        : "border-line bg-ink-800/60";
  return (
    <div className={`rounded-lg border ${color} px-3 py-2.5`}>
      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-fog/80">
        {icon}
        {head}
      </p>
      <p className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-mist/90">
        {snippet}
      </p>
    </div>
  );
}
