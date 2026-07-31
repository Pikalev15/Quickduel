import type { Metadata } from "next";
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";

export const metadata: Metadata = { title: "Quick start" };

export default function OnboardingPage() {
  return <OnboardingScreen />;
}
