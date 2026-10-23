"use client";

import { CheckCircle2, Loader2, MinusCircle, CircleDashed } from "lucide-react";
import type { StepTrace, StepStatus } from "@/lib/api";

export function AgentStepper({
  steps,
  visibleCount,
  running,
}: {
  steps: StepTrace[];
  visibleCount: number;
  running: boolean;
}) {
  const shown = steps.slice(0, visibleCount);

  return (
    <ol className="flex flex-col gap-2.5" aria-label="Agent workflow steps" aria-live="polite">
      {shown.map((s, idx) => (
          <li
            key={s.id + idx}
            className="animate-rise glass flex items-start gap-3.5 rounded-xl px-4 py-3"
            style={{ animationDelay: `${idx * 60}ms` }}
          >
            <StatusIcon status={s.status} spinning={running && idx === shown.length - 1} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-[13.5px] font-medium text-mist">{s.label}</p>
                <span className="font-mono text-[10.5px] text-fog/70">
                  {s.agent} · {s.ms}ms
                </span>
              </div>
              <p className="mt-0.5 font-mono text-[11px] leading-relaxed text-fog">
                {s.notes}
              </p>
            </div>
          </li>
        ))}

      {running && visibleCount >= steps.length && (
        <li
          className="animate-rise flex items-center gap-3.5 rounded-xl px-4 py-3 font-mono text-[12px] text-drift-ember"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          awaiting engine response …
        </li>
      )}
    </ol>
  );
}

function StatusIcon({ status, spinning }: { status: StepStatus; spinning: boolean }) {
  if (status === "ok")
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-drift-mint" />;
  if (status === "degraded")
    return <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#f7c948]" />;
  if (status === "fail")
    return <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#ff8fa3]" />;
  if (spinning)
    return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-drift-ember" />;
  return <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-fog/40" />;
}
