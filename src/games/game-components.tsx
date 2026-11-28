"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FREQUENCY_ANSWER_MS, FREQUENCY_FEEDBACK_MS } from "./timing-pass";
import { LockAnswerButton } from "@/components/game/lock-answer-button";
import { RecallVisual } from "@/components/results/recall-visual";
import type { GameComponentProps, Submission } from "./types";
import { AudioManager } from "../lib/audio/audio-manager";
import {
  normalizeTypingInput,
  TYPING_SPRINT_DURATION_MS,
  TYPING_SPRINT_SUBMISSION_ALLOWANCE,
  typingSprintStatistics,
} from "./typing-sprint";
import {
  MEMORY_GRID_FLASH_MS,
  MEMORY_GRID_REVEAL_DURATION_MS,
} from "./memory-grid-timing";
import {
  colourRoundFeedback,
  frequencyRoundFeedback,
  type RecallColour,
  type RecallRoundFeedback,
} from "./recall-rounds";
import { appendRhythmTap, haveAllRhythmTaps } from "./rhythm-input";
import { RHYTHM_COUNT } from "./rhythm-input";

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="game-range">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <strong>{Math.round(value)}</strong>
    </label>
  );
}

function useSubmitInitialValidAnswer(
  disabled: boolean | undefined,
  onChange: GameComponentProps["onChange"],
  submission: Submission,
) {
  const submitted = useRef(false);
  useEffect(() => {
    if (disabled || submitted.current) return;
    submitted.current = true;
    onChange(submission, true);
  }, [disabled, onChange, submission]);
}

export function MemoryGridGame({
  challenge,
  disabled,
  phaseElapsedMs = 0,
  onChange,
}: GameComponentProps) {
  const size = Number(challenge.size ?? 4);
  const revealed = (challenge.highlightedCells as number[] | undefined) ?? [];
  const [selected, setSelected] = useState<number[]>([]);
  const revealing = revealed.length > 0;
  const targetCount = Number(challenge.targetCount ?? 0);
  const flashMs = Number(challenge.flashMs ?? MEMORY_GRID_FLASH_MS);
  const showingPattern = revealing && phaseElapsedMs < flashMs;
  const ordered = challenge.ordered===true;
  const visibleOrder = Math.min(revealed.length-1,Math.floor(phaseElapsedMs/Math.max(1,flashMs/revealed.length)));
  const retentionRemainingMs = Math.max(
    0,
    Number(challenge.revealMs ?? MEMORY_GRID_REVEAL_DURATION_MS) - phaseElapsedMs,
  );
  return (
    <div className={`memory-grid-shell${targetCount ? " memory-grid-xl" : ""}`}>
      {!revealing && targetCount > 0 && <p className="memory-phase-status">{selected.length}/{targetCount} selected</p>}
      <div
        className={`memory-board${revealing && !showingPattern ? " is-retaining" : ""}`}
        style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
      >
        {Array.from({ length: size * size }, (_, cell) => {
          const active =
            (showingPattern && (ordered ? revealed[visibleOrder]===cell : revealed.includes(cell))) ||
            selected.includes(cell);
          return (
            <button
              type="button"
              aria-label={`Cell ${cell + 1}`}
              aria-pressed={selected.includes(cell)}
              disabled={disabled || revealing || (targetCount > 0 && selected.length >= targetCount && !selected.includes(cell))}
              className={active ? "is-active" : ""}
              key={cell}
              onClick={() => {
                const next = selected.includes(cell)
                  ? selected.filter((value) => value !== cell)
                  : [...selected, cell];
                setSelected(next);
                onChange({ selectedCells: next }, next.length > 0);
              }}
            >{ordered && showingPattern && revealed[visibleOrder]===cell ? visibleOrder+1 : ordered && selected.includes(cell) ? selected.indexOf(cell)+1 : null}</button>
          );
        })}
      </div>
      {revealing && (
        <p className="memory-phase-status" aria-live="polite">
          {showingPattern
            ? ordered ? `Memorize the order · ${visibleOrder+1}/${revealed.length}` : "Memorize"
            : `Hold · ${(retentionRemainingMs / 1000).toFixed(1)}s`}
        </p>
      )}
    </div>
  );
}

export function FrequencyRecallGame({
  challenge,
  disabled,
  onChange,
}: GameComponentProps) {
  const target = (challenge.frequencies as number[] | undefined) ?? [];
  const [guesses, setGuesses] = useState([440, 660, 880]);
  const audio = AudioManager.shared();
  const update = (index: number, value: number) => {
    const next = guesses.map((current, cursor) => (cursor === index ? value : current));
    setGuesses(next);
    onChange({ guessesHz: next }, true);
  };
  return (
    <div className="game-stack">
      {target.length > 0 && (
        <button className="stimulus-button" type="button" onClick={() => audio.playToneSequence(target)}>
          Replay tone sequence
        </button>
      )}
      {guesses.map((guess, index) => (
        <Range
          key={index}
          label={`Tone ${index + 1}`}
          value={guess}
          min={120}
          max={2000}
          disabled={disabled}
          onChange={(value) => update(index, value)}
        />
      ))}
    </div>
  );
}

function RoundTrack({ completed, active, count = 5 }: { completed: number; active: number; count?: number }) {
  return (
    <div className="qd-round-track" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => <i key={index} data-step={index < completed ? "done" : index === active ? "current" : "upcoming"} />)}
    </div>
  );
}

