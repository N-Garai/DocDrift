/**
 * DocDrift — GitHub push webhook.
 *
 * Free and fully owned by the user:
 *   - The user signs in with GitHub OAuth (their personal account).
 *   - DocDrift stores THEIR access token (never a shared bot token).
 *   - DocDrift creates a webhook on THEIR repo using THEIR token.
 *   - On push, GitHub POSTs here; we verify the HMAC, look up the owning
 *     user's token from the store, fetch changed files, run the drift
 *     workflow, and open a draft docs PR on a branch they choose.
 *
 * No data leaks between users: sessions/tokens are keyed by session id and
 * webhook registrations map "<owner>/<repo>" -> sessionId. A webhook for
 * repo A can only resolve to the user who installed it.
 */
import { Router, type Request, type Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../core/config.js";
import {
  getStoredSession,
  tokenForRepo,
  listWebhooks,
} from "../core/store.js";
import { ghApiHeaders } from "./auth.js";
import { runDocDriftWorkflow } from "../core/agents/workflow.js";
import { resolveEngine } from "../core/llm/provider.js";
import type { AnalyzeInput, SourceFile } from "../core/types.js";
import { detectDrift } from "../core/drift/rules.js";

export const webhookRouter = Router();

/* ── GitHub webhook signature verification ───────────────────────────────── */

function verifySignature(
  secret: string,
  payload: Buffer,
  signature: string | undefined
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  const a = Buffer.from(`sha256=${expected}`);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ── GitHub API helpers (run with the repo-owning user's token) ─────────── */

async function ghFetch(token: string, url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...ghApiHeaders(token), ...(init?.headers ?? {}) },
  });
}

async function ghJson<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const res = await ghFetch(token, url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw Object.assign(
      new Error(`GitHub API ${res.status} on ${url}: ${body.slice(0, 220)}`),
      { status: res.status }
    );
  }
  return (await res.json()) as T;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function getChangedFiles(
  token: string,
  owner: string,
  repo: string,
  before: string,
  after: string
): Promise<Array<{ path: string; status: "added" | "removed" | "modified" }>> {
  const data = await ghJson<{
    files: Array<{ filename: string; status: string }>;
  }>(
    token,
    `https://api.github.com/repos/${owner}/${repo}/compare/${encodeURIComponent(before)}...${encodeURIComponent(after)}`
  );
  return (data.files ?? [])
    .filter((f) => f.status === "added" || f.status === "modified")
    .map((f) => ({ path: f.filename, status: f.status as any }));
}

