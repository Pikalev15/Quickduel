import type { Metadata } from "next";
import { SeasonScreen } from "@/components/seasons/season-screen";

export const metadata: Metadata = {
  title: "Season standings",
  description: "Review archived QuickDuel season standings and competitive results.",
};
export const dynamic = "force-dynamic";

export default async function SeasonArchivePage({
  params,
}: {
  params: Promise<{ seasonId: string }>;
}) {
  return <SeasonScreen seasonId={(await params).seasonId} />;
}
