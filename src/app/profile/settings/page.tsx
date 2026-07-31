import type { Metadata } from "next";
import { ProfileSettingsScreen } from "@/components/profile/profile-settings-screen";

export const metadata: Metadata = { title: "Profile settings" };
export const dynamic = "force-dynamic";

export default function ProfileSettingsPage() {
  return <ProfileSettingsScreen />;
}
