import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { app } from "../../src/backend/src/app.js";

let server: Server;
let base = "";

beforeEach(() => {
  if (!server) {
    server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") base = `http://127.0.0.1:${addr.port}`;
    });
  }
});

after(() => {
  server?.close();
});

async function untilReady(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    if (base) {
      try {
        const r = await fetch(`${base}/api/health`);
        if (r.ok) return base;
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  throw new Error("test server never became ready");
}

test("GET /api/health reports engine + providers", async () => {
  const b = await untilReady();
  const res = await fetch(`${b}/api/health`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.ok, true);
  assert.equal(body.service, "docdrift-engine");
  assert.ok(typeof (body.providers as object) === "object");
});

test("GET /api/scenarios lists three fixtures with files", async () => {
  const b = await untilReady();
  const res = await fetch(`${b}/api/scenarios`);
  const list = (await res.json()) as { id: string; files: unknown[] }[];
  assert.equal(list.length, 3);
  for (const s of list) assert.ok(s.files.length >= 2);
});

test("POST /api/analyze runs the full workflow on a scenario", async () => {
  const b = await untilReady();
  const res = await fetch(`${b}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "scenario", scenarioId: "ts-config-drift" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    ok: boolean;
    drifts: { id: string }[];
    steps: { id: string }[];
    patch: { diff: string };
    engine: { engine: string };
  };
  assert.equal(body.ok, true);
  assert.ok(body.drifts.length > 0);
  assert.ok(body.steps.map((s) => s.id).includes("gate-1"));
  assert.ok(body.steps.map((s) => s.id).includes("gate-2"));
  assert.ok(body.patch.diff.includes("+++ b/"));
  assert.ok(["heuristic", "gemma-ollama", "gemma-gemini"].includes(body.engine.engine));
}, 60_000);

test("POST /api/analyze rejects invalid bodies", async () => {
  const b = await untilReady();
  const res = await fetch(`${b}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "nope" }),
  });
  assert.equal(res.status, 400);
});

test("POST /api/analyze 404s unknown scenarios", async () => {
  const b = await untilReady();
  const res = await fetch(`${b}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "scenario", scenarioId: "does-not-exist" }),
  });
  assert.equal(res.status, 404);
});
