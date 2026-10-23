import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GlyphMark } from "@/components/loader/Preloader";
import { CircuitField } from "@/components/fx/CircuitField";
import { StudioShell } from "@/components/studio/StudioShell";

export const metadata: Metadata = {
  title: "Studio — DocDrift",
  description:
    "Sign in with GitHub, pick a repository (private included) and let the DocDrift agent crew draft the documentation PR.",
};

export default function StudioPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <CircuitField />
      <div className="noise-overlay" aria-hidden />

      <header className="relative z-10 border-b border-line bg-ink-900/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <GlyphMark size={30} />
            <span className="font-display text-lg uppercase tracking-[0.1em] text-mist">
              Doc<span className="text-drift-ember">Drift</span>
              <span className="ml-2 rounded-md border border-drift-amber/40 bg-drift-amber/10 px-1.5 py-0.5 align-middle font-mono text-[9.5px] uppercase tracking-[0.2em] text-drift-amber">
                studio
              </span>
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-ink-800/60 px-3.5 py-2 text-[13px] text-fog transition-colors hover:border-drift-ember/40 hover:text-mist"
          >
            <ArrowLeft className="h-4 w-4" /> home
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
        <div className="mb-7 flex flex-col gap-2">
          <h1 className="font-display text-3xl uppercase tracking-wide text-mist sm:text-4xl">
            The workspace where docs stop drifting
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-fog">
            Sign in with your GitHub account, pick a repository — private ones
            included — choose the source file and the markdown that claims to
            describe it, and the agent crew returns a grounded drift report with
            a ready-to-open documentation PR.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="glass rounded-3xl p-8 font-mono text-[13px] text-fog">
              booting the studio…
            </div>
          }
        >
          <StudioShell />
        </Suspense>
      </main>

      <footer className="relative z-10 border-t border-line bg-ink-900/60 py-5 backdrop-blur">
        <p className="mx-auto max-w-6xl px-4 font-mono text-[11px] text-fog/60 sm:px-6">
          tokens stay server-side · PRs open as you · nothing merges itself
        </p>
      </footer>
    </div>
  );
}
