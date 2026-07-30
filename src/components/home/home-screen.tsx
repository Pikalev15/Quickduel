"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ArrowIcon, PlayIcon, SignalIcon, TrophyIcon } from "@/components/ui/icons";
import { Header } from "@/components/ui/header";
import { Button } from "@/components/ui/button";

type Leader = {
  rank: number;
  id: string;
  display_name: string;
  rating: number;
};

type Profile = {
  rating: number;
};

export function HomeScreen() {
  const router = useRouter();
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [online, setOnline] = useState<number | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
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
    };
  }, []);

  async function play() {
    setStarting(true);
    setError(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStarting(false);
      setError(
        "Ranked play needs Supabase configuration. You can still try an unranked practice round.",
      );
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
    <main className="min-h-screen overflow-hidden">
      <Header onlineCount={online} />
      <div className="arena-grid pointer-events-none absolute inset-x-0 top-[73px] h-[650px] opacity-80" />

      <section className="page-shell screen-enter relative flex min-h-[570px] flex-col items-center justify-center py-14 text-center">
        <h1 className="display italic leading-[0.82] text-[clamp(4.7rem,13vw,9.6rem)] drop-shadow-[0_10px_30px_rgba(0,0,0,.45)]">
          Quick<span className="text-[var(--accent)]">Duel</span>
        </h1>
        <p className="mt-7 max-w-xl text-[clamp(1.08rem,2.2vw,1.5rem)] font-bold tracking-[-0.02em] text-white">
          Beat strangers in 30-second challenges.
        </p>
        <button
          type="button"
          onClick={play}
          disabled={starting}
          className="home-play clip-button accent-glow display mt-10 flex min-h-[92px] w-full max-w-[570px] items-center justify-center gap-5 border-2 border-[var(--accent)] bg-[var(--accent)] px-8 tracking-[0.04em] text-[var(--accent-ink)] transition hover:scale-[1.015] hover:bg-white disabled:cursor-wait disabled:opacity-70"
        >
          <PlayIcon className="h-11 w-11" />
          {starting ? "Entering…" : "Play now"}
        </button>
        <div className="mt-5 flex items-center divide-x divide-[var(--border)] text-left">
          <div className="px-5">
            <div className="text-[0.65rem] font-bold tracking-[0.14em] text-[var(--muted)]">
              RATING
            </div>
            <div className="display text-2xl">{profile?.rating ?? "—"}</div>
          </div>
          <div className="flex items-center gap-2 px-5">
            <SignalIcon className="h-7 w-7 text-[var(--accent)]" />
            <span className="display text-2xl">{online ?? "—"}</span>
            <span className="text-xs font-bold tracking-[0.12em] text-[var(--muted)]">
              ONLINE
            </span>
          </div>
        </div>
        {error && (
          <div
            role="alert"
            className="mt-6 max-w-xl border-l-2 border-[var(--danger)] bg-[var(--surface)] px-5 py-4 text-left text-sm text-[var(--muted)]"
          >
            <p>{error}</p>
            <Button
              className="mt-4"
              onClick={() => router.push(`/match/practice?seed=${Date.now()}`)}
            >
              Play practice
            </Button>
          </div>
        )}
      </section>

      <section className="relative border-y border-[var(--border)] bg-[rgb(5_11_20/88%)]">
        <div className="page-shell grid gap-10 py-10 lg:grid-cols-[1fr_360px] lg:items-center">
          <div>
            <h2 className="display mb-8 text-center text-lg tracking-[0.12em] text-[var(--muted)] lg:text-left">
              The 30-second loop
            </h2>
            <ol className="grid gap-8 sm:grid-cols-3">
              {[
                ["01", "Match", "Find a real opponent."],
                ["02", "Play", "Memorize. Select. Submit."],
                ["03", "Climb", "Win rating. Rise higher."],
              ].map(([step, title, copy]) => (
                <li key={step} className="relative border-l border-[var(--border)] pl-5">
                  <span className="display text-sm text-[var(--accent)]">{step}</span>
                  <h3 className="display mt-2 text-3xl">{title}</h3>
                  <p className="mt-2 text-sm text-[var(--muted)]">{copy}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="border border-[var(--border)] bg-[var(--inset)]">
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-4">
              <TrophyIcon className="h-5 w-5 text-[var(--accent)]" />
              <h2 className="display text-lg tracking-[0.08em]">Top duelists</h2>
            </div>
            {leaders.length > 0 ? (
              <ol>
                {leaders.map((leader) => (
                  <li
                    key={leader.id}
                    className="grid grid-cols-[32px_1fr_auto] border-b border-[var(--border)] px-5 py-3 text-sm"
                  >
                    <span className="display text-[var(--accent)]">{leader.rank}</span>
                    <span>{leader.display_name}</span>
                    <strong className="display text-[var(--accent)]">
                      {leader.rating}
                    </strong>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-5 py-8 text-sm text-[var(--muted)]">
                The first duelists will claim these spots.
              </p>
            )}
            <Link
              href="/leaderboard"
              className="display flex min-h-12 items-center justify-center gap-2 px-5 text-sm tracking-[0.08em] text-[var(--accent)] hover:text-white"
            >
              View leaderboard <ArrowIcon className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
