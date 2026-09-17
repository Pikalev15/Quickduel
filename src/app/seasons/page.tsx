import type { Metadata } from "next";
import { SeasonScreen } from "@/components/seasons/season-screen";

export const metadata: Metadata = {
  title: "Weekly season",
  description: "See the current QuickDuel weekly season standings and scoring rules.",
};
export const dynamic = "force-dynamic";

export default function SeasonsPage() {
  return <SeasonScreen />;
}
