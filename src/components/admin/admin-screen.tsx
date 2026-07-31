"use client";

import { FormEvent, useEffect, useState } from "react";
import { ProductHeader } from "@/components/ui/product-header";

type AdminOverview = {
  flags: Array<{
    id: string;
    signal: string;
    severity: number;
    status: string;
    created_at: string;
    display_name: string | null;
    public_code: string | null;
    match_id: string | null;
  }>;
  audit: Array<{
    id: number;
    action: string;
    reason: string | null;
    actor_name: string | null;
    target_name: string | null;
    target_match_id: string | null;
    created_at: string;
  }>;
  analytics: {
    since: string;
    events: Record<string, number>;
    landing_to_play: { landing: number; play: number };
    queue: { joined: number; cancelled: number; average_wait_ms: number | null };
  } | null;
};

type PlayerLookup = {
  display_name: string;
  public_code: string;
  rating: number;
  matches_played: number;
  profile_state: string;
  enforcement_state: string;
  enforcement_reason: string | null;
  enforcement_expires_at: string | null;
  open_flags: number;
  invitations_24h: number;
  ranked_matches_24h: number;
};

export function AdminScreen() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [lookup, setLookup] = useState<PlayerLookup | null>(null);
  const [publicCode, setPublicCode] = useState("");
  const [state, setState] = useState("warning");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [matchId, setMatchId] = useState("");
  const [matchReason, setMatchReason] = useState("");
  const [matchConfirmation, setMatchConfirmation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [adminResponse, healthResponse] = await Promise.all([
      fetch("/api/admin", { cache: "no-store" }),
      fetch("/api/health", { cache: "no-store" }),
    ]);
    const [adminBody, healthBody] = await Promise.all([
      adminResponse.json(),
      healthResponse.json(),
    ]);
    if (!adminResponse.ok) throw new Error(adminBody.error?.message ?? "Admin overview failed.");
    setOverview(adminBody.data);
    setHealth(healthBody.data);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((caught) =>
        setMessage(caught instanceof Error ? caught.message : "Admin overview failed."),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function enforce(event: FormEvent) {
    event.preventDefault();
    if (!confirmation) return;
    const response = await fetch("/api/admin/enforcement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicCode,
        state,
        reason,
        durationMinutes: state === "temporarily_suspended" ? 1_440 : null,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error?.message ?? "Enforcement failed.");
      return;
    }
    setMessage(`Account state changed to ${state}.`);
    setConfirmation(false);
    await load();
  }

  async function searchPlayer(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`/api/admin?code=${encodeURIComponent(publicCode)}`, {
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error?.message ?? "Player lookup failed.");
      return;
    }
    setLookup(body.data.player);
    setMessage(body.data.player ? null : "Player not found.");
  }

  async function invalidate(event: FormEvent) {
    event.preventDefault();
    if (!matchConfirmation) return;
    const response = await fetch("/api/admin/matches/invalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, reason: matchReason }),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error?.message ?? "Match invalidation failed.");
      return;
    }
    setMessage("Ranked match invalidated and audited.");
    setMatchConfirmation(false);
    setMatchId("");
    setMatchReason("");
    await load();
  }

  return (
    <main className="min-h-screen">
      <ProductHeader />
      <section className="page-shell feature-shell admin-shell">
        <div className="feature-heading">
          <p className="calm-eyebrow">Restricted operations</p>
          <h1>QuickDuel admin</h1>
          <p>Database-backed roles protect every query and action. All enforcement changes are audited.</p>
        </div>
        {message && <p className="profile-message" role="status">{message}</p>}

        <section className="admin-health">
          <h2>System health</h2>
          <dl>
            {Object.entries(health ?? {}).map(([key, value]) => (
              <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{String(value)}</dd></div>
            ))}
          </dl>
        </section>

        <section className="admin-player-lookup">
          <div className="feature-section-heading"><div><h2>Player lookup</h2><p>Search the stable public code; private auth identity is never displayed.</p></div></div>
          <form onSubmit={searchPlayer}>
            <label>Public profile code<input value={publicCode} onChange={(event) => setPublicCode(event.target.value)} placeholder="7A2F1C" /></label>
            <button className="calm-secondary" type="submit" disabled={publicCode.length < 6}>View status</button>
          </form>
          {lookup && (
            <dl>
              <div><dt>Player</dt><dd>{lookup.display_name}#{lookup.public_code}</dd></div>
              <div><dt>Rating / matches</dt><dd>{lookup.rating} / {lookup.matches_played}</dd></div>
              <div><dt>Account state</dt><dd>{lookup.enforcement_state.replaceAll("_", " ")}</dd></div>
              <div><dt>Open flags</dt><dd>{lookup.open_flags}</dd></div>
              <div><dt>Invitations (24h)</dt><dd>{lookup.invitations_24h}</dd></div>
              <div><dt>Ranked matches (24h)</dt><dd>{lookup.ranked_matches_24h}</dd></div>
            </dl>
          )}
        </section>

        <section className="admin-grid">
          <div>
            <div className="feature-section-heading"><div><h2>Open abuse flags</h2><p>Signals require review; one signal never creates a permanent ban.</p></div></div>
            <div className="admin-list">
              {(overview?.flags ?? []).map((flag) => (
                <article key={flag.id}><div><b>{flag.signal.replaceAll("_", " ")}</b><small>Severity {flag.severity} · {flag.status}</small></div><div><span>{flag.display_name ?? "Unknown"}{flag.public_code ? `#${flag.public_code}` : ""}</span><small>{new Date(flag.created_at).toLocaleString()}</small></div></article>
              ))}
              {overview?.flags.length === 0 && <p>No recent abuse flags.</p>}
            </div>
          </div>
          <aside>
            <h2>Change account state</h2>
            <form onSubmit={enforce}>
              <label>Public profile code<input value={publicCode} onChange={(event) => setPublicCode(event.target.value)} placeholder="7A2F1C" /></label>
              <label>State<select value={state} onChange={(event) => setState(event.target.value)}><option value="normal">Normal</option><option value="warning">Warning</option><option value="ranked_restricted">Ranked restricted</option><option value="temporarily_suspended">Suspend 24 hours</option><option value="manually_banned">Manual ban</option></select></label>
              <label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} /></label>
              <label className="feature-check"><input type="checkbox" checked={confirmation} onChange={(event) => setConfirmation(event.target.checked)} /><span><b>Confirm action</b><small>This change is recorded in the audit log.</small></span></label>
              <button className="danger-button" disabled={!confirmation || publicCode.length < 6 || reason.length < 3} type="submit">Apply enforcement</button>
            </form>
            <h2>Invalidate ranked match</h2>
            <form onSubmit={invalidate}>
              <label>Completed match ID<input value={matchId} onChange={(event) => setMatchId(event.target.value)} placeholder="00000000-0000-4000-8000-000000000000" /></label>
              <label>Reason<textarea value={matchReason} onChange={(event) => setMatchReason(event.target.value)} minLength={3} maxLength={500} /></label>
              <label className="feature-check"><input type="checkbox" checked={matchConfirmation} onChange={(event) => setMatchConfirmation(event.target.checked)} /><span><b>Confirm invalidation</b><small>This stops the match from counting as ranked and creates an audit event. Elo is not silently rewritten.</small></span></label>
              <button className="danger-button" disabled={!matchConfirmation || matchId.length !== 36 || matchReason.length < 3} type="submit">Invalidate match</button>
            </form>
          </aside>
        </section>

        <section className="admin-analytics">
          <div className="feature-section-heading"><div><h2>First-party analytics</h2><p>Thirty-day aggregate. No raw IPs, fingerprinting, keystrokes, pointer traces, or audio.</p></div></div>
          <dl>
            {Object.entries(overview?.analytics?.events ?? {}).map(([event, count]) => <div key={event}><dt>{event}</dt><dd>{count}</dd></div>)}
          </dl>
        </section>

        <section>
          <div className="feature-section-heading"><div><h2>Audit log</h2><p>Security-sensitive actions and rating finalizations.</p></div></div>
          <div className="audit-list">
            {(overview?.audit ?? []).map((event) => <article key={event.id}><b>{event.action.replaceAll("_", " ")}</b><span>{event.actor_name ?? "System"} → {event.target_name ?? event.target_match_id ?? "match"}</span><small>{new Date(event.created_at).toLocaleString()}{event.reason ? ` · ${event.reason}` : ""}</small></article>)}
          </div>
        </section>
      </section>
    </main>
  );
}
