/**
 * tree-sitter extraction via web-tree-sitter (WASM).
 *
 * Grammars come prebuilt from @repomix/tree-sitter-wasms so nothing is
 * compiled at install time. Any failure here is recorded in the parser
 * failure ledger and the caller transparently falls back to the structural
 * heuristic extractor — the pipeline never hard-fails on parser trouble.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { recordParserFailure } from "../observability.js";
import { matchEnvReads } from "./heuristic.js";
import type { CodeSymbol, SourceFile } from "../types.js";

type TSParser = {
  setLanguage: (lang: unknown) => unknown;
  parse: (input: string) => TSTree | null;
  delete: () => void;
};
type TSTree = {
  rootNode: TSNode;
  delete: () => void;
};
export type TSNode = {
  type: string;
  text: string;
  startIndex: number;
  endIndex: number;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  childCount: number;
  child: (i: number) => TSNode;
  children: TSNode[];
  namedChildren: TSNode[];
  childForFieldName: (name: string) => TSNode | null;
  descendantsOfType?: (types: string[]) => TSNode[];
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type WtsModule = any; // web-tree-sitter ships its own types; we adapt them loosely

const require_ = createRequire(import.meta.url);

let parserPromise: Promise<{
  load: (lang: "typescript" | "python") => Promise<TSParser>;
}> | null = null;

const GRAMMAR_FILE: Record<"typescript" | "python", string> = {
  typescript: "tree-sitter-typescript.wasm",
  python: "tree-sitter-python.wasm",
};

async function getRuntime() {
  if (!parserPromise) {
    parserPromise = (async () => {
      const wts: WtsModule = await import("web-tree-sitter");
      // resolve the runtime wasm shipped inside web-tree-sitter
      const runtimeWasmDir = path.dirname(
        require_.resolve("web-tree-sitter/web-tree-sitter.wasm")
      );
      await wts.Parser.init({
        locateFile: (file: string) => path.join(runtimeWasmDir, file),
      });

      const grammarDir = path.dirname(
        require_.resolve("@repomix/tree-sitter-wasms/package.json")
      );
      const loaded = new Map<string, TSParser>();

      return {
        load: async (lang: "typescript" | "python"): Promise<TSParser> => {
          const cached = loaded.get(lang);
          if (cached) return cached;
          const wasmPath = path.join(grammarDir, "out", GRAMMAR_FILE[lang]);
          const language = await wts.Language.load(new Uint8Array(readFileSync(wasmPath)));
          const parser = new wts.Parser();
          parser.setLanguage(language);
          loaded.set(lang, parser);
          return parser;
        },
      };
    })().catch((err) => {
      parserPromise = null; // allow retry on next call
      throw err;
    });
  }
  return parserPromise;
}

export let lastParserUsed: "tree-sitter" | "heuristic" = "heuristic";

/**
 * Parse a source file with tree-sitter and map top-level declarations to
 * CodeSymbols. Returns null when tree-sitter is unavailable — callers fall
 * back to the heuristic extractor.
 */
export async function extractWithTreeSitter(
  file: SourceFile,
  language: "typescript" | "python"
): Promise<CodeSymbol[] | null> {
  try {
    const rt = await getRuntime();
    const parser = await rt.load(language);
    const tree = parser.parse(file.content);
    if (!tree) return null;
    const symbols =
      language === "python"
        ? walkPython(tree.rootNode, file)
        : walkTypeScript(tree.rootNode, file);
    tree.delete();

    // env reads are line-oriented — merge them in regardless of grammar shape
    if (language === "typescript") {
      const seen = new Set(symbols.map((s) => s.name));
      file.content.split("\n").forEach((line, i) => {
        for (const key of matchEnvReads(line)) {
          if (!seen.has(key)) {
            seen.add(key);
            symbols.push({
              name: key,
              kind: "env-key",
              line: i + 1,
              signature: line.trim().slice(0, 120),
              file: file.path,
            });
          }
        }
      });
    }
    lastParserUsed = "tree-sitter";
    return symbols;
  } catch (err) {
    recordParserFailure(
      file.path,
      err instanceof Error ? err.message : "unknown tree-sitter error"
    );
    return null;
  }
}

/* ── TypeScript / JavaScript AST walking ─────────────────────────────────── */

