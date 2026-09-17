import type { Metadata } from "next";
import { FriendsScreen } from "@/components/friends/friends-screen";

export const metadata: Metadata = {
  title: "Friends",
  description: "Manage QuickDuel friends, requests, invitations, and private challenges.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function FriendsPage() {
  return <FriendsScreen />;
}
