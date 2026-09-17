"use client";

import dynamic from "next/dynamic";
import type { GameId } from "@/games/types";
import { Header } from "@/components/ui/header";

const PracticeMatch = dynamic(
  () => import("./practice-match").then((module) => module.PracticeMatch),
  { ssr: false, loading: MatchLoading },
);

const RankedMatch = dynamic(
  () => import("./ranked-match").then((module) => module.RankedMatch),
  { ssr: false, loading: MatchLoading },
);

function MatchLoading() {
  return (
    <main className="min-h-screen">
      <Header simple />
      <section className="page-shell match-loading" aria-live="polite">
        <p className="game-kicker">Preparing duel</p>
        <h1 className="display">Loading the arena</h1>
        <span aria-hidden="true" />
      </section>
    </main>
  );
}

type MatchEntryProps =
  | {
      mode: "practice";
      seed: string;
      gameId: GameId;
      onboardingStep?: 1 | 2 | 3;
    }
  | { mode: "ranked"; matchId: string };

export function MatchEntry(props: MatchEntryProps) {
  if (props.mode === "practice") {
    return (
      <PracticeMatch
        key={`${props.gameId}:${props.seed}`}
        seed={props.seed}
        gameId={props.gameId}
        onboardingStep={props.onboardingStep}
      />
    );
  }
  return <RankedMatch matchId={props.matchId} />;
}