export function FrequencyRecallV2Game({ challenge, disabled, practiceOpponentSubmission, onChange }: GameComponentProps) {
  const frequencies = useMemo(() => (challenge.frequencies as number[] | undefined) ?? [], [challenge.frequencies]);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<"reveal" | "answer" | "feedback" | "complete">("reveal");
  const [guess, setGuess] = useState(660);
  const [guesses, setGuesses] = useState<(number | null)[]>([]);
  const [feedback, setFeedback] = useState<RecallRoundFeedback | null>(null);
  const [deadline, setDeadline] = useState(0);
  const roundAnswerMs = Number(challenge.roundAnswerMs ?? FREQUENCY_ANSWER_MS);
  const [remainingMs, setRemainingMs] = useState(roundAnswerMs);
  const [audioError, setAudioError] = useState(false);
  const [retry, setRetry] = useState(0);
  const resolvedRound = useRef(-1);
  const onChangeRef = useRef(onChange);
  const audio = useMemo(() => AudioManager.shared(), []);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    if (disabled || phase !== "reveal" || !frequencies[round]) return;
    let active = true;
    void audio.playToneSequence([frequencies[round]], true).then(played => {
      if (!active) return;
      if (!played) { setAudioError(true); return; }
      setDeadline(Date.now() + roundAnswerMs);
      setRemainingMs(roundAnswerMs);
      setPhase("answer");
    }).catch(() => { if (active) setAudioError(true); });
    return () => { active = false; audio.stopPlayback(); };
  }, [audio, disabled, frequencies, phase, round, retry, roundAnswerMs]);
  const confirmRound = useCallback((answer: number | null) => {
    if (disabled || phase !== "answer" || resolvedRound.current === round) return;
    resolvedRound.current = round;
    audio.stopPlayback();
    const next = [...guesses, answer];
    setGuesses(next);
    setFeedback(frequencyRoundFeedback(frequencies[round], answer));
    onChangeRef.current({ guessesHz: Array.from({length: frequencies.length}, (_,i)=>next[i] ?? null) }, false);
    setPhase("feedback");
  }, [disabled, phase, round, audio, guesses, frequencies]);
  useEffect(() => {
    if (phase !== "answer" || disabled) return;
    const tick = () => {
      const remaining = Math.max(0, deadline - Date.now());
      setRemainingMs(remaining);
      if (remaining === 0) confirmRound(null);
    };
    const interval = window.setInterval(tick, 50);
    return () => window.clearInterval(interval);
  }, [phase, deadline, disabled, confirmRound]);
  useEffect(() => {
    if (phase !== "feedback" || disabled) return;
    const timer = window.setTimeout(() => {
      if (guesses.length >= frequencies.length) {
        setPhase("complete");
        onChangeRef.current({ guessesHz: guesses }, true);
      } else {
        setRound(value => value + 1);
        setGuess(660);
        setFeedback(null);
        setPhase("reveal");
      }
    }, FREQUENCY_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [frequencies.length, guesses, phase, disabled]);
  const total = guesses.reduce<number>((sum, value, index) => sum + frequencyRoundFeedback(frequencies[index], value).score, 0);
  return <div className="sequential-recall" aria-live="polite">
    <div className="sequential-progress"><span>Round {Math.min(round + 1, frequencies.length || 5)} of {frequencies.length || 5}</span><strong>{total.toFixed(1)}/50 scored</strong></div>
    <RoundTrack completed={guesses.length} active={round} count={frequencies.length || 5} />
    {phase === "reveal" || phase === "answer" ? <div className="sequential-answer frequency-controls">
      <p data-frequency-phase={phase}>{phase === "reveal" ? "Listen to the target tone" : "Estimate the pitch"}</p>
      {audioError && <button type="button" onClick={() => { setAudioError(false); setRetry(v=>v+1); }}>Retry sound</button>}
      <div className="frequency-audio-actions"><button type="button" className="recall-replay" disabled={disabled || phase !== "answer"} onClick={() => void audio.playToneSequence([frequencies[round]])}>Replay target</button></div>
      <Range label={`Round ${round+1} frequency`} value={guess} min={120} max={2000} disabled={disabled || phase !== "answer"} onChange={setGuess} />
      <LockAnswerButton label="Confirm round" className="recall-confirm" disabled={disabled || phase !== "answer" || remainingMs <= 0} remainingMs={phase === "answer" ? remainingMs : undefined} onClick={() => confirmRound(Date.now() < deadline ? guess : null)} />
    </div> : phase === "feedback" && feedback ? <PracticeRecallFeedback feedback={feedback} total={total}
      opponentRoundScore={frequencyRoundFeedback(frequencies[round], ((practiceOpponentSubmission?.guessesHz as number[] | undefined) ?? [])[round] ?? null).score}
      opponentTotal={guesses.reduce<number>((sum, _, index) => sum + frequencyRoundFeedback(frequencies[index], ((practiceOpponentSubmission?.guessesHz as number[] | undefined) ?? [])[index] ?? null).score, 0)} />
    : <div className="sequential-complete"><strong>Five rounds locked</strong><span>Your combined score will be shown out of 50.</span></div>}
  </div>;
}

export function ColourRecallGame({
  challenge,
  disabled,
  onChange,
}: GameComponentProps) {
  const colors = (challenge.colors as Array<{ l: number; c: number; h: number }> | undefined) ?? [];
  const [guesses, setGuesses] = useState([
    { l: 65, c: 18, h: 40 },
    { l: 65, c: 18, h: 160 },
    { l: 65, c: 18, h: 280 },
  ]);
  const update = (index: number, key: "l" | "c" | "h", value: number) => {
    const next = guesses.map((color, cursor) =>
      cursor === index ? { ...color, [key]: value } : color,
    );
    setGuesses(next);
    onChange({ colors: next }, true);
  };
  return (
    <div className="colour-game">
      {colors.length > 0 && (
        <div className="colour-stimulus">
          {colors.map((color, index) => (
            <span
              key={index}
              style={{ background: `oklch(${color.l}% ${color.c / 100} ${color.h})` }}
            />
          ))}
        </div>
      )}
      {guesses.map((color, index) => (
        <section className="colour-control" key={index}>
          <div
            className="colour-preview"
            style={{ background: `oklch(${color.l}% ${color.c / 100} ${color.h})` }}
          />
          <Range label={`Colour ${index + 1} light`} value={color.l} min={35} max={90} disabled={disabled} onChange={(value) => update(index, "l", value)} />
          <Range label="Chroma" value={color.c} min={4} max={32} disabled={disabled} onChange={(value) => update(index, "c", value)} />
          <Range label="Hue" value={color.h} min={0} max={359} disabled={disabled} onChange={(value) => update(index, "h", value)} />
        </section>
      ))}
    </div>
  );
}

export function ColourRecallV2Game({
  challenge,
  disabled,
  practiceOpponentSubmission,
  onChange,
}: GameComponentProps) {
  const colors = useMemo(
    () => (challenge.colors as RecallColour[] | undefined) ?? [],
    [challenge.colors],
  );
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<"reveal" | "answer" | "feedback" | "complete">("reveal");
  const [guess, setGuess] = useState<RecallColour>({ l: 65, c: 18, h: 180 });
  const [guesses, setGuesses] = useState<RecallColour[]>([]);
  const [feedback, setFeedback] = useState<RecallRoundFeedback | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (disabled || phase !== "reveal" || !colors[round]) return;
    const timer = window.setTimeout(() => setPhase("answer"), Number(challenge.roundRevealMs ?? 1150));
    return () => window.clearTimeout(timer);
  }, [colors, disabled, phase, round, challenge.roundRevealMs]);

  function update(key: keyof RecallColour, value: number) {
    setGuess((current) => ({ ...current, [key]: value }));
  }

  function confirmRound() {
    if (disabled || phase !== "answer") return;
    const next = [...guesses, guess];
    setGuesses(next);
    const padded = Array.from({ length: 5 }, (_, index) => next[index] ?? null);
    setFeedback(colourRoundFeedback(colors[round], guess));
    onChange({ colors: padded }, next.length === 5);
    setPhase("feedback");
  }

  useEffect(() => {
    if (phase !== "feedback") return;
    const timer = window.setTimeout(() => {
      if (guesses.length >= colors.length) {
        onChangeRef.current({ colors: guesses }, true);
        setPhase("complete");
      } else {
        setRound((value) => value + 1);
        setGuess({ l: 65, c: 18, h: 180 });
        setFeedback(null);
        setPhase("reveal");
      }
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [colors.length, guesses, phase]);

  const target = colors[round];
  return (
    <div className="sequential-recall" aria-live="polite">
      <div className="sequential-progress">
        <span>Round {Math.min(round + 1, colors.length || 5)} of {colors.length || 5}</span>
        <strong>
          {guesses.reduce(
            (sum, value, index) =>
              sum + colourRoundFeedback(colors[index], value).score,
            0,
          ).toFixed(1)}/50 scored
        </strong>
      </div>
      <RoundTrack completed={guesses.length} active={round} count={colors.length || 5} />
      {phase === "reveal" && target ? (
        <div className="colour-round-reveal">
          <span
            aria-label={`Colour ${round + 1}`}
            style={{ background: `oklch(${target.l}% ${target.c / 100} ${target.h})` }}
          />
          <strong>Remember this colour</strong>
        </div>
      ) : phase === "answer" ? (
        <div className="sequential-answer colour-round-answer">
          <div
            className="colour-preview"
            aria-label="Your reconstructed colour"
            style={{ background: `oklch(${guess.l}% ${guess.c / 100} ${guess.h})` }}
          />
          <Range label="Lightness" value={guess.l} min={35} max={90} disabled={disabled} onChange={(value) => update("l", value)} />
          <Range label="Chroma" value={guess.c} min={4} max={32} disabled={disabled} onChange={(value) => update("c", value)} />
          <Range label="Hue" value={guess.h} min={0} max={359} disabled={disabled} onChange={(value) => update("h", value)} />
          <LockAnswerButton label="Confirm round" className="recall-confirm" disabled={disabled} onClick={confirmRound} />
        </div>
      ) : phase === "feedback" && feedback ? (
        <PracticeRecallFeedback
          feedback={feedback}
          total={guesses.reduce(
            (sum, value, index) =>
              sum + colourRoundFeedback(colors[index], value).score,
            0,
          )}
          opponentRoundScore={
            colourRoundFeedback(
              colors[round],
              ((practiceOpponentSubmission?.colors as RecallColour[] | undefined) ?? [])[round] ?? null,
            ).score
          }
          opponentTotal={guesses.reduce(
            (sum, _, index) =>
              sum + colourRoundFeedback(
                colors[index],
                ((practiceOpponentSubmission?.colors as RecallColour[] | undefined) ?? [])[index] ?? null,
              ).score,
            0,
          )}
        />
      ) : (
        <div className="sequential-complete">
          <strong>Five rounds locked</strong>
          <span>Your combined score will be shown out of 50.</span>
        </div>
      )}
    </div>
  );
}

function PracticeRecallFeedback({
  feedback,
  total,
  opponentRoundScore,
  opponentTotal,
}: {
  feedback: RecallRoundFeedback;
  total: number;
  opponentRoundScore: number;
  opponentTotal: number;
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
            <div><span>Difference</span><strong>{signed(feedback.differenceHz, " Hz")}</strong></div>
            <div><span>Percent</span><strong>{signed(feedback.percentError, "%")}</strong></div>
            <div><span>Cents</span><strong>{signed(feedback.centsError)}</strong></div>
          </div>
        </>
      ) : (
        <>
          <div className="colour-feedback-swatches">
            <div><span>Target</span><i style={{ background: colourStyle(feedback.target) }} /></div>
            <div><span>Your guess</span><i style={{ background: feedback.guess ? colourStyle(feedback.guess) : "transparent" }} /></div>
          </div>
          <div className="recall-metrics recall-metrics-four">
            <div><span>Distance</span><strong>{feedback.distance}</strong></div>
            <div><span>Lightness</span><strong>{signed(feedback.lightnessDifference)}</strong></div>
            <div><span>Chroma</span><strong>{signed(feedback.chromaDifference)}</strong></div>
            <div><span>Hue · wrapped</span><strong>{signed(feedback.hueDifference, "°")}</strong></div>
          </div>
        </>
      )}
      <RecallVisual feedback={feedback} />
      <div className="recall-score-row">
        <div className="qd-round-score"><span>Round score</span><strong>{feedback.score.toFixed(2)}<small>/10</small></strong><span className="qd-score-meter" aria-hidden="true"><i style={{ transform: `scaleX(${Math.max(0, Math.min(1, feedback.score / 10))})` }} /></span></div>
        <div><span>Running total</span><strong>{total.toFixed(1)}<small>/50</small></strong></div>
        <div><span>Bot round</span><strong>{opponentRoundScore.toFixed(1)}<small>/10</small></strong></div>
        <div><span>Bot total</span><strong>{opponentTotal.toFixed(1)}<small>/50</small></strong></div>
        <div><span>Result</span><strong>{feedback.label}</strong></div>
      </div>
      <div className="recall-next"><span>Next round in 2 seconds</span><i /></div>
    </div>
  );
}

