import type { Metadata } from "next";
import { PracticeMatch } from "@/components/game/practice-match";
import { RankedMatch } from "@/components/game/ranked-match";

export const metadata: Metadata = { title: "Memory Grid duel" };
export const dynamic = "force-dynamic";

export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ seed?: string }>;
}) {
  const { matchId } = await params;
  const { seed } = await searchParams;
  if (matchId === "practice") {
    const practiceSeed = seed && /^\d+$/.test(seed) ? seed : "123456";
    return <PracticeMatch key={practiceSeed} seed={practiceSeed} />;
  }
  return <RankedMatch matchId={matchId} />;
}
