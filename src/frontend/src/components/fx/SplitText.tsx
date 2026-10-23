"use client";

import { motion } from "framer-motion";

/**
 * Word/char-level typography reveal (zentry-style rise + settle).
 * Splits on spaces; each word animates up from a clipping mask.
 */
export function SplitText({
  text,
  className,
  wordClassName,
  delay = 0,
  stagger = 0.055,
  duration = 0.85,
  as: Tag = "span",
}: {
  text: string;
  className?: string;
  /** string class or (word) => class for per-word styling */
  wordClassName?: string | ((word: string) => string | undefined);
  delay?: number;
  stagger?: number;
  duration?: number;
  as?: "span" | "h1" | "h2" | "h3" | "p";
}) {
  const words = text.split(" ");
  const MotionTag = motion[Tag];

  return (
    <MotionTag
      className={className}
      initial="hidden"
      animate="shown"
      aria-label={text}
      variants={{
        hidden: {},
        shown: { transition: { staggerChildren: stagger, delayChildren: delay } },
      }}
    >
      {words.map((word, i) => {
        const cls =
          typeof wordClassName === "function"
            ? wordClassName(word)
            : wordClassName;
        return (
          <span
            key={`${word}-${i}`}
            className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-bottom"
            aria-hidden
          >
            <motion.span
              className={`inline-block will-change-transform ${cls ?? ""}`}
              variants={{
                hidden: { y: "115%", rotate: 4, opacity: 0 },
                shown: {
                  y: "0%",
                  rotate: 0,
                  opacity: 1,
                  transition: { duration, ease: [0.22, 1, 0.36, 1] },
                },
              }}
            >
              {word}
              {i < words.length - 1 ? "\u00A0" : ""}
            </motion.span>
          </span>
        );
      })}
    </MotionTag>
  );
}

/** Character-level variant for eyebrow/mono labels. */
export function SplitChars({
  text,
  className,
  delay = 0,
  stagger = 0.028,
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
}) {
  return (
    <motion.span
      className={`inline-block ${className ?? ""}`}
      initial="hidden"
      animate="shown"
      aria-label={text}
      variants={{
        hidden: {},
        shown: { transition: { staggerChildren: stagger, delayChildren: delay } },
      }}
    >
      {Array.from(text).map((ch, i) => (
        <motion.span
          key={`${ch}-${i}`}
          className="inline-block will-change-transform"
          aria-hidden
          variants={{
            hidden: { y: 14, opacity: 0 },
            shown: {
              y: 0,
              opacity: 1,
              transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
            },
          }}
        >
          {ch === " " ? "\u00A0" : ch}
        </motion.span>
      ))}
    </motion.span>
  );
}
