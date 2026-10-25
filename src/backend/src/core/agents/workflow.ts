/**
 * The DocDrift agent workflow — orchestrated with Mastra
 * (open-source TypeScript agent harness, @mastra/core).
 *
 * Graph:
 *   intake → extract → docs → synthesize → gate-1 → patch → gate-2 → tone → emit
 *
 * Each step is a typed Mastra step (zod schemas in/out). LLM steps call the
 * Gemma provider chain (Ollama → free Gemini API) and degrade to the
 * deterministic engine — the workflow NEVER fails because a model is absent.
 */
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { extractSymbols } from "../extract/index.js";
import { parseMarkdown, parseEnvExample } from "../docs/markdown.js";
import { detectDrift } from "../drift/rules.js";
import { buildEdits, renderPatch } from "../drift/patch.js";
import {
  runValidationGates,
  applyToneTemplate,
  type GateResult,
} from "./validate.js";
import {
  runExtractionAgent,
  runValidatorAgent,
  runPatchAgent,
  runToneAgent,
} from "./mastra-agents.js";
import { captureWorkflowError } from "../sentry.js";
import { extractJson } from "../llm/prompts.js";
import type {
  AnalyzeInput,
  AnalyzeResult,
  DriftFinding,
  EngineInfo,
  SourceFile,
} from "../types.js";

/* ── Gemma provider wrapper used by the Mastra agents in this workflow ──── */

async function callMastraGemma(system: string, prompt: string): Promise<string> {
  try {
    const { ollamaGenerate } = await import("../llm/ollama.js");
    const result = await ollamaGenerate(system, prompt, { timeoutMs: 15_000 });
    return result.text;
  } catch {
    try {
      const { geminiGenerate } = await import("../llm/gemini.js");
      const result = await geminiGenerate(system, prompt, { timeoutMs: 20_000 });
      return result.text;
    } catch {
      return "";
    }
  }
}

/* ── zod shapes (mirroring the domain types) ─────────────────────────────── */

const sourceFile: z.ZodType<SourceFile> = z.object({
  path: z.string(),
  content: z.string(),
});

const stepTraceSchema = z.object({
  id: z.string(),
  label: z.string(),
  agent: z.string(),
  status: z.enum(["ok", "degraded", "skipped", "fail"]),
  ms: z.number(),
  notes: z.string(),
});

const driftKind = z.enum([
  "changed-default",
  "missing-in-docs",
  "stale-doc-value",
  "renamed-symbol",
  "removed-symbol",
  "undocumented-env",
  "env-default-mismatch",
  "route-missing-in-docs",
  "route-stale-in-docs",
]);

const findingSchema = z.object({
  id: z.string(),
  kind: driftKind,
  severity: z.enum(["critical", "major", "minor"]),
  symbol: z.string(),
  message: z.string(),
  codeEvidence: z.object({ file: z.string(), line: z.number(), snippet: z.string() }),
  docEvidence: z
    .object({ file: z.string(), line: z.number(), snippet: z.string() })
    .nullable(),
  suggestion: z.string(),
  verified: z.boolean(),
  validatorNotes: z.string().optional(),
});

const editSchema = z.object({
  file: z.string(),
  line: z.number(),
  oldText: z.string(),
  newText: z.string(),
  reason: z.string(),
  driftId: z.string(),
});

const patchSchema = z.object({
  diff: z.string(),
  filesChanged: z.array(z.string()),
  additions: z.number(),
  deletions: z.number(),
  prTitle: z.string(),
  prBody: z.string(),
  edits: z.array(editSchema),
});

const ctxInputShape = {
  scenarioId: z.string().nullable(),
  language: z.enum(["typescript", "python"]),
  codeFile: sourceFile,
  extraCodeFiles: z.array(sourceFile).max(10).optional(),
  docs: z.array(sourceFile),
  envExample: sourceFile.optional(),
};

const ctxSchema = z.object({
  input: z.object(ctxInputShape),
  engine: z.object({
    engine: z.enum(["gemma-ollama", "gemma-gemini", "heuristic"]),
    model: z.string().optional(),
    parser: z.enum(["tree-sitter", "heuristic"]),
    reason: z.string(),
  }),
  symbols: z.array(z.any()).default([]),
  docTargets: z.array(z.any()).default([]),
  drifts: z.array(findingSchema).default([]),
  edits: z.array(editSchema).default([]),
  patch: patchSchema.nullable().default(null),
  gates: z.any().nullable().default(null),
  steps: z.array(stepTraceSchema).default([]),
  startedAt: z.number().default(0),
});

