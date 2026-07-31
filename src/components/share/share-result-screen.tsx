"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { getGame } from "@/games/registry";
import { ProductHeader } from "@/components/ui/product-header";

type ShareData = {
  code: string;
  game_type: Parameters<typeof getGame>[0];
  ranked: boolean;
  completed_at: string;
  source: string;
  series_round: number | null;
  players: Array<{
    display_name: string;
    summary: string;
    rating_delta: number | null;
    winner: boolean;
  }>;
};

export function ShareResultScreen({ code }: { code: string }) {
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void fetch(`/api/shares/${code}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "Shared result unavailable.");
        setData(body.data);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Shared result unavailable."));
  }, [code]);

  async function share() {
    if (navigator.share) await navigator.share({ title: "QuickDuel result", url: location.href });
    else {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
    }
  }

  return (
    <main className="min-h-screen">
      <ProductHeader />
      <section className="page-shell share-result">
        {!data ? (
          <div className="empty-state"><h1>{error ? "Shared result unavailable" : "Loading result…"}</h1>{error && <p>{error}</p>}</div>
        ) : (
          <>
            <p className="calm-eyebrow">{data.ranked ? "Ranked duel" : "Unranked duel"}</p>
            <h1>{data.players.some((player) => player.winner) ? "Victory" : "Draw"}</h1>
            <p>{getGame(data.game_type).name}{data.series_round ? ` · Series round ${data.series_round}` : ""}</p>
            <div className="share-player-grid">
              {data.players.map((player) => (
                <article className={player.winner ? "winner" : ""} key={player.display_name}><span>{player.winner ? "Winner" : "Duelist"}</span><h2>{player.display_name}</h2><strong>{player.summary}</strong>{data.ranked && player.rating_delta !== null && <p>{player.rating_delta >= 0 ? "+" : ""}{player.rating_delta} Elo</p>}</article>
              ))}
            </div>
            <Image
              src={`/api/shares/${code}/image`}
              alt={`QuickDuel ${getGame(data.game_type).name} result card`}
              width={1200}
              height={630}
              unoptimized
            />
            <div className="feature-actions">
              <button className="calm-primary" type="button" onClick={() => void share()}>{copied ? "Link copied" : "Share"}</button>
              <a className="calm-secondary" href={`/api/shares/${code}/image`} download={`quickduel-${code}.png`}>Download image</a>
              <Link className="calm-secondary" href="/duel/new">Create a duel</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
