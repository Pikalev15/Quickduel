"use client";
import {rulesLabel} from "@/games/match-rules";

import { useCallback, useEffect, useRef, useState } from "react";
import { LockAnswerButton } from "@/components/game/lock-answer-button";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { loadSupabaseBrowserClient } from "@/lib/supabase/lazy-client";
import { compareGameResults, type Submission } from "@/games/types";
import { getGame } from "@/games/registry";
import { GameRenderer } from "@/games/client-registry";
import type { MatchSnapshot } from "@/types/database";
import { GameHeader } from "./game-header";
import { CorrectAnswer } from "@/components/results/correct-answer";
import { ResultPanel } from "@/components/results/result-panel";
import {RankedRecordNotice} from "@/components/stats/skill-progress";
import { track } from "@/lib/analytics";
import { MatchChat } from "@/components/match-chat/match-chat";
import { MEMORY_GRID_FLASH_MS } from "@/games/memory-grid-timing";
import { isSecureRecallGame } from "@/games/recall-rounds";
import { RankedRecallRounds } from "./ranked-recall-rounds";
import { AudioManager } from "@/lib/audio/audio-manager";
import { estimateServerClockOffset } from "@/lib/game-clock";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Request failed.");
  return body.data as T;
}

export function RankedMatch({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [canSubmit, setCanSubmit] = useState(false);
  const [lockStatus, setLockStatus] = useState<"idle" | "sending" | "locked">("idle");
  const [now, setNow] = useState(() => Date.now());
  const [clockOffset, setClockOffset] = useState(0);
  const clockOffsetRef = useRef(0);
  const clockSynced = useRef(false);
  const serverNow = now + clockOffset;
  const [connected, setConnected] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [keyboardReady, setKeyboardReady] = useState(false);
  const typing = snapshot?.game_type === "typing_sprint";
  const requiresAudio = snapshot?.game_type === "frequency_recall_v2" || snapshot?.game_type === "frequency_recall" || snapshot?.game_type === "rhythm_recall";
  const [opponentConnected, setOpponentConnected] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rematchWaiting, setRematchWaiting] = useState(false);
  const readySent = useRef(false);
  const submissionSent = useRef(false);
  const submissionRef = useRef<Submission>({});
  const canSubmitRef = useRef(false);
  const trackedStatuses = useRef(new Set<string>());
  const reloadInFlight = useRef(false);
  const latestSnapshot = useRef<MatchSnapshot | null>(null);
  const lastPollAt = useRef(0);

  const reload = useCallback(async () => {
    if (reloadInFlight.current) return;
    reloadInFlight.current = true;
    try {
      const requestedAt = Date.now();
      const next = await request<MatchSnapshot>(`/api/matches/${matchId}`);
      const offset = estimateServerClockOffset(next.server_now, requestedAt, Date.now(), next.server_received_at);
      if (offset !== null) {
        const nextOffset = clockSynced.current ? clockOffsetRef.current + Math.max(-50, Math.min(50, offset - clockOffsetRef.current)) : offset;
        clockSynced.current = true;
        clockOffsetRef.current = nextOffset;
        setClockOffset(nextOffset);
      }
      const current = latestSnapshot.current;
      if (current?.starts_at && !next.starts_at && next.status === "waiting") return;
      latestSnapshot.current = next;
      setSnapshot(next);
      setError(null);
      if (next.rematch_match_id) router.replace(`/match/${next.rematch_match_id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load match.");
    } finally {
      reloadInFlight.current = false;
    }
  }, [matchId, router]);

  useEffect(() => {
    const initial = window.setTimeout(() => void reload(), 0);
    const clock = window.setInterval(() => setNow(Date.now()), 50);
    const poll = window.setInterval(() => {
      const current = latestSnapshot.current;
      const at = Date.now() + clockOffsetRef.current;
      const startAt = current?.starts_at ? Date.parse(current.starts_at) : null;
      const revealEnd = startAt !== null && current ? startAt + current.reveal_duration_ms : null;
      const transition = !current || current.status === "waiting" || current.phase === "countdown"
        || (revealEnd !== null && current.phase === "reveal" && revealEnd - at <= 750);
      if (transition || at - lastPollAt.current >= 1_500) {
        lastPollAt.current = at;
        void reload();
      }
    }, 250);
    const refresh = () => void reload();
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(poll);
      window.clearTimeout(initial);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reload]);

  useEffect(() => {
    if (!snapshot || readySent.current || snapshot.status !== "waiting" || (requiresAudio && !audioReady) || (typing && !keyboardReady)) return;
    readySent.current = true;
    const sentAt = Date.now();
    void request<MatchSnapshot>(`/api/matches/${matchId}/ready`, { method: "POST" })
      .then((ready) => {
        const current = latestSnapshot.current;
        if (current?.status === "waiting" && ready?.status === "countdown" && ready.starts_at) {
          const receivedAt = Date.now();
          const offset = estimateServerClockOffset(ready.server_now, sentAt, receivedAt, ready.server_received_at);
          if (offset !== null && !clockSynced.current) {
            clockSynced.current = true;
            clockOffsetRef.current = offset;
            setClockOffset(offset);
          }
          const next: MatchSnapshot = { ...current, ...ready, phase: "countdown", challenge: {} };
          latestSnapshot.current = next;
          setNow(receivedAt);
          setSnapshot(next);
        }
        void reload();
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Ready failed.");
        readySent.current = false;
      });
  }, [matchId, reload, snapshot, requiresAudio, audioReady, typing, keyboardReady]);

  const currentUserId = snapshot?.current_user_id;
  const placementPhase = snapshot?.status === "completed" ? "result" : "playing";
  const [placementState, setPlacementState] = useState<{ phase: string; counts: Record<string, number> } | null>(null);
  useEffect(() => {
    if (!currentUserId) return;
    let active = true;
    const controller = new AbortController();
    void request<Record<string, number>>(`/api/matches/${matchId}/placements`, { signal: controller.signal })
      .then((counts) => { if (active) setPlacementState({ phase: placementPhase, counts }); })
      .catch(() => { /* Missing progress never implies an established rank. */ });
    return () => { active = false; controller.abort(); };
  }, [currentUserId, matchId, placementPhase]);
  const placementCounts = placementState?.phase === placementPhase ? placementState.counts : undefined;
  useEffect(() => {
    if (!currentUserId) return;
    let active = true;
    let supabase: SupabaseClient | null = null;
    let channel: RealtimeChannel | null = null;
    let retryTimer: number | undefined;
    let retryDelay = 750;
    let outageReported = false;

    function recover(reason: string) {
      if (!active) return;
      setConnected(false);
      setOpponentConnected(null);
      if (!outageReported) {
        outageReported = true;
        void fetch("/api/errors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "realtime_disconnected",
            message: `Private match channel ${reason}`,
            route: `/match/${matchId}`,
            digest: null,
            stack: null,
          }),
          keepalive: true,
        }).catch(() => undefined);
      }
      if (retryTimer !== undefined) return;
      const old = channel;
      channel = null;
      if (old && supabase) void supabase.removeChannel(old);
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        void connect();
      }, retryDelay);
      retryDelay = Math.min(8_000, retryDelay * 2);
      void reload();
    }

    async function connect() {
      try {
        supabase ??= await loadSupabaseBrowserClient();
        const client = supabase;
        if (!active) return;
        if (!client) {
          recover("client_unavailable");
          return;
        }
        await client.realtime.setAuth();
        if (!active) return;
        const candidate = client.channel(`match:${matchId}`, {
          config: { private: true, presence: { key: currentUserId } },
        });
        channel = candidate;
        candidate.on("presence", { event: "sync" }, () => {
          if (!active || channel !== candidate) return;
          const state = candidate.presenceState();
          setOpponentConnected(Object.keys(state).some((key) => key !== currentUserId));
        }).subscribe(async (status) => {
          if (!active || channel !== candidate) return;
          if (status === "SUBSCRIBED") {
            try {
              const tracked = await candidate.track({ page: "match", ready: true });
              if (!active || channel !== candidate) return;
              if (tracked !== "ok") {
                recover("presence_track_failed");
                return;
              }
              retryDelay = 750;
              outageReported = false;
              setConnected(true);
              void reload();
            } catch {
              if (channel === candidate) recover("presence_track_failed");
            }
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            recover(status.toLowerCase());
          }
        });
      } catch {
        recover("subscription_failed");
      }
    }

    void connect();
    return () => {
      active = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [currentUserId, matchId, reload]);

  const me = snapshot?.players.find((player) => player.user_id === currentUserId);
  const opponent = snapshot?.players.find((player) => player.user_id !== currentUserId);
  const game = snapshot ? getGame(snapshot.game_type) : null;
  const secureRecall = Boolean(game && isSecureRecallGame(game.id));
  const start = snapshot?.starts_at ? Date.parse(snapshot.starts_at) : null;
  const answerStart = start !== null && snapshot ? start + snapshot.reveal_duration_ms : null;
  const answerEnd = answerStart !== null && snapshot ? answerStart + snapshot.answer_duration_ms : null;
  const remaining = answerEnd === null ? 0 : Math.max(0, answerEnd - serverNow);
  const phase =
    snapshot?.status === "completed"
      ? "result"
      : snapshot?.status === "abandoned" || snapshot?.status === "cancelled"
        ? "ended"
        : me?.submitted_at
          ? "submitted"
          : start === null
            ? snapshot?.phase ?? "waiting"
            : serverNow < start
              ? "countdown"
              : answerStart !== null && serverNow < answerStart
                ? "reveal"
                : "answer";
  const phaseElapsedMs =
    phase === "reveal" && start !== null ? Math.max(0, serverNow - start) : 0;
  const memoryHolding =
    game?.id === "memory_grid" &&
    phase === "reveal" &&
    phaseElapsedMs >= Number(snapshot?.challenge.flashMs ?? MEMORY_GRID_FLASH_MS);

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
    if (secureRecall || phase !== "answer" || snapshot?.phase !== "answer" || !answerEnd || me?.submitted_at) return;
    if (game?.autoSubmitOnValid && canSubmit) {
      void submit(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void submit(!game?.submitAtDeadline);
    }, Math.max(0, answerEnd - (Date.now() + clockOffsetRef.current)));
    return () => window.clearTimeout(timer);
    // Submission is intentionally captured at the deadline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    answerEnd,
    clockOffset,
    canSubmit,
    game?.autoSubmitOnValid,
    game?.submitAtDeadline,
    secureRecall,
    phase,
    snapshot?.phase,
    me?.submitted_at,
  ]);

  const handleRecallComplete = useCallback(() => {
    void reload();
  }, [reload]);
  const handleRecallError = useCallback((message: string) => {
    setError(message);
  }, []);

  async function submit(timedOut = false) {
    if ((!timedOut && !canSubmitRef.current) || submissionSent.current) return;
    submissionSent.current = true;
    setLockStatus("sending");
    try {
      await request(`/api/matches/${matchId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission: submissionRef.current, timedOut }),
      });
      setLockStatus("locked");
      await reload();
    } catch (caught) {
      setLockStatus("idle");
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
    const outcome = snapshot.completion_reason === "timeout_forfeit"
      ? snapshot.winner_id === currentUserId ? "win" : "loss"
      : snapshot.completion_reason === "double_timeout"
        ? "draw"
        : compareGameResults(
            me.result,
            me.completion_time_ms ?? 0,
            opponent.result,
            opponent.completion_time_ms ?? 0,
          );
    const completionNotice = snapshot.completion_reason === "timeout_forfeit"
      ? outcome === "win"
        ? "Opponent failed to submit. Win by forfeit."
        : "You did not submit before the deadline. Ranked loss applied."
      : snapshot.completion_reason === "double_timeout"
        ? "Neither player submitted. No rating change."
        : snapshot.completion_reason === "admin_invalidated"
          ? "This match was invalidated. No rating change."
          : undefined;
    return (
      <main className="has-match-chat min-h-screen">
        <GameHeader
          showRequests
          player={me.display_name}
          playerRating={me.rating_after ?? me.rating_before}
          opponent={opponent.display_name}
          opponentRating={opponent.rating_after ?? opponent.rating_before}
          connected={connected}
          playerMatches={currentUserId ? placementCounts?.[currentUserId] : undefined}
          opponentMatches={opponent ? placementCounts?.[opponent.user_id] : undefined}
          opponentConnected={opponentConnected}
        />
        <ResultPanel
          outcome={outcome}
          gameName={game?.name}
          correctAnswer={game ? CorrectAnswer({ gameId: game.id, challenge: snapshot.challenge }) : undefined}
          player={{
            name: me.display_name,
            score: me.result.rankScore,
            correct: Number(me.result.details.correct ?? me.result.details.hits ?? 0),
            incorrect: Number(me.result.details.incorrect ?? me.result.details.errors ?? me.result.details.misses ?? 0),
            summary: me.result.summary,
            timeMs: me.completion_time_ms ?? 0,
            ratingBefore: me.rating_before,
            ratingAfter: me.rating_after ?? me.rating_before,
            details: me.result.details,
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
            details: opponent.result.details,
          }}
          recordNotice={snapshot.ranked&&snapshot.completion_reason==="normal"?<RankedRecordNotice matchId={snapshot.id}/>:undefined}
          unranked={!snapshot.ranked}
          placementMatches={currentUserId ? placementCounts?.[currentUserId] ?? null : null}
          rematchWaiting={rematchWaiting || Boolean(me.rematch_requested_at && !snapshot.rematch_match_id)}
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
          rematchLabel={snapshot.private_duel_code ? "Return to series" : opponent.rematch_requested_at && !me.rematch_requested_at ? "Accept rematch" : "Request rematch"}
          nextLabel={snapshot.private_duel_code ? "Continue series" : "Next opponent"}
          onCreateShare={createShareUrl}
          completionNotice={completionNotice}
          resultTitle={snapshot.completion_reason === "double_timeout" ? "No result" : undefined}
        />
        <MatchChat matchId={matchId} currentUserId={snapshot.current_user_id} />
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
          playerMatches={currentUserId ? placementCounts?.[currentUserId] : undefined}
          opponentMatches={opponent ? placementCounts?.[opponent.user_id] : undefined}
          opponentConnected={opponentConnected}
        />
        <section className="page-shell match-center text-center">
          <h1 className="display text-6xl">Match ended</h1>
          <p className="mt-4 text-[var(--muted)]">
            {snapshot?.completion_reason === "cancelled_before_start"
              ? "Match cancelled before start. No rating change."
              : "The duel ended. No rating was awarded."}
          </p>
          <Button className="mt-7" onClick={() => router.push("/play")}>Find new opponent</Button>
        </section>
      </main>
    );
  }

  const countdown = start ? Math.max(1, Math.ceil((start - serverNow) / 1000)) : 3;
  const waiting = phase === "waiting" || phase === "countdown";
  const typingPreparing = typing && (waiting || (phase === "answer" && snapshot?.phase !== "answer"));

  return (
    <main className={`active-game has-match-chat min-h-screen${game?.id === "typing_sprint" ? " typing-match" : ""}`}>
      <GameHeader
        player={me?.display_name ?? "Loading…"}
        playerRating={me?.rating_before ?? 1000}
        opponent={opponent?.display_name ?? "Opponent"}
        opponentRating={opponent?.rating_before}
        connected={connected}
        playerMatches={currentUserId ? placementCounts?.[currentUserId] : undefined}
        opponentMatches={opponent ? placementCounts?.[opponent.user_id] : undefined}
        opponentConnected={opponentConnected}
      />
      <section className="page-shell screen-enter match-center">
        {waiting && !typing ? (
          <div className="text-center">
            <p className="display text-lg tracking-[0.12em] text-[var(--muted)]">
              {game ? `${game.name} · Get ready` : "Synchronizing duel"}
            </p>
            <div className="display qd-countdown mt-3 text-[clamp(6rem,25vw,10rem)] leading-none text-[var(--accent)]">
              <span key={phase === "countdown" ? countdown : "waiting"}>{phase === "countdown" ? countdown : "…"}</span>
            </div>
            <p className="mt-4 text-sm text-[var(--muted)]">{snapshot?.match_rules?.kind==="workshop" ? rulesLabel(snapshot.match_rules) : game?.instructions}</p>
            {requiresAudio && !audioReady && snapshot?.status === "waiting" && (
              <Button className="mt-4" onClick={() => {
                void AudioManager.shared().unlock().then((ready) => {
                  if (ready) setAudioReady(true);
                  else setError("Enable sound and try again before starting.");
                }).catch(() => setError("Audio is unavailable. Check your browser sound settings."));
              }}>Enable sound and ready up</Button>
            )}
          </div>
        ) : (
          <>
            <div className="game-title-row">
              <div>
                <p className="game-kicker">{snapshot?.ranked ? "Ranked duel" : snapshot?.match_rules?.kind==="workshop" ? "Workshop · unranked" : "Experimental · unranked"}{snapshot?.match_rules?.kind==="adaptive"?` · ${rulesLabel(snapshot.match_rules)}`:""}</p>
                <h1 className="display">{game?.name}</h1>
              </div>
              <div className="game-timer" data-urgent={!secureRecall && phase === "answer" && remaining <= 3000 ? "true" : undefined}>
                {waiting
                  ? phase === "countdown" ? `Starts in ${countdown}` : "Ready?"
                  : memoryHolding
                  ? "HOLD"
                  : secureRecall
                    ? "ROUND"
                  : phase === "reveal"
                    ? "OBSERVE"
                    : phase === "submitted"
                      ? "LOCKED"
                      : `${(remaining / 1000).toFixed(1)}s`}
              </div>
            </div>
            <p className="game-instructions">
              {phase === "submitted"
                ? opponent?.submitted_at ? "Finalizing result…" : "Opponent is still playing."
                : snapshot?.match_rules?.kind==="workshop" && snapshot.game_type==="memory_grid" ? snapshot.match_rules.rules.memory?.ordered ? "Memorize the numbered tiles in order, then tap in that same order." : `Remember ${snapshot.match_rules.rules.memory?.tiles} tiles. Select the positions.` : game?.instructions}
            </p>
            {!secureRecall && phase === "answer" && snapshot && (
              <div
                className="game-time-progress"
                role="progressbar"
                aria-label="Answer time remaining"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((remaining / snapshot.answer_duration_ms) * 100)}
              >
                <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, remaining / snapshot.answer_duration_ms))})` }} />
              </div>
            )}
            <div className="game-stage">
              {snapshot && secureRecall ? (
                <RankedRecallRounds
                  matchId={matchId}
                  gameId={snapshot.game_type as "frequency_recall_v2" | "colour_recall_v2"}
                  onComplete={handleRecallComplete}
                  onError={handleRecallError}
                />
              ) : !typing && snapshot && (phase === "reveal" || phase === "answer") && snapshot.phase !== phase ? (
                <span className="search-pulse h-3 w-3 bg-[var(--accent)]" aria-label="Synchronizing game" />
              ) : snapshot ? (
                <GameRenderer
                  key={typing ? snapshot.id : `${snapshot.id}:${phase === "submitted" ? "answer" : phase}`}
                  gameId={snapshot.game_type}
                  challenge={game?.publicChallenge(
                    snapshot?.challenge ?? {},
                    phase === "reveal" ? "reveal" : "answer",
                  ) ?? {}}
                  disabled={phase !== "answer" || snapshot.phase !== "answer" || remaining <= 0 || lockStatus !== "idle"}
                  preparing={typingPreparing}
                  answerDurationMs={snapshot.answer_duration_ms}
                  answerRemainingMs={remaining}
                  onReady={() => setKeyboardReady(true)}
                  phaseElapsedMs={phaseElapsedMs}
                  onChange={(next, valid) => {
                    submissionRef.current = next;
                    canSubmitRef.current = valid;
                    setCanSubmit(valid);
                  }}
                />
              ) : null}
            </div>
            {phase === "answer" && !secureRecall && !game?.autoSubmitOnValid && !game?.submitAtDeadline && (
              <LockAnswerButton className="game-submit" disabled={!canSubmit || remaining <= 0} pending={lockStatus === "sending"} locked={lockStatus === "locked"} remainingMs={remaining} onClick={() => void submit(false)} />
            )}
            {phase === "submitted" && <span className="search-pulse mt-7 h-3 w-3 bg-[var(--accent)]" />}
          </>
        )}
      </section>
      {currentUserId && <MatchChat matchId={matchId} currentUserId={currentUserId} compact />}
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
