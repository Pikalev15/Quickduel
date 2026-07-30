"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameComponentProps, Submission } from "./types";
import { AudioManager } from "../lib/audio/audio-manager";

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
  onChange,
}: GameComponentProps) {
  const size = Number(challenge.size ?? 4);
  const revealed = (challenge.highlightedCells as number[] | undefined) ?? [];
  const [selected, setSelected] = useState<number[]>([]);
  return (
    <div className="memory-board" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
      {Array.from({ length: size * size }, (_, cell) => {
        const active = revealed.includes(cell) || selected.includes(cell);
        return (
          <button
            type="button"
            aria-label={`Cell ${cell + 1}`}
            aria-pressed={selected.includes(cell)}
            disabled={disabled || revealed.length > 0}
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
    <div className="number-field">
      {numbers.map((number, index) => (
        <button
          type="button"
          disabled={disabled || order.includes(index)}
          key={index}
          style={{ left: `${number.x}%`, top: `${number.y}%` }}
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
    <button type="button" className={go ? "reaction-pad is-go" : "reaction-pad"} onClick={click}>
      {trial >= waits.length ? "Trials complete" : go ? "CLICK" : "Wait…"}
    </button>
  );
}

export function TargetTapGame({ challenge, disabled, onChange }: GameComponentProps) {
  const targets = (challenge.targets as Array<{ x: number; y: number }> | undefined) ?? [];
  const [index, setIndex] = useState(0);
  const [misses, setMisses] = useState(0);
  const startedAt = useRef(0);
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
    <div className="target-field" onClick={() => {
      if (disabled || !target) return;
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
      <span>{index}/{targets.length} targets · {misses} misses</span>
    </div>
  );
}

export function EmptyGame({ onChange }: GameComponentProps) {
  useEffect(() => onChange({} as Submission, false), [onChange]);
  return null;
}
