"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ChatMessage = {
  id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
};

export function MatchChat({
  matchId,
  currentUserId,
}: {
  matchId: string;
  currentUserId: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [muted, setMuted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    const response = await fetch(`/api/matches/${matchId}/chat`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? "Chat unavailable.");
    setMessages(payload.data as ChatMessage[]);
  }, [matchId]);

  useEffect(() => {
    if (muted) return;
    const initial = window.setTimeout(() => {
      void reload().catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Chat unavailable.");
      });
    }, 0);
    const poll = window.setInterval(() => {
      void reload().catch(() => undefined);
    }, 3_000);
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      ?.channel(`match-chat:${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "match_chat_messages",
          filter: `match_id=eq.${matchId}`,
        },
        () => void reload(),
      )
      .subscribe();
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(poll);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [matchId, muted, reload]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const normalized = body.trim();
    if (!normalized || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/matches/${matchId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: normalized }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Message not sent.");
      setBody("");
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Message not sent.");
    } finally {
      setSending(false);
    }
  }

  async function report(messageId: string) {
    const response = await fetch(`/api/matches/${matchId}/chat/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, reason: "harassment" }),
    });
    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error?.message ?? "Report not sent.");
      return;
    }
    setError("Message reported for review.");
  }

  if (muted) {
    return (
      <aside className="match-chat match-chat-muted" aria-label="Match chat muted">
        <span>Match chat muted</span>
        <button type="button" onClick={() => setMuted(false)}>Unmute</button>
      </aside>
    );
  }

  return (
    <aside className="match-chat" aria-label="Live match chat">
      <header>
        <div><strong>Match chat</strong><small>Only this 1v1 · kept 7 days</small></div>
        <button type="button" onClick={() => setMuted(true)}>Mute</button>
      </header>
      <div className="match-chat-log" aria-live="polite">
        {messages.length === 0 && <p>No messages yet. Keep it sporting.</p>}
        {messages.map((message) => (
          <article
            className={message.sender_id === currentUserId ? "mine" : ""}
            key={message.id}
          >
            <span>{message.sender_id === currentUserId ? "You" : message.sender_name}</span>
            <p>{message.body}</p>
            {message.sender_id !== currentUserId && (
              <button type="button" onClick={() => void report(message.id)}>Report</button>
            )}
          </article>
        ))}
        <div ref={bottom} />
      </div>
      <form onSubmit={(event) => void send(event)}>
        <label className="sr-only" htmlFor={`chat-${matchId}`}>Message opponent</label>
        <input
          id={`chat-${matchId}`}
          value={body}
          maxLength={280}
          placeholder="Message opponent"
          onChange={(event) => setBody(event.target.value)}
        />
        <button type="submit" disabled={sending || body.trim().length === 0}>
          {sending ? "…" : "Send"}
        </button>
      </form>
      {error && <p className="match-chat-error" role="status">{error}</p>}
    </aside>
  );
}
