<div align="center">

# DocDrift

**Your code drifted. Your docs didn't have to.**

A background codebase-to-documentation synchronizer: tree-sitter reads the real AST,
an open-source Mastra agent workflow compares it against your README, guides and
`.env.example`, and drafts the documentation PR for you — with two anti-hallucination
validation gates on every claim.

`Mastra` · `tree-sitter (WASM)` · `Gemma (open weights)` · `Express` · `Next.js 16`

**100% free · no credit card · no cloud required · MIT licensed**

</div>

---

## The Sloth Angle

You rename an env var, bump a default port, move an endpoint to `/v2` — and the README
quietly becomes fiction. Nobody updates docs in the same commit, and nobody should have
to. Static linters only check code against code; **nothing checks code against prose**.
DocDrift is the sloth that does the boring part while you ship: it detects the drift,
grounds every claim in the actual AST, and hands you a reviewable diff. You review.
That's the whole job.

Built for the [DEV Hacktoberfest 2026 Week 3 challenge](https://dev.to/challenges/hacktoberfest-week3-2026-10-19)
(*"Slow and Steady"* — build something with open-source AI that rewards laziness).

## What it actually does

```
git commit / staged changes
        │
        ▼
[tree-sitter AST extractor]         public functions · classes · interfaces ·
  ts / js / python (WASM)           routes · config keys · env reads
        │
        ▼
[docs parser]                       README tables · setup guides ·
  markdown + .env.example           headings · code spans · env lines
        │
        ▼
[Mastra agent workflow]   intake → extract → docs → synthesize → gate-1
        │                 → patch → gate-2 → tone → emit
        │
        ▼
[provider chain]   Ollama (local Gemma) → Gemini API (free tier) → deterministic
        │
        ▼
unified doc diff + humanized PR body + full step trace
```

Every finding carries line-precise evidence on **both** sides. Gate 1 (code-side
validator subagent) drops anything the AST cannot prove; Gate 2 (docs-side validator
subagent) refuses patches that don't apply cleanly or break markdown tables.

## Quickstart

### Run locally (bun)

```bash
bun install
npm run dev            # frontend on :3000 (Next.js)
npm run dev:backend    # engine on :3001 (Express + Mastra + tree-sitter)
# open http://localhost:3000 — the Live Demo section runs the real engine
# open http://localhost:3000/studio — sign in with GitHub and scan your own repos
```

### Run with Docker (backend serves the frontend, one port)

```bash
docker compose up -d                      # deterministic engine, fully offline
docker compose --profile local-ai up -d   # + Ollama for local open-weight Gemma
docker compose exec ollama ollama pull gemma3:4b
```

### Unlock Gemma (optional, still free)

| Path | What you get | Setup |
| --- | --- | --- |
| **Ollama (default)** | open-weight Gemma on your machine, zero network | install [Ollama](https://ollama.com), `ollama pull gemma3:4b` |
| **Gemini API free tier** | hosted open-weight Gemma (`gemma-4-31b-it`), generous daily free quota | key from [AI Studio](https://aistudio.google.com) — **no credit card** |
| **Neither** | deterministic comparator — what the demo uses by default | nothing, it just works |

The engine resolves providers per request: Ollama → Gemini → deterministic. Stop
Ollama mid-day and the pipeline keeps working; every response reports which engine ran.

## The Studio (sign in with GitHub)

The marketing page teaches; **`/studio` does the work.** Sign in with your own GitHub
account and DocDrift lists your repositories — **private ones included** — lets you pick
a source file and the markdown that claims to describe it, runs the full agent workflow
on those exact bytes, and can open the documentation PR for you.

```text
sign in → pick repo → pick files → drift report → open docs PR on GitHub
```

Setup is one free OAuth App (no billing, no card):

1. GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**
2. Authorization callback URL: `<your origin>/api/auth/github/callback`
3. Set `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` on the engine and restart

Trust model, stated plainly: the OAuth token lives in server memory only — the browser
holds an opaque httpOnly session cookie and the token is never sent to client JS. PRs
are opened as *you* from a `docdrift/docs-sync-*` branch; nothing is merged
automatically. Sessions are ephemeral (restart = sign-out); sessions and tokens are
never persisted to disk.

## Deployed on Render? It stays awake

Free-tier web services sleep after ~15 idle minutes and the next visitor eats a ~50 s
cold start. DocDrift ports the Git-Voice keep-warm pattern: in production, when it knows
its public address (`RENDER_EXTERNAL_URL` is picked up automatically on Render, or set
`APP_BASE_URL`), the engine pings its **own** `/api/health` every **13.5 minutes** — just
inside the idle window, through the platform edge where the timer actually resets. Set
`KEEP_WARM=off` on paid plans. A `render.yaml` blueprint with the health check path is
included for one-click deploys.

## Why open matters here

- **A doc watcher needs your whole codebase in context.** That is exactly the payload
  you should never paste into a hosted chat tab. The default path runs on
  `localhost:11434` — code, docs and patches never leave the machine.
- **Set it up once, pay nothing, ever.** Mastra (MIT), tree-sitter (MIT), Gemma (open
  weights), Ollama (MIT), Express (MIT). The optional Gemini path is the free tier.
  There is no paid plan to outgrow.
- **Swap the brain, keep the body.** The synthesizer is a provider chain, not a vendor.
  `OLLAMA_MODEL` points at any local Gemma; `GEMINI_API_KEY` swaps in the hosted open
  model; neither → the deterministic engine. Changing agent behaviour is a config edit,
  not a migration.

## Project structure

```
├── src/
│   ├── frontend/          Next.js 16 · Tailwind 4 · framer-motion (static-exportable)
│   │   └── src/app/       home (hero, pipeline, live demo) + /signin (GitHub auth) + /studio (workspace)
│   └── backend/           Express + the DocDrift engine
│       └── src/
│           ├── core/
│           │   ├── extract/   tree-sitter WASM extractor + structural fallback
│           │   ├── docs/      markdown table / .env.example parsers
│           │   ├── match/     symbol ↔ doc-target folding matcher
│           │   ├── drift/     deterministic rules + unified-diff patcher
│           │   ├── llm/       Ollama / Gemini (free) / prompts / provider chain
│           │   └── agents/    Mastra workflow + validation gates + tone pass
│           ├── routes/    analyze · health · auth (OAuth) · github (repos/PRs)
│           └── keepwarm.ts  free-tier self-ping (13.5 min, Git-Voice pattern)
├── test/                  node:test suites (extractor, docs, drift, gates, API, studio)
├── docs/                  architecture · agent workflow · research · API · self-hosting
├── Dockerfile             multi-stage: backend serves the exported frontend
├── docker-compose.yml     + optional `local-ai` profile (Ollama)
├── render.yaml            one-click Render blueprint (health check + env)
└── .env.example           every knob documented, all optional
```

## API

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/analyze` | POST | run the doc-drift workflow on a scenario or custom paste |
| `/api/scenarios` | GET | list demo fixtures (with file contents) |
| `/api/health` | GET | engine status, provider detection, parser-failure ledger |
| `/api/auth/me` | GET | session probe for the Studio gate |
| `/api/auth/github/login` | GET | start the OAuth flow (302 to GitHub) |
| `/api/auth/github/callback` | GET | OAuth callback → session cookie |
| `/api/auth/logout` | POST | drop the session |
| `/api/github/repos` | GET | your repositories, private included (session) |
| `/api/github/repo/:o/:r/tree` | GET | recursive file tree (session) |
| `/api/github/repo/:o/:r/blob` | GET | raw file content (session) |
| `/api/github/repo/:o/:r/pr` | POST | branch + commit docs + open the PR (session) |

Full request/response shapes in [`docs/API.md`](docs/API.md).

## How this was research-grounded

DocDrift's design choices come from reading the prior work and fixing its documented
gaps — see [`docs/RESEARCH.md`](docs/RESEARCH.md) for the full annotated survey:

- **"Detecting Outdated Code Element References in Software Documentation"** (ICSME 2023)
  flags references whose occurrence count drops to *zero* — a changed default like
  `PORT 3000 → 8080` sails straight past it. DocDrift compares **values and shapes**,
  not just string existence.
- **DOCREF** (OOPSLA 2014) detects stale API-doc *descriptions* via constraint matching,
  but is limited to reference-style docs. DocDrift covers tables, env files and guides.
- **"Evaluating the Use of LLMs for Documentation-to-Code Traceability"** (arXiv 2025)
  documents the dominant LLM failure modes: *phantom links* and naming-based assumptions.
  DocDrift's Gate 1 exists specifically to mechanically drop those.

## Honest limitations

- The deterministic engine understands common patterns (exports, interfaces, object
  literals, Pydantic fields, route literals, env reads) — exotic metaprogramming needs
  the Gemma path or a custom rule.
- Language support today: **TypeScript / JavaScript / Python** (grammar WASMs are
  swappable — drop a `.wasm` in and extend the walker).
- Patches are drafts, not autopilot: Gate 2 checks structure and applicability, a human
  still reviews the PR. Findings marked *unverified* are shown, never patched.
- Gemma augmentation requires a reachable Ollama or a free Gemini key; without one the
  run is labelled `heuristic` in the UI — never silently passed off as LLM output.

## License

MIT — see [LICENSE](LICENSE).

