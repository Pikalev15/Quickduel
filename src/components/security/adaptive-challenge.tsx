"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        target: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback": () => void;
          "expired-callback": () => void;
          theme: "dark";
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function AdaptiveChallenge({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const target = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    const render = () => {
      if (cancelled || !target.current || !window.turnstile) return;
      try {
        widgetId = window.turnstile.render(target.current, {
          sitekey: siteKey,
          callback: (token) => onTokenRef.current(token),
          "error-callback": () => onTokenRef.current(""),
          "expired-callback": () => onTokenRef.current(""),
          theme: "dark",
        });
        setFailed(false);
      } catch {
        setFailed(true);
      }
    };
    const fail = () => {
      if (!cancelled) setFailed(true);
    };
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_URL}"]`,
    );
    if (window.turnstile) render();
    else if (existing) {
      existing.addEventListener("load", render, { once: true });
      existing.addEventListener("error", fail, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", render, { once: true });
      script.addEventListener("error", fail, { once: true });
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
      existing?.removeEventListener("load", render);
      existing?.removeEventListener("error", fail);
    };
  }, [siteKey]);

  return (
    <div className="adaptive-challenge">
      <p>One quick verification keeps anonymous queue traffic fair.</p>
      <div ref={target} />
      {failed && (
        <div role="alert">
          <p>Verification could not load. Check your connection and try again.</p>
          <button type="button" className="calm-secondary" onClick={() => window.location.reload()}>
            Retry verification
          </button>
        </div>
      )}
    </div>
  );
}
