"use client";

import { motion } from "framer-motion";
import { ArrowDown, Github, Terminal } from "lucide-react";
import { SplitText } from "@/components/fx/SplitText";
import { Reveal } from "@/components/fx/Reveal";
import { heroDelay } from "@/lib/boot";
import { HeroCanvas } from "./HeroCanvas";
import { FloatingCards } from "./FloatingCards";
import { Marquee } from "./Marquee";

const MARQUEE_A = [
  "tree-sitter ast",
  "mastra agent workflow",
  "gemma open weights",
  "ollama local inference",
  "zero cloud calls",
  "$0 forever",
  "unified diffs",
  "validation gates",
];

export function Hero() {
  const d = heroDelay;
  return (
    <section id="top" className="relative overflow-hidden pt-28 sm:pt-36">
      <HeroCanvas className="absolute inset-0 h-full w-full opacity-70" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
          {/* copy */}
          <div className="flex flex-col items-start gap-7">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: d(1.45), duration: 0.7 }}
              className="inline-flex items-center gap-2.5 rounded-full border border-line bg-ink-800/60 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-fog backdrop-blur"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-drift-mint animate-pulse-dot" />
              local-first · open weights · zero cost
            </motion.div>

            <h1 className="font-display uppercase leading-[0.98] tracking-wide">
              <SplitText
                text="Your code drifted."
                className="block text-[13vw] text-mist sm:text-6xl lg:text-7xl xl:text-[5.2rem]"
                delay={d(1.6)}
              />
              <SplitText
                text="Your docs didn't have to."
                className="block text-[13vw] sm:text-6xl lg:text-7xl xl:text-[5.2rem]"
                delay={d(1.9)}
                wordClassName={(word) =>
                  ["drifted.", "docs"].includes(word.toLowerCase())
                    ? "gradient-anim bg-gradient-to-r from-drift-ember via-drift-amber to-drift-mint bg-clip-text text-transparent"
                    : undefined
                }
              />
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: d(2.2), duration: 0.8 }}
              className="max-w-xl text-base leading-relaxed text-fog sm:text-lg"
            >
              DocDrift is a background watcher that parses your working tree with
              tree-sitter, matches exported symbols against your README, guides
              and <span className="font-mono text-[0.92em] text-mist">.env.example</span> —
              then lets an open-source agent crew draft the documentation PR.
              Runs on your laptop. Costs nothing. Asks for zero API keys.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: d(2.4), duration: 0.8 }}
              className="flex flex-wrap items-center gap-3.5"
            >
              <a
                href="/studio"
                className="group inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-drift-ember to-drift-amber px-7 py-4 text-base font-semibold text-ink-950 shadow-[0_16px_44px_-14px_rgba(255,90,31,0.5)] transition-transform hover:scale-[1.03]"
              >
                <Terminal className="h-5 w-5" />
                Launch the Studio
              </a>
              <a
                href="#pipeline"
                className="inline-flex items-center gap-2.5 rounded-2xl border border-line bg-ink-800/50 px-7 py-4 text-base font-medium text-mist backdrop-blur transition-colors hover:border-drift-ember/40"
              >
                How the agents think
                <ArrowDown className="h-4 w-4" />
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: d(2.65), duration: 1 }}
              className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.18em] text-fog/70"
            >
              <span className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-drift-mint" /> no credit card
              </span>
              <span className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-drift-ember" /> offline-first
              </span>
              <span className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-drift-amber" /> MIT licensed
              </span>
              <span className="hidden items-center gap-2 sm:flex">
                <Github className="h-3.5 w-3.5" /> open by construction
              </span>
            </motion.div>
          </div>

          {/* 3D artifact stack */}
          <Reveal variant="scale" delay={d(1.7)} amount={0.1}>
            <FloatingCards />
          </Reveal>
        </div>
      </div>

      <div className="relative z-10 mt-12 border-y border-line bg-ink-900/40 backdrop-blur-sm sm:mt-14">
        <Marquee items={MARQUEE_A} />
      </div>
    </section>
  );
}
