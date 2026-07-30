import type { Metadata } from "next";
import { PracticeMatch } from "@/components/game/practice-match";
import { RankedMatch } from "@/components/game/ranked-match";
import { GAME_IDS, type GameId } from "@/games/types";

export const metadata: Metadata = { title: "Live duel" };
export const dynamic = "force-dynamic";

export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ seed?: string; game?: string }>;
}) {
  const { matchId } = await params;
  const { seed, game } = await searchParams;
  if (matchId === "practice") {
    const practiceSeed = seed && /^[A-Za-z0-9:_-]{1,64}$/.test(seed) ? seed : "123456";
    const gameId = GAME_IDS.includes(game as GameId) ? (game as GameId) : "memory_grid";
    return <PracticeMatch key={`${gameId}:${practiceSeed}`} seed={practiceSeed} gameId={gameId} />;
  }
  return <RankedMatch matchId={matchId} />;
}
