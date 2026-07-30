import Link from "next/link";

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className={`wordmark inline-flex leading-none ${compact ? "text-xl" : "text-[clamp(1.25rem,2vw,1.55rem)]"}`}
      aria-label="QuickDuel home"
    >
      <span>Quick</span>
      <span>Duel</span>
    </Link>
  );
}
