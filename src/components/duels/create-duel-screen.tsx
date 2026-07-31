"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { gameCatalog } from "@/games/catalog";
import type { GameId, PlaylistId } from "@/games/types";
import { track } from "@/lib/analytics";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ProductHeader } from "@/components/ui/product-header";

export function CreateDuelScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [selectionKind, setSelectionKind] = useState<"game" | "playlist">("game");
  const [game, setGame] = useState<GameId>("memory_grid");
  const [playlist, setPlaylist] = useState<PlaylistId>("quick");
  const [bestOf, setBestOf] = useState<1 | 3 | 5>(3);
  const [ranked, setRanked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const selectedGame = useMemo(
    () => gameCatalog.find((entry) => entry.id === game),
    [game],
  );
  const rankedAllowed =
    user?.is_anonymous === false &&
    playlist !== "experimental" &&
    selectedGame?.ranked !== false;

  async function create() {
    setSubmitting(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Private duels need Supabase configuration.");
      let currentUser = (await supabase.auth.getUser()).data.user;
      if (!currentUser) {
        const { data, error: authError } = await supabase.auth.signInAnonymously();
        if (authError) throw authError;
        currentUser = data.user;
      }
      const { error: profileError } = await supabase.rpc("ensure_profile");
      if (profileError) throw profileError;
      const response = await fetch("/api/duels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectionKind,
          game: selectionKind === "game" ? game : null,
          playlist:
            selectionKind === "game"
              ? selectedGame?.category === "experimental"
                ? "experimental"
                : selectedGame?.category ?? "quick"
              : playlist,
          bestOf,
          ranked: ranked && currentUser?.is_anonymous === false,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not create duel.");
      track("private_duel_created", {
        gameType: selectionKind === "game" ? game : null,
        playlist,
        properties: { bestOf, ranked },
      });
      router.push(`/duel/${body.data.code}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create duel.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen">
      <ProductHeader current="play" />
      <section className="page-shell feature-shell">
        <div className="feature-heading">
          <p className="calm-eyebrow">Private duel</p>
          <h1>Create a link for one opponent.</h1>
          <p>
            Choose the rules, then share a difficult-to-guess code. Private duels
            are unranked unless both linked accounts explicitly opt in.
          </p>
        </div>

        <div className="feature-form">
          <fieldset>
            <legend>What should stay fixed?</legend>
            <div className="segmented-control">
              <button type="button" aria-pressed={selectionKind === "game"} onClick={() => setSelectionKind("game")}>
                One game
              </button>
              <button type="button" aria-pressed={selectionKind === "playlist"} onClick={() => setSelectionKind("playlist")}>
                Playlist
              </button>
            </div>
          </fieldset>

          {selectionKind === "game" ? (
            <label>
              Game
              <select value={game} onChange={(event) => setGame(event.target.value as GameId)}>
                {gameCatalog.map((entry) => (
                  <option value={entry.id} key={entry.id}>
                    {entry.name}{entry.ranked ? "" : " · unranked"}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Playlist
              <select value={playlist} onChange={(event) => setPlaylist(event.target.value as PlaylistId)}>
                <option value="quick">Quick Play</option>
                <option value="sensory">Sensory</option>
                <option value="mind">Mind</option>
                <option value="experimental">Experimental · unranked</option>
              </select>
            </label>
          )}

          <fieldset>
            <legend>Series format</legend>
            <div className="segmented-control">
              {([1, 3, 5] as const).map((format) => (
                <button type="button" aria-pressed={bestOf === format} onClick={() => setBestOf(format)} key={format}>
                  {format === 1 ? "Single game" : `Best of ${format}`}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="feature-check">
            <input
              type="checkbox"
              checked={ranked}
              disabled={!rankedAllowed}
              onChange={(event) => setRanked(event.target.checked)}
            />
            <span>
              <b>Ranked duel</b>
              <small>
                {rankedAllowed
                  ? "Changes Elo and may count toward the weekly season."
                  : "Requires a linked account and a ranked game or playlist."}
              </small>
            </span>
          </label>

          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="feature-actions">
            <button className="calm-primary" type="button" disabled={submitting} onClick={() => void create()}>
              {submitting ? "Creating…" : "Create private duel"}
            </button>
            <button className="calm-secondary" type="button" onClick={() => router.back()}>
              Cancel
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
