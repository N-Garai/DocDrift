"use client";

/** Infinite CSS marquee — duplicated track for a seamless loop. */
export function Marquee({
  items,
  reverse = false,
  className,
}: {
  items: string[];
  reverse?: boolean;
  className?: string;
}) {
  const row = [...items, ...items];
  return (
    <div
      className={`relative overflow-hidden ${className ?? ""}`}
      aria-hidden
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-ink-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-ink-950 to-transparent" />
      <div
        className={`flex w-max items-center gap-10 py-4 ${
          reverse ? "animate-marquee-rev" : "animate-marquee"
        }`}
      >
        {row.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="flex items-center gap-10 whitespace-nowrap font-mono text-[12px] uppercase tracking-[0.28em] text-fog/80"
          >
            {item}
            <span className="inline-block h-1.5 w-1.5 rotate-45 bg-drift-ember/50" />
          </span>
        ))}
      </div>
    </div>
  );
}
