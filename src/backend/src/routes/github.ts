/**
 * DocDrift Studio — GitHub API proxy (session-authenticated).
 *
 * All calls run server-side with the signed-in user's OAuth token, so private
 * repos are listed and read exactly like public ones, and the token itself
 * never reaches the browser. Endpoints:
 *
 *   GET  /api/github/repos                    → repos the user owns/collabs on
 *   GET  /api/github/repo/:owner/:repo/branches
 *   GET  /api/github/repo/:owner/:repo/tree?ref=
 *   GET  /api/github/repo/:owner/:repo/blob?path=&ref=   (raw file content)
 *   POST /api/github/repo/:owner/:repo/pr     → branch + commit docs + open PR
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { config } from "../core/config.js";
import { ghApiHeaders, getSession, requireSession, getSessionId } from "./auth.js";
import {
  saveWebhook,
  deleteWebhook,
  getWebhook,
  listWebhooks,
} from "../core/store.js";

export const githubRouter = Router();

function requireSession(req: Request, res: Response): string | null {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({
      ok: false,
      error: "not signed in",
      hint: "Start the flow at /api/auth/github/login",
    });
    return null;
  }
  return session.token;
}

/* ── shared GitHub API helper (exported for the webhook routes) ──────────── */

export async function ghFetch(token: string, url: string, init?: RequestInit): Promise<globalThis.Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...ghApiHeaders(token), ...(init?.headers ?? {}) },
  });
  return res;
}

async function ghJson<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const res = await ghFetch(token, url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw Object.assign(
      new Error(`GitHub API ${res.status} on ${new URL(url).pathname}: ${body.slice(0, 220)}`),
      { status: res.status }
    );
  }
  return (await res.json()) as T;
}

/* ── repos the user can analyze (private included via the `repo` scope) ───── */

interface RepoSummary {
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
  description: string | null;
  language: string | null;
  defaultBranch: string;
  stars: number;
  pushedAt: string | null;
  htmlUrl: string;
}

githubRouter.get("/api/github/repos", async (req, res) => {
  const token = requireSession(req, res);
  if (!token) return;

  try {
    const out: RepoSummary[] = [];
    for (let page = 1; page <= 3; page++) {
      const batch = await ghJson<Array<{
        full_name: string;
        owner: { login: string };
        name: string;
        private: boolean;
        description: string | null;
        language: string | null;
        default_branch: string;
        stargazers_count: number;
        pushed_at: string | null;
        html_url: string;
        archived: boolean;
      }>>(
        token,
        `https://api.github.com/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&per_page=100&page=${page}`
      );
      for (const r of batch) {
        if (r.archived) continue;
        out.push({
          fullName: r.full_name,
          owner: r.owner.login,
          name: r.name,
          private: r.private,
          description: r.description,
          language: r.language,
          defaultBranch: r.default_branch,
          stars: r.stargazers_count,
          pushedAt: r.pushed_at,
          htmlUrl: r.html_url,
        });
      }
      if (batch.length < 100) break;
    }
    res.json({ ok: true, repos: out, total: out.length });
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status && e.status >= 400 && e.status < 500 ? e.status : 502).json({
      ok: false,
      error: e.message,
    });
  }
});

/* ── branches ─────────────────────────────────────────────────────────────── */

githubRouter.get("/api/github/repo/:owner/:repo/branches", async (req, res) => {
  const token = requireSession(req, res);
  if (!token) return;
  const { owner, repo } = req.params;
  try {
    const branches = await ghJson<Array<{ name: string; commit: { sha: string } }>>(
      token,
      `https://api.github.com/repos/${owner}/${repo}/branches?per_page=50`
    );
    res.json({ ok: true, branches: branches.map((b) => b.name) });
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status && e.status >= 400 && e.status < 500 ? e.status : 502).json({
      ok: false,
      error: e.message,
    });
  }
});

/* ── file tree (recursive, blob entries only) ─────────────────────────────── */

