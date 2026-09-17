import type { Metadata } from "next";
import { OnboardingComplete } from "@/components/onboarding/onboarding-complete";

export const metadata: Metadata = {
  title: "Starter recommendation",
  description: "See the QuickDuel playlist suggested by your unranked starter sequence.",
  robots: { index: false, follow: false },
};

export default async function OnboardingCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ recommendation?: string }>;
}) {
  const recommendation =
    (await searchParams).recommendation === "sensory" ? "sensory" : "mind";
  return <OnboardingComplete recommendation={recommendation} />;
}
