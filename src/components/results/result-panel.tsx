"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ShareIcon } from "@/components/ui/icons";
import type { DuelOutcome } from "@/games/types";
import { getDivision, getDivisionChange } from "@/lib/divisions";

export type ResultSide = {
  name: string;
  score: number;
  correct: number;
  incorrect: number;
  timeMs: number;
  ratingBefore: number;
  ratingAfter: number;
  summary?: string;
  details?: Record<string, number | string | boolean>;
};

export function ResultPanel({
  outcome,
  gameName,
  player,
  opponent,
  unranked = false,
  rematchWaiting = false,
  onRematch,
  onNext,
  onHome,
  rematchLabel = "Rematch",
  nextLabel = "Next opponent",
  homeLabel = "Home",
  onCreateShare,
  completionNotice,
  resultTitle,
}: {
  outcome: DuelOutcome;
  gameName?: string;
  player: ResultSide;
  opponent: ResultSide;
  unranked?: boolean;
  rematchWaiting?: boolean;
  onRematch: () => void;
  onNext: () => void;
  onHome: () => void;
  rematchLabel?: string;
  nextLabel?: string;
  homeLabel?: string;
  onCreateShare?: () => Promise<string>;
  completionNotice?: string;
  resultTitle?: string;
}) {
  const [shared, setShared] = useState(false);
  const title = resultTitle ?? (
    outcome === "win" ? "Victory" : outcome === "loss" ? "Defeat" : "Draw"
  );
  const division = getDivision(player.ratingAfter);
  const divisionChange = getDivisionChange(player.ratingBefore, player.ratingAfter);

  async function share() {
    const text = `${title} in QuickDuel${gameName ? ` ${gameName}` : ""} — ${player.summary ?? player.score.toFixed(1)} vs ${opponent.summary ?? opponent.score.toFixed(1)}.`;
    try {
      const url = onCreateShare ? await onCreateShare() : location.origin;
      if (navigator.share) {
        await navigator.share({ title: "QuickDuel result", text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
      }
      setShared(true);
      window.setTimeout(() => setShared(false), 2_000);
    } catch {
      // User-cancelled shares are intentionally silent.
    }
  }

  return (
    <section className="page-shell screen-enter flex min-h-[calc(100vh-120px)] flex-col items-center justify-center py-10">
      <h1
        className={`display text-center text-[clamp(4.5rem,15vw,9rem)] leading-[0.85] ${
          outcome === "loss" ? "text-white" : "text-[var(--accent)]"
        }`}
      >
        {title}
      </h1>
      {gameName && <p className="game-kicker mt-4">{gameName}</p>}
      {completionNotice && (
        <p className="result-completion-notice" role="status">{completionNotice}</p>
      )}
      {gameName === "Typing Sprint" && (
        <p className="result-completion-notice">
          Typing Sprint ranks net WPM. Errors reduce your score.
        </p>
      )}

      <div className="mt-9 grid w-full max-w-3xl grid-cols-[1fr_auto_1fr] border-y border-[var(--border)] py-7 text-center">
        <ResultColumn label="YOU" side={player} accent />
        <div className="display self-center border border-[var(--accent)] px-3 py-2 text-xl text-[var(--accent)]">
          VS
        </div>
        <ResultColumn label={opponent.name} side={opponent} />
      </div>

      {(gameName === "Frequency Recall" || gameName === "Colour Recall") &&
        typeof player.details?.round1Score === "number" && (
          <RecallResultBreakdown
            gameName={gameName}
            player={player}
            opponent={opponent}
          />
        )}

      <div className="mt-6 grid w-full max-w-3xl gap-5 border-b border-[var(--border)] pb-7 text-center sm:grid-cols-2">
        <div>
          <div className="text-xs tracking-[0.12em] text-[var(--muted)]">
            COMPLETION TIME
          </div>
          <div className="display mt-1 text-3xl">
            {(player.timeMs / 1000).toFixed(2)}s
          </div>
        </div>
        <div>
          <div className="text-xs tracking-[0.12em] text-[var(--muted)]">
            {unranked ? "PRACTICE MATCH" : "RATING CHANGE"}
          </div>
          {unranked ? (
            <div className="display mt-1 text-3xl text-[var(--muted)]">
              Unranked
            </div>
          ) : (
            <div className="display mt-1 text-3xl">
              {player.ratingBefore} →{" "}
              <span className="text-[var(--accent)]">{player.ratingAfter}</span>{" "}
              <span className="text-xl text-[var(--accent)]">
                {player.ratingAfter - player.ratingBefore >= 0 ? "+" : ""}
                {player.ratingAfter - player.ratingBefore}
              </span>
            </div>
          )}
          {!unranked && (
            <p className={`mt-2 text-sm ${divisionChange === "promotion" ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
              {divisionChange === "promotion"
                ? `Promoted to ${division.name}`
                : divisionChange === "demotion"
                  ? `Moved to ${division.name}`
                  : `${division.name} division`}
            </p>
          )}
        </div>
      </div>

      <div className="mt-7 grid w-full max-w-3xl gap-3 sm:grid-cols-2">
        <Button onClick={onRematch} disabled={rematchWaiting}>
          {rematchWaiting ? "Waiting for opponent" : rematchLabel}
        </Button>
        <Button variant="secondary" onClick={onNext}>
          {nextLabel}
        </Button>
        <Button variant="secondary" onClick={() => void share()}>
          <span className="flex items-center justify-center gap-2">
            <ShareIcon className="h-5 w-5" />
            {shared ? "Copied" : "Share result"}
          </span>
        </Button>
        <Button variant="quiet" onClick={onHome}>
          {homeLabel}
        </Button>
      </div>
    </section>
  );
}

function RecallResultBreakdown({
  gameName,
  player,
  opponent,
}: {
  gameName: string;
  player: ResultSide;
  opponent: ResultSide;
}) {
  const isFrequency = gameName === "Frequency Recall";
  const bestKey = isFrequency ? "closestRound" : "bestRound";
  const averageKey = isFrequency ? "averageError" : "averageDistance";
  return (
    <section className="recall-result-breakdown" aria-label="Five round breakdown">
      <div className="recall-result-heading">
        <div>
          <span>Your total</span>
          <strong>{player.score.toFixed(1)}/50</strong>
        </div>
        <p>
          {isFrequency ? "Closest" : "Best"} round {Number(player.details?.[bestKey] ?? 0)}
          {" · "}
          Average {isFrequency ? `${Number(player.details?.[averageKey] ?? 0).toFixed(1)} cents` : Number(player.details?.[averageKey] ?? 0).toFixed(4)}
        </p>
      </div>
      <div className="recall-round-table">
        <div className="recall-round-table-head">
          <span>Round</span><span>You</span><span>{opponent.name}</span>
        </div>
        {Array.from({ length: 5 }, (_, index) => (
          <div className="recall-breakdown-round" key={index}>
            <strong>Round {index + 1}</strong>
            <RecallRoundSide
              details={player.details}
              index={index + 1}
              frequency={isFrequency}
              label="You"
            />
            <RecallRoundSide
              details={opponent.details}
              index={index + 1}
              frequency={isFrequency}
              label={opponent.name}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function RecallRoundSide({
  details,
  index,
  frequency,
  label,
}: {
  details?: Record<string, number | string | boolean>;
  index: number;
  frequency: boolean;
  label: string;
}) {
  const answered = details?.[`round${index}Answered`] !== false;
  const score = Number(details?.[`round${index}Score`] ?? 0);
  if (frequency) {
    const target = Number(details?.[`round${index}Target`] ?? 0);
    const guess = Number(details?.[`round${index}Guess`] ?? 0);
    const percent = Number(details?.[`round${index}PercentError`] ?? 0);
    return (
      <div className="recall-round-side">
        <span className="recall-mobile-label">{label}</span>
        <strong>{target} Hz → {answered ? `${guess} Hz` : "No answer"}</strong>
        <span>{answered ? `${Math.abs(percent).toFixed(1)}% ${percent > 0 ? "high" : percent < 0 ? "low" : "exact"}` : "Timed out"}</span>
        <b>{score.toFixed(1)}/10</b>
      </div>
    );
  }
  const target = {
    l: Number(details?.[`round${index}TargetL`] ?? 0),
    c: Number(details?.[`round${index}TargetC`] ?? 0),
    h: Number(details?.[`round${index}TargetH`] ?? 0),
  };
  const guess = {
    l: Number(details?.[`round${index}GuessL`] ?? 0),
    c: Number(details?.[`round${index}GuessC`] ?? 0),
    h: Number(details?.[`round${index}GuessH`] ?? 0),
  };
  return (
    <div className="recall-round-side">
      <span className="recall-mobile-label">{label}</span>
      <div className="recall-result-swatches">
        <i title="Target" style={{ background: `oklch(${target.l}% ${target.c / 100} ${target.h})` }} />
        <i
          title={answered ? "Guess" : "No answer"}
          style={{ background: answered ? `oklch(${guess.l}% ${guess.c / 100} ${guess.h})` : "transparent" }}
        />
      </div>
      <span>{answered ? `Distance ${Number(details?.[`round${index}Distance`] ?? 0).toFixed(4)}` : "Timed out"}</span>
      <b>{score.toFixed(1)}/10</b>
    </div>
  );
}

function ResultColumn({
  label,
  side,
  accent = false,
}: {
  label: string;
  side: ResultSide;
  accent?: boolean;
}) {
  return (
    <div className="px-2 sm:px-8">
      <div
        className={`display truncate text-lg ${accent ? "text-[var(--accent)]" : ""}`}
      >
        {label}
      </div>
      <div className="display mt-2 text-[clamp(1.8rem,5vw,3.2rem)] leading-none">
        {side.summary ?? side.score.toFixed(1)}
      </div>
      <div className="mt-3 text-xs text-[var(--muted)] sm:text-sm">
        <span className="text-[var(--accent)]">{side.correct} correct</span>
        {" · "}
        <span className={side.incorrect ? "text-[var(--danger)]" : ""}>
          {side.incorrect} incorrect
        </span>
      </div>
      {typeof side.details?.grossWpm === "number" && (
        <div className="mt-2 text-xs text-[var(--muted)]">
          {Math.round(side.details.grossWpm)} gross WPM
          {" · "}
          {Number(side.details.completedWords ?? 0)} words completed
        </div>
      )}
    </div>
  );
}
