import Link from "next/link";

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className={`display inline-flex leading-none italic ${compact ? "text-2xl" : "text-[clamp(1.65rem,3vw,2.25rem)]"}`}
      aria-label="QuickDuel home"
    >
      <span>Quick</span>
      <span className="text-[var(--accent)]">Duel</span>
    </Link>
  );
}
