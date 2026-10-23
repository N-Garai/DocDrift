/* ────────────────────────────────────────────────────────────────────────────
 * Shared API contract with the DocDrift engine (mirrors src/backend types).
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

export interface DriftFinding {
  id: string;
  kind: DriftKind;
  severity: "critical" | "major" | "minor";
  symbol: string;
  message: string;
  codeEvidence: { file: string; line: number; snippet: string };
  docEvidence: { file: string; line: number; snippet: string } | null;
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
  codeGrounding: { passed: boolean; checked: number; dropped: number; notes: string };
  docsApply: { passed: boolean; applied: number; failed: number; notes: string };
  tonePass: { applied: boolean; engine: string };
}

export interface EngineInfo {
  engine: "gemma-ollama" | "gemma-gemini" | "heuristic";
  model?: string;
  parser: "tree-sitter" | "heuristic";
  reason: string;
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

export interface ScenarioFile {
  path: string;
  label: string;
  content: string;
  stale: boolean;
}

export interface ScenarioMeta {
  id: string;
  title: string;
  language: "typescript" | "python";
  tagline: string;
  description: string;
  files: ScenarioFile[];
}

export interface HealthInfo {
  ok: boolean;
  service: string;
  version: string;
  parser: string;
  engine: string;
  providers: { ollama: boolean; gemini: boolean };
  parserFailures: number;
  uptimeSec: number;
}

export interface AnalyzeRequest {
  mode: "scenario" | "custom";
  scenarioId?: string;
  language?: "typescript" | "python";
  custom?: {
    codeFile: { path: string; content: string };
    docs: { path: string; content: string }[];
    envExample?: { path: string; content: string };
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Client helpers
 * ──────────────────────────────────────────────────────────────────────────── */

const BACKEND_PORT = process.env.NEXT_PUBLIC_BACKEND_PORT;

/**
 * Build an engine URL.
 * - Sandbox/dev  : the gateway expects `?XTransformPort=<backend port>`.
 * - Production   : the Express engine serves the frontend itself → plain path.
 */
export function apiUrl(path: string): string {
  return BACKEND_PORT ? `${path}?XTransformPort=${BACKEND_PORT}` : path;
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Engine responded ${res.status}: ${detail.slice(0, 180)}`);
  }
  return res.json() as Promise<T>;
}

export function fetchScenarios() {
  return jsonFetch<ScenarioMeta[]>("/api/scenarios");
}

export function fetchHealth() {
  return jsonFetch<HealthInfo>("/api/health");
}

export function analyze(req: AnalyzeRequest) {
  return jsonFetch<AnalyzeResult>("/api/analyze", {
    method: "POST",
    body: JSON.stringify(req),
  });
}
