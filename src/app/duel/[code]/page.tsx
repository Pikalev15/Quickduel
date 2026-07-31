import type { Metadata } from "next";
import { DuelLobbyScreen } from "@/components/duels/duel-lobby-screen";

export const metadata: Metadata = { title: "Private duel" };
export const dynamic = "force-dynamic";

export default async function PrivateDuelPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return <DuelLobbyScreen code={(await params).code.toUpperCase()} />;
}
