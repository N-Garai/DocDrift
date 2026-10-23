# Self-hosting DocDrift

Everything here is free. Nothing requires a credit card.

---

## 1 · Development mode

Requirements: [bun](https://bun.sh) ≥ 1.1 (or Node ≥ 20.6 with npm — scripts
use `bun run` but plain `npm run` works identically).

```bash
bun install
npm run dev            # Next.js frontend  → http://localhost:3000
npm run dev:backend    # DocDrift engine   → http://localhost:3001
```

The frontend proxies `/api/*` to the engine. Open the site, scroll to
**Live Demo**, and run a scenario — you are hitting your own engine.

## 2 · Production with Docker (backend serves the frontend)

```bash
docker compose up -d --build
# → http://localhost:3000  (Express serves the static UI + API on one port)
```

No AI provider configured? The deterministic engine runs — same workflow,
same gates, same patches, zero network.

## 3 · Local open-weight Gemma (Ollama)

```bash
# option A — compose profile
docker compose --profile local-ai up -d
docker compose exec ollama ollama pull gemma3:4b

# option B — native Ollama on the host
ollama serve && ollama pull gemma3:4b
```

Then set `OLLAMA_URL` (compose default inside the profile is
`http://ollama:11434`; for a host Ollama use `http://host.docker.internal:11434`
on Docker Desktop, or your LAN address). `OLLAMA_MODEL` accepts any local tag —
`gemma3:4b`, `gemma3:12b`, `gemma2:9b`, …

Check the engine picked it up: `curl localhost:3000/api/health` →
`"engine": "gemma-ollama"`.

## 4 · Hosted open-weight Gemma (Gemini API, free tier)

