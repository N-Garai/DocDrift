"use client";

import { useState } from "react";
import { History, X, Clock } from "lucide-react";
import { type Me } from "@/lib/github";

interface DriftRunListItem {
  id: string;
  repo: string;
  branch: string;
  codeFile: string;
  language: string;
  driftCount: number;
  createdAt: string;
}

export function HistoryButton({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<DriftRunListItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadHistory() {
    setLoading(true);
    try {
      const res = await fetch("/api/history", {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = (await res.json()) as { runs: DriftRunListItem[] };
        setRuns(data.runs);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (open === false) loadHistory();
        }}
        className="ml-2 rounded-xl border border-line bg-ink-800/60 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-fog transition-colors hover:border-drift-ember/40 hover:text-mist"
        aria-label="View drift history"
      >
        <History className="h-4 w-4" /> history
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="glass w-full max-w-2xl rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base uppercase tracking-wide text-mist">
                <Clock className="h-4 w-4" /> drift history
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-line px-2 py-1.5 text-fog hover:text-mist"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8 font-mono text-[12px] text-fog">
                loading…
              </div>
            ) : runs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="font-mono text-[12px] text-fog/60">
                  no drift runs yet — run an analysis and it will appear here.
                </p>
              </div>
            ) : (
              <ul className="scroll-thin max-h-[500px] overflow-y-auto space-y-2">
                {runs.map((r) => (
                  <li key={r.id} className="rounded-xl border border-line bg-ink-900/60 p-3 hover:bg-ink-800/80 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[11.5px] text-mist truncate">
                        {r.repo}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fog/60">
                        {new Date(r.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-drift-amber">
                        {r.language}
                      </span>
                      <span className="font-mono text-[10px] text-fog">·</span>
                      <span className="font-mono text-[10px] text-fog/60">{r.branch}</span>
                      <span className="ml-auto font-mono text-[11px] text-mist">
                        {r.driftCount} drift{r.driftCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="font-mono text-[10px] text-fog/50 truncate">
                      {r.codeFile}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
