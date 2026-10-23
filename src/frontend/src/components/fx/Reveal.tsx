"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * Scroll-reveal primitives.
 *
 * `Reveal` / `Stagger` / `StaggerItem` deliberately do NOT rely on
 * framer-motion's declarative initial/animate API. In this stack (React 19 +
 * framer-motion 12 + static export) motion components outside the initial
 * viewport can get their entry animation scheduled but never started —
 * leaving whole sections permanently invisible (the "blank gap" bug).
 *
 * Instead: plain wrappers + IntersectionObserver + CSS transitions, with:
 *   - a fail-safe timer so no section can ever stay blank, and
 *   - a reduced-motion opt-out.
 */

export type RevealVariant =
  | "up"
  | "down"
  | "left"
  | "right"
  | "blur"
  | "scale"
  | "wipe";

const OFFSETS: Record<RevealVariant, { x?: number; y?: number }> = {
  up: { y: 42 },
  down: { y: -42 },
  left: { x: -48 },
  right: { x: 48 },
  blur: { y: 18 },
  scale: { y: 12 },
  wipe: { y: 0 },
};

function styleVars(
  variant: RevealVariant,
  delay: number,
  duration: number,
): CSSProperties {
  const offset = OFFSETS[variant];
  const vars: Record<string, string> = {
    "--rv-delay": `${delay}s`,
    "--rv-dur": `${duration}s`,
    "--rv-x": `${offset.x ?? 0}px`,
    "--rv-y": `${offset.y ?? 0}px`,
  };
  if (variant === "blur") vars["--rv-bl"] = "14px";
  if (variant === "scale") vars["--rv-sc"] = "0.9";
  if (variant === "wipe") {
    vars["--rv-cl"] = "inset(0 0 100% 0)";
    vars["--rv-cl-done"] = "inset(0 0 -10% 0)";
  }
  return vars as CSSProperties;
}

/** Shared reveal engine: fires `shown` when the element enters the viewport. */
function useReveal(
  ref: React.RefObject<HTMLDivElement | null>,
  amount: number,
): { revealed: boolean; reduced: boolean } {
  const [revealed, setRevealed] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setReduced(true);
      setRevealed(true);
      return;
    }

    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }

    let ioAlive = false; // any IntersectionObserver callback
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      setRevealed(true);
      io.disconnect();
      window.clearTimeout(failSafe);
    };

    const io = new IntersectionObserver(
      (entries) => {
        ioAlive = true;
        for (const entry of entries) {
          if (entry.isIntersecting) finish();
        }
      },
      { threshold: Math.min(Math.max(amount, 0.05), 1) },
    );
    io.observe(el);

    // Fail-safe: guaranteed reveal only when the observer never reports
    // anything (dead observer / broken hydration). If IO is alive we let it
    // drive the reveal naturally on scroll so the choreography survives.
    const failSafe = window.setTimeout(() => {
      if (!ioAlive) finish();
    }, 2200);

    return () => {
      io.disconnect();
      window.clearTimeout(failSafe);
    };
  }, [amount]);

  return { revealed, reduced };
}

export function Reveal({
  children,
  variant = "up",
  delay = 0,
  duration = 0.75,
  amount = 0.15,
  className,
}: {
  children: ReactNode;
  variant?: RevealVariant;
  /** seconds before the transition starts once revealed */
  delay?: number;
  /** seconds of the transition itself */
  duration?: number;
  /** how much of the element must be visible before the reveal fires */
  amount?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { revealed, reduced } = useReveal(ref, amount);

  if (reduced) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={["rv", className ?? ""].join(" ").trim()}
      data-rv={revealed ? "shown" : "hidden"}
      style={styleVars(variant, delay, duration)}
    >
      {children}
    </div>
  );
}

/**
 * Stagger container — sets the shared step delay its <StaggerItem> children
 * consume via `--stagger-gap`. Children reveal when the container enters the
 * viewport, each offset by `index * gap`.
 */
export function Stagger({
  children,
  className,
  gap = 0.09,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
  amount?: number;
}) {
  // `amount` kept in the signature for API compatibility.
  return (
    <div
      className={className}
      style={{ ["--stagger-gap" as string]: `${gap}s` }}
    >
      {children}
    </div>
  );
}

export function StaggerItem({
  children,
  className,
  variant = "up",
}: {
  children: ReactNode;
  className?: string;
  variant?: RevealVariant;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const { revealed, reduced } = useReveal(ref, 0.08);

  // Index is derived from DOM position so no caller has to pass it.
  useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const children = Array.from(parent.children);
    setIndex(Math.max(0, children.indexOf(el)));
  }, []);

  if (reduced) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  const style = styleVars(variant, 0, 0.7) as Record<string, string>;
  style["--rv-delay"] = `calc(${index} * var(--stagger-gap, 0.09s))`;

  return (
    <div
      ref={ref}
      className={["rv", className ?? ""].join(" ").trim()}
      data-rv={revealed ? "shown" : "hidden"}
      style={style as CSSProperties}
    >
      {children}
    </div>
  );
}
