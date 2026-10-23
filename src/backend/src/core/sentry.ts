/**
 * DocDrift — Sentry error tracking (free tier, no credit card).
 *
 * Initialize once at backend startup. All AST-parser failures and
 * workflow exceptions are captured here. If SENTRY_DSN is not set,
 * Sentry is a no-op and the in-memory parser-failure ledger is the only
 * signal (still exposed via /api/health).
 */
import * as Sentry from "@sentry/node";

let initialized = false;

export function initSentry(dsn?: string): void {
  if (initialized) return;
  if (!dsn) {
    // No DSN: Sentry is disabled, but we keep the API surface stable.
    initialized = true;
    return;
  }
  Sentry.init({
    dsn,
    tracesSampleRate: 0.0, // we don't need performance tracing for this tool
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.DOC_DRIFT_VERSION ?? "1.2.0",
    beforeSend(event) {
      // Never send user GitHub tokens or secrets to Sentry.
      if (event.request?.headers?.cookie) {
        event.request.headers.cookie = "[redacted]";
      }
      if (event.extra?.githubToken) {
        event.extra.githubToken = "[redacted]";
      }
      if (event.extra?.sessionId) {
        event.extra.sessionId = "[redacted]";
      }
      return event;
    },
  });
  initialized = true;
}

export { Sentry };

export function captureParserFailure(file: string, reason: string): void {
  Sentry.captureException(new Error(`parser failure: ${reason}`), {
    tags: { component: "parser", file },
    extra: { file, reason },
  });
}

export function captureWorkflowError(error: unknown, context?: Record<string, unknown>): void {
  Sentry.captureException(error as Error, {
    tags: { component: "workflow" },
    extra: context,
  });
}
