"use client";

/**
 * DriftField — the DocDrift landing background.
 *
 * Instead of the usual aurora blobs, the brand idea is drawn literally:
 * a warm graphite field with a dot grid, and ghosted "diff lines"
 * (added = mint, removed = coral, context = ash) drifting sideways like a
 * codebase that keeps moving under its docs. Pure CSS animation, seeded
 * layout so SSR and hydration agree.
 */

type Beam = {
  left: number; // %
  top: number; // % of page height
  width: number; // px
  tone: "ash" | "mint" | "coral";
  opacity: number;
  duration: number; // s
  delay: number; // s
  reverse: boolean;
  glyph: "+" | "−" | null;
};

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildBeams(count: number, seed: number): Beam[] {
  const rnd = mulberry32(seed);
  const beams: Beam[] = [];
  for (let i = 0; i < count; i++) {
    const roll = rnd();
    const tone: Beam["tone"] = roll < 0.16 ? "mint" : roll < 0.3 ? "coral" : "ash";
    beams.push({
      left: 1 + rnd() * 74,
      top: 2 + (i / count) * 94 + rnd() * 3.5,
      width: 64 + rnd() * 330,
      tone,
      opacity: tone === "ash" ? 0.05 + rnd() * 0.07 : 0.09 + rnd() * 0.1,
      duration: 15 + rnd() * 20,
      delay: -rnd() * 24,
      reverse: rnd() > 0.5,
      glyph: tone === "mint" ? "+" : tone === "coral" ? "−" : null,
    });
  }
  return beams;
}

const BEAMS = buildBeams(24, 20261023);

const TONE_CLASS: Record<Beam["tone"], string> = {
  ash: "bg-mist",
  mint: "bg-drift-mint",
  coral: "bg-drift-coral",
};
const TONE_GLYPH: Record<Beam["tone"], string> = {
  ash: "text-fog",
  mint: "text-drift-mint",
  coral: "text-drift-coral",
};

export function DriftField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* fixed warm vignette — stays put while beams scroll */}
      <div className="fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_110%_70%_at_50%_-10%,rgba(58,40,24,0.42),transparent_62%)]" />
        <div className="absolute -left-44 top-[6%] h-[520px] w-[520px] rounded-full bg-drift-ember/[0.055] blur-[150px]" />
        <div className="absolute -right-44 bottom-[-8%] h-[560px] w-[560px] rounded-full bg-drift-amber/[0.045] blur-[160px]" />
      </div>

      {/* dot grid across the whole page */}
      <div
        className="dot-grid absolute inset-0"
        style={{
          maskImage: "linear-gradient(to bottom, black 0%, black 55%, transparent 96%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, black 55%, transparent 96%)",
        }}
      />

      {/* the drifting diff lines */}
      {BEAMS.map((b, i) => (
        <div
          key={i}
          className="absolute flex items-center gap-2 animate-drift-x"
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            animationDuration: `${b.duration}s`,
            animationDelay: `${b.delay}s`,
            animationDirection: b.reverse ? "alternate-reverse" : "alternate",
          }}
        >
          {b.glyph && (
            <span
              className={`font-mono text-[12px] leading-none ${TONE_GLYPH[b.tone]}`}
              style={{ opacity: b.opacity + 0.18 }}
            >
              {b.glyph}
            </span>
          )}
          <span
            className={`block h-[3px] rounded-full ${TONE_CLASS[b.tone]}`}
            style={{ width: b.width, opacity: b.opacity }}
          />
        </div>
      ))}

      {/* slow scan sweep */}
      <div className="fixed inset-x-0 top-0 h-px animate-scan-slow">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-drift-ember/25 to-transparent" />
      </div>

      {/* bottom settle */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink-950 to-transparent" />
    </div>
  );
}
