/**
 * DocDrift engine — runtime configuration.
 *
 * Everything is optional by design: the deterministic engine runs with zero
 * env vars. GitHub OAuth unlocks the Studio (private repo access + PR
 * drafting); APP_BASE_URL powers the keep-warm self-ping on free hosting.
 */

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return !["0", "false", "off", "no"].includes(v.toLowerCase());
}

export const config = {
  nodeEnv: str("NODE_ENV", "development"),

  /** Public base URL of the deployment (used for OAuth callback + keep-warm). */
  baseUrl: str("APP_BASE_URL") || str("RENDER_EXTERNAL_URL"),

  /** Sentry DSN for error tracking (free tier). Leave empty to disable. */
  sentryDsn: str("SENTRY_DSN"),

  /** GitHub OAuth App credentials — create one for free under Settings → Developer settings. */
  github: {
    clientId: str("GITHUB_CLIENT_ID"),
    clientSecret: str("GITHUB_CLIENT_SECRET"),
    // `repo` covers private repos; `read:user` lets us show who is signed in.
    scope: str("GITHUB_OAUTH_SCOPE", "repo read:user"),
    allowSignup: bool("GITHUB_ALLOW_SIGNUP", true),
  },

  session: {
    /** In-memory session TTL (7 days). Sessions are ephemeral by design. */
    ttlMs: 7 * 24 * 60 * 60 * 1000,
    cookieName: "dd_session",
    stateCookieName: "dd_oauth_state",
    secureCookies: str("COOKIE_SECURE", "auto") === "force" || undefined,
  },

  keepWarm: {
    enabled: bool("KEEP_WARM", true),
    /** Just inside the ~15-minute free-tier idle window (Git-Voice pattern). */
    intervalMs: 13.5 * 60 * 1000,
  },

  /** Studio fetch guards. */
  limits: {
    maxTreeEntries: 8000,
    maxFileBytes: 400 * 1024,
    maxPrFiles: 8,
  },
} as const;

export const isProduction = () => config.nodeEnv === "production";

/**
 * Resolve the public origin for OAuth redirects and self-pings.
 * Priority: APP_BASE_URL / RENDER_EXTERNAL_URL → request headers (works on
 * Render, the sandbox gateway and any reverse proxy with X-Forwarded-* set).
 */
export function publicOrigin(req?: { protocol: string; get(h: string): string | undefined }): string {
  if (config.baseUrl) return config.baseUrl.replace(/\/+$/, "");
  if (!req) return "";
  const proto = (req.get("x-forwarded-proto") ?? req.protocol).split(",")[0].trim();
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "";
  return host ? `${proto}://${host}` : "";
}

export function githubOAuthConfigured(): boolean {
  return Boolean(config.github.clientId && config.github.clientSecret);
}
