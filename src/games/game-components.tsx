"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const showingPattern = revealing && phaseElapsedMs < MEMORY_GRID_FLASH_MS;
  const retentionRemainingMs = Math.max(
    0,
    MEMORY_GRID_REVEAL_DURATION_MS - phaseElapsedMs,
  );
  return (
    <div className="memory-grid-shell">
      <div
        className={`memory-board${revealing && !showingPattern ? " is-retaining" : ""}`}
        style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
      >
        {Array.from({ length: size * size }, (_, cell) => {
          const active =
            (showingPattern && revealed.includes(cell)) ||
            selected.includes(cell);
          return (
            <button
              type="button"
              aria-label={`Cell ${cell + 1}`}
              aria-pressed={selected.includes(cell)}
              disabled={disabled || revealing}
              className={active ? "is-active" : ""}
              key={cell}
              onClick={() => {
                const next = selected.includes(cell)
                  ? selected.filter((value) => value !== cell)
                  : [...selected, cell];
                setSelected(next);
                onChange({ selectedCells: next }, next.length > 0);
              }}
            />
          );
        })}
      </div>
      {revealing && (
        <p className="memory-phase-status" aria-live="polite">
          {showingPattern
            ? "Memorize"
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

export function FrequencyRecallV2Game({
  challenge,
  disabled,
  practiceOpponentSubmission,
  onChange,
}: GameComponentProps) {
  const frequencies = useMemo(
    () => (challenge.frequencies as number[] | undefined) ?? [],
    [challenge.frequencies],
  );
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<"reveal" | "answer" | "feedback" | "complete">("reveal");
  const [guess, setGuess] = useState(660);
  const [guesses, setGuesses] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<RecallRoundFeedback | null>(null);
  const onChangeRef = useRef(onChange);
  const audio = useMemo(() => AudioManager.shared(), []);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (disabled || phase !== "reveal" || !frequencies[round]) return;
    void audio.playToneSequence([frequencies[round]]);
    const timer = window.setTimeout(() => setPhase("answer"), 1_050);
    return () => window.clearTimeout(timer);
  }, [audio, disabled, frequencies, phase, round]);

  function confirmRound() {
    if (disabled || phase !== "answer") return;
    const next = [...guesses, guess];
    setGuesses(next);
    setFeedback(frequencyRoundFeedback(frequencies[round], guess));
    onChange({ guessesHz: next }, false);
    setPhase("feedback");
  }

  useEffect(() => {
    if (phase !== "feedback") return;
    const timer = window.setTimeout(() => {
      if (guesses.length >= frequencies.length) {
        onChangeRef.current({ guessesHz: guesses }, true);
        setPhase("complete");
      } else {
        setRound((value) => value + 1);
        setGuess(660);
        setFeedback(null);
        setPhase("reveal");
      }
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [frequencies.length, guesses, phase]);

  return (
    <div className="sequential-recall" aria-live="polite">
      <div className="sequential-progress">
        <span>Round {Math.min(round + 1, frequencies.length || 5)} of {frequencies.length || 5}</span>
        <strong>
          {guesses.reduce(
            (sum, value, index) =>
              sum + frequencyRoundFeedback(frequencies[index], value).score,
            0,
          ).toFixed(1)}/50 scored
        </strong>
      </div>
      {phase === "reveal" ? (
        <div className="frequency-reveal">
          <span className="frequency-wave" aria-hidden="true">∿</span>
          <strong>Listen</strong>
          <button
            type="button"
            className="recall-replay"
            disabled={disabled}
            onClick={() => void audio.playToneSequence([frequencies[round]])}
          >
            Play tone again
          </button>
        </div>
      ) : phase === "answer" ? (
        <div className="sequential-answer">
          <p>Tune the pitch you just heard.</p>
          <Range
            label={`Round ${round + 1} frequency`}
            value={guess}
            min={120}
            max={2000}
            disabled={disabled}
            onChange={setGuess}
          />
          <button type="button" className="recall-confirm" onClick={confirmRound}>
            Confirm round
          </button>
        </div>
      ) : phase === "feedback" && feedback ? (
        <PracticeRecallFeedback
          feedback={feedback}
          total={guesses.reduce(
            (sum, value, index) =>
              sum + frequencyRoundFeedback(frequencies[index], value).score,
            0,
          )}
          opponentRoundScore={
            frequencyRoundFeedback(
              frequencies[round],
              ((practiceOpponentSubmission?.guessesHz as number[] | undefined) ?? [])[round] ?? null,
            ).score
          }
          opponentTotal={guesses.reduce(
            (sum, _, index) =>
              sum + frequencyRoundFeedback(
                frequencies[index],
                ((practiceOpponentSubmission?.guessesHz as number[] | undefined) ?? [])[index] ?? null,
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
    const timer = window.setTimeout(() => setPhase("answer"), 1_150);
    return () => window.clearTimeout(timer);
  }, [colors, disabled, phase, round]);

  function update(key: keyof RecallColour, value: number) {
    setGuess((current) => ({ ...current, [key]: value }));
  }

  function confirmRound() {
    if (disabled || phase !== "answer") return;
    const next = [...guesses, guess];
    setGuesses(next);
    setFeedback(colourRoundFeedback(colors[round], guess));
    onChange({ colors: next }, false);
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
          <button type="button" className="recall-confirm" onClick={confirmRound}>
            Confirm round
          </button>
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
    <div className="recall-feedback" aria-live="polite">
      {feedback.kind === "frequency" ? (
        <>
          <div className="recall-comparison">
            <div><span>Target</span><strong>{feedback.targetHz} Hz</strong></div>
            <div><span>Your guess</span><strong>{feedback.guessHz} Hz</strong></div>
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
      <div className="recall-score-row">
        <div><span>Round score</span><strong>{feedback.score.toFixed(1)}<small>/10</small></strong></div>
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
  return value === null ? "—" : `${value > 0 ? "+" : ""}${value}${suffix}`;
}

function colourStyle(colour: RecallColour) {
  return `oklch(${colour.l}% ${colour.c / 100} ${colour.h})`;
}

export function TimeRecallGame({ challenge, disabled, onChange }: GameComponentProps) {
  const durations = (challenge.durations as number[] | undefined) ?? [];
  const [guesses, setGuesses] = useState([1200, 1500, 1800, 2100, 2400]);
  return (
    <div className="game-stack">
      {durations.length > 0 && <PulseSequence durations={durations} />}
      {guesses.map((guess, index) => (
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

function PulseSequence({ durations }: { durations: number[] }) {
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    let active = true;
    let cursor = 0;
    const run = () => {
      if (!active || cursor >= durations.length) return;
      setPulse(cursor + 1);
      window.setTimeout(() => {
        setPulse(0);
        cursor += 1;
        window.setTimeout(run, 250);
      }, Math.min(durations[cursor], 1200));
    };
    run();
    return () => {
      active = false;
    };
  }, [durations]);
  return <div className={pulse ? "time-orb is-pulsing" : "time-orb"}>{pulse || "•"}</div>;
}

function ShapeSvg({ radii }: { radii: number[] }) {
  const points = radii
    .map((radius, index) => {
      const angle = (Math.PI * 2 * index) / radii.length - Math.PI / 2;
      const scaled = 30 + radius * 0.65;
      return `${100 + Math.cos(angle) * scaled},${100 + Math.sin(angle) * scaled}`;
    })
    .join(" ");
  return (
    <svg className="shape-canvas" viewBox="0 0 200 200" role="img" aria-label="Generated shape">
      <polygon points={points} />
    </svg>
  );
}

export function ShapeRecallGame({ challenge, disabled, onChange }: GameComponentProps) {
  const target = (challenge.radii as number[] | undefined) ?? [];
  const [radii, setRadii] = useState([50, 50, 50, 50, 50, 50]);
  return (
    <div className="shape-game">
      <ShapeSvg radii={target.length ? target : radii} />
      {!target.length && radii.map((value, index) => (
        <Range
          key={index}
          label={`Point ${index + 1}`}
          value={value}
          min={10}
          max={90}
          disabled={disabled}
          onChange={(nextValue) => {
            const next = radii.map((current, cursor) => cursor === index ? nextValue : current);
            setRadii(next);
            onChange({ radii: next }, true);
          }}
        />
      ))}
    </div>
  );
}

export function RhythmRecallGame({ challenge, disabled, onChange }: GameComponentProps) {
  const rhythms = (challenge.rhythms as number[][] | undefined) ?? [];
  const [taps, setTaps] = useState<number[][]>([[], [], []]);
  const [round, setRound] = useState(0);
  const started = useRef<number | null>(null);
  const audio = AudioManager.shared();
  const tap = () => {
    const now = performance.now();
    if (started.current === null) started.current = now;
    const next = taps.map((values, index) =>
      index === round ? [...values, Math.round(now - (started.current ?? now))] : values,
    );
    setTaps(next);
    onChange({ tapsMs: next }, next.every((values) => values.length >= 5));
  };
  return (
    <div className="game-stack">
      {rhythms.length > 0 && (
        <button className="stimulus-button" type="button" onClick={() => audio.playRhythmSequence(rhythms)}>
          Replay rhythms
        </button>
      )}
      <div className="round-tabs">
        {[0, 1, 2].map((value) => (
          <button
            type="button"
            key={value}
            className={round === value ? "is-active" : ""}
            onClick={() => {
              setRound(value);
              started.current = null;
            }}
          >
            Rhythm {value + 1} · {taps[value].length} taps
          </button>
        ))}
      </div>
      <button type="button" className="tap-pad" disabled={disabled} onClick={tap}>
        Tap the beat
      </button>
    </div>
  );
}

export function DotEstimateGame({ challenge, disabled, onChange }: GameComponentProps) {
  const dots = (challenge.dots as Array<{ x: number; y: number; r: number }> | undefined) ?? [];
  const [estimate, setEstimate] = useState(70);
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
          key={index}
          aria-label={`Select ${number.value}`}
          onClick={() => {
            const next = [...order, index];
            setOrder(next);
            onChange({ order: next }, next.length === numbers.length);
          }}
        >
          {order.includes(index) ? "✓" : number.value}
        </button>
      ))}
    </div>
  );
}

export function OddOneOutGame({ challenge, disabled, onChange }: GameComponentProps) {
  const tiles = Number(challenge.tileCount ?? 16);
  const oddIndex = challenge.showAnswer ? Number(challenge.oddIndex) : -1;
  const glyph = String(challenge.glyph ?? "◆");
  const [selected, setSelected] = useState(-1);
  return (
    <div className="odd-grid">
      {Array.from({ length: tiles }, (_, index) => (
        <button
          type="button"
          disabled={disabled}
          className={selected === index ? "is-selected" : ""}
          key={index}
          onClick={() => {
            setSelected(index);
            onChange({ selectedIndex: index }, true);
          }}
        >
          <span style={{ transform: `rotate(${index === oddIndex ? 18 : 0}deg)` }}>{glyph}</span>
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
  onChange,
}: GameComponentProps) {
  const text = String(challenge.text ?? "");
  const words = (challenge.words as string[] | undefined) ?? text.split(" ");
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const initialized = useRef(false);
  const startedAt = useRef<number | null>(null);
  const [typed, setTyped] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    onChange({ typed: "" }, true);
  }, [onChange]);

  useEffect(() => {
    if (disabled) return;
    startedAt.current ??= performance.now();
    input.current?.focus({ preventScroll: true });
    const timer = window.setInterval(() => {
      setElapsedMs(
        Math.min(
          TYPING_SPRINT_DURATION_MS,
          performance.now() - (startedAt.current ?? performance.now()),
        ),
      );
    }, 100);
    return () => window.clearInterval(timer);
  }, [disabled]);

  function updateTyped(rawValue: string) {
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
  const statistics = typingSprintStatistics(text, typed, elapsedMs);
  const remainingSeconds = Math.max(0, TYPING_SPRINT_DURATION_MS - elapsedMs) / 1000;

  return (
    <section
      className="typing-sprint"
      aria-label="Typing Sprint input"
      onClick={() => input.current?.focus({ preventScroll: true })}
      onDrop={(event) => event.preventDefault()}
    >
      <div className="typing-stats" aria-live="polite">
        <span><small>WPM</small><strong>{Math.round(statistics.netWpm)}</strong></span>
        <span><small>Accuracy</small><strong>{Math.round(statistics.accuracy * 100)}%</strong></span>
        <span><small>Errors</small><strong>{statistics.incorrectChars}</strong></span>
        <span><small>Time</small><strong>{remainingSeconds.toFixed(1)}</strong></span>
      </div>

      <div className="typing-words" aria-hidden="true">
        {visibleWords.map((word, visibleIndex) => {
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

      <p className="typing-focus-copy">
        {disabled ? "Time is up." : "Focus and keep typing…"}
      </p>
      <input
        ref={input}
        className="typing-capture-input"
        aria-label="Type the displayed words"
        aria-describedby="typing-sprint-instructions"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        disabled={disabled}
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
          if (event.key === "Enter") event.preventDefault();
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
    </section>
  );
}

export function ReactionTestGame({ challenge, disabled, onChange }: GameComponentProps) {
  const waits = useMemo(
    () => (challenge.waits as number[] | undefined) ?? [900, 1200, 1600, 1100, 1400],
    [challenge.waits],
  );
  const [trial, setTrial] = useState(0);
  const [go, setGo] = useState(false);
  const [times, setTimes] = useState<number[]>([]);
  const shownAt = useRef(0);
  useEffect(() => {
    if (trial >= waits.length) return;
    const timer = window.setTimeout(() => {
      shownAt.current = performance.now();
      setGo(true);
    }, waits[trial]);
    return () => window.clearTimeout(timer);
  }, [trial, waits]);
  const click = () => {
    if (disabled || trial >= waits.length) return;
    const next = [...times, go ? Math.round(performance.now() - shownAt.current) : 1000];
    setGo(false);
    setTimes(next);
    setTrial((value) => value + 1);
    onChange({ reactionTimesMs: next, falseStarts: next.filter((value) => value === 1000).length }, next.length === waits.length);
  };
  return (
    <button
      type="button"
      className={go ? "reaction-pad is-go" : "reaction-pad"}
      disabled={disabled || trial >= waits.length}
      onClick={click}
    >
      {trial >= waits.length ? "Trials complete" : go ? "CLICK" : "Wait…"}
    </button>
  );
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
          style={{ left: `${target.x}%`, top: `${target.y}%` }}
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
