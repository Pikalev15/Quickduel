"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

export default function RouteTemplate({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const isFastRoute = pathname === "/play" || pathname.startsWith("/match/");
  const isHome = pathname === "/";
  const motion = isFastRoute ? "fast" : isHome ? "quiet" : "standard";

  return (
    <ViewTransition
      name="quickduel-route"
      default="none"
      enter={isFastRoute ? "none" : "route-view"}
      exit={isFastRoute ? "none" : "route-view"}
      share={isFastRoute ? "none" : "route-view"}
      update="none"
    >
      <div
        key={pathname}
        className={`route-transition route-transition--${motion}`}
        data-route-transition={pathname}
      >
        {children}
      </div>
    </ViewTransition>
  );
}
