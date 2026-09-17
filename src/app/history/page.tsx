import type { Metadata } from "next";
import { HistoryScreen } from "@/components/history/history-screen";

export const metadata: Metadata = {
  title: "Match history",
  description: "Review your completed QuickDuel matches and game-specific performance summaries.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function HistoryPage() {
  return <HistoryScreen />;
}