function lineOf(node: TSNode): number {
  return node.startPosition.row + 1;
}

function firstIdentifier(node: TSNode): string | null {
  const id = node.childForFieldName?.("name");
  return id ? id.text : null;
}

function walkTypeScript(root: TSNode, file: SourceFile): CodeSymbol[] {
  const out: CodeSymbol[] = [];

  const visit = (node: TSNode, exported: boolean) => {
    const t = node.type;

    if (t === "export_statement") {
      for (const c of node.namedChildren) visit(c, true);
      return;
    }

    if (t === "function_declaration" && exported) {
      const name = firstIdentifier(node);
      if (name) {
        out.push({
          name,
          kind: "function",
          line: lineOf(node),
          signature: summarize(node),
          file: file.path,
        });
      }
    } else if (t === "class_declaration" && exported) {
      const name = firstIdentifier(node);
      if (name) {
        out.push({
          name,
          kind: "class",
          line: lineOf(node),
          signature: summarize(node),
          file: file.path,
        });
        // public method_signature members
        for (const member of node.namedChildren) {
          if (member.type === "method_definition" || member.type === "public_field_definition") {
            const mname = firstIdentifier(member);
            if (mname && !mname.startsWith("#") && !mname.startsWith("_")) {
              out.push({
                name: `${name}.${mname}`,
                kind: "function",
                line: lineOf(member),
                signature: summarize(member),
                file: file.path,
              });
            }
          }
        }
      }
    } else if (
      (t === "interface_declaration" || t === "type_alias_declaration") &&
      exported
    ) {
      const name = firstIdentifier(node);
      if (name) {
        out.push({
          name,
          kind: t === "interface_declaration" ? "interface" : "type",
          line: lineOf(node),
          signature: summarize(node),
          file: file.path,
        });
        // record interface fields (with literal defaults) as field symbols
        const body = node.childForFieldName?.("body");
        if (body) {
          for (const prop of body.namedChildren) {
            if (prop.type === "property_signature") {
              const pname = firstIdentifier(prop);
              if (!pname) continue;
              const valueNode = findDefaultInProperty(prop);
              out.push({
                name: `${name}.${pname}`,
                kind: "field",
                line: lineOf(prop),
                signature: summarize(prop),
                defaultValue: valueNode ?? undefined,
                file: file.path,
              });
            }
          }
        }
      }
    } else if (t === "lexical_declaration" || t === "variable_declaration") {
      for (const decl of node.namedChildren) {
        if (decl.type !== "variable_declarator") continue;
        const name = decl.childForFieldName?.("name")?.text;
        const value = decl.childForFieldName?.("value");
        if (!name || !value || !exported) continue;
        out.push({
          name,
          kind: "const",
          line: lineOf(decl),
          signature: summarize(decl),
          defaultValue: literalOf(value),
          file: file.path,
        });
        // object-literal members: export const defaults = { port: 8080 }
        if (value.type === "object") {
          for (const pair of value.namedChildren) {
            if (pair.type !== "pair" && pair.type !== "property") continue;
            const key = pair.childForFieldName?.("key")?.text;
            const val = pair.childForFieldName?.("value");
            if (!key || !val) continue;
            out.push({
              name: `${name}.${key}`,
              kind: "field",
              line: lineOf(pair),
              signature: summarize(pair),
              defaultValue: literalOf(val),
              file: file.path,
            });
          }
        }
        // route literals: app.post("/api/v2/...", ...)
        const route = routeLiteralOf(value);
        if (route) {
          out.push({
            name: `${route.method} ${route.path}`,
            kind: "route",
            line: lineOf(decl),
            signature: summarize(decl),
            route,
            file: file.path,
          });
        }
      }
    } else if (t === "pair" || t === "property") {
      // object literal members inside exported consts — captured via parents
    }

    // recurse for program/statement_block nesting (but keep top-level bias)
    if (
      t === "program" ||
      t === "statement_block" ||
      t === "call_expression" ||
      t === "expression_statement"
    ) {
      for (const c of node.namedChildren) visit(c, exported || t === "program");
    }
  };

  visit(root, false);

  // also catch route registrations nested in call expressions at any depth
  for (const call of findDescendants(root, "call_expression")) {
    const route = routeLiteralOf(call);
    if (route) {
      out.push({
        name: `${route.method} ${route.path}`,
        kind: "route",
        line: lineOf(call),
        signature: summarize(call),
        route,
        file: file.path,
      });
    }
  }

  return out;
}

