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
  type HomePreferences,
} from "./settings-popover";
import { track } from "@/lib/analytics";
import { DIVISIONS, getDivision } from "@/lib/divisions";
import { getPlacement, PLACEMENT_MATCHES } from "@/lib/placements";

type Leader = {
  rank: number;
  id: string;
  display_name: string;
  rating: number;
};

const defaultPreferences: HomePreferences = {
  showGameLibrary: false,
  showLeaderboardPreview: false,
  showHowItWorks: true,
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
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const libraryRef = useRef<HTMLDivElement>(null);
  const shouldFocusLibrary = useRef(false);
  const placement = getPlacement(profile?.matches_played);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const sections = document.querySelectorAll<HTMLElement>(".calm-home [data-qd-reveal]");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset.qdReveal = "entered";
        observer.unobserve(entry.target);
      }
    }, { threshold: 0, rootMargin: "0px 0px 24px 0px" });
    for (const section of sections) {
      if (section.dataset.qdReveal === "entered") continue;
      if (section.getBoundingClientRect().top <= window.innerHeight) {
        section.dataset.qdReveal = "entered";
      } else {
        section.dataset.qdReveal = "pending";
        observer.observe(section);
      }
    }
    return () => observer.disconnect();
  }, [preferences.showHowItWorks, preferences.showLeaderboardPreview, preferences.showGameLibrary]);

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
      } finally {
        if (active) setPreferencesReady(true);
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
              onOpenChange={setSettingsOpen}
              onChange={updatePreferences}
              onReset={resetPreferences}
            />
            <button type="button" className="profile-chip" aria-label="Player profile" onClick={openProfile}>
              <span data-precision-frame={profile?.equipped_cosmetics?.profile_frame==="frame-precision"} className={`accent-${profile?.accent_colour ?? "volt"}`}>
                {(profile?.display_name ?? "QD").slice(0, 2).toUpperCase()}
              </span>
              <b>{profile?.display_name ?? "Profile"}</b>
            </button>
          </div>
        }
      />

      <section className="page-shell calm-hero">
        <div className="calm-hero-copy">
          <h1>Notice it.<br /><span>Win it.</span></h1>
          <p className="calm-subtitle">
            Challenge a friend or find an opponent. Test your memory, pitch, colour recall and typing speed in your browser.
          </p>
          <div className="calm-hero-actions">
            <button type="button" className="calm-primary" onClick={play} disabled={starting}>
              <PlayIcon className="h-5 w-5" />
              {starting ? "Joining…" : "Quick play"}
            </button>
            <Link className="calm-secondary" href="/duel/new">
              Private duel <ArrowIcon className="h-4 w-4" />
            </Link>
            <Link className="calm-secondary" href="/daily">Daily Duel</Link>
            <Link className="calm-tertiary" href="/practice">Practice</Link>
            <button disabled={!preferencesReady} type="button" className="calm-tertiary" aria-controls="game-library" onClick={chooseGame}>
              Choose a game
            </button>
          </div>
          <div className="calm-player-line">
            <span><b>{placement?.placed && profile ? getDivision(profile.rating).name : placement ? `Placement ${placement.completed}/${placement.required}` : "Unranked"}</b>{placement?.placed && profile ? ` · ${profile.rating} Elo` : ""}</span>
            <span><SignalIcon className="h-4 w-4" /><b>{online ?? "–"}</b> online</span>
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
            <span>Memory Grid</span>
            <span className="arena-live">Preview</span>
          </div>
          <div className="arena-scoreline">
            <div><span>You</span><strong>{placement?.placed ? profile?.rating : "–"}</strong></div>
            <LogoMark className="arena-mark" />
            <div><span>Opponent</span><strong>?</strong></div>
          </div>
          <div className="arena-grid-preview" aria-hidden="true">
            {Array.from({ length: 16 }, (_, index) => (
              <i className={[1, 4, 6, 10, 13, 15].includes(index) ? "is-active" : ""} key={index} />
            ))}
          </div>
          <div className="arena-preview-foot">
            <div><span>Remember</span><strong>6 tiles</strong></div>
            <div><span>Answer time</span><strong>8s</strong></div>
          </div>
        </aside>
      </section>

      <div className="page-shell calm-content qd-long-home">
        <section className="qd-home-band qd-daily-teaser" data-qd-reveal=""><div><p className="game-kicker">One board. Everyone.</p><h2>Daily Duel</h2><p>Six puzzles, 45 seconds, one scored attempt each day. Compare your result even when nobody is online.</p></div><Link className="calm-primary" href="/daily">Today’s challenge <ArrowIcon className="h-4 w-4"/></Link></section>
        <section className="qd-home-band qd-daily-teaser" data-qd-reveal=""><div><p className="game-kicker">Weekly competition</p><h2>Weekly season</h2><p>Compete for weekly standings and see your archived results.</p></div><Link className="calm-secondary" href="/seasons">Weekly standings</Link></section>
        <section className="qd-home-band qd-explore" data-qd-reveal="" aria-labelledby="explore-heading">
          <div className="qd-section-intro"><h2 id="explore-heading">Try a challenge</h2></div>
          <div className="qd-feature-grid">
            <article className="qd-feature-card">
              <div className="qd-feature-visual qd-memory-visual" aria-hidden="true">{Array.from({ length: 25 }, (_, i) => <i key={i} className={[1, 4, 7, 10, 13, 17, 20, 23].includes(i) ? "lit" : ""} />)}</div>
              <div className="qd-feature-copy"><h3>Memory Grid XL</h3><p>Eight tiles light up on a 5×5 grid. How many can you remember?</p><Link href="/practice?game=memory_grid_v2">Play XL <ArrowIcon className="h-4 w-4" /></Link></div>
            </article>
            <article className="qd-feature-card">
              <div className="qd-feature-visual qd-tone-visual" aria-hidden="true"><svg viewBox="0 0 240 100"><path d="M0 50 Q10 4 20 50 T40 50 T60 50 T80 50 T100 50 T120 50 T140 50 T160 50 T180 50 T200 50 T220 50 T240 50" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg></div>
              <div className="qd-feature-copy"><h3>Frequency Recall</h3><p>Listen to a tone and estimate its pitch. See how close you were after each of five rounds.</p><Link href="/practice?game=frequency_recall_v2">Play Frequency Recall <ArrowIcon className="h-4 w-4" /></Link></div>
            </article>
            <article className="qd-feature-card">
              <div className="qd-feature-visual qd-word-visual" aria-hidden="true">{"SOLVE".split("").map((letter, i) => <i key={i}>{letter}</i>)}</div>
              <div className="qd-feature-copy"><h3>Cryptic Duel</h3><p>One clue, one word, 40 seconds. Try it in practice.</p><Link href="/practice?game=cryptic_duel">Play Cryptic Duel <ArrowIcon className="h-4 w-4" /></Link></div>
            </article>
          </div>
        </section>
        <div className="game-library-anchor" ref={libraryRef} tabIndex={-1} data-qd-reveal="">
          <GameLibrary
            ready={preferencesReady}
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
          <section className="calm-steps" data-qd-reveal="" aria-label="How QuickDuel works">
            {[
              ["01", "Match", "Choose a playlist or a specific challenge."],
              ["02", "Play", "Both players get the same challenge."],
              ["03", "Compare", "See your scores and who won."],
            ].map(([step, title, copy]) => (
              <article key={step}>
                <span>{step}</span>
                <h2>{title}</h2>
                <p>{copy}</p>
              </article>
            ))}
          </section>
        )}

        <section className="qd-home-band qd-rank-story" data-qd-reveal="" aria-labelledby="placement-heading">
          <div className="qd-section-intro"><h2 id="placement-heading">Your rank</h2><p>Finish {PLACEMENT_MATCHES} ranked matches against other players to earn a rank. Link your account to appear on the leaderboard.</p>
          <button className="calm-primary" type="button" onClick={play} disabled={starting}>{starting ? "Joining…" : placement?.placed ? "Play ranked" : "Start placements"} <ArrowIcon className="h-4 w-4" /></button></div>
          <div className="qd-rank-panel">
            <div className="qd-rank-panel-heading"><span>{placement?.placed && profile ? "Your division" : "Placement progress"}</span><strong>{placement?.placed && profile ? getDivision(profile.rating).name : `${placement?.completed ?? 0}/${PLACEMENT_MATCHES}`}</strong></div>
            <div className="qd-placement-track" aria-hidden="true">{Array.from({ length: PLACEMENT_MATCHES }, (_, i) => <i key={i} data-done={i < (placement?.completed ?? 0) ? "true" : undefined} />)}</div>
            <ol className="qd-division-ladder">{DIVISIONS.map((division) => <li key={division.id} data-current={placement?.placed && profile && getDivision(profile.rating).id === division.id ? "true" : undefined}><span className={`division-mark division-${division.id}`}>{division.mark}</span><b>{division.name}</b><small>{division.minimumRating}+ Elo</small></li>)}</ol>
          </div>
        </section>
        <section className="qd-home-band qd-social-band" data-qd-reveal="" aria-labelledby="duel-heading">
          <div className="qd-social-visual" aria-hidden="true"><div><span>YOU</span><strong>01</strong></div><b>VS</b><div><span>FRIEND</span><strong>02</strong></div></div>
          <div className="qd-section-intro"><h2 id="duel-heading">Play with friends</h2><p>Send a private duel link and play a best-of-three or best-of-five series.</p><Link className="calm-secondary" href="/duel/new">Create a private match <ArrowIcon className="h-4 w-4" /></Link></div>
        </section>

        {preferences.showLeaderboardPreview && (
          <section className="calm-leaderboard" data-qd-reveal="">
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
        <section className="qd-home-band qd-final-cta" data-qd-reveal="">
          <h2>Ready to play?</h2>
          <button type="button" className="calm-primary" onClick={play} disabled={starting}>{starting ? "Joining…" : "Find a match"} <ArrowIcon className="h-4 w-4" /></button>
        </section>
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
          key={`${profile?.id??user?.id??"guest"}:${profile?"profile":"initial"}`}
          open
          profile={profile}
          user={user}
          onClose={() => setProfileOpen(false)}
          onUpdated={setProfile}
          onSignedOut={() => { setProfile(null); setUser(null); setProfileOpen(false); router.refresh(); }}
        />
      )}
    </main>
  );
}
