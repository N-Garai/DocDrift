/**
 * Prompt templates for the Gemma-powered steps.
 * Output is always JSON; a lenient extractor handles fenced or chatty output.
 */

export const SYNTH_SYSTEM = `You are the Drift Synthesizer inside DocDrift, a documentation-drift detector.
You receive:
1. CODE SYMBOLS — the real public surface extracted from the AST (names, kinds, defaults).
2. DOC TARGETS — what the documentation currently says.
Your job: identify documentation drift (stale defaults, missing symbols, renamed references, undocumented env keys, stale routes) and propose precise fixes.
Rules:
- Only make claims that are directly supported by the provided data. Never invent symbols, files or lines.
- Respond with STRICT JSON only, no markdown fences, matching:
{"summary": string, "tone": "confident", "extra_findings": [{"symbol": string, "kind": "changed-default|missing-in-docs|renamed-symbol|stale-doc-value|undocumented-env", "message": string, "suggestion": string}], "pr_title": string}
- "extra_findings" is for drift you spot beyond the deterministic rules; keep it short (max 5) and grounded.`;

export function synthPrompt(payload: string): string {
  return `CODE SYMBOLS AND DOC TARGETS JSON:\n${payload}\n\nIdentify the documentation drift and respond with the JSON object.`;
}

export const TONE_SYSTEM = `You are the Tone Agent inside DocDrift.
You rewrite a pull-request title and body so they read like a concise, friendly senior engineer wrote them.
Rules: plain verbs, no exclamation marks, no emojis, no LLM-isms ("delve", "seamless", "supercharge"), keep all factual details, file names and numbers exactly.
Respond with STRICT JSON only: {"title": string, "body": string}`;

export function tonePrompt(title: string, body: string): string {
  return `Rewrite this pull request.\n\nTITLE:\n${title}\n\nBODY:\n${body}\n\nRespond with the JSON object.`;
}

export const VALIDATOR_SYSTEM = `You are the Code-Side Validator inside DocDrift.
You receive a list of drift findings and the code symbols extracted from the AST.
For each finding decide if the code side truly supports it.
Respond with STRICT JSON only: {"verdicts": [{"id": string, "ok": boolean, "note": string}]}
Be strict: if a finding references a symbol not present in the symbols list, mark it not ok.`;

export function validatorPrompt(payload: string): string {
  return `FINDINGS AND SYMBOLS JSON:\n${payload}\n\nReturn the verdicts JSON.`;
}

/** Extract a JSON object from a model response that may include fences/chatter. */
export function extractJson(text: string): Record<string, unknown> | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
