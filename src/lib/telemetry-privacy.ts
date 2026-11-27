/** Only public static routes are eligible for third-party telemetry. */
const publicPaths = new Set(["/", "/play", "/friends", "/history", "/leaderboard", "/profile/stats", "/profile/settings", "/seasons", "/match/practice", "/privacy", "/terms"]);
export function publicTelemetryUrl(value: string, origin: string): string | null {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || !publicPaths.has(url.pathname)) return null;
    return url.origin + url.pathname;
  } catch { return null; }
}
