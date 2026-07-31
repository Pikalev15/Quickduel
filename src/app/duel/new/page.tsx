import type { Metadata } from "next";
import { CreateDuelScreen } from "@/components/duels/create-duel-screen";

export const metadata: Metadata = { title: "Create a private duel" };

export default function CreateDuelPage() {
  return <CreateDuelScreen />;
}
