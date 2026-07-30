import type { Metadata } from "next";
import { MatchmakingScreen } from "@/components/matchmaking/matchmaking-screen";

export const metadata: Metadata = { title: "Finding an opponent" };
export const dynamic = "force-dynamic";

export default function PlayPage() {
  return <MatchmakingScreen />;
}
