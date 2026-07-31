"use client";

import { useEffect, useRef } from "react";

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

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    const render = () => {
      if (cancelled || !target.current || !window.turnstile) return;
      widgetId = window.turnstile.render(target.current, {
        sitekey: siteKey,
        callback: onToken,
        "error-callback": () => onToken(""),
        "expired-callback": () => onToken(""),
        theme: "dark",
      });
    };
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_URL}"]`,
    );
    if (window.turnstile) render();
    else if (existing) existing.addEventListener("load", render, { once: true });
    else {
      const script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", render, { once: true });
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
      existing?.removeEventListener("load", render);
    };
  }, [onToken, siteKey]);

  return (
    <div className="adaptive-challenge">
      <p>One quick verification keeps anonymous queue traffic fair.</p>
      <div ref={target} />
    </div>
  );
}
