/**
 * Provider resolution chain.
 *
 *   1. Ollama (localhost)     → gemma open weights, fully offline
 *   2. Gemini API (free tier) → hosted gemma open model, key from AI Studio
 *   3. Deterministic engine   → always available, zero network
 *
 * The chain is evaluated per request (with a small TTL cache) so users can
 * start/stop Ollama without restarting DocDrift.
 */
import { ollamaHealthy } from "./ollama.js";
import { geminiConfigured } from "./gemini.js";

export type EngineId = "gemma-ollama" | "gemma-gemini" | "heuristic";

export interface ResolvedEngine {
  engine: EngineId;
  reason: string;
}

let cache: { at: number; value: ResolvedEngine } | null = null;
const TTL_MS = 15_000;

export async function resolveEngine(): Promise<ResolvedEngine> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  let resolved: ResolvedEngine;
  if (await ollamaHealthy()) {
    resolved = {
      engine: "gemma-ollama",
      reason: `local Ollama reachable at ${process.env.OLLAMA_URL ?? "http://localhost:11434"} — running open-weight Gemma`,
    };
  } else if (geminiConfigured()) {
    resolved = {
      engine: "gemma-gemini",
      reason: `GEMINI_API_KEY present — using hosted Gemma (${process.env.GEMINI_MODEL ?? "gemma-4-31b-it"}) on the free tier`,
    };
  } else {
    resolved = {
      engine: "heuristic",
      reason: "no LLM provider configured — deterministic comparator engaged (the pipeline runs fully offline)",
    };
  }

  cache = { at: Date.now(), value: resolved };
  return resolved;
}

export interface Providers {
  ollama: boolean;
  gemini: boolean;
}

export async function providerStatus(): Promise<Providers> {
  const [ollama] = await Promise.all([ollamaHealthy()]);
  return { ollama, gemini: geminiConfigured() };
}
