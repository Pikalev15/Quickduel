"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/ui/header";
import { Button } from "@/components/ui/button";
import { TrophyIcon } from "@/components/ui/icons";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Leader = {
  rank: number;
  id: string;
  display_name: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  matches_played: number;
};

export function LeaderboardScreen() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const [response, userResult] = await Promise.all([
        fetch("/api/leaderboard", { cache: "no-store" }),
        supabase ? supabase.auth.getUser() : Promise.resolve(null),
      ]);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Leaderboard failed.");
      setLeaders(body.data ?? []);
      if (userResult) {
        setCurrentId(userResult.data.user?.id ?? null);
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Leaderboard unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="min-h-screen">
      <Header simple />
      <section className="page-shell screen-enter py-12 sm:py-16">
        <div className="flex items-end justify-between gap-4 border-b border-[var(--border)] pb-7">
          <div>
            <TrophyIcon className="mb-4 h-9 w-9 text-[var(--accent)]" />
            <h1 className="display text-[clamp(3.5rem,10vw,7rem)] leading-[0.85]">
              Leaderboard
            </h1>
            <p className="mt-4 text-sm text-[var(--muted)]">
              All-time ranked Memory Grid duelists.
            </p>
          </div>
          <span className="display hidden text-sm tracking-[0.12em] text-[var(--muted)] sm:block">
            Top 100
          </span>
        </div>

        {loading ? (
          <div className="grid gap-1 py-8" aria-label="Loading leaderboard">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="h-16 animate-pulse bg-[var(--surface)]"
              />
            ))}
          </div>
        ) : error ? (
          <div className="my-10 border-l-2 border-[var(--danger)] bg-[var(--surface)] p-6">
            <h2 className="display text-2xl">Ranks unavailable</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{error}</p>
            <Button className="mt-5" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : leaders.length === 0 ? (
          <div className="py-20 text-center">
            <h2 className="display text-4xl">The board is open</h2>
            <p className="mt-3 text-[var(--muted)]">
              Complete the first ranked duel to take the top spot.
            </p>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto border border-[var(--border)]">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead className="bg-[var(--surface)] text-xs tracking-[0.12em] text-[var(--muted)]">
                <tr>
                  <th className="px-5 py-4">RANK</th>
                  <th className="px-5 py-4">DUELIST</th>
                  <th className="px-5 py-4 text-right">RATING</th>
                  <th className="px-5 py-4 text-right">WINS</th>
                  <th className="px-5 py-4 text-right">LOSSES</th>
                  <th className="px-5 py-4 text-right">MATCHES</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((leader) => (
                  <tr
                    key={leader.id}
                    className={`border-t border-[var(--border)] transition hover:bg-[var(--surface)] ${
                      leader.id === currentId
                        ? "bg-[rgb(215_255_0/8%)] text-white"
                        : ""
                    }`}
                  >
                    <td className="display px-5 py-4 text-xl text-[var(--accent)]">
                      {leader.rank}
                    </td>
                    <td className="px-5 py-4 font-bold">
                      {leader.display_name}
                      {leader.id === currentId && (
                        <span className="ml-3 text-xs text-[var(--accent)]">
                          YOU
                        </span>
                      )}
                    </td>
                    <td className="display px-5 py-4 text-right text-xl">
                      {leader.rating}
                    </td>
                    <td className="px-5 py-4 text-right">{leader.wins}</td>
                    <td className="px-5 py-4 text-right">{leader.losses}</td>
                    <td className="px-5 py-4 text-right">
                      {leader.matches_played}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
