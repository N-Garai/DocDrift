/* ────────────────────────────────────────────────────────────────────────────
 * Boot choreography shared between the Preloader and the hero.
 *
 * The full boot log runs once per browser session; on repeat visits within
 * the same session the preloader is skipped and every hero animation fires
 * almost immediately instead of waiting out the boot sequence again.
 * ──────────────────────────────────────────────────────────────────────────── */

const BOOT_KEY = "dd-booted";

/** True when this visit should skip the preloader (already booted this session). */
export const bootSkipped =
  typeof window !== "undefined" &&
  (() => {
    try {
      return window.sessionStorage.getItem(BOOT_KEY) === "1";
    } catch {
      return false;
    }
  })();

/** Remember that the boot sequence completed for this session. */
export function markBooted(): void {
  try {
    window.sessionStorage.setItem(BOOT_KEY, "1");
  } catch {
    /* private mode — preloader simply runs every visit */
  }
}

/**
 * Hero animation delays, in seconds.
 * `base` values are tuned against the full preloader (~1.9 s); when the
 * preloader is skipped the same choreography is compressed to near-zero.
 */
export function heroDelay(base: number): number {
  return bootSkipped ? Math.max(0.05, base - 1.35) : base;
}