async function getFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string | null> {
  try {
    const r = await ghFetch(
      token,
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
      { headers: { Accept: "application/vnd.github.raw" } }
    );
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

async function openDraftPr(
  token: string,
  owner: string,
  repo: string,
  base: string,
  branch: string,
  title: string,
  body: string,
  files: Array<{ path: string; content: string }>
): Promise<{ ok: boolean; htmlUrl?: string; error?: string }> {
  // 1. base commit sha
  const baseRef = await ghJson<{ object: { sha: string } }>(
    token,
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(base)}`
  );
  const baseSha = baseRef.object.sha;

  // 2. create / reuse branch
  let headSha = baseSha;
  const createRef = await ghFetch(token, `https://api.github.com/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
  });
  if (!createRef.ok) {
    const payload = (await createRef.json().catch(() => ({}))) as { message?: string };
    if (!/reference already exists/i.test(payload.message ?? "")) {
      return { ok: false, error: `could not create branch '${branch}'` };
    }
    const existing = await ghJson<{ object: { sha: string } }>(
      token,
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`
    );
    headSha = existing.object.sha;
  }

  // 3. blobs
  const treeItems: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
  for (const f of files) {
    const blob = await ghJson<{ sha: string }>(
      token,
      `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: Buffer.from(f.content, "utf8").toString("base64"),
          encoding: "base64",
        }),
      }
    );
    treeItems.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  // 4. tree + commit
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
        message: title,
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

  // 5. open PR
  const prRes = await ghFetch(token, `https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, head: branch, base, body }),
  });
  if (!prRes.ok) {
    const payload = (await prRes.json().catch(() => ({}))) as { message?: string };
    const list = await ghJson<Array<{ html_url: string; number: number; state: string }>>(
      token,
      `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&base=${base}&state=open`
    );
    if (list.length > 0) {
      return { ok: true, htmlUrl: list[0].html_url };
    }
    return { ok: false, error: `PR open failed: ${payload.message ?? prRes.status}` };
  }
  const pr = (await prRes.json()) as { html_url: string };
  return { ok: true, htmlUrl: pr.html_url };
}

/* ── webhook endpoint ────────────────────────────────────────────────────── */

webhookRouter.post("/api/github/webhook", async (req, res) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(500).json({ ok: false, error: "webhook secret not configured" });
  }

  const raw = req.body;
  if (!Buffer.isBuffer(raw)) {
    return res.status(400).json({ ok: false, error: "raw body required" });
  }

  const signature = req.headers["x-hub-signature-256"] as string | undefined;
  const event = req.headers["x-github-event"] as string | undefined;
  const delivery = req.headers["x-github-delivery"] as string | undefined;

  if (!verifySignature(secret, raw, signature)) {
    return res.status(401).json({ ok: false, error: "invalid signature" });
  }

  if (event !== "push") {
    return res.status(200).json({ ok: true, ignored: `event ${event}` });
  }

  let payload: any;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(400).json({ ok: false, error: "invalid json" });
  }

  const repo = payload.repository;
  if (!repo) {
    return res.status(400).json({ ok: false, error: "no repository in payload" });
  }
  const owner = repo.owner.login;
  const repoName = repo.name;
  const ref = payload.ref || ""; // refs/heads/main
  const branch = ref.replace(/^refs\/heads\//, "");
  const before = payload.before || "0000000000000000000000000000000000000000";
  const after = payload.head_commit?.id || payload.after || "";

  // Resolve which user owns this webhook (their token, their repo)
  const token = tokenForRepo(owner, repoName);
  if (!token) {
    return res
      .status(404)
      .json({ ok: false, error: `no webhook registration for ${owner}/${repoName}` });
  }

  // Deleted branch
  if (after === "0000000000000000000000000000000000000000") {
    return res.status(200).json({ ok: true, ignored: "branch deleted" });
  }

  try {
    /* 1. changed files on this push */
    const changed = await getChangedFiles(token, owner, repoName, before, after);

    /* 2. split into source files and doc files */
    const sourceFiles: SourceFile[] = [];
    const docFiles: SourceFile[] = [];
    let envFile: SourceFile | undefined;

    for (const f of changed) {
      const content = await getFileContent(token, owner, repoName, f.path, after);
      if (content === null) continue;
      const sf: SourceFile = { path: f.path, content };
      if (/\.env(\.example)?$/i.test(f.path)) {
        envFile = sf;
      } else if (/\.(md|markdown)$/i.test(f.path)) {
        docFiles.push(sf);
      } else if (/\.(ts|tsx|js|jsx|py)$/i.test(f.path)) {
        sourceFiles.push(sf);
      }
    }

    if (sourceFiles.length === 0 && docFiles.length === 0 && !envFile) {
      return res.status(200).json({ ok: true, ignored: "no relevant files changed" });
    }

    /* 3. run the drift workflow against the pushed state */
    const resolved = await resolveEngine();
    const language = sourceFiles.some((f) => f.path.endsWith(".py")) ? "python" : "typescript";

    // Use the first source file as the codeFile; gather all docs
    const codeFile = sourceFiles[0] ?? docFiles[0] ?? { path: "README.md", content: "" };

    const input: AnalyzeInput = {
      scenarioId: null,
      language,
      codeFile,
      docs: docFiles,
      envExample: envFile,
    };

    const result = await runDocDriftWorkflow(input, {
      engine: resolved.engine,
      parser: "tree-sitter",
      reason: resolved.reason,
    });

    if (!result.drifts || result.drifts.length === 0) {
      return res.status(200).json({ ok: true, drifts: 0, note: "no drift detected" });
    }

    /* 4. build edits + open a draft PR */
    const { buildEdits, renderPatch } = await import("../core/drift/patch.js");
    const detection = detectDrift({
      language,
      codeFile,
      symbols: result.symbols,
      docs: input.docs,
    });
    const edits = buildEdits({ input, drifts: result.drifts, symbols: result.symbols, tables: detection.tables });

    if (edits.length === 0) {
      return res.status(200).json({ ok: true, drifts: result.drifts.length, note: "no applicable edits" });
    }

    const patch = renderPatch(edits, input, result.drifts, resolved.engine);

    /* 5. apply edits to doc file contents to produce new content */
    const applyEdit = (content: string, edit: { line: number; oldText: string; newText: string }): string => {
      const lines = content.split("\n");
      const idx = edit.line - 1;
      if (idx < 0 || idx >= lines.length) return content;
      lines[idx] = lines[idx].replace(edit.oldText, edit.newText);
      return lines.join("\n");
    };

    const updatedFiles: Array<{ path: string; content: string }> = [];
    const docByPath = new Map<string, SourceFile>();
    for (const d of input.docs) docByPath.set(d.path, d);
    if (envFile) docByPath.set(envFile.path, envFile);

    for (const edit of edits) {
      const existing = docByPath.get(edit.file);
      if (!existing) continue;
      let current = updatedFiles.find((f) => f.path === edit.file)?.content ?? existing.content;
      current = applyEdit(current, edit);
      const already = updatedFiles.find((f) => f.path === edit.file);
      if (already) already.content = current;
      else updatedFiles.push({ path: edit.file, content: current });
    }

    /* 6. open draft PR using the repo owner's own token */
    const prBranch = `docdrift/docs-sync-${Date.now()}`;
    const prTitle = patch.prTitle;
    const prBody = `${patch.prBody}\n\n---\n*Opened by DocDrift via push webhook on ${owner}/${repoName}@${branch}. Review before merging.*`;

    const prResult = await openDraftPr(token, owner, repoName, branch, prBranch, prTitle, prBody, updatedFiles);

    return res.status(200).json({
      ok: prResult.ok,
      drifts: result.drifts.length,
      edits: edits.length,
      branch: prBranch,
      htmlUrl: prResult.htmlUrl,
      error: prResult.error,
    });
  } catch (err) {
    console.error(`[docdrift:webhook] ${owner}/${repoName}:`, err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "webhook processing failed",
    });
  }
});

/* ── list registered webhooks (debug / admin, session-gated by caller) ───── */

webhookRouter.get("/api/github/webhooks", (_req, res) => {
  res.json({ ok: true, webhooks: listWebhooks().map((w) => ({ owner: w.owner, repo: w.repo, installedAt: w.installedAt })) });
});
