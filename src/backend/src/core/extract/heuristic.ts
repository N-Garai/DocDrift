/**
 * Structural fallback extractor.
 *
 * Line-oriented, language-aware scanning that mirrors what tree-sitter
 * returns for the constructs DocDrift cares about. It exists because
 * "parser unavailable" must degrade gracefully, never crash the pipeline.
 * It is deliberately conservative: only high-confidence public surface
 * (exports, top-level classes/functions, env reads, route literals).
 */
import type { CodeSymbol, SourceFile } from "../types.js";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);

export function extractWithHeuristics(
  file: SourceFile,
  language: "typescript" | "python"
): CodeSymbol[] {
  return language === "python" ? scanPython(file) : scanTypeScript(file);
}

function lineAt(lines: string[], idx: number): number {
  return idx + 1;
}

function scanTypeScript(file: SourceFile): CodeSymbol[] {
  const out: CodeSymbol[] = [];
  const lines = file.content.split("\n");

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const n = lineAt(lines, idx);

    // export function foo(...)
    let m = /^export\s+(?:declare\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (m) {
      out.push({ name: m[1], kind: "function", line: n, signature: trim(line), file: file.path });
      return;
    }

    // export class Foo
    m = /^export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (m) {
      out.push({ name: m[1], kind: "class", line: n, signature: trim(line), file: file.path });
      return;
    }

    // export interface Foo
    m = /^export\s+interface\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (m) {
      out.push({ name: m[1], kind: "interface", line: n, signature: trim(line), file: file.path });
      scanInterfaceBody(lines, idx, m[1], file, out);
      return;
    }

    // export type Foo = ...
    m = /^export\s+type\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (m) {
      out.push({ name: m[1], kind: "type", line: n, signature: trim(line), file: file.path });
      return;
    }

    // export const/let/var NAME = VALUE
    m = /^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(.+?);?\s*$/.exec(line);
    if (m) {
      const [, name, rhs] = m;
      out.push({
        name,
        kind: "const",
        line: n,
        signature: trim(line),
        defaultValue: literal(rhs),
        file: file.path,
      });
      // object-literal members: export const defaults = { port: 8080 }
      if (/\{\s*$/.test(rhs)) {
        for (let k = idx + 1; k < Math.min(idx + 60, lines.length); k++) {
          const inner = lines[k];
          if (/^\s*\}\s*;?\s*$/.test(inner)) break;
          const pm = /^\s{2,}([A-Za-z_$][\w$]*)\s*:\s*(.+?),?\s*$/.exec(inner);
          if (pm) {
            out.push({
              name: `${name}.${pm[1]}`,
              kind: "field",
              line: k + 1,
              signature: trim(inner),
              defaultValue: literal(pm[2]),
              file: file.path,
            });
          }
        }
      }
      const route = routeOf(rhs);
      if (route) {
        out.push({
          name: `${route.method} ${route.path}`,
          kind: "route",
          line: n,
          signature: trim(line),
          route,
          file: file.path,
        });
      }
      return;
    }

    // route registrations not caught above (multiline patterns)
    const route = routeOf(line);
    if (route) {
      out.push({
        name: `${route.method} ${route.path}`,
        kind: "route",
        line: n,
        signature: trim(line),
        route,
        file: file.path,
      });
      return;
    }

    // env reads: env.PORT / process.env.ENABLE_CACHE / env["ENABLE_CACHE"]
    for (const envM of matchEnvReads(line)) {
      out.push({
        name: envM,
        kind: "env-key",
        line: n,
        signature: trim(line),
        file: file.path,
      });
    }
  });

  return out;
}

function scanInterfaceBody(
  lines: string[],
  startIdx: number,
  iface: string,
  file: SourceFile,
  out: CodeSymbol[]
) {
  for (let i = startIdx + 1; i < Math.min(startIdx + 40, lines.length); i++) {
    const l = lines[i];
    if (/^\s*\}/.test(l)) break;
    const fm = /^\s{2,}([A-Za-z_$][\w$]*)\??\s*:\s*([^;,]+)[;,]?/.exec(l);
    if (fm) {
      const jsdocDefault = jsdocDefaultFor(lines, i);
      out.push({
        name: `${iface}.${fm[1]}`,
        kind: "field",
        line: i + 1,
        signature: trim(l),
        defaultValue: jsdocDefault ?? undefined,
        file: file.path,
      });
    }
  }
}

