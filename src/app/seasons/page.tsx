import type { Metadata } from "next";
import { SeasonScreen } from "@/components/seasons/season-screen";

export const metadata: Metadata = { title: "Weekly season" };
export const dynamic = "force-dynamic";

export default function SeasonsPage() {
  return <SeasonScreen />;
}
