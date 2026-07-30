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
    <header className="border-b border-[var(--border)]">
      <div className="page-shell flex h-[72px] items-center justify-between">
        <Wordmark />
        <nav className="flex items-center gap-5" aria-label="Primary">
          {!simple && onlineCount !== undefined && (
            <span className="hidden items-center gap-2 text-xs font-bold tracking-[0.12em] text-[var(--muted)] sm:flex">
              <SignalIcon className="h-5 w-5 text-[var(--accent)]" />
              {onlineCount ?? "—"} ONLINE
            </span>
          )}
          <Link
            href="/leaderboard"
            className="display flex min-h-11 items-center gap-2 text-sm tracking-[0.08em] text-[var(--accent)] transition hover:text-[var(--text)]"
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
