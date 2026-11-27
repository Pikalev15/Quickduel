"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { activeRequests, requestTitle, type PlayerRequest, type RequestInbox } from "@/lib/notifications";
import { loadSupabaseBrowserClient } from "@/lib/supabase/lazy-client";

const isExpiredRequest = (item: PlayerRequest) => item.expiresAt !== null && Date.parse(item.expiresAt) <= Date.now();
const keyOf = (item: PlayerRequest) => `${item.kind}:${item.id}`;
function readSet(key: string): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem(key) ?? "[]") as string[]); } catch { return new Set(); }
}
function saveSet(key: string, values: Set<string>) {
  try { sessionStorage.setItem(key, JSON.stringify([...values].slice(-200))); } catch { /* storage unavailable */ }
}

export function RequestBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState<PlayerRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<PlayerRequest | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const userId = useRef<string | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const acting = useRef(false);
  const nextPoll = useRef(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);

  const reload = useCallback(async () => {
    if (inFlight.current || acting.current || document.visibilityState === "hidden" || Date.now() < nextPoll.current) return;
    inFlight.current = true;
    const current = generation.current;
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!mounted.current || generation.current !== current) return;
      if (response.status === 401) {
        userId.current = null;
        setAuthenticated(false);
        setItems([]);
        setToast(null);
        setOpen(false);
        nextPoll.current = Date.now() + 30_000;
        return;
      }
      if (!response.ok) throw new Error("Could not load requests.");
      const { data } = await response.json() as { data: RequestInbox };
      if (!mounted.current || generation.current !== current) return;
      userId.current = data.userId;
      setAuthenticated(true);
      const dismissed = readSet(`qd:requests:dismissed:${data.userId}`);
      const visible = activeRequests(data.requests, Date.now(), new Set()).filter(item => !dismissed.has(keyOf(item)));
      setItems(visible);
      const seen = readSet(`qd:requests:seen:${data.userId}`);
      const incoming = visible.find(item => !seen.has(keyOf(item)));
      for (const item of visible) seen.add(keyOf(item));
      saveSet(`qd:requests:seen:${data.userId}`, seen);
      setToast(previous => incoming ?? (previous && visible.some(item => keyOf(item) === keyOf(previous)) ? previous : null));
      nextPoll.current = 0;
    } catch {
      nextPoll.current = Date.now() + 15_000;
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const refresh = () => { nextPoll.current = 0; void reload(); };
    const initial = window.setTimeout(refresh, 0);
    const poll = window.setInterval(() => void reload(), 5_000);
    const expire = window.setInterval(() => {
      setItems(previous => previous.some(item => item.expiresAt && Date.parse(item.expiresAt) <= Date.now()) ? activeRequests(previous, Date.now(), new Set()) : previous);
      setToast(previous => previous?.expiresAt && Date.parse(previous.expiresAt) <= Date.now() ? null : previous);
    }, 1_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("quickduel:requests-changed", refresh);
    window.addEventListener("quickduel:requests-updated", refresh);
    document.addEventListener("visibilitychange", refresh);
    void loadSupabaseBrowserClient().then(client => {
      if (!active || !client) return;
      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (!active || event === "INITIAL_SESSION") return;
        if ((session?.user.id ?? null) !== userId.current) {
          generation.current += 1;
          userId.current = null;
          setItems([]);
          setAuthenticated(false);
          setToast(null);
          setOpen(false);
          window.setTimeout(refresh, 0);
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    }).catch(() => {});
    return () => {
      active = false;
      mounted.current = false;
      generation.current += 1;
      unsubscribe?.();
      window.clearTimeout(initial);
      window.clearInterval(poll);
      window.clearInterval(expire);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("quickduel:requests-changed", refresh);
      window.removeEventListener("quickduel:requests-updated", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reload]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  async function respond(item: PlayerRequest, accept: boolean) {
    if (acting.current || isExpiredRequest(item)) return;
    const id = keyOf(item);
    if (item.kind === "rematch_ready" && accept) {
      if (item.matchId) router.push(`/match/${item.matchId}`);
      return;
    }
    if ((item.kind === "rematch" || item.kind === "rematch_ready") && !accept) {
      const key = `qd:requests:dismissed:${userId.current}`;
      const dismissed = readSet(key);
      dismissed.add(id);
      saveSet(key, dismissed);
      setItems(previous => previous.filter(value => keyOf(value) !== id));
      setToast(previous => previous && keyOf(previous) === id ? null : previous);
      return;
    }
    acting.current = true;
    generation.current += 1;
    const currentUser = userId.current;
    setBusy(id);
    setError(null);
    try {
      const url = item.kind === "friend" ? "/api/friends" : item.kind === "duel" ? "/api/invitations" : `/api/matches/${item.matchId}/rematch`;
      const body = item.kind === "friend" ? { requestId: item.id, accept } : item.kind === "duel" ? { invitationId: item.id, accept } : { accept: true };
      const response = await fetch(url, { method: item.kind === "rematch" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Request unavailable.");
      if (!mounted.current || userId.current !== currentUser) return;
      setItems(previous => previous.filter(value => keyOf(value) !== id));
      setToast(previous => previous && keyOf(previous) === id ? null : previous);
      if (accept && result.data?.match_id) { setOpen(false); router.push(`/match/${result.data.match_id}`); }
      else if (accept && item.kind === "duel" && result.data?.duel_code) { setOpen(false); router.push(`/duel/${result.data.duel_code}`); }
    } catch (caught) {
      if (mounted.current && userId.current === currentUser) setError(caught instanceof Error ? caught.message : "Could not respond.");
    } finally {
      acting.current = false;
      if (mounted.current) {
        setBusy(null);
        nextPoll.current = 0;
        window.dispatchEvent(new Event("quickduel:requests-changed"));
      }
    }
  }

  if (pathname === "/play" || !authenticated) return null;
  const count = items.length;
  return (
    <div ref={wrapper} className="qd-request-anchor">
      <button ref={trigger} type="button" className="qd-request-bell" aria-label={count ? `Notifications, ${count} pending requests` : "Notifications"} aria-expanded={open} aria-controls="qd-request-panel" onClick={() => { setOpen(!open); setToast(null); nextPoll.current = 0; void reload(); }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>
        {count > 0 && <span className="qd-request-count" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
      </button>
      {open && <section id="qd-request-panel" className="qd-request-panel" aria-label="Notifications">
        <div className="qd-request-heading"><h2>Requests</h2><button type="button" aria-label="Close notifications" onClick={() => { setOpen(false); trigger.current?.focus(); }}>×</button></div>
        {error && <p className="qd-request-error" role="alert">{error}</p>}
        {!count ? <p className="qd-request-empty">No pending requests.</p> : <div className="qd-request-list">
          {items.map(item => <article className="qd-request-item" key={keyOf(item)}>
            <span className="qd-request-kind">{requestTitle(item.kind)}</span>
            <b>{item.sender}</b>
            <p>{item.detail}</p>
            <div className="qd-request-actions">
              <button type="button" disabled={busy !== null} aria-label={`${item.kind === "rematch_ready" ? "Join" : "Accept"} ${requestTitle(item.kind).toLowerCase()} from ${item.sender}`} onClick={() => void respond(item, true)}>{busy === keyOf(item) ? "Working…" : item.kind === "rematch_ready" ? "Join" : "Accept"}</button>
              <button type="button" disabled={busy !== null} aria-label={`${item.kind.startsWith("rematch") ? "Dismiss" : "Decline"} ${requestTitle(item.kind).toLowerCase()} from ${item.sender}`} onClick={() => void respond(item, false)}>{item.kind.startsWith("rematch") ? "Dismiss" : "Decline"}</button>
            </div>
          </article>)}
        </div>}
      </section>}
      {!open && toast && <aside className="qd-request-toast" role="status">
        <div><b>{requestTitle(toast.kind)}</b><p>{toast.sender}: {toast.detail}</p></div>
        <button type="button" onClick={() => { setOpen(true); setToast(null); }}>View</button>
        <button type="button" aria-label="Dismiss notification banner" onClick={() => setToast(null)}>×</button>
      </aside>}
    </div>
  );
}
