import type { Metadata } from "next";
import { HomeScreen } from "@/components/home/home-screen";

export const metadata: Metadata = {
  title: "QuickDuel - fast multiplayer perception games",
  description: "Play short memory, perception and word games. Find a ranked opponent, practice, or challenge a friend.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return <HomeScreen />;
}
