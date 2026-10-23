import { test } from "node:test";
import assert from "node:assert/strict";
import { extractWithHeuristics } from "../../src/backend/src/core/extract/heuristic.js";
import { extractSymbols } from "../../src/backend/src/core/extract/index.js";
import { matchEnvReads } from "../../src/backend/src/core/extract/heuristic.js";

test("heuristic extractor finds TS exports with defaults", () => {
  const code = `export const DEFAULT_PORT = 8080;
export interface Config {
  port: number;
  enableCache: boolean;
}
export const defaults: Config = {
  port: DEFAULT_PORT,
  enableCache: true,
};
export function loadConfig(env = process.env): Config {
  return { port: Number(env.PORT ?? DEFAULT_PORT) };
}
export class Service {}
`;
  const symbols = extractWithHeuristics(
    { path: "config.ts", content: code },
    "typescript"
  );
  const names = symbols.map((s) => s.name);

  assert.ok(names.includes("DEFAULT_PORT"));
  assert.ok(names.includes("Config"));
  assert.ok(names.includes("Config.port"));
  assert.ok(names.includes("defaults.port"), "object-literal members captured");
  // identifier defaults stay raw here — rules.resolveDefault links them to consts
  assert.equal(
    symbols.find((s) => s.name === "defaults.port")?.defaultValue,
    "DEFAULT_PORT"
  );
  assert.ok(names.includes("loadConfig"));
  assert.ok(names.includes("Service"));
  assert.ok(names.includes("PORT"), "env reads become env-key symbols");
});

test("heuristic extractor parses python pydantic fields", () => {
  const code = `from pydantic_settings import BaseSettings

DEFAULT_PORT = 8080

class Settings(BaseSettings):
    port: int = DEFAULT_PORT
    cache_dir: str = "/var/cache/docdrift"
    enable_telemetry: bool = False

def load_settings(env_file: str = ".env") -> Settings:
    return Settings(_env_file=env_file)
`;
  const symbols = extractWithHeuristics(
    { path: "settings.py", content: code },
    "python"
  );
  assert.ok(symbols.some((s) => s.name === "Settings.port" && s.defaultValue === "DEFAULT_PORT"));
  assert.ok(symbols.some((s) => s.name === "Settings.enable_telemetry" && s.defaultValue === "False"));
  assert.ok(symbols.some((s) => s.name === "DEFAULT_PORT" && s.defaultValue === "8080"));
  assert.ok(symbols.some((s) => s.name === "load_settings"));
});

test("env read detection covers dot, bracket and call styles", () => {
  assert.deepEqual(matchEnvReads("const a = env.PORT;"), ["PORT"]);
  assert.deepEqual(matchEnvReads("const b = env['ENABLE_CACHE'];"), ["ENABLE_CACHE"]);
  assert.deepEqual(matchEnvReads("const c = os.environ.get('LOG_LEVEL')"), ["LOG_LEVEL"]);
  assert.deepEqual(matchEnvReads("const d = os.getenv('TIMEOUT')"), ["TIMEOUT"]);
  assert.deepEqual(matchEnvReads("const e = env.SMALL;"), ["SMALL"]);
  assert.deepEqual(matchEnvReads("const f = rawEnv.SMALL;"), [], "bare identifiers are not env reads");
});

test("extract dispatcher falls back gracefully and reports the parser", async () => {
  const res = await extractSymbols(
    [{ path: "x.ts", content: "export const a = 1;\n" }],
    "typescript"
  );
  assert.ok(["tree-sitter", "heuristic"].includes(res.parser));
  assert.ok(res.symbols.length >= 1);
});
