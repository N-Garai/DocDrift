/**
 * Observability: parser failure ledger + Sentry error tracking.
 *
 * The in-memory ledger keeps the most recent AST-parsing failures and
 * exposes them via /api/health. When SENTRY_DSN is set, failures are also
 * sent to Sentry (free tier, no credit card).
 */
import { captureParserFailure } from "./sentry.js";

export interface ParserFailure {
  file: string;
  reason: string;
  at: string;
}

const LEDGER_LIMIT = 50;
const ledger: ParserFailure[] = [];

export function recordParserFailure(file: string, reason: string): void {
  ledger.unshift({ file, reason: reason.slice(0, 300), at: new Date().toISOString() });
  if (ledger.length > LEDGER_LIMIT) ledger.pop();

  if (process.env.LOG_PARSE_FAILURES !== "0") {
    console.warn(`[docdrift:parser] ${file}: ${reason}`);
  }
  captureParserFailure(file, reason);
}

export function getParserFailures(): ParserFailure[] {
  return [...ledger];
}

export function parserFailureCount(): number {
  return ledger.length;
}