function jsdocDefaultFor(lines: string[], idx: number): string | null {
  for (let i = idx - 1; i >= Math.max(0, idx - 4); i--) {
    const m = /@default\s+(\S+)/.exec(lines[i]);
    if (m) return m[1];
  }
  return null;
}

function scanPython(file: SourceFile): CodeSymbol[] {
  const out: CodeSymbol[] = [];
  const lines = file.content.split("\n");
  let currentClass: string | null = null;

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const n = lineAt(lines, idx);

    const classM = /^class\s+([A-Za-z_][\w]*)/.exec(line);
    if (classM) {
      currentClass = classM[1];
      out.push({ name: classM[1], kind: "class", line: n, signature: trim(line), file: file.path });
      return;
    }
    if (/^\S/.test(line)) currentClass = null;

    const defM = /^(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(([^)]*)\)/.exec(line);
    if (defM) {
      const name = currentClass && !defM[1].startsWith("_") ? `${currentClass}.${defM[1]}` : defM[1];
      out.push({ name, kind: "function", line: n, signature: trim(line), file: file.path });
      return;
    }

    // pydantic-style fields: name: type = default
    const fieldM = /^\s{2,}([a-z_][\w]*)\s*:\s*([\w\[\]|\s.]+?)(?:=\s*(.+?))?\s*$/.exec(line);
    if (fieldM && currentClass) {
      out.push({
        name: `${currentClass}.${fieldM[1]}`,
        kind: "field",
        line: n,
        signature: trim(line),
        defaultValue: fieldM[3]?.trim().replace(/^["']|["']$/g, ""),
        file: file.path,
      });
      return;
    }

    // module constants
    const constM = /^([A-Z][A-Z0-9_]*)\s*=\s*(.+?)(?:\s*#.*)?$/.exec(line);
    if (constM) {
      out.push({
        name: constM[1],
        kind: "const",
        line: n,
        signature: trim(line),
        defaultValue: literal(constM[2]),
        file: file.path,
      });
      return;
    }

    for (const envM of matchEnvReads(line)) {
      out.push({ name: envM, kind: "env-key", line: n, signature: trim(line), file: file.path });
    }
  });

  return out;
}

export function matchEnvReads(line: string): string[] {
  const names = new Set<string>();
  const dot = /\b(?:process\.env|env|os\.environ(?:\.get)?|os\.getenv)\.([A-Z][A-Z0-9_]*)/g;
  const bracket = /\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g;
  const call = /(?:os\.environ\.get|os\.getenv)\s*\(\s*["']([A-Z][A-Z0-9_]*)["']/g;
  for (const re of [dot, call]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) names.add(m[1]);
  }
  let b: RegExpExecArray | null;
  while ((b = bracket.exec(line))) {
    const key = b[1];
    if (/^[A-Z][A-Z0-9_]*$/.test(key)) names.add(key);
  }
  return [...names];
}

function routeOf(text: string): { method: string; path: string } | null {
  const m = new RegExp(
    `\\.(${[...HTTP_METHODS].join("|")})\\s*\\(\\s*["'\`](/[^"'\` ]*)["'\`]`,
    "i"
  ).exec(text);
  if (!m) return null;
  return { method: m[1].toUpperCase(), path: m[2] };
}

function literal(rhs: string): string | undefined {
  const t = rhs.trim();
  if (/^(["'])(.*)\1$/.test(t)) return t.slice(1, -1);
  if (/^(true|false|\d+(\.\d+)?)$/.test(t)) return t;
  if (/^(Number|Int)\(.*\)$/.test(t)) {
    const inner = t.replace(/^(Number|Int)\(|\)$/g, "").trim();
    return /^\d+$/.test(inner) ? inner : undefined;
  }
  const idMatch = /^([A-Z][A-Z0-9_]*)$/.exec(t);
  if (idMatch) return t;
  return undefined;
}

function trim(line: string): string {
  const t = line.trim();
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}
