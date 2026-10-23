/**
 * Deterministic drift detection.
 *
 * These rules run with or without an LLM. When Gemma is available it
 * augments/refines findings; here the rules guarantee a truthful baseline.
 * Every finding carries line-precise evidence on BOTH sides so the
 * code-grounding validator can verify it mechanically.
 */
import type {
  CodeSymbol,
  DocEdit,
  DriftFinding,
  SourceFile,
} from "../types.js";
import type { DocsParseResult, MarkdownTable } from "../docs/markdown.js";
import { rowDefault, parseMarkdown, parseEnvExample } from "../docs/markdown.js";
import { matchSymbolsToDocs, similarity, baseName } from "../match/matcher.js";

export interface DriftDetectionInput {
  language: "typescript" | "python";
  codeFile: SourceFile;
  symbols: CodeSymbol[];
  docs: SourceFile[];
}

export interface DriftDetectionOutput {
  drifts: DriftFinding[];
  parses: DocsParseResult[];
  tables: MarkdownTable[];
  envFiles: { file: SourceFile; entries: Map<string, { line: number; key: string; value: string }> }[];
  codeHighlights: Map<string, number[]>;
  docHighlights: Map<string, number[]>;
}

const PORTISH = /port|url|host|endpoint|addr/i;

/** Resolve identifier defaults (e.g. port: int = DEFAULT_PORT) through consts. */
function resolveDefault(s: CodeSymbol, symbols: CodeSymbol[], depth = 0): string | undefined {
  const v = s.defaultValue;
  if (v === undefined || depth > 2) return v;
  if (/^[A-Z_][A-Z0-9_]*$/.test(v)) {
    const target = symbols.find((x) => x.kind === "const" && x.name === v && x.defaultValue !== undefined);
    if (target) return resolveDefault(target, symbols, depth + 1);
  }
  return v;
}