githubRouter.get("/api/github/repo/:owner/:repo/tree", async (req, res) => {
  const token = requireSession(req, res);
  if (!token) return;
  const { owner, repo } = req.params;
  const ref = typeof req.query.ref === "string" && req.query.ref ? req.query.ref : "HEAD";
  try {
    const tree = await ghJson<{
      truncated: boolean;
      tree: Array<{ path: string; type: string; size?: number }>;
    }>(
      token,
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`
    );
    const files = tree.tree
      .filter((e) => e.type === "blob")
      .slice(0, config.limits.maxTreeEntries)
      .map((e) => ({ path: e.path as string, size: e.size ?? 0 }));
    res.json({ ok: true, ref, truncated: tree.truncated, files, count: files.length });
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status && e.status >= 400 && e.status < 500 ? e.status : 502).json({
      ok: false,
      error: e.message,
    });
  }
});

/* ── raw file content ─────────────────────────────────────────────────────── */

githubRouter.get("/api/github/repo/:owner/:repo/blob", async (req, res) => {
  const token = requireSession(req, res);
  if (!token) return;
  const { owner, repo } = req.params;
  const path = typeof req.query.path === "string" ? req.query.path : "";
  const ref = typeof req.query.ref === "string" && req.query.ref ? req.query.ref : "HEAD";
  if (!path || path.includes("..")) {
    return res.status(400).json({ ok: false, error: "invalid path" });
  }
  try {
    const r = await ghFetch(
      token,
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
      { headers: { Accept: "application/vnd.github.raw" } }
    );
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw Object.assign(new Error(`GitHub API ${r.status}: ${body.slice(0, 200)}`), {
        status: r.status,
      });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength > config.limits.maxFileBytes) {
      return res.status(413).json({
        ok: false,
        error: `file exceeds the ${Math.round(config.limits.maxFileBytes / 1024)} KB studio limit`,
      });
    }
    res.json({
      ok: true,
      path,
      ref,
      size: buf.byteLength,
      content: buf.toString("utf8"),
    });
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status && e.status >= 400 && e.status < 500 ? e.status : 502).json({
      ok: false,
      error: e.message,
    });
  }
});

/* ── webhook subscribe / unsubscribe (user's own token, user's own repo) ─── */

const webhookSchema = z.object({
  secret: z.string().min(8).max(128),
  baseBranch: z.string().min(1).max(200).default("main"),
  autoPr: z.boolean().default(true),
});

githubRouter.post(
  "/api/github/repo/:owner/:repo/webhook",
  requireSession,
  async (req: Request, res: Response) => {
    const session = (req as any).session as { token: string; user: { login: string } };
    const token = session.token;
    const { owner, repo } = req.params;
    const parsed = webhookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "invalid request",
        details: parsed.error.issues.slice(0, 6).map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }
    const { secret, baseBranch } = parsed.data;

    const origin = config.baseUrl
      ? config.baseUrl
      : (() => {
          const proto = (req.get("x-forwarded-proto") ?? req.protocol).split(",")[0].trim();
          const host = req.get("x-forwarded-host") ?? req.get("host") ?? "";
          return host ? `${proto}://${host}` : "";
        })();

    const callbackUrl = `${origin}/api/github/webhook`;

    // Check if a webhook with our callback already exists on this repo
    let existingId: number | null = null;
    try {
      const hooks = await ghJson<Array<{ id: number; config: { url: string } }>>(
        token,
        `https://api.github.com/repos/${owner}/${repo}/hooks`
      );
      existingId = hooks.find((h) => h.config.url === callbackUrl)?.id ?? null;
    } catch {
      // ignore — we'll try to create anyway
    }

    if (existingId) {
      // Update the existing webhook's secret + events to be safe
      await ghFetch(
        token,
        `https://api.github.com/repos/${owner}/${repo}/hooks/${existingId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config: { url: callbackUrl, secret, content_type: "json" },
            events: ["push"],
            active: true,
          }),
        }
      );
    } else {
      const created = await ghFetch(
        token,
        `https://api.github.com/repos/${owner}/${repo}/hooks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "web",
            config: { url: callbackUrl, secret, content_type: "json" },
            events: ["push"],
            active: true,
          }),
        }
      );
      if (!created.ok) {
        const body = await created.text().catch(() => "");
        return res
          .status(created.status)
          .json({ ok: false, error: `could not install webhook: ${body.slice(0, 300)}` });
      }
    }

    saveWebhook({
      owner,
      repo: repo,
      secret,
      installedAt: new Date().toISOString(),
      sessionId: getSessionId(req) ?? "",
    });

    res.json({
      ok: true,
      installed: true,
      callbackUrl,
      baseBranch,
    });
  }
);

