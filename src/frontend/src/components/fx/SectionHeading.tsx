"use client";

import { motion } from "framer-motion";
import { SplitText } from "./SplitText";
import { Reveal } from "./Reveal";

export function SectionHeading({
  eyebrow,
  title,
  accentWord,
  description,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  /** word(s) rendered with the animated drift gradient */
  accentWord?: string;
  description?: string;
  align?: "center" | "left";
}) {
  const alignCls =
    align === "center" ? "items-center text-center" : "items-start text-left";
  const accents = accentWord ? accentWord.toLowerCase().split(" ") : [];

  return (
    <div className={`flex flex-col gap-5 ${alignCls}`}>
      <Reveal variant="blur" amount={0.6}>
        <span className="inline-flex items-center gap-2 rounded-full border border-drift-ember/25 bg-drift-ember/[0.06] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.22em] text-drift-ember">
          <span className="h-1.5 w-1.5 rounded-full bg-drift-mint animate-pulse-dot" />
          {eyebrow}
        </span>
      </Reveal>
      <SplitText
        as="h2"
        text={title}
        className="font-display text-4xl uppercase leading-[1.04] tracking-wide text-mist sm:text-5xl lg:text-6xl"
        wordClassName={(word: string) =>
          accents.includes(word.toLowerCase().replace(/[^a-z]/g, ""))
            ? "bg-gradient-to-r from-drift-ember via-drift-amber to-drift-mint bg-clip-text text-transparent"
            : undefined
        }
      />
      {description && (
        <Reveal variant="up" delay={0.15}>
          <p
            className={`max-w-2xl text-base leading-relaxed text-fog sm:text-lg ${
              align === "center" ? "mx-auto" : ""
            }`}
          >
            {description}
          </p>
        </Reveal>
      )}
    </div>
  );
}
