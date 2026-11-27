"use client";

import { estimateServerClockOffset } from "@/lib/game-clock";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LockAnswerButton } from "@/components/game/lock-answer-button";
import { AudioManager } from "@/lib/audio/audio-manager";
import type {
  RecallColour,
  RecallRoundFeedback,
  RecallRoundState,
  SecureRecallGameId,
} from "@/games/recall-rounds";

async function recallRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Round request failed.");
  return body.data as T;
}

function SignedMetric({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  return <strong>{value === null ? "—" : `${value > 0 ? "+" : ""}${value}${suffix}`}</strong>;
}

function Feedback({
  feedback,
  remainingMs,
}: {
  feedback: RecallRoundFeedback;
  remainingMs: number;
}) {
  return (
    <div className="recall-feedback qd-resolved" aria-live="polite">
      {feedback.kind === "frequency" ? (
        <>
          <div className="recall-comparison">
            <div><span>Target</span><strong>{feedback.targetHz} Hz</strong></div>
            <div><span>Your guess</span><strong>{feedback.guessHz === null ? "No answer" : `${feedback.guessHz} Hz`}</strong></div>
          </div>
          <div className="recall-metrics">
            <div><span>Difference</span><SignedMetric value={feedback.differenceHz} suffix=" Hz" /></div>
            <div><span>Percent</span><SignedMetric value={feedback.percentError} suffix="%" /></div>
            <div><span>Cents</span><SignedMetric value={feedback.centsError} /></div>
          </div>
          <p className="recall-direction">
            {feedback.direction === "none" ? "Round timed out" : feedback.direction === "exact" ? "Exact pitch" : `${Math.abs(feedback.centsError ?? 0)} cents ${feedback.direction}`}
          </p>
        </>
      ) : (
        <>
          <div className="colour-feedback-swatches">
            <div>
              <span>Target</span>
              <i style={{ background: colourCss(feedback.target) }} />
            </div>
            <div>
              <span>Your guess</span>
              <i style={{ background: feedback.guess ? colourCss(feedback.guess) : "transparent" }} />
            </div>
          </div>
          <div className="recall-metrics recall-metrics-four">
            <div><span>Distance</span><strong>{feedback.distance ?? "—"}</strong></div>
            <div><span>Lightness</span><SignedMetric value={feedback.lightnessDifference} /></div>
            <div><span>Chroma</span><SignedMetric value={feedback.chromaDifference} /></div>
            <div><span>Hue · wrapped</span><SignedMetric value={feedback.hueDifference} suffix="°" /></div>
          </div>
        </>
      )}
      <div className="recall-score-row">
        <div className="qd-round-score"><span>Round score</span><strong>{feedback.score.toFixed(1)}<small>/10</small></strong><span className="qd-score-meter" aria-hidden="true"><i style={{ transform: `scaleX(${Math.max(0, Math.min(1, feedback.score / 10))})` }} /></span></div>
        <div><span>Result</span><strong>{feedback.label}</strong></div>
      </div>
      <div className="recall-next">
        <span>Next round in {(remainingMs / 1000).toFixed(1)}s</span>
        <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, 1 - remainingMs / 2000))})` }} />
      </div>
    </div>
  );
}

function colourCss(colour: RecallColour) {
  return `oklch(${colour.l}% ${colour.c / 100} ${colour.h})`;
}

export function RankedRecallRounds({
  matchId,
  gameId,
  onComplete,
  onError,
}: {
  matchId: string;
  gameId: SecureRecallGameId;
  onComplete: () => void;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<RecallRoundState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [clockOffset, setClockOffset] = useState(0);
  const clockOffsetRef = useRef(0);
  const [frequency, setFrequency] = useState(660);
  const [colour, setColour] = useState<RecallColour>({ l: 65, c: 18, h: 180 });
  const [sending, setSending] = useState(false);
  const playedRound = useRef<number | null>(null);
  const heardTarget = useRef<{ round: number; hz: number } | null>(null);
  const inputRound = useRef<number | null>(null);
  const reloadInFlight = useRef(false);
  const latestState = useRef<RecallRoundState | null>(null);
  const submitting = useRef(false);
  const lastPollAt = useRef(0);
  const audio = useMemo(() => AudioManager.shared(), []);

  const applyState = useCallback((next: RecallRoundState) => {
    const previous = latestState.current;
    const order: Record<RecallRoundState["phase"], number> = {
      countdown: 0, reveal: 1, answer: 2, waiting: 3, feedback: 4, complete: 5,
    };
    if (previous && (next.roundIndex < previous.roundIndex ||
      (next.roundIndex === previous.roundIndex &&
        (order[next.phase] < order[previous.phase] || (previous.ownSubmitted && !next.ownSubmitted))))) return;
    latestState.current = next;
    if (inputRound.current !== next.roundIndex) {
      inputRound.current = next.roundIndex;
      heardTarget.current = null;
      setFrequency(660);
      setColour({ l: 65, c: 18, h: 180 });
    }
    if (next.gameId === "frequency_recall_v2" && next.phase === "reveal" && typeof next.target === "number") {
      heardTarget.current = { round: next.roundIndex, hz: next.target };
    }
    setState(next);
  }, []);

  const reload = useCallback(async () => {
    if (reloadInFlight.current || submitting.current) return;
    reloadInFlight.current = true;
    try {
      const requestedAt = Date.now();
      const next = await recallRequest<RecallRoundState>(`/api/matches/${matchId}/round`);
      if (!submitting.current) {
        const offset = estimateServerClockOffset(next.serverNow, requestedAt, Date.now());
        if (offset !== null) {
          clockOffsetRef.current = offset;
          setClockOffset(offset);
        }
        applyState(next);
        if (next.phase === "complete") onComplete();
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not load the round.");
    } finally {
      reloadInFlight.current = false;
    }
  }, [applyState, matchId, onComplete, onError]);

  useEffect(() => {
    const initial = window.setTimeout(() => void reload(), 0);
    const poll = window.setInterval(() => {
      const current = latestState.current;
      const deadline = current?.phaseEndsAt ? Date.parse(current.phaseEndsAt) : 0;
      const nearBoundary = !deadline || deadline - (Date.now() + clockOffsetRef.current) <= 900;
      const waiting = current?.phase === "waiting" || current?.phase === "countdown" || current?.phase === "reveal";
      if (nearBoundary || waiting || Date.now() - lastPollAt.current >= 1_000) {
        lastPollAt.current = Date.now();
        void reload();
      }
    }, 300);
    const clock = window.setInterval(() => setNow(Date.now()), 50);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [reload]);

  useEffect(() => {
    if (!state || state.phase !== "reveal" || gameId !== "frequency_recall_v2") return;
    if (playedRound.current === state.roundIndex || typeof state.target !== "number") return;
    playedRound.current = state.roundIndex;
    void audio.playToneSequence([state.target]);
  }, [audio, gameId, state]);

  useEffect(() => {
    if (state?.phase !== "answer" && state?.phase !== "reveal") audio.stopPlayback();
  }, [audio, state?.phase]);
  useEffect(() => () => audio.stopPlayback(), [audio]);

  async function replayTarget() {
    if (!state || (state.phase !== "reveal" && state.phase !== "answer")) return;
    const cached = heardTarget.current;
    if (cached?.round === state.roundIndex) {
      await audio.playToneSequence([cached.hz]);
      return;
    }
    try {
      await audio.playRemoteTone(`/api/matches/${matchId}/round/audio?roundIndex=${state.roundIndex}`);
    } catch {
      onError("Could not replay the target. Try again before the round closes.");
    }
  }

  async function submit() {
    if (!state || state.phase !== "answer" || submitting.current || state.ownSubmitted) return;
    submitting.current = true;
    audio.stopPlayback();
    setSending(true);
    try {
      const next = await recallRequest<RecallRoundState>(`/api/matches/${matchId}/round`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundIndex: state.roundIndex,
          answer: gameId === "frequency_recall_v2" ? frequency : colour,
        }),
      });
      applyState(next);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not lock the round.");
    } finally {
      submitting.current = false;
      setSending(false);
      void reload();
    }
  }

  if (!state) {
    return <span className="search-pulse h-3 w-3 bg-[var(--accent)]" aria-label="Loading round" />;
  }
  const remainingMs = state.phaseEndsAt
    ? Math.max(0, Date.parse(state.phaseEndsAt) - (now + clockOffset))
    : 0;

  return (
    <div className="sequential-recall secure-recall">
      <div className="sequential-progress">
        <span>Round {state.roundIndex + 1} of 5</span>
        <strong>You {state.ownScore.toFixed(1)} · Opponent {state.opponentScore.toFixed(1)}</strong>
      </div>
      <div className="qd-round-track" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => <i key={index} data-step={index < state.roundIndex || (index === state.roundIndex && (state.phase === "feedback" || state.phase === "complete")) ? "done" : index === state.roundIndex ? "current" : "upcoming"} />)}
      </div>
      {gameId === "frequency_recall_v2" && (state.phase === "reveal" || state.phase === "answer") ? (
        <div className="sequential-answer frequency-controls">
          <p>Replay the target as needed, then estimate its pitch.</p>
          <div className="frequency-audio-actions">
            <button type="button" className="recall-replay" disabled={sending || remainingMs <= 0} onClick={() => void replayTarget()}>
              Replay target
            </button>
          </div>
          <label className="game-range">
            <span>Frequency</span>
            <input type="range" min={120} max={2000} value={frequency} disabled={sending || remainingMs <= 0} onChange={(event) => setFrequency(Number(event.target.value))} />
            <strong>{frequency} Hz</strong>
          </label>
          <LockAnswerButton label="Lock round" className="recall-confirm" disabled={state.phase !== "answer" || remainingMs <= 0} pending={sending} remainingMs={remainingMs} onClick={() => void submit()} />
        </div>
      ) : state.phase === "reveal" ? (
        <div className="colour-round-reveal">
          <span style={{ background: colourCss(state.target as RecallColour) }} />
          <strong>Remember this colour</strong>
          <span className="recall-phase-time">{(remainingMs / 1000).toFixed(1)}s</span>
        </div>
      ) : state.phase === "answer" ? (
        <div className="sequential-answer">
          <div className="colour-round-answer">
            <div className="colour-preview" aria-label="Your reconstructed colour" style={{ background: colourCss(colour) }} />
            {(["l", "c", "h"] as const).map((key) => (
              <label className="game-range" key={key}>
                <span>{key === "l" ? "Lightness" : key === "c" ? "Chroma" : "Hue"}</span>
                <input
                  type="range"
                  min={key === "l" ? 35 : key === "c" ? 4 : 0}
                  max={key === "l" ? 90 : key === "c" ? 32 : 359}
                  value={colour[key]}
                  disabled={sending || remainingMs <= 0}
                  onChange={(event) => setColour((current) => ({ ...current, [key]: Number(event.target.value) }))}
                />
                <strong>{colour[key]}</strong>
              </label>
            ))}
          </div>
          <LockAnswerButton label="Lock round" className="recall-confirm" disabled={remainingMs <= 0} pending={sending} remainingMs={remainingMs} onClick={() => void submit()} />
        </div>
      ) : state.phase === "waiting" ? (
        <div className="sequential-complete">
          <strong>Answer locked</strong>
          <span>{state.opponentSubmitted ? "Resolving round…" : "Waiting for opponent or the round deadline."}</span>
          <span className="recall-phase-time">{(remainingMs / 1000).toFixed(1)}s</span>
        </div>
      ) : state.phase === "feedback" && state.feedback ? (
        <Feedback feedback={state.feedback} remainingMs={remainingMs} />
      ) : (
        <span className="search-pulse h-3 w-3 bg-[var(--accent)]" aria-label="Finalizing match" />
      )}
    </div>
  );
}
