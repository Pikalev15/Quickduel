import type { Metadata } from "next";
import { FriendsScreen } from "@/components/friends/friends-screen";

export const metadata: Metadata = { title: "Friends" };
export const dynamic = "force-dynamic";

export default function FriendsPage() {
  return <FriendsScreen />;
}
