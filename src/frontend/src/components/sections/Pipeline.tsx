"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring } from "framer-motion";
import { SectionHeading } from "@/components/fx/SectionHeading";
import { Reveal } from "@/components/fx/Reveal";
import {
  GitBranch,
  FileCode2,
  BookOpenText,
  Shuffle,
  BrainCircuit,
  ShieldCheck,
  FileCheck2,
  PenLine,
  Send,
} from "lucide-react";

const STEPS = [
  {
    icon: GitBranch,
    agent: "intake",
    label: "git signal",
    title: "A commit drifts the docs",
    body: "A pre-push hook, a GitHub Action, or a manual run hands the engine the changed tree. Nothing daemonizes in the dark — every run is explicit and inspectable.",
    badges: ["git pre-push", "gh action", "cli"],
    color: "text-drift-ember",
    ring: "border-drift-ember/40 bg-drift-ember/10",
  },
  {
    icon: FileCode2,
    agent: "extractor agent",
    label: "code side",
    title: "tree-sitter reads the real AST",
    body: "Grammar WASMs (TS / JS / Python) extract exported functions, classes, interfaces, routes and config keys with line-precise evidence. If a grammar fails on exotic syntax, a structural fallback extractor takes over and the miss is logged to the failure ledger.",
    badges: ["web-tree-sitter", "line evidence", "fallback path"],
    color: "text-drift-ember",
    ring: "border-drift-ember/40 bg-drift-ember/10",
  },
  {
    icon: BookOpenText,
    agent: "docs agent",
    label: "docs side",
    title: "Markdown becomes structured targets",
    body: "README tables, setup guides, ARCHITECTURE.md sections and .env.example lines are parsed into typed targets with their own line evidence — the docs side gets the same rigor as the code side.",
    badges: ["tables", "env keys", "headings"],
    color: "text-drift-amber",
    ring: "border-drift-amber/40 bg-drift-amber/10",
  },
  {
    icon: Shuffle,
    agent: "matcher",
    label: "alignment",
    title: "Symbols meet their doc targets",
    body: "A folding matcher aligns camelCase, snake_case and prose mentions, tolerating renames via similarity scoring. Unmatched symbols and orphaned doc rows both survive as drift candidates.",
    badges: ["fuzzy folding", "rename-aware"],
    color: "text-drift-amber",
    ring: "border-drift-amber/40 bg-drift-amber/10",
  },
  {
    icon: BrainCircuit,
    agent: "synthesizer agent",
    label: "reasoning",
    title: "Gemma drafts the findings",
    body: "An open-weight Gemma model (local via Ollama, or the free Gemini API tier) reasons over code vs docs and emits findings plus a Markdown patch. No provider? A deterministic comparator produces the same artifact — the pipeline never stalls.",
    badges: ["gemma open weights", "deterministic fallback"],
    color: "text-drift-mint",
    ring: "border-drift-mint/40 bg-drift-mint/10",
  },
  {
    icon: ShieldCheck,
    agent: "code-side validator",
    label: "subagent · gate 1",
    title: "Every claim must be grounded",
    body: "LLMs hallucinate — the traceability literature documents 'phantom links' extensively. Gate 1 re-checks each finding against the extracted symbols and drops anything the AST cannot prove, before a patch is ever built.",
    badges: ["anti-hallucination", "drops phantom links"],
    color: "text-[#ff8fa3]",
    ring: "border-[#ff5470]/40 bg-[#ff5470]/10",
  },
  {
    icon: FileCheck2,
    agent: "docs-side validator",
    label: "subagent · gate 2",
    title: "The patch must apply cleanly",
    body: "Gate 2 applies the proposed edits to a snapshot of your docs, re-parses the result and confirms the tables stay well-formed and the symbol is genuinely documented now. Broken edits are repaired once, then flagged — never silently merged.",
    badges: ["apply check", "table integrity"],
    color: "text-[#ff8fa3]",
    ring: "border-[#ff5470]/40 bg-[#ff5470]/10",
  },
  {
    icon: PenLine,
    agent: "tone agent",
    label: "subagent · polish",
    title: "Humanized PR, robot-fast",
    body: "A tone pass rewrites the PR title and body so the diff reads like a colleague wrote it — plain verbs, honest scope, no LLM-isms. Falls back to clean templates offline.",
    badges: ["humanized", "template fallback"],
    color: "text-drift-ember",
    ring: "border-drift-ember/40 bg-drift-ember/10",
  },
  {
    icon: Send,
    agent: "emit",
    label: "output",
    title: "You get a reviewable PR",
    body: "A unified diff against your docs, a ready PR description, and a full step trace with timings. One click copies the patch; wire the provided GitHub Action to automate the rest.",
    badges: ["unified diff", "step trace"],
    color: "text-drift-mint",
    ring: "border-drift-mint/40 bg-drift-mint/10",
  },
];

export function Pipeline() {
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start 0.72", "end 0.62"],
  });
  const lineScale = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });

  return (
    <section id="pipeline" className="relative z-10 scroll-mt-24 py-12 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="the agent crew"
          title="Nine steps. Two gates. Zero stalling."
          accentWord="gates"
          description="A Mastra workflow wires the crew into one typed graph. Every step reports status, timing and notes — the same trace you see live in the demo below."
        />

        <div ref={trackRef} className="relative mt-12">
          {/* scroll-drawn spine */}
          <div className="absolute left-[22px] top-0 h-full w-px bg-ink-700/70 lg:left-1/2 lg:-translate-x-1/2" aria-hidden>
            <motion.div
              className="h-full w-full origin-top bg-gradient-to-b from-drift-ember via-drift-amber to-drift-mint"
              style={{ scaleY: lineScale }}
            />
          </div>

          <div className="flex flex-col gap-8 lg:gap-10">
            {STEPS.map((s, i) => {
              const left = i % 2 === 0;
              return (
                <Reveal key={s.agent} variant={left ? "left" : "right"} amount={0.15}>
                  <div
                    className={`relative flex items-start gap-5 lg:gap-0 ${
                      left ? "lg:flex-row" : "lg:flex-row-reverse"
                    }`}
                  >
                    {/* node */}
                    <div className="relative z-10 shrink-0 lg:absolute lg:left-1/2 lg:-translate-x-1/2">
                      <span
                        className={`flex h-11 w-11 items-center justify-center rounded-2xl border backdrop-blur ${s.ring}`}
                      >
                        <s.icon className={`h-5 w-5 ${s.color}`} />
                      </span>
                    </div>

                    {/* card */}
                    <div
                      className={`glass w-full rounded-2xl p-6 lg:w-[calc(50%-3.5rem)] ${
                        left ? "lg:mr-auto" : "lg:ml-auto"
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className={`font-mono text-[11px] uppercase tracking-[0.2em] ${s.color}`}>
                          {s.agent}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fog/60">
                          {s.label}
                        </span>
                      </div>
                      <h3 className="font-display text-xl uppercase tracking-wide text-mist sm:text-2xl">
                        {s.title}
                      </h3>
                      <p className="mt-2.5 text-[15px] leading-relaxed text-fog">{s.body}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {s.badges.map((b) => (
                          <span
                            key={b}
                            className="rounded-full border border-line bg-ink-800/70 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-fog"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
