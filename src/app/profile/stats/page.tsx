import type { Metadata } from "next";
import { StatsScreen } from "@/components/stats/stats-screen";

export const metadata: Metadata = {
  title: "Personal statistics",
  description: "Review personal QuickDuel ratings, game metrics, form, and division progress.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function StatsPage() {
  return <StatsScreen />;
}