type Ctx = z.infer<typeof ctxSchema>;

/* ── helpers ─────────────────────────────────────────────────────────────── */

function trace<T extends { steps: Ctx["steps"]; startedAt: number }>(
  ctx: T,
  id: string,
  label: string,
  agent: string,
  status: "ok" | "degraded" | "skipped" | "fail",
  notes: string,
  t0: number
): T["steps"] {
  return [
    ...ctx.steps,
    { id, label, agent, status, ms: Math.max(1, Date.now() - t0), notes },
  ];
}

/* ── steps ───────────────────────────────────────────────────────────────── */

const intakeSchema = z.object({
  input: z.object(ctxInputShape),
  engine: z.object({
    engine: z.enum(["gemma-ollama", "gemma-gemini", "heuristic"]),
    model: z.string().optional(),
    parser: z.enum(["tree-sitter", "heuristic"]),
    reason: z.string(),
  }),
});

const intake = createStep({
  id: "intake",
  inputSchema: intakeSchema,
  outputSchema: ctxSchema,
  execute: async ({ inputData }) => {
    const t0 = Date.now();
    const { input, engine } = inputData;
    const codeCount = 1 + (input.extraCodeFiles?.length ?? 0);
    const steps = trace(
      { steps: [], startedAt: t0 },
      "intake",
      "Intake — collect the changed tree",
      "intake",
      "ok",
      `${input.scenarioId ? `scenario '${input.scenarioId}'` : "custom input"} · ${input.codeFile.path}${codeCount > 1 ? ` + ${codeCount - 1} context file(s)` : ""} · ${input.docs.length} doc file(s) · engine: ${engine.engine}`,
      t0
    );
    return {
      input,
      engine,
      symbols: [],
      docTargets: [],
      drifts: [],
      edits: [],
      patch: null,
      gates: null,
      steps,
      startedAt: t0,
    } as unknown as Ctx;
  },
});

const extract = createStep({
  id: "extract",
  inputSchema: ctxSchema,
  outputSchema: ctxSchema,
  execute: async ({ inputData }) => {
    const t0 = Date.now();
    const ctx = inputData;
    // Build the symbol index across the primary file plus every extra code
    // file (docs-referenced modules) — symbols carry their own file+line, so
    // later steps can ground evidence per file.
    const codeFiles = [ctx.input.codeFile, ...(ctx.input.extraCodeFiles ?? [])];
    const res = await extractSymbols(codeFiles, ctx.input.language);
    const parser = res.parser === "tree-sitter" ? "tree-sitter" : "heuristic";
    const steps = trace(
      ctx,
      "extract",
      "AST extractor — public surface",
      `extractor agent (${res.parser})`,
      res.parser === "tree-sitter" ? "ok" : "degraded",
      `${res.symbols.length} symbols across ${codeFiles.length} file(s) · ${res.notes}`,
      t0
    );
    return {
      ...ctx,
      symbols: res.symbols,
      engine: { ...ctx.engine, parser },
      steps,
    } as Ctx;
  },
});

const docs = createStep({
  id: "docs",
  inputSchema: ctxSchema,
  outputSchema: ctxSchema,
  execute: async ({ inputData }) => {
    const t0 = Date.now();
    const ctx = inputData;
    let count = 0;
    for (const d of ctx.input.docs) {
      if (/\.env/.test(d.path)) {
        count += parseEnvExample(d).targets.length;
      } else {
        count += parseMarkdown(d).targets.length;
      }
    }
    const steps = trace(
      ctx,
      "docs",
      "Docs parser — markdown tables, env keys",
      "docs agent",
      "ok",
      `${count} doc targets across ${ctx.input.docs.length} file(s)`,
      t0
    );
    return { ...ctx, docTargets: [], steps } as Ctx;
  },
});

