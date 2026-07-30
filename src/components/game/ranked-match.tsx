"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { generateChallenge } from "@/lib/game/challenge";
import { compareScores } from "@/lib/game/scoring";
import type { MatchSnapshot } from "@/types/database";
import { GameHeader } from "./game-header";
import { MemoryGrid } from "./memory-grid";
import { ResultPanel } from "@/components/results/result-panel";

type Phase =
  | "loading"
  | "ready"
  | "countdown"
  | "reveal"
  | "answer"
  | "submitted"
  | "result"
  | "ended"
  | "error";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Request failed.");
  return body.data as T;
}

export function RankedMatch({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [now, setNow] = useState(0);
  const [connected, setConnected] = useState(true);
  const [opponentConnected, setOpponentConnected] = useState<boolean | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [rematchWaiting, setRematchWaiting] = useState(false);
  const readySent = useRef(false);

  const reload = useCallback(async () => {
    try {
      const next = await request<MatchSnapshot>(`/api/matches/${matchId}`);
      setSnapshot(next);
      setError(null);
      if (next.rematch_match_id) router.replace(`/match/${next.rematch_match_id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load match.");
    }
  }, [matchId, router]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void reload(), 0);
    const clock = window.setInterval(() => setNow(Date.now()), 50);
    const poll = window.setInterval(() => void reload(), 2_500);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(clock);
      window.clearInterval(poll);
    };
  }, [reload]);

  useEffect(() => {
    if (!snapshot || readySent.current) return;
    if (snapshot.status !== "waiting") return;
    readySent.current = true;
    void request<MatchSnapshot>(`/api/matches/${matchId}/ready`, {
      method: "POST",
    })
      .then(setSnapshot)
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Ready failed.");
        readySent.current = false;
      });
  }, [matchId, snapshot]);

  const currentUserId = snapshot?.current_user_id;

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !currentUserId) return;
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const refresh = () => void reload();
    void (async () => {
      await supabase.realtime.setAuth();
      if (!active) return;
      channel = supabase
        .channel(`match:${matchId}`, {
          config: {
            private: true,
            presence: { key: currentUserId },
          },
        })
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "matches",
            filter: `id=eq.${matchId}`,
          },
          refresh,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "match_players",
            filter: `match_id=eq.${matchId}`,
          },
          refresh,
        )
        .on("presence", { event: "sync" }, () => {
          const presence = channel?.presenceState() ?? {};
          setOpponentConnected(
            Object.keys(presence).some((key) => key !== currentUserId),
          );
        })
        .subscribe(async (status) => {
          if (!active || !channel) return;
          setConnected(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") {
            await channel.track({ page: "match", ready: true });
            void reload();
          } else {
            setOpponentConnected(null);
          }
        });
    })();
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [currentUserId, matchId, reload]);

  const me = snapshot?.players.find(
    (player) => player.user_id === snapshot.current_user_id,
  );
  const opponent = snapshot?.players.find(
    (player) => player.user_id !== snapshot.current_user_id,
  );
  const challenge = useMemo(
    () =>
      snapshot
        ? generateChallenge(
            snapshot.challenge_seed,
            snapshot.grid_size,
            snapshot.highlight_count,
          )
        : null,
    [snapshot],
  );

  const start = snapshot?.starts_at ? Date.parse(snapshot.starts_at) : null;
  const answerStart = start && snapshot ? start + snapshot.reveal_duration_ms : null;
  const answerEnd =
    answerStart && snapshot ? answerStart + snapshot.answer_duration_ms : null;

  const phase: Phase = (() => {
    if (!snapshot) {
      return error ? "error" : "loading";
    }
    if (snapshot.status === "completed") {
      return "result";
    }
    if (
      snapshot.status === "abandoned" ||
      snapshot.status === "cancelled"
    ) {
      return "ended";
    }
    if (me?.submitted_at) {
      return "submitted";
    }
    if (!start) {
      return "ready";
    }
    if (now < start) return "countdown";
    if (answerStart && now < answerStart) return "reveal";
    if (answerEnd && now <= answerEnd) return "answer";
    return "ended";
  })();

  async function submit() {
    try {
      const next = await request<MatchSnapshot>(
        `/api/matches/${matchId}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedCells: selected }),
        },
      );
      setSnapshot(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Submission failed.");
    }
  }

  async function rematch() {
    setRematchWaiting(true);
    try {
      const result = await request<{
        accepted: boolean;
        waiting: boolean;
        match_id: string | null;
      }>(`/api/matches/${matchId}/rematch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept: true }),
      });
      if (result.match_id) router.replace(`/match/${result.match_id}`);
    } catch (caught) {
      setRematchWaiting(false);
      setError(caught instanceof Error ? caught.message : "Rematch failed.");
    }
  }

  if (phase === "result" && snapshot && me && opponent) {
    const firstScore = {
      correct: me.correct_count ?? 0,
      incorrect: me.incorrect_count ?? 0,
      missed: 0,
      value: Number(me.calculated_score ?? 0),
    };
    const secondScore = {
      correct: opponent.correct_count ?? 0,
      incorrect: opponent.incorrect_count ?? 0,
      missed: 0,
      value: Number(opponent.calculated_score ?? 0),
    };
    const outcome = compareScores(
      firstScore,
      me.completion_time_ms ?? 0,
      secondScore,
      opponent.completion_time_ms ?? 0,
    );
    return (
      <main className="min-h-screen">
        <GameHeader
          player={me.display_name}
          playerRating={me.rating_after ?? me.rating_before}
          opponent={opponent.display_name}
          opponentRating={opponent.rating_after ?? opponent.rating_before}
          connected={connected}
          opponentConnected={opponentConnected}
        />
        <ResultPanel
          outcome={outcome}
          player={{
            name: me.display_name,
            score: firstScore.value,
            correct: firstScore.correct,
            incorrect: firstScore.incorrect,
            timeMs: me.completion_time_ms ?? 0,
            ratingBefore: me.rating_before,
            ratingAfter: me.rating_after ?? me.rating_before,
          }}
          opponent={{
            name: opponent.display_name,
            score: secondScore.value,
            correct: secondScore.correct,
            incorrect: secondScore.incorrect,
            timeMs: opponent.completion_time_ms ?? 0,
            ratingBefore: opponent.rating_before,
            ratingAfter: opponent.rating_after ?? opponent.rating_before,
          }}
          rematchWaiting={rematchWaiting}
          onRematch={() => void rematch()}
          onNext={() => router.push("/play")}
          onHome={() => router.push("/")}
        />
        {error && <ErrorToast message={error} />}
      </main>
    );
  }

  if (phase === "error" || phase === "ended") {
    return (
      <main className="min-h-screen">
        <GameHeader
          player={me?.display_name ?? "You"}
          playerRating={me?.rating_before ?? 1000}
          opponent={opponent?.display_name ?? "Opponent"}
          opponentRating={opponent?.rating_before}
          connected={connected}
          opponentConnected={opponentConnected}
        />
        <section className="page-shell flex min-h-[calc(100vh-120px)] flex-col items-center justify-center py-12 text-center">
          <h1 className="display text-6xl">
            {phase === "ended" ? "Match ended" : "Connection lost"}
          </h1>
          <p className="mt-4 max-w-lg text-[var(--muted)]">
            {error ??
              "This match expired before both players completed it. No rating was awarded."}
          </p>
          <div className="mt-7 flex gap-3">
            <Button onClick={() => void reload()}>Retry</Button>
            <Button variant="secondary" onClick={() => router.push("/play")}>
              Find new opponent
            </Button>
          </div>
        </section>
      </main>
    );
  }

  const countdown = start ? Math.max(1, Math.ceil((start - now) / 1000)) : 3;
  const remaining = answerEnd ? Math.max(0, answerEnd - now) : 0;

  return (
    <main className="min-h-screen">
      <GameHeader
        player={me?.display_name ?? "Loading…"}
        playerRating={me?.rating_before ?? 1000}
        opponent={opponent?.display_name ?? "Opponent"}
        opponentRating={opponent?.rating_before}
        connected={connected}
        opponentConnected={opponentConnected}
      />
      <section className="page-shell screen-enter flex min-h-[calc(100vh-120px)] flex-col items-center justify-center py-8">
        {phase === "loading" || phase === "ready" || phase === "countdown" ? (
          <div className="text-center">
            <p className="display text-lg tracking-[0.12em] text-[var(--muted)]">
              {phase === "ready" ? "Waiting for opponent" : "Get ready"}
            </p>
            <div className="display mt-3 text-[clamp(6rem,25vw,10rem)] leading-none text-[var(--accent)]">
              {phase === "countdown" ? countdown : "…"}
            </div>
            <p className="mt-4 text-sm text-[var(--muted)]">
              {me?.ready_at ? "You are ready" : "Synchronizing match"}
              {" · "}
              {opponent?.ready_at ? "Opponent ready" : "Opponent connecting"}
            </p>
          </div>
        ) : (
          <>
            <h1 className="display text-center text-[clamp(2.5rem,7vw,4.5rem)] leading-none">
              {phase === "reveal"
                ? "Memorize the grid"
                : phase === "submitted"
                  ? "Answer locked"
                  : "Select the cells"}
            </h1>
            <p className="mt-2 text-center text-sm text-[var(--muted)]">
              {phase === "reveal"
                ? "Both players see this exact pattern."
                : phase === "submitted"
                  ? opponent?.submitted_at
                    ? "Opponent finished. Finalizing result."
                    : "Opponent is still playing."
                  : "Choose every cell you remember."}
            </p>
            <div className="display my-5 text-5xl tabular-nums text-[var(--accent)]">
              {phase === "reveal"
                ? "MEMORIZE"
                : phase === "submitted"
                  ? "LOCKED"
                  : `${(remaining / 1000).toFixed(1)}s`}
            </div>
            {challenge && (
              <MemoryGrid
                size={snapshot?.grid_size ?? 4}
                revealed={phase === "reveal" ? challenge.highlightedCells : []}
                selected={selected}
                disabled={phase !== "answer"}
                onToggle={(cell) =>
                  setSelected((current) =>
                    current.includes(cell)
                      ? current.filter((value) => value !== cell)
                      : [...current, cell],
                  )
                }
              />
            )}
            {phase === "answer" && (
              <Button
                className="mt-6 w-full max-w-[440px] text-xl"
                disabled={selected.length === 0}
                onClick={() => void submit()}
              >
                Submit answer
              </Button>
            )}
            {phase === "submitted" && (
              <div className="mt-8 flex items-center gap-3 text-sm text-[var(--muted)]">
                <span className="search-pulse h-3 w-3 bg-[var(--accent)]" />
                {opponent?.submitted_at
                  ? "Calculating winner"
                  : "Opponent is still playing"}
              </div>
            )}
          </>
        )}
      </section>
      {error && <ErrorToast message={error} />}
    </main>
  );
}

function ErrorToast({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-20 w-[min(92vw,520px)] -translate-x-1/2 border-l-2 border-[var(--danger)] bg-[var(--surface)] px-5 py-4 text-sm shadow-2xl"
    >
      {message}
    </div>
  );
}
