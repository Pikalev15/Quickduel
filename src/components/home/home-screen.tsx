"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { loadSupabaseBrowserClient } from "@/lib/supabase/lazy-client";
import { ArrowIcon, PlayIcon, SignalIcon, TrophyIcon } from "@/components/ui/icons";
import { Header } from "@/components/ui/header";
import { LogoMark } from "@/components/ui/logo-mark";
import { Button } from "@/components/ui/button";
import type { PublicProfile } from "@/types/database";
import { ProfileDrawer } from "@/components/profile/profile-drawer";
import { GameLibrary } from "./game-library";
import {
  SettingsPopover,
  type AuthIntent,
  type HomePreferences,
} from "./settings-popover";
import { track } from "@/lib/analytics";

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
  const libraryRef = useRef<HTMLDivElement>(null);
  const shouldFocusLibrary = useRef(false);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
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
      const supabase = await loadSupabaseBrowserClient();
      if (!active || !supabase) return;
      const authListener = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        setUser(session?.user ?? null);
        if (!session) setProfile(null);
      });
      unsubscribe = () => authListener.data.subscription.unsubscribe();
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
    track("landing_viewed");
    return () => {
      active = false;
      window.clearTimeout(loadPreferences);
      unsubscribe?.();
    };
  }, []);

  const updatePreferences = useCallback((next: HomePreferences) => {
    setPreferences(next);
    window.localStorage.setItem("quickduel:home-preferences", JSON.stringify(next));
  }, []);

  const openProfile = useCallback(() => {
    setSettingsOpen(false);
    setProfileOpen(true);
  }, []);

  const resetPreferences = useCallback(() => {
    updatePreferences(defaultPreferences);
  }, [updatePreferences]);

  const authenticate = useCallback(async (intent: AuthIntent) => {
    const supabase = await loadSupabaseBrowserClient();
    if (!supabase) return "Google authentication is unavailable without Supabase configuration.";
    const options = {
      redirectTo: `${location.origin}/auth/callback?next=/`,
    };

    if (intent === "signup") {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        const { error: guestError } = await supabase.auth.signInAnonymously();
        if (guestError) return "Could not start account creation. Please try again.";
      }
      const { error: signUpError } = await supabase.auth.linkIdentity({
        provider: "google",
        options,
      });
      if (!signUpError) track("google_account_linked");
      return signUpError ? "Could not open Google sign-up. Please try again." : null;
    }

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options,
    });
    if (!signInError) track("google_account_linked");
    return signInError ? "Could not open Google sign-in. Please try again." : null;
  }, []);

  const signOut = useCallback(async () => {
    const supabase = await loadSupabaseBrowserClient();
    if (!supabase) return "Sign out is unavailable without Supabase configuration.";
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) return "Could not sign out. Please try again.";
    setUser(null);
    setProfile(null);
    setProfileOpen(false);
    setSettingsOpen(false);
    router.refresh();
    return null;
  }, [router]);

  const chooseGame = useCallback(() => {
    shouldFocusLibrary.current = true;
    updatePreferences({ ...preferences, showGameLibrary: true });
  }, [preferences, updatePreferences]);

  useEffect(() => {
    if (!preferences.showGameLibrary || !shouldFocusLibrary.current) return;
    shouldFocusLibrary.current = false;
    const frame = window.requestAnimationFrame(() => {
      const library = libraryRef.current;
      if (!library) return;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      library.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      library.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [preferences.showGameLibrary]);

  async function play() {
    track("play_clicked");
    setStarting(true);
    setError(null);
    const supabase = await loadSupabaseBrowserClient();
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
      track("anonymous_auth_created");
    }
    const { error: profileError } = await supabase.rpc("ensure_profile");
    if (profileError) {
      setStarting(false);
      setError("Your player profile could not be created. Please try again.");
      return;
    }
    const profileResponse = await fetch("/api/profile", { cache: "no-store" });
    if (profileResponse.ok) {
      const body = await profileResponse.json();
      if (body.data?.onboarding_completed === false) {
        router.push("/onboarding");
        return;
      }
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
              profile={profile}
              user={user}
              onOpenChange={setSettingsOpen}
              onChange={updatePreferences}
              onOpenProfile={openProfile}
              onReset={resetPreferences}
              onAuthenticate={authenticate}
              onSignOut={signOut}
            />
            <button type="button" className="profile-chip" onClick={openProfile}>
              <span className={`accent-${profile?.accent_colour ?? "volt"}`}>
                {(profile?.display_name ?? "QD").slice(0, 2).toUpperCase()}
              </span>
              <b>{profile?.display_name ?? "Profile"}</b>
            </button>
          </div>
        }
      />

      <section className="page-shell calm-hero">
        <div className="calm-hero-copy">
          <p className="calm-eyebrow"><span>01</span> Fast multiplayer perception games</p>
          <h1>Notice it.<br /><span>Win it.</span></h1>
          <p className="calm-subtitle">
            Thirteen short challenges. Accuracy wins; trusted timing settles the closest calls.
          </p>
          <div className="calm-hero-actions">
            <button type="button" className="calm-primary" onClick={play} disabled={starting}>
              <PlayIcon className="h-5 w-5" />
              {starting ? "Joining…" : "Quick play"}
            </button>
            <Link className="calm-secondary" href="/duel/new">
              Private duel <ArrowIcon className="h-4 w-4" />
            </Link>
            <button type="button" className="calm-tertiary" aria-controls="game-library" onClick={chooseGame}>
              Choose a game
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
        </div>

        <aside className="arena-preview" aria-label="QuickDuel ranked match preview">
          <div className="arena-preview-head">
            <span>Ranked round</span>
            <span className="arena-live"><i /> Live arena</span>
          </div>
          <div className="arena-scoreline">
            <div><span>You</span><strong>{profile?.rating ?? 1450}</strong></div>
            <LogoMark className="arena-mark" />
            <div><span>Opponent</span><strong>?</strong></div>
          </div>
          <div className="arena-grid-preview" aria-hidden="true">
            {Array.from({ length: 16 }, (_, index) => (
              <i className={[1, 4, 6, 10, 13, 15].includes(index) ? "is-active" : ""} key={index} />
            ))}
          </div>
          <div className="arena-preview-foot">
            <div><span>Current game</span><strong>Memory Grid</strong></div>
            <div><span>Recall in</span><strong>00:08</strong></div>
          </div>
        </aside>
      </section>

      <div className="page-shell calm-content">
        <div className="game-library-anchor" ref={libraryRef} tabIndex={-1}>
          <GameLibrary
            expanded={preferences.showGameLibrary}
            onExpand={() =>
              updatePreferences({
                ...preferences,
                showGameLibrary: !preferences.showGameLibrary,
              })
            }
          />
        </div>

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
          <Link href="/friends">Friends</Link>
          <Link href="/history">History</Link>
          <Link href="/leaderboard">Leaderboard</Link>
          <button type="button" onClick={openProfile}>Profile</button>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>

      {profileOpen && (
        <ProfileDrawer
          open
          profile={profile}
          user={user}
          onClose={() => setProfileOpen(false)}
          onUpdated={setProfile}
        />
      )}
    </main>
  );
}
