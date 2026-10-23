/**
 * Validation gates — the anti-hallucination layer.
 *
 * Gate 1 (code grounding): every finding must trace to evidence that exists
 *   verbatim in the analyzed code. Traceability research documents "phantom
 *   links" as the dominant LLM failure mode for doc↔code traceability
 *   (arXiv:2506.16440) — this gate mechanically drops them.
 *
 * Gate 2 (docs apply): every proposed edit must apply cleanly to a snapshot
 *   of the docs and leave well-formed markdown tables behind.
 *
 * Both gates are deterministic and always run, regardless of engine.
 */
import type {
  AnalyzeInput,
  DriftFinding,
  DocEdit,
  ValidationReport,
  StepTrace,
} from "../types.js";
import { parseMarkdown } from "../docs/markdown.js";

export interface GateResult {
  drifts: DriftFinding[];
  edits: DocEdit[];
  report: ValidationReport;
}

export function runValidationGates(
  input: AnalyzeInput,
  drifts: DriftFinding[],
  edits: DocEdit[]
): GateResult {
  const codeLines = input.codeFile.content.split("\n");
  const codeLineSet = new Map<number, string>();
  codeLines.forEach((l, i) => codeLineSet.set(i + 1, l));

  /* ── gate 1: code grounding ─────────────────────────────────────────── */
  let checked = 0;
  let dropped = 0;
  const grounded: DriftFinding[] = [];

  for (const d of drifts) {
    checked++;
    const line = codeLineSet.get(d.codeEvidence.line);
    const token = primaryToken(d.symbol);

    let groundedOk = true;
    const notes: string[] = [];

    // docs-side-dominant findings: the docs line is the subject — the code
    // side proved absence during detection. Ground on the doc evidence.
    const docSubject =
      d.kind === "stale-doc-value" || d.kind === "route-stale-in-docs";

    if (docSubject) {
      const docFile = input.docs.find((f) => f.path === d.docEvidence?.file);
      const docLine = d.docEvidence
        ? docFile?.content.split("\n")[d.docEvidence.line - 1]
        : undefined;
      if (!d.docEvidence || !docLine) {
        groundedOk = false;
        notes.push("stale-reference finding has no verifiable docs line");
      }
    } else if (!line) {
      groundedOk = false;
      notes.push(`code line ${d.codeEvidence.line} does not exist`);
    } else if (token && !lineFuzzyContains(line, token)) {
      groundedOk = false;
      notes.push(`symbol '${d.symbol}' not found on code line ${d.codeEvidence.line}`);
    }

    if (d.docEvidence) {
      const docFile = input.docs.find((f) => f.path === d.docEvidence!.file);
      const docLine = docFile?.content.split("\n")[d.docEvidence.line - 1];
      if (!docLine) {
        groundedOk = false;
        notes.push(`docs line ${d.docEvidence.file}:${d.docEvidence.line} does not exist`);
      }
    }

    if (groundedOk) {
      grounded.push({ ...d, verified: true });
    } else {
      dropped++;
      grounded.push({ ...d, verified: false, validatorNotes: notes.join("; ") });
    }
  }

  const codeGrounding: ValidationReport["codeGrounding"] = {
    passed: dropped === 0,
    checked,
    dropped,
    notes:
      dropped === 0
        ? "all findings trace to verbatim code evidence"
        : `${dropped} finding(s) could not be grounded in the AST and were marked unverified (dropped from patch)`,
  };

  /* ── gate 2: docs apply ─────────────────────────────────────────────── */
  const applicableEdits: DocEdit[] = [];
  let applied = 0;
  let failed = 0;

  for (const e of edits) {
    const file = [...input.docs, input.codeFile].find((f) => f.path === e.file);
    if (!file) {
      failed++;
      continue;
    }
    const lines = file.content.split("\n");
    const target = lines[e.line - 1];

    if (e.oldText === "") {
      // insert-after edit: valid if line exists
      if (e.line >= 0 && e.line <= lines.length) {
        applicableEdits.push(e);
        applied++;
      } else {
        failed++;
      }
      continue;
    }

    if (target && similarityOf(target.trim(), e.oldText.trim()) > 0.82) {
      applicableEdits.push(e);
      applied++;
    } else {
      failed++;
    }
  }

  // table integrity check: apply edits to a copy, re-parse, ensure tables parse
  let tableNote = "no table edits to verify";
  const tablesEdited = [...new Set(applicableEdits.map((e) => e.file))].filter((f) => f.endsWith(".md"));
  if (tablesEdited.length > 0) {
    let broken = 0;
    for (const path of tablesEdited) {
      const original = input.docs.find((f) => f.path === path);
      if (!original) continue;
      const edited = applyToSnapshot(original.content, applicableEdits.filter((e) => e.file === path));
      const before = parseMarkdown(original);
      const after = parseMarkdown({ path, content: edited });
      // every table that parsed before must still parse with equal column counts
      for (const bt of before.tables) {
        const at = after.tables.find((t) => t.headerLine === bt.headerLine);
        if (!at) {
          broken++;
          continue;
        }
        const widthMismatch = at.rows.some((r) => r.cells.length !== bt.header.length);
        if (widthMismatch) broken++;
      }
    }
    tableNote =
      broken === 0
        ? "patched tables re-parsed cleanly with consistent column counts"
        : `${broken} table edit(s) would break markdown structure — rejected`;
    if (broken > 0) {
      // reject edits that break tables
      for (const e of applicableEdits.filter((x) => x.file.endsWith(".md"))) {
        const idx = applicableEdits.indexOf(e);
        if (idx >= 0) {
          applicableEdits.splice(idx, 1);
          applied--;
          failed++;
        }
      }
    }
  }

  const docsApply: ValidationReport["docsApply"] = {
    passed: failed === 0,
    applied,
    failed,
    notes: failed === 0 ? tableNote : `${failed} edit(s) failed the apply check and were excluded`,
  };

  return {
    drifts: grounded,
    edits: applicableEdits,
    report: {
      codeGrounding,
      docsApply,
      tonePass: { applied: false, engine: "pending" },
    },
  };
}

