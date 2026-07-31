"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "client_runtime_error",
        message: error.message,
        route: location.pathname,
        digest: error.digest ?? null,
        stack: error.stack?.slice(0, 2_000) ?? null,
      }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="page-shell match-center text-center">
          <p className="game-kicker">QuickDuel error</p>
          <h1 className="display text-6xl">That round broke.</h1>
          <p className="mt-4 text-[var(--muted)]">
            The error was recorded without your private game data.
          </p>
          <button className="calm-primary mt-7" type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
