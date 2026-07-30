"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ArrowIcon, PlayIcon, SignalIcon, TrophyIcon } from "@/components/ui/icons";
import { Header } from "@/components/ui/header";
import { Button } from "@/components/ui/button";
import type { PublicProfile } from "@/types/database";
import { ProfileDrawer } from "@/components/profile/profile-drawer";
import { GameLibrary } from "./game-library";
import {
  SettingsPopover,
  type HomePreferences,
} from "./settings-popover";

type Leader = {
  rank: number;
  id: string;
  display_name: string;
  rating: number;
};

const defaultPreferences: HomePreferences = {
  showGameLibrary: false,
  showLeaderboardPreview: false,
  showHowItWorks: false,
};

export function HomeScreen() {
  const router = useRouter();
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [online, setOnline] = useState<number | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadPreferences = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem("quickduel:home-preferences");
        if (stored && active) {
          setPreferences({ ...defaultPreferences, ...JSON.parse(stored) });
        }
      } catch {
        // Invalid local settings fall back to calm defaults.
      }
    }, 0);

    async function load() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const [overview, sessionResult] = await Promise.all([
        fetch("/api/public/overview", { cache: "no-store" }),
        supabase.auth.getSession(),
      ]);
      if (overview.ok && active) {
        const body = await overview.json();
        setLeaders(body.data.leaderboard ?? []);
        setOnline(Number(body.data.activity?.online_count ?? 0));
      }
      const {
        data: { session },
      } = sessionResult;
      if (active) setUser(session?.user ?? null);
      if (!session) return;
      const response = await fetch("/api/profile", { cache: "no-store" });
      if (response.ok && active) {
        const body = await response.json();
        setProfile(body.data);
      }
    }
    void load();
    return () => {
      active = false;
      window.clearTimeout(loadPreferences);
    };
  }, []);

  const updatePreferences = useCallback((next: HomePreferences) => {
    setPreferences(next);
    window.localStorage.setItem("quickduel:home-preferences", JSON.stringify(next));
  }, []);

  async function play() {
    setStarting(true);
    setError(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStarting(false);
      setError("Ranked play needs Supabase configuration. Practice remains available.");
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      const { error: authError } = await supabase.auth.signInAnonymously();
      if (authError) {
        setStarting(false);
        setError("Anonymous sign-in failed. Check Supabase Auth settings.");
        return;
      }
    }
    const { error: profileError } = await supabase.rpc("ensure_profile");
    if (profileError) {
      setStarting(false);
      setError("Your player profile could not be created. Please try again.");
      return;
    }
    router.push("/play");
  }

  return (
    <main className="calm-home min-h-screen">
      <Header
        profileSlot={
          <div className="header-controls">
            <SettingsPopover
              open={settingsOpen}
              preferences={preferences}
              onOpenChange={setSettingsOpen}
              onChange={updatePreferences}
            />
            <button type="button" className="profile-chip" onClick={() => setProfileOpen(true)}>
              <span className={`accent-${profile?.accent_colour ?? "volt"}`}>
                {(profile?.display_name ?? "QD").slice(0, 2).toUpperCase()}
              </span>
              <b>{profile?.display_name ?? "Profile"}</b>
            </button>
          </div>
        }
      />

      <section className="page-shell calm-hero">
        <p className="calm-eyebrow">Fast multiplayer perception games</p>
        <h1>A quick test of<br />what you notice.</h1>
        <p className="calm-subtitle">
          Twelve short challenges. Better answers win; trusted speed settles ties.
        </p>
        <div className="calm-hero-actions">
          <button type="button" className="calm-primary" onClick={play} disabled={starting}>
            <PlayIcon className="h-5 w-5" />
            {starting ? "Joining…" : "Quick play"}
          </button>
          <button
            type="button"
            className="calm-secondary"
            onClick={() =>
              updatePreferences({ ...preferences, showGameLibrary: true })
            }
          >
            Choose a game <ArrowIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="calm-player-line">
          <span><b>{profile?.rating ?? "—"}</b> rating</span>
          <span><SignalIcon className="h-4 w-4" /><b>{online ?? "—"}</b> online</span>
          <span>Accuracy first · 8s Memory Grid</span>
        </div>
        {error && (
          <div role="alert" className="calm-error">
            <span>{error}</span>
            <Button onClick={() => router.push("/match/practice?game=memory_grid&seed=fallback")}>
              Practice instead
            </Button>
          </div>
        )}
      </section>

      <div className="page-shell calm-content">
        <GameLibrary
          expanded={preferences.showGameLibrary}
          onExpand={() =>
            updatePreferences({
              ...preferences,
              showGameLibrary: !preferences.showGameLibrary,
            })
          }
        />

        {preferences.showHowItWorks && (
          <section className="calm-steps" aria-label="How QuickDuel works">
            {[
              ["01", "Match", "Choose a playlist or a specific challenge."],
              ["02", "Play", "Both players receive the same deterministic test."],
              ["03", "Compare", "Accuracy wins; database time breaks equal results."],
            ].map(([step, title, copy]) => (
              <article key={step}>
                <span>{step}</span>
                <h2>{title}</h2>
                <p>{copy}</p>
              </article>
            ))}
          </section>
        )}

        {preferences.showLeaderboardPreview && (
          <section className="calm-leaderboard">
            <div className="calm-section-head">
              <div>
                <span><TrophyIcon className="h-4 w-4" /> Top duelists</span>
                <p>All-time ranked players.</p>
              </div>
              <Link href="/leaderboard">Full leaderboard</Link>
            </div>
            <ol>
              {leaders.slice(0, 5).map((leader) => (
                <li key={leader.id}>
                  <span>{leader.rank}</span>
                  <b>{leader.display_name}</b>
                  <strong>{leader.rating}</strong>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <footer className="page-shell calm-footer">
        <span>QuickDuel</span>
        <nav>
          <Link href="/play?playlist=quick">Play</Link>
          <Link href="/leaderboard">Leaderboard</Link>
          <button type="button" onClick={() => setProfileOpen(true)}>Profile</button>
        </nav>
      </footer>

      <ProfileDrawer
        key={`${profile?.display_name}:${profile?.accent_colour}`}
        open={profileOpen}
        profile={profile}
        user={user}
        onClose={() => setProfileOpen(false)}
        onUpdated={setProfile}
      />
    </main>
  );
}
