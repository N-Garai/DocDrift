"use client";

import { SectionHeading } from "@/components/fx/SectionHeading";
import { Reveal, Stagger, StaggerItem } from "@/components/fx/Reveal";
import { TiltCard } from "@/components/fx/TiltCard";
import { Moon, GitCommitHorizontal, ScanSearch } from "lucide-react";

const CARDS = [
  {
    icon: GitCommitHorizontal,
    title: "You ship. Docs rot.",
    body: "A signature changes, an env var gets renamed, an endpoint moves to /v2 — and the README quietly becomes fiction. Nobody updates docs in the same commit, and nobody should have to.",
    tag: "the drift",
    accent: "text-[#ff8fa3]",
    chip: "bg-[#ff5470]/10 border-[#ff5470]/30",
  },
  {
    icon: ScanSearch,
    title: "Linters can't read markdown.",
    body: "Your compiler validates code against code — but nothing validates code against prose. A TypeScript interface and the markdown table describing it live in two worlds no tool compares.",
    tag: "the blind spot",
    accent: "text-drift-ember",
    chip: "bg-drift-ember/10 border-drift-ember/30",
  },
  {
    icon: Moon,
    title: "So let the sloth work.",
    body: "DocDrift watches in the background and does the boring part for you: it detects the drift, grounds every claim in the actual AST, and drafts the doc PR. You review. That's it.",
    tag: "the lazy payoff",
    accent: "text-drift-mint",
    chip: "bg-drift-mint/10 border-drift-mint/30",
  },
];

export function Problem() {
  return (
    <section id="problem" className="relative z-10 scroll-mt-24 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="the sloth angle"
          title="Move slow. Ship docs anyway."
          accentWord="slow"
          description="Documentation decay is measured, not mythical — empirical studies flag READMEs that reference code elements deleted many revisions ago. DocDrift exists so fixing it stops being your job."
        />

        <Stagger className="mt-10 grid gap-5 md:grid-cols-3" gap={0.12}>
          {CARDS.map((c) => (
            <StaggerItem key={c.title} className="h-full">
              <TiltCard maxTilt={9} className="group h-full">
                <div className="card-beam glass flex h-full flex-col gap-5 rounded-3xl p-7">
                  <div className="flex items-center justify-between">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${c.chip}`}>
                      <c.icon className={`h-6 w-6 ${c.accent}`} />
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-fog/60">
                      {c.tag}
                    </span>
                  </div>
                  <h3 className="font-display text-2xl uppercase tracking-wide text-mist">
                    {c.title}
                  </h3>
                  <p className="text-[15px] leading-relaxed text-fog">{c.body}</p>
                </div>
              </TiltCard>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal variant="up" delay={0.15} className="mt-8">
          <blockquote className="glass mx-auto max-w-3xl rounded-2xl p-6 text-center">
            <p className="text-[15px] leading-relaxed text-fog">
              &ldquo;Detecting Outdated Code Element References in Software
              Documentation&rdquo; (ICSME 2023) can only flag references whose
              occurrences drop to <em>zero</em> — a changed default like{" "}
              <code className="font-mono text-drift-ember">PORT 3000 → 8080</code>{" "}
              sails straight past it. DocDrift compares <span className="text-mist">values and shapes</span>,
              not just string existence.{" "}
              <a
                href="https://arxiv.org/abs/2212.01479"
                target="_blank"
                rel="noreferrer"
                className="ml-1 whitespace-nowrap text-drift-ember underline decoration-drift-ember/40 underline-offset-4 hover:decoration-drift-ember"
              >
                read the paper ↗
              </a>
            </p>
          </blockquote>
        </Reveal>
      </div>
    </section>
  );
}
