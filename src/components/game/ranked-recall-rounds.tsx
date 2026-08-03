"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    <div className="recall-feedback" aria-live="polite">
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
        <div><span>Round score</span><strong>{feedback.score.toFixed(1)}<small>/10</small></strong></div>
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
  const [frequency, setFrequency] = useState(660);
  const [colour, setColour] = useState<RecallColour>({ l: 65, c: 18, h: 180 });
  const [sending, setSending] = useState(false);
  const playedRound = useRef<number | null>(null);
  const inputRound = useRef<number | null>(null);
  const audio = useMemo(() => AudioManager.shared(), []);

  const applyState = useCallback((next: RecallRoundState) => {
    if (inputRound.current !== next.roundIndex) {
      inputRound.current = next.roundIndex;
      setFrequency(660);
      setColour({ l: 65, c: 18, h: 180 });
    }
    setState(next);
  }, []);

  const reload = useCallback(async () => {
    try {
      const next = await recallRequest<RecallRoundState>(`/api/matches/${matchId}/round`);
      applyState(next);
      if (next.phase === "complete") onComplete();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not load the round.");
    }
  }, [applyState, matchId, onComplete, onError]);

  useEffect(() => {
    const initial = window.setTimeout(() => void reload(), 0);
    const poll = window.setInterval(() => void reload(), 250);
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

  async function submit() {
    if (!state || state.phase !== "answer" || sending) return;
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
      await reload();
    } finally {
      setSending(false);
    }
  }

  if (!state) {
    return <span className="search-pulse h-3 w-3 bg-[var(--accent)]" aria-label="Loading round" />;
  }
  const remainingMs = state.phaseEndsAt
    ? Math.max(0, Date.parse(state.phaseEndsAt) - now)
    : 0;

  return (
    <div className="sequential-recall secure-recall">
      <div className="sequential-progress">
        <span>Round {state.roundIndex + 1} of 5</span>
        <strong>You {state.ownScore.toFixed(1)} · Opponent {state.opponentScore.toFixed(1)}</strong>
      </div>
      {state.phase === "reveal" ? (
        gameId === "frequency_recall_v2" ? (
          <div className="frequency-reveal">
            <span className="frequency-wave" aria-hidden="true">∿</span>
            <strong>Listen</strong>
            <span className="recall-phase-time">{(remainingMs / 1000).toFixed(1)}s</span>
          </div>
        ) : (
          <div className="colour-round-reveal">
            <span style={{ background: colourCss(state.target as RecallColour) }} />
            <strong>Remember this colour</strong>
            <span className="recall-phase-time">{(remainingMs / 1000).toFixed(1)}s</span>
          </div>
        )
      ) : state.phase === "answer" ? (
        <div className="sequential-answer">
          {gameId === "frequency_recall_v2" ? (
            <>
              <p>Tune the pitch you just heard.</p>
              <label className="game-range">
                <span>Frequency</span>
                <input type="range" min={120} max={2000} value={frequency} onChange={(event) => setFrequency(Number(event.target.value))} />
                <strong>{frequency}</strong>
              </label>
            </>
          ) : (
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
                    onChange={(event) => setColour((current) => ({ ...current, [key]: Number(event.target.value) }))}
                  />
                  <strong>{colour[key]}</strong>
                </label>
              ))}
            </div>
          )}
          <button type="button" className="recall-confirm" disabled={sending} onClick={() => void submit()}>
            {sending ? "Locking…" : `Lock round · ${(remainingMs / 1000).toFixed(1)}s`}
          </button>
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
