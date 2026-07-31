"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/ui/header";
import type { PublicProfile } from "@/types/database";
import { getGame } from "@/games/registry";
import type { GameId, PlaylistId } from "@/games/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";
import { getDivision } from "@/lib/divisions";

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
  const [activePlaylist, setActivePlaylist] = useState(playlist);
  const [activeGame, setActiveGame] = useState(preferredGame);
  const [queueActivity, setQueueActivity] = useState<number | null>(null);
  const [duplicateTab, setDuplicateTab] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const queueStartedAt = useRef(0);
  const tabId = useRef("");
  const leaving = useRef(false);

  const handleQueueResult = useCallback(
    (result: QueueResult) => {
      if (result.match_id) {
        const durationMs = Date.now() - queueStartedAt.current;
        track("human_match_found", {
          playlist: activePlaylist,
          gameType: activeGame,
          matchId: result.match_id,
          durationMs,
        });
        if (notificationsEnabled && document.visibilityState !== "visible") {
          new Notification("Human opponent found", {
            body: "Your QuickDuel match is ready.",
            icon: "/brand/quickduel-google-120.png",
          });
        }
        router.replace(`/match/${result.match_id}`);
      } else {
        setStatus("searching");
        setMessage("Looking for a real opponent");
      }
    },
    [activeGame, activePlaylist, notificationsEnabled, router],
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
        postQueue("join", activePlaylist, activeGame),
        fetch("/api/profile", { cache: "no-store" }),
      ]);
      if (profileResponse.ok) {
        const body = await profileResponse.json();
        setProfile(body.data);
      }
      handleQueueResult(queue);
      track("queue_joined", {
        playlist: activePlaylist,
        gameType: activeGame,
      });
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Matchmaking failed.");
    }
  }, [activeGame, activePlaylist, handleQueueResult]);

  useEffect(() => {
    const leaseKey = "quickduel:queue-tab";
    const currentTabId = crypto.randomUUID();
    tabId.current = currentTabId;
    queueStartedAt.current = Date.now();
    let leaseTimer: number | undefined;
    const timer = window.setTimeout(() => {
      const current = localStorage.getItem(leaseKey);
      if (current) {
        try {
          const lease = JSON.parse(current) as { id: string; at: number };
          if (lease.id !== currentTabId && Date.now() - lease.at < 8_000) {
            setDuplicateTab(true);
            setStatus("error");
            setMessage("QuickDuel is already searching in another tab");
            return;
          }
        } catch {
          // Replace malformed local state with this tab's lease.
        }
      }
      const writeLease = () =>
        localStorage.setItem(
          leaseKey,
          JSON.stringify({ id: currentTabId, at: Date.now() }),
        );
      writeLease();
      leaseTimer = window.setInterval(writeLease, 2_000);
      void join();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (leaseTimer !== undefined) window.clearInterval(leaseTimer);
      const lease = localStorage.getItem(leaseKey);
      if (lease?.includes(currentTabId)) localStorage.removeItem(leaseKey);
    };
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
        handleQueueResult(await postQueue("heartbeat", activePlaylist, activeGame));
      } catch {
        setStatus(navigator.onLine ? "error" : "offline");
        setMessage(navigator.onLine ? "Connection interrupted" : "You are offline");
      }
    }, 5_000);
    return () => window.clearInterval(heartbeat);
  }, [activeGame, activePlaylist, handleQueueResult, status]);

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
      if (!leaving.current) void postQueue("leave", activePlaylist, activeGame).catch(() => undefined);
    };
  }, [activeGame, activePlaylist]);

  useEffect(() => {
    if (duplicateTab) return;
    const loadHealth = async () => {
      try {
        const query = new URLSearchParams({ playlist: activePlaylist });
        if (activeGame) query.set("game", activeGame);
        const response = await fetch(`/api/matchmaking/health?${query}`, { cache: "no-store" });
        const body = await response.json();
        if (response.ok) setQueueActivity(Number(body.data.waiting_approximately ?? 0));
      } catch {
        // Queue health is supplementary and never blocks matchmaking.
      }
    };
    void loadHealth();
    const timer = window.setInterval(() => void loadHealth(), 10_000);
    return () => window.clearInterval(timer);
  }, [activeGame, activePlaylist, duplicateTab]);

  async function cancel(destination = "/") {
    leaving.current = true;
    await postQueue("leave", activePlaylist, activeGame).catch(() => undefined);
    track("queue_cancelled", {
      playlist: activePlaylist,
      gameType: activeGame,
      durationMs: Date.now() - queueStartedAt.current,
    });
    router.push(destination);
  }

  async function broaden(nextPlaylist: PlaylistId, nextGame: GameId | null) {
    await postQueue("leave", activePlaylist, activeGame).catch(() => undefined);
    leaving.current = false;
    setActivePlaylist(nextPlaylist);
    setActiveGame(nextGame);
    queueStartedAt.current = Date.now();
    setSeconds(0);
    track("queue_broadened", {
      playlist: nextPlaylist,
      gameType: nextGame,
      properties: {
        fromPlaylist: activePlaylist,
        fromGame: activeGame,
      },
    });
  }

  async function enableNotifications() {
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === "granted");
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
            ? `${activePlaylist} · ${activeGame ? getGame(activeGame).name : "mixed games"}`
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
            Division <strong className="text-white">{profile ? getDivision(profile.rating).name : "—"}</strong>
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
          <span>{queueActivity === null ? "Checking queue activity…" : `${queueActivity} waiting with compatible preferences`}</span>
        </div>

        {duplicateTab && (
          <div className="mt-8 max-w-xl border-y border-[var(--border)] py-6">
            <p className="text-[var(--muted)]">Close the other queue tab or wait a few seconds, then retry here. This prevents duplicate queue slots.</p>
          </div>
        )}

        {!duplicateTab && status === "searching" && activeGame && seconds >= 12 && (
          <div className="queue-broaden">
            <p>No player found for {getGame(activeGame).name}. Search the full {activePlaylist === "quick" ? getGame(activeGame).category : activePlaylist} playlist?</p>
            <button type="button" onClick={() => void broaden((activePlaylist === "quick" ? getGame(activeGame).category : activePlaylist) as PlaylistId, null)}>Broaden with consent</button>
          </div>
        )}

        {!duplicateTab && status === "searching" && !activeGame && activePlaylist !== "quick" && seconds >= 22 && (
          <div className="queue-broaden">
            <p>Still waiting. Search all ranked Quick Play games?</p>
            <button type="button" onClick={() => void broaden("quick", null)}>Search Quick Play</button>
          </div>
        )}

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
                  void cancel(`/match/practice?game=${activeGame ?? (activePlaylist === "sensory" ? "frequency_recall" : activePlaylist === "experimental" ? "reaction_test" : "memory_grid")}&seed=${Date.now()}`)
                }
              >
                Practise against bot
              </Button>
            </div>
          </div>
        )}

        <div className="mt-10 flex gap-3">
          {typeof Notification !== "undefined" && Notification.permission === "default" && status === "searching" && (
            <Button variant="secondary" onClick={() => void enableNotifications()}>
              Notify me when matched
            </Button>
          )}
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
