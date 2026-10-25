/* ────────────────────────────────────────────────────────────────────────────
 * DocDrift engine — shared domain types.
 * Mirrored on the client in src/frontend/src/lib/api.ts.
 * ──────────────────────────────────────────────────────────────────────────── */

export type SymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "const"
  | "field"
  | "route"
  | "env-key";

export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  line: number;
  signature: string;
  defaultValue?: string;
  route?: { method: string; path: string };
  file: string;
}

export interface DocTarget {
  file: string;
  kind: "heading" | "table-row" | "code-span" | "env-line" | "prose";
  line: number;
  text: string;
  symbolHint?: string;
}

export type DriftKind =
  | "changed-default"
  | "missing-in-docs"
  | "stale-doc-value"
  | "renamed-symbol"
  | "removed-symbol"
  | "undocumented-env"
  | "env-default-mismatch"
  | "route-missing-in-docs"
  | "route-stale-in-docs";

export type Severity = "critical" | "major" | "minor";

export interface Evidence {
  file: string;
  line: number;
  snippet: string;
}

export interface DriftFinding {
  id: string;
  kind: DriftKind;
  severity: Severity;
  symbol: string;
  message: string;
  codeEvidence: Evidence;
  docEvidence: Evidence | null;
  suggestion: string;
  verified: boolean;
  validatorNotes?: string;
}

export interface DocEdit {
  file: string;
  line: number;
  oldText: string;
  newText: string;
  reason: string;
  driftId: string;
}

export interface PatchResult {
  diff: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
  prTitle: string;
  prBody: string;
  edits: DocEdit[];
}

export type StepStatus = "ok" | "degraded" | "skipped" | "fail";

export interface StepTrace {
  id: string;
  label: string;
  agent: string;
  status: StepStatus;
  ms: number;
  notes: string;
}

export interface ValidationReport {
  codeGrounding: {
    passed: boolean;
    checked: number;
    dropped: number;
    notes: string;
  };
  docsApply: { passed: boolean; applied: number; failed: number; notes: string };
  tonePass: { applied: boolean; engine: string };
}

export interface EngineInfo {
  engine: "gemma-ollama" | "gemma-gemini" | "heuristic";
  model?: string;
  parser: "tree-sitter" | "heuristic";
  reason: string;
}

export interface SourceFile {
  path: string;
  content: string;
}

export interface AnalyzeInput {
  scenarioId: string | null;
  language: "typescript" | "python";
  codeFile: SourceFile;
  /**
   * Additional code files that give the engine repo-wide context — files the
   * docs reference, modules the primary file imports, etc. Their symbols join
   * the same index; evidence always names the exact file it came from.
   */
  extraCodeFiles?: SourceFile[];
  docs: SourceFile[];
  envExample?: SourceFile;
}

export interface AnalyzeResult {
  ok: true;
  scenarioId: string | null;
  symbols: CodeSymbol[];
  docTargets: DocTarget[];
  drifts: DriftFinding[];
  patch: PatchResult;
  steps: StepTrace[];
  validations: ValidationReport;
  engine: EngineInfo;
  totalMs: number;
}

/* ── zod schemas for API boundary validation ─────────────────────────────── */

import { z } from "zod";

export const sourceFileSchema = z.object({
  path: z.string().min(1).max(200),
  content: z.string().min(1).max(120_000),
});

export const analyzeRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("scenario"),
    scenarioId: z.string().min(1).max(80),
  }),
  z.object({
    mode: z.literal("custom"),
    language: z.enum(["typescript", "python"]),
    custom: z.object({
      codeFile: sourceFileSchema,
      extraCodeFiles: z.array(sourceFileSchema).max(10).optional(),
      docs: z.array(sourceFileSchema).min(1).max(6),
      envExample: sourceFileSchema.optional(),
    }),
  }),
]);

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