const synthesize = createStep({
  id: "synthesize",
  inputSchema: ctxSchema,
  outputSchema: ctxSchema,
  execute: async ({ inputData }) => {
    const t0 = Date.now();
    const ctx = inputData;

    const detection = detectDrift({
      language: ctx.input.language,
      codeFile: ctx.input.codeFile,
      extraCodeFiles: ctx.input.extraCodeFiles,
      symbols: ctx.symbols,
      docs: ctx.input.docs,
    });

    let drifts: DriftFinding[] = detection.drifts;
    let engineNote = `deterministic rules · ${drifts.length} findings`;

    // Gemma augmentation via Mastra ValidatorAgent (only when a provider is live)
    if (ctx.engine.engine !== "heuristic") {
      try {
        const payload = JSON.stringify(
          {
            symbols: ctx.symbols.slice(0, 60),
            docTargets: detection.docHighlights,
            rule_findings: drifts.map((d) => ({ symbol: d.symbol, kind: d.kind, message: d.message })),
          },
          null,
          0
        );
        const llmText = await callMastraGemma(
          `You are the Drift Synthesizer inside DocDrift. Identify documentation drift (stale defaults, missing symbols, renamed references, undocumented env keys, stale routes) and propose precise fixes. Only make claims directly supported by the provided data. Respond with STRICT JSON only: {"summary": string, "tone": "confident", "extra_findings": [{"symbol": string, "kind": "changed-default|missing-in-docs|renamed-symbol|stale-doc-value|undocumented-env", "message": string, "suggestion": string}], "pr_title": string}`,
          `CODE SYMBOLS AND DOC TARGETS JSON:\n${payload}\n\nIdentify the documentation drift and respond with the JSON object.`
        );

        const parsed = extractJson(llmText) as
          | { extra_findings?: { symbol: string; kind: string; message: string; suggestion: string }[] }
          | null;

        const extras: DriftFinding[] = [];
        for (const f of parsed?.extra_findings ?? []) {
          // grounding pre-check: the symbol must exist in the extracted AST
          const sym = ctx.symbols.find(
            (s: { name: string }) => s.name === f.symbol || s.name.endsWith(`.${f.symbol}`)
          );
          if (!sym) continue; // phantom link — dropped by design
          extras.push({
            id: `llm:${f.kind}:${f.symbol}`,
            kind: f.kind as DriftFinding["kind"],
            severity: "minor",
            symbol: f.symbol,
            message: f.message,
            codeEvidence: { file: sym.file, line: sym.line, snippet: sym.signature },
            docEvidence: null,
            suggestion: f.suggestion,
            verified: false,
            validatorNotes: "suggested by Gemma, pending gate-1 grounding",
          });
        }
        drifts = [...drifts, ...extras];
        engineNote = `${ctx.engine.engine} · +${extras.length} grounded suggestions`;
      } catch (err) {
        captureWorkflowError(err, { step: "synthesize" });
        engineNote = `LLM synthesis failed — deterministic findings kept`;
      }
    }

    const steps = trace(
      ctx,
      "synthesize",
      "Drift synthesis — code vs docs",
      `synthesizer agent (${ctx.engine.engine})`,
      ctx.engine.engine === "heuristic" ? "ok" : "ok",
      engineNote,
      t0
    );
    return { ...ctx, drifts, steps } as Ctx;
  },
});

const gate1 = createStep({
  id: "gate-1",
  inputSchema: ctxSchema,
  outputSchema: ctxSchema,
  execute: async ({ inputData }) => {
    const t0 = Date.now();
    const ctx = inputData;
    // Deterministic Gate 1 (always runs, zero-dep baseline)
    const pre: GateResult = runValidationGates(ctx.input, ctx.drifts, []);

    // Mastra ValidatorAgent augmentation — LLM-powered grounding check
    let agentNote = pre.report.codeGrounding.notes;
    if (ctx.engine.engine !== "heuristic" && ctx.drifts.length > 0) {
      try {
        const verdicts = await runValidatorAgent({
          findings: ctx.drifts,
          symbols: ctx.symbols,
        });
        const verdictList = verdicts.verdicts;
        const dropped = verdictList.filter((v) => !v.ok).length;
        agentNote = `${verdictList.length} findings checked by ValidatorAgent · ${dropped} dropped as ungrounded`;
        // Drop findings the agent explicitly rejected; findings with no verdict
        // are kept — the deterministic gate below already grounded them.
        const verdictById = new Map(verdictList.map((v) => [v.id, v]));
        ctx.drifts = ctx.drifts.filter((d) => verdictById.get(d.id)?.ok !== false);
      } catch (err) {
        captureWorkflowError(err, { step: "gate-1" });
        agentNote = `ValidatorAgent unavailable — deterministic gate kept (${pre.report.codeGrounding.dropped} dropped)`;
      }
    }

    // Merge the deterministic verdicts into the surviving findings. Rule
    // findings always arrive with `verified: false`, and on the LLM path the
    // filter above keeps those flags untouched — without this merge nothing is
    // ever marked grounded, the patcher skips every finding and the PR is empty.
    const preById = new Map(pre.drifts.map((d) => [d.id, d]));
    ctx.drifts = ctx.drifts.map((d) => {
      const g = preById.get(d.id);
      return g
        ? { ...d, verified: g.verified, validatorNotes: g.validatorNotes ?? d.validatorNotes }
        : d;
    });

    const finalDrifts = ctx.engine.engine !== "heuristic" ? ctx.drifts : pre.drifts;
    const steps = trace(
      ctx,
      "gate-1",
      "Gate 1 — code-side grounding",
      "code-side validator (Mastra agent)",
      pre.report.codeGrounding.passed ? "ok" : "degraded",
      `${pre.report.codeGrounding.checked} findings checked · ${agentNote}`,
      t0
    );
    return { ...ctx, drifts: finalDrifts, steps } as Ctx;
  },
});

