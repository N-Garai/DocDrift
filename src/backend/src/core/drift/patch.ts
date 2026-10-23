/**
 * Patch synthesis: turn verified drift findings into concrete doc edits,
 * render a unified diff, and draft the pull-request text.
 */
import type {
  AnalyzeInput,
  CodeSymbol,
  DocEdit,
  DriftFinding,
  PatchResult,
} from "../types.js";
import type { MarkdownTable } from "../docs/markdown.js";

export interface PatchInput {
  input: AnalyzeInput;
  drifts: DriftFinding[];
  symbols: CodeSymbol[];
  tables: MarkdownTable[];
}

const NO_PATCH_KINDS = new Set([
  "stale-doc-value", // needs human judgment about the replacement text
]);

/** Build concrete doc edits from (pre-gate) findings. */
export function buildEdits(inp: PatchInput): DocEdit[] {
  const { input, drifts, symbols, tables } = inp;
  const edits: DocEdit[] = [];

  const docsByPath = new Map(input.docs.map((d) => [d.path, d]));
  const envFile = input.docs.find((d) => /\.env/.test(d.path));

  for (const d of drifts) {
    if (d.verified === false) continue;
    switch (d.kind) {
      case "changed-default": {
        if (!d.docEvidence) break;
        const updated = rewriteRowDefault(d.docEvidence.snippet, extractTarget(d.message));
        if (updated) {
          edits.push({
            file: d.docEvidence.file,
            line: d.docEvidence.line,
            oldText: d.docEvidence.snippet,
            newText: updated,
            reason: d.suggestion,
            driftId: d.id,
          });
        }
        break;
      }
      case "env-default-mismatch": {
        if (!d.docEvidence || !envFile) break;
        const key = d.symbol;
        const val = /code defaults to `([^`]+)`/.exec(d.message)?.[1];
        if (!val) break;
        edits.push({
          file: envFile.path,
          line: d.docEvidence.line,
          oldText: d.docEvidence.snippet,
          newText: `${key}=${val}`,
          reason: d.suggestion,
          driftId: d.id,
        });
        break;
      }
      case "undocumented-env": {
        if (!envFile) break;
        const val = /Add [A-Z_0-9]+=([^ ]*)/.exec(d.suggestion)?.[1] ?? "";
        edits.push({
          file: envFile.path,
          line: lastNonEmptyLine(docsByPath.get(envFile.path)?.content ?? ""),
          oldText: "",
          newText: `${d.symbol}=${val}`,
          reason: d.suggestion,
          driftId: d.id,
        });
        break;
      }
      case "renamed-symbol": {
        if (!d.docEvidence) break;
        const from = /docs reference `([^`]+)`/.exec(d.message)?.[1];
        const to = /code now exports `([^`]+)`/.exec(d.message)?.[1];
        if (!from || !to) break;
        edits.push({
          file: d.docEvidence.file,
          line: d.docEvidence.line,
          oldText: d.docEvidence.snippet,
          newText: d.docEvidence.snippet.replaceAll(from, to),
          reason: d.suggestion,
          driftId: d.id,
        });
        break;
      }
      case "route-stale-in-docs": {
        if (!d.docEvidence) break;
        const stale = /no longer exists/.test(d.message)
          ? /reference to (\/[\w/.:-]+)/.exec(d.suggestion)?.[1] ??
            /`?(\/api\/[\w/.:-]+)`?/.exec(d.message)?.[1]
          : undefined;
        const target = findReplacementRoute(stale, symbols);
        if (stale && target) {
          edits.push({
            file: d.docEvidence.file,
            line: d.docEvidence.line,
            oldText: d.docEvidence.snippet,
            newText: d.docEvidence.snippet.replaceAll(stale, target),
            reason: d.suggestion,
            driftId: d.id,
          });
        }
        break;
      }
      case "route-missing-in-docs": {
        const m = /`([A-Z]+) (\/[\w/.:{}-]+)`/.exec(d.suggestion);
        if (!m) break;
        const apiTable = tables.find((t) =>
          t.header.some((h) => /^(method|verb)$/i.test(h))
        ) ?? tables.find((t) => t.header.some((h) => /path|endpoint|route/i.test(h)));
        const file = apiTable?.file ?? input.docs[0]?.path;
        const line = apiTable
          ? apiTable.rows[apiTable.rows.length - 1]?.line
          : null;
        if (!file || !line) break;
        edits.push({
          file,
          line,
          oldText: "",
          newText: `| ${m[1]} | ${m[2]} | Documented by DocDrift |`,
          reason: d.suggestion,
          driftId: d.id,
        });
        break;
      }
      case "missing-in-docs": {
        const m = /default: (.+?)\)/.exec(d.suggestion);
        const def = m ? m[1] : "";
        const configTable = tables.find((t) =>
          t.header.some((h) => /^(option|setting|field|key|env var|variable)$/i.test(h))
        );
        const isField = d.symbol.includes(".");
        if (isField && configTable) {
          const lastRow = configTable.rows[configTable.rows.length - 1];
          if (!lastRow) break;
          edits.push({
            file: configTable.file,
            line: lastRow.line,
            oldText: "",
            newText: `| ${d.symbol.split(".")[1]} | ${def || "—"} | Documented by DocDrift — add a human description |`,
            reason: d.suggestion,
            driftId: d.id,
          });
        } else if (!isField && !NO_PATCH_KINDS.has(d.kind)) {
          const file = input.docs[0]?.path;
          if (!file) break;
          const content = docsByPath.get(file)?.content ?? "";
          edits.push({
            file,
            line: lastNonEmptyLine(content),
            oldText: "",
            newText: ["", `### \`${d.symbol}\``, "", `\`${d.symbol}\` — ${d.suggestion.replace(/^Document /, "Documents ")}`, ""].join("\n"),
            reason: d.suggestion,
            driftId: d.id,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  return edits;
}

/** Render surviving (gate-cleared) edits into a unified diff + PR text. */
export function renderPatch(
  edits: DocEdit[],
  input: AnalyzeInput,
  drifts: DriftFinding[],
  engineName: string
): PatchResult {
  const docsByPath = new Map(input.docs.map((d) => [d.path, d]));
  const envFile = input.docs.find((d) => /\.env/.test(d.path));

  const byFile = new Map<string, DocEdit[]>();
  for (const e of edits) {
    const arr = byFile.get(e.file) ?? [];
    arr.push(e);
    byFile.set(e.file, arr);
  }

  let diff = "";
  let additions = 0;
  let deletions = 0;
  const filesChanged: string[] = [];

  for (const [file, fileEdits] of byFile) {
    const content = docsByPath.get(file)?.content ?? envFile?.content ?? "";
    const oldLines = content.split("\n");
    const newLines = applyEdits(oldLines, fileEdits);
    const { text, add, del } = unifiedDiff(file, oldLines, newLines);
    if (add + del === 0) continue;
    diff += text;
    additions += add;
    deletions += del;
    filesChanged.push(file);
  }

  const { title, body } = draftPr(drifts, additions, deletions, filesChanged, engineName);
  const toned = { title, body };

  return { diff, filesChanged, additions, deletions, prTitle: toned.title, prBody: toned.body, edits };
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function extractTarget(message: string): string | null {
  return /code now ships `([^`]+)`/.exec(message)?.[1] ??
    /code defaults to `([^`]+)`/.exec(message)?.[1] ?? null;
}

/** Replace the stale default cell inside a markdown table row. */
function rewriteRowDefault(rowText: string, newValue: string | null): string | null {
  if (!newValue) return null;
  const cells = rowText.split("|");
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i].trim();
    if (i === 0) continue;
    if (/^(true|false|\d+(\.\d+)?|\/[\w/.-]*|[A-Z_0-9]+|[\w-]+)$/.test(c) && c.length > 0) {
      cells[i] = ` ${newValue} `;
      return cells.join("|");
    }
  }
  return null;
}

