"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GameHeader } from "./game-header";
import { ResultPanel } from "@/components/results/result-panel";
import { compareGameResults, type GameId, type Submission } from "@/games/types";
import { getGame } from "@/games/registry";
import { GameRenderer } from "@/games/client-registry";

type Phase = "countdown" | "reveal" | "answer" | "waiting" | "result";

export function PracticeMatch({ seed, gameId }: { seed: string; gameId: GameId }) {
  const router = useRouter();
  const game = getGame(gameId);
  const challenge = useMemo(() => game.generate(seed), [game, seed]);
  const bot = useMemo(() => game.bot(seed, challenge), [challenge, game, seed]);
  const [startAt] = useState(() => Date.now() + 2_000);
  const [now, setNow] = useState(() => Date.now());
  const [submission, setSubmission] = useState<Submission>({});
  const [canSubmit, setCanSubmit] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, []);

  const answerStart = startAt + game.revealDurationMs;
  const answerEnd = answerStart + game.answerDurationMs;
  const submit = useCallback(() => {
    if (submittedAt !== null || !canSubmit) return;
    setSubmittedAt(Math.min(Date.now(), answerEnd));
  }, [answerEnd, canSubmit, submittedAt]);

  useEffect(() => {
    if (submittedAt !== null || !canSubmit) return;
    const timeout = window.setTimeout(submit, Math.max(0, answerEnd - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [answerEnd, canSubmit, submit, submittedAt]);

  let phase: Phase;
  if (submittedAt !== null) {
    phase = now >= answerStart + bot.completionTimeMs ? "result" : "waiting";
  } else if (now < startAt) {
    phase = "countdown";
  } else if (now < answerStart) {
    phase = "reveal";
  } else {
    phase = "answer";
  }

  const playerTime = submittedAt
    ? Math.max(0, Math.min(game.answerDurationMs, submittedAt - answerStart))
    : game.answerDurationMs;
  const parsed = game.submissionSchema.safeParse(submission);
  const playerResult = parsed.success
    ? game.calculate(challenge, parsed.data, playerTime)
    : { rankScore: -999999, accuracy: 0, summary: "No answer", details: {} };
  const botResult = game.calculate(challenge, bot.submission, bot.completionTimeMs);
  const outcome = compareGameResults(
    playerResult,
    playerTime,
    botResult,
    bot.completionTimeMs,
  );

  if (phase === "result") {
    return (
      <main className="min-h-screen">
        <GameHeader player="You" playerRating={1000} opponent="Practice Bot" connected practice />
        <ResultPanel
          outcome={outcome}
          gameName={game.name}
          unranked
          player={{
            name: "You",
            score: playerResult.rankScore,
            correct: Number(playerResult.details.correct ?? playerResult.details.hits ?? 0),
            incorrect: Number(playerResult.details.incorrect ?? playerResult.details.errors ?? playerResult.details.misses ?? 0),
            summary: playerResult.summary,
            timeMs: playerTime,
            ratingBefore: 1000,
            ratingAfter: 1000,
          }}
          opponent={{
            name: "Practice Bot",
            score: botResult.rankScore,
            correct: Number(botResult.details.correct ?? botResult.details.hits ?? 0),
            incorrect: Number(botResult.details.incorrect ?? botResult.details.errors ?? botResult.details.misses ?? 0),
            summary: botResult.summary,
            timeMs: bot.completionTimeMs,
            ratingBefore: 1000,
            ratingAfter: 1000,
          }}
          onRematch={() =>
            router.replace(`/match/practice?game=${game.id}&seed=${Date.now()}`)
          }
          onNext={() => router.push("/play")}
          onHome={() => router.push("/")}
        />
      </main>
    );
  }

  const countdown = Math.max(1, Math.ceil((startAt - now) / 1000));
  const remaining = Math.max(0, answerEnd - now);
  const publicChallenge = game.publicChallenge(challenge, phase === "reveal" ? "reveal" : "answer");

  return (
    <main className="min-h-screen">
      <GameHeader player="You" playerRating={1000} opponent="Practice Bot" connected practice />
      <section className="page-shell screen-enter match-center">
        {phase === "countdown" ? (
          <div className="text-center">
            <p className="display text-lg tracking-[0.12em] text-[var(--muted)]">{game.name} · Get ready</p>
            <div className="display mt-3 text-[10rem] leading-none text-[var(--accent)]">{countdown}</div>
            <p className="mt-4 max-w-xl text-[var(--muted)]">{game.instructions}</p>
          </div>
        ) : (
          <>
            <div className="game-title-row">
              <div>
                <p className="game-kicker">Practice · unranked</p>
                <h1 className="display">{game.name}</h1>
              </div>
              <div className="game-timer">
                {phase === "reveal" ? "OBSERVE" : phase === "waiting" ? "LOCKED" : `${(remaining / 1000).toFixed(1)}s`}
              </div>
            </div>
            <p className="game-instructions">
              {phase === "waiting" ? "Practice Bot is finishing." : game.instructions}
            </p>
            <div className="game-stage">
              <GameRenderer
                key={`${game.id}:${phase}`}
                gameId={game.id}
                challenge={publicChallenge}
                disabled={phase !== "answer"}
                onChange={(next, valid) => {
                  setSubmission(next);
                  setCanSubmit(valid);
                  if (game.autoSubmitOnValid && valid && submittedAt === null) {
                    setSubmittedAt(Math.min(Date.now(), answerEnd));
                  }
                }}
              />
            </div>
            {phase === "answer" && !game.autoSubmitOnValid && (
              <Button className="game-submit" disabled={!canSubmit} onClick={submit}>
                Lock answer
              </Button>
            )}
          </>
        )}
      </section>
    </main>
  );
}
