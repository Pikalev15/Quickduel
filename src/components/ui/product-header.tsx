import Link from "next/link";
import { Wordmark } from "./wordmark";

export function ProductHeader({
  current,
  trailing,
}: {
  current?: "play" | "friends" | "history" | "leaderboard" | "profile";
  trailing?: React.ReactNode;
}) {
  const links = [
    ["play", "/play", "Play"],
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
            </Link>
          ))}
        </nav>
        {trailing && <div className="product-header-trailing">{trailing}</div>}
      </div>
    </header>
  );
}
