import { Router } from "express";
import { analyzeRequestSchema, type AnalyzeInput, type EngineInfo } from "../core/types.js";
import { resolveEngine } from "../core/llm/provider.js";
import { runDocDriftWorkflow } from "../core/agents/workflow.js";
import { getScenario, scenarios } from "../scenarios/index.js";
import { recordParserFailure } from "../core/observability.js";

export const analyzeRouter = Router();

analyzeRouter.post("/api/analyze", async (req, res) => {
  const parsed = analyzeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "invalid request",
      details: parsed.error.issues.slice(0, 6).map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }

  const body = parsed.data;
  let input: AnalyzeInput;

  if (body.mode === "scenario") {
    const scenario = getScenario(body.scenarioId);
    if (!scenario) {
      return res.status(404).json({ ok: false, error: `unknown scenario '${body.scenarioId}'` });
    }
    input = scenario.toInput();
  } else {
    input = {
      scenarioId: null,
      language: body.language,
      codeFile: body.custom.codeFile,
      docs: body.custom.docs,
      envExample: body.custom.envExample,
    };
  }

  try {
    const resolved = await resolveEngine();
    const engine: EngineInfo = {
      engine: resolved.engine,
      parser: "tree-sitter", // provisional; the extract step corrects this
      reason: resolved.reason,
    };
    const result = await runDocDriftWorkflow(input, engine);
    return res.json(result);
  } catch (err) {
    recordParserFailure(
      input.codeFile.path,
      `pipeline failure: ${err instanceof Error ? err.message : "unknown"}`
    );
    return res.status(500).json({
      ok: false,
      error: "the doc-drift workflow failed",
      detail: err instanceof Error ? err.message : "unknown error",
    });
  }
});

export const scenariosRouter = Router();

scenariosRouter.get("/api/scenarios", (_req, res) => {
  res.json(
    scenarios.map((s) => ({
      id: s.id,
      title: s.title,
      language: s.language,
      tagline: s.tagline,
      description: s.description,
      files: s.files(),
    }))
  );
});
