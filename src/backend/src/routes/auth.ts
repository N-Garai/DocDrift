/**
 * DocDrift Studio — GitHub OAuth login + persistent session store.
 *
 * Flow (standard GitHub OAuth App, free — no billing required):
 *   1. GET  /api/auth/github/login     → 302 to github.com/login/oauth/authorize
 *   2. GET  /api/auth/github/callback  → code exchanged for an access token;
 *                                        token stored in the JSON store, browser
 *                                        gets an opaque httpOnly session cookie.
 *   3. GET  /api/auth/me               → session probe for the frontend gate.
 *   4. POST /api/auth/logout           → drop the session.
 *
 * The GitHub token never leaves the server: the browser only ever holds the
 * random session id. Sessions are persisted to data/docdrift-store.json so
 * the webhook handler (which has no browser cookie) can look up a user's
 * token by repo later.
 *
 * Access control: every route except /api/auth/*, /api/health, /api/scenarios
 * and the public demo /api/analyze requires a valid session — unauthenticated
 * visitors cannot reach the Studio or any user data. This prevents any
 * cross-user data leakage: a session only ever resolves to its own token and
 * its own repos.
 */
import { Router, type Request, type Response } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  config,
  githubOAuthConfigured,
  publicOrigin,
} from "../core/config.js";
import {
  saveSession,
  getSession as getStoredSessionRaw,
  deleteSession,
  type StoredSession,
  tokenForRepo,
} from "../core/store.js";

export interface GithubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

export interface Session {
  token: string;
  user: GithubUser;
  scopes: string[];
  expiresAt: number;
}

function toStored(id: string, s: Session): StoredSession {
  return {
    id,
    token: s.token,
    user: s.user,
    scopes: s.scopes,
    expiresAt: s.expiresAt,
  };
}

function toSession(stored: StoredSession): Session {
  return {
    token: stored.token,
    user: stored.user,
    scopes: stored.scopes,
    expiresAt: stored.expiresAt,
  };
}

/* ── session housekeeping ─────────────────────────────────────────────────── */

function createSession(token: string, user: GithubUser, scopes: string[]): string {
  const id = randomBytes(32).toString("base64url");
  const s: Session = {
    token,
    user,
    scopes,
    expiresAt: Date.now() + config.session.ttlMs,
  };
  saveSession(toStored(id, s));
  return id;
}

export function getSession(req: Request): Session | null {
  const id = readCookie(req, config.session.cookieName);
  if (!id) return null;
  const stored = getStoredSessionRaw(id);
  if (!stored) return null;
  return toSession(stored);
}

export function deleteSessionById(id: string): void {
  deleteSession(id);
}

/** Look up a user session by id (used by the webhook handler, no cookie). */
export function getStoredSession(id: string): StoredSession | null {
  return getStoredSessionRaw(id);
}

/** Look up a GitHub token for a repo (used by the webhook handler). */
export { tokenForRepo };

