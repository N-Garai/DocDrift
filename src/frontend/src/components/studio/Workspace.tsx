"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Search,
  Lock,
  Unlock,
  GitBranch,
  FileCode2,
  BookOpenText,
  Play,
  ArrowLeft,
  RefreshCw,
  GitPullRequest,
  CheckCircle2,
  ExternalLink,
  Loader2,
} from "lucide-react";
import {
  fetchRepos,
  fetchBranches,
  fetchTree,
  fetchBlob,
  openDocsPr,
  curateCodeFiles,
  curateDocFiles,
  langForPath,
  applyEdits,
  ApiError,
  type RepoInfo,
  type TreeFile,
} from "@/lib/github";
import type { AnalyzeResult } from "@/lib/api";
import { DriftList } from "@/components/demo/DriftList";
import { DiffView } from "@/components/demo/DiffView";

type Stage = "repo" | "files" | "results";
type RunState = "idle" | "running" | "done" | "error";

const RUN_STEPS = [
  "intake — reading git-side inputs",
  "extractor agent — tree-sitter AST",
  "docs agent — parsing markdown targets",
  "matcher — aligning symbols to docs",
  "synthesizer — drafting findings",
  "gate 1 — code-side grounding check",
  "patcher — building the unified diff",
  "gate 2 — docs-apply integrity check",
  "tone agent — humanizing the PR",
];

