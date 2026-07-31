import type { Metadata } from "next";
import { OnboardingComplete } from "@/components/onboarding/onboarding-complete";

export const metadata: Metadata = { title: "Starter recommendation" };

export default async function OnboardingCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ recommendation?: string }>;
}) {
  const recommendation =
    (await searchParams).recommendation === "sensory" ? "sensory" : "mind";
  return <OnboardingComplete recommendation={recommendation} />;
}
