import type { Metadata } from "next";
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";

export const metadata: Metadata = {
  title: "Quick start",
  description: "Learn QuickDuel through a short, unranked three-game starter sequence.",
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return <OnboardingScreen />;
}