function signed(value: number | null, suffix = "") {
  return value === null ? "–" : `${value > 0 ? "+" : ""}${value}${suffix}`;
}

function colourStyle(colour: RecallColour) {
  return `oklch(${colour.l}% ${colour.c / 100} ${colour.h})`;
}

export function TimeRecallGame({ challenge, disabled, phaseElapsedMs = 0, onChange }: GameComponentProps) {
  const durations = (challenge.durations as number[] | undefined) ?? [];
  const [guesses, setGuesses] = useState([1200, 1500, 1800, 2100, 2400]);
  useSubmitInitialValidAnswer(disabled, onChange, { durationsMs: guesses });
  return (
    <div className="game-stack time-recall-controls">
      {durations.length > 0 && <PulseSequence durations={durations} elapsedMs={phaseElapsedMs} />}
      {durations.length === 0 && guesses.map((guess, index) => (
        <Range
          key={index}
          label={`Pulse ${index + 1}`}
          value={guess}
          min={700}
          max={4000}
          step={50}
          disabled={disabled}
          onChange={(value) => {
            const next = guesses.map((current, cursor) => (cursor === index ? value : current));
            setGuesses(next);
            onChange({ durationsMs: next }, true);
          }}
        />
      ))}
    </div>
  );
}

function PulseSequence({ durations, elapsedMs }: { durations: number[]; elapsedMs: number }) {
  return (
    <div className="time-pulse-list" aria-label="Five pulse durations">
      {durations.map((duration, index) => (
        <div className="time-pulse-row" key={index}>
          <span>Pulse {index + 1}</span>
          <i
            data-pulse-active={elapsedMs < duration}
            style={{ transform: `scaleX(${Math.max(0, Math.min(1, elapsedMs / duration))})` }}
          />
        </div>
      ))}
    </div>
  );
}

