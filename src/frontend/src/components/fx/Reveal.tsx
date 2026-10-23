"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

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

export function Reveal({
  children,
  variant = "up",
  delay = 0,
  duration = 0.75,
  amount = 0.15,
  once = true,
  className,
}: {
  children: ReactNode;
  variant?: RevealVariant;
  delay?: number;
  duration?: number;
  amount?: number;
  once?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  const offset = OFFSETS[variant];
  const hidden: Record<string, unknown> = {
    opacity: 0,
    x: offset.x ?? 0,
    y: offset.y ?? 0,
  };
  if (variant === "blur") {
    hidden.filter = "blur(14px)";
  }
  if (variant === "scale") {
    hidden.scale = 0.9;
  }
  if (variant === "wipe") {
    hidden.clipPath = "inset(0 0 100% 0)";
  }

  const shown: Record<string, unknown> = {
    opacity: 1,
    x: 0,
    y: 0,
    filter: "blur(0px)",
    scale: 1,
    clipPath: "inset(0 0 -10% 0)",
  };

  return (
    <motion.div
      className={className}
      initial={hidden}
      whileInView={shown}
      viewport={{ once, amount }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Stagger container: children using <StaggerItem> reveal in sequence. */
export function Stagger({
  children,
  className,
  gap = 0.09,
  amount = 0.12,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
  amount?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount }}
      variants={{
        hidden: {},
        shown: { transition: { staggerChildren: gap } },
      }}
    >
      {children}
    </motion.div>
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
  const offset = OFFSETS[variant];
  return (
    <motion.div
      className={className}
      variants={{
        hidden: {
          opacity: 0,
          x: offset.x ?? 0,
          y: offset.y ?? 0,
          filter: variant === "blur" ? "blur(10px)" : "blur(0px)",
        },
        shown: {
          opacity: 1,
          x: 0,
          y: 0,
          filter: "blur(0px)",
          transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
