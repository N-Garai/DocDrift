"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Play,
  RotateCcw,
  Sparkles,
  Cpu,
  FileWarning,
  Pencil,
} from "lucide-react";
import { SectionHeading } from "@/components/fx/SectionHeading";
import { Reveal } from "@/components/fx/Reveal";
import { CodePane } from "./CodePane";
import { AgentStepper } from "./AgentStepper";
import { DriftList } from "./DriftList";
import { DiffView } from "./DiffView";
import {
  analyze,
  fetchScenarios,
  type AnalyzeResult,
  type AnalyzeRequest,
  type ScenarioMeta,
} from "@/lib/api";

type Phase = "idle" | "running" | "done" | "error";

const CUSTOM_SAMPLE = {
  typescript: {
    code: `export const DEFAULT_PORT = 8080;

export interface Config {
  port: number;
  enableCache: boolean;
  logLevel: "debug" | "info" | "error";
}

export const defaultConfig: Config = {
  port: DEFAULT_PORT,
  enableCache: true,
  logLevel: "info",
};

export function loadConfig(env = process.env): Config {
  return { ...defaultConfig, port: Number(env.PORT ?? DEFAULT_PORT) };
}
`,
    docs: `# Setup

## Configuration

| Option | Default | Description |
| ------ | ------- | ----------- |
| PORT | 3000 | HTTP server port |
| LOG_LEVEL | debug | Verbosity of the logger |

Create a config with \`loadConfig()\`.
`,
    env: `PORT=3000
LOG_LEVEL=debug
`,
  },
  python: {
    code: `from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    port: int = 8080
    cache_dir: str = "/var/cache/docdrift"
    enable_telemetry: bool = False

def load_settings(env_file: str = ".env") -> Settings:
    return Settings(_env_file=env_file)
`,
    docs: `# Configuration

| Setting | Default | Description |
| ------- | ------- | ----------- |
| port | 3000 | HTTP server port |
| cache_dir | /tmp/cache | Where cached artifacts go |
| enable_telemetry | True | Anonymous usage reporting |

Load settings with \`load_settings()\`.
`,
    env: `PORT=3000
`,
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function DemoSection() {
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [customLang, setCustomLang] = useState<"typescript" | "python">("typescript");
  const [customCode, setCustomCode] = useState(CUSTOM_SAMPLE.typescript.code);
  const [customDocs, setCustomDocs] = useState(CUSTOM_SAMPLE.typescript.docs);
  const [customEnv, setCustomEnv] = useState(CUSTOM_SAMPLE.typescript.env);

  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [visibleSteps, setVisibleSteps] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchScenarios()
      .then((s) => {
        if (!alive) return;
        setScenarios(s);
        if (s.length > 0) setSelected(s[0].id);
      })
      .catch(() => alive && toast.error("Engine unreachable — is the backend running?"));
    return () => {
      alive = false;
      cancelled.current = true;
    };
  }, []);

  const scenario = scenarios.find((s) => s.id === selected) ?? null;
  const codeFile =
    scenario?.files.find((f) => !f.stale) ?? null;
  const docFiles = scenario?.files.filter((f) => f.stale) ?? [];

  const run = async () => {
    if (phase === "running") return;
    cancelled.current = false;
    setPhase("running");
    setResult(null);
    setVisibleSteps(0);

    let req: AnalyzeRequest;
    if (scenario) {
      req = { mode: "scenario", scenarioId: scenario.id };
    } else {
      req = {
        mode: "custom",
        language: customLang,
        custom: {
          codeFile: { path: customLang === "python" ? "settings.py" : "config.ts", content: customCode },
          docs: [{ path: customLang === "python" ? "docs/configuration.md" : "docs/setup.md", content: customDocs }],
          envExample: customEnv.trim()
            ? { path: ".env.example", content: customEnv }
            : undefined,
        },
      };
    }

    try {
      const res = await analyze(req);
      if (cancelled.current) return;
      setResult(res);
      // replay the real step trace with honest timings
      for (let i = 0; i < res.steps.length; i++) {
        if (cancelled.current) return;
        await sleep(Math.max(280, Math.min(res.steps[i].ms + 180, 520)));
        setVisibleSteps(i + 1);
      }
      setPhase("done");
      const critical = res.drifts.filter((d) => d.severity === "critical").length;
      if (res.drifts.length > 0) {
        toast.success(
          `${res.drifts.length} drift${res.drifts.length > 1 ? "s" : ""} found${critical ? ` (${critical} critical)` : ""} · patch drafted`,
        );
      } else {
        toast.success("No drift detected — docs are in sync");
      }
    } catch (e) {
      if (cancelled.current) return;
      setPhase("error");
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    }
  };

  const reset = () => {
    cancelled.current = true;
    setPhase("idle");
    setResult(null);
    setVisibleSteps(0);
  };

  const codeHighlights = (result?.drifts ?? [])
    .filter((d) => d.codeEvidence.file === codeFile?.path)
    .map((d) => d.codeEvidence.line);

  function docHighlights(path: string) {
    return (result?.drifts ?? [])
      .filter((d) => d.docEvidence?.file === path)
      .map((d) => d.docEvidence!.line);
  }

  function langOf(path: string): "typescript" | "python" | "md" | "env" {
    if (path.endsWith(".py")) return "python";
    if (path.endsWith(".ts") || path.endsWith(".tsx") || path.endsWith(".js")) return "typescript";
    if (path.includes(".env")) return "env";
    return "md";
  }

  return (
    <section id="demo" className="relative z-10 scroll-mt-24 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="live demo"
          title="Watch the crew catch the drift."
          accentWord="catch"
          description="Real engine, real workflow — this runs the actual Mastra pipeline against fixtures (or your own paste). Pick a scenario, run it, copy the patch."
        />

        {/* scenario tabs */}
        <Reveal variant="up" className="mt-12">
          <div
            role="tablist"
            aria-label="Demo scenarios"
            className="flex flex-wrap gap-2.5"
          >
            {scenarios.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={selected === s.id}
                onClick={() => {
                  setSelected(s.id);
                  reset();
                }}
                className={`rounded-2xl border px-4.5 px-5 py-3 text-left transition-all ${
                  selected === s.id
                    ? "border-drift-ember/50 bg-drift-ember/[0.08]"
                    : "border-line bg-ink-800/50 hover:border-drift-ember/30"
                }`}
              >
                <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-fog/70">
                  {s.language}
                </span>
                <span
                  className={`mt-0.5 block text-[14px] font-semibold ${
                    selected === s.id ? "text-mist" : "text-fog"
                  }`}
                >
                  {s.title}
                </span>
              </button>
            ))}
            <button
              role="tab"
              aria-selected={selected === "custom"}
              onClick={() => {
                setSelected("custom");
                reset();
              }}
              className={`rounded-2xl border px-5 py-3 text-left transition-all ${
                selected === "custom"
                  ? "border-drift-amber/50 bg-drift-amber/[0.08]"
                  : "border-line bg-ink-800/50 hover:border-drift-amber/30"
              }`}
            >
              <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-fog/70">
                your own code
              </span>
              <span
                className={`mt-0.5 flex items-center gap-1.5 text-[14px] font-semibold ${
                  selected === "custom" ? "text-mist" : "text-fog"
                }`}
              >
                <Pencil className="h-3.5 w-3.5" /> Custom paste
              </span>
            </button>
          </div>
        </Reveal>

        <div className="mt-8 grid gap-6 lg:grid-cols-12">
          {/* inputs */}
          <div className="flex min-w-0 flex-col gap-5 lg:col-span-5">
            <Reveal variant="left" amount={0.15}>
              {scenario ? (
                <div className="flex flex-col gap-5">
                  <CodePane
                    path={codeFile?.path ?? ""}
                    label="changed code"
                    content={codeFile?.content ?? ""}
                    lang={langOf(codeFile?.path ?? "")}
                    highlightLines={codeHighlights}
                    tone="code"
                  />
                  {docFiles.map((f) => (
                    <CodePane
                      key={f.path}
                      path={f.path}
                      label="stale docs"
                      content={f.content}
                      lang={langOf(f.path)}
                      highlightLines={docHighlights(f.path)}
                      tone="docs"
                      maxHeight={300}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2.5">
                    {(["typescript", "python"] as const).map((l) => (
                      <button
                        key={l}
                        onClick={() => {
                          setCustomLang(l);
                          setCustomCode(CUSTOM_SAMPLE[l].code);
                          setCustomDocs(CUSTOM_SAMPLE[l].docs);
                          setCustomEnv(CUSTOM_SAMPLE[l].env);
                        }}
                        className={`rounded-xl border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
                          customLang === l
                            ? "border-drift-amber/50 text-mist"
                            : "border-line text-fog hover:text-mist"
                        }`}
                      >
                        {l === "typescript" ? "typescript" : "python"}
                      </button>
                    ))}
                    <span className="ml-auto font-mono text-[10.5px] text-fog/60">
                      parsed text-only — never executed
                    </span>
                  </div>
                  <TextareaCard
                    title="changed code"
                    path={customLang === "python" ? "settings.py" : "config.ts"}
                    value={customCode}
                    onChange={setCustomCode}
                    rows={12}
                  />
                  <TextareaCard
                    title="docs (markdown)"
                    path={customLang === "python" ? "docs/configuration.md" : "docs/setup.md"}
                    value={customDocs}
                    onChange={setCustomDocs}
                    rows={9}
                  />
                  <TextareaCard
                    title=".env.example (optional)"
                    path=".env.example"
                    value={customEnv}
                    onChange={setCustomEnv}
                    rows={4}
                  />
                </div>
              )}
            </Reveal>
          </div>

          {/* engine panel */}
          <div className="flex min-w-0 flex-col gap-5 lg:col-span-7">
            <Reveal variant="right" amount={0.15}>
              <div className="glass rounded-3xl p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-drift-mint/30 bg-drift-mint/10">
                      <Cpu className="h-5 w-5 text-drift-mint" />
                    </span>
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fog">
                        doc-drift workflow
                      </p>
                      <p className="text-[13px] text-mist">
                        {phase === "done" && result
                          ? `${result.engine.engine} · parser: ${result.engine.parser}`
                          : "deterministic engine · tree-sitter when available"}
                      </p>
                    </div>
                  </div>

                  {phase === "running" ? (
                    <button
                      disabled
                      className="flex items-center gap-2 rounded-2xl border border-line px-6 py-3.5 font-mono text-[12px] uppercase tracking-[0.16em] text-fog/60"
                    >
                      <RotateCcw className="h-4 w-4 animate-spin" />
                      running
                    </button>
                  ) : phase === "done" ? (
                    <button
                      onClick={reset}
                      className="flex items-center gap-2 rounded-2xl border border-line px-6 py-3.5 font-mono text-[12px] uppercase tracking-[0.16em] text-mist transition-colors hover:border-drift-ember/40"
                    >
                      <RotateCcw className="h-4 w-4" />
                      reset
                    </button>
                  ) : (
                    <button
                      onClick={run}
                      className="group flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-drift-ember to-drift-amber px-7 py-3.5 text-[14px] font-semibold text-ink-950 shadow-[0_14px_36px_-12px_rgba(255,90,31,0.5)] transition-transform hover:scale-[1.03]"
                    >
                      <Play className="h-4.5 h-5 w-5 transition-transform group-hover:scale-110" />
                      Run drift analysis
                    </button>
                  )}
                </div>

                <div className="mt-6">
                  {phase === "idle" && (
                    <IdleHint />
                  )}
                  {(phase === "running" || phase === "done") && (
                    <AgentStepper
                      steps={result?.steps ?? PLACEHOLDER_STEPS}
                      visibleCount={visibleSteps}
                      running={phase === "running"}
                    />
                  )}
                  {phase === "error" && (
                    <div className="flex items-center gap-3 rounded-xl border border-[#ff5470]/30 bg-[#ff5470]/[0.06] px-4 py-3.5 text-[13.5px] text-[#ff8fa3]">
                      <FileWarning className="h-5 w-5 shrink-0" />
                      The engine could not complete the run. Check the backend
                      logs and try again.
                    </div>
                  )}
                </div>
              </div>
            </Reveal>

            <AnimatePresence>
              {phase === "done" && result && (
                <>
                  <motion.div
                    key="summary"
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-wrap items-center gap-2.5 px-1"
                  >
                    <Chip
                      label={`${result.symbols.length} symbols extracted`}
                      cls="border-drift-ember/30 text-drift-ember"
                    />
                    <Chip
                      label={`${result.docTargets.length} doc targets`}
                      cls="border-drift-amber/30 text-drift-amber"
                    />
                    <Chip
                      label={`${result.drifts.length} drifts`}
                      cls="border-[#ff8fa3]/40 text-[#ff8fa3]"
                    />
                    <Chip
                      label={`gate 1: ${result.validations.codeGrounding.checked} checked · ${result.validations.codeGrounding.dropped} dropped`}
                      cls="border-drift-mint/30 text-drift-mint"
                    />
                    <Chip
                      label={`gate 2: ${result.validations.docsApply.applied} applied`}
                      cls="border-drift-mint/30 text-drift-mint"
                    />
                    <Chip
                      label={`${result.totalMs}ms total`}
                      cls="border-line text-fog"
                    />
                  </motion.div>

                  <motion.div
                    key="drifts"
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <PanelTitle title="findings" />
                    <DriftList drifts={result.drifts} />
                  </motion.div>

                  <motion.div
                    key="patch"
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-4"
                  >
                    <PanelTitle
                      title="patch"
                      note={`${result.patch.filesChanged.join(", ")} · +${result.patch.additions} −${result.patch.deletions}`}
                    />
                    <DiffView diff={result.patch.diff} />

                    <div className="glass rounded-2xl p-5">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fog">
                          drafted pull request
                        </p>
                        <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-drift-mint">
                          <Sparkles className="h-3.5 w-3.5" />
                          tone pass: {result.validations.tonePass.engine}
                        </span>
                      </div>
                      <p className="mt-3 font-mono text-[13px] text-mist">
                        {result.patch.prTitle}
                      </p>
                      <pre className="scroll-thin mt-3 max-h-52 overflow-auto whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-fog">
                        {result.patch.prBody}
                      </pre>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

const PLACEHOLDER_STEPS = [
  { id: "intake", label: "intake", agent: "git", status: "ok" as const, ms: 0, notes: "" },
  { id: "extract", label: "extract", agent: "tree-sitter", status: "ok" as const, ms: 0, notes: "" },
  { id: "docs", label: "docs scan", agent: "docs agent", status: "ok" as const, ms: 0, notes: "" },
];

function IdleHint() {
  return (
    <div className="rounded-xl border border-dashed border-line px-5 py-6 text-center">
      <p className="text-[13.5px] leading-relaxed text-fog">
        Pick a scenario and hit{" "}
        <span className="text-mist">Run drift analysis</span>. The stepper shows
        the live step trace; findings and the patch appear as the validators
        clear them.
      </p>
      <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.2em] text-fog/50">
        nothing leaves this machine — text is parsed, never executed
      </p>
    </div>
  );
}

function Chip({ label, cls }: { label: string; cls: string }) {
  return (
    <span
      className={`rounded-full border bg-ink-900/60 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] ${cls}`}
    >
      {label}
    </span>
  );
}

function PanelTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between px-1">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-fog">
        {title}
      </p>
      {note && <p className="font-mono text-[10.5px] text-fog/60">{note}</p>}
    </div>
  );
}

function TextareaCard({
  title,
  path,
  value,
  onChange,
  rows,
}: {
  title: string;
  path: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
}) {
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="font-mono text-[11px] text-fog">{path}</span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-drift-ember">
          {title}
        </span>
      </div>
      <textarea
        value={value}
        rows={rows}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className="scroll-thin w-full resize-y bg-transparent px-4 py-3 font-mono text-[12px] leading-relaxed text-fog outline-none focus:text-mist"
        aria-label={title}
      />
    </div>
  );
}
