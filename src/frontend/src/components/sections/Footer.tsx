"use client";

import { GlyphMark } from "@/components/loader/Preloader";

const COLS = [
  {
    head: "project",
    links: [
      { label: "Sign in", href: "/signin" },
      { label: "Studio", href: "/studio" },
      { label: "Live demo", href: "#demo" },
      { label: "Agent crew", href: "#pipeline" },
      { label: "Features", href: "#features" },
      { label: "Why open", href: "#open" },
    ],
  },
  {
    head: "stack",
    links: [
      { label: "Mastra", href: "https://mastra.ai" },
      { label: "tree-sitter", href: "https://tree-sitter.github.io" },
      { label: "Gemma", href: "https://ai.google.dev/gemma" },
      { label: "Ollama", href: "https://ollama.com" },
    ],
  },
  {
    head: "docs",
    links: [
      { label: "Architecture", href: "https://github.com/" },
      { label: "Agent workflow", href: "https://github.com/" },
      { label: "Research notes", href: "https://github.com/" },
      { label: "Self-hosting", href: "https://github.com/" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative z-10 mt-auto border-t border-line bg-ink-900/60 backdrop-blur">
      <div
        aria-hidden
        className="h-px w-full bg-gradient-to-r from-transparent via-drift-ember/50 to-transparent"
      />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.2fr_2fr]">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <GlyphMark size={32} />
              <span className="font-display text-xl uppercase tracking-[0.1em] text-mist">
                Doc<span className="text-drift-ember">Drift</span>
              </span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-fog">
              A background codebase-to-documentation synchronizer. Open-source
              AI at the core: Mastra for orchestration, tree-sitter for truth,
              Gemma for prose.
            </p>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-fog/50">
              built open · mit licensed · slow &amp; steady
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {COLS.map((col) => (
              <div key={col.head} className="flex flex-col gap-3">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.26em] text-fog/60">
                  {col.head}
                </p>
                {col.links.map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    {...(l.href.startsWith("http")
                      ? { target: "_blank", rel: "noreferrer" }
                      : {})}
                    className="text-sm text-fog transition-colors hover:text-drift-ember"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 sm:flex-row">
          <p className="font-mono text-[11px] text-fog/60">
            MIT licensed · no trackers · no cookies · no paid tiers
          </p>
          <p className="font-mono text-[11px] text-fog/60">
            parsed with tree-sitter · orchestrated by mastra · prose by gemma
          </p>
        </div>
      </div>
    </footer>
  );
}
