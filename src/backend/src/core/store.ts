/**
 * DocDrift — lightweight JSON file store.
 *
 * Persists (across restarts):
 *   - sessions: id -> { token, user, scopes, expiresAt }
 *   - webhooks: "<owner>/<repo>" -> { owner, repo, secret, installedAt, sessionId }
 *
 * Why persistence matters here: GitHub push webhooks arrive from GitHub's
 * servers, independent of any browser session. The webhook handler must be
 * able to look up *which user owns a repo* and *their GitHub token* without
 * a cookie present. An in-memory Map would lose that on every restart.
 *
 * This is a zero-dependency store (no Neon/Postgres needed for the
 * hackathon scale). For production, swap the JSON backend for SQLite or
 * Postgres — the interface stays the same.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = process.env.DOC_DRIFT_DATA_DIR
  ? process.env.DOC_DRIFT_DATA_DIR
  : join(process.cwd(), "data");
const STORE_PATH = join(DATA_DIR, "docdrift-store.json");

export interface StoredSession {
  id: string;
  token: string;
  user: {
    login: string;
    name: string | null;
    avatarUrl: string;
    htmlUrl: string;
  };
  scopes: string[];
  expiresAt: number;
}

export interface StoredWebhook {
  owner: string;
  repo: string;
  secret: string;
  installedAt: string;
  sessionId: string;
}

interface Store {
  sessions: Record<string, StoredSession>;
  webhooks: Record<string, StoredWebhook>;
}

const EMPTY: Store = { sessions: {}, webhooks: {} };

let cache: Store | null = null;

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readStore(): Store {
  if (cache) return cache;
  ensureDir();
  if (!existsSync(STORE_PATH)) {
    cache = { ...EMPTY };
    return cache;
  }
  try {
    const raw = readFileSync(STORE_PATH, "utf8");
    cache = JSON.parse(raw) as Store;
    cache.sessions = cache.sessions ?? {};
    cache.webhooks = cache.webhooks ?? {};
    return cache;
  } catch {
    cache = { ...EMPTY };
    return cache;
  }
}

function writeStore(store: Store): void {
  ensureDir();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  cache = store;
}

/* ── session operations ───────────────────────────────────────────────────── */

export function saveSession(session: StoredSession): void {
  const store = readStore();
  store.sessions[session.id] = session;
  writeStore(store);
}

export function getSession(id: string): StoredSession | null {
  const store = readStore();
  const s = store.sessions[id];
  if (!s) return null;
  if (s.expiresAt <= Date.now()) {
    delete store.sessions[id];
    writeStore(store);
    return null;
  }
  return s;
}

export function deleteSession(id: string): void {
  const store = readStore();
  delete store.sessions[id];
  writeStore(store);
}

export function sweepSessions(): number {
  const now = Date.now();
  const store = readStore();
  let removed = 0;
  for (const [id, s] of Object.entries(store.sessions)) {
    if (s.expiresAt <= now) {
      delete store.sessions[id];
      removed++;
    }
  }
  if (removed > 0) writeStore(store);
  return removed;
}

export function listSessions(): StoredSession[] {
  return Object.values(readStore().sessions);
}

/* ── webhook registration operations ──────────────────────────────────────── */

function webhookKey(owner: string, repo: string): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

export function saveWebhook(wh: StoredWebhook): void {
  const store = readStore();
  store.webhooks[webhookKey(wh.owner, wh.repo)] = wh;
  writeStore(store);
}

export function getWebhook(owner: string, repo: string): StoredWebhook | null {
  return readStore().webhooks[webhookKey(owner, repo)] ?? null;
}

export function deleteWebhook(owner: string, repo: string): boolean {
  const store = readStore();
  const key = webhookKey(owner, repo);
  if (!(key in store.webhooks)) return false;
  delete store.webhooks[key];
  writeStore(store);
  return true;
}

export function listWebhooks(): StoredWebhook[] {
  return Object.values(readStore().webhooks);
}

/* ── lookups used by the webhook handler ──────────────────────────────────── */

export function sessionForRepo(owner: string, repo: string): StoredSession | null {
  const wh = getWebhook(owner, repo);
  if (!wh) return null;
  return getSession(wh.sessionId);
}

export function tokenForRepo(owner: string, repo: string): string | null {
  const s = sessionForRepo(owner, repo);
  return s ? s.token : null;
}

/** Alias of getSession, used by the webhook handler (no cookie context). */
export function getStoredSession(id: string): StoredSession | null {
  return getSession(id);
}