1. Sign in at [aistudio.google.com](https://aistudio.google.com) with a
   Google account.
2. **Get API key** → create a key. No credit card, no trial clock.
3. Export it:

```bash
export GEMINI_API_KEY=your-key
export GEMINI_MODEL=gemma-4-31b-it   # open-weight Gemma hosted by Google
```

Free-tier quota is generous for doc-drift-sized prompts. The engine only
calls Gemini when Ollama is unreachable, and every run reports which engine
served it.

## 5 · Hooking DocDrift into your repo

### GitHub Action (runs the engine as an API and posts the patch)

```yaml
# .github/workflows/docdrift.yml
name: docdrift
on:
  push:
    branches: [main]
    paths: ["src/**", "*.ts", "*.py"]
jobs:
  doc-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - name: Start DocDrift engine
        run: |
          docker run -d --rm -p 3001:3001 --name docdrift \
            -e OLLAMA_URL=${{ secrets.OLLAMA_URL }} \
            -e GEMINI_API_KEY=${{ secrets.GEMINI_API_KEY }} \
            ghcr.io/your-org/docdrift:latest
      - name: Analyze drifted docs
        run: |
          payload=$(jq -n --arg code "$(cat src/config.ts)" \
            --arg docs "$(cat docs/setup.md)" \
            '{mode:"custom",language:"typescript",custom:{
              codeFile:{path:"src/config.ts",content:$code},
              docs:[{path:"docs/setup.md",content:$docs}]}}')
          curl -s http://localhost:3001/api/analyze \
            -H 'Content-Type: application/json' -d "$payload" > docdrift.json
          jq -r '.patch.diff' docdrift.json > docdrift.patch || true
      - name: Upload patch artifact
        uses: actions/upload-artifact@v4
        with: { name: docdrift-patch, path: docdrift.patch }
```

### Pre-push hook (deterministic, instant, offline)

```bash
# .git/hooks/pre-push  (chmod +x)
#!/bin/sh
# gentle reminder mode: warns when code changed but docs did not
code_changes=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|py)$' | wc -l)
doc_changes=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(md|example)$' | wc -l)
if [ "$code_changes" -gt 0 ] && [ "$doc_changes" -eq 0 ]; then
  echo "⚠ DocDrift: $code_changes code file(s) staged, 0 docs touched."
  echo "  Run the engine locally and review the suggested patch."
fi
exit 0   # advisory — never blocks the push
```

## 6 · Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` (dev) / `3000` (Docker) | engine listen port |
| `OLLAMA_URL` | `http://localhost:11434` | local Gemma endpoint |
| `OLLAMA_MODEL` | `gemma3:4b` | any local Ollama tag |
| `GEMINI_API_KEY` | — | free-tier key from AI Studio |
| `GEMINI_MODEL` | `gemma-4-31b-it` | hosted Gemma model id |
| `CORS_ORIGIN` | permissive | set an origin in public deployments |
| `LOG_PARSE_FAILURES` | `1` | `0` silences parser warnings |
| `GITHUB_CLIENT_ID` | — | GitHub OAuth App id (unlocks the Studio login) |
| `GITHUB_CLIENT_SECRET` | — | GitHub OAuth App secret |
| `GITHUB_OAUTH_SCOPE` | `repo read:user` | `repo` covers private repos |
| `APP_BASE_URL` | auto | public origin for the OAuth callback + keep-warm ping |
| `RENDER_EXTERNAL_URL` | auto | Render sets this; picked up automatically |
| `KEEP_WARM` | `on` | `off` disables the free-tier self-ping |
| `COOKIE_SECURE` | `auto` | `force` adds Secure to cookies behind odd proxies |

## 6b · GitHub login for the Studio (free, ~2 minutes)

The Studio signs users in with their own GitHub account so it can list their repos
(**private included** — the OAuth scope is `repo`) and open documentation PRs as them.
OAuth Apps are free and have no quota that matters here.

1. GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App
2. Homepage URL: your deployment origin
3. Authorization callback URL: `<origin>/api/auth/github/callback`
4. Set `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`, restart the engine
5. Verify at `GET /api/health` → `"githubOAuth": true`

Trust model: the token lives in server memory only; the browser holds an opaque
httpOnly `dd_session` cookie; CSRF is handled with a signed-off `state` cookie
(timing-safe compare, 10-minute TTL). Sessions are ephemeral — a restart signs
everyone out by design, nothing is persisted to disk.

Dev note: `next dev` proxies `/api/*` to the engine (`BACKEND_ORIGIN`, default
`http://localhost:3001`) so the OAuth redirect round-trip stays same-origin with the
app. In production the Express engine serves the exported frontend itself, so the
same-origin property holds there too.

## 6c · Keeping a free tier awake (the Git-Voice pattern)

Render's free plan sleeps a service after ~15 minutes without inbound traffic, and the
next visitor waits ~50 s for the cold start. DocDrift ships the same defence Git-Voice
uses: when `NODE_ENV=production` and the server knows its public address
(`RENDER_EXTERNAL_URL` on Render, or set `APP_BASE_URL`), it fetches its **own** public
`/api/health` every **13.5 minutes** — deliberately inside the idle window. The ping
goes to the public URL, so it passes the platform edge and resets the idle timer.

- localhost deployments never self-ping (that traffic can't reach an edge router)
- `KEEP_WARM=off` disables it (paid plan / dedicated box)
- rules live in `resolveKeepWarmTarget()` — unit-tested in `test/backend/studio.test.ts`

`render.yaml` in the repo root deploys the whole stack to Render (Docker runtime,
`healthCheckPath: /api/health`, env vars marked `sync: false` so you fill them in the
dashboard).

## 7 · Observability / Sentry

The engine keeps an in-memory ledger of AST/parser failures (visible at
`GET /api/health` as `parserFailures` / `recentFailures`). It deliberately
ships with **no telemetry and no required account**. To forward failures to
Sentry:

```ts
// src/backend/src/core/observability.ts — recordParserFailure()
// hook point:
if (process.env.SENTRY_DSN) {
  // your Sentry.init lives here; captureMessage(`docdrift parser: ${reason}`)
}
```

Install `@sentry/node`, init with your DSN, and the same ledger becomes
cloud-tracked — your choice, your account, your data.

## 8 · Building the distributable zip

```bash
npm run zip     # → download/DocDrift-<version>-source.zip (no node_modules)
```