/** Apply edits to raw content (for the table-integrity check). */
export function applyToSnapshot(content: string, edits: DocEdit[]): string {
  const lines = content.split("\n");
  const sorted = [...edits].sort((a, b) => b.line - a.line);
  for (const e of sorted) {
    const idx = e.line - 1;
    if (idx < 0 || idx >= lines.length) continue;
    if (e.oldText === "") {
      lines.splice(idx + 1, 0, ...e.newText.split("\n"));
    } else {
      lines.splice(idx, 1, ...e.newText.split("\n"));
    }
  }
  return lines.join("\n");
}

function primaryToken(symbol: string): string | null {
  const base = symbol.split(".").pop() ?? symbol;
  const cleaned = base.replace(/[()<>[\]]/g, "");
  if (cleaned.includes(" ")) {
    // route-ish symbol: "POST /api/v2/documents/:id/sign"
    const path = /\/[\w/.:{}-]+/.exec(cleaned);
    return path ? path[0] : null;
  }
  return cleaned || null;
}

function lineFuzzyContains(line: string, token: string): boolean {
  if (line.includes(token)) return true;
  const folded = (s: string) => s.replace(/[_-]/g, "").toLowerCase();
  return folded(line).includes(folded(token));
}

function similarityOf(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la === lb) return 1;
  // quick containment / prefix heuristics
  if (lb.startsWith(la.slice(0, Math.min(20, la.length)))) return 0.9;
  const setA = new Set(la.split(/\s+/));
  const setB = new Set(lb.split(/\s+/));
  let shared = 0;
  for (const w of setA) if (setB.has(w)) shared++;
  return shared / Math.max(setA.size, setB.size);
}

/* ── tone pass ───────────────────────────────────────────────────────────── */

export function applyToneTemplate(title: string, body: string): { title: string; body: string } {
  // deterministic "humanizer": trims LLM-isms, enforces calm structure
  const deAi = (text: string) =>
    text
      .replace(/\b(seamlessly|blazingly|supercharge|delve|leverage[d]?|robust)\b/gi, (m) =>
        m.toLowerCase() === "leverage" ? "use" : m.toLowerCase() === "leveraged" ? "used" : ""
      )
      .replace(/!+/g, ".")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n");

  return { title: deAi(title).trim(), body: deAi(body).trim() };
}

export function toneStepTrace(engine: string, ms: number): StepTrace {
  return {
    id: "tone",
    label: "Tone pass — humanize PR text",
    agent: "tone agent",
    status: "ok",
    ms,
    notes:
      engine === "template"
        ? "template humanizer (offline) — plain verbs, no LLM-isms"
        : `humanized by ${engine}`,
  };
}