function findReplacementRoute(stale: string | undefined, symbols: CodeSymbol[]): string | null {
  if (!stale) return null;
  const versionM = /\/api\/(v\d+)\//.exec(stale);
  if (!versionM) return null;
  const newer = symbols.find((s) => {
    if (!s.route) return false;
    const m = /\/api\/(v\d+)\//.exec(s.route.path);
    return m && Number(m[1].slice(1)) > Number(versionM[1].slice(1));
  });
  return newer?.route?.path ?? null;
}

function lastNonEmptyLine(content: string): number {
  const lines = content.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() !== "") return i + 1;
  }
  return lines.length;
}

/**
 * Apply line edits to a snapshot. Edits with oldText === "" insert AFTER the
 * given line; others replace the matching line (matched by prefix-trim).
 */
function applyEdits(oldLines: string[], edits: DocEdit[]): string[] {
  const out = [...oldLines];
  const sorted = [...edits].sort((a, b) => b.line - a.line); // bottom-up
  for (const e of sorted) {
    const idx = e.line - 1;
    if (idx < 0 || idx >= out.length) continue;
    if (e.oldText === "") {
      const insertLines = e.newText.split("\n");
      // if the edit replaces a trailing line (append semantics), skip duplicates
      if (insertLines.length === 1 && out[idx].trim() === insertLines[0].trim()) continue;
      out.splice(idx + 1, 0, ...insertLines);
    } else if (out[idx].trim() === e.oldText.trim()) {
      out.splice(idx, 1, ...e.newText.split("\n"));
    } else {
      // tolerate whitespace drift: replace regardless, keyed by line number
      out.splice(idx, 1, ...e.newText.split("\n"));
    }
  }
  return out;
}

