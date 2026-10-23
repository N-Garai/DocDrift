# DocDrift Engine — HTTP API

Base URL: `http://localhost:3001` in dev, `http://localhost:3000` in the
Docker image (same process as the frontend). All bodies are JSON.

---

## `GET /api/health`

Liveness + provider detection + parser-failure ledger.

```json
{
  "ok": true,
  "service": "docdrift-engine",
  "version": "1.0.0",
  "parser": "tree-sitter|heuristic (resolved per run)",
  "engine": "heuristic",
  "providers": { "ollama": false, "gemini": false },
  "parserFailures": 0,
  "recentFailures": [],
  "uptimeSec": 41
}
```

`engine` mirrors the resolution chain: `gemma-ollama` → `gemma-gemini` →
`heuristic`.

## `GET /api/scenarios`

List of demo fixtures, including full file contents (used by the Live Demo
panes):

```json
[
  {
    "id": "ts-config-drift",
    "title": "Config keys drifted",
    "language": "typescript",
    "tagline": "PORT 3000 → 8080, a new cache flag, a stale log level",
    "description": "…",
    "files": [
      { "path": "config.ts", "label": "changed code", "content": "…", "stale": false },
      { "path": "docs/setup.md", "label": "stale docs", "content": "…", "stale": true },
      { "path": ".env.example", "label": "stale docs", "content": "…", "stale": true }
    ]
  }
  // api-endpoint-rename, pydantic-schema
]
```

## `POST /api/analyze`

Run the doc-drift workflow. Two modes:

**Scenario mode:**

```json
{ "mode": "scenario", "scenarioId": "ts-config-drift" }
```

**Custom mode** (your own paste — parsed as text, never executed):

```json
{
  "mode": "custom",
  "language": "typescript",
  "custom": {
    "codeFile": { "path": "config.ts", "content": "export const PORT = 8080; …" },
    "docs": [
      { "path": "docs/setup.md", "content": "# Setup\n\n| Option | Default |…"}
    ],
    "envExample": { "path": ".env.example", "content": "PORT=3000\n" }
  }
}
```

### Response (200)

```json
{
  "ok": true,
  "scenarioId": "ts-config-drift",
  "symbols": [{ "name": "DEFAULT_PORT", "kind": "const", "line": 2, "signature": "…", "defaultValue": "8080", "file": "config.ts" }],
  "docTargets": [{ "file": "docs/setup.md", "kind": "table-row", "line": 14, "text": "| PORT | 3000 | …", "symbolHint": "PORT" }],
  "drifts": [
    {
      "id": "changed-default:PORT:docs/setup.md:14",
      "kind": "changed-default",
      "severity": "critical",
      "symbol": "PORT",
      "message": "setup guide documents `3000` but the code defaults to `8080`",
      "codeEvidence": { "file": "config.ts", "line": 25, "snippet": "port: Number(env.PORT ?? DEFAULT_PORT)," },
      "docEvidence": { "file": "docs/setup.md", "line": 14, "snippet": "| PORT | 3000 | HTTP server port |" },
      "suggestion": "Update PORT default in the guide from 3000 to 8080.",
      "verified": true
    }
  ],
  "patch": {
    "diff": "--- a/docs/setup.md\n+++ b/docs/setup.md\n@@ …\n-| PORT | 3000 | …\n+| PORT | 8080 | …\n",
    "filesChanged": ["docs/setup.md", ".env.example"],
    "additions": 10,
    "deletions": 3,
    "prTitle": "docs: sync documentation with code (11 drifts)",
    "prBody": "## What changed\n…",
    "edits": [{ "file": "docs/setup.md", "line": 14, "oldText": "…", "newText": "…", "reason": "…", "driftId": "…" }]
  },
  "steps": [
    { "id": "intake", "label": "…", "agent": "intake", "status": "ok", "ms": 1, "notes": "…" },
    { "id": "extract", "label": "…", "agent": "extractor agent (tree-sitter)", "status": "ok", "ms": 33, "notes": "16 symbols" },
    { "id": "synthesize", "label": "…", "agent": "synthesizer agent (heuristic)", "status": "ok", "ms": 2, "notes": "deterministic rules · 11 findings" },
    { "id": "gate-1", "label": "…", "agent": "code-side validator (subagent)", "status": "ok", "ms": 1, "notes": "11 findings checked · 0 dropped" },
    { "id": "gate-2", "label": "…", "agent": "docs-side validator (subagent)", "status": "ok", "ms": 1, "notes": "10 edit(s) apply cleanly · 0 rejected" },
    { "id": "tone", "label": "…", "agent": "tone agent", "status": "ok", "ms": 1, "notes": "humanized via template" }
  ],
  "validations": {
    "codeGrounding": { "passed": true, "checked": 11, "dropped": 0, "notes": "all findings trace to verbatim code evidence" },
    "docsApply": { "passed": true, "applied": 10, "failed": 0, "notes": "patched tables re-parsed cleanly" },
    "tonePass": { "applied": true, "engine": "template" }
  },
  "engine": { "engine": "heuristic", "parser": "tree-sitter", "reason": "no LLM provider configured — deterministic comparator engaged" },
  "totalMs": 42
}
```

