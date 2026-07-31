"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getGame } from "@/games/registry";
import { track } from "@/lib/analytics";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PrivateDuelSnapshot } from "@/types/database";
import { ProductHeader } from "@/components/ui/product-header";

async function duelRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Duel request failed.");
  return body.data as T;
}

export function DuelLobbyScreen({ code }: { code: string }) {
  const router = useRouter();
  const [duel, setDuel] = useState<PrivateDuelSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    try {
      const next = await duelRequest<PrivateDuelSnapshot>(`/api/duels/${code}`);
      setDuel(next);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load duel.");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    const initial = window.setTimeout(() => void reload(), 0);
    const poll = window.setInterval(() => void reload(), 1_500);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(poll);
    };
  }, [reload]);

  useEffect(() => {
    if (
      duel?.state === "active" &&
      duel.current_match_id &&
      duel.viewer_role !== "visitor"
    ) {
      router.replace(`/match/${duel.current_match_id}`);
    }
  }, [duel, router]);

  async function join() {
    setActing(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Joining needs Supabase configuration.");
      if (!(await supabase.auth.getUser()).data.user) {
        const { error: authError } = await supabase.auth.signInAnonymously();
        if (authError) throw authError;
      }
      const { error: profileError } = await supabase.rpc("ensure_profile");
      if (profileError) throw profileError;
      const result = await duelRequest<{ match_id: string }>(`/api/duels/${code}`, {
        method: "POST",
      });
      track("private_duel_joined", {
        gameType: duel?.game_type ?? null,
        playlist: duel?.playlist ?? null,
        properties: { bestOf: duel?.best_of ?? 1, ranked: duel?.ranked ?? false },
      });
      router.replace(`/match/${result.match_id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join duel.");
      setActing(false);
    }
  }

  async function share() {
    const url = location.href;
    if (navigator.share) {
      await navigator.share({ title: "QuickDuel private duel", text: `Join my QuickDuel ${duel?.best_of === 1 ? "match" : `best-of-${duel?.best_of} series`}.`, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  async function leave() {
    setActing(true);
    try {
      await duelRequest(`/api/duels/${code}`, { method: "DELETE" });
      router.push("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not leave duel.");
      setActing(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen"><ProductHeader current="play" /><section className="page-shell feature-shell"><p>Loading private duel…</p></section></main>;
  }

  if (!duel) {
    return <main className="min-h-screen"><ProductHeader current="play" /><section className="page-shell feature-shell"><h1>Duel unavailable</h1><p className="inline-error">{error}</p></section></main>;
  }

  const gameName = duel.game_type ? getGame(duel.game_type).name : `${duel.playlist[0].toUpperCase()}${duel.playlist.slice(1)} playlist`;
  return (
    <main className="min-h-screen">
      <ProductHeader current="play" />
      <section className="page-shell duel-lobby">
        <Link className="back-link" href="/">← Back to homepage</Link>
        <div className="duel-lobby-grid">
          <div>
            <p className="calm-eyebrow">Private duel</p>
            <h1>{duel.state === "waiting" ? "Waiting for opponent" : duel.state === "completed" ? "Series complete" : "Preparing the next round"}</h1>
            <p className="feature-lede">
              {duel.state === "waiting"
                ? "Invite one player using your private link or code."
                : "Every completed round is preserved in both players’ history."}
            </p>
            <dl className="duel-facts">
              <div><dt>Game</dt><dd>{gameName}</dd></div>
              <div><dt>Format</dt><dd>{duel.best_of === 1 ? "Single game" : `Best of ${duel.best_of}`}</dd></div>
              <div><dt>Mode</dt><dd>{duel.ranked ? "Ranked" : "Unranked"}</dd></div>
              <div><dt>Duel code</dt><dd>{duel.code}</dd></div>
            </dl>
            {error && <p className="inline-error" role="alert">{error}</p>}
            <div className="feature-actions">
              {duel.viewer_role === "visitor" && duel.state === "waiting" && (
                <button className="calm-primary" type="button" disabled={acting} onClick={() => void join()}>
                  {acting ? "Joining…" : "Join duel"}
                </button>
              )}
              <button className="calm-primary" type="button" onClick={() => void share()}>
                {copied ? "Link copied" : "Copy or share link"}
              </button>
              {duel.viewer_role !== "visitor" && !["completed", "expired", "cancelled"].includes(duel.state) && (
                <button className="danger-link" type="button" disabled={acting} onClick={() => void leave()}>
                  Leave duel
                </button>
              )}
            </div>
          </div>

          <div className="duel-score" aria-label={`${duel.host_name} ${duel.host_score}, ${duel.guest_name ?? "Guest"} ${duel.guest_score}`}>
            <div><b>{duel.host_name}</b><small>Host</small></div>
            <strong>{duel.host_score} <span>–</span> {duel.guest_score}</strong>
            <div><b>{duel.guest_name ?? "Guest"}</b><small>{duel.guest_name ? "Joined" : "Waiting"}</small></div>
          </div>
        </div>

        <section className="series-progress">
          <div className="feature-section-heading">
            <div><h2>Series progression</h2><p>First to {Math.ceil(duel.best_of / 2)} round{duel.best_of === 1 ? "" : "s"} wins.</p></div>
          </div>
          <ol>
            {Array.from({ length: duel.best_of }, (_, index) => {
              const round = duel.rounds.find((item) => item.round === index + 1);
              return (
                <li key={index}>
                  <span>Round {index + 1}</span>
                  <b>{round ? `${getGame(round.game_type).shortName} · ${round.winner}` : "—"}</b>
                </li>
              );
            })}
          </ol>
          <p>Each round uses a fresh challenge.</p>
        </section>
      </section>
    </main>
  );
}
