"use client";

import { usePathname } from "next/navigation";

export default function RouteTemplate({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const isFastRoute = pathname === "/play" || pathname.startsWith("/match/");
  const isHome = pathname === "/";
  const motion = isFastRoute ? "fast" : isHome ? "quiet" : "standard";

  return (
    <div
      className={`route-transition route-transition--${motion}`}
      data-route-transition={pathname}
    >
      {children}
    </div>
  );
}
