"use client";

import type { GameId, PlaylistId } from "@/games/types";
import type { analyticsEventNames } from "./validation";

type EventName = (typeof analyticsEventNames)[number];

type EventContext = {
  gameType?: GameId | null;
  playlist?: PlaylistId | null;
  matchId?: string | null;
  durationMs?: number | null;
  properties?: Record<string, string | number | boolean | null>;
};

function sessionId() {
  const key = "quickduel:analytics-session";
  let value = sessionStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    sessionStorage.setItem(key, value);
  }
  return value;
}

function deviceClass() {
  if (window.innerWidth < 640) return "mobile";
  if (window.innerWidth < 1024) return "tablet";
  return "desktop";
}

function referrerCategory() {
  if (!document.referrer) return "direct";
  try {
    const referrer = new URL(document.referrer);
    if (referrer.origin === location.origin) return "internal";
    if (/google|bing|duckduckgo/i.test(referrer.hostname)) return "search";
    return "external";
  } catch {
    return "unknown";
  }
}

export function track(eventType: EventName, context: EventContext = {}) {
  const payload = JSON.stringify({
    eventType,
    sessionId: sessionId(),
    gameType: context.gameType ?? null,
    playlist: context.playlist ?? null,
    matchId: context.matchId ?? null,
    deviceClass: deviceClass(),
    referrerCategory: referrerCategory(),
    experimentVariant: null,
    durationMs: context.durationMs ?? null,
    properties: context.properties ?? {},
  });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/analytics",
      new Blob([payload], { type: "application/json" }),
    );
    return;
  }
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}
