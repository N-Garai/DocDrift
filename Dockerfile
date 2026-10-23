# ─────────────────────────────────────────────────────────────────────────────
# DocDrift — single-container production build.
#
#   build:  docker build -t docdrift .
#   run:    docker run -p 3000:3000 docdrift
#
# The Express engine (src/backend) serves BOTH the API and the statically
# exported Next.js frontend (src/frontend → out/) from one process/port —
# "the backend serves the frontend", no reverse proxy required.
#
# AI providers (all free, configured at runtime, none required):
#   - Ollama (local Gemma)      → point OLLAMA_URL at a reachable Ollama
#   - Gemini API free tier      → pass GEMINI_API_KEY (key from AI Studio)
#   - none                      → deterministic engine, fully offline
# ─────────────────────────────────────────────────────────────────────────────

# ── 1 · install every workspace dependency ──────────────────────────────────
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY src/frontend/package.json src/frontend/
COPY src/backend/package.json src/backend/
RUN bun install --frozen-lockfile

# ── 2 · build the frontend as a static export ───────────────────────────────
FROM deps AS frontend-build
COPY src/frontend src/frontend
WORKDIR /app/src/frontend
ENV NEXT_OUTPUT=export \
    NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ── 3 · compile the backend (TypeScript → dist/) ────────────────────────────
FROM deps AS backend-build
COPY src/backend src/backend
WORKDIR /app/src/backend
RUN bun run build

# ── 4 · production dependencies for the backend only ────────────────────────
FROM oven/bun:1 AS backend-prod-deps
WORKDIR /be
COPY src/backend/package.json ./
RUN bun install --production

# ── 5 · slim runtime: one Node process serves api + frontend ────────────────
FROM node:22-slim AS runtime
WORKDIR /opt/docdrift
ENV NODE_ENV=production \
    PORT=3000 \
    FRONTEND_OUT=/opt/docdrift/out \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=backend-build /app/src/backend/dist ./dist
COPY --from=backend-prod-deps /be/node_modules ./node_modules
COPY --from=frontend-build /app/src/frontend/out ./out

EXPOSE 3000
CMD ["node", "dist/index.js"]
