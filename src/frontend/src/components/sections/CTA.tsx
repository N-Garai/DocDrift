"use client";

import { Reveal } from "@/components/fx/Reveal";
import { Terminal, BookOpen } from "lucide-react";

export function CTA() {
  return (
    <section className="relative z-10 overflow-hidden py-16 sm:py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-drift-amber/[0.07] blur-[120px]"
      />
      <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-10 px-4 text-center sm:px-6">
        <Reveal variant="wipe" amount={0.25}>
          <p className="font-display text-[16vw] uppercase leading-[0.95] tracking-wide sm:text-8xl">
            <span className="text-stroke block">let the docs</span>
            <span className="gradient-anim block bg-gradient-to-r from-drift-ember via-drift-amber to-drift-mint bg-clip-text text-transparent">
              chill.
            </span>
          </p>
        </Reveal>

        <Reveal variant="up" delay={0.15}>
          <p className="max-w-xl text-base leading-relaxed text-fog sm:text-lg">
            You review documentation PRs now. That&rsquo;s the whole job. The
            sloth handles the rest — slowly, reliably, and entirely on your
            machine.
          </p>
        </Reveal>

        <Reveal variant="up" delay={0.25}>
          <div className="flex flex-wrap items-center justify-center gap-3.5">
            <a
              href="/studio"
              className="inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-drift-ember to-drift-amber px-8 py-4 text-base font-semibold text-ink-950 shadow-[0_16px_44px_-14px_rgba(255,176,58,0.55)] transition-transform hover:scale-[1.03]"
            >
              <Terminal className="h-5 w-5" />
              Launch the Studio
            </a>
            <a
              href="https://raw.githubusercontent.com/N-Garai/DocDrift/refs/heads/main/docs/asset/architecture.png"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2.5 rounded-2xl border border-line bg-ink-800/50 px-8 py-4 text-base font-medium text-mist backdrop-blur transition-colors hover:border-drift-ember/40"
            >
              <BookOpen className="h-5 w-5" />
              Read the architecture
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
