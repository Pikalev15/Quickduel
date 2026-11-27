import type { ReactNode } from "react";
import { ProductHeader } from "./product-header";
import { SignalIcon } from "./icons";

export function Header({ onlineCount, simple = false, profileSlot }: {
  onlineCount?: number | null;
  simple?: boolean;
  profileSlot?: ReactNode;
}) {
  return <ProductHeader current={simple ? undefined : "home"} profileSlot={profileSlot} trailing={!simple && onlineCount !== undefined ? <span className="site-online"><SignalIcon className="h-5 w-5 text-[var(--accent)]" />{onlineCount ?? "–"} ONLINE</span> : undefined} />;
}
