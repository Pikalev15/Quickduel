"use client";

import Link from "next/link";
import { ProductHeader } from "@/components/ui/product-header";

export function OnboardingComplete({ recommendation }: { recommendation: "sensory" | "mind" }) {
  const title = recommendation === "sensory" ? "Sensory" : "Mind";
  return (
    <main className="min-h-screen">
      <ProductHeader current="play" />
      <section className="page-shell onboarding-complete">
        <p className="calm-eyebrow">Starter sequence complete</p>
        <h1>Try the {title} playlist next.</h1>
        <p>
          Your strongest results in this three-game sampler were in {title.toLowerCase()} games.
          This is a game-performance suggestion, not a scientific or psychological assessment.
        </p>
        <div className="feature-actions">
          <Link className="calm-primary" href={`/play?playlist=${recommendation}`}>Play {title}</Link>
          <Link className="calm-secondary" href="/play?playlist=quick">Quick Play</Link>
          <Link className="calm-secondary" href="/">Home</Link>
        </div>
      </section>
    </main>
  );
}
