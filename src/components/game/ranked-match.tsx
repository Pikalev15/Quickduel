"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { compareGameResults, type Submission } from "@/games/types";
import { getGame } from "@/games/registry";
import { GameRenderer } from "@/games/client-registry";
import type { MatchSnapshot } from "@/types/database";
import { GameHeader } from "./game-header";
import { ResultPanel } from "@/components/results/result-panel";
import { track } from "@/lib/analytics";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Request failed.");
  return body.data as T;
}

export function RankedMatch({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [submission, setSubmission] = useState<Submission>({});
  const [canSubmit, setCanSubmit] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [connected, setConnected] = useState(true);
  const [opponentConnected, setOpponentConnected] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rematchWaiting, setRematchWaiting] = useState(false);
  const readySent = useRef(false);
  const submissionSent = useRef(false);
  const trackedStatuses = useRef(new Set<string>());

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
    const initial = window.setTimeout(() => void reload(), 0);
    const clock = window.setInterval(() => setNow(Date.now()), 50);
    const poll = window.setInterval(() => void reload(), 600);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(poll);
      window.clearTimeout(initial);
    };
  }, [reload]);

  useEffect(() => {
    if (!snapshot || readySent.current || snapshot.status !== "waiting") return;
    readySent.current = true;
    void request<MatchSnapshot>(`/api/matches/${matchId}/ready`, { method: "POST" })
      .then(() => void reload())
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Ready failed.");
        readySent.current = false;
      });
  }, [matchId, reload, snapshot]);

  const currentUserId = snapshot?.current_user_id;
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !currentUserId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      await supabase.realtime.setAuth();
      channel = supabase
        .channel(`match:${matchId}`, {
          config: { private: true, presence: { key: currentUserId } },
        })
        .on("presence", { event: "sync" }, () => {
          const state = channel?.presenceState() ?? {};
          setOpponentConnected(Object.keys(state).some((key) => key !== currentUserId));
        })
        .subscribe(async (status) => {
          setConnected(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") {
            await channel?.track({ page: "match", ready: true });
            void reload();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            void fetch("/api/errors", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                event: "realtime_disconnected",
                message: `Private match channel ${status.toLowerCase()}`,
                route: `/match/${matchId}`,
                digest: null,
                stack: null,
              }),
              keepalive: true,
            }).catch(() => undefined);
          }
        });
    })();
    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [currentUserId, matchId, reload]);

  const me = snapshot?.players.find((player) => player.user_id === currentUserId);
  const opponent = snapshot?.players.find((player) => player.user_id !== currentUserId);
  const game = snapshot ? getGame(snapshot.game_type) : null;
  const start = snapshot?.starts_at ? Date.parse(snapshot.starts_at) : null;
  const answerStart = start !== null && snapshot ? start + snapshot.reveal_duration_ms : null;
  const answerEnd = answerStart !== null && snapshot ? answerStart + snapshot.answer_duration_ms : null;
  const remaining = answerEnd === null ? 0 : Math.max(0, answerEnd - now);
  const phase =
    snapshot?.status === "completed"
      ? "result"
      : snapshot?.status === "abandoned" || snapshot?.status === "cancelled"
        ? "ended"
        : me?.submitted_at
          ? "submitted"
          : snapshot?.phase ?? "waiting";

  useEffect(() => {
    if (!snapshot || trackedStatuses.current.has(snapshot.status)) return;
    trackedStatuses.current.add(snapshot.status);
    if (snapshot.status === "active" || snapshot.status === "countdown") {
      track("match_started", {
        matchId,
        gameType: snapshot.game_type,
      });
    } else if (snapshot.status === "completed") {
      track("match_completed", {
        matchId,
        gameType: snapshot.game_type,
      });
    } else if (snapshot.status === "abandoned") {
      track("match_abandoned", {
        matchId,
        gameType: snapshot.game_type,
      });
    }
  }, [matchId, snapshot]);

  useEffect(() => {
    if (phase !== "answer" || !answerEnd || me?.submitted_at) return;
    if (game?.autoSubmitOnValid && canSubmit) {
      void submit(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void submit(true);
    }, Math.max(0, answerEnd - Date.now()));
    return () => window.clearTimeout(timer);
    // Submission is intentionally captured at the deadline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerEnd, canSubmit, game?.autoSubmitOnValid, phase, me?.submitted_at]);

  async function submit(timedOut = false) {
    if ((!timedOut && !canSubmit) || submissionSent.current) return;
    submissionSent.current = true;
    try {
      await request(`/api/matches/${matchId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission, timedOut }),
      });
      await reload();
    } catch (caught) {
      submissionSent.current = false;
      setError(caught instanceof Error ? caught.message : "Submission failed.");
    }
  }

  async function rematch() {
    setRematchWaiting(true);
    track("rematch_requested", {
      matchId,
      gameType: snapshot?.game_type ?? null,
    });
    try {
      const response = await request<{ match_id: string | null }>(
        `/api/matches/${matchId}/rematch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accept: true }),
        },
      );
      if (response.match_id) router.replace(`/match/${response.match_id}`);
    } catch (caught) {
      setRematchWaiting(false);
      setError(caught instanceof Error ? caught.message : "Rematch failed.");
    }
  }

  async function createShareUrl() {
    const response = await request<{ code: string }>(
      `/api/matches/${matchId}/share`,
      { method: "POST" },
    );
    track("share_clicked", {
      matchId,
      gameType: snapshot?.game_type ?? null,
    });
    return `${location.origin}/share/${response.code}`;
  }

  if (phase === "result" && snapshot && me?.result && opponent?.result) {
    const outcome = compareGameResults(
      me.result,
      me.completion_time_ms ?? 0,
      opponent.result,
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
          gameName={game?.name}
          player={{
            name: me.display_name,
            score: me.result.rankScore,
            correct: Number(me.result.details.correct ?? me.result.details.hits ?? 0),
            incorrect: Number(me.result.details.incorrect ?? me.result.details.errors ?? me.result.details.misses ?? 0),
            summary: me.result.summary,
            timeMs: me.completion_time_ms ?? 0,
            ratingBefore: me.rating_before,
            ratingAfter: me.rating_after ?? me.rating_before,
          }}
          opponent={{
            name: opponent.display_name,
            score: opponent.result.rankScore,
            correct: Number(opponent.result.details.correct ?? opponent.result.details.hits ?? 0),
            incorrect: Number(opponent.result.details.incorrect ?? opponent.result.details.errors ?? opponent.result.details.misses ?? 0),
            summary: opponent.result.summary,
            timeMs: opponent.completion_time_ms ?? 0,
            ratingBefore: opponent.rating_before,
            ratingAfter: opponent.rating_after ?? opponent.rating_before,
          }}
          unranked={!snapshot.ranked}
          rematchWaiting={rematchWaiting}
          onRematch={() =>
            snapshot.private_duel_code
              ? router.push(`/duel/${snapshot.private_duel_code}`)
              : void rematch()
          }
          onNext={() =>
            snapshot.private_duel_code
              ? router.push(`/duel/${snapshot.private_duel_code}`)
              : router.push("/play")
          }
          onHome={() => router.push("/")}
          rematchLabel={snapshot.private_duel_code ? "Return to series" : "Rematch"}
          nextLabel={snapshot.private_duel_code ? "Continue series" : "Next opponent"}
          onCreateShare={createShareUrl}
        />
      </main>
    );
  }

  if (phase === "ended") {
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
        <section className="page-shell match-center text-center">
          <h1 className="display text-6xl">Match ended</h1>
          <p className="mt-4 text-[var(--muted)]">The duel expired. No rating was awarded.</p>
          <Button className="mt-7" onClick={() => router.push("/play")}>Find new opponent</Button>
        </section>
      </main>
    );
  }

  const countdown = start ? Math.max(1, Math.ceil((start - now) / 1000)) : 3;
  const waiting = phase === "waiting" || phase === "countdown";

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
      <section className="page-shell screen-enter match-center">
        {waiting ? (
          <div className="text-center">
            <p className="display text-lg tracking-[0.12em] text-[var(--muted)]">
              {game ? `${game.name} · Get ready` : "Synchronizing duel"}
            </p>
            <div className="display mt-3 text-[clamp(6rem,25vw,10rem)] leading-none text-[var(--accent)]">
              {phase === "countdown" ? countdown : "…"}
            </div>
            <p className="mt-4 text-sm text-[var(--muted)]">{game?.instructions}</p>
          </div>
        ) : (
          <>
            <div className="game-title-row">
              <div>
                <p className="game-kicker">{snapshot?.ranked ? "Ranked duel" : "Experimental · unranked"}</p>
                <h1 className="display">{game?.name}</h1>
              </div>
              <div className="game-timer">
                {phase === "reveal" ? "OBSERVE" : phase === "submitted" ? "LOCKED" : `${(remaining / 1000).toFixed(1)}s`}
              </div>
            </div>
            <p className="game-instructions">
              {phase === "submitted"
                ? opponent?.submitted_at ? "Finalizing result…" : "Opponent is still playing."
                : game?.instructions}
            </p>
            <div className="game-stage">
              {snapshot && (
                <GameRenderer
                  key={`${snapshot?.id}:${snapshot?.phase}`}
                  gameId={snapshot.game_type}
                  challenge={snapshot?.challenge ?? {}}
                  disabled={phase !== "answer"}
                  onChange={(next, valid) => {
                    setSubmission(next);
                    setCanSubmit(valid);
                  }}
                />
              )}
            </div>
            {phase === "answer" && !game?.autoSubmitOnValid && (
              <Button className="game-submit" disabled={!canSubmit} onClick={() => void submit(false)}>
                Lock answer
              </Button>
            )}
            {phase === "submitted" && <span className="search-pulse mt-7 h-3 w-3 bg-[var(--accent)]" />}
          </>
        )}
      </section>
      {error && <ErrorToast message={error} />}
    </main>
  );
}

function ErrorToast({ message }: { message: string }) {
  return (
    <div role="alert" className="error-toast">
      {message}
    </div>
  );
}
