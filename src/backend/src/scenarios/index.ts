/**
 * Demo scenarios — realistic fixtures where the code has drifted from the
 * docs. Also serves as the engine's integration test corpus.
 */
import type { AnalyzeInput, SourceFile } from "../core/types.js";

export interface Scenario {
  id: string;
  title: string;
  language: "typescript" | "python";
  tagline: string;
  description: string;
  toInput: () => AnalyzeInput;
  files: () => { path: string; label: string; content: string; stale: boolean }[];
}

const file = (path: string, content: string): SourceFile => ({ path, content });

/* ── 1. TypeScript config drift ─────────────────────────────────────────── */

const TS_CONFIG_CODE = `// config.ts — committed 2 days ago, docs never touched
export const DEFAULT_PORT = 8080;

export interface DocDriftConfig {
  port: number;
  enableCache: boolean;
  cacheTtlSeconds: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

export const defaultConfig: DocDriftConfig = {
  port: DEFAULT_PORT,
  enableCache: true,
  cacheTtlSeconds: 300,
  logLevel: "info",
};

export function createConfig(overrides: Partial<DocDriftConfig> = {}): DocDriftConfig {
  return { ...defaultConfig, ...overrides };
}

export function resolveEnv(env = process.env): DocDriftConfig {
  return createConfig({
    port: Number(env.PORT ?? DEFAULT_PORT),
    enableCache: env.ENABLE_CACHE === "true",
    logLevel: (env.LOG_LEVEL as DocDriftConfig["logLevel"]) ?? "info",
  });
}
`;

const TS_CONFIG_DOCS = `# Setup guide

> Last updated when the default port was still 3000. We are sorry in advance.

## Installation

\`\`\`bash
npm install @acme/docdrift-config
\`\`\`

The default port lives in \`DEFAULT_PORT\`. Configuration is handled by \`DocDriftConfig\` — \`defaultConfig\` holds the defaults and \`createConfig()\` merges your overrides.

## Configuration

| Option | Default | Description |
| ------ | ------- | ----------- |
| PORT | 3000 | HTTP server port |
| ENABLE_CACHE | not supported yet | Cache responses in memory |
| LOG_LEVEL | debug | Verbosity of the logger |
`;

const TS_CONFIG_ENV = `# .env.example — copy to .env
PORT=3000
LOG_LEVEL=debug
`;

/* ── 2. API endpoint rename ─────────────────────────────────────────────── */

const API_CODE = `// routes.ts — v2 migration, README not invited
export const API_VERSION = "v2";

export type App = {
  post: (path: string, handler: () => void) => void;
  get: (path: string, handler: () => void) => void;
};

export function registerDocumentRoutes(app: App): void {
  app.post("/api/v2/documents/:id/sign", () => {
    // sign a document
  });
  app.get("/api/v2/documents/:id", () => {
    // fetch a document
  });
}

export class DocumentService {
  async listDocuments(status = "draft") {
    return [];
  }
}
`;

const API_DOCS = `# Acme Documents API

Base client: \`DocumentService\`. The router is mounted by \`registerRoutes\`.

## API Reference

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | /api/v1/docs/:id/sign | Sign a document |
| GET | /api/v1/docs/:id | Fetch a single document |

All endpoints require the legacy session cookie.
`;

/* ── 3. Python Pydantic schema ──────────────────────────────────────────── */

const PY_CODE = `# settings.py — the ops team changed things. again.
from pydantic_settings import BaseSettings

DEFAULT_PORT = 8080


class Settings(BaseSettings):
    port: int = DEFAULT_PORT
    cache_dir: str = "/var/cache/docdrift"
    enable_telemetry: bool = False
    worker_timeout: int = 60


def load_settings(env_file: str = ".env") -> Settings:
    """Build Settings from an env file."""
    return Settings(_env_file=env_file)
`;

const PY_DOCS = `# Configuration reference

The port default lives in \`DEFAULT_PORT\`. Everything is validated by \`Settings\`; load it with \`load_settings()\`.

| Setting | Default | Description |
| ------- | ------- | ----------- |
| port | 3000 | HTTP server port |
| cache_dir | /tmp/cache | Where cached artifacts are stored |
| enable_telemetry | True | Anonymous usage reporting |
`;

/* ── registry ───────────────────────────────────────────────────────────── */

export const scenarios: Scenario[] = [
  {
    id: "ts-config-drift",
    title: "Config keys drifted",
    language: "typescript",
    tagline: "PORT 3000 → 8080, a new cache flag, a stale log level",
    description:
      "The classic: defaults changed and ENABLE_CACHE shipped, but .env.example and the setup guide still describe last quarter's behavior.",
    toInput: () => ({
      scenarioId: "ts-config-drift",
      language: "typescript",
      codeFile: file("config.ts", TS_CONFIG_CODE),
      docs: [file("docs/setup.md", TS_CONFIG_DOCS), file(".env.example", TS_CONFIG_ENV)],
    }),
    files: () => [
      { path: "config.ts", label: "changed code", content: TS_CONFIG_CODE, stale: false },
      { path: "docs/setup.md", label: "stale docs", content: TS_CONFIG_DOCS, stale: true },
      { path: ".env.example", label: "stale docs", content: TS_CONFIG_ENV, stale: true },
    ],
  },
  {
    id: "api-endpoint-rename",
    title: "API endpoints renamed",
    language: "typescript",
    tagline: "/api/v1/docs → /api/v2/documents, plus a renamed router fn",
    description:
      "A v2 migration moved and renamed every route. The README still walks new users into 404s.",
    toInput: () => ({
      scenarioId: "api-endpoint-rename",
      language: "typescript",
      codeFile: file("routes.ts", API_CODE),
      docs: [file("README.md", API_DOCS)],
    }),
    files: () => [
      { path: "routes.ts", label: "changed code", content: API_CODE, stale: false },
      { path: "README.md", label: "stale docs", content: API_DOCS, stale: true },
    ],
  },
  {
    id: "pydantic-schema",
    title: "Pydantic schema drifted",
    language: "python",
    tagline: "Pydantic Settings vs the configuration reference table",
    description:
      "Python projects rot the same way: the Settings schema moved to /var/cache, telemetry flipped off, and a new timeout field appeared.",
    toInput: () => ({
      scenarioId: "pydantic-schema",
      language: "python",
      codeFile: file("settings.py", PY_CODE),
      docs: [file("docs/configuration.md", PY_DOCS)],
    }),
    files: () => [
      { path: "settings.py", label: "changed code", content: PY_CODE, stale: false },
      { path: "docs/configuration.md", label: "stale docs", content: PY_DOCS, stale: true },
    ],
  },
];

export function getScenario(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id);
}
