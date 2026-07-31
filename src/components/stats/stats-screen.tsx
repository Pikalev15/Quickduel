"use client";

import { useEffect, useMemo, useState } from "react";
import { gameCatalog } from "@/games/catalog";
import type { GameId } from "@/games/types";
import { track } from "@/lib/analytics";
import { getDivision } from "@/lib/divisions";
import { formatAverageResult, GAME_STAT_LABELS } from "@/lib/game-statistics";
import type { PublicProfile } from "@/types/database";
import { ProductHeader } from "@/components/ui/product-header";

type Stats = PublicProfile & {
  recent_form: Array<"win" | "loss" | "draw">;
  overall?: {
    total_matches: number;
    wins: number;
    losses: number;
    draws: number;
  };
};

export function StatsScreen() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/stats", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "Could not load statistics.");
        setStats(body.data);
        track("stats_viewed");
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load statistics."));
  }, []);

  const playedGames = useMemo(
    () =>
      stats
        ? gameCatalog
            .map((game) => ({ game, stats: stats.game_stats?.[game.id] }))
            .filter((entry) => entry.stats?.played)
            .sort((a, b) => (b.stats?.played ?? 0) - (a.stats?.played ?? 0))
        : [],
    [stats],
  );

  if (!stats) {
    return <main className="min-h-screen"><ProductHeader current="profile" /><section className="page-shell feature-shell"><div className="empty-state"><h1>{error ? "Statistics unavailable" : "Loading statistics…"}</h1>{error && <p className="inline-error">{error}</p>}</div></section></main>;
  }

  const division = getDivision(stats.rating);
  const highestDivision = getDivision(stats.highest_rating ?? stats.rating);
  const overall = stats.overall ?? {
    total_matches: stats.matches_played,
    wins: stats.wins,
    losses: stats.losses,
    draws: stats.draws,
  };
  const winRate = overall.total_matches ? overall.wins / overall.total_matches : 0;
  const mostPlayed = playedGames[0]?.game.name ?? "—";
  const bestGame = [...playedGames]
    .sort((a, b) => {
      const aRate = (a.stats?.wins ?? 0) / Math.max(1, a.stats?.played ?? 0);
      const bRate = (b.stats?.wins ?? 0) / Math.max(1, b.stats?.played ?? 0);
      return bRate - aRate;
    })[0]?.game.name ?? "—";

  return (
    <main className="min-h-screen">
      <ProductHeader current="profile" />
      <section className="page-shell feature-shell">
        <div className="feature-heading">
          <p className="calm-eyebrow">Personal game performance</p>
          <h1>Your statistics</h1>
          <p>These describe QuickDuel results only. They are not measures of intelligence, health, hearing, or medical ability.</p>
        </div>

        <section className="stats-overview">
          <div className="division-summary">
            <span className={`division-mark division-${division.id}`}>{division.mark}</span>
            <div><small>Current division</small><h2>{division.name}</h2><p>{stats.rating} Elo</p></div>
            <div className="division-progress">
              <span style={{ width: `${division.progress * 100}%` }} />
            </div>
            <p>{division.next ? `${division.ratingToNext} Elo to ${division.next.name}` : "Highest division reached"}</p>
          </div>
          <dl className="stats-key-numbers">
            <div><dt>Highest Elo</dt><dd>{stats.highest_rating ?? stats.rating}</dd><small>{highestDivision.name}</small></div>
            <div><dt>Total matches</dt><dd>{overall.total_matches}</dd></div>
            <div><dt>Win rate</dt><dd>{Math.round(winRate * 100)}%</dd><small>{overall.wins}W · {overall.losses}L · {overall.draws}D</small></div>
            <div><dt>Win streak</dt><dd>{stats.current_win_streak ?? 0}</dd><small>Best {stats.best_win_streak ?? 0}</small></div>
            <div><dt>Most played</dt><dd>{mostPlayed}</dd></div>
            <div><dt>Best record</dt><dd>{bestGame}</dd></div>
          </dl>
          <div className="recent-form" aria-label="Recent form">
            <span>Recent form</span>
            <ol>{stats.recent_form.map((outcome, index) => <li className={`outcome-${outcome}`} key={`${outcome}-${index}`} title={outcome}>{outcome[0].toUpperCase()}</li>)}</ol>
          </div>
        </section>

        <section className="stats-games">
          <div className="feature-section-heading"><div><h2>Per game</h2><p>Each game keeps its own meaningful measurement.</p></div></div>
          {playedGames.length === 0 ? (
            <div className="empty-state"><h3>No game statistics yet.</h3><p>Complete a human duel to start this record.</p></div>
          ) : (
            <div className="stats-game-list">
              {playedGames.map(({ game, stats: gameStats }) => {
                if (!gameStats) return null;
                const winRate = gameStats.played ? gameStats.wins / gameStats.played : 0;
                const average = (gameStats.total_rank_score ?? 0) / Math.max(1, gameStats.played);
                return (
                  <article key={game.id}>
                    <div><span>{game.category}</span><h3>{game.name}</h3><p>{game.ranked ? "Ranked" : "Experimental · unranked"}</p></div>
                    <dl>
                      <div><dt>Matches</dt><dd>{gameStats.played}</dd></div>
                      <div><dt>Record</dt><dd>{gameStats.wins}–{gameStats.losses}–{gameStats.draws}</dd></div>
                      <div><dt>Win rate</dt><dd>{Math.round(winRate * 100)}%</dd></div>
                      <div><dt>{GAME_STAT_LABELS[game.id as GameId]}</dt><dd>{formatAverageResult(game.id as GameId, average)}</dd></div>
                    </dl>
                    <div className="micro-trend" aria-label={`${game.name} recent result trend`}>
                      {(gameStats.recent_results ?? []).slice().reverse().map((result, index) => (
                        <span key={index} className={`outcome-${result.outcome}`} style={{ height: `${25 + Math.max(0, Math.min(1, Number(result.score))) * 75}%` }} />
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
