/**
 * Gemma via Ollama (local, fully free) — POST /api/generate, stream:false.
 * Docs: https://github.com/ollama/ollama/blob/main/docs/api.md
 */

export interface LlmResult {
  text: string;
  model: string;
  ms: number;
}

export async function ollamaGenerate(
  prompt: string,
  system: string,
  opts: { url?: string; model?: string; timeoutMs?: number } = {}
): Promise<LlmResult> {
  const url = opts.url ?? process.env.OLLAMA_URL ?? "http://localhost:11434";
  const model = opts.model ?? process.env.OLLAMA_MODEL ?? "gemma3:4b";
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const started = Date.now();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        system,
        stream: false,
        format: "json",
        options: { temperature: 0.2 },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`ollama ${res.status}`);
    }
    const data = (await res.json()) as { response?: string };
    const text = data.response?.trim();
    if (!text) throw new Error("ollama returned empty response");
    return { text, model: `ollama:${model}`, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

export async function ollamaHealthy(url?: string): Promise<boolean> {
  const base = url ?? process.env.OLLAMA_URL ?? "http://localhost:11434";
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${base.replace(/\/$/, "")}/api/tags`, {
      signal: ctrl.signal,
    });
    return res.ok;
  } catch {
    return false;
  }
}
