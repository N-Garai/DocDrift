"use client";

import { Reveal, Stagger, StaggerItem } from "@/components/fx/Reveal";
import { Counter } from "@/components/fx/Counter";
import { TiltCard } from "@/components/fx/TiltCard";

const STATS = [
  { value: 3, suffix: "+", label: "languages parsed", note: "TS · JS · Python (WASM grammars)" },
  { value: 2, suffix: "", label: "validation gates", note: "code grounding + docs apply check" },
  { value: 0, suffix: "", label: "cloud calls required", note: "runs on your laptop, fully offline" },
  { value: 0, prefix: "$", suffix: "", label: "to run, forever", note: "open weights + open harness" },
];

export function Stats() {
  return (
    <section className="relative z-10 py-10 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Stagger className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4" gap={0.1}>
          {STATS.map((s) => (
            <StaggerItem key={s.label}>
              <TiltCard maxTilt={7} className="group">
                <div className="card-beam glass h-full rounded-2xl p-6 sm:p-7">
                  <p className="font-display text-5xl tracking-wide text-mist sm:text-6xl">
                    <Counter
                      to={s.value}
                      prefix={s.prefix ?? ""}
                      suffix={s.suffix}
                      className="bg-gradient-to-br from-mist to-fog bg-clip-text text-transparent"
                    />
                  </p>
                  <p className="mt-2.5 text-sm font-semibold uppercase tracking-[0.14em] text-mist/90">
                    {s.label}
                  </p>
                  <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-fog/80">
                    {s.note}
                  </p>
                </div>
              </TiltCard>
            </StaggerItem>
          ))}
        </Stagger>
        <Reveal variant="blur" delay={0.2}>
          <p className="mt-8 text-center font-mono text-[11px] uppercase tracking-[0.3em] text-fog/50">
            numbers the demo below actually runs on — not marketing
          </p>
        </Reveal>
      </div>
    </section>
  );
}
