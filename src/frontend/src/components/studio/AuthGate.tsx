"use client";

import { Github, ArrowLeft, ShieldQuestion, Loader2 } from "lucide-react";
import { GlyphMark } from "@/components/loader/Preloader";

/**
 * Pre-auth states of the Studio. Quiet and professional by design:
 *  - oauth not configured → a one-line notice (setup lives in the docs, not here)
 *  - configured → a single call-to-action into the sign-in screen
 */
export function AuthGate({ oauthConfigured }: { oauthConfigured: boolean }) {
  if (!oauthConfigured) {
    return (
      <div className="glass mx-auto flex max-w-xl flex-col items-center gap-5 rounded-3xl p-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-ink-800/70">
          <ShieldQuestion className="h-5 w-5 text-drift-amber" />
        </span>
        <div>
          <h2 className="font-display text-xl uppercase tracking-wide text-mist">
            GitHub sign-in is unavailable
          </h2>
          <p className="mt-2.5 text-[15px] leading-relaxed text-fog">
            This server doesn&rsquo;t have GitHub sign-in enabled yet. The live
            demo on the home page still runs fully locally — no account needed.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href="/#demo"
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-ink-800/60 px-4 py-2.5 text-sm text-mist transition-colors hover:border-drift-ember/40"
          >
            <ArrowLeft className="h-4 w-4" /> Back to the demo
          </a>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-drift-ember to-drift-amber px-4 py-2.5 text-sm font-semibold text-ink-950"
          >
            <Loader2 className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass mx-auto flex max-w-xl flex-col items-center gap-6 rounded-3xl p-10 text-center">
      <GlyphMark size={56} />
      <div>
        <h2 className="font-display text-2xl uppercase tracking-wide text-mist">
          Sign in to continue
        </h2>
        <p className="mt-2.5 text-[15px] leading-relaxed text-fog">
          The Studio works on your repositories — private ones included. Sign
          in with your GitHub account and it will parse code and docs with
          tree-sitter, then draft the documentation PR for you.
        </p>
      </div>

      <ul className="flex flex-col gap-2 text-left font-mono text-[11.5px] text-fog">
        <li className="flex items-center gap-2.5">
          <span className="h-1 w-1 rounded-full bg-drift-ember" />
          token never leaves the server — browser holds a session cookie only
        </li>
        <li className="flex items-center gap-2.5">
          <span className="h-1 w-1 rounded-full bg-drift-ember" />
          nothing merges itself — every PR waits for your review
        </li>
      </ul>

      <a
        href="/signin"
        className="mt-2 inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-drift-ember to-drift-amber px-7 py-3.5 text-base font-semibold text-ink-950 shadow-[0_16px_44px_-14px_rgba(255,90,31,0.5)] transition-transform hover:scale-[1.03]"
      >
        <Github className="h-5 w-5" />
        Continue to sign in
      </a>
    </div>
  );
}
