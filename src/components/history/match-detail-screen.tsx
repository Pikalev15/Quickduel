"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getGame } from "@/games/registry";
import { track } from "@/lib/analytics";
import { ProductHeader } from "@/components/ui/product-header";

type MatchDetail = {
  id: string;
  game_type: Parameters<typeof getGame>[0];
  game_version: number;
  ranked: boolean;
  is_draw: boolean;
  starts_at: string;
  completed_at: string;
  source: "public_queue" | "private_duel";
  series_round: number | null;
  challenge: Record<string, unknown>;
  players: Array<{
    display_name: string;
    is_winner: boolean;
    submission: Record<string, unknown>;
    result: {
      summary: string;
      accuracy: number;
      details: Record<string, unknown>;
    };
    completion_time_ms: number;
    rating_before: number;
    rating_after: number;
    rating_delta: number;
  }>;
};

export function MatchDetailScreen({ matchId }: { matchId: string }) {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    void fetch(`/api/history/${matchId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "Could not load match.");
        setDetail(body.data);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load match."));
  }, [matchId]);

  async function share() {
    setSharing(true);
    try {
      const response = await fetch(`/api/matches/${matchId}/share`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not prepare share card.");
      const url = `${location.origin}/share/${body.data.code}`;
      track("share_clicked", { matchId });
      if (navigator.share) await navigator.share({ title: "QuickDuel result", url });
      else await navigator.clipboard.writeText(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not share match.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <main className="min-h-screen">
      <ProductHeader current="history" />
      <section className="page-shell feature-shell">
        <Link className="back-link" href="/history">← Match history</Link>
        {error && !detail ? (
          <div className="empty-state"><h1>Match unavailable</h1><p className="inline-error">{error}</p></div>
        ) : !detail ? (
          <p className="empty-state">Loading completed match…</p>
        ) : (
          <>
            <div className="feature-heading feature-heading-row">
              <div>
                <p className="calm-eyebrow">{detail.ranked ? "Ranked duel" : "Unranked duel"}</p>
                <h1>{getGame(detail.game_type).name}</h1>
                <p>
                  {detail.source === "private_duel" ? `Private series${detail.series_round ? ` · Round ${detail.series_round}` : ""}` : "Public queue"}
                  {" · "}
                  {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(detail.completed_at))}
                </p>
              </div>
              <button className="calm-secondary" type="button" disabled={sharing} onClick={() => void share()}>
                {sharing ? "Preparing…" : "Share result"}
              </button>
            </div>
            {error && <p className="inline-error">{error}</p>}
            <div className="match-detail-players">
              {detail.players.map((player, index) => (
                <article className={player.is_winner ? "winner" : ""} key={`${player.display_name}-${index}`}>
                  <span>{player.is_winner ? "Winner" : detail.is_draw ? "Draw" : "Duelist"}</span>
                  <h2>{player.display_name}</h2>
                  <strong>{player.result.summary}</strong>
                  <p>{(player.completion_time_ms / 1_000).toFixed(2)} seconds</p>
                  <p>{detail.ranked ? `${player.rating_before} → ${player.rating_after} (${player.rating_delta >= 0 ? "+" : ""}${player.rating_delta})` : "Rating unchanged"}</p>
                </article>
              ))}
            </div>
            <details className="match-payload">
              <summary>Validated round detail</summary>
              <div>
                <section><h2>Final challenge</h2><pre>{JSON.stringify(detail.challenge, null, 2)}</pre></section>
                {detail.players.map((player, index) => (
                  <section key={`${player.display_name}-${index}`}><h2>{player.display_name}</h2><h3>Submission</h3><pre>{JSON.stringify(player.submission, null, 2)}</pre><h3>Calculated result</h3><pre>{JSON.stringify(player.result, null, 2)}</pre></section>
                ))}
              </div>
            </details>
            <div className="feature-actions">
              <Link className="calm-primary" href="/duel/new">New private duel</Link>
              <Link className="calm-secondary" href="/play">Find an opponent</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
