import type { Metadata } from "next";
import { MatchEntry } from "@/components/game/match-entry";
import { GAME_IDS, type GameId } from "@/games/types";
import { parseDifficulty } from "@/games/practice-difficulty";

export const metadata: Metadata = {
  title: "Live duel",
  description: "Play the current QuickDuel round and compare validated results.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ seed?: string; game?: string; onboarding?: string; difficulty?: string }>;
}) {
  const { matchId } = await params;
  const { seed, game, onboarding, difficulty } = await searchParams;
  if (matchId === "practice") {
    const practiceSeed = seed && /^[A-Za-z0-9:_-]{1,64}$/.test(seed) ? seed : "123456";
    const gameId = GAME_IDS.includes(game as GameId) ? (game as GameId) : "memory_grid";
    const onboardingStep = ["1", "2", "3"].includes(onboarding ?? "")
      ? (Number(onboarding) as 1 | 2 | 3)
      : undefined;
    return (
      <MatchEntry
        mode="practice"
        seed={practiceSeed}
        gameId={gameId}
        onboardingStep={onboardingStep}
        difficulty={onboardingStep ? "standard" : parseDifficulty(difficulty)}
      />
    );
  }
  return <MatchEntry mode="ranked" matchId={matchId} />;
}
