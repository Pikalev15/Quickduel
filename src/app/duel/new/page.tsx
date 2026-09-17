import type { Metadata } from "next";
import { CreateDuelScreen } from "@/components/duels/create-duel-screen";

export const metadata: Metadata = {
  title: "Create a private duel",
  description: "Choose a QuickDuel game and invite a friend to a private head-to-head series.",
};

export default function CreateDuelPage() {
  return <CreateDuelScreen />;
}
