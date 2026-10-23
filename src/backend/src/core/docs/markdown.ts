/**
 * Markdown docs parser: sections, tables, code spans, env blocks.
 * Produces typed DocTargets with line evidence so the docs side is as
 * rigorous as the code side.
 */
import type { DocTarget, SourceFile } from "../types.js";

export interface MarkdownTable {
  file: string;
  headerLine: number;
  header: string[];
  rows: { line: number; cells: string[] }[];
}

export interface DocsParseResult {
  targets: DocTarget[];
  tables: MarkdownTable[];
}

export function parseMarkdown(file: SourceFile): DocsParseResult {
  const lines = file.content.split("\n");
  const targets: DocTarget[] = [];
  const tables: MarkdownTable[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // heading
    const headingM = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingM) {
      targets.push({
        file: file.path,
        kind: "heading",
        line: i + 1,
        text: headingM[2].trim(),
        symbolHint: headingM[2].trim(),
      });
      i++;
      continue;
    }

    // table start
    if (line.includes("|") && isTableDivider(lines[i + 1])) {
      const header = splitRow(line);
      const rows: { line: number; cells: string[] }[] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes("|")) {
        rows.push({ line: j + 1, cells: splitRow(lines[j]) });
        j++;
      }
      tables.push({ file: file.path, headerLine: i + 1, header, rows });

      for (const r of rows) {
        targets.push({
          file: file.path,
          kind: "table-row",
          line: r.line,
          text: r.cells.join(" | "),
          symbolHint: r.cells[0]?.trim(),
        });
      }
      i = j;
      continue;
    }

    // inline code spans
    const spans = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    for (const span of spans) {
      if (looksSymbolic(span)) {
        targets.push({
          file: file.path,
          kind: "code-span",
          line: i + 1,
          text: line.trim(),
          symbolHint: span,
        });
      }
    }

    i++;
  }

  return { targets, tables };
}

function isTableDivider(line: string | undefined): boolean {
  return !!line && /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function looksSymbolic(span: string): boolean {
  const bare = span.replace(/\(\)$/g, "");
  return /^[A-Za-z_$][\w$./-]*$/.test(bare) || /^[A-Z_0-9]+$/.test(bare);
}

/**
 * Parse .env.example into keyed targets with defaults.
 */
export function parseEnvExample(file: SourceFile): {
  targets: DocTarget[];
  entries: Map<string, { line: number; key: string; value: string }>;
} {
  const targets: DocTarget[] = [];
  const entries = new Map<string, { line: number; key: string; value: string }>();
  const lines = file.content.split("\n");

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m) {
      const key = m[1];
      entries.set(key, { line: idx + 1, key, value: m[2].trim() });
      targets.push({
        file: file.path,
        kind: "env-line",
        line: idx + 1,
        text: line,
        symbolHint: key,
      });
    }
  });

  return { targets, entries };
}

/**
 * Extract table-row default values: "| PORT | 3000 | ..." → "3000".
 */
export function rowDefault(cells: string[]): string | null {
  // conventions: second cell, or a cell matching "default: X"
  for (const c of cells.slice(1)) {
    const dm = /default[:\s`]*([^\s`|]+)/i.exec(c);
    if (dm) return dm[1].replace(/["'`]/g, "");
  }
  const second = cells[1]?.replace(/["'`*]/g, "").trim();
  if (second && /^(true|false|\d+(\.\d+)?|\/[\w/.-]*|[A-Z_0-9]+)$/i.test(second)) {
    return second;
  }
  return null;
}
