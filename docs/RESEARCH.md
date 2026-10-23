# Research grounding — prior work, its limits, and what DocDrift does about it

DocDrift's design was shaped by reading the existing literature on
code↔documentation drift. This page records what was read, what each approach
cannot do (per the authors' own evaluations), and the specific mechanism
DocDrift uses to address that gap. Every claim below is checkable against the
linked paper.

---

## 1 · "Wait, wasn't that code here before? Detecting Outdated Code Element
### References in Software Documentation" — Tan et al., ICSME 2023

- **Paper:** [arXiv:2212.01479](https://arxiv.org/abs/2212.01479) ·
  [IEEE CSDL](https://www.computer.org/csdl/proceedings-article/icsme/2023/278300a553/1SN6mRfbnhe)
- **What it does:** a GitHub Actions tool that flags documentation references
  to code elements that no longer exist. Detection is string-based: a
  reference is outdated when the count of exact, whole-word, case-sensitive
  occurrences of the element in the source goes from ≥ 1 (at the documentation's
  snapshot revision) to **zero** (current revision).
- **Documented limitation:** the method only fires when occurrences drop to
  zero. If a symbol still exists but its **behaviour or value changed** — a
  default port moving from `3000` to `8080`, a telemetry flag flipping —
  every occurrence count is unchanged and the drift is invisible. The paper's
  own method section states the count comparison explicitly.
- **DocDrift's answer:** `changed-default` and `env-default-mismatch` rules
  compare *values* (numbers, booleans, paths, strings) between the AST and the
  documented default, not just existence. The demo fixture
  `ts-config-drift` is exactly the case this paper cannot catch.

## 2 · DOCREF: "Detecting API documentation errors" — Ratol & Robillard, OOPSLA 2014

- **Paper:** [ACM DL, 10.1145/2509136.2509523](https://dl.acm.org/doi/10.1145/2509136.2509523)
- **What it does:** learns structural patterns of documentation fragments that
  reference code (e.g. method invocations, class names) and flags fragments
  whose referenced code is missing. Applied to API *reference* documentation.
- **Documented limitation:** DOCREF targets reference-style API docs and
  detects **missing references**; it does not compare documented *values*
  against code, does not parse `.env.example`-style config, and its pattern
  learning is tuned to Javadoc-style fragments.
- **DocDrift's answer:** broaden the artifact types — markdown tables, setup
  guides, `.env.example` lines and route tables are all first-class doc
  targets, and value comparison runs over each of them.

## 3 · "Evaluating the Use of LLMs for Documentation-to-Code Traceability"
### — Alor, Khatoonabadi & Shihab, Concordia University, arXiv 2025

- **Paper:** [arXiv:2506.16440](https://arxiv.org/abs/2506.16440)
- **What it does:** evaluates Claude 3.5 Sonnet, GPT-4o and o3-mini at linking
  documentation segments to code artifacts on two datasets (Unity Catalog,
  Crawl4AI). Best F1 ≈ 79–80%, well above TF-IDF/BM25/CodeBERT baselines.
- **Documented limitations (from its own error analysis):**
  1. *Phantom links* — the model asserts relationships that do not exist;
  2. *Naming-based assumptions* — similar names treated as related;
  3. *Overgeneralization of architectural patterns*;
  4. Relationship explanations are fully correct only 42.9–71.1% of the time.
- **DocDrift's answer:** the two validation gates are designed around exactly
  these failure modes:
  - **Gate 1 (code grounding)** mechanically re-checks every finding against
    the extracted AST — a finding whose claimed line/symbol does not exist
    verbatim is marked unverified and excluded from patching. LLM extra
    findings are *pre-filtered* the same way before they ever reach a diff.
  - **Gate 2 (docs apply)** applies each proposed edit to a snapshot and
    refuses edits that break markdown structure.
  - The LLM is positioned as a **suggester over a deterministic baseline**,
    never as the source of truth — which is why the pipeline stays fully
    functional with the model switched off.

## 4 · Documentation decay as a phenomenon

The traceability study above frames the broader problem: *"maintaining
accurate connections between documentation and code becomes increasingly
difficult, leading to the phenomenon of documentation decay"*. Empirical
SE work (e.g. CEUR-WS Vol-4173, "Machine Learning for Documentation Utility")
uses the same framing: textual explanations misalign as systems evolve.
DocDrift's contribution is not discovering decay — it is making the fix
*cheaper than the decay*: a reviewed PR drafted in the background, with the
reviewer's only job being the part machines genuinely cannot do (judgment).

---

## Limitations DocDrift inherits (stated plainly)

- Value comparison understands common literals (numbers, booleans, quoted
  strings, paths); defaults computed through non-trivial expressions are only
  comparable when resolvable through a named constant.
- Rename detection is similarity-based (trigram ≥ 0.62) — a rename to a
  completely unrelated name is reported as `stale-doc-value` (remove/rewrite)
  instead of `renamed-symbol`.
- The deterministic rules are language-aware but pattern-based; heavily
  macro-generated or DSL-style code needs the Gemma path or a custom rule.
- Gate 2 proves structural integrity, not factual prose quality — a
  human still reviews the PR, by design.
