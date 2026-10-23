import { Router } from "express";
import { providerStatus } from "../core/llm/provider.js";
import { parserFailureCount, getParserFailures } from "../core/observability.js";
import { githubOAuthConfigured } from "../core/config.js";

export const healthRouter = Router();

const BOOTED_AT = Date.now();

healthRouter.get("/api/health", async (_req, res) => {
  const providers = await providerStatus();
  const engine = providers.ollama
    ? "gemma-ollama"
    : providers.gemini
      ? "gemma-gemini"
      : "heuristic";

  res.json({
    ok: true,
    service: "docdrift-engine",
    version: "1.1.0",
    parser: "tree-sitter|heuristic (resolved per run)",
    engine,
    providers,
    githubOAuth: githubOAuthConfigured(),
    parserFailures: parserFailureCount(),
    recentFailures: getParserFailures().slice(0, 5),
    uptimeSec: Math.round((Date.now() - BOOTED_AT) / 1000),
  });
});