function normValue(v: string): string {
  return v
    .trim()
    .replace(/^["'`]|["'`]$/g, "")
    .replace(/^True$/, "true")
    .replace(/^False$/, "false")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function valuesDiffer(a: string, b: string): boolean {
  const x = normValue(a);
  const y = normValue(b);
  if (x === y) return false;
  const nx = Number(x);
  const ny = Number(y);
  if (!Number.isNaN(nx) && !Number.isNaN(ny)) return nx !== ny;
  return true;
}

function cleanHint(hint: string): string {
  return hint.replace(/[()<>?,.;:]+$/g, "").replace(/[()<>]/g, "").trim();
}

export function detectDrift(input: DriftDetectionInput): DriftDetectionOutput {
  const { language, codeFile, symbols, docs } = input;

  /* parse docs side ─────────────────────────────────────────────────────── */
  const parses: DocsParseResult[] = [];
  const tables: MarkdownTable[] = [];
  const docTargets = [];
  const envFiles: DriftDetectionOutput["envFiles"] = [];

  for (const d of docs) {
    const p = parseMarkdown(d);
    parses.push(p);
    tables.push(...p.tables);
    docTargets.push(...p.targets);
  }

  let envParsed: ReturnType<typeof parseEnvExample> | null = null;
  const envFile = input.docs.find((d) => /\.env/.test(d.path));
  if (envFile) {
    envParsed = parseEnvExample(envFile);
    docTargets.push(...envParsed.targets);
    envFiles.push({ file: envFile, entries: envParsed.entries });
  }

  /* match ───────────────────────────────────────────────────────────────── */
  const { bySymbol, matchedTargetKeys, renameHints } = matchSymbolsToDocs(
    symbols,
    docTargets
  );

  const drifts: DriftFinding[] = [];
  const codeHighlights = new Map<string, number[]>();
  const docHighlights = new Map<string, number[]>();

  const push = (d: DriftFinding) => {
    drifts.push(d);
    const ca = codeHighlights.get(d.codeEvidence.file) ?? [];
    ca.push(d.codeEvidence.line);
    codeHighlights.set(d.codeEvidence.file, ca);
    if (d.docEvidence) {
      const da = docHighlights.get(d.docEvidence.file) ?? [];
      da.push(d.docEvidence.line);
      docHighlights.set(d.docEvidence.file, da);
    }
  };

  /* rule 1 — changed defaults ───────────────────────────────────────────── */
  for (const s of symbols) {
    if (!s.defaultValue) continue;
    if (s.kind === "env-key") continue;
    const effectiveDefault = resolveDefault(s, symbols);
    if (effectiveDefault === undefined) continue;
    const targets = bySymbol.get(s.name);
    if (!targets) continue;
    for (const t of targets) {
      let docVal: string | null = null;
      if (t.kind === "table-row") {
        const table = tables.find(
          (tb) => tb.file === t.file && tb.rows.some((r) => r.line === t.line)
        );
        const row = table?.rows.find((r) => r.line === t.line);
        if (table && row) {
          const cells = splitRowText(t.text);
          docVal = rowDefault(cells);
        }
      } else if (t.kind === "env-line") {
        docVal = t.text.split("=").slice(1).join("=").trim() || null;
      } else if (t.kind === "code-span") {
        const m = /(?:defaults? to|@default|=)\s*`?([^`.,;\s]+)`?/i.exec(t.text);
        docVal = m ? m[1] : null;
      }
      if (!docVal) continue;
      if (valuesDiffer(effectiveDefault, docVal)) {
        push({
          id: `changed-default:${s.name}:${t.file}:${t.line}`,
          kind: "changed-default",
          severity: PORTISH.test(s.name) ? "critical" : "major",
          symbol: s.name,
          message: `documented default is \`${docVal}\` but the code now ships \`${effectiveDefault}\``,
          codeEvidence: { file: s.file, line: s.line, snippet: s.signature },
          docEvidence: { file: t.file, line: t.line, snippet: t.text },
          suggestion: `Update the documented default for ${s.name} from ${docVal} to ${effectiveDefault}.`,
          verified: false,
        });
      }
    }
  }

  /* rule 2 — symbols missing from docs ──────────────────────────────────── */
  const documentedTables = tables;
  const reportedFieldBase = new Set<string>();
  for (const s of symbols) {
    if (s.kind === "env-key" || s.kind === "route") continue;
    if (bySymbol.has(s.name)) continue;
    // fields: only report when the parent type itself is documented
    if (s.kind === "field" && s.name.includes(".")) {
      const parent = s.name.split(".")[0];
      const parentDocumented = symbols.some(
        (p) => p.name === parent && [...bySymbol.keys()].some((k) => k === parent)
      );
      if (!parentDocumented) continue;
      const base = s.name.split(".")[1].toLowerCase();
      if (reportedFieldBase.has(base)) continue; // same gap already reported via interface/const twin
      reportedFieldBase.add(base);
      push({
        id: `missing-in-docs:${s.name}`,
        kind: "missing-in-docs",
        severity: "minor",
        symbol: s.name,
        message: "is part of the public surface but has no documentation row",
        codeEvidence: { file: s.file, line: s.line, snippet: s.signature },
        docEvidence: null,
        suggestion: `Add ${s.name} (default: ${s.defaultValue ?? "n/a"}) to the configuration table.`,
        verified: false,
      });
      continue;
    }
    if (s.kind === "field") continue;
    push({
      id: `missing-in-docs:${s.name}`,
      kind: "missing-in-docs",
      severity: "major",
      symbol: s.name,
      message: "is exported but never mentioned in the docs",
      codeEvidence: { file: s.file, line: s.line, snippet: s.signature },
      docEvidence: null,
      suggestion: `Document ${s.name} (${s.kind}) — e.g. under the API or configuration section.`,
      verified: false,
    });
  }

  /* rule 3 — orphaned doc targets: renamed or removed references ────────── */
  for (const t of docTargets) {
    if (t.kind === "heading") continue;
    const key = `${t.file}:${t.line}:${t.symbolHint ?? ""}`;
    if (matchedTargetKeys.has(key)) continue;
    const hint = t.symbolHint ? cleanHint(t.symbolHint) : null;
    if (!hint || hint.length < 3) continue;

    // env lines are handled by the env rules
    if (t.kind === "env-line") continue;

    const renameTo = renameHints.get(hint) ?? [...renameHints.entries()].find(([, h]) => similarity(h, hint) >= 0.62)?.[0];
    const table = tables.find(
      (tb) => tb.file === t.file && tb.rows.some((r) => r.line === t.line)
    );
    const isRow = t.kind === "table-row" && !!table;

    if (renameTo) {
      const s = symbols.find((x) => x.name === renameTo)!;
      push({
        id: `renamed-symbol:${hint}:${t.file}:${t.line}`,
        kind: "renamed-symbol",
        severity: "major",
        symbol: hint,
        message: `docs reference \`${hint}\` — the code now exports \`${renameTo}\``,
        codeEvidence: { file: s.file, line: s.line, snippet: s.signature },
        docEvidence: { file: t.file, line: t.line, snippet: t.text },
        suggestion: `Replace references to ${hint} with ${renameTo}.`,
        verified: false,
      });
      continue;
    }

    // routes mentioned in prose/rows but gone from code
    const routeLike = /\/api\/[\w/.:-]+/.exec(t.text);
    const codeRouteExists =
      routeLike &&
      symbols.some((s) => s.route && t.text.includes(s.route.path));
    if (routeLike && !codeRouteExists) {
      push({
        id: `route-stale-in-docs:${t.file}:${t.line}`,
        kind: "route-stale-in-docs",
        severity: "major",
        symbol: routeLike[0],
        message: "this route path no longer exists in the code",
        codeEvidence: {
          file: codeFile.path,
          line: symbols.find((s) => s.route)?.line ?? 1,
          snippet: symbols.find((s) => s.route)?.signature ?? codeFile.content.split("\n")[0],
        },
        docEvidence: { file: t.file, line: t.line, snippet: t.text },
        suggestion: `Update or remove the stale route reference to ${routeLike[0]}.`,
        verified: false,
      });
      continue;
    }

    // generic stale symbol reference (only for rows/spans that look symbolic)
    if ((t.kind === "table-row" && isRow) || t.kind === "code-span") {
      const anyRef = symbols.some(
        (s) => similarity(baseName(s.name), hint) >= 0.62
      );
      if (!anyRef) {
        push({
          id: `stale-doc-value:${hint}:${t.file}:${t.line}`,
          kind: "stale-doc-value",
          severity: "major",
          symbol: hint,
          message: "this documented symbol no longer exists anywhere in the code",
          codeEvidence: {
            file: codeFile.path,
            line: 1,
            snippet: codeFile.content.split("\n")[0] ?? "",
          },
          docEvidence: { file: t.file, line: t.line, snippet: t.text },
          suggestion: `Remove or rewrite the reference to ${hint}.`,
          verified: false,
        });
      }
    }
  }

  /* rule 4 — env keys ───────────────────────────────────────────────────── */
  const envKeySymbols = symbols.filter((s) => s.kind === "env-key");
  if (envFile && envParsed) {
    for (const s of envKeySymbols) {
      const entry = envParsed.entries.get(s.name);
      const docDefault = findEnvDefaultInTables(s.name, tables);
      if (!entry && !docDefault) {
        push({
          id: `undocumented-env:${s.name}`,
          kind: "undocumented-env",
          severity: "major",
          symbol: s.name,
          message: "is read by the code but missing from .env.example",
          codeEvidence: { file: s.file, line: s.line, snippet: s.signature },
          docEvidence: null,
          suggestion: `Add ${s.name}=${defaultFor(s, symbols) ?? ""} to .env.example.`,
          verified: false,
        });
        continue;
      }
      // value mismatch between code default and .env.example
      const codeDefault = defaultFor(s, symbols);
      if (entry && codeDefault && valuesDiffer(codeDefault, entry.value)) {
        push({
          id: `env-default-mismatch:${s.name}`,
          kind: "env-default-mismatch",
          severity: PORTISH.test(s.name) ? "critical" : "major",
          symbol: s.name,
          message: `.env.example ships \`${entry.value}\` but the code defaults to \`${codeDefault}\``,
          codeEvidence: { file: s.file, line: s.line, snippet: s.signature },
          docEvidence: { file: envFile.path, line: entry.line, snippet: `${s.name}=${entry.value}` },
          suggestion: `Set ${s.name}=${codeDefault} in .env.example (or update the code default).`,
          verified: false,
        });
      }
      if (docDefault && codeDefault && valuesDiffer(codeDefault, docDefault)) {
        // documented in a markdown table with a stale default
        const t = docTargets.find(
          (tt) => tt.kind === "table-row" && tt.symbolHint?.toUpperCase() === s.name
        );
        if (t) {
          push({
            id: `changed-default:${s.name}:${t.file}:${t.line}`,
            kind: "changed-default",
            severity: PORTISH.test(s.name) ? "critical" : "major",
            symbol: s.name,
            message: `setup guide documents \`${docDefault}\` but the code defaults to \`${codeDefault}\``,
            codeEvidence: { file: s.file, line: s.line, snippet: s.signature },
            docEvidence: { file: t.file, line: t.line, snippet: t.text },
            suggestion: `Update ${s.name} default in the guide from ${docDefault} to ${codeDefault}.`,
            verified: false,
          });
        }
      }
    }
  }

  /* rule 5 — routes missing from docs ───────────────────────────────────── */
  for (const s of symbols.filter((x) => x.kind === "route" && x.route)) {
    const mentioned = docTargets.some(
      (t) => t.text.includes(s.route!.path) && t.text.toLowerCase().includes(s.route!.method.toLowerCase())
    );
    if (!mentioned) {
      push({
        id: `route-missing-in-docs:${s.name}`,
        kind: "route-missing-in-docs",
        severity: "major",
        symbol: s.name,
        message: "this endpoint is registered in code but absent from the API reference",
        codeEvidence: { file: s.file, line: s.line, snippet: s.signature },
        docEvidence: null,
        suggestion: `Add \`${s.route!.method} ${s.route!.path}\` to the API table.`,
        verified: false,
      });
    }
  }

  /* dedupe + cap ────────────────────────────────────────────────────────── */
  const seen = new Set<string>();
  const unique = drifts.filter((d) => {
    const k = `${d.kind}|${d.symbol}|${d.docEvidence?.file ?? "-"}:${d.docEvidence?.line ?? "-"}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  unique.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  return { drifts: unique.slice(0, 24), parses, tables, envFiles, codeHighlights, docHighlights };
}

function splitRowText(text: string): string[] {
  return text.split("|").map((c) => c.trim());
}

function severityRank(s: "critical" | "major" | "minor"): number {
  return s === "critical" ? 0 : s === "major" ? 1 : 2;
}

function findEnvDefaultInTables(
  key: string,
  tables: MarkdownTable[]
): string | null {
  for (const t of tables) {
    for (const r of t.rows) {
      if (r.cells[0]?.toUpperCase() === key.toUpperCase()) {
        return rowDefault(r.cells);
      }
    }
  }
  return null;
}

function defaultFor(s: CodeSymbol, symbols: CodeSymbol[]): string | null {
  // find a code default: DEFAULT_<KEY> const, or interface field with the key name
  const direct = symbols.find(
    (x) =>
      (x.kind === "const" || x.kind === "field") &&
      x.defaultValue &&
      (x.name.toUpperCase().endsWith(`_${s.name}`) ||
        x.name.toUpperCase() === s.name ||
        x.name.toUpperCase() === `DEFAULT_${s.name}`)
  );
  if (direct?.defaultValue) return resolveDefault(direct, symbols) ?? direct.defaultValue;
  // convention: field on config interface — e.g. Config.enableCache ↔ ENABLE_CACHE
  const folded = s.name.replace(/_/g, "").toLowerCase();
  const field = symbols.find(
    (x) =>
      x.kind === "field" &&
      x.defaultValue &&
      baseName(x.name).replace(/_/g, "").toLowerCase() === folded
  );
  return field?.defaultValue ?? null;
}

export type { DocEdit };
