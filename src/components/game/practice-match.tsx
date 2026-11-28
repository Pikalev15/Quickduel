"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LockAnswerButton } from "@/components/game/lock-answer-button";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GameHeader } from "./game-header";
import { CorrectShapeAnswer } from "@/components/results/correct-answer";
import { ResultPanel } from "@/components/results/result-panel";
import {PracticeRecordNotice} from "@/components/results/practice-record";
import { compareGameResults, type GameId, type Submission } from "@/games/types";
import { getGame } from "@/games/registry";
import { practiceChallenge,practiceTiming,type PracticeDifficulty } from "@/games/practice-difficulty";
import { GameRenderer } from "@/games/client-registry";
import { track } from "@/lib/analytics";
import { MEMORY_GRID_FLASH_MS } from "@/games/memory-grid-timing";
import { AudioManager } from "@/lib/audio/audio-manager";

type Phase = "countdown" | "reveal" | "answer" | "waiting" | "result";

export function PracticeMatch({
  seed,
  gameId,
  onboardingStep,
  difficulty = "standard",
}: {
  seed: string;
  gameId: GameId;
  onboardingStep?: 1 | 2 | 3;
  difficulty?: PracticeDifficulty;
}) {
  const router = useRouter();
  const game = getGame(gameId);
  const timing = useMemo(() => practiceTiming(gameId,difficulty),[gameId,difficulty]);
  const challenge = useMemo(() => practiceChallenge(gameId,seed,difficulty),[gameId,seed,difficulty]);
  const bot = useMemo(() => {const result=game.bot(seed,challenge);return {...result,completionTimeMs:Math.min(timing.answerMs,result.completionTimeMs)};},[challenge,game,seed,timing.answerMs]);
  const needsAudio = gameId === "frequency_recall_v2" || gameId === "frequency_recall" || gameId === "rhythm_recall";
  const [audioReady, setAudioReady] = useState(!needsAudio);
  const typing = gameId === "typing_sprint";
  const [keyboardReady, setKeyboardReady] = useState(!typing);
  const prepared = audioReady && keyboardReady;
  const [audioError, setAudioError] = useState(false);
  const [startAt, setStartAt] = useState(() => Date.now() + 3_000);
  const [now, setNow] = useState(() => Date.now());
  const prepareKeyboard = useCallback(() => {
    if (keyboardReady) return;
    setStartAt(Date.now() + 3_000);
    setKeyboardReady(true);
  }, [keyboardReady]);
  const [submission, setSubmission] = useState<Submission>({});
  const [canSubmit, setCanSubmit] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<number | null>(null);
  const resultRecorded = useRef(false);

  useEffect(() => {
    track("practice_started", {
      gameType: gameId,
      properties: { onboarding: Boolean(onboardingStep) },
    });
  }, [gameId, onboardingStep]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, []);

  const answerDurationMs = timing.answerMs;
  const answerStart = startAt + timing.revealMs;
  const answerEnd = answerStart + answerDurationMs;
  const submit = useCallback(() => {
    if (submittedAt !== null || !canSubmit) return;
    setSubmittedAt(Math.min(Date.now(), answerEnd));
  }, [answerEnd, canSubmit, submittedAt]);

  useEffect(() => {
    if (submittedAt !== null || !prepared) return;
    const timeout = window.setTimeout(
      () => setSubmittedAt((current) => current ?? answerEnd),
      Math.max(0, answerEnd - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [answerEnd, submittedAt, prepared]);

  let phase: Phase;
  if (submittedAt !== null) {
    phase = now >= answerStart + bot.completionTimeMs ? "result" : "waiting";
  } else if (!prepared || now < startAt) {
    phase = "countdown";
  } else if (now < answerStart) {
    phase = "reveal";
  } else {
    phase = "answer";
  }

  const playerTime = submittedAt
    ? Math.max(0, Math.min(answerDurationMs, submittedAt - answerStart))
    : answerDurationMs;
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

  useEffect(() => {
    if (phase !== "result" || !onboardingStep || resultRecorded.current) return;
    resultRecorded.current = true;
    const key = "quickduel:onboarding-results";
    const existing = JSON.parse(localStorage.getItem(key) ?? "[]") as Array<{
      category: string;
      accuracy: number;
    }>;
    existing.push({ category: game.category, accuracy: playerResult.accuracy });
    localStorage.setItem(key, JSON.stringify(existing.slice(-3)));
  }, [game.category, onboardingStep, phase, playerResult.accuracy]);

  async function nextOnboardingStep() {
    if (!onboardingStep) return;
    const sequence: GameId[] = ["memory_grid", "frequency_recall_v2", "number_order"];
    if (onboardingStep < 3) {
      const nextStep = (onboardingStep + 1) as 2 | 3;
      router.push(
        `/match/practice?game=${sequence[nextStep - 1]}&seed=starter-${nextStep}&onboarding=${nextStep}`,
      );
      return;
    }
    const results = JSON.parse(
      localStorage.getItem("quickduel:onboarding-results") ?? "[]",
    ) as Array<{ category: "sensory" | "mind"; accuracy: number }>;
    const sensory = results.filter((item) => item.category === "sensory");
    const mind = results.filter((item) => item.category === "mind");
    const average = (values: typeof results) =>
      values.reduce((total, item) => total + item.accuracy, 0) /
      Math.max(1, values.length);
    const recommendation = average(sensory) > average(mind) ? "sensory" : "mind";
    await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true, skipped: false, recommendation }),
    });
    track("onboarding_completed", { properties: { recommendation } });
    localStorage.removeItem("quickduel:onboarding-results");
    router.push(`/onboarding/complete?recommendation=${recommendation}`);
  }

  if (phase === "result") {
    return (
      <main className="min-h-screen">
        <GameHeader player="You" playerRating={1000} opponent="Practice Bot" connected practice />
        <ResultPanel
          outcome={outcome}
          gameName={game.name}
          correctAnswer={game.id === "shape_recall" && Array.isArray(challenge.radii) ? <CorrectShapeAnswer radii={challenge.radii as number[]} /> : undefined}
          completionNotice={gameId === "cryptic_duel" ? `Answer: ${String(challenge.answer)}. ${String(challenge.explanation)}` : undefined}
          unranked
          recordNotice={!onboardingStep&&parsed.success?<PracticeRecordNotice recordKey={`${gameId}:${game.version}:${difficulty}:${timing.revealMs}:${timing.answerMs}`} score={playerResult.rankScore} accuracy={playerResult.accuracy} timeMs={playerTime} summary={playerResult.summary}/>:undefined}
          player={{
            name: "You",
            score: playerResult.rankScore,
            correct: Number(playerResult.details.correct ?? playerResult.details.hits ?? 0),
            incorrect: Number(playerResult.details.incorrect ?? playerResult.details.errors ?? playerResult.details.misses ?? 0),
            summary: playerResult.summary,
            timeMs: playerTime,
            ratingBefore: 1000,
            ratingAfter: 1000,
            details: playerResult.details,
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
            details: botResult.details,
          }}
          onRematch={() =>
            router.replace(`/match/practice?game=${game.id}&seed=${Date.now()}&difficulty=${difficulty}`)
          }
          onNext={() => onboardingStep ? void nextOnboardingStep() : router.push(`/practice?game=${game.id}`)}
          onHome={() => onboardingStep ? router.push("/onboarding") : router.push("/")}
          rematchLabel={onboardingStep ? "Try this game again" : "Rematch"}
          nextLabel={onboardingStep ? (onboardingStep === 3 ? "See recommendation" : "Next starter game") : "Practice options"}
          homeLabel={onboardingStep ? "Leave starter sequence" : "Home"}
        />
      </main>
    );
  }

  const countdown = Math.max(1, Math.ceil((startAt - now) / 1000));
  const remaining = Math.max(0, answerEnd - now);
  const phaseElapsedMs = phase === "reveal" ? Math.max(0, now - startAt) : 0;
  const memoryHolding =
    (game.id === "memory_grid" || game.id === "memory_grid_v2") &&
    phase === "reveal" &&
    phaseElapsedMs >= Number(challenge.flashMs ?? MEMORY_GRID_FLASH_MS);
  const publicChallenge = game.publicChallenge(challenge, phase === "reveal" ? "reveal" : "answer");

  return (
    <main className={`active-game min-h-screen${game.id === "typing_sprint" ? " typing-match" : ""}`}>
      <GameHeader player="You" playerRating={1000} opponent="Practice Bot" connected practice />
      <section className="page-shell screen-enter match-center">
        {phase === "countdown" && !typing ? (
          <div className="text-center">
            <p className="display text-lg tracking-[0.12em] text-[var(--muted)]">{game.name} · Get ready</p>
            {audioReady ? <div className="display qd-countdown mt-3 text-[clamp(5rem,25vw,10rem)] leading-none text-[var(--accent)]"><span key={countdown}>{countdown}</span></div> : (
              <Button className="mt-4" onClick={() => {
                void AudioManager.shared().unlock().then((ready) => {
                  if (!ready) { setAudioError(true); return; }
                  setStartAt(Date.now() + 3_000);
                  setAudioReady(true);
                }).catch(() => setAudioError(true));
              }}>Enable sound and start</Button>
            )}
            {audioError && !audioReady && <p role="alert">Audio is unavailable. Check your sound settings and try again.</p>}
            <p className="mt-4 max-w-xl text-[var(--muted)]">{game.instructions}</p>
          </div>
        ) : (
          <>
            <div className="game-title-row">
              <div>
                <p className="game-kicker">Practice · {difficulty} · unranked</p>
                <h1 className="display">{game.name}</h1>
              </div>
              <div className="game-timer" data-urgent={gameId !== "frequency_recall_v2" && phase === "answer" && remaining <= 3000 ? "true" : undefined}>
                {phase === "countdown"
                  ? keyboardReady ? `Starts in ${countdown}` : "Ready?"
                  : memoryHolding
                  ? "HOLD"
                  : phase === "reveal"
                    ? "OBSERVE"
                    : phase === "waiting"
                      ? "LOCKED"
                      : gameId === "frequency_recall_v2" ? "ROUND" : `${(remaining / 1000).toFixed(1)}s`}
              </div>
            </div>
            <p className="game-instructions">
              {phase === "waiting" ? "Practice Bot is finishing." : gameId === "cryptic_duel" ? `Solve the clue in ${answerDurationMs/1000} seconds. Hints cost two points each.` : game.instructions}
            </p>
            {phase === "answer" && gameId !== "frequency_recall_v2" && (
              <div
                className="game-time-progress"
                role="progressbar"
                aria-label="Answer time remaining"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((remaining / answerDurationMs) * 100)}
              >
                <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, remaining / answerDurationMs))})` }} />
              </div>
            )}
            <div className="game-stage">
              <GameRenderer
                key={typing ? `${game.id}:${seed}` : `${game.id}:${phase === "waiting" ? "answer" : phase}`}
                gameId={game.id}
                challenge={publicChallenge}
                disabled={phase !== "answer" || remaining <= 0}
                preparing={typing && phase === "countdown"}
                answerDurationMs={answerDurationMs}
                answerRemainingMs={remaining}
                onReady={prepareKeyboard}
                phaseElapsedMs={phaseElapsedMs}
                practiceOpponentSubmission={bot.submission}
                onChange={(next, valid) => {
                  setSubmission(next);
                  setCanSubmit(valid);
                  if (game.autoSubmitOnValid && valid && submittedAt === null) {
                    setSubmittedAt(Math.min(Date.now(), answerEnd));
                  }
                }}
              />
            </div>
            {phase === "answer" && !game.autoSubmitOnValid && !game.submitAtDeadline && (
              <LockAnswerButton className="game-submit" disabled={!canSubmit || remaining <= 0} remainingMs={remaining} onClick={submit} />
            )}
          </>
        )}
      </section>
    </main>
  );
}
