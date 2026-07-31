import type { Metadata } from "next";
import { MatchmakingScreen } from "@/components/matchmaking/matchmaking-screen";
import { ACTIVE_GAME_IDS, type GameId, type PlaylistId } from "@/games/types";

export const metadata: Metadata = { title: "Finding an opponent" };
export const dynamic = "force-dynamic";

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ playlist?: string; game?: string }>;
}) {
  const query = await searchParams;
  const playlists: PlaylistId[] = ["quick", "sensory", "mind", "experimental"];
  const playlist = playlists.includes(query.playlist as PlaylistId)
    ? (query.playlist as PlaylistId)
    : "quick";
  const preferredGame = ACTIVE_GAME_IDS.includes(query.game as (typeof ACTIVE_GAME_IDS)[number])
    ? (query.game as GameId)
    : null;
  return <MatchmakingScreen playlist={playlist} preferredGame={preferredGame} />;
}
