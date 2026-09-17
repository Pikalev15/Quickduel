import type { Metadata } from "next";
import { ProfileSettingsScreen } from "@/components/profile/profile-settings-screen";

export const metadata: Metadata = {
  title: "Profile settings",
  description: "Manage QuickDuel cosmetics, analytics preference, onboarding, and account deletion.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function ProfileSettingsPage() {
  return <ProfileSettingsScreen />;
}
