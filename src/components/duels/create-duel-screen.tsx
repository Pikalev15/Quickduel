"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { gameCatalog } from "@/games/catalog";
import {getGame} from "@/games/registry";
import {supportsCustomTiming,supportsCustomReveal,customRoundTiming,workshopSchema,validWorkshop,type WorkshopRules} from "@/games/match-rules";
import {WorkshopControls} from "./workshop-controls";
import { decodeWorkshopPreset, encodeWorkshopPreset, MAX_WORKSHOP_PRESET_LENGTH } from "@/games/shared-workshop-preset";
import type { GameId, PlaylistId } from "@/games/types";
import { track } from "@/lib/analytics";
import { loadSupabaseBrowserClient } from "@/lib/supabase/lazy-client";
import { ProductHeader } from "@/components/ui/product-header";
import { AdaptiveChallenge } from "@/components/security/adaptive-challenge";

export function CreateDuelScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [selectionKind, setSelectionKind] = useState<"game" | "playlist">("game");
  const [game, setGame] = useState<GameId>("memory_grid");
  const [playlist, setPlaylist] = useState<PlaylistId>("quick");
  const [bestOf, setBestOf] = useState<1 | 3 | 5>(3);
  const [ranked, setRanked] = useState(false);
  const [workshop,setWorkshop]=useState<WorkshopRules|null>(null);
  const [presetCode, setPresetCode] = useState("");
  const [presetNotice, setPresetNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challengeSiteKey, setChallengeSiteKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadSupabaseBrowserClient().then(async (supabase) => {
      if (!supabase) return;
      const { data } = await supabase.auth.getUser();
      if (active) setUser(data.user);
    });
    return () => {
      active = false;
    };
  }, []);

  const selectedGame = useMemo(
    () => gameCatalog.find((entry) => entry.id === game),
    [game],
  );
  const rankedAllowed =
    !workshop && user?.is_anonymous === false &&
    playlist !== "experimental" &&
    selectedGame?.ranked !== false;

  const shareCode = selectionKind === "game" && workshop
    ? encodeWorkshopPreset({ game, bestOf, rules: workshop })
    : null;

  function importPreset() {
    const preset = decodeWorkshopPreset(presetCode);
    if (!preset) {
      setPresetNotice("Invalid or unsupported Workshop preset. Your current settings have not changed.");
      return;
    }
    setSelectionKind("game");
    setGame(preset.game);
    setBestOf(preset.bestOf);
    setRanked(false);
    setWorkshop(preset.rules);
    setError(null);
    setPresetNotice("Preset loaded. Review the rules before creating your unranked duel.");
  }

  async function exportPreset() {
    if (!shareCode) return;
    setPresetCode(shareCode);
    try {
      await navigator.clipboard.writeText(shareCode);
      setPresetNotice("Preset copied. Send the code to a friend.");
    } catch {
      setPresetNotice("Copy the preset code from the text field to share it.");
    }
  }

  async function create(challengeToken?: string) {
    setSubmitting(true);
    setError(null);
    try {
      if(workshop&&(!workshopSchema.safeParse(workshop).success||!validWorkshop(game,workshop)))throw new Error("Adjust the custom game parameters before creating the duel.");
      const supabase = await loadSupabaseBrowserClient();
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
        headers: {
          "Content-Type": "application/json",
          ...(challengeToken ? { "x-quickduel-challenge": challengeToken } : {}),
        },
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
          ranked: !workshop && ranked && currentUser?.is_anonymous === false,
          ...(workshop?{workshop}:{}),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (body.error?.details?.challengeRequired) {
          const siteKey = body.error.details.siteKey ?? null;
          setChallengeSiteKey(siteKey);
          setError(siteKey ? null : "Verification is temporarily unavailable.");
          setSubmitting(false);
          return;
        }
        throw new Error(body.error?.message ?? "Could not create duel.");
      }
      setChallengeSiteKey(null);
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
              <button type="button" aria-pressed={selectionKind === "playlist"} onClick={() => {setSelectionKind("playlist");setWorkshop(null);}}>
                Playlist
              </button>
            </div>
          </fieldset>

          {selectionKind === "game" ? (
            <label>
              Game
              <select value={game} onChange={(event) => {setGame(event.target.value as GameId);setWorkshop(null);}}>
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

          {selectionKind==="game"&&supportsCustomTiming(game)&&<div className="qd-workshop"><label className="feature-check"><input type="checkbox" checked={Boolean(workshop)} onChange={event=>{if(!event.target.checked){setWorkshop(null);return;}const g=getGame(game);const round=customRoundTiming(game);setRanked(false);setWorkshop({version:1,revealMs:supportsCustomReveal(game)||game==="rhythm_recall"?g.revealDurationMs:0,answerMs:round?.totalMs??g.answerDurationMs,...(round?{roundAnswerMs:round.maxMs}:{}),...(game==="memory_grid"?{memory:{size:4,tiles:6,ordered:false}}:{})});}}/><span><b>Custom game rules</b><small>Unranked · locked when the room is created</small></span></label>{workshop&&<WorkshopControls game={game} rules={workshop} onChange={setWorkshop}/>}</div>}
          <fieldset>
            <legend>Shareable Workshop presets</legend>
            <p>Copy your custom rules or paste a friend&apos;s preset. Presets never create a room automatically.</p>
            <label>
              Preset code
              <textarea
                rows={3}
                maxLength={MAX_WORKSHOP_PRESET_LENGTH}
                value={presetCode}
                onChange={event => { setPresetCode(event.target.value); setPresetNotice(""); }}
                placeholder="QD1:…"
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <div className="feature-actions">
              <button className="calm-secondary" type="button" disabled={!presetCode.trim() || submitting} onClick={importPreset}>Load shared preset</button>
              <button className="calm-secondary" type="button" disabled={!shareCode || submitting} onClick={() => void exportPreset()}>Copy current preset</button>
            </div>
            <p role="status">{presetNotice}</p>
          </fieldset>
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
          {challengeSiteKey && (
            <AdaptiveChallenge
              siteKey={challengeSiteKey}
              onToken={(token) => {
                if (token) void create(token);
              }}
            />
          )}
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
