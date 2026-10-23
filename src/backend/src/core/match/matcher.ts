/**
 * Symbol ↔ doc-target alignment.
 *
 * Folding rules: case-insensitive, separator-insensitive matching
 * (camelCase / snake_case / kebab-case / prose mentions), with a
 * similarity fallback for renames. Unmatched symbols and orphaned
 * targets both survive — they are drift candidates.
 */
import type { CodeSymbol, DocTarget } from "../types.js";

export interface MatchResult {
  /** symbol.name → matched targets (1:n) */
  bySymbol: Map<string, DocTarget[]>;
  /** matched target keys (file:line) for orphan detection */
  matchedTargetKeys: Set<string>;
  /** symbols that look like renames of doc targets (similarity ≥ 0.62) */
  renameHints: Map<string, string>; // symbolName → orphan target symbolHint
}

export function foldName(name: string): string {
  return name
    .replace(/^([A-Z]+)/, (m) => m.toLowerCase()) // CONST → const (keep tail)
    .replace(/[^a-zA-Z0-9]/g, "") // strip _, -, ., (), etc.
    .toLowerCase();
}

export function baseName(name: string): string {
  const parts = name.split(".");
  return parts[parts.length - 1];
}

export function similarity(a: string, b: string): number {
  const x = foldName(a);
  const y = foldName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  // cheap trigram overlap
  const tri = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
    return set;
  };
  const A = tri(x);
  const B = tri(y);
  if (A.size === 0 || B.size === 0) {
    return x.startsWith(y) || y.startsWith(x) ? 0.6 : 0;
  }
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return (2 * shared) / (A.size + B.size);
}

export function matchSymbolsToDocs(
  symbols: CodeSymbol[],
  targets: DocTarget[]
): MatchResult {
  const bySymbol = new Map<string, DocTarget[]>();
  const matchedTargetKeys = new Set<string>();
  const renameHints = new Map<string, string>();

  const symbolIndex = new Map<string, CodeSymbol>();
  for (const s of symbols) symbolIndex.set(foldName(s.name), s);

  for (const t of targets) {
    const hint = t.symbolHint;
    if (!hint) continue;
    const foldedHint = foldName(hint);
    const hits: CodeSymbol[] = [];
    const primary = symbolIndex.get(foldedHint) ?? symbolIndex.get(foldName(baseName(hint)));
    if (primary) hits.push(primary);

    // prose/rows may document several twins (interface field + const member)
    for (const s of symbols) {
      if (hits.includes(s)) continue;
      if (foldName(s.name) === foldedHint || foldName(baseName(s.name)) === foldedHint) {
        hits.push(s);
      }
    }

    if (hits.length > 0) {
      const key = `${t.file}:${t.line}:${t.symbolHint ?? ""}`;
      matchedTargetKeys.add(key);
      for (const hit of hits) {
        const arr = bySymbol.get(hit.name) ?? [];
        arr.push(t);
        bySymbol.set(hit.name, arr);
      }
    } else if (looksLikeSymbolTarget(t)) {
      // remember orphan hint for rename detection
      const best = bestRenameCandidate(hint, symbols);
      if (best) renameHints.set(best, hint);
    }
  }

  return { bySymbol, matchedTargetKeys, renameHints };
}

function looksLikeSymbolTarget(t: DocTarget): boolean {
  if (!t.symbolHint) return false;
  if (t.kind === "heading") return /^[A-Z][\w.-]*$/.test(t.symbolHint);
  return /^[A-Za-z_$][\w$./-]*$/.test(t.symbolHint);
}

function bestRenameCandidate(hint: string, symbols: CodeSymbol[]): string | null {
  let best: { name: string; score: number } | null = null;
  for (const s of symbols) {
    const score = similarity(hint, baseName(s.name));
    if (score >= 0.62 && (!best || score > best.score)) {
      best = { name: s.name, score };
    }
  }
  return best?.name ?? null;
}
