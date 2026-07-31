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

      <div className="mt-9 grid w-full max-w-3xl grid-cols-[1fr_auto_1fr] border-y border-[var(--border)] py-7 text-center">
        <ResultColumn label="YOU" side={player} accent />
        <div className="display self-center border border-[var(--accent)] px-3 py-2 text-xl text-[var(--accent)]">
          VS
        </div>
        <ResultColumn label={opponent.name} side={opponent} />
      </div>

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
    </div>
  );
}
