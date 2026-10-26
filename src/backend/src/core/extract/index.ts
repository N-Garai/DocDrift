/**
 * Extraction dispatcher: try tree-sitter (WASM), fall back to the structural
 * heuristic scanner. Reports which parser won so the UI and /api/health can
 * be honest about it.
 */
import type { CodeSymbol, SourceFile } from "../types.js";
import { extractWithTreeSitter } from "./treeSitter.js";
import { extractWithHeuristics } from "./heuristic.js";
import { lastParserUsed } from "./treeSitter.js";

export interface ExtractResult {
  symbols: CodeSymbol[];
  parser: "tree-sitter" | "heuristic";
  notes: string;
}

export async function extractSymbols(
  files: SourceFile[],
  language: string
): Promise<ExtractResult> {
  const all: CodeSymbol[] = [];
  let tsCount = 0;
  let heurCount = 0;
  const notes: string[] = [];

  for (const file of files) {
    const isTsLike = /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(file.path);
    const lang: "typescript" | "python" = isTsLike ? "typescript" : language.includes("python") ? "python" : "typescript";
    const viaTs = await extractWithTreeSitter(file, lang);
    if (viaTs && viaTs.length >= 0 && lastParserUsed === "tree-sitter") {
      all.push(...viaTs);
      tsCount++;
      continue;
    }
    const viaHeur = extractWithHeuristics(file, lang);
    all.push(...viaHeur);
    heurCount++;
    notes.push(`${file.path}: structural fallback`);
  }

  if (tsCount > 0 && heurCount === 0) {
    return {
      symbols: dedupe(all),
      parser: "tree-sitter",
      notes: `${tsCount} file(s) parsed with tree-sitter WASM grammars`,
    };
  }
  if (tsCount > 0 && heurCount > 0) {
    return {
      symbols: dedupe(all),
      parser: "heuristic",
      notes: `mixed: ${tsCount} via tree-sitter, ${heurCount} via fallback`,
    };
  }
  return {
    symbols: dedupe(all),
    parser: "heuristic",
    notes:
      notes.length > 0
        ? `tree-sitter unavailable or incompatible — structural fallback used (${notes.join("; ")})`
        : "structural fallback used",
  };
}

function dedupe(symbols: CodeSymbol[]): CodeSymbol[] {
  const seen = new Set<string>();
  const out: CodeSymbol[] = [];
  for (const s of symbols) {
    const key = `${s.file}:${s.name}:${s.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.sort((a, b) => a.line - b.line);
}
