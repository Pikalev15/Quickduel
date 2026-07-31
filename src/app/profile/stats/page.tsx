import type { Metadata } from "next";
import { StatsScreen } from "@/components/stats/stats-screen";

export const metadata: Metadata = { title: "Personal statistics" };
export const dynamic = "force-dynamic";

export default function StatsPage() {
  return <StatsScreen />;
}
