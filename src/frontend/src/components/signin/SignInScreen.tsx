"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Github, ArrowRight, ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { GlyphMark } from "@/components/loader/Preloader";
import { fetchMe, ApiError } from "@/lib/github";

/**
 * Dedicated sign-in screen — split layout: brand panel (left) and a frosted
 * glass auth card (right). Deliberately quiet: no setup instructions, no
 * technical noise — just the GitHub action and the trust facts.
 */
export function SignInScreen() {
  const router = useRouter();
  const [state, setState] = useState<"probing" | "ready" | "unconfigured">("probing");

  useEffect(() => {
    let alive = true;
    fetchMe()
      .then((m) => {
        if (!alive) return;
        if (m.authenticated) {
          router.replace("/studio");
          return;
        }
        setState(m.oauthConfigured ? "ready" : "unconfigured");
      })
      .catch(() => {
        if (!alive) return;
        setState("unconfigured");
      });
    return () => {
      alive = false;
    };
  }, [router]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="noise-overlay" aria-hidden />

      <div className="relative z-10 grid flex-1 lg:grid-cols-[1.08fr_0.92fr]">
        {/* ── left brand panel ─────────────────────────────────────────────── */}
        <div className="relative flex flex-col justify-between overflow-hidden border-b border-line px-6 py-10 sm:px-12 lg:border-b-0 lg:border-r lg:py-14">
          {/* geometric decor — outlined circle, chevrons, pill, dotted orbit */}
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="xMidYMid slice"
          >
            <circle cx="88" cy="30" r="26" fill="none" stroke="rgba(255,90,31,0.22)" strokeWidth="0.35" />
            <circle cx="88" cy="30" r="34" fill="none" stroke="rgba(255,176,58,0.14)" strokeWidth="0.25" strokeDasharray="1.4 2.6" />
            <circle cx="88" cy="30" r="8" fill="none" stroke="rgba(255,90,31,0.35)" strokeWidth="0.3" />
            <path d="M78 74 L88 84 L78 94" fill="none" stroke="rgba(255,176,58,0.3)" strokeWidth="0.45" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M86 74 L96 84 L86 94" fill="none" stroke="rgba(255,176,58,0.16)" strokeWidth="0.45" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="8" y="8" width="3.2" height="14" rx="1.6" fill="none" stroke="rgba(240,237,231,0.2)" strokeWidth="0.3" />
            <rect x="14" y="8" width="3.2" height="8" rx="1.6" fill="rgba(255,90,31,0.35)" />
            <rect x="70" y="12" width="16" height="5" rx="2.5" fill="none" stroke="rgba(46,229,157,0.28)" strokeWidth="0.3" transform="rotate(-18 78 14.5)" />
            <path d="M6 78 C 24 66, 40 92, 62 74" fill="none" stroke="rgba(255,90,31,0.3)" strokeWidth="0.35" strokeLinecap="round" strokeDasharray="2 3" className="animate-dash-flow" />
            <circle cx="6" cy="60" r="1.1" fill="rgba(46,229,157,0.6)" />
            <circle cx="12" cy="52" r="0.7" fill="rgba(240,237,231,0.4)" />
            <circle cx="20" cy="63" r="0.7" fill="rgba(240,237,231,0.3)" />
          </svg>

          {/* ghost diff beams */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {[
              { top: "22%", left: "6%", w: 180, c: "bg-drift-mint", o: 0.1, d: 19 },
              { top: "34%", left: "40%", w: 120, c: "bg-drift-coral", o: 0.09, d: 24 },
              { top: "58%", left: "12%", w: 240, c: "bg-mist", o: 0.06, d: 28 },
              { top: "76%", left: "48%", w: 90, c: "bg-drift-amber", o: 0.08, d: 21 },
            ].map((b, i) => (
              <div
                key={i}
                className="absolute animate-drift-x"
                style={{ top: b.top, left: b.left, animationDuration: `${b.d}s` }}
              >
                <span className={`block h-[3px] rounded-full ${b.c}`} style={{ width: b.w, opacity: b.o }} />
              </div>
            ))}
          </div>

          <div className="relative flex items-center gap-2.5">
            <GlyphMark size={34} />
            <span className="font-display text-xl uppercase tracking-[0.1em] text-mist">
              Doc<span className="text-drift-ember">Drift</span>
            </span>
          </div>

          <div className="relative mt-16 lg:mt-0">
            <motion.h1
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-[17vw] uppercase leading-[0.95] tracking-tight text-mist sm:text-7xl lg:text-8xl"
            >
              Welcome<span className="text-drift-ember">.</span>
            </motion.h1>
            <div className="mt-7 h-[3px] w-14 rounded-full bg-drift-ember/80" />
            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.8 }}
              className="mt-7 max-w-md text-[15px] leading-relaxed text-fog sm:text-base"
            >
              Sign in with your GitHub account — private repositories included —
              and the DocDrift crew will read your code, question your docs, and
              draft the pull request that reconciles the two.
            </motion.p>
            <motion.a
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.8 }}
              href="/#pipeline"
              className="mt-9 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-drift-ember to-drift-amber px-6 py-3 text-sm font-semibold text-ink-950 shadow-[0_14px_38px_-12px_rgba(255,90,31,0.55)] transition-transform hover:scale-[1.03]"
            >
              See how the agents think <ArrowRight className="h-4 w-4" />
            </motion.a>
          </div>

          <p className="relative mt-14 font-mono text-[10.5px] uppercase tracking-[0.26em] text-fog/60 lg:mt-0">
            free · open source · local-first
          </p>
        </div>

        {/* ── right auth card ──────────────────────────────────────────────── */}
        <div className="relative flex items-center justify-center px-5 py-14 sm:px-10">
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            className="glass w-full max-w-md rounded-3xl p-8 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)] sm:p-10"
          >
            <div className="flex flex-col items-center text-center">
              <h2 className="font-display text-3xl uppercase tracking-wide text-mist">
                Sign in
              </h2>
              <div className="mt-2.5 h-[2.5px] w-9 rounded-full bg-drift-ember/80" />

              <span className="mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-mist text-ink-950 shadow-[0_10px_34px_-10px_rgba(240,237,231,0.4)]">
                <Github className="h-7 w-7" />
              </span>

              <p className="mt-5 text-[14.5px] leading-relaxed text-fog">
                One click, no forms. DocDrift asks for{" "}
                <span className="font-mono text-[13px] text-mist">repo</span> +{" "}
                <span className="font-mono text-[13px] text-mist">read:user</span>{" "}
                so it can list your repositories — private ones included — and
                open documentation PRs as you.
              </p>

              {state === "probing" && (
                <p className="mt-8 flex items-center gap-2.5 font-mono text-[12px] text-fog">
                  <Loader2 className="h-4 w-4 animate-spin text-drift-ember" />
                  checking session…
                </p>
              )}

              {state === "ready" && (
                <a
                  href="/api/auth/github/login"
                  className="mt-8 inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-drift-ember to-drift-amber px-7 py-4 text-base font-semibold text-ink-950 shadow-[0_18px_50px_-14px_rgba(255,90,31,0.6)] transition-transform hover:scale-[1.02]"
                >
                  <Github className="h-5 w-5" />
                  Sign in with GitHub
                </a>
              )}

              {state === "unconfigured" && (
                <div className="mt-8 w-full rounded-2xl border border-line bg-ink-800/60 px-5 py-4 text-center">
                  <p className="text-[13.5px] leading-relaxed text-fog">
                    GitHub sign-in isn&rsquo;t enabled on this server yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-drift-ember transition-colors hover:text-drift-amber"
                  >
                    retry
                  </button>
                </div>
              )}

              <ul className="mt-8 flex w-full flex-col gap-2.5 border-t border-line pt-6 text-left">
                {[
                  "your token never leaves the server — the browser holds a session cookie only",
                  "nothing merges itself — every PR waits for your review",
                  "revoke access anytime from GitHub → Settings → Applications",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-fog">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-drift-mint" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>

          <a
            href="/"
            className="absolute left-5 top-6 inline-flex items-center gap-1.5 rounded-xl border border-line bg-ink-900/50 px-3.5 py-2 text-[12.5px] text-fog backdrop-blur transition-colors hover:border-drift-ember/40 hover:text-mist sm:left-10"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> home
          </a>
          <a
            href="/studio"
            className="absolute right-5 top-6 inline-flex items-center gap-1.5 rounded-xl border border-line bg-ink-900/50 px-3.5 py-2 text-[12.5px] text-fog backdrop-blur transition-colors hover:border-drift-ember/40 hover:text-mist sm:right-10"
          >
            studio <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
