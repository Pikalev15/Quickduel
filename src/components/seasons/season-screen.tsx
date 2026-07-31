"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { getDivision } from "@/lib/divisions";
import { ProductHeader } from "@/components/ui/product-header";

type Season = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "upcoming" | "active" | "archived";
  player: {
    rank: number;
    points: number;
    wins: number;
    losses: number;
    draws: number;
    matches_counted: number;
  } | null;
  leaderboard: Array<{
    rank: number;
    display_name: string;
    public_code: string;
    rating: number;
    points: number;
    wins: number;
    losses: number;
    draws: number;
    matches_counted: number;
  }>;
};

function remaining(end: string) {
  const seconds = Math.max(0, Math.floor((Date.parse(end) - Date.now()) / 1_000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  return `${days}d ${hours}h`;
}

export function SeasonScreen({ seasonId }: { seasonId?: string }) {
  const [season, setSeason] = useState<Season | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(seasonId ? `/api/seasons/${seasonId}` : "/api/seasons", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "Could not load season.");
        setSeason(body.data);
        track("season_viewed", { properties: { seasonId: body.data.id } });
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load season."));
  }, [seasonId]);

  return (
    <main className="min-h-screen">
      <ProductHeader current="leaderboard" />
      <section className="page-shell feature-shell">
        {!season ? (
          <div className="empty-state"><h1>{error ? "Season unavailable" : "Loading weekly season…"}</h1>{error && <p className="inline-error">{error}</p>}</div>
        ) : (
          <>
            <div className="feature-heading feature-heading-row">
              <div>
                <p className="calm-eyebrow">{season.status === "active" ? "Current weekly season" : "Season archive"}</p>
                <h1>{season.id}</h1>
                <p>Weekly Points reset every Monday at 00:00 UTC. Permanent Elo never resets.</p>
              </div>
              <div className="season-clock"><small>{season.status === "active" ? "Time remaining" : "Final standings"}</small><strong>{season.status === "active" ? remaining(season.ends_at) : "Archived"}</strong></div>
            </div>

            {season.player ? (
              <dl className="season-player">
                <div><dt>Your weekly rank</dt><dd>#{season.player.rank}</dd></div>
                <div><dt>Points</dt><dd>{season.player.points}</dd></div>
                <div><dt>Wins</dt><dd>{season.player.wins}</dd></div>
                <div><dt>Matches counted</dt><dd>{season.player.matches_counted}</dd></div>
              </dl>
            ) : (
              <div className="empty-state season-empty"><h2>No weekly ranking yet.</h2><p>Complete a ranked game to join this week’s board.</p></div>
            )}

            <section className="season-board">
              <div className="feature-section-heading"><div><h2>Top players</h2><p>Win 3 points · Draw 1 · Loss 0. At most three ranked matches per opponent pair count each UTC day.</p></div></div>
              <ol>
                {season.leaderboard.map((player) => {
                  const division = getDivision(player.rating);
                  return (
                    <li key={player.public_code}>
                      <span className="board-rank">{player.rank}</span>
                      <span className={`division-mark division-${division.id}`}>{division.mark}</span>
                      <span className="board-player"><b>{player.display_name}#{player.public_code}</b><small>{division.name} · {player.rating} Elo</small></span>
                      <span className="board-record">{player.wins}W · {player.losses}L · {player.draws}D</span>
                      <strong>{player.points} pts</strong>
                    </li>
                  );
                })}
              </ol>
              {season.leaderboard.length === 0 && <p className="empty-state">No ranked matches have counted this week.</p>}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