githubRouter.delete(
  "/api/github/repo/:owner/:repo/webhook",
  requireSession,
  async (req: Request, res: Response) => {
    const session = (req as any).session as { token: string };
    const token = session.token;
    const { owner, repo } = req.params;

    const wh = getWebhook(owner, repo);
    if (wh) {
      // Remove the GitHub-side hook if we know its id — we didn't store the id,
      // so we enumerate and delete by matching callback URL.
      const origin = config.baseUrl
        ? config.baseUrl
        : (() => {
            const proto = (req.get("x-forwarded-proto") ?? req.protocol).split(",")[0].trim();
            const host = req.get("x-forwarded-host") ?? req.get("host") ?? "";
            return host ? `${proto}://${host}` : "";
          })();
      const callbackUrl = `${origin}/api/github/webhook`;
      try {
        const hooks = await ghJson<Array<{ id: number; config: { url: string } }>>(
          token,
          `https://api.github.com/repos/${owner}/${repo}/hooks`
        );
        const mine = hooks.find((h) => h.config.url === callbackUrl);
        if (mine) {
          await ghFetch(token, `https://api.github.com/repos/${owner}/${repo}/hooks/${mine.id}`, {
            method: "DELETE",
          });
        }
      } catch {
        // ignore
      }
      deleteWebhook(owner, repo);
    }

    res.json({ ok: true, removed: true });
  }
);

githubRouter.get("/api/github/webhooks", requireSession, (_req, res) => {
  res.json({ ok: true, webhooks: listWebhooks() });
});


/* ── open a docs PR: branch → blobs → tree → commit → update ref → PR ─────── */

const prSchema = z.object({
  base: z.string().min(1).max(200),
  branch: z.string().regex(/^[^~^:?*[\s\\]+$/, "invalid branch name").min(1).max(200),
  title: z.string().min(1).max(200),
  body: z.string().max(20_000).default(""),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(400),
        content: z.string().min(1).max(400_000),
      })
    )
    .min(1)
    .max(config.limits.maxPrFiles),
});

githubRouter.post("/api/github/repo/:owner/:repo/pr", async (req, res) => {
  const token = requireSession(req, res);
  if (!token) return;
  const { owner, repo } = req.params;

  const parsed = prSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "invalid request",
      details: parsed.error.issues.slice(0, 6).map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }
  const { base, branch, title, body, files } = parsed.data;

  try {
    // 1. base commit sha
    const baseRef = await ghJson<{ object: { sha: string } }>(
      token,
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(base)}`
    );
    const baseSha = baseRef.object.sha;

    // 2. create the working branch (reuse when it already exists)
    let headSha = baseSha;
    const createRef = await ghFetch(token, `https://api.github.com/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
    });
    if (!createRef.ok) {
      const payload = (await createRef.json().catch(() => ({}))) as { message?: string };
      if (!/reference already exists/i.test(payload.message ?? "")) {
        throw Object.assign(
          new Error(`could not create branch '${branch}': ${payload.message ?? createRef.status}`),
          { status: createRef.status }
        );
      }
      const existing = await ghJson<{ object: { sha: string } }>(
        token,
        `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`
      );
      headSha = existing.object.sha;
    }

    // 3. blobs for each doc file
    const treeItems: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
    for (const f of files) {
      const blob = await ghJson<{ sha: string }>(
        token,
        `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: Buffer.from(f.content, "utf8").toString("base64"), encoding: "base64" }),
        }
      );
      treeItems.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    }

    // 4. tree + commit + fast-forward the branch ref
    const tree = await ghJson<{ sha: string }>(
      token,
      `https://api.github.com/repos/${owner}/${repo}/git/trees`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base_tree: headSha, tree: treeItems }),
      }
    );
    const commit = await ghJson<{ sha: string; html_url: string }>(
      token,
      `https://api.github.com/repos/${owner}/${repo}/git/commits`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `${title}\n\n${body}`.slice(0, 6000),
          tree: tree.sha,
          parents: [headSha],
        }),
      }
    );
    await ghFetch(token, `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });

    // 5. open (or reuse) the pull request
    const prRes = await ghFetch(token, `https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, head: branch, base, body }),
    });
    if (!prRes.ok) {
      const payload = (await prRes.json().catch(() => ({}))) as { message?: string };
      // A pull request may already exist for this head/base pair — surface it honestly.
      const list = await ghJson<Array<{ html_url: string; number: number; state: string }>>(
        token,
        `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&base=${base}&state=open`
      );
      if (list.length > 0) {
        return res.json({ ok: true, created: false, pullRequest: list[0] });
      }
      throw Object.assign(
        new Error(`commit ${commit.sha} landed, but the PR could not be opened: ${payload.message ?? prRes.status}`),
        { status: prRes.status }
      );
    }
    const pr = (await prRes.json()) as { html_url: string; number: number; state: string };
    res.json({ ok: true, created: true, commitUrl: commit.html_url, pullRequest: pr });
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status && e.status >= 400 && e.status < 500 ? e.status : 502).json({
      ok: false,
      error: e.message,
    });
  }
});
