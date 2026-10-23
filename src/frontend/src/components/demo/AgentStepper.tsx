"use client";

import { AnimatePresence, motion } from "framer-motion";
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
      <AnimatePresence initial={false}>
        {shown.map((s, idx) => (
          <motion.li
            key={s.id + idx}
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="glass flex items-start gap-3.5 rounded-xl px-4 py-3"
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
          </motion.li>
        ))}
      </AnimatePresence>

      {running && visibleCount >= steps.length && (
        <motion.li
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-3.5 rounded-xl px-4 py-3 font-mono text-[12px] text-drift-ember"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          awaiting engine response …
        </motion.li>
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
