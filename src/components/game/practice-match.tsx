"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GameHeader } from "./game-header";
import { MemoryGrid } from "./memory-grid";
import { ResultPanel } from "@/components/results/result-panel";
import { generateChallenge } from "@/lib/game/challenge";
import { calculateScore, compareScores } from "@/lib/game/scoring";
import { simulatePracticeBot } from "@/lib/game/bot";

type Phase = "countdown" | "reveal" | "answer" | "waiting" | "result";

export function PracticeMatch({ seed }: { seed: string }) {
  const router = useRouter();
  const challenge = useMemo(() => generateChallenge(seed), [seed]);
  const bot = useMemo(
    () => simulatePracticeBot(seed, challenge.highlightedCells),
    [challenge.highlightedCells, seed],
  );
  const [startAt] = useState(() => Date.now() + 3_000);
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<number[]>([]);
  const [submittedAt, setSubmittedAt] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, []);

  const answerStart = startAt + 1_750;
  const answerEnd = answerStart + 12_000;

  const submit = useCallback(() => {
    if (submittedAt !== null) return;
    setSubmittedAt(Math.min(Date.now(), answerEnd));
  }, [answerEnd, submittedAt]);

  useEffect(() => {
    if (submittedAt !== null) return;
    const timeout = window.setTimeout(submit, Math.max(0, answerEnd - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [answerEnd, submit, submittedAt]);

  let phase: Phase;
  if (submittedAt !== null) {
    phase =
      now >= answerStart + bot.completionTimeMs ? "result" : "waiting";
  } else if (now < startAt) {
    phase = "countdown";
  } else if (now < answerStart) {
    phase = "reveal";
  } else {
    phase = "answer";
  }

  const playerTime = submittedAt
    ? Math.max(0, Math.min(12_000, submittedAt - answerStart))
    : 12_000;
  const playerScore = calculateScore(challenge.highlightedCells, selected);
  const outcome = compareScores(
    playerScore,
    playerTime,
    bot.score,
    bot.completionTimeMs,
  );

  if (phase === "result") {
    return (
      <main className="min-h-screen">
        <GameHeader
          player="You"
          playerRating={1000}
          opponent="Practice Bot"
          connected
          practice
        />
        <ResultPanel
          outcome={outcome}
          unranked
          player={{
            name: "You",
            score: playerScore.value,
            correct: playerScore.correct,
            incorrect: playerScore.incorrect,
            timeMs: playerTime,
            ratingBefore: 1000,
            ratingAfter: 1000,
          }}
          opponent={{
            name: "Practice Bot",
            score: bot.score.value,
            correct: bot.score.correct,
            incorrect: bot.score.incorrect,
            timeMs: bot.completionTimeMs,
            ratingBefore: 1000,
            ratingAfter: 1000,
          }}
          onRematch={() =>
            router.replace(`/match/practice?seed=${Date.now()}`)
          }
          onNext={() => router.push("/play")}
          onHome={() => router.push("/")}
        />
      </main>
    );
  }

  const countdown = Math.max(1, Math.ceil((startAt - now) / 1000));
  const remaining = Math.max(0, answerEnd - now);

  return (
    <main className="min-h-screen">
      <GameHeader
        player="You"
        playerRating={1000}
        opponent="Practice Bot"
        connected
        practice
      />
      <section className="page-shell screen-enter flex min-h-[calc(100vh-120px)] flex-col items-center justify-center py-8">
        {phase === "countdown" ? (
          <div className="text-center">
            <p className="display text-lg tracking-[0.12em] text-[var(--muted)]">
              Get ready
            </p>
            <div className="display mt-3 text-[10rem] leading-none text-[var(--accent)]">
              {countdown}
            </div>
          </div>
        ) : (
          <>
            <h1 className="display text-center text-[clamp(2.5rem,7vw,4.5rem)] leading-none">
              {phase === "reveal"
                ? "Memorize the grid"
                : phase === "waiting"
                  ? "Answer locked"
                  : "Select the cells"}
            </h1>
            <p className="mt-2 text-center text-sm text-[var(--muted)]">
              {phase === "reveal"
                ? "The highlights disappear in a moment."
                : phase === "waiting"
                  ? "Practice Bot is finishing."
                  : "Choose every cell you remember."}
            </p>
            {phase !== "waiting" && (
              <div className="display my-5 text-5xl tabular-nums text-[var(--accent)]">
                {phase === "reveal"
                  ? "MEMORIZE"
                  : `${(remaining / 1000).toFixed(1)}s`}
              </div>
            )}
            <MemoryGrid
              size={4}
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
            {phase === "answer" && (
              <Button
                className="mt-6 w-full max-w-[440px] text-xl"
                disabled={selected.length === 0}
                onClick={submit}
              >
                Submit answer
              </Button>
            )}
            {phase === "waiting" && (
              <div className="mt-8 flex items-center gap-3 text-sm text-[var(--muted)]">
                <span className="search-pulse h-3 w-3 bg-[var(--accent)]" />
                Practice Bot is still playing
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
