import Link from "next/link";
import { LogoMark } from "./logo-mark";

export function Wordmark({ compact = false, current = false, onClick }: { compact?: boolean; current?: boolean; onClick?: () => void }) {
  return (
    <Link
      href="/"
      className={`wordmark inline-flex items-center leading-none ${compact ? "gap-2 text-xl" : "gap-2.5 text-[clamp(1.25rem,2vw,1.55rem)]"}`}
      aria-label="QuickDuel home"
      aria-current={current ? "page" : undefined}
      onClick={onClick}
    >
      <LogoMark className={compact ? "h-7 w-7" : "h-8 w-8"} />
      <span>QuickDuel</span>
    </Link>
  );
}
