"use client";

import { SectionHeading } from "@/components/fx/SectionHeading";
import { Stagger, StaggerItem } from "@/components/fx/Reveal";
import { TiltCard } from "@/components/fx/TiltCard";
import {
  ScanText,
  Workflow,
  Gem,
  ShieldCheck,
  GitPullRequest,
  Unplug,
} from "lucide-react";

const FEATURES = [
  {
    icon: ScanText,
    title: "AST, not vibes",
    body: "WASM grammars parse TS, JS and Python for exported functions, classes, interfaces, routes and config keys. A structural fallback extractor keeps the engine alive when syntax gets exotic.",
    span: "lg:col-span-2",
    accent: "text-drift-ember",
    chip: "border-drift-ember/30 bg-drift-ember/10",
  },
  {
    icon: Workflow,
    title: "Agent orchestration",
    body: "Typed steps, zod schemas, a committed workflow graph — an open-source harness powering production agents.",
    span: "",
    accent: "text-drift-amber",
    chip: "border-drift-amber/30 bg-drift-amber/10",
  },
  {
    icon: Gem,
    title: "Open weights inside",
    body: "Local inference on your machine, or a free API tier. Swap any compatible model with one env var.",
    span: "",
    accent: "text-drift-mint",
    chip: "border-drift-mint/30 bg-drift-mint/10",
  },
  {
    icon: ShieldCheck,
    title: "Two validation gates",
    body: "A code-side subagent drops claims the AST can't prove; a docs-side subagent refuses patches that don't apply cleanly. Hallucinations die before the diff.",
    span: "",
    accent: "text-[#ff8fa3]",
    chip: "border-[#ff5470]/30 bg-[#ff5470]/10",
  },
  {
    icon: GitPullRequest,
    title: "PR-ready output",
    body: "Unified diff against your docs, humanized PR title and body, copy button. Review, merge, move on.",
    span: "",
    accent: "text-drift-ember",
    chip: "border-drift-ember/30 bg-drift-ember/10",
  },
  {
    icon: Unplug,
    title: "Plugs into your flow",
    body: "Pre-push hook, GitHub Action, CLI or the demo on this page. AST failures land in a queryable health ledger.",
    span: "lg:col-span-2",
    accent: "text-drift-mint",
    chip: "border-drift-mint/30 bg-drift-mint/10",
  },
];

export function Features() {
  return (
    <section id="features" className="relative z-10 scroll-mt-24 py-12 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="what's in the box"
          title="Built open. Built boring-proof."
          accentWord="open"
          description="Every layer is inspectable: the parser, the workflow graph, the model and the validators. No SDK phones home; no feature requires a subscription."
        />

        <Stagger className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3" gap={0.1}>
          {FEATURES.map((f) => (
            <StaggerItem key={f.title} className={`h-full ${f.span}`}>
              <TiltCard maxTilt={8} className="group h-full">
                <div className="card-beam glass flex h-full flex-col gap-4 rounded-3xl p-7">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${f.chip}`}>
                    <f.icon className={`h-6 w-6 ${f.accent}`} />
                  </span>
                  <h3 className="font-display text-2xl uppercase tracking-wide text-mist">
                    {f.title}
                  </h3>
                  <p className="text-[15px] leading-relaxed text-fog">{f.body}</p>
                </div>
              </TiltCard>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