const patch = createStep({
  id: "patch",
  inputSchema: ctxSchema,
  outputSchema: ctxSchema,
  execute: async ({ inputData }) => {
    const t0 = Date.now();
    const ctx = inputData;
    const detection = detectDrift({
      language: ctx.input.language,
      codeFile: ctx.input.codeFile,
      extraCodeFiles: ctx.input.extraCodeFiles,
      symbols: ctx.symbols,
      docs: ctx.input.docs,
    });
    const edits = buildEdits({
      input: ctx.input,
      drifts: ctx.drifts,
      symbols: ctx.symbols,
      tables: detection.tables,
    });
    const steps = trace(
      ctx,
      "patch",
      "Patch synthesis — concrete doc edits",
      "patch agent",
      edits.length > 0 ? "ok" : "ok",
      `${edits.length} edit(s) drafted across ${new Set(edits.map((e) => e.file)).size} file(s)`,
      t0
    );
    return { ...ctx, edits, steps } as Ctx;
  },
});

const gate2 = createStep({
  id: "gate-2",
  inputSchema: ctxSchema,
  outputSchema: ctxSchema,
  execute: async ({ inputData }) => {
    const t0 = Date.now();
    const ctx = inputData;
    // Deterministic Gate 2 (always runs, zero-dep baseline)
    const gate = runValidationGates(ctx.input, ctx.drifts, ctx.edits);

    // Mastra PatchAgent augmentation — LLM-powered apply check
    let agentNote = gate.report.docsApply.notes;
    if (ctx.engine.engine !== "heuristic" && ctx.edits.length > 0) {
      try {
        // Build doc contents map for the PatchAgent
        const docContents: Record<string, string> = {};
        for (const d of ctx.input.docs) {
          docContents[d.path] = d.content;
        }
        if (ctx.input.envExample) {
          docContents[ctx.input.envExample.path] = ctx.input.envExample.content;
        }

        const patchVerdicts = await runPatchAgent({
          edits: ctx.edits,
          docContents,
        });
        const patchList = patchVerdicts.accepted;
        const rejected = patchList.filter((v) => !v.ok).length;
        agentNote = `${patchList.length} edits checked by PatchAgent · ${rejected} rejected`;
        // Drop edits the agent explicitly rejected; edits with no verdict stay.
        const verdictById = new Map(patchList.map((v) => [v.driftId, v]));
        ctx.edits = ctx.edits.filter((e) => verdictById.get(e.driftId)?.ok !== false);
      } catch (err) {
        captureWorkflowError(err, { step: "gate-2" });
        agentNote = `PatchAgent unavailable — deterministic gate kept (${gate.report.docsApply.failed} rejected)`;
      }
    }

    const steps = trace(
      ctx,
      "gate-2",
      "Gate 2 — docs-side apply check",
      "docs-side validator (Mastra agent)",
      gate.report.docsApply.passed ? "ok" : "degraded",
      `${gate.report.docsApply.applied} edit(s) apply cleanly · ${agentNote}`,
      t0
    );
    return { ...ctx, edits: ctx.edits, gates: gate.report, steps } as Ctx;
  },
});

