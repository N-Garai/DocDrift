/**
 * DocDrift — Mastra agents.
 *
 * Four specialized agents, each with a single responsibility, matching the
 * workflow steps:
 *
 *   1. ExtractionAgent   — tree-sitter + heuristic symbol extraction
 *   2. ValidatorAgent    — Gate 1: code-side grounding (drops ungrounded findings)
 *   3. PatchAgent        — Gate 2: docs-side apply check (rejects broken edits)
 *   4. ToneAgent         — humanizes PR title and body
 *
 * Each agent is a proper Mastra `Agent` with a role-specific system prompt,
 * structured Zod output schema, and delegated LLM calls through the Gemma
 * provider chain (Ollama → free Gemini → deterministic fallback).
 *
 * The agents degrade gracefully: when no LLM provider is configured, they
 * fall back to deterministic rules so the pipeline never hard-fails.
 */
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { ollamaGenerate } from "../llm/ollama.js";
import { geminiGenerate } from "../llm/gemini.js";
import { extractJson, SYNTH_SYSTEM, TONE_SYSTEM, synthPrompt, tonePrompt } from "../llm/prompts.js";
import type { CodeSymbol, DriftFinding, DocEdit } from "../types.js";

/* ── system prompt strings (Mastra Agent has no runtime .instructions property) ── */

const EXTRACTION_SYSTEM = `You are the Extraction Agent inside DocDrift. Your job is to read source code
(TypeScript, JavaScript, Python) and extract the public surface: exported functions,
classes, interfaces, type aliases, constants, fields, routes, and env keys.
Return only what is actually present in the code — do not infer or hallucinate symbols.
Every symbol must carry its file path and line number for evidence.`;

const VALIDATOR_SYSTEM = `You are the Code-Side Validator Agent inside DocDrift. Gate 1.
You receive a list of drift findings and the code symbols extracted from the AST.
For each finding, decide if the code side truly supports it. Mark a finding as not ok
if it references a symbol not present in the symbols list, or if the evidence does not
match. Be strict: phantom links and naming-based assumptions are dropped.`;

const PATCH_SYSTEM = `You are the Docs-Side Validator Agent inside DocDrift. Gate 2.
You receive proposed documentation edits (old text → new text at a line number)
and the current document content. Decide if each edit applies cleanly without
breaking markdown tables, corrupting structure, or creating invalid markdown.
Reject edits that cannot be applied cleanly.`;

const TONE_SYSTEM_LOCAL = `You are the Tone Agent inside DocDrift. You rewrite pull-request titles and bodies
so they read like a concise, friendly senior engineer wrote them. Rules: plain verbs, no
exclamation marks, no emojis, no LLM-isms ("delve", "seamless", "supercharge"). Keep all
factual details, file names and numbers exactly. Respond with STRICT JSON only.`;

async function callGemma(
  system: string,
  prompt: string,
  timeoutMs = 20_000
): Promise<string> {
  // Try Ollama first (local, fully free), then Gemini (free tier), then nothing.
  try {
    const result = await ollamaGenerate(system, prompt, { timeoutMs });
    return result.text;
  } catch {
    try {
      const result = await geminiGenerate(system, prompt, { timeoutMs });
      return result.text;
    } catch {
      return ""; // deterministic fallback handles it
    }
  }
}

/* ── 1. ExtractionAgent ───────────────────────────────────────────────────── */

export const extractionAgent = new Agent({
  id: "docdrift-extraction-agent",
  name: "DocDrift Extraction Agent",
  description: "Extracts public symbols from source files using tree-sitter AST with heuristic fallback.",
  instructions: `You are the Extraction Agent inside DocDrift. Your job is to read source code
(TypeScript, JavaScript, Python) and extract the public surface: exported functions,
classes, interfaces, type aliases, constants, fields, routes, and env keys.
Return only what is actually present in the code — do not infer or hallucinate symbols.
Every symbol must carry its file path and line number for evidence.`,
  model: "gemma",
  tools: {},
});

export interface ExtractionInput {
  filePath: string;
  content: string;
  language: "typescript" | "python";
}

export interface ExtractionOutput {
  symbols: Array<{
    name: string;
    kind: string;
    line: number;
    signature: string;
    defaultValue?: string;
    route?: { method: string; path: string };
  }>;
  parser: "tree-sitter" | "heuristic";
}

const extractionOutputSchema = z.object({
  symbols: z.array(
    z.object({
      name: z.string(),
      kind: z.string(),
      line: z.number(),
      signature: z.string(),
      defaultValue: z.string().optional(),
      route: z.object({ method: z.string(), path: z.string() }).optional(),
    })
  ),
  parser: z.enum(["tree-sitter", "heuristic"]),
});

export async function runExtractionAgent(input: ExtractionInput): Promise<ExtractionOutput> {
  const payload = JSON.stringify({
    filePath: input.filePath,
    language: input.language,
    content: input.content.slice(0, 12_000),
  });

  const text = await callGemma(
    EXTRACTION_SYSTEM,
    `Extract the public symbols from this code file and return the JSON object:\n${payload}`
  );

  const parsed = extractJson(text);
  if (parsed?.symbols) {
    return extractionOutputSchema.parse(parsed);
  }

  // Deterministic fallback: use the real extractor
  const { extractSymbols } = await import("../extract/index.js");
  const result = await extractSymbols(
    [{ path: input.filePath, content: input.content }],
    input.language
  );
  return {
    symbols: result.symbols.map((s) => ({
      name: s.name,
      kind: s.kind,
      line: s.line,
      signature: s.signature,
      defaultValue: s.defaultValue,
      route: s.route,
    })),
    parser: result.parser,
  };
}

/* ── 2. ValidatorAgent (Gate 1) ───────────────────────────────────────────── */