### Errors

| Status | When |
| --- | --- |
| `400` | body fails zod validation (`details[]` describes each issue) |
| `404` | unknown `scenarioId` |
| `500` | workflow failure (detail in `detail`; also recorded in the parser-failure ledger) |

### Limits

- JSON body ≤ 512 KB; file contents ≤ 120 KB each; ≤ 6 doc files per request.
- Findings are capped at 24 per run (highest severity first).

## Studio: GitHub login + repo access (v1.1.0)

All Studio endpoints are served by the same engine. The GitHub OAuth token is stored
server-side in memory and exchanged for an opaque `dd_session` httpOnly cookie — client
JavaScript never sees the token. Without a session every `/api/github/*` route answers
`401 {"ok":false,"error":"not signed in","hint":"Start the flow at /api/auth/github/login"}`.

### `GET /api/auth/me`

Session probe used by the Studio auth gate.

```json
{
  "authenticated": false,
  "oauthConfigured": false,
  "user": null
}
```

`oauthConfigured` reports whether `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` are set.
When authenticated, `user` carries `login`, `name`, `avatarUrl`, `htmlUrl`, `scopes`
and `expiresAt` (sessions live 7 days in memory; restarting the engine signs out).

### `GET /api/auth/github/login`

302 to `https://github.com/login/oauth/authorize` with a CSRF `state` cookie (10 min
TTL). Unconfigured deployments answer `501` with setup instructions instead of
redirecting. Requires the callback URL `<origin>/api/auth/github/callback` to be
registered on the OAuth App.

### `GET /api/auth/github/callback`

Validates `state` (timing-safe), exchanges `code` for an access token, fetches the
profile, creates the session and redirects to `/studio?welcome=1`. Failure modes are
honest: `400` state mismatch, `401` token exchange failure with GitHub's own message.

### `POST /api/auth/logout`

Deletes the session server-side and clears the cookie. Always `200`.

### `GET /api/github/repos`

Repositories the signed-in user owns or collaborates on — `affiliation=owner,collaborator,
organization_member`, sorted by push date, up to 300 entries. Private repos are included
because the OAuth scope is `repo`. Archived repos are filtered out.

### `GET /api/github/repo/:owner/:repo/tree?ref=`

Recursive git tree (blob entries only) via the Git Trees API. Answers include
`truncated: true` when GitHub cut the tree (repos with thousands of files).

### `GET /api/github/repo/:owner/:repo/blob?path=&ref=`

Raw file content (GitHub Contents API, `Accept: application/vnd.github.raw`). Files
larger than the 400 KB studio limit answer `413`.

### `POST /api/github/repo/:owner/:repo/pr`

Creates the docs pull request atomically: new branch from `base` → blobs for each file
→ tree → commit → ref update → PR. If a PR already exists for the head/base pair, the
existing one is returned with `created: false`.

Request:

```json
{
  "base": "main",
  "branch": "docdrift/docs-sync-202610231230",
  "title": "docs: sync documentation with code (5 drifts)",
  "body": "drafted by docdrift …",
  "files": [{ "path": "README.md", "content": "# fully updated file content" }]
}
```

Response (200):

```json
{
  "ok": true,
  "created": true,
  "commitUrl": "https://github.com/o/r/commit/sha",
  "pullRequest": { "html_url": "https://github.com/o/r/pull/12", "number": 12, "state": "open" }
}
```

Limits: at most 8 files per PR, branch names validated against `[^~^:?*\[\s\\]`,
payload validated with zod before any network call.