/** Read the session id from the request cookie (used when registering webhooks). */
export function getSessionId(req: Request): string | null {
  return readCookie(req, config.session.cookieName);
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function setCookie(res: Response, name: string, value: string, maxAgeSec: number): void {
  const secure =
    config.session.secureCookies === undefined
      ? isHttpsRequest(res.req)
      : config.session.secureCookies;
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  if (secure) attrs.push("Secure");
  const existing = res.getHeader("Set-Cookie");
  const list = (existing ? (Array.isArray(existing) ? existing : [existing]) : []).map(String);
  res.setHeader("Set-Cookie", [...list, attrs.join("; ")]);
}

function isHttpsRequest(req: Request): boolean {
  const proto = (req.get("x-forwarded-proto") ?? req.protocol).split(",")[0].trim();
  return proto === "https";
}

/* ── state (CSRF) helpers ─────────────────────────────────────────────────── */

function issueState(res: Response): string {
  const state = randomBytes(16).toString("base64url");
  setCookie(res, config.session.stateCookieName, state, 600); // 10 minutes
  return state;
}

function validState(req: Request, res: Response, state: string | null): boolean {
  const expected = readCookie(req, config.session.stateCookieName);
  setCookie(res, config.session.stateCookieName, "", 0);
  if (!state || !expected) return false;
  const a = Buffer.from(state);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ── routes ───────────────────────────────────────────────────────────────── */

export const authRouter = Router();

/** Probe endpoint used by the Studio auth gate. */
authRouter.get("/api/auth/me", (req, res) => {
  const session = getSession(req);
  res.json({
    authenticated: Boolean(session),
    oauthConfigured: githubOAuthConfigured(),
    user: session
      ? {
          login: session.user.login,
          name: session.user.name,
          avatarUrl: session.user.avatarUrl,
          htmlUrl: session.user.htmlUrl,
          scopes: session.scopes,
          expiresAt: new Date(session.expiresAt).toISOString(),
        }
      : null,
  });
});

authRouter.post("/api/auth/logout", (req, res) => {
  const id = readCookie(req, config.session.cookieName);
  if (id) deleteSession(id);
  setCookie(res, config.session.cookieName, "", 0);
  res.json({ ok: true });
});

authRouter.get("/api/auth/github/login", (req, res) => {
  if (!githubOAuthConfigured()) {
    return res.status(501).json({
      ok: false,
      error: "github oauth is not configured on this deployment",
      hint: "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET (see docs/SELF_HOSTING.md → GitHub login). The callback URL to register is <origin>/api/auth/github/callback.",
    });
  }
  const state = issueState(res);
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: `${publicOrigin(req)}/api/auth/github/callback`,
    scope: config.github.scope,
    state,
    allow_signup: String(config.github.allowSignup),
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

authRouter.get("/api/auth/github/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  const origin = publicOrigin(req);

  if (!githubOAuthConfigured()) {
    return res.status(501).send("GitHub OAuth is not configured on this deployment.");
  }
  if (!code || !validState(req, res, state)) {
    return res
      .status(400)
      .send("OAuth state mismatch or missing code — restart the sign-in flow.");
  }

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
        redirect_uri: `${origin}/api/auth/github/callback`,
      }),
    });
    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenData.access_token) {
      const why = tokenData.error_description ?? tokenData.error ?? "token exchange failed";
      return res.status(401).send(`GitHub sign-in failed: ${why}`);
    }

    const userRes = await fetch("https://api.github.com/user", {
      headers: ghApiHeaders(tokenData.access_token),
    });
    if (!userRes.ok) {
      return res.status(401).send(`GitHub /user failed with ${userRes.status}`);
    }
    const u = (await userRes.json()) as {
      login: string;
      name: string | null;
      avatar_url: string;
      html_url: string;
    };

    const sid = createSession(
      tokenData.access_token,
      {
        login: u.login,
        name: u.name,
        avatarUrl: u.avatar_url,
        htmlUrl: u.html_url,
      },
      (tokenData.scope ?? "").split(/[ ,]+/).filter(Boolean)
    );
    setCookie(res, config.session.cookieName, sid, config.session.ttlMs / 1000);
    res.redirect(`${origin}/studio?welcome=1`);
  } catch (err) {
    res.status(502).send(
      `GitHub OAuth failed: ${err instanceof Error ? err.message : "unknown error"}`
    );
  }
});

/* ── shared GitHub API helper (exported for the github routes) ────────────── */

export function ghApiHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "docdrift-studio",
  };
}

/**
 * Express middleware: require a signed-in session.
 * Unauthenticated requests get 401. Apply to every Studio / user-data route.
 * Can also be called directly to get the token: `requireSession(req, res)` returns
 * the token string or null if no session.
 */
export function requireSession(
  req: Request,
  res: Response,
  next?: (err?: any) => void
): string | null | void {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({
      ok: false,
      error: "not signed in",
      hint: "Start the flow at /api/auth/github/login",
    });
    if (next) return; // don't call next() after sending a response
    return null;
  }
  (req as any).session = session;
  if (next) {
    next();
    return;
  }
  return session.token;
}
