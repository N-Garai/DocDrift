"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { SplitChars } from "@/components/fx/SplitText";
import { bootSkipped, markBooted } from "@/lib/boot";

const BOOT_LINES = [
  "loading tree-sitter grammars …",
  "parsing working tree (AST) …",
  "waking the agent orchestrator …",
  "doc diff engine ready.",
];

type Phase = "run" | "exit" | "gone";

/**
 * Boot screen: brand reveal + honest boot log + progress bar,
 * exits with a clip-path wipe. Skipped when reduced motion is preferred.
 */
export function Preloader({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("run");
  const [progress, setProgress] = useState(0);
  const [lineIdx, setLineIdx] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Reduced motion, or the boot log already ran this session → skip it.
    // The exit is near-instant so the hero choreography (delayed to match)
    // still lands without a visible blank screen.
    if (
      bootSkipped ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const t1 = setTimeout(() => setPhase("exit"), 120);
      return () => clearTimeout(t1);
    }

    let p = 0;
    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    const tick = setInterval(() => {
      // ease towards 100 with varied increments (feels like real work)
      p = Math.min(100, p + (p < 62 ? 9 : p < 86 ? 6 : 12) + Math.random() * 5);
      setProgress(p);
      setLineIdx(
        Math.min(BOOT_LINES.length - 1, Math.floor((p / 100) * BOOT_LINES.length))
      );
      if (p >= 100) {
        clearInterval(tick);
        markBooted();
        exitTimer = setTimeout(() => setPhase("exit"), 320);
      }
    }, 95);

    return () => {
      clearInterval(tick);
      if (exitTimer) clearTimeout(exitTimer);
    };
  }, []);

  useEffect(() => {
    if (phase !== "exit") return;
    const t = setTimeout(() => {
      setPhase("gone");
      onDone();
    }, 620);
    return () => clearTimeout(t);
  }, [phase, onDone]);

  return (
    <AnimatePresence>
      {phase !== "gone" && (
        <motion.div
          key="preloader"
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-ink-950"
          initial={{ clipPath: "inset(0 0 0% 0)" }}
          animate={
            phase === "exit"
              ? { clipPath: "inset(0 0 100% 0)" }
              : { clipPath: "inset(0 0 0% 0)" }
          }
          transition={{ duration: 0.72, ease: [0.76, 0, 0.24, 1] }}
        >
          <div className="pointer-events-none absolute inset-0 grid-overlay" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-drift-ember/[0.08] blur-[110px]" />

          <div className="relative flex flex-col items-center gap-8 px-6">
            <div className="flex items-center gap-3">
              <GlyphMark />
              <SplitChars
                text="DocDrift"
                className="font-display text-5xl uppercase tracking-[0.08em] text-mist sm:text-6xl"
                stagger={0.05}
              />
            </div>

            <div className="w-[min(78vw,380px)]">
              <div className="h-[3px] w-full overflow-hidden rounded-full bg-ink-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-drift-ember via-drift-amber to-drift-mint transition-[width] duration-150 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between font-mono text-[11px] text-fog">
                <motion.span
                  key={lineIdx}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {BOOT_LINES[lineIdx]}
                </motion.span>
                <span className="text-drift-ember">{Math.round(progress)}%</span>
              </div>
            </div>

            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-fog/60">
              open-source ai · zero cloud · zero cost
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function GlyphMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <rect x="2" y="2" width="44" height="44" rx="12" className="fill-ink-800 stroke-drift-ember/40" strokeWidth="1.5" />
      <path d="M15 16h13M15 24h18M15 32h10" stroke="#a39d92" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M33 30c3.2 0 5.5-2 5.5-5" stroke="#ff5a1f" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M36.5 27.5 38.8 25l2 2.8" stroke="#ff5a1f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="38.5" cy="33.5" r="2.2" className="fill-drift-mint animate-pulse-dot" />
    </svg>
  );
}
