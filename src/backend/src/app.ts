/**
 * DocDrift engine — Express app factory.
 * (The listening entrypoint lives in index.ts; kept separate for tests.)
 */
import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeRouter, scenariosRouter } from "./routes/analyze.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { githubRouter } from "./routes/github.js";
import { webhookRouter } from "./routes/webhook.js";
import { requireSession } from "./routes/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FRONTEND_OUT = process.env.FRONTEND_OUT
  ? path.resolve(process.env.FRONTEND_OUT)
  : path.resolve(__dirname, "../../../frontend/out");

export const app = express();

// OAuth callbacks + keep-warm self-pings need correct proto/host resolution
// behind the Render / gateway reverse proxies.
app.set("trust proxy", 1);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? true,
    methods: ["GET", "POST"],
  })
);
app.use(express.json({ limit: "512kb" }));

// Public (no session): health, scenarios, demo analyze, OAuth entrypoints.
app.use(healthRouter);
app.use(authRouter);
app.use(analyzeRouter);
app.use(scenariosRouter);

// GitHub webhook: called by GitHub servers, no browser cookie — signature-verified instead.
app.use(webhookRouter);

// Everything below requires a signed-in session. This guarantees no
// unauthenticated visitor can reach Studio/GitHub/user-data routes, and no
// user can touch another user's tokens or repos (sessions are keyed per user).
app.use(requireSession);

app.use(githubRouter);

// production: serve the exported frontend + SPA fallback
if (existsSync(FRONTEND_OUT)) {
  app.use(express.static(FRONTEND_OUT));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(FRONTEND_OUT, "index.html"));
  });
  console.log(`[docdrift] serving frontend from ${FRONTEND_OUT}`);
}

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(`[docdrift] unhandled: ${err.message}`);
    res.status(500).json({ ok: false, error: "internal engine error" });
  }
);

export const frontendOut = FRONTEND_OUT;
export const frontendExists = existsSync(FRONTEND_OUT);
