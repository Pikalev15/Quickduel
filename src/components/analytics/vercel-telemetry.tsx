"use client";

import { useSyncExternalStore } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { analyticsEnabled } from "@/lib/analytics";
import { publicTelemetryUrl } from "@/lib/telemetry-privacy";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("quickduel:analytics-preference", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("quickduel:analytics-preference", listener);
  };
}
function serverSnapshot() { return false; }

export function VercelTelemetry() {
  const enabled = useSyncExternalStore(subscribe, analyticsEnabled, serverSnapshot);
  if (!enabled || process.env.NEXT_PUBLIC_VERCEL_ENV !== "production") return null;
  return <>
    <Analytics beforeSend={(event) => {
      if (!analyticsEnabled() || event.type !== "pageview") return null;
      const url = publicTelemetryUrl(event.url, location.origin);
      return url ? { ...event, url } : null;
    }} />
    <SpeedInsights beforeSend={(event) => {
      if (!analyticsEnabled()) return null;
      const url = publicTelemetryUrl(event.url, location.origin);
      return url ? { ...event, url, route: new URL(url).pathname } : null;
    }} />
  </>;
}
