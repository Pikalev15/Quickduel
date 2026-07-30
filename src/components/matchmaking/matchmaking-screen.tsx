"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/ui/header";
import type { PublicProfile } from "@/types/database";
import { getGame } from "@/games/registry";
import type { GameId, PlaylistId } from "@/games/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type QueueResult = { queued: boolean; match_id: string | null };

async function postQueue(
  path: "join" | "heartbeat" | "leave",
  playlist: PlaylistId,
  preferredGame: GameId | null,
) {
  const response = await fetch(`/api/matchmaking/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      path === "leave" ? {} : { playlist, preferredGame },
    ),
    cache: "no-store",
    keepalive: path === "leave",
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Matchmaking failed.");
  return body.data as QueueResult;
}

export function MatchmakingScreen({
  playlist,
  preferredGame,
}: {
  playlist: PlaylistId;
  preferredGame: GameId | null;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [status, setStatus] = useState<"connecting" | "searching" | "offline" | "error">(
    "connecting",
  );
  const [message, setMessage] = useState("Joining the queue…");
  const [offerBot, setOfferBot] = useState(false);
  const leaving = useRef(false);

  const handleQueueResult = useCallback(
    (result: QueueResult) => {
      if (result.match_id) {
        router.replace(`/match/${result.match_id}`);
      } else {
        setStatus("searching");
        setMessage("Looking for a real opponent");
      }
    },
    [router],
  );

  const join = useCallback(async () => {
    try {
      setStatus(navigator.onLine ? "connecting" : "offline");
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Matchmaking needs Supabase configuration.");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
      }
      const { error: profileError } = await supabase.rpc("ensure_profile");
      if (profileError) throw profileError;
      const [queue, profileResponse] = await Promise.all([
        postQueue("join", playlist, preferredGame),
        fetch("/api/profile", { cache: "no-store" }),
      ]);
      if (profileResponse.ok) {
        const body = await profileResponse.json();
        setProfile(body.data);
      }
      handleQueueResult(queue);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Matchmaking failed.");
    }
  }, [handleQueueResult, playlist, preferredGame]);

  useEffect(() => {
    const timer = window.setTimeout(() => void join(), 0);
    return () => window.clearTimeout(timer);
  }, [join]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        const next = value + 1;
        if (next >= 8) setOfferBot(true);
        return next;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const heartbeat = window.setInterval(async () => {
      if (leaving.current || status !== "searching") return;
      try {
        handleQueueResult(await postQueue("heartbeat", playlist, preferredGame));
      } catch {
        setStatus(navigator.onLine ? "error" : "offline");
        setMessage(navigator.onLine ? "Connection interrupted" : "You are offline");
      }
    }, 5_000);
    return () => window.clearInterval(heartbeat);
  }, [handleQueueResult, playlist, preferredGame, status]);

  useEffect(() => {
    const goOffline = () => {
      setStatus("offline");
      setMessage("You are offline");
    };
    const goOnline = () => void join();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [join]);

  useEffect(() => {
    const leave = () => {
      if (leaving.current) return;
      leaving.current = true;
      navigator.sendBeacon("/api/matchmaking/leave", new Blob(["{}"], {
        type: "application/json",
      }));
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      if (!leaving.current) void postQueue("leave", playlist, preferredGame).catch(() => undefined);
    };
  }, [playlist, preferredGame]);

  async function cancel(destination = "/") {
    leaving.current = true;
    await postQueue("leave", playlist, preferredGame).catch(() => undefined);
    router.push(destination);
  }

  return (
    <main className="min-h-screen">
      <Header simple />
      <section className="page-shell screen-enter flex min-h-[calc(100vh-73px)] flex-col items-center justify-center py-12 text-center">
        <div className="relative mb-10 h-32 w-32" aria-hidden="true">
          <div className="absolute inset-0 border border-[var(--border)]" />
          <div className="search-pulse absolute left-3 top-3 h-11 w-11 bg-[var(--accent)]" />
          <div
            className="search-pulse absolute bottom-3 right-3 h-11 w-11 border border-[var(--accent)]"
            style={{ animationDelay: "400ms" }}
          />
        </div>
        <p className="display text-sm tracking-[0.16em] text-[var(--accent)]">
          {status === "searching"
            ? `${playlist} · ${preferredGame ? getGame(preferredGame).name : "mixed games"}`
            : status}
        </p>
        <h1 className="display mt-3 text-[clamp(2.8rem,8vw,5.5rem)] leading-none">
          {message}
        </h1>
        <time className="display mt-7 text-5xl tabular-nums" aria-live="polite">
          00:{String(seconds).padStart(2, "0")}
        </time>
        <div className="mt-7 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-[var(--muted)]">
          <span>
            Player{" "}
            <strong className="text-white">
              {profile?.display_name ?? "Loading…"}
            </strong>
          </span>
          <span>
            Rating <strong className="text-white">{profile?.rating ?? "—"}</strong>
          </span>
          <span>
            Rank{" "}
            <strong className="text-white">
              {profile?.rank ? `#${profile.rank}` : "—"}
            </strong>
          </span>
          <span className="flex items-center gap-2">
            <span
              className={`h-2 w-2 ${status === "searching" ? "bg-[var(--accent)]" : "bg-[var(--danger)]"}`}
            />
            {status === "searching" ? "Connected" : "Reconnecting"}
          </span>
        </div>

        {offerBot && (
          <div className="mt-10 w-full max-w-2xl border-y border-[var(--border)] py-7">
            <p className="mb-5 text-sm text-[var(--muted)]">
              No human match yet. Practice is clearly labelled and never ranked.
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button variant="secondary" onClick={() => setOfferBot(false)}>
                Keep waiting
              </Button>
              <Button
                onClick={() =>
                  void cancel(`/match/practice?game=${preferredGame ?? (playlist === "sensory" ? "frequency_recall" : playlist === "experimental" ? "reaction_test" : "memory_grid")}&seed=${Date.now()}`)
                }
              >
                Practise against bot
              </Button>
            </div>
          </div>
        )}

        <div className="mt-10 flex gap-3">
          {(status === "offline" || status === "error") && (
            <Button onClick={() => void join()}>Retry</Button>
          )}
          <Button variant="quiet" onClick={() => void cancel()}>
            Cancel
          </Button>
        </div>
      </section>
    </main>
  );
}
