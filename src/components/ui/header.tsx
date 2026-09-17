import Link from "next/link";
import { SignalIcon, TrophyIcon } from "./icons";
import { Wordmark } from "./wordmark";
import type { ReactNode } from "react";

export function Header({
  onlineCount,
  simple = false,
  profileSlot,
}: {
  onlineCount?: number | null;
  simple?: boolean;
  profileSlot?: ReactNode;
}) {
  return (
    <header className="site-header">
      <div className="page-shell site-header-inner">
        <Wordmark />
        <nav className="site-header-nav" aria-label="Primary">
          {!simple && onlineCount !== undefined && (
            <span className="site-online">
              <SignalIcon className="h-5 w-5 text-[var(--accent)]" />
              {onlineCount ?? "—"} ONLINE
            </span>
          )}
          <Link
            href="/leaderboard"
            className="site-ranks-link"
          >
            <TrophyIcon className="h-5 w-5" />
            <span className="hidden sm:inline">View leaderboard</span>
            <span className="sm:hidden">Ranks</span>
          </Link>
          {profileSlot}
        </nav>
      </div>
    </header>
  );
}
