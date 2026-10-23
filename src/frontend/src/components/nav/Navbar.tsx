"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { useState } from "react";
import { Menu, X, Github, ArrowUpRight } from "lucide-react";
import { GlyphMark } from "@/components/loader/Preloader";
import { heroDelay } from "@/lib/boot";

const LINKS = [
  { href: "#problem", label: "The Sloth Angle" },
  { href: "#pipeline", label: "Agent Crew" },
  { href: "#features", label: "Features" },
  { href: "#demo", label: "Live Demo" },
  { href: "#open", label: "Why Open" },
];

function SignInButton({ className = "" }: { className?: string }) {
  return (
    <a
      href="/signin"
      className={`group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-drift-ember to-drift-amber px-4 py-2.5 text-sm font-semibold text-ink-950 shadow-[0_10px_30px_-10px_rgba(255,90,31,0.55)] transition-transform hover:scale-[1.03] ${className}`}
    >
      <Github className="h-[18px] w-[18px]" />
      Sign in with GitHub
      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </a>
  );
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 40));

  return (
    <>
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: heroDelay(1.5), duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed inset-x-0 top-0 z-[75] transition-all duration-500 ${
          scrolled ? "py-2.5" : "py-5"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6">
          <a
            href="#top"
            className={`flex items-center gap-2.5 rounded-2xl px-2 py-1.5 transition-all ${
              scrolled ? "glass" : ""
            }`}
          >
            <GlyphMark size={30} />
            <span className="font-display text-lg uppercase tracking-[0.1em] text-mist">
              Doc<span className="text-drift-ember">Drift</span>
            </span>
          </a>

          <nav
            aria-label="Primary"
            className={`hidden items-center gap-1 rounded-2xl px-2 py-1.5 lg:flex ${
              scrolled ? "glass" : ""
            }`}
          >
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-xl px-3.5 py-2 text-sm text-fog transition-colors hover:bg-ink-700/60 hover:text-mist"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2.5">
            <SignInButton className="hidden sm:inline-flex" />
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-mist lg:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, clipPath: "inset(0 0 100% 0)" }}
            animate={{ opacity: 1, clipPath: "inset(0 0 0% 0)" }}
            exit={{ opacity: 0, clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.45, ease: [0.76, 0, 0.24, 1] }}
            className="fixed inset-0 z-[74] flex flex-col justify-center bg-ink-950/95 px-8 backdrop-blur-xl lg:hidden"
          >
            <div className="flex flex-col gap-2">
              {LINKS.map((l, i) => (
                <motion.a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  initial={{ opacity: 0, x: -28 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 + i * 0.06 }}
                  className="border-b border-line py-4 font-display text-3xl uppercase tracking-wide text-mist"
                >
                  {l.label}
                </motion.a>
              ))}
              <motion.a
                href="/signin"
                onClick={() => setOpen(false)}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.42 }}
                className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-drift-ember to-drift-amber px-6 py-4 font-semibold text-ink-950"
              >
                <Github className="h-5 w-5" /> Sign in with GitHub
                <ArrowUpRight className="h-5 w-5" />
              </motion.a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
