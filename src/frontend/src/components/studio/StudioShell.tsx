"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { fetchMe, logout, ApiError, type Me } from "@/lib/github";
import { AuthGate } from "./AuthGate";
import { Workspace } from "./Workspace";

/**
 * Studio orchestration: probe the session, route to the auth gate or the
 * workspace. Reads ?welcome=1 set by the OAuth callback for a greeting toast.
 */
export function StudioShell() {
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const params = useSearchParams();

  useEffect(() => {
    let alive = true;
    fetchMe()
      .then((m) => {
        if (!alive) return;
        setMe(m);
        if (m.authenticated && params.get("welcome") === "1") {
          toast.success(`signed in as @${m.user?.login} — welcome to the Studio`);
          window.history.replaceState(null, "", "/studio");
        }
      })
      .catch((e) => alive && setFailed(e instanceof ApiError ? e.message : "session probe failed"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    try {
      await logout();
      setMe({ authenticated: false, oauthConfigured: me?.oauthConfigured ?? false, user: null });
      toast.success("signed out — the session cookie is gone");
    } catch {
      toast.error("sign-out failed");
    }
  }

  if (failed) {
    return (
      <div className="glass mx-auto max-w-xl rounded-3xl p-8 text-center">
        <p className="font-mono text-[13px] text-[#ff8fa3]">
          could not reach the engine: {failed}
        </p>
        <p className="mt-3 font-mono text-[12px] text-fog">
          is the DocDrift backend running? (dev: port 3001 · docker: same origin)
        </p>
      </div>
    );
  }

  if (me === null) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 font-mono text-[13px] text-fog">
        <Loader2 className="h-4 w-4 animate-spin text-drift-ember" /> probing session…
      </div>
    );
  }

  if (!me.authenticated) {
    return <AuthGate oauthConfigured={me.oauthConfigured} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={me.user!.avatarUrl}
            alt={`@${me.user!.login} avatar`}
            className="h-10 w-10 rounded-xl border border-line"
          />
          <div>
            <p className="font-mono text-[13px] text-mist">
              {me.user!.name ?? me.user!.login}
            </p>
            <p className="font-mono text-[11px] text-fog/70">
              @{me.user!.login} · scopes: {me.user!.scopes.join(", ") || "repo"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="rounded-xl border border-line bg-ink-800/60 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-fog transition-colors hover:border-[#ff5470]/40 hover:text-[#ff8fa3]"
        >
          sign out
        </button>
      </div>

      <Workspace login={me.user!.login} />
    </div>
  );
}
