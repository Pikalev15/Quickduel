import Link from "next/link";
import { Wordmark } from "./wordmark";
import { RequestBell } from "@/components/notifications/request-bell";
import { ProfileControl } from "@/components/profile/profile-control";

export function ProductHeader({
  current,
  trailing,
  profileSlot,
}: {
  current?: "home" | "play" | "friends" | "history" | "leaderboard" | "profile";
  trailing?: React.ReactNode;
  profileSlot?: React.ReactNode;
}) {
  const links = [
    ["home", "/", "Home"],
    ["friends", "/friends", "Friends"],
    ["history", "/history", "History"],
    ["leaderboard", "/leaderboard", "Leaderboard"],
    ["profile", "/profile/stats", "Profile"],
  ] as const;
  return (
    <header className="product-header">
      <div className="page-shell product-header-inner">
        <Wordmark />
        <nav aria-label="Primary" className="product-nav">
          {links.map(([id, href, label]) => (
            <Link key={id} href={href} aria-current={current === id ? "page" : undefined}>
              {label}
              {current === id && <span className="product-nav-indicator" aria-hidden="true" />}
            </Link>
          ))}
        </nav>
        <div className="product-header-trailing qd-header-requests">{trailing}{profileSlot ?? <ProfileControl />}<RequestBell /></div>
      </div>
    </header>
  );
}