/** Small LCS-based unified diff (files are small; guarded). */
function unifiedDiff(
  file: string,
  oldL: string[],
  newL: string[]
): { text: string; add: number; del: number } {
  const n = oldL.length;
  const m = newL.length;
  let add = 0;
  let del = 0;

  if (n * m > 4_000_000) {
    return { text: `--- a/${file}\n+++ b/${file}\n(files too large for inline diff)\n`, add, del };
  }

  // LCS table
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        oldL[i] === newL[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  // walk to ops
  const ops: { type: "ctx" | "add" | "del"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldL[i] === newL[j]) {
      ops.push({ type: "ctx", text: oldL[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "del", text: oldL[i] });
      del++;
      i++;
    } else {
      ops.push({ type: "add", text: newL[j] });
      add++;
      j++;
    }
  }
  while (i < n) {
    ops.push({ type: "del", text: oldL[i++] });
    del++;
  }
  while (j < m) {
    ops.push({ type: "add", text: newL[j++] });
    add++;
  }

  if (add + del === 0) return { text: "", add, del };

  // emit hunks with 3 lines of context
  const CTX = 3;
  const hunks: { type: string; text: string }[][] = [];
  let current: { type: string; text: string }[] = [];
  let pendingCtx = 0;
  for (const op of ops) {
    if (op.type === "ctx") {
      if (current.length > 0) {
        if (pendingCtx < CTX) current.push(op);
        else {
          hunks.push(current);
          current = [];
        }
        pendingCtx++;
      } else if (pendingCtx < CTX) {
        current.push(op);
        pendingCtx++;
      } else {
        hunks.push(current);
        current = [];
        pendingCtx = 1;
        current.push(op);
      }
    } else {
      pendingCtx = 0;
      current.push(op);
    }
  }
  if (current.some((o) => o.type !== "ctx")) hunks.push(current);

  let text = `--- a/${file}\n+++ b/${file}\n`;
  let oldNo = 1;
  let newNo = 1;
  for (const hunk of hunks) {
    const oldStart = oldNo;
    const newStart = newNo;
    let hunkOld = 0;
    let hunkNew = 0;
    const lines = hunk.map((op) => {
      const sign = op.type === "add" ? "+" : op.type === "del" ? "-" : " ";
      return `${sign}${op.text}`;
    });
    for (const op of hunk) {
      if (op.type !== "add") {
        hunkOld++;
        oldNo++;
      }
      if (op.type !== "del") {
        hunkNew++;
        newNo++;
      }
    }
    text += `@@ -${oldStart},${hunkOld} +${newStart},${hunkNew} @@\n`;
    text += lines.join("\n") + "\n";
  }

  return { text, add, del };
}

/* ── PR drafting ─────────────────────────────────────────────────────────── */

export function draftPr(
  drifts: DriftFinding[],
  additions: number,
  deletions: number,
  filesChanged: string[],
  engineName: string
): { title: string; body: string } {
  const count = drifts.length;
  const title =
    count === 0
      ? "docs: no drift detected — documentation is in sync"
      : count === 1
        ? `docs: sync documentation with code (${drifts[0].symbol})`
        : `docs: sync documentation with code (${count} drifts)`;

  const bullets = drifts
    .slice(0, 12)
    .map((d) => `- **${d.symbol}** (${d.kind}) — ${d.message}`)
    .join("\n");

  const body = [
    "## What changed",
    "",
    count > 0
      ? "DocDrift found the following gaps between the code and the docs and drafted fixes:"
      : "No documentation drift was detected in this run.",
    "",
    bullets || "- nothing to fix — nice",
    "",
    "## Patch stats",
    "",
    `${filesChanged.length} file(s) · +${additions} −${deletions}`,
    "",
    "## Validation",
    "",
    "- Every finding is grounded in the extracted AST (code-side gate).",
    "- Every edit was applied to a docs snapshot and re-parsed (docs-side gate).",
    `- Findings synthesized by: ${engineName}.`,
    "",
    "> Drafted by DocDrift — review as you would any PR. The sloth did the typing.",
    "",
  ].join("\n");

  return { title, body };
}
