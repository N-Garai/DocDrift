"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";
import { GitPullRequest, FileDiff, Bot, CheckCircle2 } from "lucide-react";

/**
 * Layered 3D scene: three "product artifact" cards floating in perspective
 * space with pointer parallax. Depths create a zentry-style parallax stack.
 */
export function FloatingCards() {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 18 });
  const sy = useSpring(my, { stiffness: 60, damping: 18 });

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (!fine) return;
    const move = (e: PointerEvent) => {
      mx.set((e.clientX / window.innerWidth - 0.5) * 2);
      my.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [mx, my]);

  // depth layers
  const l1x = useTransform(sx, [-1, 1], [14, -14]);
  const l1y = useTransform(sy, [-1, 1], [10, -10]);
  const l2x = useTransform(sx, [-1, 1], [-22, 22]);
  const l2y = useTransform(sy, [-1, 1], [-14, 14]);
  const l3x = useTransform(sx, [-1, 1], [30, -30]);
  const l3y = useTransform(sy, [-1, 1], [18, -18]);
  const rotY = useTransform(sx, [-1, 1], [7, -7]);
  const rotX = useTransform(sy, [-1, 1], [-5, 5]);

  return (
    <div className="relative mx-auto h-[380px] w-full max-w-[560px] select-none sm:h-[440px]" style={{ perspective: 1200 }}>
      <motion.div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[300px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[28px] bg-drift-ember/[0.05] blur-2xl"
        style={{ x: l3x, y: l3y }}
      />

      {/* Card 1 — drift detection diff */}
      <motion.div
        className="absolute left-[2%] top-[6%] w-[248px] sm:w-[280px]"
        style={{ x: l1x, y: l1y, rotateY: rotY, rotateX: rotX, transformStyle: "preserve-3d" }}
        initial={{ opacity: 0, y: 60, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 2.6, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="glass animate-float-slow rounded-2xl p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]">
          <div className="mb-3 flex items-center gap-2 font-mono text-[11px] text-fog">
            <FileDiff className="h-3.5 w-3.5 text-drift-ember" />
            drift detected · config.ts
          </div>
          <div className="space-y-1 font-mono text-[12px] leading-relaxed">
            <div className="rounded-md bg-[#ff5470]/10 px-2.5 py-1 text-[#ff8fa3] line-through decoration-[#ff5470]/50">
              - PORT=3000
            </div>
            <div className="rounded-md bg-drift-mint/10 px-2.5 py-1 text-drift-mint">
              + PORT=8080
            </div>
            <div className="rounded-md bg-[#ff5470]/10 px-2.5 py-1 text-[#ff8fa3] line-through decoration-[#ff5470]/50">
              - # ENABLE_CACHE=…
            </div>
            <div className="rounded-md bg-drift-mint/10 px-2.5 py-1 text-drift-mint">
              + ENABLE_CACHE=true
            </div>
          </div>
        </div>
      </motion.div>

      {/* Card 2 — agent run log */}
      <motion.div
        className="absolute right-[0%] top-[30%] w-[252px] sm:w-[288px]"
        style={{ x: l2x, y: l2y, rotateY: rotY, rotateX: rotX, transformStyle: "preserve-3d" }}
        initial={{ opacity: 0, y: 60, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 2.85, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="glass animate-float-slower rounded-2xl p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]">
          <div className="mb-3 flex items-center gap-2 font-mono text-[11px] text-fog">
            <Bot className="h-3.5 w-3.5 text-drift-amber" />
            mastra · doc-drift workflow
          </div>
          <div className="space-y-1.5 font-mono text-[11.5px] text-fog">
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-drift-mint" />
              extractor: 24 symbols · 2ms
            </p>
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-drift-mint" />
              matcher: 6 stale doc targets
            </p>
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-drift-mint" />
              validators: 2/2 gates passed
            </p>
            <p className="flex items-center gap-2 text-drift-ember">
              <span className="inline-block h-3 w-[7px] animate-blink bg-drift-ember/80" />
              drafting patch …
            </p>
          </div>
        </div>
      </motion.div>

      {/* Card 3 — PR ready */}
      <motion.div
        className="absolute bottom-[2%] left-[16%] w-[252px] sm:w-[292px]"
        style={{ x: l3x, y: l3y, rotateY: rotY, rotateX: rotX, transformStyle: "preserve-3d" }}
        initial={{ opacity: 0, y: 60, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 3.1, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="glass animate-float-slow rounded-2xl p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]" style={{ animationDelay: "-3s" }}>
          <div className="mb-3 flex items-center gap-2 font-mono text-[11px] text-fog">
            <GitPullRequest className="h-3.5 w-3.5 text-drift-mint" />
            pull request drafted
          </div>
          <p className="font-mono text-[12px] text-mist">
            docs: sync setup guide with config.ts
          </p>
          <p className="mt-1.5 font-mono text-[11px] text-fog">
            3 files · +12 −7 · reviewed by validators
          </p>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-ink-700">
            <motion.div
              className="h-full w-2/3 rounded-full bg-gradient-to-r from-drift-mint to-drift-ember"
              initial={{ width: "12%" }}
              animate={{ width: "88%" }}
              transition={{ delay: 3.8, duration: 1.4, ease: "easeInOut" }}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
