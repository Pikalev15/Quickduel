import type { Metadata } from "next";
import { HistoryScreen } from "@/components/history/history-screen";

export const metadata: Metadata = { title: "Match history" };
export const dynamic = "force-dynamic";

export default function HistoryPage() {
  return <HistoryScreen />;
}
