# DocDrift — Architecture

## System overview

DocDrift is a two-app monorepo with one production process:

```
┌──────────────────────────────────────────────────────────────────────┐
│                        production (Docker)                           │
│                                                                      │
│   Browser ──► Express engine (port 3000)                             │
│                 ├── serves static Next.js export (src/frontend/out)  │
│                 ├── GET  /api/scenarios                              │
│                 ├── GET  /api/health                                 │
│                 └── POST /api/analyze ──► Mastra workflow            │
│                                            │                         │
│                                            ├── tree-sitter (WASM)    │
│                                            ├── drift rules + patcher │
│                                            └── LLM provider chain    │
│                                                 ├── Ollama (local)   │
│                                                 ├── Gemini free tier │
│                                                 └── deterministic    │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                    development (bun run dev)                         │
│                                                                      │
│   Browser ──► Next.js dev server (port 3000)                         │
│                 └── /api/* ──gateway──► Express engine (port 3001)   │
└──────────────────────────────────────────────────────────────────────┘
```

In dev, the frontend calls the engine through the platform gateway using a
`?XTransformPort=3001` suffix (`apiUrl()` in `src/frontend/src/lib/api.ts`).
In production the same frontend is statically exported and served by Express
itself, so the URL helper emits plain relative paths. One code path, two
deployments, zero configuration differences in application code.

## Module map (src/backend/src/core)

| Module | Responsibility | Key files |
| --- | --- | --- |
| `extract/` | turn source text into `CodeSymbol[]` | `treeSitter.ts` (WASM grammars), `heuristic.ts` (structural fallback), `index.ts` (dispatch) |
| `docs/` | turn markdown/env files into `DocTarget[]` and typed tables | `markdown.ts` |
| `match/` | fold + align symbols ↔ doc targets, detect rename hints | `matcher.ts` |
| `drift/` | deterministic comparators and unified-diff synthesis | `rules.ts`, `patch.ts` |
| `llm/` | Gemma provider chain + prompt templates + JSON extraction | `provider.ts`, `ollama.ts`, `gemini.ts`, `prompts.ts` |
| `agents/` | Mastra workflow graph, validation gates, tone pass | `workflow.ts`, `validate.ts` |
| `observability.ts` | parser-failure ledger (the Sentry hook point) | — |

## Extraction layer

Two extractors, one contract (`CodeSymbol`):

1. **tree-sitter (WASM).** `web-tree-sitter` runs grammars from
   `@repomix/tree-sitter-wasms` (prebuilt `.wasm` — nothing compiled at install
   time). The TS/JS walker maps `export_statement`, `class_declaration`,
   `interface_declaration`, `lexical_declaration` (including object-literal
   members), and route call literals; the Python walker maps classes,
   annotated fields with defaults, module constants and functions.
2. **Structural fallback.** A line-oriented scanner with the same output
   shape. It exists because *"parser unavailable"* must degrade, never crash.
   The dispatcher reports which parser won, and that string reaches the UI and
   `/api/health` — the engine never pretends a fallback run was a real AST run.

Env reads (`env.PORT`, `os.environ.get(...)`, `env["X"]`) are merged in
line-oriented fashion regardless of grammar, because they are textual in
nature and both extractors benefit.

## Matching and drift rules

`matcher.ts` folds names to separator-insensitive lowercase keys
(`DEFAULT_PORT` ≡ `defaultPort`), matches a doc target to **all** folded-equal
symbols (interface field + const-object twin), and records rename hints via
trigram similarity (≥ 0.62). Unmatched symbols and orphaned targets survive as
drift candidates on purpose.

`rules.ts` implements the deterministic comparators:

| Rule | Kind | Example |
| --- | --- | --- |
| documented default ≠ code default (table row / env line / code span) | `changed-default` | guide says `3000`, code ships `8080` |
| exported symbol never mentioned | `missing-in-docs` | new `resolveEnv()` undocumented |
| doc target orphan + rename hint | `renamed-symbol` | `registerRoutes` → `registerDocumentRoutes` |
| doc target orphan, no replacement | `stale-doc-value` | reference to a deleted symbol |
| env key read in code, absent from `.env.example` | `undocumented-env` | `ENABLE_CACHE` |
| `.env.example` value ≠ code default | `env-default-mismatch` | `PORT=3000` vs `8080` |
| route registered but not in API table | `route-missing-in-docs` | `POST /api/v2/...` |
| route path in docs, absent from code | `route-stale-in-docs` | `GET /api/v1/docs/:id` |

Identifier defaults are resolved through constants
(`port: int = DEFAULT_PORT` → `8080`) before comparison, so the message shows
the value a human would recognize.

## Patch synthesis

`patch.ts` converts gate-verified findings into `DocEdit`s (row rewrite, env
line rewrite, append row/line, rename-replace), applies them to an in-memory
snapshot, and renders a standard unified diff (LCS-based, 3 context lines,
guarded against pathological sizes). PR text is drafted from the findings and
polished by the tone pass. Edits that fail Gate 2 are excluded **before** the
diff is rendered, so the emitted diff only contains structure-safe changes.

## Deployment topology

- **Dev:** two processes, gateway-proxied API (see above).
- **Docker:** multi-stage build — bun installs workspace deps, Next builds the
  static export, `tsc` compiles the backend, a slim runtime layer keeps only
  backend production deps + `dist/` + `out/`. One Node process serves
  everything on `PORT` (default 3000). SPA fallback serves `index.html` for
  non-API routes.

## Security model

- Submitted code/docs are **parsed as text only** — never executed, never
  `eval`'d, no child processes.
- Request bodies are zod-validated and size-capped (512 KB JSON limit).
- The default LLM path is localhost; the Gemini path sends only what you
  pasted, to the endpoint you configured.
- The parser-failure ledger is in-memory and local; there is no telemetry.
  `recordParserFailure()` is the documented hook point if you want to wire
  Sentry yourself.

## Performance profile

A deterministic run on the demo fixtures completes in well under a second
(extraction dominates: WASM grammar load is cached per process after the first
run). LLM steps add model latency and are capped by per-step timeouts
(15 s local, 20 s hosted); a failed LLM call degrades the step to
`deterministic` and the workflow continues — the run report says so.
