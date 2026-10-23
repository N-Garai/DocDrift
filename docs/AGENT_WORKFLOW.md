# The DocDrift Agent Workflow

The pipeline is a **Mastra workflow** (`@mastra/core/workflows`): nine typed
steps chained with `.then()` and committed into a runnable graph. Each step
declares zod input/output schemas, measures its own duration, and appends a
`StepTrace` entry that the UI replays in the Live Demo.

```
intake → extract → docs → synthesize → gate-1 → patch → gate-2 → tone → emit
```

## Step by step

### 1 · intake
Normalizes the request (scenario fixture or custom paste) and records which
engine the provider chain resolved (`gemma-ollama` / `gemma-gemini` /
`heuristic`) and why. Nothing hidden: the reason string reaches the UI.

### 2 · extract (extractor agent)
Runs tree-sitter WASM grammars over the changed code and produces the public
surface: exported functions, classes, interfaces and their fields, const
objects with member defaults, route literals, and env reads. If a grammar
fails (exotic syntax, WASM/ABI mismatch), the structural fallback extractor
takes over and the failure is written to the parser-failure ledger exposed at
`/api/health` — the Sentry hook point described in the original idea.

### 3 · docs (docs agent)
Parses the markdown side with equal rigor: headings, markdown tables (header +
row positions), inline code spans, and `.env.example` lines. Everything becomes
a typed `DocTarget` with file + line evidence.

### 4 · synthesize (synthesizer agent)
Two layers, deliberately:

- **Deterministic rules always run** — the eight comparators from
  `docs/ARCHITECTURE.md`. They are the baseline truth and they never hallucinate.
- **Gemma augments when a provider is live.** The model receives the symbol
  table, doc targets and the rule findings, and may add up to five *grounded*
  extra findings. Any suggestion referencing a symbol that is not in the
  extracted table is discarded immediately — this is the pre-gate anti-phantom
  filter (the failure mode the traceability literature calls *phantom links*).

A failed LLM call is a `degraded` note, not a crash.

### 5 · gate-1 — code-side validator (subagent)
Mechanical, deterministic, always on. Every finding must trace to verbatim
evidence: the claimed code line must exist and contain the symbol (or, for
docs-side-dominant kinds like `stale-doc-value`, the doc line must exist
verbatim). Ungrounded findings are **marked unverified and excluded from
patching** — they are still displayed, so a human can judge them, but the
machine never acts on a claim it cannot prove.

### 6 · patch
Converts verified findings into concrete `DocEdit`s: rewrite the stale table
cell, set the correct env value, append the missing row, replace renamed
references. No edit is produced for findings that need human judgment
(`stale-doc-value` without a clear replacement) — the suggestion text says so
instead of inventing content.

### 7 · gate-2 — docs-side validator (subagent)
Applies every edit to a snapshot of the docs, re-parses the result and refuses
edits that (a) don't match the claimed original line, or (b) would leave a
markdown table with inconsistent column counts. Rejected edits are removed
*before* the unified diff is rendered, so the patch only contains
structure-safe changes.

### 8 · tone (tone agent)
Rewrites the PR title and body into calm, plain-verb prose. With Gemma: a
strict-JSON rewrite prompt that forbids LLM-isms ("delve", "seamless",
"supercharge") and preserves every file name and number. Offline: a
deterministic template humanizer that does the same word-level cleanup. The
trace records which engine performed the pass.

### 9 · emit
Assembles the `AnalyzeResult`: symbols, doc targets, findings (with verified
flags and validator notes), the patch (diff + stats + PR text), the full step
trace, the validation report and total wall time.

## Provider chain

```
resolveEngine():
  1. GET {OLLAMA_URL}/api/tags   → reachable?  → gemma-ollama
  2. GEMINI_API_KEY set?                        → gemma-gemini
  3. otherwise                                  → heuristic
```

Re-evaluated per request with a 15 s cache, so you can start or stop Ollama
without restarting DocDrift. Model IDs: any Ollama tag (`gemma3:4b` default,
`gemma2:9b` fine); on the Gemini API the open-weight `gemma-4-31b-it` by
default (configurable via `GEMINI_MODEL`).

## Why the gates matter

LLM-based doc↔code traceability is genuinely useful and genuinely imperfect —
the 2025 Concordia evaluation (arXiv:2506.16440) measured F1 ≈ 0.8 and traced
most errors to naming-based assumptions, phantom links and overgeneralization.
DocDrift's answer is structural: the LLM may *suggest*, but only AST-verified
claims reach the patch, and only structure-safe edits reach the diff. The
deterministic engine produces the same artifact shape without any model at
all, which is what makes the offline mode real rather than a fallback lie.

## Extending

- **New language:** drop the grammar `.wasm` into the grammar package path,
  add a walker in `treeSitter.ts`, add a branch in the heuristic scanner.
- **New rule:** implement the comparator in `drift/rules.ts`, emit the
  matching `DocEdit` in `drift/patch.ts`, and add a fixture-based test —
  the gate tests show the pattern.
- **Different model:** any OpenAI-compatible server can be wired by extending
  `llm/provider.ts` with one more probe; the steps only need a
  `generate(prompt, system) → text` function.
