/**
 * DocDrift engine — listening entrypoint.
 *
 * - Dev / sandbox: API-only server on port 3001 (the Next.js dev server
 *   proxies to it through the platform gateway).
 * - Production (Docker / Render): also serves the exported Next.js frontend
 *   from FRONTEND_OUT so the whole app runs behind this single process.
 * - Production + APP_BASE_URL/RENDER_EXTERNAL_URL: keep-warm self-ping keeps
 *   free tiers awake (see keepwarm.ts).
 */
import { app, frontendExists, frontendOut } from "./app.js";
import { startKeepWarm } from "./keepwarm.js";
import { initSentry } from "./core/sentry.js";
import { config } from "./core/config.js";

initSentry(config.sentryDsn);

const PORT = Number(process.env.PORT ?? process.env.BACKEND_PORT ?? 3001);

app.listen(PORT, () => {
  console.log(
    `[docdrift] engine listening on :${PORT} (${frontendExists ? `api+static from ${frontendOut}` : "api only"})`
  );
  startKeepWarm();
});
