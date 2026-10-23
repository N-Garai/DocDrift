/**
 * Gemma via the Gemini API (free tier — API key from Google AI Studio,
 * no credit card). Endpoint: POST /v1beta/models/{model}:generateContent.
 * Docs: https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api
 *
 * Default model: gemma-4-31b-it (open-weights Gemma hosted by Google).
 */

export interface LlmResult {
  text: string;
  model: string;
  ms: number;
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemma-4-31b-it";
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export async function geminiGenerate(
  prompt: string,
  system: string,
  opts: { apiKey?: string; model?: string; timeoutMs?: number } = {}
): Promise<LlmResult> {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const model = opts.model ?? DEFAULT_MODEL;
  const timeoutMs = opts.timeoutMs ?? 25_000;
  const started = Date.now();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
        },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`gemini ${res.status}: ${detail.slice(0, 140)}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
    if (!text) throw new Error("gemini returned empty response");
    return { text, model: `gemini:${model}`, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}
