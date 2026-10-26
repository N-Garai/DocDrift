"use client";

import { SectionHeading } from "@/components/fx/SectionHeading";
import { Reveal, Stagger, StaggerItem } from "@/components/fx/Reveal";
import { TiltCard } from "@/components/fx/TiltCard";
import { useEffect, useState } from "react";
import { fetchHealth, type HealthInfo } from "@/lib/api";
import { Laptop, Coins, Replace, Activity } from "lucide-react";

const PILLARS = [
  {
    icon: Laptop,
    title: "Your code never leaves the machine",
    body: "The default path runs local inference on localhost — the AST, your README and the patch all stay on your disk. The deterministic engine doesn't even open a socket. Traceability research (2025) shows LLM link-detection is useful but imperfect; doing it locally means the only thing at risk of a mistake is a markdown table, not your IP.",
  },
  {
    icon: Coins,
    title: "Set it up once, pay nothing ever",
    body: "Every component is free under an open-source license. The optional hosted API path uses a free tier with a key — no credit card, no trial clock. There is no paid plan to outgrow.",
  },
  {
    icon: Replace,
    title: "Swap the brain, keep the body",
    body: "The synthesizer is a provider chain, not a vendor: point at any local model, set an API key for the hosted open model, or run with neither and the deterministic comparator steps in. Changing how your agent behaves is a config edit, not a migration.",
  },
];

export function OpenSource() {
  const [health, setHealth] = useState<HealthInfo | null>(null);

  useEffect(() => {
    let alive = true;
    fetchHealth()
      .then((h) => alive && setHealth(h))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section id="open" className="relative z-10 scroll-mt-24 py-12 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="why open matters"
          title="Closed tools can't watch what they can't see."
          accentWord="open"
          description="A documentation watcher needs your entire working tree in context. That's exactly the payload you should never paste into a browser tab — so the whole stack runs where the repo lives."
        />

        <Stagger className="mt-10 grid gap-5 lg:grid-cols-3" gap={0.12}>
          {PILLARS.map((p) => (
            <StaggerItem key={p.title} className="h-full">
              <TiltCard maxTilt={7} className="group h-full">
                <div className="card-beam glass flex h-full flex-col gap-4 rounded-3xl p-7">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-drift-ember/30 bg-drift-ember/10">
                    <p.icon className="h-6 w-6 text-drift-ember" />
                  </span>
                  <h3 className="font-display text-[1.35rem] uppercase leading-tight tracking-wide text-mist">
                    {p.title}
                  </h3>
                  <p className="text-[14.5px] leading-relaxed text-fog">{p.body}</p>
                </div>
              </TiltCard>
            </StaggerItem>
          ))}
        </Stagger>

        {/* live provider chain */}
        <Reveal variant="up" delay={0.1} className="mt-8">
          <div className="glass rounded-3xl p-7 sm:p-9">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h3 className="font-mono text-[12px] uppercase tracking-[0.26em] text-fog">
                provider resolution chain — live status
              </h3>
              <span className="flex items-center gap-2 font-mono text-[11px] text-fog">
                <Activity className="h-3.5 w-3.5 text-drift-mint" />
                GET /api/health
              </span>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <ProviderNode
                name="local model"
                desc="open weights on localhost"
                active={health?.providers.ollama ?? false}
                primary
              />
              <ProviderNode
                name="hosted api · free tier"
                desc="hosted open model, key from provider dashboard"
                active={health?.providers.gemini ?? false}
              />
              <ProviderNode
                name="deterministic engine"
                desc="always-on comparator — what powers this demo"
                active
                always
              />
            </div>

            <p className="mt-6 font-mono text-[11.5px] leading-relaxed text-fog/80">
              {health
                ? `engine active now: ${health.engine} · parser: ${health.parser} · ast failures logged: ${health.parserFailures}`
                : "querying engine …"}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function ProviderNode({
  name,
  desc,
  active,
  primary = false,
  always = false,
}: {
  name: string;
  desc: string;
  active: boolean;
  primary?: boolean;
  always?: boolean;
}) {
  return (
    <div
      className={`relative rounded-2xl border p-5 transition-colors ${
        active
          ? primary
            ? "border-drift-mint/40 bg-drift-mint/[0.06]"
            : "border-drift-ember/30 bg-ink-800/60"
          : "border-line bg-ink-800/40"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[12.5px] font-semibold text-mist">{name}</p>
        <span
          className={`h-2 w-2 rounded-full ${
            active
              ? always
                ? "bg-drift-ember animate-pulse-dot"
                : "bg-drift-mint animate-pulse-dot"
              : "bg-fog/30"
          }`}
        />
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-fog">{desc}</p>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-fog/60">
        {always ? "always available" : active ? "detected" : "not configured — skipped"}
      </p>
    </div>
  );
}
