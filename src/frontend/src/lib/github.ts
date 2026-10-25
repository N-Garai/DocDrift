/* ────────────────────────────────────────────────────────────────────────────
 * Studio client — GitHub-flavored API helpers.
 *
 * All auth/GitHub calls use plain same-origin paths: in dev the Next.js dev
 * server proxies /api/* to the engine (see next.config.ts), in production the
 * Express engine serves the frontend itself. The session cookie is httpOnly
 * and handled entirely by the browser — no token ever touches JS.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface Me {
  authenticated: boolean;
  oauthConfigured: boolean;
  user: {
    login: string;
    name: string | null;
    avatarUrl: string;
    htmlUrl: string;
    scopes: string[];
    expiresAt: string;
  } | null;
}

export interface RepoInfo {
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

export interface TreeFile {
  path: string;
  size: number;
}

export class ApiError extends Error {
  status: number;
  hint?: string;
  constructor(message: string, status: number, hint?: string) {
    super(message);
    this.status = status;
    this.hint = hint;
  }
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // Never swallow a malformed response — the caller needs the truth.
    throw new ApiError(`invalid response from ${path} (${res.status})`, res.status);
  }
  if (!res.ok || data.ok === false) {
    throw new ApiError(
      (data.error as string) ?? `request failed (${res.status})`,
      res.status,
      data.hint as string | undefined
    );
  }
  return data as T;
}

export function fetchMe(): Promise<Me> {
  return json<Me>("/api/auth/me");
}

export function logout(): Promise<{ ok: boolean }> {
  return json<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export function fetchRepos(): Promise<{ repos: RepoInfo[]; total: number }> {
  return json("/api/github/repos");
}

export function fetchBranches(owner: string, repo: string): Promise<{ branches: string[] }> {
  return json(`/api/github/repo/${owner}/${repo}/branches`);
}

export function fetchTree(
  owner: string,
  repo: string,
  ref: string
): Promise<{ files: TreeFile[]; truncated: boolean; count: number }> {
  return json(
    `/api/github/repo/${owner}/${repo}/tree?ref=${encodeURIComponent(ref)}`
  );
}

export function fetchBlob(
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<{ path: string; content: string; size: number }> {
  return json(
    `/api/github/repo/${owner}/${repo}/blob?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}`
  );
}

export interface PrFile {
  path: string;
  content: string;
}

export interface CommitFileInfo {
  filename: string;
  status: string;
}

export interface CommitSummary {
  sha: string;
  shortSha: string;
  message: string;
  date: string;
  files: CommitFileInfo[];
}

export function fetchCommits(
  owner: string,
  repo: string,
  ref: string,
  limit = 10
): Promise<{ head: string | null; commits: CommitSummary[] }> {
  return json(
    `/api/github/repo/${owner}/${repo}/commits?sha=${encodeURIComponent(ref)}&limit=${limit}`
  );
}

/**
 * Files the docs themselves reference — the engine's repo-context pick.
 * Scans markdown/env content for backticked or linked paths of analyzed
 * code types that exist in the tree, skipping files already selected.
 */