export function Workspace({ login }: { login: string }) {
  const [stage, setStage] = useState<Stage>("repo");

  /* repo picking */
  const [repos, setRepos] = useState<RepoInfo[] | null>(null);
  const [repoQuery, setRepoQuery] = useState("");
  const [repo, setRepo] = useState<RepoInfo | null>(null);

  /* branch + tree */
  const [branch, setBranch] = useState("");
  const [treeFiles, setTreeFiles] = useState<TreeFile[] | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeTruncated, setTreeTruncated] = useState(false);

  /* file selection */
  const [codePath, setCodePath] = useState("");
  const [docPaths, setDocPaths] = useState<string[]>([]);
  const [docQuery, setDocQuery] = useState("");
  const [showAllCode, setShowAllCode] = useState(false);

  /* run */
  const [runState, setRunState] = useState<RunState>("idle");
  const [runStep, setRunStep] = useState(0);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const contentsRef = useRef<Map<string, string>>(new Map());

  /* pr */
  const [prBusy, setPrBusy] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  /* ── load repos once ─────────────────────────────────────────────────── */
  useEffect(() => {
    let alive = true;
    fetchRepos()
      .then((r) => alive && setRepos(r.repos))
      .catch((e) => {
        if (!alive) return;
        setRepos([]);
        toast.error(e instanceof ApiError ? e.message : "could not list repositories");
      });
    return () => {
      alive = false;
    };
  }, []);

  const filteredRepos = useMemo(() => {
    if (!repos) return [];
    const q = repoQuery.trim().toLowerCase();
    return q ? repos.filter((r) => r.fullName.toLowerCase().includes(q)) : repos;
  }, [repos, repoQuery]);

  /* ── selection ───────────────────────────────────────────────────────── */
  async function pickRepo(r: RepoInfo) {
    setRepo(r);
    setBranch(r.defaultBranch);
    setTreeFiles(null);
    setCodePath("");
    setDocPaths([]);
    setStage("files");
    setTreeLoading(true);
    try {
      const [tree] = await Promise.all([
        fetchTree(r.owner, r.name, r.defaultBranch),
        fetchBranches(r.owner, r.name).catch(() => ({ branches: [r.defaultBranch] })),
      ]);
      setTreeFiles(tree.files);
      setTreeTruncated(tree.truncated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "could not read the repo tree");
      setTreeFiles([]);
    } finally {
      setTreeLoading(false);
    }
  }

  const codeOptions = useMemo(
    () => (treeFiles ? curateCodeFiles(treeFiles) : []),
    [treeFiles]
  );
  const allCodeFiles = useMemo(
    () =>
      (treeFiles ?? []).filter(
        (f) => /\.(ts|tsx|py)$/.test(f.path) && !/(^|\/)(node_modules|dist|build|out|\.next|vendor|__pycache__|\.venv)(\/|$)/.test(f.path)
      ),
    [treeFiles]
  );
  const docOptions = useMemo(() => (treeFiles ? curateDocFiles(treeFiles) : []), [treeFiles]);
  const envExamplePath = useMemo(
    () => (treeFiles ?? []).find((f) => /(^|\/)\.env\.example$/.test(f.path))?.path ?? null,
    [treeFiles]
  );

  useEffect(() => {
    if (!treeFiles) return;
    if (!codePath && codeOptions.length > 0) setCodePath(codeOptions[0].path);
    if (docPaths.length === 0 && docOptions.length > 0) {
      setDocPaths(docOptions.map((d) => d.path).slice(0, 6));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeFiles]);

  const filteredDocs = useMemo(() => {
    const q = docQuery.trim().toLowerCase();
    // .env.example has its own dedicated row below — keep it out of the docs list
    const base = docOptions.filter((d) => d.path !== envExamplePath);
    const extra = q
      ? (treeFiles ?? [])
          .filter(
            (f) =>
              /\.md$/.test(f.path) &&
              f.path.toLowerCase().includes(q) &&
              f.path !== envExamplePath
          )
          .slice(0, 12)
      : [];
    const merged = [...base];
    for (const e of extra) if (!merged.some((m) => m.path === e.path)) merged.push(e);
    return merged;
  }, [docOptions, docQuery, treeFiles, envExamplePath]);

  const visibleCode = showAllCode || codeOptions.length === 0 ? allCodeFiles.slice(0, 40) : codeOptions;

  /* ── run the drift workflow ──────────────────────────────────────────── */
  async function runAnalysis() {
    if (!repo || !codePath || docPaths.length === 0) return;
    setRunState("running");
    setRunStep(0);
    setStage("results");
    setPrUrl(null);
    contentsRef.current = new Map();
    const stepper = setInterval(
      () => setRunStep((i) => Math.min(RUN_STEPS.length - 1, i + 1)),
      650
    );
    try {
      const ref = branch || repo.defaultBranch;
      const codeBlob = await fetchBlob(repo.owner, repo.name, codePath, ref);
      contentsRef.current.set(codeBlob.path, codeBlob.content);

      const docs = await Promise.all(
        docPaths.map(async (p) => {
          const b = await fetchBlob(repo.owner, repo.name, p, ref);
          contentsRef.current.set(p, b.content);
          return { path: p, content: b.content };
        })
      );
      if (docs.length === 0) throw new Error("no documentation files could be fetched");

      const envExample = envExamplePath
        ? await fetchBlob(repo.owner, repo.name, envExamplePath, ref).then((b) => {
            contentsRef.current.set(b.path, b.content);
            return { path: b.path, content: b.content };
          })
        : undefined;

      // .env.example participates as envExample, not as a docs file
      const docsClean = docs.filter((d) => d.path !== envExamplePath);
      if (docsClean.length === 0) throw new Error("no markdown docs selected");

      const { analyze } = await import("@/lib/api");
      const res = await analyze({
        mode: "custom",
        language: langForPath(codePath),
        custom: {
          codeFile: { path: codePath, content: codeBlob.content },
          docs: docsClean,
          envExample,
        },
      });
      setResult(res);
      setRunState("done");
      toast.success(
        `${res.drifts.length} drift${res.drifts.length === 1 ? "" : "s"} found · engine: ${res.engine.engine}`
      );
    } catch (e) {
      setRunState("error");
      toast.error(e instanceof Error ? e.message : "the drift workflow failed");
    } finally {
      clearInterval(stepper);
    }
  }

  /* ── open the docs PR on GitHub ──────────────────────────────────────── */
  async function createPr() {
    if (!repo || !result) return;
    setPrBusy(true);
    try {
      const byFile = new Map<string, { line: number; oldText: string; newText: string }[]>();
      for (const edit of result.patch.edits) {
        const list = byFile.get(edit.file) ?? [];
        list.push({ line: edit.line, oldText: edit.oldText, newText: edit.newText });
        byFile.set(edit.file, list);
      }
      const files = [...byFile.entries()].map(([path, edits]) => {
        const original = contentsRef.current.get(path);
        if (original === undefined) throw new Error(`missing local copy of ${path}`);
        return { path, content: applyEdits(original, edits) };
      });
      if (files.length === 0) throw new Error("the patch contains no applicable edits");

      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      const res = await openDocsPr(repo.owner, repo.name, {
        base: branch || repo.defaultBranch,
        branch: `docdrift/docs-sync-${stamp}`,
        title: result.patch.prTitle,
        body: result.patch.prBody,
        files,
      });
      setPrUrl(res.pullRequest.html_url);
      toast.success(
        res.created ? `Pull request #${res.pullRequest.number} opened` : "A PR already exists for this branch"
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "could not open the pull request");
    } finally {
      setPrBusy(false);
    }
  }

  /* ─────────────────────────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col gap-6">
      {/* stage rail */}
      <ol className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em]">
        {[
          { id: "repo", label: "1 · repository" },
          { id: "files", label: "2 · files" },
          { id: "results", label: "3 · drift report" },
        ].map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            {i > 0 && <span className="text-fog/40">→</span>}
            <button
              type="button"
              onClick={() => {
                if (s.id === "repo") setStage("repo");
                if (s.id === "files" && repo) setStage("files");
              }}
              className={`rounded-lg border px-3 py-1.5 transition-colors ${
                stage === s.id
                  ? "border-drift-ember/50 bg-drift-ember/10 text-drift-ember"
                  : "border-line text-fog/70 hover:text-mist"
              }`}
            >
              {s.label}
            </button>
          </li>
        ))}
        {repo && (
          <li className="ml-auto flex items-center gap-2 text-fog">
            <GitBranch className="h-3.5 w-3.5 text-drift-amber" />
            <span className="text-mist">{repo.fullName}</span>
            <span className="text-fog/50">@{login}</span>
          </li>
        )}
      </ol>

      {/* ── stage 1: repository ─────────────────────────────────────────── */}
      {stage === "repo" && (
        <section className="glass rounded-3xl p-6 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg uppercase tracking-wide text-mist">
              Pick a repository
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fog/60" />
              <input
                value={repoQuery}
                onChange={(e) => setRepoQuery(e.target.value)}
                placeholder="filter repos…"
                className="w-56 rounded-xl border border-line bg-ink-900/70 py-2.5 pl-9 pr-3 font-mono text-[12.5px] text-mist outline-none placeholder:text-fog/40 focus:border-drift-ember/50"
              />
            </div>
          </div>

          {repos === null ? (
            <div className="mt-6 flex items-center gap-3 font-mono text-[12.5px] text-fog">
              <Loader2 className="h-4 w-4 animate-spin text-drift-ember" /> listing your
              repositories (private included)…
            </div>
          ) : filteredRepos.length === 0 ? (
            <p className="mt-6 rounded-xl border border-line bg-ink-800/40 px-4 py-3 font-mono text-[12.5px] text-fog">
              no repositories visible for this account — check the OAuth scope
              (needs <span className="text-mist">repo</span>) or the filter.
            </p>
          ) : (
            <ul className="scroll-thin mt-5 grid max-h-[420px] gap-2.5 overflow-y-auto pr-1">
              {filteredRepos.map((r) => (
                <li key={r.fullName}>
                  <button
                    type="button"
                    onClick={() => pickRepo(r)}
                    className="group flex w-full items-center gap-3 rounded-2xl border border-line bg-ink-800/50 px-4 py-3.5 text-left transition-all hover:border-drift-ember/40 hover:bg-ink-800/80"
                  >
                    {r.private ? (
                      <Lock className="h-4 w-4 shrink-0 text-[#f7d77f]" />
                    ) : (
                      <Unlock className="h-4 w-4 shrink-0 text-drift-mint" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[13.5px] text-mist">
                        {r.fullName}
                      </span>
                      <span className="block truncate text-[12px] text-fog">
                        {r.description ?? "no description"}
                      </span>
                    </span>
                    <span className="hidden shrink-0 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fog/60 sm:block">
                      {r.language ?? "—"} · {r.private ? "private" : "public"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── stage 2: files ──────────────────────────────────────────────── */}
      {stage === "files" && (
        <section className="grid gap-5 lg:grid-cols-2">
          {/* code side */}
          <div className="glass rounded-3xl p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2.5 font-display text-base uppercase tracking-wide text-mist">
                <FileCode2 className="h-4.5 w-4.5 text-drift-ember" /> code side
              </h3>
              <button
                type="button"
                onClick={() => setShowAllCode((v) => !v)}
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fog transition-colors hover:text-drift-ember"
              >
                {showAllCode ? "curated" : "show all"}
              </button>
            </div>
            <p className="mt-1.5 font-mono text-[11px] text-fog/70">
              one source file — the AST the engine will trust
            </p>
            <ul className="scroll-thin mt-4 flex max-h-[300px] flex-col gap-1.5 overflow-y-auto pr-1">
              {treeLoading && (
                <li className="flex items-center gap-2.5 font-mono text-[12px] text-fog">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-drift-ember" /> reading
                  the tree…
                </li>
              )}
              {visibleCode.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => setCodePath(f.path)}
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left font-mono text-[12px] transition-colors ${
                      codePath === f.path
                        ? "border-drift-ember/50 bg-drift-ember/10 text-drift-ember"
                        : "border-transparent text-fog hover:border-line hover:bg-ink-800/60 hover:text-mist"
                    }`}
                  >
                    <span className="truncate">{f.path}</span>
                  </button>
                </li>
              ))}
              {!treeLoading && visibleCode.length === 0 && (
                <li className="font-mono text-[12px] text-fog">
                  no TS/JS/Python source files found in this tree.
                </li>
              )}
            </ul>
          </div>

          {/* docs side */}
          <div className="glass rounded-3xl p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2.5 font-display text-base uppercase tracking-wide text-mist">
                <BookOpenText className="h-4.5 w-4.5 text-drift-amber" /> docs side
              </h3>
              <input
                value={docQuery}
                onChange={(e) => setDocQuery(e.target.value)}
                placeholder="find .md…"
                className="w-36 rounded-lg border border-line bg-ink-900/70 px-3 py-1.5 font-mono text-[11.5px] text-mist outline-none placeholder:text-fog/40 focus:border-drift-amber/50"
              />
            </div>
            <p className="mt-1.5 font-mono text-[11px] text-fog/70">
              the markdown the engine keeps honest (≤ 6 files)
            </p>
            <ul className="scroll-thin mt-4 flex max-h-[300px] flex-col gap-1.5 overflow-y-auto pr-1">
              {filteredDocs.map((f) => {
                const checked = docPaths.includes(f.path);
                return (
                  <li key={f.path}>
                    <button
                      type="button"
                      onClick={() =>
                        setDocPaths((prev) =>
                          checked
                            ? prev.filter((p) => p !== f.path)
                            : prev.length >= 6
                              ? (toast.error("the engine compares at most 6 doc files"), prev)
                              : [...prev, f.path]
                        )
                      }
                      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left font-mono text-[12px] transition-colors ${
                        checked
                          ? "border-drift-amber/50 bg-drift-amber/10 text-mist"
                          : "border-transparent text-fog hover:border-line hover:bg-ink-800/60 hover:text-mist"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          checked ? "border-drift-amber bg-drift-amber/30" : "border-fog/40"
                        }`}
                      >
                        {checked && <CheckCircle2 className="h-3 w-3 text-drift-amber" />}
                      </span>
                      <span className="truncate">{f.path}</span>
                    </button>
                  </li>
                );
              })}
              {envExamplePath && !docQuery && (
                <li>
                  <button
                    type="button"
                    onClick={() =>
                      setDocPaths((prev) =>
                        prev.includes(envExamplePath)
                          ? prev.filter((p) => p !== envExamplePath)
                          : [...prev, envExamplePath]
                      )
                    }
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left font-mono text-[12px] transition-colors ${
                      docPaths.includes(envExamplePath)
                        ? "border-drift-mint/50 bg-drift-mint/10 text-mist"
                        : "border-transparent text-fog hover:border-line hover:bg-ink-800/60 hover:text-mist"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        docPaths.includes(envExamplePath)
                          ? "border-drift-mint bg-drift-mint/30"
                          : "border-fog/40"
                      }`}
                    >
                      {docPaths.includes(envExamplePath) && (
                        <CheckCircle2 className="h-3 w-3 text-drift-mint" />
                      )}
                    </span>
                    <span className="truncate">{envExamplePath}</span>
                    <span className="ml-auto shrink-0 font-mono text-[9.5px] uppercase tracking-[0.14em] text-drift-mint">
                      env keys
                    </span>
                  </button>
                </li>
              )}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
            <button
              type="button"
              onClick={() => setStage("repo")}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-ink-800/60 px-4 py-2.5 text-sm text-fog transition-colors hover:border-drift-ember/40 hover:text-mist"
            >
              <ArrowLeft className="h-4 w-4" /> change repo
            </button>
            <button
              type="button"
              onClick={runAnalysis}
              disabled={!codePath || docPaths.length === 0 || treeLoading}
              className="inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-drift-ember to-drift-amber px-6 py-3 text-sm font-semibold text-ink-950 shadow-[0_14px_38px_-12px_rgba(255,90,31,0.5)] transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            >
              <Play className="h-4.5 w-4.5" /> Run drift analysis
            </button>
            {treeTruncated && (
              <span className="font-mono text-[10.5px] text-[#f7d77f]">
                tree truncated at the engine limit — large paths may be missing
              </span>
            )}
          </div>
        </section>
      )}

      {/* ── stage 3: results ────────────────────────────────────────────── */}
      {stage === "results" && (
        <section className="flex flex-col gap-5">
          {runState === "running" && (
            <div className="glass rounded-3xl p-6">
              <h3 className="font-mono text-[12px] uppercase tracking-[0.22em] text-fog">
                agent crew working on <span className="text-mist">{repo?.fullName}</span> …
              </h3>
              <ul className="mt-4 flex flex-col gap-2 font-mono text-[12px]">
                {RUN_STEPS.map((s, i) => (
                  <li
                    key={s}
                    className={`flex items-center gap-2.5 transition-colors ${
                      i < runStep
                        ? "text-drift-mint"
                        : i === runStep
                          ? "text-mist"
                          : "text-fog/40"
                    }`}
                  >
                    {i < runStep ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : i === runStep ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-drift-ember" />
                    ) : (
                      <span className="h-3.5 w-3.5" />
                    )}
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {runState === "error" && (
            <div className="glass rounded-3xl p-6">
              <p className="font-mono text-[13px] text-[#ff8fa3]">
                the workflow hit a wall — check the file selection (max 6 docs, code
                must be TS/JS/Python) and try again.
              </p>
              <button
                type="button"
                onClick={() => setStage("files")}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-line bg-ink-800/60 px-4 py-2.5 text-sm text-mist transition-colors hover:border-drift-ember/40"
              >
                <ArrowLeft className="h-4 w-4" /> back to file selection
              </button>
            </div>
          )}

          {runState === "done" && result && repo && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-drift-ember/30 bg-drift-ember/10 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-drift-ember">
                  engine · {result.engine.engine}
                </span>
                <span className="rounded-full border border-line bg-ink-800/60 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-fog">
                  parser · {result.engine.parser}
                </span>
                <span className="rounded-full border border-line bg-ink-800/60 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-fog">
                  {result.totalMs} ms · {result.symbols.length} symbols ·{" "}
                  {result.docTargets.length} doc targets
                </span>
                <button
                  type="button"
                  onClick={() => setStage("files")}
                  className="ml-auto inline-flex items-center gap-2 rounded-xl border border-line bg-ink-800/60 px-4 py-2 text-sm text-fog transition-colors hover:border-drift-ember/40 hover:text-mist"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> re-run on other files
                </button>
              </div>

              <DriftList drifts={result.drifts} />
              <DiffView diff={result.patch.diff} />

              {/* PR card */}
              <div className="glass rounded-3xl p-6 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2.5 font-display text-lg uppercase tracking-wide text-mist">
                      <GitPullRequest className="h-5 w-5 text-drift-mint" />
                      suggested docs PR
                    </h3>
                    <p className="mt-1.5 font-mono text-[12.5px] text-fog">
                      {result.patch.prTitle}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-fog/70">
                      {result.patch.additions} additions · {result.patch.deletions} deletions
                      across {result.patch.filesChanged.length} file
                      {result.patch.filesChanged.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  {prUrl ? (
                    <a
                      href={prUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-2xl border border-drift-mint/50 bg-drift-mint/10 px-5 py-3 text-sm font-semibold text-drift-mint transition-transform hover:scale-[1.02]"
                    >
                      <ExternalLink className="h-4.5 w-4.5" /> view the pull request
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={createPr}
                      disabled={prBusy || result.patch.edits.length === 0}
                      className="inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-drift-mint to-drift-ember px-6 py-3 text-sm font-semibold text-ink-950 transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {prBusy ? (
                        <Loader2 className="h-4.5 w-4.5 animate-spin" />
                      ) : (
                        <GitPullRequest className="h-4.5 w-4.5" />
                      )}
                      {prBusy ? "opening the PR…" : "open docs PR on GitHub"}
                    </button>
                  )}
                </div>
                <p className="mt-4 font-mono text-[11px] leading-relaxed text-fog/70">
                  the PR is opened as <span className="text-mist">@{login}</span> from a
                  new <span className="text-mist">docdrift/docs-sync-…</span> branch —
                  nothing is merged automatically; you review, you merge.
                </p>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
