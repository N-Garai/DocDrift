import { test } from "node:test";
import assert from "node:assert/strict";
import { detectDrift } from "../../src/backend/src/core/drift/rules.js";
import { buildEdits, renderPatch } from "../../src/backend/src/core/drift/patch.js";
import { runValidationGates, applyToSnapshot } from "../../src/backend/src/core/agents/validate.js";
import { scenarios } from "../../src/backend/src/scenarios/index.js";
import type { AnalyzeInput, DriftFinding } from "../../src/backend/src/core/types.js";

async function detectFor(id: string) {
  const scenario = scenarios.find((s) => s.id === id)!;
  const input = scenario.toInput();
  const { extractSymbols } = await import("../../src/backend/src/core/extract/index.js");
  const ex = await extractSymbols([input.codeFile], input.language);
  const out = detectDrift({
    language: input.language,
    codeFile: input.codeFile,
    symbols: ex.symbols,
    docs: input.docs,
  });
  return { input, ex, out };
}

test("ts-config scenario: port drift, missing env key, stale log level", async () => {
  const { out } = await detectFor("ts-config-drift");
  const kinds = new Set(out.drifts.map((d) => `${d.kind}:${d.symbol}`));

  assert.ok([...kinds].some((k) => k.startsWith("changed-default:") && k.includes("PORT")), "port default drift");
  assert.ok(kinds.has("undocumented-env:ENABLE_CACHE"), "ENABLE_CACHE missing from .env.example");
  assert.ok([...kinds].some((k) => k.startsWith("env-default-mismatch:LOG_LEVEL") || k.startsWith("changed-default:LOG_LEVEL")), "stale log level default");
  assert.ok([...kinds].some((k) => k.startsWith("missing-in-docs:") && k.includes("cacheTtlSeconds")), "cacheTtlSeconds undocumented");

  const port = out.drifts.find((d) => d.symbol.includes("port") || d.symbol === "PORT");
  assert.equal(port?.severity, "critical");
});

test("api scenario: rename + stale + missing routes", async () => {
  const { out } = await detectFor("api-endpoint-rename");
  const kinds = out.drifts.map((d) => d.kind);
  assert.ok(kinds.includes("renamed-symbol"), "registerRoutes → registerDocumentRoutes");
  assert.ok(kinds.includes("route-stale-in-docs"));
  assert.ok(kinds.includes("route-missing-in-docs"));
});

test("pydantic scenario: value drifts in the settings table", async () => {
  const { out } = await detectFor("pydantic-schema");
  const msgs = out.drifts.map((d) => `${d.symbol} ${d.message}`);
  assert.ok(msgs.some((m) => m.includes("8080")), "port 3000→8080 flagged");
  assert.ok(msgs.some((m) => m.includes("enable_telemetry")), "telemetry flag flip flagged");
  assert.ok(msgs.some((m) => m.includes("/var/cache")), "cache_dir drift flagged");
});

test("edits apply cleanly and the unified diff renders", async () => {
  const { input, ex, out } = await detectFor("ts-config-drift");
  // pipeline order: gate-1 verifies findings → patch builds edits
  const gate1 = runValidationGates(input, out.drifts, []);
  const edits = buildEdits({ input, drifts: gate1.drifts, symbols: ex.symbols, tables: out.tables });
  assert.ok(edits.length > 0);

  const patch = renderPatch(edits, input, out.drifts, "deterministic engine");
  assert.ok(patch.diff.includes("--- a/"));
  assert.ok(patch.diff.includes("+++ b/"));
  assert.ok(patch.diff.includes("@@"));
  assert.ok(patch.additions > 0 || patch.deletions > 0);
  assert.ok(patch.prTitle.startsWith("docs:"));
  assert.ok(patch.prBody.includes("## What changed"));
});

test("gate 1 drops findings whose code evidence does not exist", async () => {
  const { input } = await detectFor("ts-config-drift");
  const fabricated: DriftFinding = {
    id: "fake",
    kind: "changed-default",
    severity: "critical",
    symbol: "GhostConfig",
    message: "hallucinated",
    codeEvidence: { file: "config.ts", line: 9999, snippet: "not real" },
    docEvidence: null,
    suggestion: "n/a",
    verified: false,
  };
  const gate = runValidationGates(input, [fabricated], []);
  assert.equal(gate.report.codeGrounding.dropped, 1);
  assert.equal(gate.drifts[0].verified, false);
});

test("gate 2 rejects edits that break markdown tables", async () => {
  const { input } = await detectFor("ts-config-drift");
  const breakingEdit = {
    file: "docs/setup.md",
    line: 9,
    oldText: "| PORT | 3000 | HTTP server port |",
    newText: "| PORT | 8080 |", // drops a column
    reason: "test",
    driftId: "t1",
  };
  const gate = runValidationGates(input, [], [breakingEdit]);
  assert.equal(gate.report.docsApply.failed, 1, "table-breaking edit rejected");
});

test("applyToSnapshot inserts and replaces lines", () => {
  const snap = applyToSnapshot("a\nb\nc", [
    { file: "x", line: 2, oldText: "b", newText: "B", reason: "", driftId: "d" },
    { file: "x", line: 3, oldText: "", newText: "NEW", reason: "", driftId: "d" },
  ]);
  assert.deepEqual(snap.split("\n"), ["a", "B", "c", "NEW"]);
});

test("custom minimal input still yields drift", async () => {
  const input: AnalyzeInput = {
    scenarioId: null,
    language: "typescript",
    codeFile: { path: "config.ts", content: "export const PORT = 8080;\nexport interface Cfg { port: number }\n" },
    docs: [{ path: "docs/setup.md", content: "# Setup\n\n| Option | Default |\n| ------ | ------- |\n| PORT | 3000 |\n" }],
  };
  const { extractSymbols } = await import("../../src/backend/src/core/extract/index.js");
  const ex = await extractSymbols([input.codeFile], "typescript");
  const out = detectDrift({ language: "typescript", codeFile: input.codeFile, symbols: ex.symbols, docs: input.docs });
  assert.ok(out.drifts.some((d) => d.symbol.includes("PORT") && d.kind === "changed-default"));
});
