"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Wordmark } from "./wordmark";
import { RequestBell } from "@/components/notifications/request-bell";
import { ProfileControl } from "@/components/profile/profile-control";

const links = [
  ["home", "/", "Home"],
  ["friends", "/friends", "Friends"],
  ["history", "/history", "History"],
  ["leaderboard", "/leaderboard", "Leaderboard"],
  ["profile", "/profile/stats", "Profile"],
] as const;

export function ProductHeader({ current, trailing, profileSlot }: {
  current?: "home" | "play" | "friends" | "history" | "leaderboard" | "profile";
  trailing?: ReactNode;
  profileSlot?: ReactNode;
}) {
  const pathname = usePathname();
  const panelId = useId();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const header = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element) || target.closest(".profile-overlay,.qd-request-toast")) return;
      if (!header.current?.contains(target)) setOpenPath(null);
    }
    function keyboard(event: KeyboardEvent) {
      if (event.key !== "Escape" || document.querySelector(".profile-overlay")) return;
      setOpenPath(null);
      trigger.current?.focus();
    }
    const media = window.matchMedia("(max-width: 850px)");
    function resize() { if (!media.matches) setOpenPath(null); }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard);
    media.addEventListener("change", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keyboard);
      media.removeEventListener("change", resize);
    };
  }, [open]);

  const active = current ?? (pathname === "/" ? "home" : pathname.startsWith("/profile/") ? "profile" : pathname.startsWith("/history") ? "history" : undefined);
  return (
    <header ref={header} className="product-header" data-menu-open={open}>
      <div className="page-shell product-header-inner">
        <Wordmark />
        <button ref={trigger} className="qd-menu-trigger" type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls={panelId} onClick={() => setOpenPath(open ? null : pathname)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="m6 6 12 12M18 6 6 18"/> : <path d="M4 6h16M4 12h16M4 18h16"/>}
          </svg>
          <span className="qd-menu-pending" aria-hidden="true" />
        </button>
        <div id={panelId} className="qd-nav-content">
          <nav aria-label="Primary" className="product-nav">
            {links.map(([id, href, label]) => (
              <Link key={id} href={href} aria-current={active === id ? "page" : undefined} onClick={() => setOpenPath(null)}>
                {label}
                {active === id && <span className="product-nav-indicator" aria-hidden="true" />}
              </Link>
            ))}
          </nav>
          <div className="product-header-trailing qd-header-requests">
            {trailing}{profileSlot ?? <><Link className="qd-inner-settings" href="/profile/settings" onClick={() => setOpenPath(null)}>Settings</Link><ProfileControl /></>}
            <RequestBell onViewNotification={() => setOpenPath(pathname)} />
          </div>
        </div>
      </div>
    </header>
  );
}
