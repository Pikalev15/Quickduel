"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ProductHeader } from "@/components/ui/product-header";

export function OnboardingScreen() {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ensureSession() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw new Error("Starter games need Supabase configuration.");
    if (!(await supabase.auth.getUser()).data.user) {
      const { error: authError } = await supabase.auth.signInAnonymously();
      if (authError) throw authError;
      track("anonymous_auth_created");
    }
    const { error: profileError } = await supabase.rpc("ensure_profile");
    if (profileError) throw profileError;
  }

  async function start() {
    setActing(true);
    try {
      await ensureSession();
      localStorage.removeItem("quickduel:onboarding-results");
      track("onboarding_started");
      router.push("/match/practice?game=memory_grid&seed=starter-1&onboarding=1");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start.");
      setActing(false);
    }
  }

  async function skip() {
    setActing(true);
    try {
      await ensureSession();
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completed: true,
          skipped: true,
          recommendation: null,
        }),
      });
      track("onboarding_completed", { properties: { skipped: true } });
      router.push("/play");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not skip.");
      setActing(false);
    }
  }

  return (
    <main className="min-h-screen">
      <ProductHeader current="play" />
      <section className="page-shell onboarding-shell">
        <div className="feature-heading">
          <p className="calm-eyebrow">Three short starter games</p>
          <h1>Learn by playing.</h1>
          <p>A quick unranked sampler explains the rules and suggests a playlist based only on these game results.</p>
        </div>
        <ol className="onboarding-rules">
          <li><span>01</span><div><h2>Accuracy comes first.</h2><p>The better validated answer wins the round.</p></div></li>
          <li><span>02</span><div><h2>Speed breaks ties.</h2><p>Server-measured time matters only when results are effectively equal.</p></div></li>
          <li><span>03</span><div><h2>Ranked games change Elo.</h2><p>This starter sequence is Practice Bot play and never changes your rating.</p></div></li>
        </ol>
        <div className="starter-sequence">
          <span>Memory Grid</span><i>→</i><span>Frequency Recall</span><i>→</i><span>Number Order</span>
        </div>
        {error && <p className="inline-error">{error}</p>}
        <div className="feature-actions">
          <button className="calm-primary" type="button" disabled={acting} onClick={() => void start()}>{acting ? "Starting…" : "Play starter sequence"}</button>
          <button className="calm-secondary" type="button" disabled={acting} onClick={() => void skip()}>Skip to Quick Play</button>
        </div>
      </section>
    </main>
  );
}
