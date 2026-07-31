"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics";
import type { PublicProfile } from "@/types/database";
import { ProductHeader } from "@/components/ui/product-header";

type Player = {
  display_name: string;
  public_code: string;
  rating: number;
  status: "online" | "recent" | "offline";
};

type Friend = Player & {
  head_to_head: { matches: number; wins: number; losses: number; draws: number };
};

type Request = {
  id: string;
  direction: "incoming" | "outgoing";
  display_name: string;
  public_code: string;
  created_at: string;
};

type Invitation = {
  id: string;
  direction: "incoming" | "outgoing";
  display_name: string;
  public_code: string;
  duel_code: string;
  game_type: string | null;
  playlist: string;
  best_of: number;
  ranked: boolean;
  expires_at: string;
};

type FriendsState = {
  friends: Friend[];
  requests: Request[];
  invitations: Invitation[];
  blocked: Array<{ display_name: string; public_code: string }>;
};

async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Request failed.");
  return body.data as T;
}

export function FriendsScreen() {
  const router = useRouter();
  const [state, setState] = useState<FriendsState | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Player[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [friends, me] = await Promise.all([
        api<FriendsState>("/api/friends"),
        api<PublicProfile>("/api/profile"),
      ]);
      setState(friends);
      setProfile(me);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load friends.");
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void reload(), 0);
    const refresh = window.setInterval(() => void reload(), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(refresh);
    };
  }, [reload]);

  async function search(event: FormEvent) {
    event.preventDefault();
    setSearching(true);
    setError(null);
    try {
      setResults(await api<Player[]>(`/api/friends/search?query=${encodeURIComponent(query)}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function request(publicCode: string) {
    try {
      await api("/api/friends", {
        method: "POST",
        body: JSON.stringify({ publicCode }),
      });
      track("friend_request_sent");
      setResults([]);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    }
  }

  async function respond(requestId: string, accept: boolean) {
    try {
      await api("/api/friends", {
        method: "PATCH",
        body: JSON.stringify({ requestId, accept }),
      });
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Response failed.");
    }
  }

  async function friendAction(action: "remove" | "block", publicCode: string) {
    if (action === "block" && !window.confirm("Block this player? They will not be able to send requests or duel invitations.")) return;
    try {
      await api("/api/friends", {
        method: "DELETE",
        body: JSON.stringify({ action, publicCode }),
      });
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.");
    }
  }

  async function invite(publicCode: string) {
    try {
      const result = await api<{ duel_code: string }>("/api/invitations", {
        method: "POST",
        body: JSON.stringify({
          publicCode,
          selectionKind: "playlist",
          game: null,
          playlist: "quick",
          bestOf: 3,
          ranked: false,
        }),
      });
      track("duel_invitation_sent", { playlist: "quick", properties: { bestOf: 3 } });
      router.push(`/duel/${result.duel_code}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invitation failed.");
    }
  }

  async function respondInvite(invitationId: string, accept: boolean) {
    try {
      const result = await api<{ duel_code?: string; match_id?: string }>("/api/invitations", {
        method: "PATCH",
        body: JSON.stringify({ invitationId, accept }),
      });
      if (accept && result.match_id) router.push(`/match/${result.match_id}`);
      else await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invitation response failed.");
    }
  }

  return (
    <main className="min-h-screen">
      <ProductHeader current="friends" />
      <section className="page-shell feature-shell">
        <div className="feature-heading feature-heading-row">
          <div>
            <p className="calm-eyebrow">Connections without chat</p>
            <h1>Friends</h1>
            <p>Find a player, keep a head-to-head record, and invite them directly.</p>
          </div>
          {profile?.public_code && (
            <div className="player-code"><small>Your player code</small><strong>{profile.display_name}#{profile.public_code}</strong><button type="button" onClick={() => void navigator.clipboard.writeText(`${profile.display_name}#${profile.public_code}`)}>Copy</button></div>
          )}
        </div>

        <form className="friend-search" onSubmit={search}>
          <label htmlFor="player-search">Exact display name or player code</label>
          <div><input id="player-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Levi#7A2F1C or Levi" minLength={3} maxLength={32} /><button className="calm-primary" disabled={searching} type="submit">{searching ? "Searching…" : "Find player"}</button></div>
        </form>
        {error && <p className="inline-error" role="alert">{error}</p>}
        {results.length > 0 && (
          <div className="search-results">
            {results.map((player) => (
              <article key={player.public_code}><div><b>{player.display_name}#{player.public_code}</b><span>{player.rating} Elo · {player.status === "recent" ? "Recently active" : player.status}</span></div><button type="button" onClick={() => void request(player.public_code)}>Send request</button></article>
            ))}
          </div>
        )}

        {!state ? (
          <p className="empty-state">Loading your connections…</p>
        ) : (
          <div className="friends-layout">
            <section>
              <div className="feature-section-heading"><div><h2>Your friends</h2><p>Presence is approximate; exact last-seen times are never shown.</p></div></div>
              {state.friends.length === 0 ? (
                <div className="empty-state"><h3>No friends yet.</h3><p>Share your player code or challenge someone directly.</p></div>
              ) : (
                <div className="friend-list">
                  {state.friends.map((friend) => (
                    <article key={friend.public_code}>
                      <span className={`presence presence-${friend.status}`} aria-label={friend.status} />
                      <div><h3>{friend.display_name}#{friend.public_code}</h3><p>{friend.status === "recent" ? "Recently active" : friend.status} · {friend.rating} Elo</p><small>Head to head: {friend.head_to_head.wins}W · {friend.head_to_head.losses}L · {friend.head_to_head.draws}D</small></div>
                      <div><button type="button" onClick={() => void invite(friend.public_code)}>Invite</button><button type="button" onClick={() => void friendAction("remove", friend.public_code)}>Remove</button><button className="danger-link" type="button" onClick={() => void friendAction("block", friend.public_code)}>Block</button></div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <aside>
              <section>
                <h2>Friend requests</h2>
                {state.requests.length === 0 ? <p>No pending requests.</p> : state.requests.map((request) => (
                  <article key={request.id}><div><b>{request.display_name}#{request.public_code}</b><small>{request.direction}</small></div>{request.direction === "incoming" && <div><button type="button" onClick={() => void respond(request.id, true)}>Accept</button><button type="button" onClick={() => void respond(request.id, false)}>Decline</button></div>}</article>
                ))}
              </section>
              <section>
                <h2>Duel invitations</h2>
                {state.invitations.length === 0 ? <p>No pending invitations.</p> : state.invitations.map((invitation) => (
                  <article key={invitation.id}><div><b>{invitation.display_name}</b><small>{invitation.best_of === 1 ? "Single game" : `Best of ${invitation.best_of}`} · {invitation.ranked ? "Ranked" : "Unranked"}</small></div>{invitation.direction === "incoming" && <div><button type="button" onClick={() => void respondInvite(invitation.id, true)}>Accept</button><button type="button" onClick={() => void respondInvite(invitation.id, false)}>Decline</button></div>}</article>
                ))}
              </section>
              {state.blocked.length > 0 && <details><summary>Blocked players ({state.blocked.length})</summary><ul>{state.blocked.map((player) => <li key={player.public_code}>{player.display_name}#{player.public_code}</li>)}</ul></details>}
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