function ShapeSvg({ radii }: { radii: number[] }) {
  const points = radii.map((radius, index) => {
      const angle = (Math.PI * 2 * index) / radii.length - Math.PI / 2;
      const scaled = 30 + radius * 0.65;
      return { x: 100 + Math.cos(angle) * scaled, y: 100 + Math.sin(angle) * scaled };
    });
  return (
    <svg className="shape-canvas" viewBox="0 0 200 200" role="img" aria-label="Generated shape with numbered vertices">
      <polygon points={points.map(({ x, y }) => `${x},${y}`).join(" ")} />
      {points.map(({ x, y }, index) => (
        <g className="shape-point-label" key={index} aria-hidden="true">
          <circle cx={x} cy={y} r="8" />
          <text x={x} y={y}>{index + 1}</text>
        </g>
      ))}
    </svg>
  );
}

export function ShapeRecallGame({ challenge, disabled, onChange }: GameComponentProps) {
  const target = (challenge.radii as number[] | undefined) ?? [];
  const [radii, setRadii] = useState([50, 50, 50, 50, 50, 50]);
  const dragging = useRef<{ index: number; pointerId: number } | null>(null);
  const currentRadii = useRef(radii);
  useSubmitInitialValidAnswer(disabled, onChange, { radii });
  const points = radii.map((radius, index) => {
    const angle = (Math.PI * 2 * index) / radii.length - Math.PI / 2;
    const scaled = 30 + radius * 0.65;
    return { x: 100 + Math.cos(angle) * scaled, y: 100 + Math.sin(angle) * scaled };
  });
  const updatePoint = (index: number, clientX: number, clientY: number, svg: SVGSVGElement) => {
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    const x = point.x - 100;
    const y = point.y - 100;
    const angle = (Math.PI * 2 * index) / radii.length - Math.PI / 2;
    const radius = Math.max(10, Math.min(90, (x * Math.cos(angle) + y * Math.sin(angle) - 30) / 0.65));
    const next = currentRadii.current.map((value, cursor) => cursor === index ? radius : value);
    currentRadii.current = next;
    setRadii(next);
    onChange({ radii: next }, true);
  };
  return (
    <div className="shape-game">
      {target.length ? <ShapeSvg radii={target} /> : (
        <svg
          className="shape-canvas"
          style={{ touchAction: "none" }}
          viewBox="0 0 200 200"
          role="group"
          aria-label="Drag the six points to rebuild the shape"
          onPointerMove={(event) => {
            const active = dragging.current;
            if (active && active.pointerId === event.pointerId && !disabled) updatePoint(active.index, event.clientX, event.clientY, event.currentTarget);
          }}
          onPointerUp={(event) => { if (dragging.current?.pointerId === event.pointerId) dragging.current = null; }}
          onPointerCancel={(event) => { if (dragging.current?.pointerId === event.pointerId) dragging.current = null; }}
          onLostPointerCapture={(event) => { if (dragging.current?.pointerId === event.pointerId) dragging.current = null; }}
        >
          <polygon points={points.map(({ x, y }) => `${x},${y}`).join(" ")} />
          {points.map(({ x, y }, index) => (
            <g
              key={index}
              className="shape-point-label"
              role="slider"
              aria-label={`Point ${index + 1}`}
              aria-valuemin={10}
              aria-valuemax={90}
              aria-valuenow={Math.round(radii[index])}
              tabIndex={disabled ? -1 : 0}
              onPointerDown={(event) => {
                if (disabled || dragging.current || event.button !== 0) return;
                const svg = event.currentTarget.ownerSVGElement;
                if (!svg) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                dragging.current = { index, pointerId: event.pointerId };
                updatePoint(index, event.clientX, event.clientY, svg);
              }}
              onKeyDown={(event) => {
                const delta = event.key === "ArrowUp" || event.key === "ArrowRight" ? 2 : event.key === "ArrowDown" || event.key === "ArrowLeft" ? -2 : 0;
                if (!delta || disabled) return;
                event.preventDefault();
                const next = currentRadii.current.map((value, cursor) => cursor === index ? Math.max(10, Math.min(90, value + delta)) : value);
                currentRadii.current = next;
                setRadii(next);
                onChange({ radii: next }, true);
              }}
              aria-disabled={disabled}
            >
              <circle cx={x} cy={y} r="10" />
              <text x={x} y={y}>{index + 1}</text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

export function RhythmRecallGame({ challenge, disabled, onChange }: GameComponentProps) {
  const rhythms = (challenge.rhythms as number[][] | undefined) ?? [];
  const tapCounts = (challenge.tapCounts as number[] | undefined) ?? rhythms.map((rhythm) => rhythm.length);
  const [taps, setTaps] = useState<number[][]>(Array.from({ length: RHYTHM_COUNT }, () => []));
  const [round, setRound] = useState(0);
  const started = useRef<number | null>(null);
  const audio = AudioManager.shared();
  const tapLimit = tapCounts[round] ?? 0;
  const captured = tapLimit > 0 && (taps[round]?.length ?? 0) >= tapLimit;
  const recording = taps[round].length > 0 && !captured;
  const tap = () => {
    if (disabled || tapLimit === 0) return;
    const now = performance.now();
    if (started.current === null) started.current = now;
    const appended = appendRhythmTap(
      taps,
      round,
      now - started.current,
      tapLimit,
    );
    if (!appended.accepted) return;
    const next = appended.taps;
    setTaps(next);
    onChange({ tapsMs: next }, haveAllRhythmTaps(next, tapCounts));
  };
  return (
    <div className="game-stack">
      {rhythms.length > 0 && (
        <button className="stimulus-button" type="button" onClick={() => audio.playRhythmSequence(rhythms)}>
          Replay rhythms
        </button>
      )}
      <div className="round-tabs">
        {Array.from({ length: RHYTHM_COUNT }, (_, value) => (
          <button
            type="button"
            key={value}
            className={round === value ? "is-active" : ""}
            aria-pressed={round === value}
            disabled={disabled || (recording && round !== value)}
            onClick={() => {
              if (round === value) return;
              setRound(value);
              started.current = null;
            }}
          >
            Rhythm {value + 1} · {taps[value].length}/{tapCounts[value] ?? 0} taps
          </button>
        ))}
      </div>
      <p className="muted">Finish one rhythm before switching. Missed a beat? Retry this rhythm while the clock is running.</p>
      <button
        type="button"
        className="tap-pad"
        disabled={disabled || tapLimit === 0 || captured}
        onClick={tap}
      >
        {captured
          ? "Rhythm captured"
          : `Tap the beat · ${taps[round]?.length ?? 0}/${tapLimit}`}
      </button>
      <button
        type="button"
        className="stimulus-button"
        disabled={disabled || taps[round].length === 0}
        onClick={() => {
          const next = taps.map((values, index) => index === round ? [] : values);
          started.current = null;
          setTaps(next);
          onChange({ tapsMs: next }, false);
        }}
      >
        Retry this rhythm
      </button>
    </div>
  );
}

export function DotEstimateGame({ challenge, disabled, onChange }: GameComponentProps) {
  const dots = (challenge.dots as Array<{ x: number; y: number; r: number }> | undefined) ?? [];
  const [estimate, setEstimate] = useState(70);
  useSubmitInitialValidAnswer(disabled, onChange, { estimate });
  return (
    <div className="game-stack">
      {dots.length > 0 && (
        <div className="dot-field">
          {dots.map((dot, index) => (
            <i key={index} style={{ left: `${dot.x}%`, top: `${dot.y}%`, width: dot.r, height: dot.r }} />
          ))}
        </div>
      )}
      {!dots.length && (
        <Range label="Your estimate" value={estimate} min={20} max={150} disabled={disabled} onChange={(value) => {
          setEstimate(value);
          onChange({ estimate: value }, true);
        }} />
      )}
    </div>
  );
}

export function NumberOrderGame({ challenge, disabled, onChange }: GameComponentProps) {
  const numbers = (challenge.numbers as Array<{ value: number; x: number; y: number }> | undefined) ?? [];
  const [order, setOrder] = useState<number[]>([]);
  return (
    <div className="number-field" aria-label="Number selection grid">
      {numbers.map((number, index) => (
        <button
          type="button"
          disabled={disabled || order.includes(index)}
          data-picked={order.includes(index) ? "true" : undefined}
          key={index}
          aria-label={`Select ${number.value}`}
          style={{ left: `clamp(22px, ${number.x}%, calc(100% - 22px))`, top: `clamp(22px, ${number.y}%, calc(100% - 22px))` }}
          onClick={() => {
            const next = [...order, index];
            setOrder(next);
            onChange({ order: next }, next.length === numbers.length);
          }}
        >
          {order.includes(index) ? <span className="qd-picked-mark" aria-hidden="true">✓</span> : number.value}
        </button>
      ))}
    </div>
  );
}

export function OddOneOutGame({ challenge, disabled, onChange }: GameComponentProps) {
  const tiles = (challenge.tiles as Array<{ glyph: string; rotation: number }> | undefined) ?? [];
  const [selected, setSelected] = useState(-1);
  return (
    <div className="odd-grid">
      {tiles.map((tile, index) => (
        <button
          type="button"
          disabled={disabled}
          className={selected === index ? "is-selected" : ""}
          aria-label={`Tile ${index + 1}`}
          aria-pressed={selected === index}
          key={index}
          onClick={() => {
            setSelected(index);
            onChange({ selectedIndex: index }, true);
          }}
        >
          <span style={{ transform: `rotate(${tile.rotation}deg)` }}>{tile.glyph}</span>
        </button>
      ))}
    </div>
  );
}

export function PatternCompleteGame({ challenge, disabled, onChange }: GameComponentProps) {
  const puzzles = (challenge.puzzles as Array<{ sequence: string[]; options: string[] }> | undefined) ?? [];
  const [answers, setAnswers] = useState<number[]>([]);
  return (
    <div className="pattern-list">
      {puzzles.map((puzzle, index) => (
        <section key={index}>
          <div className="pattern-sequence">{puzzle.sequence.map((value, cursor) => <span key={cursor}>{value}</span>)}</div>
          <div className="pattern-options">
            {puzzle.options.map((option, optionIndex) => (
              <button
                type="button"
                disabled={disabled}
                className={answers[index] === optionIndex ? "is-selected" : ""}
                aria-pressed={answers[index] === optionIndex}
                key={optionIndex}
                onClick={() => {
                  const next = [...answers];
                  next[index] = optionIndex;
                  setAnswers(next);
                  onChange({ answers: next }, next.filter(Number.isInteger).length === puzzles.length);
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function TypingSprintGame({
  challenge,
  disabled,
  preparing = false,
  answerDurationMs = TYPING_SPRINT_DURATION_MS,
  answerRemainingMs = answerDurationMs,
  onReady,
  onChange,
}: GameComponentProps) {
  const text = String(challenge.text ?? "");
  const words = (challenge.words as string[] | undefined) ?? text.split(" ");
  const input = useRef<HTMLInputElement>(null);
  const wordViewport = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const initialized = useRef(false);
  const [typed, setTyped] = useState("");
  const elapsedMs = preparing ? 0 : Math.max(0, answerDurationMs - answerRemainingMs);

  useEffect(() => {
    if (disabled || initialized.current) return;
    initialized.current = true;
    onChange({ typed: "" }, true);
  }, [disabled, onChange]);

  function updateTyped(rawValue: string) {
    if (disabled || preparing) {
      if (input.current) input.current.value = "";
      return;
    }
    const sanitized = normalizeTypingInput(
      rawValue.toLowerCase().replace(/[^a-z ]/g, ""),
    ).slice(0, text.length + TYPING_SPRINT_SUBMISSION_ALLOWANCE);
    setTyped(sanitized);
    onChange({ typed: sanitized }, true);
  }

  const normalized = normalizeTypingInput(typed);
  const attempts = normalized.trim() ? normalized.trim().split(" ") : [];
  const currentWord = Math.min(
    words.length - 1,
    Math.max(0, normalized.endsWith(" ") ? attempts.length : attempts.length - 1),
  );
  const windowStart = Math.max(0, currentWord - 10);
  const visibleWords = words.slice(windowStart, windowStart + 42);
  useEffect(() => {
    const viewport = wordViewport.current;
    const current = viewport?.querySelector<HTMLElement>(".typing-word.is-current");
    if (!viewport || !current) return;
    const bounds = viewport.getBoundingClientRect();
    const wordBounds = current.getBoundingClientRect();
    if (wordBounds.top < bounds.top) viewport.scrollTop += wordBounds.top - bounds.top;
    else if (wordBounds.bottom > bounds.bottom) viewport.scrollTop += wordBounds.bottom - bounds.bottom;
  }, [currentWord, windowStart]);
  const statistics = typingSprintStatistics(text, typed, elapsedMs);
  const remainingSeconds = Math.max(0, answerDurationMs - elapsedMs) / 1000;

  return (
    <section
      className="typing-sprint"
      aria-label="Typing Sprint input"
      onClick={() => {
        if (disabled && !preparing) return;
        input.current?.focus({ preventScroll: true });
        if (preparing) onReady?.();
      }}
      onDrop={(event) => event.preventDefault()}
    >
      <div className="typing-stats">
        <span><small>WPM</small><strong>{Math.round(statistics.netWpm)}</strong></span>
        <span><small>Accuracy</small><strong>{Math.round(statistics.accuracy * 100)}%</strong></span>
        <span><small>Errors</small><strong>{statistics.incorrectChars}</strong></span>
        <span><small>Time</small><strong>{remainingSeconds.toFixed(1)}</strong></span>
      </div>

      <div className="typing-words" aria-hidden="true" ref={wordViewport}>
        {!preparing && visibleWords.map((word, visibleIndex) => {
          const wordIndex = windowStart + visibleIndex;
          const attempt = attempts[wordIndex] ?? "";
          const active = wordIndex === currentWord;
          const completed = wordIndex < currentWord;
          return (
            <span
              className={`typing-word${active ? " is-current" : ""}${completed ? " is-complete" : ""}`}
              key={`${wordIndex}:${word}`}
            >
              {Array.from(word).map((character, characterIndex) => {
                const entered = attempt[characterIndex];
                const className = entered === undefined
                  ? active && characterIndex === attempt.length
                    ? "is-caret"
                    : "is-untyped"
                  : entered === character
                    ? "is-correct"
                    : "is-incorrect";
                return <i className={className} key={characterIndex}>{character}</i>;
              })}
              {attempt.length > word.length &&
                Array.from(attempt.slice(word.length)).map((character, index) => (
                  <i className="is-extra" key={`extra:${index}`}>{character}</i>
                ))}
            </span>
          );
        })}
      </div>

      {preparing ? (
        <button type="button" className="recall-confirm typing-ready" onClick={(event) => {
          event.stopPropagation();
          input.current?.focus({ preventScroll: true });
          onReady?.();
        }}>Ready keyboard</button>
      ) : (
        <p className="typing-focus-copy">{disabled ? "Time is up." : "Tap here to focus if needed."}</p>
      )}
      <input
        ref={input}
        className="typing-capture-input"
        aria-label="Type the displayed words"
        aria-describedby="typing-sprint-instructions"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        disabled={disabled && !preparing}
        inputMode="text"
        maxLength={text.length + TYPING_SPRINT_SUBMISSION_ALLOWANCE}
        spellCheck={false}
        value={typed}
        onChange={(event) => {
          if (!composing.current) updateTyped(event.currentTarget.value);
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          updateTyped(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (preparing || disabled || event.key === "Enter") event.preventDefault();
          if (event.key === " " && (typed.length === 0 || typed.endsWith(" "))) {
            event.preventDefault();
          }
        }}
        onPaste={(event) => event.preventDefault()}
        onDrop={(event) => event.preventDefault()}
      />
      <span className="sr-only" id="typing-sprint-instructions">
        Type lowercase words separated by one space. Paste and drag-and-drop are disabled.
      </span>
      {!preparing && (
        <span className="sr-only" aria-live="polite">
          Word {currentWord + 1}: {words[currentWord] ?? "Complete"}
        </span>
      )}
    </section>
  );
}

export function ReactionTestGame({ challenge, disabled, onChange }: GameComponentProps) {
  const waits = (challenge.waits as number[] | undefined) ?? [];
  const tapWindow = Number(challenge.tapWindowMs ?? 2000);
  const [trial, setTrial] = useState(0);
  const [go, setGo] = useState(false);
  const [times, setTimes] = useState<number[]>([]);
  const shownAt = useRef(0);
  const finishedTrial = useRef(-1);
  const falseStarts = useRef(0);
  const onChangeRef = useRef(onChange);
  const wait = waits[trial];
  const count = waits.length;
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const finish = useCallback((time: number, falseStart: boolean) => {
    if (disabled || trial >= count || finishedTrial.current === trial) return;
    finishedTrial.current = trial;
    if (falseStart) falseStarts.current++;
    const next = [...times, Math.min(tapWindow, Math.max(0, Math.round(time)))];
    setGo(false);
    setTimes(next);
    setTrial(trial + 1);
    onChangeRef.current({ reactionTimesMs: next, falseStarts: falseStarts.current }, next.length === count);
  }, [disabled, trial, count, times, tapWindow]);
  useEffect(() => {
    if (disabled || trial >= count || wait === undefined) return;
    let timeout: number | undefined;
    const signal = window.setTimeout(() => {
      shownAt.current = performance.now();
      setGo(true);
      timeout = window.setTimeout(() => finish(tapWindow, false), tapWindow);
    }, wait);
    return () => { window.clearTimeout(signal); window.clearTimeout(timeout); };
  }, [disabled, trial, count, wait, tapWindow, finish]);
  return <div className="reaction-test">
    <p aria-live="polite">Attempt {Math.min(trial + 1, count)} of {count}</p>
    <button type="button" className={go ? "reaction-pad is-go" : "reaction-pad"} disabled={disabled || trial >= count} onClick={() => finish(go ? performance.now() - shownAt.current : challenge.tapWindowMs ? tapWindow : 1000, !go)}>
      {trial >= count ? "Trials complete" : go ? "TAP" : "Wait…"}
    </button>
    <p>{times.length > 0 ? times.map(t => t >= tapWindow ? "Miss" : t + "ms").join(" · ") : "Wait for green."}</p>
  </div>;
}

export function TargetTapGame({ challenge, disabled, onChange }: GameComponentProps) {
  const targets = (challenge.targets as Array<{ x: number; y: number }> | undefined) ?? [];
  const [index, setIndex] = useState(0);
  const [misses, setMisses] = useState(0);
  const startedAt = useRef(0);
  const status = useRef<HTMLSpanElement>(null);
  const target = targets[index];
  const finish = (nextIndex: number, nextMisses: number) => {
    onChange(
      {
        hitCount: nextIndex,
        misses: nextMisses,
        elapsedMs: Math.round(performance.now() - (startedAt.current || performance.now())),
      },
      nextIndex >= targets.length,
    );
  };
  return (
    <div className="target-field" onClick={(event) => {
      if (disabled || !target) return;
      const statusBounds = status.current?.getBoundingClientRect();
      if (
        statusBounds &&
        event.clientX >= statusBounds.left &&
        event.clientX <= statusBounds.right &&
        event.clientY >= statusBounds.top &&
        event.clientY <= statusBounds.bottom
      ) {
        return;
      }
      if (!startedAt.current) startedAt.current = performance.now();
      const nextMisses = misses + 1;
      setMisses(nextMisses);
      finish(index, nextMisses);
    }}>
      {target && (
        <button
          aria-label={`Target ${index + 1}`}
          type="button"
          disabled={disabled}
          style={{ left: `clamp(28px, ${target.x}%, calc(100% - 28px))`, top: `clamp(28px, ${target.y}%, calc(100% - 28px))` }}
          onClick={(event) => {
            event.stopPropagation();
            if (!startedAt.current) startedAt.current = performance.now();
            const next = index + 1;
            setIndex(next);
            finish(next, misses);
          }}
        />
      )}
      <span ref={status}>{index}/{targets.length} targets · {misses} misses</span>
    </div>
  );
}

export function EmptyGame({ onChange }: GameComponentProps) {
  useEffect(() => onChange({} as Submission, false), [onChange]);
  return null;
}


export function CrypticDuelGame({ challenge, disabled, onChange }: GameComponentProps) {
  const [answer, setAnswer] = useState("");
  const [hintsUsed, setHintsUsed] = useState(0);
  const length = Number(challenge.length ?? 0);
  const hints = (challenge.hints as string[] | undefined) ?? [];
  const update = (value: string, count: number) => {
    onChange({ answer: value, hintsUsed: count }, value.length === length && length > 0);
  };
  return (
    <div className="cryptic-game">
      <p className="game-kicker">Definition + wordplay</p>
      <h2>{String(challenge.clue ?? "")}</h2>
      <label className="cryptic-input-label">
        <span>Your answer · {length} letters</span>
        <input type="text" aria-label="Cryptic answer" value={answer} maxLength={length} disabled={disabled}
          autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
          placeholder={Array.from({ length }, () => "_").join(" ")}
          onChange={(event) => { const next = event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, length); setAnswer(next); update(next, hintsUsed); }} />
      </label>
      <div className="cryptic-hint-row">
        <span>{10 - hintsUsed * 2} possible points</span>
        <button type="button" className="recall-replay" disabled={disabled || hintsUsed >= hints.length}
          onClick={() => { const next = hintsUsed + 1; setHintsUsed(next); update(answer, next); }}>
          {hintsUsed >= hints.length ? "All hints used" : "Reveal hint · −2"}
        </button>
      </div>
      <div aria-live="polite" className="cryptic-hints">
        {hints.slice(0, hintsUsed).map((hint, index) => <p key={index}><b>Hint {index + 1}</b> {hint}</p>)}
      </div>
    </div>
  );
}
