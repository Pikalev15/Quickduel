"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getGame } from "@/games/registry";
import { track } from "@/lib/analytics";
import type { MatchHistoryItem } from "@/types/database";
import { ProductHeader } from "@/components/ui/product-header";

type HistoryPage = {
  items: MatchHistoryItem[];
  next_cursor: { completed_at: string; id: string } | null;
};

function relativeTime(timestamp: string) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(timestamp)) / 1_000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(timestamp));
}

export function HistoryScreen() {
  const [items, setItems] = useState<MatchHistoryItem[]>([]);
  const [cursor, setCursor] = useState<HistoryPage["next_cursor"]>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (next?: HistoryPage["next_cursor"]) => {
    if (next) setLoadingMore(true);
    else setLoading(true);
    const query = new URLSearchParams({ limit: "20" });
    if (next) {
      query.set("before", next.completed_at);
      query.set("beforeId", next.id);
    }
    try {
      const response = await fetch(`/api/history?${query}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not load history.");
      const page = body.data as HistoryPage;
      setItems((current) => (next ? [...current, ...page.items] : page.items));
      setCursor(page.next_cursor);
      setError(null);
      if (!next) track("history_viewed");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load history.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <main className="min-h-screen">
      <ProductHeader current="history" />
      <section className="page-shell feature-shell">
        <div className="feature-heading feature-heading-row">
          <div>
            <p className="calm-eyebrow">Your matches</p>
            <h1>Match history</h1>
            <p>Completed human duels only. Practice Bots never enter this record.</p>
          </div>
          <Link className="calm-secondary" href="/duel/new">Create private duel</Link>
        </div>

        {loading ? (
          <p className="empty-state">Loading recent matches…</p>
        ) : error ? (
          <div className="empty-state"><p className="inline-error">{error}</p><button type="button" onClick={() => void load()}>Try again</button></div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <h2>No matches yet.</h2>
            <p>Play your first duel to start your history.</p>
            <Link className="calm-primary" href="/play">Quick play</Link>
          </div>
        ) : (
          <div className="history-list">
            {items.map((item) => (
              <Link href={`/history/${item.id}`} className="history-row" key={item.id}>
                <div className={`history-outcome outcome-${item.outcome}`}>
                  <span>{item.outcome === "win" ? "Victory" : item.outcome}</span>
                  <small>{item.ranked ? "Ranked" : "Unranked"}</small>
                </div>
                <div className="history-summary">
                  <h2>{getGame(item.game_type).name}</h2>
                  <p>{item.player_summary} <span>vs</span> {item.opponent_summary}</p>
                  <small>against {item.opponent_name}#{item.opponent_code}</small>
                </div>
                <div className="history-meta">
                  <b>{item.rating_delta === null || !item.ranked ? "—" : `${item.rating_delta >= 0 ? "+" : ""}${item.rating_delta} Elo`}</b>
                  <span>{item.source === "private_duel" ? `Private duel${item.series_round ? ` · Round ${item.series_round}` : ""}` : "Public queue"}</span>
                  <time dateTime={item.completed_at}>{relativeTime(item.completed_at)}</time>
                </div>
              </Link>
            ))}
          </div>
        )}
        {cursor && (
          <button className="load-more" type="button" disabled={loadingMore} onClick={() => void load(cursor)}>
            {loadingMore ? "Loading…" : "Load older matches"}
          </button>
        )}
      </section>
    </main>
  );
}
