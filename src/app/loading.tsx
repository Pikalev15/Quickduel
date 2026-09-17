"use client";

import { usePathname } from "next/navigation";
import { ProductHeader } from "@/components/ui/product-header";

type ProductDestination = {
  current: "play" | "friends" | "history" | "leaderboard" | "profile";
  eyebrow: string;
  title: string;
};

function productDestination(pathname: string): ProductDestination | null {
  if (pathname.startsWith("/friends")) {
    return { current: "friends", eyebrow: "Your circle", title: "Friends" };
  }
  if (pathname.startsWith("/history")) {
    return { current: "history", eyebrow: "Your matches", title: "Match history" };
  }
  if (pathname === "/leaderboard") {
    return { current: "leaderboard", eyebrow: "Global ranking", title: "Leaderboard" };
  }
  if (pathname === "/profile/settings") {
    return { current: "profile", eyebrow: "Player profile", title: "Account and cosmetics" };
  }
  if (pathname.startsWith("/profile")) {
    return { current: "profile", eyebrow: "Performance", title: "Your statistics" };
  }
  return null;
}

export default function Loading() {
  const destination = productDestination(usePathname());

  if (destination) {
    return (
      <main className="min-h-screen" aria-label={`Loading ${destination.title}`} aria-busy="true">
        <ProductHeader current={destination.current} />
        <section className="page-shell feature-shell route-loading-product">
          <div className="feature-heading">
            <p className="calm-eyebrow">{destination.eyebrow}</p>
            <h1>{destination.title}</h1>
            <span className="loading-line loading-line-copy" />
          </div>
          <div className="route-loading-body">
            <span className="loading-line loading-line-title" />
            <span className="loading-line loading-line-title loading-line-title-short" />
            <div className="loading-actions"><span /><span /></div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="route-loading" aria-label="Loading QuickDuel" aria-busy="true">
      <div className="page-shell route-loading-head">
        <span className="loading-mark" />
        <span className="loading-line loading-line-short" />
      </div>
      <div className="page-shell route-loading-body">
        <span className="loading-line loading-line-kicker" />
        <span className="loading-line loading-line-title" />
        <span className="loading-line loading-line-title loading-line-title-short" />
        <span className="loading-line loading-line-copy" />
        <div className="loading-actions"><span /><span /></div>
      </div>
    </main>
  );
}
