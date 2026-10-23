/**
 * DocDrift keep-warm layer (pattern borrowed from Git-Voice, MIT).
 *
 * Free-tier web services (Render et al.) sleep after ~15 minutes without an
 * inbound request, and the first visitor then waits ~50 s for the restart.
 * When the server knows its public address (APP_BASE_URL or the platform's
 * RENDER_EXTERNAL_URL) and runs in production, it pings its own public
 * /api/health every 13.5 minutes — just inside the idle window — so the gap
 * between requests never reaches the sleep threshold. Traffic to the public
 * URL passes the platform edge, which is what resets the idle timer.
 *
 * Set KEEP_WARM=off to disable (e.g. on a paid plan or a dedicated box).
 */
import { isProduction } from "./core/config.js";

export const KEEP_WARM_INTERVAL_MS = 13.5 * 60 * 1000;

/**
 * Pure resolver so the rules are unit-testable.
 * Returns the self-ping URL, or null when keep-warm must stay off.
 */
export function resolveKeepWarmTarget(
  env: Record<string, string | undefined>,
  production: boolean
): string | null {
  const flag = (env.KEEP_WARM ?? "").toLowerCase();
  if (flag === "off" || flag === "0" || flag === "false") return null;
  if (!production) return null;
  const base = env.APP_BASE_URL || env.RENDER_EXTERNAL_URL || "";
  // Ping only real deployments: localhost traffic never reaches a platform's
  // edge router, so it cannot reset the idle timer.
  if (!base) return null;
  if (/\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(base)) return null;
  if (!/^https?:\/\//.test(base)) return null;
  return `${base.replace(/\/+$/, "")}/api/health`;
}

function keepWarmTarget(): string | null {
  return resolveKeepWarmTarget(process.env, isProduction());
}

export function startKeepWarm(): void {
  const target = keepWarmTarget();
  if (!target) return;
  const timer = setInterval(() => {
    fetch(target)
      .then((res) => {
        if (!res.ok) console.warn(`[keep-warm] self-ping answered ${res.status}`);
      })
      .catch((err: unknown) => {
        // Degraded log only: a missed ping at worst costs one cold start.
        console.warn(
          "[keep-warm] self-ping failed:",
          err instanceof Error ? err.message : err
        );
      });
  }, KEEP_WARM_INTERVAL_MS);
  timer.unref();
  console.log(
    `[docdrift] keep-warm: pinging ${target} every ${Math.round(KEEP_WARM_INTERVAL_MS / 60000)} min (inside the ~15 min idle window)`
  );
}