export const validatorAgent = new Agent({
  id: "docdrift-validator-agent",
  name: "DocDrift Validator Agent",
  description: "Gate 1 — validates drift findings against AST code evidence, drops ungrounded claims.",
  instructions: `You are the Code-Side Validator Agent inside DocDrift. Gate 1.
You receive a list of drift findings and the code symbols extracted from the AST.
For each finding, decide if the code side truly supports it. Mark a finding as not ok
if it references a symbol not present in the symbols list, or if the evidence does not
match. Be strict: phantom links and naming-based assumptions are dropped.`,
  model: "gemma",
  tools: {},
});

export interface ValidationInput {
  findings: DriftFinding[];
  symbols: CodeSymbol[];
}

export interface ValidationOutput {
  verdicts: Array<{ id: string; ok: boolean; note: string }>;
}

const validationOutputSchema = z.object({
  verdicts: z.array(
    z.object({
      id: z.string(),
      ok: z.boolean(),
      note: z.string(),
    })
  ),
});

export async function runValidatorAgent(input: ValidationInput): Promise<ValidationOutput> {
  const payload = JSON.stringify({
    findings: input.findings.map((f) => ({ id: f.id, symbol: f.symbol, kind: f.kind, message: f.message })),
    symbols: input.symbols.map((s) => ({ name: s.name, kind: s.kind, line: s.line })),
  });

  const text = await callGemma(
    VALIDATOR_SYSTEM,
    `Validate these drift findings against the code symbols. Return the verdicts JSON:\n${payload}`
  );

  const parsed = extractJson(text);
  if (parsed?.verdicts) {
    return validationOutputSchema.parse(parsed);
  }

  // Deterministic fallback: symbol must exist in AST
  return {
    verdicts: input.findings.map((f) => {
      const exists = input.symbols.some(
        (s) => s.name === f.symbol || s.name.endsWith(`.${f.symbol}`)
      );
      return { id: f.id, ok: exists, note: exists ? "grounded in AST" : "symbol not found in AST" };
    }),
  };
}

/* ── 3. PatchAgent (Gate 2) ───────────────────────────────────────────────── */

export const patchAgent = new Agent({
  id: "docdrift-patch-agent",
  name: "DocDrift Patch Agent",
  description: "Gate 2 — validates doc edits for clean applicability; rejects edits that break markdown.",
  instructions: `You are the Docs-Side Validator Agent inside DocDrift. Gate 2.
You receive proposed documentation edits (old text → new text at a line number)
and the current document content. Decide if each edit applies cleanly without
breaking markdown tables, corrupting structure, or creating invalid markdown.
Reject edits that cannot be applied cleanly.`,
  model: "gemma",
  tools: {},
});

export interface PatchValidationInput {
  edits: DocEdit[];
  docContents: Record<string, string>;
}

export interface PatchValidationOutput {
  accepted: Array<{ driftId: string; ok: boolean; note: string }>;
}

const patchValidationOutputSchema = z.object({
  accepted: z.array(
    z.object({
      driftId: z.string(),
      ok: z.boolean(),
      note: z.string(),
    })
  ),
});

export async function runPatchAgent(input: PatchValidationInput): Promise<PatchValidationOutput> {
  const payload = JSON.stringify({
    edits: input.edits.map((e) => ({
      driftId: e.driftId,
      file: e.file,
      line: e.line,
      oldText: e.oldText,
      newText: e.newText,
    })),
    docContents: input.docContents,
  });

  const text = await callGemma(
    PATCH_SYSTEM,
    `Validate these doc edits against the document contents. Return the accepted JSON:\n${payload}`
  );

  const parsed = extractJson(text);
  if (parsed?.accepted) {
    return patchValidationOutputSchema.parse(parsed);
  }

  // Deterministic fallback: accept edits whose oldText exists at the given line
  return {
    accepted: input.edits.map((e) => {
      const lines = (input.docContents[e.file] ?? "").split("\n");
      const idx = e.line - 1;
      const ok = idx >= 0 && idx < lines.length && lines[idx].includes(e.oldText);
      return { driftId: e.driftId, ok, note: ok ? "applies cleanly" : "oldText not found at line" };
    }),
  };
}

/* ── 4. ToneAgent ─────────────────────────────────────────────────────────── */

export const toneAgent = new Agent({
  id: "docdrift-tone-agent",
  name: "DocDrift Tone Agent",
  description: "Rewrites pull request title and body to read like a senior engineer wrote them.",
  instructions: `You are the Tone Agent inside DocDrift. You rewrite pull-request titles and bodies
so they read like a concise, friendly senior engineer wrote them. Rules: plain verbs, no
exclamation marks, no emojis, no LLM-isms ("delve", "seamless", "supercharge"). Keep all
factual details, file names and numbers exactly. Respond with STRICT JSON only.`,
  model: "gemma",
  tools: {},
});

export interface ToneInput {
  title: string;
  body: string;
}

export interface ToneOutput {
  title: string;
  body: string;
}

const toneOutputSchema = z.object({
  title: z.string(),
  body: z.string(),
});

export async function runToneAgent(input: ToneInput): Promise<ToneOutput> {
  const text = await callGemma(
    TONE_SYSTEM_LOCAL,
    tonePrompt(input.title, input.body)
  );

  const parsed = extractJson(text);
  if (parsed?.title && parsed?.body) {
    return toneOutputSchema.parse(parsed);
  }

  // Deterministic fallback: return as-is
  return { title: input.title, body: input.body };
}

/* ── agent registry ───────────────────────────────────────────────────────── */

export const docDriftAgents = {
  extraction: extractionAgent,
  validation: validatorAgent,
  patch: patchAgent,
  tone: toneAgent,
};