function findDescendants(root: TSNode, type: string): TSNode[] {
  const acc: TSNode[] = [];
  const visit = (n: TSNode) => {
    if (n.type === type) acc.push(n);
    for (const c of n.namedChildren) visit(c);
  };
  visit(root);
  return acc;
}

function findDefaultInProperty(prop: TSNode): string | null {
  // `port: number` → null; annotated defaults rarely exist in interfaces,
  // but JSDoc-style defaults like `/** @default 3000 */` are checked by callers.
  return null;
}

function literalOf(value: TSNode): string | undefined {
  const t = value.type;
  if (t === "number" || t === "integer" || t === "float" || t === "string" || t === "template_string") {
    return value.text.replace(/^["'`]|["'`]$/g, "");
  }
  if (t === "true") return "true";
  if (t === "false") return "false";
  if (t === "identifier" || t === "member_expression") return value.text;
  return undefined;
}

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);

function routeLiteralOf(node: TSNode): { method: string; path: string } | null {
  if (node.type !== "call_expression") return null;
  const fn = node.childForFieldName?.("function");
  if (!fn || fn.type !== "member_expression") return null;
  const method = fn.childForFieldName?.("property")?.text?.toLowerCase();
  if (!method || !HTTP_METHODS.has(method)) return null;
  const args = node.childForFieldName?.("arguments");
  const first = args?.namedChildren?.[0];
  if (!first || (first.type !== "string" && first.type !== "template_string")) return null;
  const p = first.text.replace(/^["'`]|["'`]$/g, "");
  if (!p.startsWith("/")) return null;
  return { method: method.toUpperCase(), path: p };
}

function summarize(node: TSNode): string {
  const firstLine = node.text.split("\n")[0] ?? node.text;
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
}

/* ── Python AST walking ──────────────────────────────────────────────────── */

function walkPython(root: TSNode, file: SourceFile): CodeSymbol[] {
  const out: CodeSymbol[] = [];

  const visit = (node: TSNode) => {
    if (node.type === "class_definition") {
      const name = firstIdentifier(node);
      if (name) {
        out.push({
          name,
          kind: "class",
          line: lineOf(node),
          signature: summarize(node),
          file: file.path,
        });
        const body = node.childForFieldName?.("body");
        if (body) {
          for (const stmt of body.namedChildren) {
            if (stmt.type === "function_definition") {
              const fname = firstIdentifier(stmt);
              if (fname && !fname.startsWith("_")) {
                out.push({
                  name: `${name}.${fname}`,
                  kind: "function",
                  line: lineOf(stmt),
                  signature: summarize(stmt),
                  file: file.path,
                });
              }
            } else if (stmt.type === "expression_statement" || stmt.type === "assignment") {
              const text = stmt.text;
              const m = /^([a-zA-Z_][\w]*)\s*:\s*([^=]+)(?:=\s*(.+))?$/s.exec(
                text.split("\n")[0] ?? ""
              );
              if (m) {
                out.push({
                  name: `${name}.${m[1]}`,
                  kind: "field",
                  line: lineOf(stmt),
                  signature: summarize(stmt),
                  defaultValue: m[3]?.trim().replace(/^["']|["']$/g, ""),
                  file: file.path,
                });
              }
            }
          }
        }
      }
    } else if (node.type === "function_definition") {
      const name = firstIdentifier(node);
      if (name && !name.startsWith("_")) {
        out.push({
          name,
          kind: "function",
          line: lineOf(node),
          signature: summarize(node),
          file: file.path,
        });
      }
    } else if (node.type === "assignment") {
      const left = node.childForFieldName?.("left");
      const right = node.childForFieldName?.("right");
      if (left?.type === "identifier" && /^[A-Z][A-Z0-9_]*$/.test(left.text) && right) {
        out.push({
          name: left.text,
          kind: "const",
          line: lineOf(node),
          signature: summarize(node),
          defaultValue: literalOf(right),
          file: file.path,
        });
      }
    }
    for (const c of node.namedChildren) visit(c);
  };

  visit(root);
  return out;
}