const tone = createStep({
  id: "tone",
  inputSchema: ctxSchema,
  outputSchema: ctxSchema,
  execute: async ({ inputData }) => {
    const t0 = Date.now();
    const ctx = inputData;
    const draft = renderPatch(ctx.edits, ctx.input, ctx.drifts, ctx.engine.engine);
    let prTitle = draft.prTitle;
    let prBody = draft.prBody;
    let toneEngine = "template";

    if (ctx.engine.engine !== "heuristic" && ctx.drifts.length > 0) {
      try {
        const toned = await runToneAgent({ title: prTitle, body: prBody });
        prTitle = toned.title;
        prBody = toned.body;
        toneEngine = ctx.engine.engine;
      } catch {
        toneEngine = "template (LLM tone pass unavailable)";
      }
    } else {
      const t = applyToneTemplate(prTitle, prBody);
      prTitle = t.title;
      prBody = t.body;
      toneEngine = "template";
    }

    const patchResult = { ...draft, prTitle, prBody };
    const steps = [
      ...ctx.steps,
      {
        id: "tone",
        label: "Tone pass — humanize the PR",
        agent: "tone agent",
        status: "ok" as const,
        ms: Math.max(1, Date.now() - t0),
        notes: `humanized via ${toneEngine}`,
      },
    ];
    return { ...ctx, patch: patchResult, steps } as Ctx;
  },
});

const emit = createStep({
  id: "emit",
  inputSchema: ctxSchema,
  outputSchema: z.object({
    result: z.any(),
  }),
  execute: async ({ inputData }) => {
    const ctx = inputData;
    const gates = (ctx.gates ?? {
      codeGrounding: { passed: true, checked: ctx.drifts.length, dropped: 0, notes: "no findings" },
      docsApply: { passed: true, applied: 0, failed: 0, notes: "no edits" },
      tonePass: { applied: true, engine: "template" },
    }) as AnalyzeResult["validations"];

    const result: AnalyzeResult = {
      ok: true,
      scenarioId: ctx.input.scenarioId,
      symbols: ctx.symbols,
      docTargets: ctx.docTargets,
      drifts: ctx.drifts,
      patch: ctx.patch ?? {
        diff: "",
        filesChanged: [],
        additions: 0,
        deletions: 0,
        prTitle: "docs: no drift detected",
        prBody: "Documentation is in sync with the code.",
        edits: [],
      },
      steps: ctx.steps,
      validations: { ...gates, tonePass: { applied: true, engine: "template" } },
      engine: ctx.engine,
      totalMs: Math.max(1, Date.now() - (ctx.startedAt || Date.now())),
    };
    return { result };
  },
});

/* ── workflow assembly ───────────────────────────────────────────────────── */

export const docDriftWorkflow = createWorkflow({
  id: "doc-drift-sync",
  inputSchema: intakeSchema,
  outputSchema: z.object({ result: z.any() }),
})
  .then(intake)
  .then(extract)
  .then(docs)
  .then(synthesize)
  .then(gate1)
  .then(patch)
  .then(gate2)
  .then(tone)
  .then(emit)
  .commit();

export async function runDocDriftWorkflow(
  input: AnalyzeInput,
  engine: EngineInfo
): Promise<AnalyzeResult> {
  const createRun =
    typeof (docDriftWorkflow as unknown as Record<string, unknown>).createRun === "function"
      ? (docDriftWorkflow as unknown as { createRun: () => Promise<{ start: (o: object) => Promise<{ result: unknown } | { status: string; result?: unknown }> }> }).createRun.bind(docDriftWorkflow)
      : (docDriftWorkflow as unknown as { createRunAsync: () => Promise<{ start: (o: object) => Promise<unknown> }> }).createRunAsync.bind(docDriftWorkflow);

  const run = await createRun();
  const out = (await run.start({
    inputData: { input, engine },
  })) as { result?: unknown; status?: string };

  const payload = (out as { result?: { result?: unknown } }).result ?? out;
  const result =
    (payload as { result?: AnalyzeResult }).result ??
    (payload as unknown as AnalyzeResult);

  if (!result || !("drifts" in (result as object))) {
    throw new Error(`workflow returned an unexpected shape: ${JSON.stringify(out).slice(0, 300)}`);
  }
  return result as AnalyzeResult;
}
