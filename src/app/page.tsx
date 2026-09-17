import type { Metadata } from "next";
import { HomeScreen } from "@/components/home/home-screen";

export const metadata: Metadata = {
  title: "QuickDuel - fast multiplayer perception games",
  description: "Choose from thirteen short perception games, enter ranked matchmaking, or challenge a friend to a private duel.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return <HomeScreen />;
}
