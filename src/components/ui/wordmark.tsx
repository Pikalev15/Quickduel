import Link from "next/link";
import { LogoMark } from "./logo-mark";

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className={`wordmark inline-flex items-center leading-none ${compact ? "gap-2 text-xl" : "gap-2.5 text-[clamp(1.25rem,2vw,1.55rem)]"}`}
      aria-label="QuickDuel home"
    >
      <LogoMark className={compact ? "h-7 w-7" : "h-8 w-8"} />
      <span>Quick</span>
      <span>Duel</span>
    </Link>
  );
}
