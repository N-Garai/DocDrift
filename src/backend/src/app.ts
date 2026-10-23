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

// GitHub webhook: called by GitHub servers, no browser cookie — signature-verified instead.
app.use(webhookRouter);

// production: serve the exported frontend + static assets (no session needed).
if (existsSync(FRONTEND_OUT)) {
  app.use(express.static(FRONTEND_OUT));
  // Catch-all: try the route-specific HTML first (Next.js export generates
  // out/signin.html for /signin), then fall back to index.html so client-side
  // Next.js routing can render the correct page for any URL.
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    const target = path.join(FRONTEND_OUT, _req.path.replace(/\/$/, "") + ".html");
    if (existsSync(target)) {
      res.sendFile(target);
      return;
    }
    res.sendFile(path.join(FRONTEND_OUT, "index.html"));
  });
  console.log(`[docdrift] serving frontend from ${FRONTEND_OUT}`);
}

// Everything below requires a signed-in session (Studio/GitHub/user-data API routes).
app.use(requireSession);

app.use(githubRouter);

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
