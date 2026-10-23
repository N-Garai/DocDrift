import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown, parseEnvExample, rowDefault } from "../../src/backend/src/core/docs/markdown.js";
import { foldName, similarity, matchSymbolsToDocs } from "../../src/backend/src/core/match/matcher.js";

const MD = `# Setup

| Option | Default | Description |
| ------ | ------- | ----------- |
| PORT | 3000 | HTTP port |
| LOG_LEVEL | debug | Verbosity |

Mention \`createConfig()\` here.
`;

test("markdown parser extracts tables, rows and code spans", () => {
  const { targets, tables } = parseMarkdown({ path: "docs/setup.md", content: MD });
  assert.equal(tables.length, 1);
  assert.equal(tables[0].rows.length, 2);
  assert.ok(targets.some((t) => t.kind === "table-row" && t.symbolHint === "PORT"));
  assert.ok(
    targets.some((t) => t.kind === "code-span" && t.symbolHint === "createConfig()"),
    "code spans with call syntax captured"
  );
});

test("rowDefault reads defaults case-insensitively", () => {
  assert.equal(rowDefault(["PORT", "3000", "desc"]), "3000");
  assert.equal(rowDefault(["telemetry", "True", "desc"]), "True");
  assert.equal(rowDefault(["cache", "/tmp/cache", "desc"]), "/tmp/cache");
  assert.equal(rowDefault(["flag", "not supported yet", "desc"]), null);
});

test("env example parser keys lines", () => {
  const { entries, targets } = parseEnvExample({
    path: ".env.example",
    content: "# comment\nPORT=3000\nLOG_LEVEL=debug\n",
  });
  assert.equal(entries.get("PORT")?.value, "3000");
  assert.equal(entries.get("LOG_LEVEL")?.line, 3);
  assert.equal(targets.length, 2);
});

test("foldName is separator and case insensitive", () => {
  assert.equal(foldName("DEFAULT_PORT"), foldName("defaultPort"));
  assert.equal(foldName("createConfig()"), "createconfig");
  assert.equal(foldName("Doc-Drift.Config"), "docdriftconfig");
});

test("similarity detects renames above threshold", () => {
  assert.ok(similarity("registerRoutes", "registerDocumentRoutes") >= 0.6);
  assert.ok(similarity("loadConfig", "completelyDifferent") < 0.6);
});

test("matcher aligns symbols to targets and records rename hints", () => {
  const symbols = [
    { name: "registerDocumentRoutes", kind: "function" as const, line: 3, signature: "fn", file: "routes.ts" },
    { name: "DocDriftConfig.port", kind: "field" as const, line: 6, signature: "port: number", file: "config.ts" },
  ];
  const targets = [
    { file: "README.md", kind: "code-span" as const, line: 5, text: "`registerRoutes`", symbolHint: "registerRoutes" },
    { file: "docs/setup.md", kind: "table-row" as const, line: 9, text: "| PORT | 3000 | x |", symbolHint: "PORT" },
  ];
  const m = matchSymbolsToDocs(symbols, targets);
  assert.ok(m.renameHints.has("registerDocumentRoutes"));
  assert.ok([...m.bySymbol.keys()].includes("DocDriftConfig.port"), "field matched via base name");
});
