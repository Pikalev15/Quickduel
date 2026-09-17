import type { Metadata } from "next";
import { MatchDetailScreen } from "@/components/history/match-detail-screen";

export const metadata: Metadata = {
  title: "Completed match",
  description: "Review the validated outcome and round summary for a completed QuickDuel match.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  return <MatchDetailScreen matchId={(await params).matchId} />;
}