export function findDocReferencedCode(
  docContents: { path: string; content: string }[],
  treeFiles: TreeFile[],
  exclude: string[],
  max = 8
): string[] {
  const code = new Set(treeFiles.filter((f) => CODE_RE.test(f.path)).map((f) => f.path));
  const skip = new Set(exclude);
  const found: string[] = [];
  const pathRe = /[\w./@~-]+\.(?:ts|tsx|py)\b/g;
  for (const d of docContents) {
    if (found.length >= max) break;
    for (const m of d.content.matchAll(pathRe)) {
      const candidate = m[0].replace(/^\.\//, "");
      // anchor either at repo root or under any directory that matches a suffix
      if (code.has(candidate) && !skip.has(candidate)) {
        if (!found.includes(candidate)) found.push(candidate);
        continue;
      }
      for (const p of code) {
        if (p.endsWith(`/${candidate}`) && !skip.has(p)) {
          if (!found.includes(p)) found.push(p);
          break;
        }
      }
    }
    if (found.length >= max) break;
  }
  return found.slice(0, max);
}

export function openDocsPr(
  owner: string,
  repo: string,
  payload: { base: string; branch: string; title: string; body: string; files: PrFile[] }
): Promise<{ created: boolean; pullRequest: { html_url: string; number: number; state: string } }> {
  return json(`/api/github/repo/${owner}/${repo}/pr`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* ── file curation heuristics ─────────────────────────────────────────────── */

const CODE_RE = /\.(ts|tsx|py)$/;
const EXCLUDE_RE =
  /(^|\/)(node_modules|dist|build|out|\.next|coverage|vendor|__pycache__|\.venv|venv|tests?|__tests__|__mocks__)(\/|$)|\.d\.ts$|\.test\.|\.spec\.|_test\.py$/;
const PRIORITY_RE =
  /(config|settings|server|app|main|index|cli|entry|setup|env|routes?|api)/i;

/** Rank source files so the interesting entry points come first. */
export function curateCodeFiles(files: TreeFile[], max = 14): TreeFile[] {
  return files
    .filter((f) => CODE_RE.test(f.path) && !EXCLUDE_RE.test(f.path) && f.size < 200_000)
    .sort((a, b) => {
      const pa = PRIORITY_RE.test(a.path) ? 0 : 1;
      const pb = PRIORITY_RE.test(b.path) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const da = a.path.split("/").length;
      const db = b.path.split("/").length;
      if (da !== db) return da - db;
      return a.path.localeCompare(b.path);
    })
    .slice(0, max);
}

/** Pick the documentation files the engine knows how to parse. */
export function curateDocFiles(files: TreeFile[]): TreeFile[] {
  const picked: TreeFile[] = [];
  const add = (re: RegExp) => {
    for (const f of files) {
      if (picked.length >= 6) return;
      if (f.size > 300_000) continue;
      if (!re.test(f.path)) continue;
      if (picked.some((p) => p.path === f.path)) continue;
      picked.push(f);
    }
  };
  add(/(^|\/)README\.md$/i);
  add(/\.env\.example$/);
  add(/(^|\/)ARCHITECTURE\.md$/i);
  add(/(^|\/)docs\/[^/]+\.md$/i);
  add(/(^|\/)(CONTRIBUTING|USAGE|CONFIG(URATION)?|API)\.md$/i);
  return picked;
}

/** Language guess for the engine (typescript | python). */
export function langForPath(path: string): "typescript" | "python" {
  return path.endsWith(".py") ? "python" : "typescript";
}

/** Apply engine DocEdits to a file's content, client-side (line-based). */
export function applyEdits(
  content: string,
  edits: Array<{ line: number; oldText: string; newText: string }>
): string {
  const lines = content.split("\n");
  // apply from the bottom so earlier line numbers stay valid
  const sorted = [...edits].sort((a, b) => b.line - a.line);
  // lines already inserted after a given origin line, so multiple inserts at
  // the same position stack in finding order (not reversed)
  const insertedAfter = new Map<number, number>();
  for (const e of sorted) {
    const idx = e.line - 1;
    if (idx < 0 || idx > lines.length) continue;
    const off = insertedAfter.get(idx) ?? 0;
    if (e.oldText === "") {
      const block = e.newText.split("\n");
      if (block.length === 1 && (lines[idx + off] ?? "").trim() === block[0].trim()) continue;
      lines.splice(idx + 1 + off, 0, ...block);
      insertedAfter.set(idx, off + block.length);
      continue;
    }
    // verify the evidence matches what the engine saw — tolerate line drift
    // by searching the whole file before giving up
    const at = (lines[idx + off] ?? "").trim() === e.oldText.trim()
      ? idx + off
      : lines.findIndex((l) => l.trim() === e.oldText.trim());
    if (at === -1) continue;
    lines.splice(at, 1, ...e.newText.split("\n"));
  }
  return lines.join("\n");
}
